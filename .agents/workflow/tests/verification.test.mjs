import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { syncTicket } from '../lib/vault.mjs'
import { chatSource } from '../lib/source.mjs'
import { context, recordStage, handoffGate, persistStage } from '../lib/stages.mjs'
import { runCheck, fingerprint, validatePlan } from '../lib/verification.mjs'
import { resolveCommand } from '../lib/command.mjs'
import { nextAction } from '../lib/dispatch.mjs'
import { git } from '../lib/git.mjs'
import { ticketFixture, change } from './helpers.mjs'

async function fixture(
  t,
  command = ['node', '-e', 'process.exitCode = 0'],
  check = {},
  workspaceOptions = {},
) {
  const { settings, ticket } = await ticketFixture(t, {
    key: 'T-4',
    slug: 'help-text',
    file: 'help.md',
    ...workspaceOptions,
  })
  await recordStage(settings, ticket, 'analysis', {
    change,
    revision: 1,
    documents: { 'task.md': 'Help text nằm trong help.md.' },
    observations: [
      { id: 'file', status: 'observed', description: 'Help file exists', evidence: 'Read help.md' },
    ],
  })
  const plan = {
    change,
    revision: 1,
    documents: { 'plan.md': 'Sửa help.md; kiểm nội dung. Không cần DB.' },
    decision: { optionId: 'edit', rationale: 'Direct text edit' },
    files: ['help.md'],
    risks: [],
    requiredFacts: ['file'],
    delivery: {
      kind: 'artifact',
      target: 'help.md',
      preparation: 'Edit file',
      permissions: 'Local file edit',
      recovery: 'Git restore',
      checks: ['HELP'],
    },
    requiredChecks: [
      { id: 'HELP', target: 'help.md', kind: 'docs', ac: ['AC1'], command, ...check },
    ],
    steps: [{ id: 'edit', goal: 'Update help text', dependsOn: [], checks: ['HELP'] }],
  }
  await recordStage(settings, ticket, 'finalize', plan)
  await approve(settings, ticket)
  return { settings, ticket, plan }
}
const approve = (settings, ticket, evidence = 'Synthetic local test approval') =>
  recordStage(settings, ticket, 'approve', {
    change,
    revision: 1,
    documents: {},
    decision: 'approved',
    approvedBy: 'tester',
    evidence,
  })
