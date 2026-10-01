import { fail } from './config.mjs'
import { git, tryGit, quietEnv } from './git.mjs'
import { checkMetadata, hasSecret } from './policy.mjs'
import { checkFiles } from './git-hook.mjs'
import { handoffGate, stageArtifact, persistStage, context } from './stages.mjs'
import { withLock } from './vault.mjs'

export function validateMRText(input, key) {
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    typeof input.body !== 'string' ||
    !input.body.trim()
  )
    fail('Cần title và body MR.')
  checkMetadata(input.title, input.body)
  if (
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:https?:\/\/\S+\/issues\/\d+|(?:[\w.-]+\/[\w.-]+)?#\d+)/i.test(
      input.body,
    )
  )
    fail('MR dùng Refs <ticket>, không dùng từ khóa tự đóng issue.')
  if (key && !input.body.includes(key))
    fail('Body MR phải tham chiếu ticket key (Refs <key>) để truy lại hồ sơ.')
}

// The developer's own Git credentials are used; an offline remote is reported, not hidden.
export function fetchBase(settings) {
  const { remote, baseBranch } = settings.config.git
  const fetched = tryGit(settings.repoRoot, ['fetch', '--no-tags', remote, baseBranch], {
    env: quietEnv(),
  }).ok
  const ref = `refs/remotes/${remote}/${baseBranch}`
  const base = tryGit(settings.repoRoot, ['rev-parse', '--verify', '--quiet', ref])
  if (!base.ok || !base.stdout)
    fail(`Chưa có ${ref}; fetch base branch từ remote rồi thử lại.`)
  return { base: base.stdout, ref, fetched }
}

export async function prepareHandoff(settings, ticket, input) {
  const { directory } = await context(settings, ticket)
  return withLock(directory, async () => {
    const { state, code, finalized, review } = await handoffGate(settings, ticket)
    validateMRText(input, state.key)
    if (input.revision !== state.revision) fail('MR draft không đúng source revision.')
    const { remote, baseBranch } = settings.config.git
    const { base, fetched } = fetchBase(settings)
    git(settings.repoRoot, ['merge-base', '--is-ancestor', base, code.head])
    const files = git(settings.repoRoot, ['diff', '--name-only', '-z', `${base}...${code.head}`])
      .split('\0')
      .filter(Boolean)
    if (!files.length || files.some((file) => !finalized.files.includes(file)))
      fail('Diff rỗng hoặc có file ngoài plan đã duyệt; cập nhật plan/review trước handoff.')
    const commits = git(settings.repoRoot, ['rev-list', `${base}..${code.head}`])
      .split('\n')
      .filter(Boolean)
    for (const commit of commits) {
      checkMetadata(
        git(settings.repoRoot, ['show', '-s', '--format=%B%n%an <%ae>%n%cn <%ce>', commit]),
      )
      checkFiles(settings.repoRoot, commit)
    }
    const pushCommand = `git push -u ${remote} ${code.branch}`
    const plan = {
      action: 'handoff-prepare',
      change: { summary: 'Chuẩn bị bàn giao', reason: 'Code và review đủ điều kiện prepare' },
      sourceHash: state.sourceHash,
      revision: state.revision,
      code,
      base,
      baseFetched: fetched,
      baseBranch,
      remote,
      title: input.title,
      body: input.body,
      files,
      commits,
      tests: review.tests,
      reviewHash: state.stages.review.hash,
      pushedHead: null,
      mr: null,
      documents: {
        'handoff.md':
          `# Bàn giao ${state.ticket}\n\n${code.branch} → ${baseBranch}\n\nHEAD: ${code.head}\n\nBase: ${base}\n\n` +
          `Developer tự chạy: \`${pushCommand}\`, rồi tạo MR vào \`${baseBranch}\` với nội dung dưới đây.\n\n` +
          `## ${input.title}\n\n${input.body}\n`,
      },
    }
    await persistStage(directory, state, 'handoff', plan, 'prepared', settings.author ?? null)
    return {
      directory,
      readiness: 'prepared-awaiting-developer-push',
      branch: code.branch,
      head: code.head,
      base,
      baseFetched: fetched,
      baseBranch,
      pushCommand,
      title: input.title,
      body: input.body,
      files,
    }
  })
}

function mergeRequestUrl(value) {
  if (value === undefined || value === null) return null
  let url
  try {
    url = new URL(value)
  } catch {
    fail('URL MR không hợp lệ.')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    /\s/.test(value) ||
    hasSecret(value)
  )
    fail('URL MR phải là http(s) và không chứa credentials.')
  return value
}

// Recorded after the developer pushed (and optionally opened the MR) by hand.
export async function completeHandoff(settings, ticket, mergeRequest) {
  const url = mergeRequestUrl(mergeRequest)
  const { directory } = await context(settings, ticket)
  return withLock(directory, async () => {
    const { state, code } = await handoffGate(settings, ticket)
    const plan = await stageArtifact(directory, state, 'handoff', ['prepared', 'complete'])
    if (
      plan.code.head !== code.head ||
      plan.code.branch !== code.branch ||
      plan.revision !== state.revision ||
      plan.sourceHash !== state.sourceHash ||
      plan.reviewHash !== state.stages.review.hash
    )
      fail('Bản prepare đã cũ; prepare lại trước khi ghi nhận bàn giao.')
    const { remote } = settings.config.git
    const probe = tryGit(
      settings.repoRoot,
      ['ls-remote', '--heads', remote, `refs/heads/${code.branch}`],
      { env: quietEnv() },
    )
    if (!probe.ok)
      fail('Không xác minh được remote; kiểm tra kết nối/credential Git rồi chạy lại handoff.')
    if (probe.stdout.split(/\s+/)[0] !== code.head)
      fail(
        'Branch trên remote chưa trùng HEAD đã review; developer push branch rồi chạy lại handoff.',
      )
    const record = {
      ...plan,
      action: 'handoff-complete',
      change: {
        summary: url ? 'Ghi nhận push và MR' : 'Ghi nhận push',
        reason: 'Đã xác minh remote HEAD trùng code đã review',
      },
      pushedHead: code.head,
      mr: url ? { url } : (plan.mr ?? null),
    }
    delete record.metadata
    await persistStage(directory, state, 'handoff', record, 'complete', settings.author ?? null)
    return {
      readiness: 'handed-off-awaiting-leader',
      branch: code.branch,
      head: code.head,
      mr: record.mr,
      merged: false,
    }
  })
}
