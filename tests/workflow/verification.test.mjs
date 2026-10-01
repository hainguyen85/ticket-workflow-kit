import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { saveSnapshot, ticketDirectory } from '../../scripts/workflow/vault.mjs'
import { context, recordStage, releaseGate } from '../../scripts/workflow/stages.mjs'
import { runCheck, fingerprint, validatePlan } from '../../scripts/workflow/verification.mjs'
import { nextAction } from '../../scripts/workflow/dispatch.mjs'
import { git } from '../../scripts/workflow/git.mjs'
const source = {
  repository: 'example/workshop',
  number: 4,
  title: 'Update help text',
  body: 'Improve help text',
  comments: [],
  labels: [],
  assignees: [],
  state: 'open',
  project: {},
  updatedAt: 't1',
}
async function fixture(t, command = ['node', '-e', 'process.exit(0)']) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-verification-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const settings = {
    repoRoot: path.join(root, 'repo'),
    docsRoot: path.join(root, 'docs'),
    token: 'synthetic-token-for-tests',
    config: { github: { repository: source.repository, baseBranch: 'main' } },
  }
  await mkdir(settings.repoRoot)
  await mkdir(settings.docsRoot)
  git(settings.repoRoot, ['init', '-b', 'main'])
  git(settings.repoRoot, ['config', 'user.name', 'Workshop Tester'])
  git(settings.repoRoot, ['config', 'user.email', 'tester@example.test'])
  git(settings.repoRoot, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'Help\n')
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'docs: add help'])
  git(settings.repoRoot, ['switch', '-c', 'feature/learner/issue-4-help'])
  await saveSnapshot(settings, 'learner', source)
  await recordStage(settings, 'learner', 4, 'intake', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    documents: { 'task.md': 'Yêu cầu cập nhật trợ giúp.' },
    translatedSourceIds: ['issue:4'],
  })
  await recordStage(settings, 'learner', 4, 'analysis', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    documents: { 'task.md': 'Help text nằm trong help.md.' },
    observations: [
      { id: 'file', status: 'observed', description: 'Help file exists', evidence: 'Read help.md' },
    ],
  })
  const plan = {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
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
    requiredChecks: [{ id: 'HELP', target: 'help.md', kind: 'docs', ac: ['AC1'], command }],
    steps: [{ id: 'edit', goal: 'Update help text', dependsOn: [], checks: ['HELP'] }],
  }
  await recordStage(settings, 'learner', 4, 'finalize', plan)
  await recordStage(settings, 'learner', 4, 'approve', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    documents: {},
    decision: 'approved',
    approvedBy: 'tester',
    evidence: 'Synthetic local test approval',
  })
  return { settings, plan }
}
const completion = {
  change: { summary: 'Verify task', reason: 'Checks completed' },
  revision: 1,
  documents: { 'checks.md': 'Checks thực thi qua helper.' },
}
async function verified(settings) {
  await runCheck(settings, 'learner', 4, 'HELP')
  return recordStage(settings, 'learner', 4, 'implement', completion)
}
test('generic docs task needs no DB/API/UI and generates only three human views', async (t) => {
  const { settings } = await fixture(t)
  const { directory } = await context(settings, 'learner', 4)
  assert.deepEqual((await readdir(path.dirname(directory))).sort(), [
    '.workflow',
    'CHECKS.md',
    'PLAN.md',
    'TASK.md',
  ])
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'implement')
  assert.equal((await verified(settings)).status, 'verified')
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'review')
  await recordStage(settings, 'learner', 4, 'review', {
    ...completion,
    verdict: 'pass',
    findings: [],
  })
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'release')
})
test('self-reported pass cannot replace a missing actual check', async (t) => {
  const { settings } = await fixture(t)
  await assert.rejects(
    recordStage(settings, 'learner', 4, 'implement', {
      ...completion,
      tests: [{ id: 'HELP', result: 'pass', command: 'invented', evidence: 'claimed' }],
    }),
    /chưa chạy/,
  )
})
test('failed command stays failed and cannot complete implementation', async (t) => {
  const { settings } = await fixture(t, ['node', '-e', 'process.exit(7)'])
  assert.equal((await runCheck(settings, 'learner', 4, 'HELP')).exitCode, 7)
  await assert.rejects(recordStage(settings, 'learner', 4, 'implement', completion), /fail/)
})
test('unknown required fact and invalid step dependency are rejected', () => {
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
})
test('code fingerprint survives commit of identical content, but stale content is rejected', async (t) => {
  const { settings } = await fixture(t)
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'New help\n')
  const before = await fingerprint(settings.repoRoot)
  await runCheck(settings, 'learner', 4, 'HELP')
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'docs: improve help'])
  assert.equal(await fingerprint(settings.repoRoot), before)
  await recordStage(settings, 'learner', 4, 'implement', completion)
  await writeFile(path.join(settings.repoRoot, 'help.md'), 'Changed again\n')
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'docs: revise help'])
  await assert.rejects(
    recordStage(settings, 'learner', 4, 'implement', completion),
    /evidence đã cũ/,
  )
})
test('changed runtime observations invalidate checks without inventing a new approval', async (t) => {
  const { settings } = await fixture(t)
  await verified(settings)
  const before = (await context(settings, 'learner', 4)).state.approval
  await recordStage(settings, 'learner', 4, 'observe', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    context: { fixture: 'v2' },
    evidence: 'fixture manifest read',
  })
  assert.deepEqual((await context(settings, 'learner', 4)).state.approval, before)
  await assert.rejects(
    recordStage(settings, 'learner', 4, 'implement', completion),
    /evidence đã cũ/,
  )
  await verified(settings)
})
test('tampered log is rejected; repeated passing run produces fresh evidence', async (t) => {
  const { settings } = await fixture(t)
  const run = await runCheck(settings, 'learner', 4, 'HELP')
  const { directory } = await context(settings, 'learner', 4)
  const record = JSON.parse(await readFile(path.join(directory, run.evidence), 'utf8'))
  await writeFile(path.join(directory, record.log), 'forged')
  await assert.rejects(
    recordStage(settings, 'learner', 4, 'implement', completion),
    /log đã bị sửa/,
  )
  await verified(settings)
})
test('review findings route back to implement; blocked checkpoint retains next action', async (t) => {
  const { settings } = await fixture(t)
  await verified(settings)
  await recordStage(settings, 'learner', 4, 'review-findings', {
    ...completion,
    findings: [{ status: 'open', description: 'Missing example' }],
  })
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'implement')
  const blocked = await recordStage(settings, 'learner', 4, 'checkpoint', {
    ...completion,
    blocker: 'Need wording decision',
  })
  assert.equal(blocked.status, 'blocked')
  await assert.rejects(releaseGate(settings, 'learner', 4))
})
test('CR invalidates gates and preserves immutable plan history', async (t) => {
  const { settings } = await fixture(t)
  await verified(settings)
  const { directory, state } = await context(settings, 'learner', 4)
  const old = await readFile(path.join(directory, state.stages.finalize.artifact), 'utf8')
  await saveSnapshot(settings, 'learner', {
    ...source,
    comments: [{ id: 8, body: 'Add a second example' }],
  })
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'sync')
  assert.equal(await readFile(path.join(directory, state.stages.finalize.artifact), 'utf8'), old)
})
test('legacy import preserves original bytes and resumes from copied records', async (t) => {
  const { settings } = await fixture(t)
  const { directory, state } = await context(settings, 'learner', 4)
  const root = path.dirname(directory)
  // Recreate the real v1 root layout, retaining its immutable records.
  for (const name of await readdir(directory))
    await rename(path.join(directory, name), path.join(root, name))
  await rm(directory, { recursive: true })
  const before = await readFile(path.join(root, 'state.json'), 'utf8')
  const imported = await ticketDirectory(settings, 'learner', 4)
  assert.equal(imported, directory)
  assert.equal(await readFile(path.join(root, 'state.json'), 'utf8'), before)
  assert.equal(await readFile(path.join(imported, 'state.json'), 'utf8'), before)
  assert.equal(
    (await context(settings, 'learner', 4)).state.stages.finalize.hash,
    state.stages.finalize.hash,
  )
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'implement')
})
test('legacy plan without required checks cannot inherit verified status', async (t) => {
  const { settings } = await fixture(t)
  const { directory, state } = await context(settings, 'learner', 4)
  // Valid legacy artifact produced with its historical hash, not a silently edited plan.
  const { persistStage } = await import('../../scripts/workflow/stages.mjs')
  await persistStage(directory, state, 'finalize', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    documents: { 'spec.md': 'Old spec', 'plan.md': 'Old plan' },
    files: ['help.md'],
  })
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'finalize')
  await assert.rejects(recordStage(settings, 'learner', 4, 'implement', completion), /legacy/)
})