const completion = {
  change: { summary: 'Verify task', reason: 'Checks completed' },
  revision: 1,
  documents: { 'checks.md': 'Checks thực thi qua helper.' },
}
async function verified(settings, ticket) {
  await runCheck(settings, ticket, 'HELP')
  return recordStage(settings, ticket, 'implement', completion)
}
test('generic docs task needs no DB/API/UI and generates three human views plus the request', async (t) => {
  const { settings, ticket } = await fixture(t)
  const { directory } = await context(settings, ticket)
  assert.deepEqual((await readdir(path.dirname(directory))).sort(), [
    '.workflow',
    'CHECKS.md',
    'PLAN.md',
    'TASK.md',
    'request',
  ])
  assert.equal((await nextAction(settings, ticket)).next, 'implement')
  assert.equal((await verified(settings, ticket)).status, 'verified')
  assert.equal((await nextAction(settings, ticket)).next, 'review')
  await recordStage(settings, ticket, 'review', { ...completion, verdict: 'pass', findings: [] })
  assert.equal((await nextAction(settings, ticket)).next, 'handoff')
})
test('self-reported pass cannot replace a missing actual check', async (t) => {
  const { settings, ticket } = await fixture(t)
  await assert.rejects(
    recordStage(settings, ticket, 'implement', {
      ...completion,
      tests: [{ id: 'HELP', result: 'pass', command: 'invented', evidence: 'claimed' }],
    }),
    /chưa chạy/,
  )
})
test('failed command stays failed and cannot complete implementation', async (t) => {
  const { settings, ticket } = await fixture(t, ['node', '-e', 'process.exitCode = 7'])
  assert.equal((await runCheck(settings, ticket, 'HELP')).exitCode, 7)
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /fail/)
  await assert.rejects(runCheck(settings, ticket, 'UNPLANNED'), /không nằm trong plan/)
})
test('a missing executable is a failed check, not a crash', async (t) => {
  const { settings, ticket } = await fixture(t, ['workflow-test-missing-tool', '--version'])
  const run = await runCheck(settings, ticket, 'HELP')
  assert.equal(run.result, 'fail')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /fail/)
})
test('a check that outlives its timeout is killed and recorded as failed', async (t) => {
  const { settings, ticket } = await fixture(
    t,
    ['node', '-e', 'console.log("started"); setTimeout(() => {}, 60000)'],
    { timeoutSeconds: 2 },
  )
  const started = Date.now()
  const run = await runCheck(settings, ticket, 'HELP')
  assert.ok(Date.now() - started < 30000)
  assert.equal(run.result, 'fail')
  assert.equal(run.timedOut, true)
  const { directory } = await context(settings, ticket)
  const record = JSON.parse(await readFile(path.join(directory, run.evidence), 'utf8'))
  assert.equal(record.timeoutSeconds, 2)
  assert.match(await readFile(path.join(directory, record.log), 'utf8'), /started/)
})
test('a check that modifies source files fails even with exit code 0', async (t) => {
  const { settings, ticket } = await fixture(t, [
    'node',
    '-e',
    'require("node:fs").writeFileSync("help.md", "rewritten by check")',
  ])
  const run = await runCheck(settings, ticket, 'HELP')
  assert.equal(run.exitCode, 0)
  assert.equal(run.changedDuringRun, true)
  assert.equal(run.result, 'fail')
})
test('Windows batch tools run without a shell-expanded command line', async (t) => {
  if (process.platform !== 'win32') return t.skip('Chỉ áp dụng cho Windows.')
  const { settings, ticket, plan } = await fixture(t)
  // Stand-in for mvn.cmd / gradlew.bat: succeeds only for the expected argument.
  await writeFile(
    path.join(settings.repoRoot, 'buildtool.cmd'),
    '@echo off\r\necho arg=%~1\r\nif "%~1"=="verify me" (exit /b 0) else (exit /b 3)\r\n',
  )
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'build: add wrapper'])
  const withCommand = (command) => ({
    ...plan,
    files: ['help.md', 'buildtool.cmd'],
    requiredChecks: [{ ...plan.requiredChecks[0], command }],
  })
  await recordStage(settings, ticket, 'finalize', withCommand(['buildtool', 'verify me']))
  await approve(settings, ticket)
  const pass = await runCheck(settings, ticket, 'HELP')
  assert.equal(pass.result, 'pass')
  const { directory } = await context(settings, ticket)
  const record = JSON.parse(await readFile(path.join(directory, pass.evidence), 'utf8'))
  assert.match(await readFile(path.join(directory, record.log), 'utf8'), /arg=verify me/)
  await recordStage(settings, ticket, 'finalize', withCommand(['./buildtool.cmd', 'other']))
  await approve(settings, ticket)
  assert.equal((await runCheck(settings, ticket, 'HELP')).exitCode, 3)
  await recordStage(settings, ticket, 'finalize', withCommand(['buildtool', 'a&whoami']))
  await approve(settings, ticket)
  await assert.rejects(runCheck(settings, ticket, 'HELP'), /ký tự đặc biệt/)
})
test('command resolution keeps argv literal on every platform', async (t) => {
  const { settings } = await ticketFixture(t)
  const tools = path.join(settings.root, 'tools')
  await mkdir(tools)
  await writeFile(path.join(tools, 'mvn'), '#!/bin/sh\n')
  await writeFile(path.join(tools, 'mvn.cmd'), '@echo off\r\n')
  await writeFile(path.join(tools, 'java.exe'), '')
  const env = { PATH: tools, PATHEXT: '.com;.exe;.bat;.cmd', ComSpec: 'C:\\Windows\\cmd.exe' }
  const cwd = settings.repoRoot
  assert.deepEqual(resolveCommand(['mvn', '-q', 'test'], cwd, 'linux', env), {
    file: 'mvn',
    args: ['-q', 'test'],
    options: {},
  })
  assert.equal(resolveCommand(['node', '-v'], cwd, 'win32', env).file, process.execPath)
  assert.equal(
    resolveCommand(['java', '-version'], cwd, 'win32', env).file,
    path.resolve(tools, 'java.exe'),
  )
  const batch = resolveCommand(['mvn', '-q', '-Dtest=NoteSearchTest#finds', 'test'], cwd, 'win32', env)
  assert.equal(batch.file, 'C:\\Windows\\cmd.exe')
  assert.deepEqual(batch.args.slice(0, 3), ['/d', '/s', '/c'])
  assert.equal(
    batch.args[3],
    `""${path.resolve(tools, 'mvn.cmd')}" "-q" "-Dtest=NoteSearchTest#finds" "test""`,
  )
  assert.equal(batch.options.windowsVerbatimArguments, true)
  for (const unsafe of ['a&b', '%PATH%', 'say "hi"', 'x|y', 'trailing\\'])
    assert.throws(() => resolveCommand(['mvn', unsafe], cwd, 'win32', env), /ký tự đặc biệt/)
  assert.equal(resolveCommand(['missing-tool'], cwd, 'win32', env).file, 'missing-tool')
})
test('unknown required fact, invalid step dependency and bad timeout are rejected', () => {
  const base = {
    requiredFacts: ['data'],
    requiredChecks: [{ id: 'A', ac: ['AC1'], kind: 'unit', command: ['node', '-v'] }],
    steps: [{ id: 'a', goal: 'A', dependsOn: [], checks: ['A'] }],
  }
  assert.throws(
    () => validatePlan(base, { observations: [{ id: 'data', status: 'unknown' }] }),
    /chưa observed/,
  )
  const analysis = { observations: [{ id: 'data', status: 'observed', evidence: 'read' }] }
  assert.throws(
    () => validatePlan({ ...base, steps: [{ ...base.steps[0], dependsOn: ['a'] }] }, analysis),
    /dependencies/,
  )
  assert.throws(
    () =>
      validatePlan(
        { ...base, requiredChecks: [...base.requiredChecks, base.requiredChecks[0]] },
        analysis,
      ),
    /duy nhất/,
  )
  for (const timeoutSeconds of [0, 1.5, '60', 7201])
    assert.throws(
      () =>
        validatePlan(
          { ...base, requiredChecks: [{ ...base.requiredChecks[0], timeoutSeconds }] },
          analysis,
        ),
      /timeoutSeconds/,
    )
})
test('code fingerprint survives commit of identical content, but stale content is rejected', async (t) => {
  const { settings, ticket } = await fixture(t)
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'New help\n')
  const before = await fingerprint(settings.repoRoot)
  await runCheck(settings, ticket, 'HELP')
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'docs: improve help'])
  assert.equal(await fingerprint(settings.repoRoot), before)
  await recordStage(settings, ticket, 'implement', completion)
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'Changed again\n')
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'docs: revise help'])
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /evidence đã cũ/)
})
test('a checkout that only converts line endings keeps evidence valid', async (t) => {
  const { settings, ticket } = await fixture(t)
  git(settings.repoRoot, ['config', 'core.autocrlf', 'true'])
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'Line one\nLine two\n')
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'docs: improve help'])
  await verified(settings, ticket)
  // Git rewrites the working file with CRLF when the branch is checked out again.
  git(settings.repoRoot, ['switch', 'main'])
  git(settings.repoRoot, ['switch', `feature/${ticket}`])
  assert.equal(
    await readFile(path.join(settings.repoRoot, 'help.md'), 'utf8'),
    'Line one\r\nLine two\r\n',
  )
  assert.equal((await nextAction(settings, ticket)).next, 'review')
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'Line one\r\nLine 2\r\n')
  assert.equal((await nextAction(settings, ticket)).next, 'implement')
})
test('writing ticket records never changes the source fingerprint', async (t) => {
  const { settings, ticket } = await fixture(t)
  const before = await fingerprint(settings.repoRoot)
  await verified(settings, ticket)
  await syncTicket(settings, ticket)
  assert.equal(await fingerprint(settings.repoRoot), before)
  assert.equal(git(settings.repoRoot, ['status', '--porcelain']), '')
})
test('records kept in a git-ignored folder of the source repo leave code gates untouched', async (t) => {
  const { settings, ticket } = await fixture(t, undefined, {}, { docsInside: true })
  assert.ok(settings.docsRoot.startsWith(settings.repoRoot))
  const before = await fingerprint(settings.repoRoot)
  assert.equal((await verified(settings, ticket)).status, 'verified')
  await recordStage(settings, ticket, 'review', { ...completion, verdict: 'pass', findings: [] })
  assert.equal(await fingerprint(settings.repoRoot), before)
  assert.equal(git(settings.repoRoot, ['status', '--porcelain', '--untracked-files=all']), '')
  assert.equal((await nextAction(settings, ticket)).next, 'handoff')
})
test('changed runtime observations invalidate checks without inventing a new approval', async (t) => {
  const { settings, ticket } = await fixture(t)
  await verified(settings, ticket)
  const before = (await context(settings, ticket)).state.approval
  await recordStage(settings, ticket, 'observe', {
    change,
    revision: 1,
    context: { fixture: 'v2' },
    evidence: 'fixture manifest read',
  })
  assert.deepEqual((await context(settings, ticket)).state.approval, before)
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /evidence đã cũ/)
  await verified(settings, ticket)
})
test('tampered log is rejected; repeated passing run produces fresh evidence', async (t) => {
  const { settings, ticket } = await fixture(t)
  const run = await runCheck(settings, ticket, 'HELP')
  const { directory } = await context(settings, ticket)
  const record = JSON.parse(await readFile(path.join(directory, run.evidence), 'utf8'))
  await writeFile(path.join(directory, record.log), 'forged')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /log đã bị sửa/)
  await verified(settings, ticket)
})
test('review findings route back to implement; blocked checkpoint retains next action', async (t) => {
  const { settings, ticket } = await fixture(t)
  await verified(settings, ticket)
  await recordStage(settings, ticket, 'review-findings', {
    ...completion,
    findings: [{ status: 'open', description: 'Missing example' }],
  })
  assert.equal((await nextAction(settings, ticket)).next, 'implement')
  const blocked = await recordStage(settings, ticket, 'checkpoint', {
    ...completion,
    blocker: 'Need wording decision',
  })
  assert.equal(blocked.status, 'blocked')
  await assert.rejects(handoffGate(settings, ticket))
})
test('CR invalidates gates and preserves immutable plan history', async (t) => {
  const { settings, ticket } = await fixture(t)
  await verified(settings, ticket)
  const { directory, state } = await context(settings, ticket)
  const old = await readFile(path.join(directory, state.stages.finalize.artifact), 'utf8')
  await syncTicket(settings, ticket, [chatSource('Add a second example')])
  assert.equal((await nextAction(settings, ticket)).next, 'sync')
  assert.equal(await readFile(path.join(directory, state.stages.finalize.artifact), 'utf8'), old)
})
test('a plan without required checks cannot reach verified status', async (t) => {
  const { settings, ticket } = await fixture(t)
  const { directory, state } = await context(settings, ticket)
  // A record written around recordStage validation, as an incomplete older plan would look.
  await persistStage(directory, state, 'finalize', {
    change,
    revision: 1,
    documents: { 'spec.md': 'Old spec', 'plan.md': 'Old plan' },
    files: ['help.md'],
  })
  assert.equal((await nextAction(settings, ticket)).next, 'finalize')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /requiredChecks/)
})

