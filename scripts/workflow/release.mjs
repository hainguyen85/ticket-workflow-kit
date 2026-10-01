import { fail } from './config.mjs'
import { git } from './git.mjs'
import { checkMetadata } from './policy.mjs'
import { checkFiles } from './git-hook.mjs'
import { releaseGate, stageArtifact, persistStage, context } from './stages.mjs'
import { withLock } from './vault.mjs'
import { transport } from './transport.mjs'

export function validatePR(pr, settings, branch, head) {
  if (
    pr.base?.repo?.full_name !== settings.config.github.repository ||
    pr.head?.repo?.full_name !== settings.config.github.repository ||
    pr.base?.ref !== settings.config.github.baseBranch ||
    pr.head?.ref !== branch ||
    pr.head?.sha !== head ||
    pr.draft ||
    pr.state !== 'open' ||
    pr.auto_merge
  )
    fail('PR chưa đúng repo/base/head hoặc chưa sẵn sàng chờ review.')
  checkMetadata(pr.title, pr.body ?? '')
  return { number: pr.number, url: pr.html_url }
}
export function validatePRText(input) {
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    typeof input.body !== 'string' ||
    !input.body.trim()
  )
    fail('Cần title và body PR.')
  checkMetadata(input.title, input.body)
  if (
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:https?:\/\/\S+\/issues\/\d+|(?:[\w.-]+\/[\w.-]+)?#\d+)/i.test(
      input.body,
    )
  )
    fail('PR dùng Refs #ID, không dùng từ khóa tự đóng Issue.')
}

export async function prepareRelease(settings, login, number, input, wire = transport(settings)) {
  validatePRText(input)
  const { directory } = await context(settings, login, number)
  return withLock(directory, async () => {
    const { state, code, finalized, review } = await releaseGate(settings, login, number)
    if (input.revision !== state.revision) fail('PR draft không đúng source revision.')
    wire.fetchBase()
    const base = git(settings.repoRoot, [
      'rev-parse',
      `refs/remotes/workshop/${settings.config.github.baseBranch}`,
    ])
    git(settings.repoRoot, ['merge-base', '--is-ancestor', base, code.head])
    const files = git(settings.repoRoot, ['diff', '--name-only', '-z', `${base}...${code.head}`])
      .split('\0')
      .filter(Boolean)
    if (!files.length || files.some((file) => !finalized.files.includes(file)))
      fail('Diff rỗng hoặc có file ngoài plan đã duyệt; cập nhật plan/review trước release.')
    const commits = git(settings.repoRoot, ['rev-list', `${base}..${code.head}`])
      .split('\n')
      .filter(Boolean)
    for (const commit of commits) {
      checkMetadata(
        git(settings.repoRoot, ['show', '-s', '--format=%B%n%an <%ae>%n%cn <%ce>', commit]),
      )
      checkFiles(settings.repoRoot, commit)
    }
    let releaseBranch = null
    if (input.releaseBranch !== undefined) {
      checkMetadata(input.releaseBranch)
      if (
        typeof input.releaseBranch !== 'string' ||
        !new RegExp(`^release/issue-${number}-[a-z0-9-]+$`).test(input.releaseBranch)
      )
        fail('Release branch phải là release/issue-<id>-<slug>.')
      const existing = git(settings.repoRoot, [
        'for-each-ref',
        '--format=%(objectname)',
        `refs/heads/${input.releaseBranch}`,
      ])
      if (existing && existing !== code.head)
        fail('Release branch đã tồn tại ở SHA khác; không di chuyển hoặc ghi đè.')
      if (!existing)
        git(settings.repoRoot, ['branch', '--no-track', input.releaseBranch, code.head])
      releaseBranch = { name: input.releaseBranch, head: code.head, published: false }
    }
    const plan = {
      action: 'release-prepare',
      change: { summary: 'Chuẩn bị PR', reason: 'Code và review đủ điều kiện prepare' },
      releaseBranch,
      sourceHash: state.sourceHash,
      revision: state.revision,
      code,
      base,
      baseBranch: settings.config.github.baseBranch,
      repository: settings.config.github.repository,
      title: input.title,
      body: input.body,
      files,
      commits,
      tests: review.tests,
      reviewHash: state.stages.review.hash,
      documents: {
        'release-plan.md': `# Release plan\n\n${code.branch} → ${settings.config.github.baseBranch}\n\nHEAD: ${code.head}\n\nBase: ${base}\n\n${input.title}\n\n${input.body}\n`,
      },
    }
    await persistStage(directory, state, 'release', plan, 'prepared', login)
    return { directory, readiness: 'prepared-not-published', ...plan }
  })
}

export async function publishRelease(settings, login, number, client, wire = transport(settings)) {
  const { directory } = await context(settings, login, number)
  return withLock(directory, async () => {
    const { state, code } = await releaseGate(settings, login, number)
    const plan = await stageArtifact(directory, state, 'release', [
      'prepared',
      'partial',
      'complete',
    ])
    if (
      plan.code.head !== code.head ||
      plan.code.branch !== code.branch ||
      state.history[plan.revision - 1]?.snapshot !== `sync/${plan.sourceHash}.json` ||
      state.history
        .slice(plan.revision)
        .some((entry) => entry.changes.some((change) => change !== 'project-changed')) ||
      plan.reviewHash !== state.stages.review.hash
    )
      fail('Release plan đã cũ; prepare lại trước publish.')
    validatePRText(plan)
    if (wire.remoteHead(settings.config.github.baseBranch) !== plan.base)
      fail('Base remote đã đổi; đồng bộ và review lại trước publish.')
    const remote = wire.remoteHead(code.branch)
    if (remote && remote !== code.head)
      git(settings.repoRoot, ['merge-base', '--is-ancestor', remote, code.head])
    if (remote !== code.head) wire.push(code.branch)
    if (wire.remoteHead(code.branch) !== code.head)
      fail('Chưa xác minh được HEAD trên remote; kiểm tra trước khi thử lại.')
    let record = {
      ...plan,
      action: 'release-push',
      change: { summary: 'Ghi nhận push', reason: 'Đã xác minh remote HEAD' },
      pushedHead: code.head,
      pr: null,
    }
    await persistStage(directory, state, 'release', record, 'partial', login)
    // No automatic mutation retry: next invocation checks the branch and existing PR first.
    const pr =
      (await client.findPR(code.branch)) ??
      (await client.createPR(code.branch, plan.title, plan.body))
    const verified = validatePR(pr, settings, code.branch, code.head)
    record = {
      ...record,
      action: 'release-pr-created',
      change: { summary: 'Ghi nhận PR', reason: 'Đã xác minh PR đúng target' },
      pr: verified,
    }
    await persistStage(directory, state, 'release', record, 'partial', login)
    const projectItem = await client.attachPR(pr)
    record = {
      ...record,
      action: 'release-pr-ready',
      change: { summary: 'PR ready', reason: 'Đã hoàn tất liên kết project' },
      projectItem,
      pr: verified,
    }
    await persistStage(directory, state, 'release', record, 'complete', login)
    return {
      readiness: 'pr-ready-awaiting-leader',
      ...verified,
      projectItem,
      head: code.head,
      merged: false,
    }
  })
}