test('delivery rejects a missing contract and checks aimed only at a copy', async (t) => {
  const { plan } = await fixture(t)
  const analysis = { observations: [{ id: 'file', status: 'observed', evidence: 'read' }] }
  const { delivery, ...legacy } = plan
  assert.throws(() => validatePlan(legacy, analysis), /delivery/)
  assert.throws(
    () =>
      validatePlan(
        {
          ...plan,
          delivery: { ...delivery, target: 'different-target' },
        },
        analysis,
      ),
    /delivery/,
  )
})

test('passing isolated checks cannot complete runtime delivery until target smoke succeeds', async (t) => {
  const { settings, plan } = await fixture(t)
  const target = path.join(settings.docsRoot, 'runtime-ready')
  await writeFile(
    path.join(settings.repoRoot, 'smoke.cjs'),
    "const fs = require('node:fs'); if (fs.readFileSync(process.env.WORKFLOW_CHECK_TARGET, 'utf8') !== 'ready') process.exit(1)",
  )
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'test: add target smoke'])
  await recordStage(settings, 'learner', 4, 'finalize', {
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
      {
        id: 'SMOKE',
        target,
        kind: 'runtime',
        ac: ['AC1'],
        command: ['node', 'smoke.cjs'],
      },
    ],
    steps: [
      ...plan.steps,
      { id: 'deliver', goal: 'Ready target', dependsOn: ['edit'], checks: ['SMOKE'] },
    ],
  })
  await recordStage(settings, 'learner', 4, 'approve', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    decision: 'approved',
    approvedBy: 'tester',
    evidence: 'Approve temporary target',
  })
  await runCheck(settings, 'learner', 4, 'HELP')
  await assert.rejects(recordStage(settings, 'learner', 4, 'implement', completion), /observe/)
  await recordStage(settings, 'learner', 4, 'observe', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    context: { deliveryTarget: target, deliveryIdentity: 'fixture-v1' },
    evidence: 'Temporary target identity inspected',
  })
  await runCheck(settings, 'learner', 4, 'HELP')
  await assert.rejects(recordStage(settings, 'learner', 4, 'implement', completion), /chưa chạy/)
  assert.equal((await runCheck(settings, 'learner', 4, 'SMOKE')).result, 'fail')
  await assert.rejects(recordStage(settings, 'learner', 4, 'implement', completion), /fail/)
  await writeFile(target, 'ready')
  assert.equal((await runCheck(settings, 'learner', 4, 'SMOKE')).result, 'pass')
  assert.equal(
    (await recordStage(settings, 'learner', 4, 'implement', completion)).status,
    'verified',
  )
  await recordStage(settings, 'learner', 4, 'observe', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    context: { deliveryTarget: target, deliveryIdentity: 'fixture-v2' },
    evidence: 'Target restarted with another fixture',
  })
  await assert.rejects(
    recordStage(settings, 'learner', 4, 'implement', completion),
    /evidence đã cũ/,
  )
})

