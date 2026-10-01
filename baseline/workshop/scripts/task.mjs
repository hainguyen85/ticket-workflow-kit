import { readFile, lstat } from 'node:fs/promises'
import {
  checkNode,
  loadConfig,
  resolveIssue,
  publicTarget,
  WorkflowError,
  fail,
} from './workflow/config.mjs'
import { verifyCheckout } from './workflow/target.mjs'
import { githubClient } from './workflow/github.mjs'
import { syncTicket } from './workflow/vault.mjs'
import { recordStage, context, requireApproval } from './workflow/stages.mjs'
import { prepareRelease, publishRelease } from './workflow/release.mjs'
import { transport } from './workflow/transport.mjs'
import { git, codeRevision } from './workflow/git.mjs'
import { checkBranch } from './workflow/policy.mjs'
import { runCheck } from './workflow/verification.mjs'
import { nextAction } from './workflow/dispatch.mjs'

try {
  checkNode()
  const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== '--')
  const arities = {
    next: 0,
    check: 1,
    record: 2,
    'can-implement': 0,
    start: 1,
    prepare: 1,
    publish: 0,
    board: 1,
  }
  if (!Object.hasOwn(arities, command))
    fail(
      'Dùng: task.mjs record|next|check|can-implement|start|prepare|publish|board [issue-id] [arguments]',
    )
  const rawId = /^\d+$/.test(args[0] ?? '') ? args.shift() : undefined
  if (args.length !== arities[command]) fail('Số arguments không đúng cho lệnh task.')
  const [actionOrFile, file] = args
  const settings = await loadConfig()
  verifyCheckout(settings)
  const id = resolveIssue(settings, rawId)
  const client = githubClient(settings),
    account = await client.identity()
  await syncTicket(settings, account.login, id, client.ticket)
  let result
  if (command === 'next') result = await nextAction(settings, account.login, id)
  else if (command === 'check') result = await runCheck(settings, account.login, id, actionOrFile)
  else if (command === 'can-implement' || command === 'start') {
    const { directory, state } = await context(settings, account.login, id)
    await requireApproval(directory, state)
    result = {
      ready: true,
      directory,
      revision: state.revision,
      finalized: state.stages.finalize.artifact,
    }
    if (command === 'start') {
      const branch = `feature/${account.login}/issue-${id}-${actionOrFile ?? 'work'}`
      checkBranch(branch, account.login, id)
      const current = codeRevision(settings.repoRoot)
      if (current.branch !== branch) {
        if (current.branch !== settings.config.github.baseBranch)
          fail('Đang ở branch khác; chọn lại workspace/branch trước khi start ticket.')
        transport(settings).fetchBase()
        git(settings.repoRoot, [
          'switch',
          '--no-track',
          '-c',
          branch,
          `refs/remotes/workshop/${settings.config.github.baseBranch}`,
        ])
      }
      result = { ...result, branch, head: git(settings.repoRoot, ['rev-parse', 'HEAD']) }
    }
  } else if (command === 'publish')
    result = await publishRelease(settings, account.login, id, client)
  else if (command === 'board') {
    const snapshot = await client.ticket(id)
    result = await client.setStatus(snapshot.nodeId, actionOrFile)
  } else {
    const inputPath = command === 'record' ? file : actionOrFile
    if (!inputPath || /(?:^|[/\\])\.env|credential|\.ssh/i.test(inputPath))
      fail('Không dùng credential file làm artifact input.')
    const stat = await lstat(inputPath)
    if (!stat.isFile() || stat.size > 1_000_000)
      fail('Artifact input phải là JSON file thường dưới 1 MB.')
    const input = JSON.parse(await readFile(inputPath, 'utf8'))
    result =
      command === 'record'
        ? await recordStage(settings, account.login, id, actionOrFile, input)
        : await prepareRelease(settings, account.login, id, input)
  }
  if (command === 'check' && result.result !== 'pass') process.exitCode = 1
  process.stdout.write(
    JSON.stringify({ target: publicTarget(settings, id), ...result }, null, 2) + '\n',
  )
} catch (error) {
  process.stderr.write(
    `Task: ${error instanceof WorkflowError ? error.message : 'Thao tác thất bại; kiểm tra input/quyền. Xem state để xác định phần đã hoàn tất trước khi chạy lại.'}\n`,
  )
  process.exitCode = 1
}
