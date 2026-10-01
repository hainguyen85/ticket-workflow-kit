import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { saveSnapshot } from '../../scripts/workflow/vault.mjs'
import {
  recordStage,
  intakeStatus,
  context,
  requireApproval,
  releaseGate,
} from '../../scripts/workflow/stages.mjs'
import { prepareRelease, publishRelease, validatePRText } from '../../scripts/workflow/release.mjs'
import { git } from '../../scripts/workflow/git.mjs'
import { runCheck } from '../../scripts/workflow/verification.mjs'
import { hasSecret, inspectHook, checkMetadata } from '../../scripts/workflow/policy.mjs'
import { credentialResponse } from '../../scripts/workflow/credential.mjs'
import { setupHooks } from '../../scripts/workflow/setup-hooks.mjs'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const token = 'ghp_' + 'z'.repeat(36)
const config = {
  github: {
    repository: 'example/workshop',
    baseBranch: 'main',
    pushUrl: 'https://github.com/example/workshop.git',
  },
  release: { allowMerge: false, allowForcePush: false, protectedBranches: ['main'] },
}
const source = () => ({
  repository: 'example/workshop',
  number: 1,
  title: 'Search',
  body: 'Find articles',
  comments: [],
  labels: [],
  assignees: [],
  state: 'open',
  updatedAt: 't1',
  project: { status: 'Backlog' },
})
const input = (action, revision = 1) => ({
  revision,
  change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
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
            command: ['node', '-e', 'process.exit(0)'],
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'workshop-stages-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repoRoot = path.join(root, 'repo'),
    docsRoot = path.join(root, 'docs')
  await mkdir(repoRoot)
  await mkdir(docsRoot)
  git(repoRoot, ['init', '-b', 'main'])
  git(repoRoot, ['config', 'user.name', 'Workshop Tester'])
  git(repoRoot, ['config', 'user.email', 'tester@example.test'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repoRoot, 'feature.txt'), 'baseline\n')
  git(repoRoot, ['add', 'feature.txt'])
  git(repoRoot, ['commit', '-m', 'chore: initialize fixture'])
  const base = git(repoRoot, ['rev-parse', 'HEAD'])
  git(repoRoot, ['switch', '--no-track', '-c', 'feature/learner/issue-1-search'])
  await writeFile(path.join(repoRoot, 'feature.txt'), 'improved search\n')
  git(repoRoot, ['add', 'feature.txt'])
  git(repoRoot, ['commit', '-m', 'feat: improve search'])
  const settings = { root, repoRoot, docsRoot, config, token, base }
  await saveSnapshot(settings, 'learner', source())
  await recordStage(settings, 'learner', 1, 'intake', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    translatedSourceIds: ['issue:1'],
    documents: { 'task.md': 'Test intake document.' },
  })
  return settings
}
async function throughReview(settings) {
  for (const action of ['analysis', 'finalize', 'approve', 'implement', 'review']) {
    if (action === 'implement') await runCheck(settings, 'learner', 1, 'CHECK')
    await recordStage(settings, 'learner', 1, action, input(action))
  }
}
const prInput = {
  revision: 1,
  title: 'feat(search): improve results',
  body: 'Improve matching. Verified in tests. Refs #1.',
}
function wireMock(settings) {
  const heads = { main: settings.base }
  let pushes = 0
  return {
    heads,
    get pushes() {
      return pushes
    },
    fetchBase() {
      git(settings.repoRoot, ['update-ref', 'refs/remotes/workshop/main', settings.base])
    },
    remoteHead(branch) {
      return heads[branch] ?? null
    },
    push(branch) {
      pushes++
      heads[branch] = git(settings.repoRoot, ['rev-parse', 'HEAD'])
    },
  }
}
function prMock(settings, branch) {
  return {
    number: 2,
    node_id: 'PR_test',
    html_url: 'https://github.com/example/workshop/pull/2',
    title: prInput.title,
    body: prInput.body,
    state: 'open',
    draft: false,
    auto_merge: null,
    base: { ref: 'main', repo: { full_name: 'example/workshop' } },
    head: {
      ref: branch,
      sha: git(settings.repoRoot, ['rev-parse', 'HEAD']),
      repo: { full_name: 'example/workshop' },
    },
  }
}

