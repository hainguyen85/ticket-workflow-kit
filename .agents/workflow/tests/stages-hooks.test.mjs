import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, rm, cp, symlink } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { env as environment } from 'node:process'
import { syncTicket, createTicket } from '../lib/vault.mjs'
import { chatSource } from '../lib/source.mjs'
import {
  recordStage,
  intakeStatus,
  context,
  requireApproval,
  handoffGate,
} from '../lib/stages.mjs'
import { prepareHandoff, completeHandoff, validateMRText } from '../lib/handoff.mjs'
import { git } from '../lib/git.mjs'
import { runCheck } from '../lib/verification.mjs'
import { nextAction } from '../lib/dispatch.mjs'
import { hasSecret, inspectHook, checkMetadata, checkBranch } from '../lib/policy.mjs'
import { setupHooks } from '../lib/setup-hooks.mjs'
import { linkSkills, skillLinkStatus } from '../lib/skill-links.mjs'
import { ticketFixture, installHooks, kitRoot, change, config } from './helpers.mjs'

const token = 'ghp_' + 'z'.repeat(36)
const input = (action, revision = 1) => ({
  revision,
  change,
  documents: Object.fromEntries(
    {
      analysis: ['task.md'],
      finalize: ['plan.md'],
      approve: ['approval.md'],
      implement: ['checks.md'],
      review: ['checks.md'],
    }[action].map((name) => [name, `# ${name}\n\nDocumented decision and checks.\n`]),
  ),
  ...(action === 'analysis'
    ? {
        observations: [
          {
            id: 'baseline',
            status: 'observed',
            description: 'Local fixture file',
            evidence: 'feature.txt read',
          },
        ],
      }
    : {}),
  ...(action === 'finalize'
    ? {
        decision: { optionId: 'projection', rationale: 'Keep public projection' },
        files: ['feature.txt'],
        requiredFacts: ['baseline'],
        delivery: {
          kind: 'artifact',
          target: 'feature.txt',
          preparation: 'Edit file',
          permissions: 'Local file edit',
          recovery: 'Git restore',
          checks: ['CHECK'],
        },
        requiredChecks: [
          {
            id: 'CHECK',
            target: 'feature.txt',
            kind: 'unit',
            ac: ['AC1'],
            command: ['node', '-e', 'process.exitCode = 0'],
          },
        ],
        steps: [{ id: 'change', goal: 'Update fixture', dependsOn: [], checks: ['CHECK'] }],
        risks: [
          {
            severity: 'high',
            resolution: 'mitigated',
            mitigation: 'Published-only data + anonymous tests',
          },
        ],
      }
    : {}),
  ...(action === 'approve'
    ? { decision: 'approved', approvedBy: 'developer', evidence: 'Synthetic test approval' }
    : {}),
  ...(['implement', 'review'].includes(action)
    ? {
        tests: [
          {
            command: 'node --test',
            result: 'pass',
            evidence: 'Synthetic test fixture, not a real feature test claim.',
          },
        ],
      }
    : {}),
  ...(action === 'review' ? { verdict: 'pass', findings: [] } : {}),
})

async function fixture(t) {
  const { settings, ticket } = await ticketFixture(t)
  await writeFile(path.join(settings.repoRoot, 'feature.txt'), 'improved search\n')
  git(settings.repoRoot, ['add', 'feature.txt'])
  git(settings.repoRoot, ['commit', '-m', 'feat: improve search'])
  return { settings, ticket, branch: `feature/${ticket}` }
}
async function throughReview(settings, ticket) {
  for (const action of ['analysis', 'finalize', 'approve', 'implement', 'review']) {
    if (action === 'implement') await runCheck(settings, ticket, 'CHECK')
    await recordStage(settings, ticket, action, input(action))
  }
}
const mrInput = {
  revision: 1,
  title: 'feat(search): improve results',
  body: 'Improve matching. Verified in tests. Refs T-1.',
}

