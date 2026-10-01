import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { git } from '../lib/git.mjs'
import { workspace, installHooks, kitRoot, change, config } from './helpers.mjs'

// Install the kit into a repo that has no package.json, the way a Java project would use it.
async function installed(t) {
  const settings = await workspace(t, 'pom.xml')
  const agents = path.join(settings.repoRoot, '.agents')
  await mkdir(path.join(agents, 'workflow'), { recursive: true })
  await cp(path.join(kitRoot, '.agents/workflow/lib'), path.join(agents, 'workflow/lib'), {
    recursive: true,
  })
  await cp(path.join(kitRoot, '.agents/workflow/task.mjs'), path.join(agents, 'workflow/task.mjs'))
  await installHooks(settings.repoRoot)
  await cp(path.join(kitRoot, '.agents/skills'), path.join(agents, 'skills'), { recursive: true })
  await writeFile(
    path.join(agents, 'workflow.config.json'),
    JSON.stringify({ schemaVersion: 3, ...config() }),
  )
  await writeFile(path.join(agents, 'workflow.local.example.json'), '{ "docsRepo": "" }\n')
  await writeFile(
    path.join(settings.repoRoot, '.gitignore'),
    '.agents/workflow.local.json\n.workflow-tmp/\n.claude/skills/task-*\n',
  )
  git(settings.repoRoot, ['add', '.'])
  git(settings.repoRoot, ['commit', '-m', 'chore: add workflow kit'])
  git(settings.repoRoot, ['push', 'origin', 'main'])
  await mkdir(path.join(settings.repoRoot, '.workflow-tmp'))
  const run = (...args) => {
    const result = spawnSync(process.execPath, ['.agents/workflow/task.mjs', ...args], {
      cwd: settings.repoRoot,
      encoding: 'utf8',
    })
    return {
      status: result.status,
      stderr: result.stderr,
      json: result.status === 0 || result.stdout.trim() ? JSON.parse(result.stdout) : null,
    }
  }
  const tmp = async (name, content) => {
    const file = path.join('.workflow-tmp', name)
    await writeFile(
      path.join(settings.repoRoot, file),
      typeof content === 'string' ? content : JSON.stringify(content),
    )
    return file
  }
  return { settings, run, tmp }
}