test('delivery rejects a missing contract and checks aimed only at a copy', async (t) => {
  const { plan } = await fixture(t)
  const analysis = { observations: [{ id: 'file', status: 'observed', evidence: 'read' }] }
  const { delivery, ...incomplete } = plan
  assert.throws(() => validatePlan(incomplete, analysis), /delivery/)
  assert.throws(
    () =>
      validatePlan({ ...plan, delivery: { ...delivery, target: 'different-target' } }, analysis),
    /delivery/,
  )
})

test('passing isolated checks cannot complete runtime delivery until target smoke succeeds', async (t) => {
  const { settings, ticket, plan } = await fixture(t)
  const target = path.join(settings.root, 'runtime-ready')
  await writeFile(
    path.join(settings.repoRoot, 'smoke.cjs'),
    "const fs = require('node:fs'); if (fs.readFileSync(process.env.WORKFLOW_CHECK_TARGET, 'utf8') !== 'ready' || process.env.WORKFLOW_DELIVERY_IDENTITY !== 'fixture-v1') process.exitCode = 1",
  )
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'test: add target smoke'])
  await recordStage(settings, ticket, 'finalize', {
    ...plan,
    delivery: {
      kind: 'runtime',
      target,
      preparation: 'Prepare target',
      permissions: 'Temporary test target',
      recovery: 'Remove temporary file',
      checks: ['SMOKE'],
    },
    requiredChecks: [
      ...plan.requiredChecks,
      { id: 'SMOKE', target, kind: 'runtime', ac: ['AC1'], command: ['node', 'smoke.cjs'] },
    ],
    steps: [
      ...plan.steps,
      { id: 'deliver', goal: 'Ready target', dependsOn: ['edit'], checks: ['SMOKE'] },
    ],
  })
  await approve(settings, ticket, 'Approve temporary target')
  await runCheck(settings, ticket, 'HELP')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /observe/)
  await recordStage(settings, ticket, 'observe', {
    change,
    revision: 1,
    context: { deliveryTarget: target, deliveryIdentity: 'fixture-v1' },
    evidence: 'Temporary target identity inspected',
  })
  await runCheck(settings, ticket, 'HELP')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /chưa chạy/)
  assert.equal((await runCheck(settings, ticket, 'SMOKE')).result, 'fail')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /fail/)
  await writeFile(target, 'ready')
  assert.equal((await runCheck(settings, ticket, 'SMOKE')).result, 'pass')
  assert.equal((await recordStage(settings, ticket, 'implement', completion)).status, 'verified')
  await recordStage(settings, ticket, 'observe', {
    change,
    revision: 1,
    context: { deliveryTarget: target, deliveryIdentity: 'fixture-v2' },
    evidence: 'Target restarted with another fixture',
  })
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /evidence đã cũ/)
})