test('stage gates require selected spec and approval; artifacts cannot be silently edited', async (t) => {
  const { settings, ticket } = await fixture(t)
  await assert.rejects(recordStage(settings, ticket, 'finalize', input('finalize')), /analysis/)
  await recordStage(settings, ticket, 'analysis', input('analysis'))
  await recordStage(settings, ticket, 'finalize', input('finalize'))
  await assert.rejects(recordStage(settings, ticket, 'implement', input('implement')), /approval/)
  await recordStage(settings, ticket, 'approve', input('approve'))
  const { directory, state } = await context(settings, ticket)
  assert.equal(state.approval.recordedBy, settings.author)
  await requireApproval(directory, state)
  const spec = path.join(directory, path.dirname(state.stages.finalize.artifact), 'plan.md')
  await writeFile(spec, 'changed after approval')
  await assert.rejects(requireApproval(directory, state), /Tài liệu đã đổi/)
})
test('security risk and secret-bearing artifact are rejected before persisting', async (t) => {
  const { settings, ticket } = await fixture(t)
  await recordStage(settings, ticket, 'analysis', input('analysis'))
  const unsafe = input('finalize')
  unsafe.risks[0].resolution = 'accepted'
  await assert.rejects(recordStage(settings, ticket, 'finalize', unsafe), /risk/)
  const secret = input('analysis')
  secret.documents['task.md'] = token
  await assert.rejects(recordStage(settings, ticket, 'analysis', secret), /secret/)
})
test('checkpoint records unfinished work without marking implement complete', async (t) => {
  const { settings, ticket } = await fixture(t)
  for (const action of ['analysis', 'finalize', 'approve'])
    await recordStage(settings, ticket, action, input(action))
  await writeFile(path.join(settings.repoRoot, 'feature.txt'), 'work in progress\n')
  const result = await recordStage(settings, ticket, 'checkpoint', {
    change,
    revision: 1,
    documents: { 'checks.md': 'First slice done; tests not run yet.' },
  })
  assert.equal(result.status, 'in-progress')
  assert.equal(result.code.worktree, 'dirty')
  const { directory, state } = await context(settings, ticket)
  assert.equal(state.workflowEvents.at(-1).action, 'checkpoint')
  assert.match(await readFile(path.join(directory, 'changelog.md'), 'utf8'), /checkpoint/)
})
test('a change request invalidates approval; an unchanged sync preserves decisions', async (t) => {
  const { settings, ticket } = await fixture(t)
  await throughReview(settings, ticket)
  assert.equal((await syncTicket(settings, ticket)).changed, false)
  let { directory, state } = await context(settings, ticket)
  await requireApproval(directory, state)
  assert.equal((await handoffGate(settings, ticket)).state.revision, 1)
  await syncTicket(settings, ticket, [chatSource('Include descendants')])
  ;({ directory, state } = await context(settings, ticket))
  await assert.rejects(requireApproval(directory, state), /finalize/)
  await assert.rejects(recordStage(settings, ticket, 'analysis', input('analysis', 1)), /revision/)
  assert.equal((await nextAction(settings, ticket)).next, 'sync')
})
test('review and handoff refuse dirty or changed code; failed tests cannot become review pass', async (t) => {
  const { settings, ticket } = await fixture(t)
  await throughReview(settings, ticket)
  const invalidReview = input('review')
  invalidReview.tests[0].result = 'not-run'
  await assert.rejects(recordStage(settings, ticket, 'review', invalidReview), /Review chưa pass/)
  await writeFile(path.join(settings.repoRoot, 'feature.txt'), 'new code\n')
  await assert.rejects(handoffGate(settings, ticket), /Working tree|evidence đã cũ/)
  git(settings.repoRoot, ['add', 'feature.txt'])
  git(settings.repoRoot, ['commit', '-m', 'fix: adjust matching'])
  await assert.rejects(handoffGate(settings, ticket), /Review không khớp|evidence đã cũ/)
})
test('work on another ticket branch cannot be recorded for this ticket', async (t) => {
  const { settings, ticket } = await fixture(t)
  for (const action of ['analysis', 'finalize', 'approve'])
    await recordStage(settings, ticket, action, input(action))
  git(settings.repoRoot, ['switch', '-c', 'feature/T-2-other-ticket'])
  await runCheck(settings, ticket, 'CHECK')
  await assert.rejects(recordStage(settings, ticket, 'implement', input('implement')), /Branch/)
  assert.throws(() => checkBranch(`feature/${ticket}-extra`, ticket), /Branch/)
  checkBranch(`feature/${ticket}`, ticket)
})