test('CLI needs only node: setup, doctor, sync from chat, record and status', async (t) => {
  const { settings, run, tmp } = await installed(t)
  const missing = run('doctor')
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /^Task: .*setup/)
  const setup = run('setup')
  assert.equal(setup.json.local, 'created')
  assert.equal(setup.json.hooks.git, 'enabled-local')
  assert.deepEqual(setup.json.hooks.runtimes, ['codex', 'claude'])
  assert.equal(setup.json.hooks.claudeSkills.linked.length, 6)
  assert.match(run('doctor').stderr, /docsRepo/)
  await writeFile(
    path.join(settings.repoRoot, '.agents/workflow.local.json'),
    JSON.stringify({ docsRepo: settings.docsRepo }),
  )
  const doctor = run('doctor')
  assert.equal(doctor.status, 0, doctor.stderr)
  assert.equal(doctor.json.author, settings.author)
  assert.equal(doctor.json.documents.localWrite, true)
  assert.equal(doctor.json.docsRepo.git, false)
  assert.equal(doctor.json.baseRef, 'present')
  assert.equal(doctor.json.claudeSkills['task-sync'], 'linked')
  // Without the ignore rule the per-machine links would count as worktree changes.
  const ignoreFile = path.join(settings.repoRoot, '.gitignore')
  await writeFile(ignoreFile, '.agents/workflow.local.json\n.workflow-tmp/\n')
  assert.match(run('doctor').stderr, /^Task: Thêm \.claude\/skills\/task-\*/)
  await writeFile(ignoreFile, '.agents/workflow.local.json\n.workflow-tmp/\n.claude/skills/task-*\n')
  assert.equal(doctor.json.target.baseBranch, 'main')
  assert.deepEqual(run('list').json.tickets, [])

  git(settings.docsRepo, ['init', '-b', 'main'])
  const chat = await tmp('request.md', 'Cho phép tìm ghi chú theo nội dung.\n')
  assert.equal(run('sync', '--slug', 'note-search', '--chat', chat).status, 1)
  const created = run('sync', '--title', 'Tìm kiếm ghi chú', '--slug', 'note-search', '--chat', chat)
  assert.equal(created.status, 0, created.stderr)
  const ticket = created.json.ticket
  assert.match(ticket, /^\d{6}-\d{4}-note-search$/)
  assert.equal(created.json.changed, true)
  assert.equal(created.json.docsMissing, true)
  assert.deepEqual(created.json.sourceIds, ['r1/chat.md'])
  assert.deepEqual(created.json.docsRepo, {
    git: true,
    uncommitted: true,
    note: 'Commit và push repo hồ sơ để chia sẻ thay đổi với team.',
  })
  assert.equal(created.json.target.ticket, ticket)
  const key = ticket.slice(0, 11)
  assert.equal(run('status', key).json.next, 'sync')
  assert.equal(run('sync', key).json.changed, false)
  assert.match(run('sync', key, '--title', 'Other').stderr, /không đổi title/)

  const intake = await tmp('input.json', {
    revision: 1,
    change,
    translatedSourceIds: ['r1/chat.md'],
    documents: { 'task.md': 'Tóm tắt yêu cầu tìm kiếm.' },
  })
  const recorded = run('record', key, 'intake', intake)
  assert.equal(recorded.status, 0, recorded.stderr)
  assert.equal(recorded.json.status, 'complete')
  const status = run('next', ticket)
  assert.equal(status.json.next, 'analysis')
  assert.equal(status.json.title, 'Tìm kiếm ghi chú')
  assert.equal(status.json.docsMissing, false)
  const listed = run('list').json.tickets
  assert.equal(listed.length, 1)
  assert.equal(listed[0].stages.intake, 'complete')
  // Helper input never dirties the source repo.
  assert.equal(git(settings.repoRoot, ['status', '--porcelain']), '')

  for (const command of ['can-implement', 'start']) {
    const blocked = run(command, key)
    assert.equal(blocked.status, 1)
    assert.match(blocked.stderr, /^Task: Stage finalize/)
  }
  assert.equal(git(settings.repoRoot, ['branch', '--show-current']), 'main')
})
test('CLI carries a ticket from a file source through to a verified handoff', async (t) => {
  const { settings, run, tmp } = await installed(t)
  await writeFile(
    path.join(settings.repoRoot, '.agents/workflow.local.json'),
    JSON.stringify({ docsRepo: settings.docsRepo }),
  )
  const spec = path.join(settings.root, 'Đặc tả tìm kiếm.md')
  await writeFile(spec, '# Tìm kiếm\n\nTìm ghi chú theo nội dung.\n')
  const created = run('sync', '--key', 'PRJ-7', '--title', 'Tìm ghi chú', '--slug', 'note-search', '--file', spec)
  assert.equal(created.json.ticket, 'PRJ-7-note-search')
  const ticket = 'PRJ-7'
  const record = async (stage, body) => {
    const result = run('record', ticket, stage, await tmp(`${stage}.json`, { revision: 1, change, ...body }))
    assert.equal(result.status, 0, `${stage}: ${result.stderr}`)
    return result.json
  }
  await record('intake', {
    translatedSourceIds: ['r1/Đặc tả tìm kiếm.md'],
    documents: { 'task.md': 'Tìm ghi chú theo nội dung.' },
  })
  await record('analysis', {
    documents: { 'task.md': 'Dịch vụ tìm kiếm nằm trong Search.java.' },
    observations: [
      { id: 'location', status: 'observed', description: 'Search class', evidence: 'Read file' },
    ],
  })
  await record('finalize', {
    documents: { 'plan.md': 'Thêm Search.java và kiểm tra.' },
    decision: { optionId: 'simple', rationale: 'Smallest change' },
    files: ['Search.java'],
    risks: [],
    requiredFacts: ['location'],
    delivery: {
      kind: 'artifact',
      target: 'Search.java',
      preparation: 'Không cần',
      permissions: 'Sửa file local',
      recovery: 'Git restore',
      checks: ['UNIT'],
    },
    requiredChecks: [
      {
        id: 'UNIT',
        target: 'Search.java',
        kind: 'unit',
        ac: ['AC1'],
        command: ['node', '-e', 'require("node:fs").accessSync("Search.java")'],
        timeoutSeconds: 60,
      },
    ],
    steps: [{ id: 'search', goal: 'Tìm theo nội dung', dependsOn: [], checks: ['UNIT'] }],
  })
  assert.equal(run('status', ticket).json.next, 'approve')
  await record('approve', { decision: 'approved', approvedBy: 'Developer', evidence: 'Duyệt plan v1' })
  const started = run('start', ticket)
  assert.equal(started.status, 0, started.stderr)
  assert.equal(started.json.branch, 'feature/PRJ-7-note-search')
  assert.equal(git(settings.repoRoot, ['branch', '--show-current']), 'feature/PRJ-7-note-search')
  const failing = run('check', ticket, 'UNIT')
  assert.equal(failing.status, 1)
  assert.equal(failing.json.result, 'fail')
  await writeFile(path.join(settings.repoRoot, 'Search.java'), 'class Search {}\n')
  git(settings.repoRoot, ['add', 'Search.java'])
  git(settings.repoRoot, ['commit', '-m', 'feat(search): tìm ghi chú theo nội dung'])
  assert.equal(run('check', ticket, 'UNIT').json.result, 'pass')
  assert.equal(run('status', ticket).json.next, 'implement')
  assert.equal((await record('implement', { documents: { 'checks.md': 'UNIT pass.' } })).status, 'verified')
  await record('review', { documents: { 'checks.md': 'Đã đọc diff.' }, verdict: 'pass', findings: [] })
  assert.equal(run('status', ticket).json.next, 'handoff')
  // Resuming from the base branch switches back to the existing feature branch.
  git(settings.repoRoot, ['switch', 'main'])
  assert.equal(run('start', ticket).json.branch, 'feature/PRJ-7-note-search')
  const mr = await tmp('mr.json', {
    revision: 1,
    title: 'feat(search): tìm ghi chú theo nội dung',
    body: 'Thêm tìm kiếm theo nội dung. Refs PRJ-7.',
  })
  const prepared = run('prepare', ticket, mr)
  assert.equal(prepared.status, 0, prepared.stderr)
  assert.equal(prepared.json.pushCommand, 'git push -u origin feature/PRJ-7-note-search')
  const early = run('handoff', ticket)
  assert.equal(early.status, 1)
  assert.match(early.stderr, /chưa trùng HEAD/)
  // The developer pushes by hand; the installed pre-push hook allows the feature branch.
  const hooks = run('setup')
  assert.equal(hooks.json.hooks.git, 'enabled-local')
  git(settings.repoRoot, ['push', '-u', 'origin', 'feature/PRJ-7-note-search'])
  const done = run('handoff', ticket, 'https://git.example/team/app/-/merge_requests/7')
  assert.equal(done.status, 0, done.stderr)
  assert.equal(done.json.readiness, 'handed-off-awaiting-leader')
  assert.equal(run('status', ticket).json.next, 'handed-off')
  assert.equal(git(settings.repoRoot, ['status', '--porcelain']), '')
})
test('CLI rejects unknown commands, wrong arity and unknown tickets without leaking details', async (t) => {
  const { settings, run } = await installed(t)
  await writeFile(
    path.join(settings.repoRoot, '.agents/workflow.local.json'),
    JSON.stringify({ docsRepo: settings.docsRepo }),
  )
  for (const args of [
    [],
    ['publish', 'T-1'],
    ['status'],
    ['record', 'T-1', 'intake'],
    ['check', 'T-1'],
    ['status', 'T-1', '--force'],
    ['sync', '--unknown', 'x'],
    ['sync', '--title'],
  ]) {
    const result = run(...args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /^Task: Dùng: node \.agents\/workflow\/task\.mjs/)
  }
  const unknown = run('status', 'T-404')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /^Task: Không tìm thấy hồ sơ ticket/)
  assert.ok(!unknown.stderr.includes(settings.docsRepo))
  assert.match(run('status', '../escape').stderr, /^Task: Thành phần đường dẫn/)
})
test('CLI accepts records inside the source repo once ignored, and says they are not shared', async (t) => {
  const { settings, run, tmp } = await installed(t)
  const local = path.join(settings.repoRoot, '.agents/workflow.local.json')
  await writeFile(local, JSON.stringify({ docsRepo: settings.repoRoot }))
  assert.match(run('doctor').stderr, /^Task: Thư mục hồ sơ nằm trong repo source/)
  await writeFile(
    path.join(settings.repoRoot, '.gitignore'),
    '.agents/workflow.local.json\n.workflow-tmp/\ndocs/tickets/\n',
  )
  git(settings.repoRoot, ['commit', '-am', 'chore: ignore ticket records'])
  const doctor = run('doctor')
  assert.equal(doctor.status, 0, doctor.stderr)
  assert.equal(doctor.json.docsRepo.ignored, true)
  const chat = await tmp('request.md', 'Yêu cầu thử.\n')
  const created = run('sync', '--key', 'T-9', '--title', 'Thử', '--slug', 'inside-repo', '--chat', chat)
  assert.equal(created.status, 0, created.stderr)
  assert.equal(created.json.docsRepo.ignored, true)
  assert.ok(created.json.directory.startsWith(settings.repoRoot))
  assert.equal(git(settings.repoRoot, ['status', '--porcelain', '--untracked-files=all']), '')
})
