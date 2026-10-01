import { readFile, lstat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import {
  checkNode,
  loadConfig,
  setup,
  repoRoot,
  publicTarget,
  WorkflowError,
  fail,
  LOCAL_FILE,
  CLI,
} from './lib/config.mjs'
import {
  probe,
  createTicket,
  syncTicket,
  resolveTicket,
  listTickets,
  ticketRoot,
} from './lib/vault.mjs'
import { readSources } from './lib/source.mjs'
import { setupHooks, hookStatus } from './lib/setup-hooks.mjs'
import { recordStage, context, requireApproval, intakeStatus } from './lib/stages.mjs'
import { prepareHandoff, completeHandoff, fetchBase } from './lib/handoff.mjs'
import { git, tryGit, codeRevision, identity } from './lib/git.mjs'
import { checkBranch, ticketBranch } from './lib/policy.mjs'
import { runCheck } from './lib/verification.mjs'
import { nextAction } from './lib/dispatch.mjs'

const usage = `Dùng: ${CLI} <lệnh>
  setup | doctor | list
  sync --title <tiêu đề> --slug <slug> [--key <key>] [--file <path>]... [--chat <path>]
  sync <ticket> [--file <path>]... [--chat <path>]
  status <ticket> | next <ticket>
  record <ticket> <stage> <input.json>
  can-implement <ticket> | start <ticket> | check <ticket> <check-id>
  prepare <ticket> <mr.json> | handoff <ticket> [mr-url]`

function parseSync(args) {
  const options = { files: [], chat: null, positional: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      options.positional.push(arg)
      continue
    }
    const value = args[++i]
    if (value === undefined || !['--title', '--slug', '--key', '--file', '--chat'].includes(arg))
      fail(usage)
    if (arg === '--file') options.files.push(value)
    else {
      const name = arg.slice(2)
      if (options[name] !== undefined && options[name] !== null) fail(`Trùng tham số ${arg}.`)
      options[name] = value
    }
  }
  if (options.positional.length > 1) fail(usage)
  return options
}

async function jsonInput(file) {
  if (!file || /(?:^|[/\\])\.env|credential|\.ssh/i.test(file))
    fail('Không dùng credential file làm artifact input.')
  let stat
  try {
    stat = await lstat(file)
  } catch {
    fail('Không đọc được file input.')
  }
  if (!stat.isFile() || stat.size > 1_000_000)
    fail('Artifact input phải là JSON file thường dưới 1 MB.')
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''))
  } catch {
    fail('Artifact input không phải JSON hợp lệ.')
  }
}

// The documents repo is shared through Git by people, so only report what is left to commit.
function docsRepoStatus(settings, directory = null) {
  if (!tryGit(settings.docsRepo, ['rev-parse', '--show-toplevel']).ok)
    return { git: false, note: 'docsRepo chưa phải Git repo; hồ sơ chưa chia sẻ được cho team.' }
  const scope = directory ? ['--', ticketRoot(directory)] : []
  const dirty = tryGit(settings.docsRepo, [
    'status',
    '--porcelain',
    '--untracked-files=all',
    ...scope,
  ])
  const uncommitted = Boolean(dirty.stdout)
  return {
    git: true,
    uncommitted,
    ...(uncommitted ? { note: 'Commit và push repo hồ sơ để chia sẻ thay đổi với team.' } : {}),
  }
}

const ignored = (file) =>
  spawnSync('git', ['check-ignore', '-q', file], { cwd: repoRoot, stdio: 'ignore' }).status === 0