test('prepare blocks out-of-plan files and a base the branch does not contain', async (t) => {
  const { settings, ticket } = await fixture(t)
  await writeFile(path.join(settings.repoRoot, 'extra.txt'), 'unplanned\n')
  git(settings.repoRoot, ['add', 'extra.txt'])
  git(settings.repoRoot, ['commit', '-m', 'feat: extra change'])
  await throughReview(settings, ticket)
  await assert.rejects(prepareHandoff(settings, ticket, mrInput), /ngoài plan/)
  // Someone else lands a commit on the remote base after this branch was cut.
  const tree = git(settings.repoRoot, ['rev-parse', `${settings.base}^{tree}`])
  const other = git(settings.repoRoot, [
    'commit-tree',
    tree,
    '-p',
    settings.base,
    '-m',
    'chore: unrelated base change',
  ])
  git(settings.repoRoot, ['push', 'origin', `${other}:refs/heads/main`])
  await assert.rejects(prepareHandoff(settings, ticket, mrInput), /Base branch/)
})
test('handoff is prepared by the helper, pushed by the developer, then verified on the remote', async (t) => {
  const { settings, ticket, branch } = await fixture(t)
  await throughReview(settings, ticket)
  assert.equal((await nextAction(settings, ticket)).next, 'handoff')
  await assert.rejects(completeHandoff(settings, ticket), /chưa hoàn tất/)
  await assert.rejects(
    prepareHandoff(settings, ticket, { ...mrInput, revision: 2 }),
    /source revision/,
  )
  const prepared = await prepareHandoff(settings, ticket, mrInput)
  assert.equal(prepared.readiness, 'prepared-awaiting-developer-push')
  assert.equal(prepared.branch, branch)
  assert.equal(prepared.pushCommand, `git push -u origin ${branch}`)
  assert.equal(prepared.baseFetched, true)
  assert.deepEqual(prepared.files, ['feature.txt'])
  // Preparing never pushes.
  assert.equal(git(settings.remote, ['for-each-ref', 'refs/heads/feature']), '')
  let next = await nextAction(settings, ticket)
  assert.equal(next.next, 'handoff')
  assert.match(next.reason, /Developer push/)
  await assert.rejects(completeHandoff(settings, ticket), /chưa trùng HEAD/)
  git(settings.repoRoot, ['push', 'origin', branch])
  for (const url of ['not a url', 'ftp://git.example/mr/2', 'https://user:pw@git.example/mr/2'])
    await assert.rejects(completeHandoff(settings, ticket, url), /URL MR/)
  const pushed = await completeHandoff(settings, ticket)
  assert.equal(pushed.readiness, 'handed-off-awaiting-leader')
  assert.equal(pushed.mr, null)
  const done = await completeHandoff(settings, ticket, 'https://git.example/team/app/-/merge_requests/2')
  assert.equal(done.merged, false)
  assert.equal(done.mr.url, 'https://git.example/team/app/-/merge_requests/2')
  // A later call without the URL keeps the recorded one.
  assert.equal((await completeHandoff(settings, ticket)).mr.url, done.mr.url)
  const { directory, state } = await context(settings, ticket)
  assert.equal(state.stages.handoff.status, 'complete')
  next = await nextAction(settings, ticket)
  assert.equal(next.next, 'handed-off')
  const checks = await readFile(path.join(path.dirname(directory), 'CHECKS.md'), 'utf8')
  assert.match(checks, /merge_requests\/2/)
  assert.match(checks, /đã xác minh trên remote/)
})
test('a change before handoff is a revision; after handoff it is a linked change-request ticket', async (t) => {
  const { settings, ticket, branch } = await fixture(t)
  await throughReview(settings, ticket)
  const change = () => [chatSource('Also search in descendants.')]
  const followUp = { slug: 'search-descendants', title: 'Search descendants' }
  // Still in progress: a CR ticket would bypass the revalidation of this ticket.
  await assert.rejects(
    createTicket(settings, { ...followUp, type: 'cr', relatesTo: ticket }, change()),
    /chưa bàn giao/,
  )
  await assert.rejects(
    createTicket(settings, { ...followUp, type: 'cr', relatesTo: 'T-404' }, change()),
    /Không tìm thấy/,
  )
  await prepareHandoff(settings, ticket, mrInput)
  git(settings.repoRoot, ['push', 'origin', branch])
  await completeHandoff(settings, ticket)
  // Handed off: the delivered ticket stays as it is; the change is its own ticket.
  await assert.rejects(syncTicket(settings, ticket, change()), /Ticket đã bàn giao/)
  assert.equal((await syncTicket(settings, ticket)).changed, false)
  const created = await createTicket(
    settings,
    { ...followUp, type: 'cr', relatesTo: 'T-1' },
    change(),
  )
  assert.match(created.ticket, /^CR-\d{6}-\d{4}-search-descendants$/)
  assert.equal(created.type, 'cr')
  assert.equal(created.relatesTo, ticket)
  const { directory, state } = await context(settings, created.ticket)
  assert.equal(state.relatesTo, ticket)
  assert.equal(state.stages.intake.status, 'not-started')
  const task = await readFile(path.join(path.dirname(directory), 'TASK.md'), 'utf8')
  assert.match(task, /Loại: cr \| Liên quan: \[T-1-search-articles\]\(\.\.\/T-1-search-articles\/TASK\.md\)/)
  assert.equal((await nextAction(settings, ticket)).next, 'handed-off')
  // The explicit exception: the MR is not merged and work continues on the same branch.
  const reopened = await syncTicket(settings, ticket, change(), { reopen: true })
  assert.equal(reopened.revision, 2)
  assert.equal((await nextAction(settings, ticket)).next, 'sync')
})
test('an unreachable remote is reported and never recorded as handed off', async (t) => {
  const { settings, ticket } = await fixture(t)
  await throughReview(settings, ticket)
  git(settings.repoRoot, ['remote', 'set-url', 'origin', path.join(settings.root, 'gone.git')])
  const prepared = await prepareHandoff(settings, ticket, mrInput)
  assert.equal(prepared.baseFetched, false)
  await assert.rejects(completeHandoff(settings, ticket), /Không xác minh được remote/)
  assert.equal((await context(settings, ticket)).state.stages.handoff.status, 'prepared')
  git(settings.repoRoot, ['update-ref', '-d', 'refs/remotes/origin/main'])
  await assert.rejects(prepareHandoff(settings, ticket, mrInput), /fetch base/)
})
test('a change request after prepare makes the prepared handoff stale', async (t) => {
  const { settings, ticket, branch } = await fixture(t)
  await throughReview(settings, ticket)
  await prepareHandoff(settings, ticket, mrInput)
  git(settings.repoRoot, ['push', 'origin', branch])
  await syncTicket(settings, ticket, [chatSource('One more requirement')])
  await assert.rejects(completeHandoff(settings, ticket))
  assert.equal((await nextAction(settings, ticket)).next, 'sync')
})

