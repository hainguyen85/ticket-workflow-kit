import { spawnSync } from 'node:child_process'
import {
  checkNode,
  loadConfig,
  setup,
  repoRoot,
  resolveIssue,
  publicTarget,
  WorkflowError,
} from './workflow/config.mjs'
import { verifyCheckout } from './workflow/target.mjs'
import { githubClient } from './workflow/github.mjs'
import { probe, syncTicket, ticketDirectory, readState, withLock } from './workflow/vault.mjs'
import { setupHooks, hookStatus } from './workflow/setup-hooks.mjs'
import { intakeStatus } from './workflow/stages.mjs'
import { nextAction } from './workflow/dispatch.mjs'

try {
  checkNode()
  const [command, argument, ...extra] = process.argv.slice(2).filter((arg) => arg !== '--')
  if (
    !['setup', 'check', 'target', 'sync', 'status'].includes(command) ||
    extra.length ||
    (command === 'setup' && argument)
  ) {
    throw new WorkflowError(
      'Dùng: node scripts/workflow.mjs setup | target [issue-id] | check [issue-id] | sync [issue-id] | status [issue-id]',
    )
  }
  let result
  if (command === 'setup') result = { ...(await setup()), hooks: await setupHooks(repoRoot) }
  else {
    const settings = await loadConfig()
    verifyCheckout(settings)
    const id = resolveIssue(settings, argument, {
      required: !['target', 'check'].includes(command),
    })
    if (command === 'target') {
      process.stdout.write(JSON.stringify(publicTarget(settings, id), null, 2) + '\n')
      process.exit(0)
    }
    // Never print settings: it contains credentials.
    const client = githubClient(settings)
    const account = await client.identity()
    if (command === 'check') {
      const ignored = spawnSync('git', ['check-ignore', '-q', '.agents/.env.workflow.local'], {
        cwd: repoRoot,
        stdio: 'ignore',
      })
      const tracked = spawnSync(
        'git',
        ['ls-files', '--error-unmatch', '.agents/.env.workflow.local'],
        {
          cwd: repoRoot,
          stdio: 'ignore',
        },
      )
      if (ignored.status !== 0 || tracked.status === 0)
        throw new WorkflowError(
          '.agents/.env.workflow.local phải được Git ignore và không được tracked.',
        )
      const selected = id === null ? null : await client.ticket(id)
      result = {
        account,
        target: publicTarget(settings, id),
        issue: selected?.number ?? null,
        documents: await probe(settings),
        hooks: hookStatus(repoRoot),
        gitHttpsPush: 'helper-packaged-live-push-not-tested',
        readiness: 'local-api-check-only',
      }
    } else {
      if (command === 'sync') result = await syncTicket(settings, account.login, id, client.ticket)
      else {
        const directory = await ticketDirectory(settings, account.login, id, false)
        const state = await withLock(directory, () =>
          readState(directory, {
            repository: settings.config.github.repository,
            login: account.login,
            issue: id,
          }),
        )
        if (!state) throw new WorkflowError('Chưa có state; chạy sync trước.')
        result = {
          directory,
          revision: state.revision,
          snapshot: state.snapshot,
          stages: state.stages,
          ...(await nextAction(settings, account.login, id)),
        }
      }
      result = {
        target: publicTarget(settings, id),
        ...result,
        ...(await intakeStatus(settings, account.login, id)),
      }
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  // Do not echo third-party error messages, paths, request options or raw API responses.
  process.stderr.write(
    `Workflow: ${error instanceof WorkflowError ? error.message : 'Thao tác thất bại; kiểm tra quyền truy cập file và cấu hình. Dữ liệu hiện có được giữ lại.'}\n`,
  )
  process.exitCode = 1
}