test('a plan without delivery routes to finalize and cannot reuse approval', async (t) => {
  const { settings, ticket, plan } = await fixture(t)
  const { directory, state } = await context(settings, ticket)
  const incomplete = { ...plan }
  delete incomplete.delivery
  await persistStage(directory, state, 'finalize', incomplete)
  assert.equal((await nextAction(settings, ticket)).next, 'finalize')
  await assert.rejects(recordStage(settings, ticket, 'implement', completion), /delivery/)
})

test('document versions track author, rationale and immutable references independently', async (t) => {
  const { settings, ticket, plan } = await fixture(t)
  let { directory, state } = await context(settings, ticket)
  assert.equal(state.documentHistory.TASK.at(-1).version, 2)
  assert.equal(state.documentHistory.PLAN.at(-1).version, 1)
  const original = state.documentHistory.PLAN[0]
  const originalBytes = await readFile(path.join(directory, original.artifact), 'utf8')
  const first = JSON.parse(originalBytes)
  assert.equal(first.metadata.author, settings.author)
  assert.equal(first.metadata.references.task.version, 2)
  assert.equal(first.metadata.references.source, state.snapshot)
  assert.equal(first.metadata.references.requirementRevision, 1)
  assert.match(first.metadata.updatedAt, /Z$/)
  const before = await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8')
  assert.match(before, /ticket: "T-4-help-text"/)
  await syncTicket(settings, ticket)
  assert.equal(await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8'), before)
  await runCheck(settings, ticket, 'HELP')
  assert.equal((await context(settings, ticket)).state.documentHistory.PLAN.length, 1)
  await recordStage(settings, ticket, 'finalize', {
    ...plan,
    metadata: { author: 'forged', version: 999 },
  })
  assert.equal((await context(settings, ticket)).state.documentHistory.PLAN.length, 1)
  // A colleague continues the ticket: the author comes from their Git identity, not the input.
  const colleague = { ...settings, author: 'Second Developer <second@example.test>' }
  await recordStage(colleague, ticket, 'finalize', {
    ...plan,
    documents: { 'plan.md': 'Revised acceptance and delivery.' },
    change: { summary: 'Add delivery acceptance', reason: 'Cover target readiness' },
    metadata: { author: 'forged', version: 999 },
  })
  ;({ directory, state } = await context(settings, ticket))
  const latest = JSON.parse(await readFile(path.join(directory, state.stages.finalize.artifact)))
  assert.equal(latest.metadata.version, 2)
  assert.equal(latest.metadata.author, colleague.author)
  assert.equal(state.approval, undefined)
  assert.equal(await readFile(path.join(directory, original.artifact), 'utf8'), originalBytes)
  const view = await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8')
  assert.match(view, /document_version: 2/)
  assert.match(view, /Cover target readiness/)
  assert.match(view, /Second Developer/)
  assert.ok(view.includes(original.artifact))
  assert.match(view, /pending \/ stale/)
})

test('document stage refuses missing rationale and an unknown author is never invented', async (t) => {
  const { settings, ticket, plan } = await fixture(t)
  const missing = { ...plan }
  delete missing.change
  await assert.rejects(recordStage(settings, ticket, 'finalize', missing), /change.summary/)
  const { directory, state } = await context(settings, ticket)
  await persistStage(directory, state, 'finalize', {
    ...plan,
    documents: { 'plan.md': 'Plan recorded without a known author' },
  })
  const record = JSON.parse(await readFile(path.join(directory, state.stages.finalize.artifact)))
  assert.equal(record.metadata.author, null)
  assert.match(
    await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8'),
    /author: "không được ghi nhận"/,
  )
})