test('metadata stays neutral without blocking ordinary Vietnamese wording', () => {
  for (const value of [
    'feature/Codex/task',
    'Generated by AI',
    'docs: mô tả tính năng AI',
    'Co-authored-by: helper',
    token,
  ])
    assert.throws(() => checkMetadata(value))
  for (const value of [
    'feat: cho phép ai cũng xem được ghi chú',
    'fix: sửa lỗi đai ốc không ai xử lý',
    'docs: update email and maintain details',
    'feat(search): improve results',
  ])
    checkMetadata(value)
  assert.throws(() => validateMRText({ title: 'feat: search', body: 'Fixes #1' }, 'T-1'), /tự đóng/)
  assert.throws(() => validateMRText({ title: 'feat: search', body: 'No reference' }, 'T-1'), /Refs/)
  assert.throws(() => validateMRText({ title: '', body: 'Refs T-1' }, 'T-1'), /title/)
  validateMRText(mrInput, 'T-1')
})
test('scanner permits known documented placeholders but blocks token-like values', () => {
  assert.equal(hasSecret("const apiKey = 'your-api-key'"), false)
  assert.equal(hasSecret(token), true)
  assert.equal(hasSecret('glpat-' + 'a'.repeat(24)), true)
  assert.equal(hasSecret('GH_TOKEN=' + 'a'.repeat(30)), true)
  assert.equal(hasSecret('private_token: ' + 'b'.repeat(20)), true)
})
test('runtime hook blocks secret prompts/tools and permits ordinary helper commands without echo', () => {
  const tool = (command) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  })
  const events = [
    { hook_event_name: 'UserPromptSubmit', prompt: `My key is ${token}` },
    tool('cat .env'),
    tool('type config\\.env.production'),
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/home/user/.ssh/id_ed25519' },
    },
    tool('git push origin HEAD:main'),
    tool('git -C ../team-docs push'),
    tool('git -c core.hooksPath=/dev/null commit -m x'),
    tool('git commit --no-verify -m x'),
    tool('glab mr create --fill'),
    tool('gh pr merge 2'),
    tool('printenv'),
  ]
  for (const event of events) {
    assert.ok(inspectHook(event))
    const run = spawnSync(
      process.execPath,
      [path.join(kitRoot, '.agents/workflow/lib/agent-hook.mjs')],
      { input: JSON.stringify(event), encoding: 'utf8' },
    )
    assert.equal(run.status, 2)
    assert.ok(!`${run.stdout}${run.stderr}`.includes(token))
  }
  for (const command of [
    'node .agents/workflow/task.mjs doctor',
    'node .agents/workflow/task.mjs sync --title "Tìm kiếm" --slug note-search --chat .workflow-tmp/request.md',
    'cat .env.example',
    'mvn -q -Dtest=NoteSearchTest test',
    'git -C ../team-docs commit -m "docs(ticket): T-1 analysis"',
  ])
    assert.equal(inspectHook(tool(command)), null)
  assert.equal(
    inspectHook({ hook_event_name: 'UserPromptSubmit', prompt: 'Phân tích ticket T-1' }),
    null,
  )
})
test('file-writing tools are judged by their target path and secrets, not by words in the content', () => {
  const write = (tool_name, tool_input) =>
    inspectHook({ hook_event_name: 'PreToolUse', tool_name, tool_input })
  // A guide or a checks document may describe commands the agent itself must not run.
  const prose =
    'Developer tự chạy `git push -u origin feature/T-1`, không dùng --no-verify.\n' +
    'Cấu hình nằm trong file .env; đọc bằng process.env hoặc printenv.'
  assert.equal(write('Write', { file_path: 'docs/guide.md', content: prose }), null)
  assert.equal(
    write('Edit', { file_path: '.workflow-tmp/input.json', old_string: 'a', new_string: prose }),
    null,
  )
  assert.equal(write('NotebookEdit', { notebook_path: 'notes.ipynb', new_source: prose }), null)
  // The same words as a command, or through a tool that is not a file writer, stay blocked.
  assert.ok(write('Bash', { command: 'git push -u origin feature/T-1' }))
  assert.ok(write('PowerShell', { command: 'git commit --no-verify -m x' }))
  assert.ok(write('apply_patch', { input: prose }))
  assert.ok(write(undefined, { file_path: 'docs/guide.md', content: prose }))
  // Credential targets and secret content are refused whatever the tool.
  for (const file_path of ['.env', 'config/.env.production', 'C:\\Users\\dev\\.ssh\\id_ed25519'])
    assert.ok(write('Write', { file_path, content: 'x' }))
  assert.ok(write('Read', { file_path: '.env' }))
  assert.equal(write('Write', { file_path: '.env.example', content: 'API_URL=' }), null)
  assert.ok(write('Write', { file_path: 'docs/guide.md', content: `token ${token}` }))
  assert.ok(write('Edit', { file_path: 'a.md', old_string: 'a', new_string: token }))
})