test('legacy plan without delivery routes to finalize and cannot reuse approval', async (t) => {
  const { settings, plan } = await fixture(t)
  const { directory, state } = await context(settings, 'learner', 4)
  const legacy = { ...plan }
  delete legacy.delivery
  const { persistStage } = await import('../../scripts/workflow/stages.mjs')
  await persistStage(directory, state, 'finalize', legacy)
  assert.equal((await nextAction(settings, 'learner', 4)).next, 'finalize')
  await assert.rejects(recordStage(settings, 'learner', 4, 'implement', completion), /delivery/)
})

test('document versions track author, rationale and immutable references independently', async (t) => {
  const { settings, plan } = await fixture(t)
  let { directory, state } = await context(settings, 'learner', 4)
  assert.equal(state.documentHistory.TASK.at(-1).version, 2)
  assert.equal(state.documentHistory.PLAN.at(-1).version, 1)
  const original = state.documentHistory.PLAN[0]
  const originalBytes = await readFile(path.join(directory, original.artifact), 'utf8')
  const first = JSON.parse(originalBytes)
  assert.equal(first.metadata.author, 'learner')
  assert.equal(first.metadata.references.task.version, 2)
  assert.equal(first.metadata.references.source, state.snapshot)
  assert.equal(first.metadata.references.requirementRevision, 1)
  assert.match(first.metadata.updatedAt, /Z$/)
  const before = await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8')
  await saveSnapshot(settings, 'learner', source)
  assert.equal(await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8'), before)
  await runCheck(settings, 'learner', 4, 'HELP')
  assert.equal((await context(settings, 'learner', 4)).state.documentHistory.PLAN.length, 1)
  await recordStage(settings, 'learner', 4, 'finalize', {
    ...plan,
    metadata: { author: 'forged', version: 999 },
  })
  assert.equal((await context(settings, 'learner', 4)).state.documentHistory.PLAN.length, 1)
  await recordStage(settings, 'learner', 4, 'finalize', {
    ...plan,
    documents: { 'plan.md': 'Revised acceptance and delivery.' },
    change: { summary: 'Add delivery acceptance', reason: 'Cover target readiness' },
    metadata: { author: 'forged', version: 999 },
  })
  ;({ directory, state } = await context(settings, 'learner', 4))
  const latest = JSON.parse(await readFile(path.join(directory, state.stages.finalize.artifact)))
  assert.equal(latest.metadata.version, 2)
  assert.equal(latest.metadata.author, 'learner')
  assert.equal(state.approval, undefined)
  assert.equal(await readFile(path.join(directory, original.artifact), 'utf8'), originalBytes)
  const view = await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8')
  assert.match(view, /document_version: 2/)
  assert.match(view, /Cover target readiness/)
  assert.ok(view.includes(original.artifact))
  assert.match(view, /pending \/ stale/)
})

test('document stage refuses missing rationale and legacy author is never invented', async (t) => {
  const { settings, plan } = await fixture(t)
  const missing = { ...plan }
  delete missing.change
  await assert.rejects(recordStage(settings, 'learner', 4, 'finalize', missing), /change.summary/)
  const { directory, state } = await context(settings, 'learner', 4)
  const { persistStage } = await import('../../scripts/workflow/stages.mjs')
  await persistStage(directory, state, 'finalize', {
    ...plan,
    documents: { 'plan.md': 'Imported historical plan with unknown author' },
  })
  const record = JSON.parse(await readFile(path.join(directory, state.stages.finalize.artifact)))
  assert.equal(record.metadata.author, null)
  assert.match(
    await readFile(path.join(path.dirname(directory), 'PLAN.md'), 'utf8'),
    /author: "không được ghi nhận"/,
  )
})