test('stage gates require selected spec and approval; artifacts cannot be silently edited', async (t) => {
  const settings = await fixture(t)
  await assert.rejects(
    recordStage(settings, 'learner', 1, 'finalize', input('finalize')),
    /analysis/,
  )
  await recordStage(settings, 'learner', 1, 'analysis', input('analysis'))
  await recordStage(settings, 'learner', 1, 'finalize', input('finalize'))
  await assert.rejects(
    recordStage(settings, 'learner', 1, 'implement', input('implement')),
    /approval/,
  )
  await recordStage(settings, 'learner', 1, 'approve', input('approve'))
  let { directory, state } = await context(settings, 'learner', 1)
  await requireApproval(directory, state)
  const spec = path.join(directory, path.dirname(state.stages.finalize.artifact), 'plan.md')
  await writeFile(spec, 'changed after approval')
  await assert.rejects(requireApproval(directory, state), /Tài liệu đã đổi/)
})
test('security risk and secret-bearing artifact are rejected before persisting', async (t) => {
  const settings = await fixture(t)
  await recordStage(settings, 'learner', 1, 'analysis', input('analysis'))
  const unsafe = input('finalize')
  unsafe.risks[0].resolution = 'accepted'
  await assert.rejects(recordStage(settings, 'learner', 1, 'finalize', unsafe), /risk/)
  const secret = input('analysis')
  secret.documents['task.md'] = token
  await assert.rejects(recordStage(settings, 'learner', 1, 'analysis', secret), /secret/)
})
test('checkpoint records unfinished work without marking implement complete', async (t) => {
  const settings = await fixture(t)
  for (const action of ['analysis', 'finalize', 'approve'])
    await recordStage(settings, 'learner', 1, action, input(action))
  await writeFile(path.join(settings.repoRoot, 'feature.txt'), 'work in progress\n')
  const result = await recordStage(settings, 'learner', 1, 'checkpoint', {
    change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
    revision: 1,
    documents: { 'checks.md': 'First slice done; tests not run yet.' },
  })
  assert.equal(result.status, 'in-progress')
  assert.equal(result.code.worktree, 'dirty')
  const { directory, state } = await context(settings, 'learner', 1)
  assert.equal(state.workflowEvents.at(-1).action, 'checkpoint')
  assert.match(await readFile(path.join(directory, 'changelog.md'), 'utf8'), /checkpoint/)
})
test('CR invalidates approval; board-only changes preserve decisions', async (t) => {
  const settings = await fixture(t)
  await throughReview(settings)
  const timelineOnly = source()
  timelineOnly.updatedAt = 'after-pr-reference'
  assert.equal((await saveSnapshot(settings, 'learner', timelineOnly)).changed, false)
  const moved = source()
  moved.project.status = 'Review'
  await saveSnapshot(settings, 'learner', moved)
  let { directory, state } = await context(settings, 'learner', 1)
  await requireApproval(directory, state)
  assert.equal((await releaseGate(settings, 'learner', 1)).state.revision, 2)
  moved.comments.push({ id: 1, body: 'Include descendants', author: 'developer' })
  await saveSnapshot(settings, 'learner', moved)
  ;({ directory, state } = await context(settings, 'learner', 1))
  await assert.rejects(requireApproval(directory, state), /finalize/)
  await assert.rejects(
    recordStage(settings, 'learner', 1, 'analysis', input('analysis', 2)),
    /revision/,
  )
})
test('review and release refuse dirty or changed code; failed tests cannot become review pass', async (t) => {
  const settings = await fixture(t)
  await throughReview(settings)
  const invalidReview = input('review')
  invalidReview.tests[0].result = 'not-run'
  await assert.rejects(
    recordStage(settings, 'learner', 1, 'review', invalidReview),
    /Review chưa pass/,
  )
  await writeFile(path.join(settings.repoRoot, 'feature.txt'), 'new code\n')
  await assert.rejects(releaseGate(settings, 'learner', 1), /Working tree|evidence đã cũ/)
  git(settings.repoRoot, ['add', 'feature.txt'])
  git(settings.repoRoot, ['commit', '-m', 'fix: adjust matching'])
  await assert.rejects(releaseGate(settings, 'learner', 1), /Review không khớp|evidence đã cũ/)
})
test('release blocks out-of-plan files and base drift', async (t) => {
  const settings = await fixture(t)
  await writeFile(path.join(settings.repoRoot, 'extra.txt'), 'unplanned\n')
  git(settings.repoRoot, ['add', 'extra.txt'])
  git(settings.repoRoot, ['commit', '-m', 'feat: extra change'])
  await throughReview(settings)
  const wire = wireMock(settings)
  await assert.rejects(prepareRelease(settings, 'learner', 1, prInput, wire), /ngoài plan/)
})
test('push success and PR failure persist partial state; retry finds existing PR without another push', async (t) => {
  const settings = await fixture(t)
  await throughReview(settings)
  const wire = wireMock(settings)
  const prepared = await prepareRelease(settings, 'learner', 1, prInput, wire)
  let remotePR = null,
    creates = 0
  const client = {
    async attachPR() {
      return { id: 'PR_ITEM', status: 'PR ready' }
    },
    async findPR() {
      return remotePR
    },
    async createPR(branch) {
      creates++
      remotePR = prMock(settings, branch)
      throw Error('response lost after remote creation')
    },
  }
  await assert.rejects(publishRelease(settings, 'learner', 1, client, wire))
  assert.equal((await context(settings, 'learner', 1)).state.stages.release.status, 'partial')
  assert.equal(wire.pushes, 1)
  const result = await publishRelease(settings, 'learner', 1, client, wire)
  assert.equal(result.readiness, 'pr-ready-awaiting-leader')
  assert.equal(result.merged, false)
  assert.equal(creates, 1)
  assert.equal(wire.pushes, 1)
  assert.equal(wire.heads.main, prepared.base)
  wire.heads.main = '0'.repeat(40)
  await assert.rejects(publishRelease(settings, 'learner', 1, client, wire), /Base remote đã đổi/)
})
test('metadata and auto-close clauses are rejected before PR publication', () => {
  for (const value of ['feature/Codex/task', 'Generated by AI', 'Co-authored-by: helper', token])
    assert.throws(() => checkMetadata(value))
  assert.throws(() => validatePRText({ title: 'feat: search', body: 'Fixes #1' }), /tự đóng/)
  validatePRText(prInput)
})
test('scanner permits known documented placeholders but blocks token-like values', () => {
  assert.equal(hasSecret("const apiKey = 'your-api-key'"), false)
  assert.equal(hasSecret(token), true)
  assert.equal(hasSecret('GH_TOKEN=' + 'a'.repeat(30)), true)
})
test('credential helper only responds to the configured HTTPS repository and never stores', () => {
  const settings = { config, token }
  const valid = 'protocol=https\nhost=github.com\npath=example/workshop.git\n\n'
  assert.ok(credentialResponse(settings, valid, 'get').includes(token))
  for (const invalid of [
    valid.replace('https', 'http'),
    valid.replace('github.com', 'evil.example'),
    valid.replace('workshop.git', 'another.git'),
    valid.replace('path=example/workshop.git\n', ''),
  ])
    assert.equal(credentialResponse(settings, invalid, 'get'), '')
  assert.equal(credentialResponse(settings, valid, 'store'), '')
})
test('runtime hook blocks secret prompts/tools and permits ordinary helper commands without echo', () => {
  const events = [
    { hook_event_name: 'UserPromptSubmit', prompt: `My key is ${token}` },
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'cat .agents/.env.workflow.local' },
    },
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/home/user/.ssh/id_ed25519' },
    },
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin HEAD:main' },
    },
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git -c core.hooksPath=/dev/null push' },
    },
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/workflow/credential.mjs get' },
    },
  ]
  for (const event of events) {
    assert.ok(inspectHook(event))
    const run = spawnSync(
      process.execPath,
      [path.join(projectRoot, 'scripts/workflow/agent-hook.mjs')],
      { input: JSON.stringify(event), encoding: 'utf8' },
    )
    assert.equal(run.status, 2)
    assert.ok(!`${run.stdout}${run.stderr}`.includes(token))
  }
  assert.equal(
    inspectHook({
      hook_event_name: 'PreToolUse',
      tool_input: { command: 'node scripts/workflow.mjs check' },
    }),
    null,
  )
  assert.equal(
    inspectHook({ hook_event_name: 'UserPromptSubmit', prompt: 'Phân tích issue 1' }),
    null,
  )
})
test('packaged runtime hook launcher resolves repo root from a subdirectory', async () => {
  const hooks = JSON.parse(await readFile(path.join(projectRoot, '.codex/hooks.json'), 'utf8'))
  const command = hooks.hooks.UserPromptSubmit[0].hooks[0].command
  const run = spawnSync(command, {
    cwd: path.join(projectRoot, 'src'),
    shell: true,
    encoding: 'utf8',
    timeout: 10000,
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: token }),
  })
  assert.equal(run.status, 2)
  assert.equal(JSON.parse(run.stdout).decision, 'block')
  assert.ok(!`${run.stdout}${run.stderr}`.includes(token))
})
test('real Git hooks reject main push and staged secret; allow feature push to a local bare remote', async (t) => {
  const settings = await fixture(t)
  await cp(
    path.join(projectRoot, 'scripts/workflow'),
    path.join(settings.repoRoot, 'scripts/workflow'),
    { recursive: true },
  )
  await cp(path.join(projectRoot, '.githooks'), path.join(settings.repoRoot, '.githooks'), {
    recursive: true,
  })
  await cp(path.join(projectRoot, '.codex'), path.join(settings.repoRoot, '.codex'), {
    recursive: true,
  })
  await writeFile(path.join(settings.repoRoot, 'workshop.config.json'), JSON.stringify(config))
  const remote = path.join(settings.root, 'remote.git')
  git(settings.root, ['init', '--bare', remote])
  git(settings.repoRoot, ['remote', 'add', 'origin', remote])
  git(settings.repoRoot, ['push', 'origin', 'main:main']) // establish baseline before enabling guards
  const before = git(remote, ['rev-parse', 'main'])
  await setupHooks(settings.repoRoot)
  const pushMain = spawnSync('git', ['push', 'origin', 'HEAD:main'], {
    cwd: settings.repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(pushMain.status, 0)
  assert.equal(git(remote, ['rev-parse', 'main']), before)
  git(settings.repoRoot, ['push', 'origin', 'HEAD:refs/heads/feature/learner/issue-1-search'])
  assert.equal(
    git(remote, ['rev-parse', 'refs/heads/feature/learner/issue-1-search']),
    git(settings.repoRoot, ['rev-parse', 'HEAD']),
  )
  const featureHead = git(remote, ['rev-parse', 'refs/heads/feature/learner/issue-1-search'])
  for (const refspec of [
    `${before}:refs/heads/feature/learner/issue-1-search`,
    ':refs/heads/feature/learner/issue-1-search',
  ]) {
    const rejected = spawnSync('git', ['push', '--force', 'origin', refspec], {
      cwd: settings.repoRoot,
      encoding: 'utf8',
    })
    assert.notEqual(rejected.status, 0)
    assert.equal(
      git(remote, ['rev-parse', 'refs/heads/feature/learner/issue-1-search']),
      featureHead,
    )
  }
  await writeFile(path.join(settings.repoRoot, 'leak.txt'), token)
  git(settings.repoRoot, ['add', 'leak.txt'])
  const oldHead = git(settings.repoRoot, ['rev-parse', 'HEAD'])
  const commit = spawnSync('git', ['commit', '-m', 'feat: test guard'], {
    cwd: settings.repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(commit.status, 0)
  assert.equal(git(settings.repoRoot, ['rev-parse', 'HEAD']), oldHead)
  assert.ok(!`${commit.stdout}${commit.stderr}`.includes(token))
})
test('setup does not replace existing custom hooksPath', async (t) => {
  const settings = await fixture(t)
  git(settings.repoRoot, ['config', 'core.hooksPath', '.custom-hooks'])
  await assert.rejects(setupHooks(settings.repoRoot), /hooksPath khác/)
  assert.equal(git(settings.repoRoot, ['config', '--get', 'core.hooksPath']), '.custom-hooks')
})

test('intake coverage, missing-doc recovery and new-source gate', async (t) => {
  const settings = await fixture(t)
  assert.equal((await intakeStatus(settings, 'learner', 1)).docsMissing, false)
  const changed = source()
  changed.comments = [
    { id: 22, body: 'Include descendants', author: 'requester', createdAt: 't2', updatedAt: 't2' },
  ]
  await saveSnapshot(settings, 'learner', changed)
  assert.equal((await intakeStatus(settings, 'learner', 1)).docsMissing, true)
  await assert.rejects(
    recordStage(settings, 'learner', 1, 'analysis', input('analysis', 2)),
    /intake/,
  )
  const intake = {
    change: { summary: 'Update test stage', reason: 'New source revision' },
    revision: 2,
    translatedSourceIds: ['issue:1'],
    documents: Object.fromEntries(
      ['task.md'].map((name) => [name, 'Synthetic translated source and delta.']),
    ),
  }
  await assert.rejects(recordStage(settings, 'learner', 1, 'intake', intake), /translatedSourceIds/)
  intake.translatedSourceIds.push('comment:22')
  await recordStage(settings, 'learner', 1, 'intake', intake)
  const { directory, state } = await context(settings, 'learner', 1)
  await rm(path.join(directory, path.dirname(state.stages.intake.artifact), 'task.md'))
  assert.equal((await intakeStatus(settings, 'learner', 1)).docsMissing, true)
  await recordStage(settings, 'learner', 1, 'intake', intake)
  assert.equal((await intakeStatus(settings, 'learner', 1)).docsMissing, false)
  await recordStage(settings, 'learner', 1, 'analysis', input('analysis', 2))
})

test('prepare creates idempotent local release ref at reviewed SHA and refuses existing divergent ref', async (t) => {
  const settings = await fixture(t)
  await throughReview(settings)
  const wire = wireMock(settings)
  const input = { ...prInput, releaseBranch: 'release/issue-1-search' }
  const result = await prepareRelease(settings, 'learner', 1, input, wire)
  assert.equal(
    result.releaseBranch.head,
    git(settings.repoRoot, ['rev-parse', input.releaseBranch]),
  )
  assert.equal(result.releaseBranch.published, false)
  await prepareRelease(settings, 'learner', 1, input, wire)
  git(settings.repoRoot, ['branch', 'release/issue-1-other', settings.base])
  await assert.rejects(
    prepareRelease(
      settings,
      'learner',
      1,
      { ...input, releaseBranch: 'release/issue-1-other' },
      wire,
    ),
    /SHA khác/,
  )
  assert.equal(wire.pushes, 0)
})

test('board-only sync keeps prepared release valid without weakening requirement-change gates', async (t) => {
  const settings = await fixture(t)
  await throughReview(settings)
  const wire = wireMock(settings)
  await prepareRelease(settings, 'learner', 1, prInput, wire)
  await saveSnapshot(settings, 'learner', { ...source(), project: { status: 'Review' } })
  const branch = git(settings.repoRoot, ['branch', '--show-current'])
  const client = {
    findPR: async () => null,
    createPR: async () => prMock(settings, branch),
    attachPR: async () => ({ id: 'PR_ITEM', status: 'PR ready' }),
  }
  const result = await publishRelease(settings, 'learner', 1, client, wire)
  assert.equal(result.readiness, 'pr-ready-awaiting-leader')
})

test('Project failure preserves created PR and retry completes without duplicate PR or push', async (t) => {
  const settings = await fixture(t)
  await throughReview(settings)
  const wire = wireMock(settings)
  await prepareRelease(settings, 'learner', 1, prInput, wire)
  let remotePR = null,
    creates = 0,
    attempts = 0
  const client = {
    findPR: async () => remotePR,
    createPR: async (branch) => {
      creates++
      return (remotePR = prMock(settings, branch))
    },
    attachPR: async (pr) => {
      assert.equal(pr.node_id, 'PR_test')
      if (++attempts === 1) throw Error('Project temporarily unavailable')
      return { id: 'PR_ITEM', status: 'PR ready' }
    },
  }
  await assert.rejects(publishRelease(settings, 'learner', 1, client, wire))
  const { state } = await context(settings, 'learner', 1)
  assert.equal(state.stages.release.status, 'partial')
  const result = await publishRelease(settings, 'learner', 1, client, wire)
  assert.equal(result.projectItem.id, 'PR_ITEM')
  assert.equal(wire.pushes, 1)
  assert.equal(creates, 1)
})