async function installKit(settings) {
  await mkdir(path.join(settings.repoRoot, '.agents'), { recursive: true })
  await cp(
    path.join(kitRoot, '.agents/workflow/lib'),
    path.join(settings.repoRoot, '.agents/workflow/lib'),
    { recursive: true },
  )
  await installHooks(settings.repoRoot)
  await writeFile(
    path.join(settings.repoRoot, '.agents/workflow.config.json'),
    JSON.stringify({ schemaVersion: 3, ...config() }),
  )
}
test('packaged runtime hook launchers work for both agent runtimes from a subdirectory', async (t) => {
  const { settings } = await fixture(t)
  await installKit(settings)
  const subfolder = path.join(settings.repoRoot, 'src', 'main')
  await mkdir(subfolder, { recursive: true })
  const launch = (command, cwd, variables, payload) =>
    spawnSync(command, {
      cwd,
      shell: true,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...environment, ...variables },
      input: JSON.stringify(payload),
    })
  // Without the project variable the launcher falls back to the Git top-level folder.
  const unset = { CLAUDE_PROJECT_DIR: '' }
  const secretPrompt = { hook_event_name: 'UserPromptSubmit', prompt: token }
  const harmless = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'mvn -q test' },
  }
  for (const file of ['.codex/hooks.json', '.claude/settings.json']) {
    const { hooks } = JSON.parse(await readFile(path.join(kitRoot, file), 'utf8'))
    for (const event of ['UserPromptSubmit', 'PreToolUse']) {
      const command = hooks[event][0].hooks[0].command
      const blocked = launch(command, subfolder, unset, secretPrompt)
      assert.equal(blocked.status, 2, file)
      assert.equal(JSON.parse(blocked.stdout).decision, 'block')
      // Claude Code reads the reason of an exit-2 hook from stderr.
      assert.match(blocked.stderr, /secret/)
      assert.ok(!`${blocked.stdout}${blocked.stderr}`.includes(token))
      const allowed = launch(command, subfolder, unset, harmless)
      assert.equal(allowed.status, 0, file)
      assert.equal(allowed.stdout, '')
    }
  }
  // Claude Code names the project folder itself, so the session may run from anywhere,
  // including the documents repo. A project without the kit fails closed.
  const { hooks } = JSON.parse(await readFile(path.join(kitRoot, '.claude/settings.json'), 'utf8'))
  const command = hooks.PreToolUse[0].hooks[0].command
  const project = { CLAUDE_PROJECT_DIR: settings.repoRoot }
  assert.equal(launch(command, settings.docsRepo, project, secretPrompt).status, 2)
  assert.equal(launch(command, settings.docsRepo, project, harmless).status, 0)
  const missing = launch(command, settings.docsRepo, { CLAUDE_PROJECT_DIR: settings.root }, harmless)
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /could not load/)
})
test('setup links the kit skills into .claude/skills without copying or overwriting', async (t) => {
  const { settings } = await fixture(t)
  await installKit(settings)
  const source = path.join(settings.repoRoot, '.agents/skills')
  const links = path.join(settings.repoRoot, '.claude/skills')
  await cp(path.join(kitRoot, '.agents/skills'), source, { recursive: true })
  const names = Object.keys(await skillLinkStatus(settings.repoRoot))
  assert.deepEqual(names, [
    'task-analyze',
    'task-finalize',
    'task-handoff',
    'task-implement',
    'task-review',
    'task-sync',
  ])
  // A skill folder the project already owns is left alone.
  await mkdir(path.join(links, 'task-review'), { recursive: true })
  await writeFile(path.join(links, 'task-review', 'SKILL.md'), 'project version')
  const first = (await setupHooks(settings.repoRoot)).claudeSkills
  assert.deepEqual(first.conflicts, ['task-review'])
  assert.equal(first.linked.length, 5)
  assert.equal(await readFile(path.join(links, 'task-review', 'SKILL.md'), 'utf8'), 'project version')
  // One copy: an edit in .agents/skills is what Claude Code reads through the link.
  await writeFile(path.join(source, 'task-sync', 'SKILL.md'), 'edited once')
  assert.equal(await readFile(path.join(links, 'task-sync', 'SKILL.md'), 'utf8'), 'edited once')
  const second = await linkSkills(settings.repoRoot)
  assert.deepEqual(second.linked, [])
  assert.equal(second.present.length, 5)
  // A link left pointing at a folder that no longer exists is repaired.
  const moved = path.join(settings.root, 'elsewhere')
  await mkdir(moved)
  await rm(path.join(links, 'task-sync'), { recursive: true })
  await symlink(moved, path.join(links, 'task-sync'), 'junction')
  assert.equal((await skillLinkStatus(settings.repoRoot))['task-sync'], 'stale')
  assert.deepEqual((await linkSkills(settings.repoRoot)).linked, ['task-sync'])
  assert.equal((await skillLinkStatus(settings.repoRoot))['task-sync'], 'linked')
  // Removing the links never removes the skills they point to.
  await rm(links, { recursive: true })
  assert.equal(await readFile(path.join(source, 'task-sync', 'SKILL.md'), 'utf8'), 'edited once')
  assert.equal((await skillLinkStatus(settings.repoRoot))['task-sync'], 'missing')
})
test('setup validates the hook config of every packaged runtime', async (t) => {
  const { settings } = await fixture(t)
  await installKit(settings)
  assert.deepEqual((await setupHooks(settings.repoRoot)).runtimes, ['codex', 'claude'])
  await rm(path.join(settings.repoRoot, '.codex'), { recursive: true })
  assert.deepEqual((await setupHooks(settings.repoRoot)).runtimes, ['claude'])
  const claude = path.join(settings.repoRoot, '.claude/settings.json')
  await writeFile(claude, JSON.stringify({ hooks: { PreToolUse: [] } }))
  await assert.rejects(setupHooks(settings.repoRoot), /thiếu runtime hook/)
  await rm(claude)
  await assert.rejects(setupHooks(settings.repoRoot), /Thiếu runtime hook config/)
})
test('real Git hooks reject main push and staged secret; allow feature push to a local bare remote', async (t) => {
  const { settings, branch } = await fixture(t)
  await installKit(settings)
  const before = git(settings.remote, ['rev-parse', 'main'])
  await setupHooks(settings.repoRoot)
  const pushMain = spawnSync('git', ['push', 'origin', 'HEAD:main'], {
    cwd: settings.repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(pushMain.status, 0)
  assert.equal(git(settings.remote, ['rev-parse', 'main']), before)
  git(settings.repoRoot, ['push', 'origin', `HEAD:refs/heads/${branch}`])
  const featureHead = git(settings.remote, ['rev-parse', `refs/heads/${branch}`])
  assert.equal(featureHead, git(settings.repoRoot, ['rev-parse', 'HEAD']))
  for (const refspec of [`${before}:refs/heads/${branch}`, `:refs/heads/${branch}`]) {
    const rejected = spawnSync('git', ['push', '--force', 'origin', refspec], {
      cwd: settings.repoRoot,
      encoding: 'utf8',
    })
    assert.notEqual(rejected.status, 0)
    assert.equal(git(settings.remote, ['rev-parse', `refs/heads/${branch}`]), featureHead)
  }
  const commit = (message) =>
    spawnSync('git', ['commit', '-m', message], { cwd: settings.repoRoot, encoding: 'utf8' })
  await writeFile(path.join(settings.repoRoot, 'leak.txt'), token)
  git(settings.repoRoot, ['add', 'leak.txt'])
  const oldHead = git(settings.repoRoot, ['rev-parse', 'HEAD'])
  const leaked = commit('feat: test guard')
  assert.notEqual(leaked.status, 0)
  assert.ok(!`${leaked.stdout}${leaked.stderr}`.includes(token))
  git(settings.repoRoot, ['rm', '--cached', '-q', 'leak.txt'])
  await rm(path.join(settings.repoRoot, 'leak.txt'))
  await writeFile(path.join(settings.repoRoot, 'feature.txt'), 'guarded change\n')
  git(settings.repoRoot, ['add', 'feature.txt'])
  assert.notEqual(commit('improve search').status, 0)
  assert.notEqual(commit('feat: improve search\n\nCo-authored-by: Helper <h@example.test>').status, 0)
  assert.equal(git(settings.repoRoot, ['rev-parse', 'HEAD']), oldHead)
  assert.equal(commit('feat: cho phép ai cũng tìm được bài viết').status, 0)
})
test('setup does not replace existing custom hooksPath', async (t) => {
  const { settings } = await fixture(t)
  git(settings.repoRoot, ['config', 'core.hooksPath', '.custom-hooks'])
  await assert.rejects(setupHooks(settings.repoRoot), /hooksPath khác/)
  assert.equal(git(settings.repoRoot, ['config', '--get', 'core.hooksPath']), '.custom-hooks')
})

test('intake must cover every current source; missing docs are recoverable', async (t) => {
  const { settings, ticket } = await fixture(t)
  assert.equal((await intakeStatus(settings, ticket)).docsMissing, false)
  await syncTicket(settings, ticket, [chatSource('Include descendants')])
  const status = await intakeStatus(settings, ticket)
  assert.equal(status.docsMissing, true)
  assert.deepEqual(status.sourceIds, ['r1/chat.md', 'r2/chat.md'])
  await assert.rejects(recordStage(settings, ticket, 'analysis', input('analysis', 2)), /intake/)
  const intake = {
    change: { summary: 'Update test stage', reason: 'New source revision' },
    revision: 2,
    translatedSourceIds: ['r1/chat.md'],
    documents: { 'task.md': 'Synthetic translated source and delta.' },
  }
  await assert.rejects(recordStage(settings, ticket, 'intake', intake), /translatedSourceIds/)
  intake.translatedSourceIds.push('r2/chat.md')
  await recordStage(settings, ticket, 'intake', intake)
  const { directory, state } = await context(settings, ticket)
  await rm(path.join(directory, path.dirname(state.stages.intake.artifact), 'task.md'))
  assert.equal((await intakeStatus(settings, ticket)).docsMissing, true)
  await recordStage(settings, ticket, 'intake', intake)
  assert.equal((await intakeStatus(settings, ticket)).docsMissing, false)
  await recordStage(settings, ticket, 'analysis', input('analysis', 2))
})