try {
  checkNode()
  const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== '--')
  const arities = {
    setup: [0, 0],
    doctor: [0, 0],
    list: [0, 0],
    status: [1, 1],
    next: [1, 1],
    record: [3, 3],
    'can-implement': [1, 1],
    start: [1, 1],
    check: [2, 2],
    prepare: [2, 2],
    handoff: [1, 2],
  }
  if (command !== 'sync') {
    if (!Object.hasOwn(arities, command ?? '')) fail(usage)
    const [least, most] = arities[command]
    if (args.length < least || args.length > most || args.some((arg) => arg.startsWith('--')))
      fail(usage)
  }
  let result
  if (command === 'setup') result = { ...(await setup()), hooks: await setupHooks(repoRoot) }
  else {
    if (!tryGit(repoRoot, ['rev-parse', '--show-toplevel']).ok)
      fail('Bộ workflow phải nằm trong một Git repo source.')
    const settings = await loadConfig()
    settings.author = identity(settings.repoRoot)
    const { remote, baseBranch } = settings.config.git
    if (command === 'doctor') {
      const tracked = tryGit(repoRoot, ['ls-files', '--error-unmatch', LOCAL_FILE]).ok
      if (!ignored(LOCAL_FILE) || tracked)
        fail(`${LOCAL_FILE} phải được Git ignore và không được tracked.`)
      if (!ignored('.workflow-tmp/input.json'))
        fail('Thêm .workflow-tmp/ vào .gitignore: input tạm không được làm bẩn worktree.')
      result = {
        node: process.versions.node,
        author: settings.author,
        target: publicTarget(settings),
        documents: await probe(settings),
        docsRepo: docsRepoStatus(settings),
        tickets: (await listTickets(settings)).length,
        hooks: hookStatus(repoRoot),
        baseRef: tryGit(repoRoot, [
          'rev-parse',
          '--verify',
          '--quiet',
          `refs/remotes/${remote}/${baseBranch}`,
        ]).ok
          ? 'present'
          : 'missing-fetch-base-first',
      }
    } else if (command === 'list') {
      const tickets = []
      for (const ticket of await listTickets(settings)) {
        try {
          const { state } = await context(settings, ticket)
          tickets.push({ ticket, title: state.title, revision: state.revision, stages: state.stages })
        } catch (error) {
          if (!(error instanceof WorkflowError)) throw error
          tickets.push({ ticket, error: error.message })
        }
      }
      result = {
        target: publicTarget(settings),
        tickets: tickets.map(({ stages, ...rest }) => ({
          ...rest,
          ...(stages
            ? {
                stages: Object.fromEntries(
                  Object.entries(stages).map(([name, record]) => [name, record.status]),
                ),
              }
            : {}),
        })),
      }
    } else if (command === 'sync') {
      const options = parseSync(args)
      const sources = await readSources(options)
      let synced
      if (options.positional.length) {
        if (options.title || options.slug || options.key)
          fail('Ticket đã có: không đổi title/slug/key khi sync thêm nguồn.')
        const ticket = await resolveTicket(settings, options.positional[0])
        synced = await syncTicket(settings, ticket, sources)
      } else {
        if (!options.title || !options.slug) fail('Ticket mới cần --title và --slug.')
        synced = await createTicket(
          settings,
          { key: options.key ?? undefined, slug: options.slug, title: options.title },
          sources,
        )
      }
      result = {
        target: publicTarget(settings, synced.ticket),
        ...synced,
        ...(await intakeStatus(settings, synced.ticket)),
        docsRepo: docsRepoStatus(settings, synced.directory),
      }
    } else {
      const ticket = await resolveTicket(settings, args.shift())
      const target = publicTarget(settings, ticket)
      if (command === 'status' || command === 'next') {
        const { state } = await context(settings, ticket)
        const next = await nextAction(settings, ticket)
        result = {
          target,
          title: state.title,
          snapshot: state.snapshot,
          ...next,
          ...(await intakeStatus(settings, ticket)),
          docsRepo: docsRepoStatus(settings, next.directory),
        }
      } else if (command === 'check') {
        result = { target, ...(await runCheck(settings, ticket, args[0])) }
        if (result.result !== 'pass') process.exitCode = 1
      } else if (command === 'can-implement' || command === 'start') {
        const { directory, state } = await context(settings, ticket)
        await requireApproval(directory, state)
        result = {
          target,
          ready: true,
          directory,
          revision: state.revision,
          finalized: state.stages.finalize.artifact,
        }
        if (command === 'start') {
          const branch = ticketBranch(ticket)
          checkBranch(branch, ticket)
          const current = codeRevision(settings.repoRoot)
          let fetched = null
          if (current.branch !== branch) {
            if (current.branch !== baseBranch)
              fail('Đang ở branch khác; chọn lại workspace/branch trước khi start ticket.')
            if (
              tryGit(settings.repoRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
                .ok
            )
              git(settings.repoRoot, ['switch', branch])
            else {
              const base = fetchBase(settings)
              fetched = base.fetched
              git(settings.repoRoot, ['switch', '--no-track', '-c', branch, base.ref])
            }
          }
          result = {
            ...result,
            branch,
            head: git(settings.repoRoot, ['rev-parse', 'HEAD']),
            ...(fetched === false
              ? { note: 'Không fetch được remote; branch tạo từ base ref local đang có.' }
              : {}),
          }
        }
      } else if (command === 'record') {
        result = { target, ...(await recordStage(settings, ticket, args[0], await jsonInput(args[1]))) }
      } else if (command === 'prepare') {
        result = { target, ...(await prepareHandoff(settings, ticket, await jsonInput(args[0]))) }
      } else if (command === 'handoff') {
        result = { target, ...(await completeHandoff(settings, ticket, args[0])) }
      }
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  // Do not echo third-party error messages, paths or raw command output.
  process.stderr.write(
    `Task: ${error instanceof WorkflowError ? error.message : 'Thao tác thất bại; kiểm tra input/quyền. Xem state để xác định phần đã hoàn tất trước khi chạy lại.'}\n`,
  )
  process.exitCode = 1
}
