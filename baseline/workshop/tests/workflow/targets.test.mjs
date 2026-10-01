import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadConfig,
  resolveIssue,
  publicTarget,
  projectFromUrl,
} from '../../scripts/workflow/config.mjs'
import { verifyCheckout, repositoryFromRemote } from '../../scripts/workflow/target.mjs'
import { githubClient } from '../../scripts/workflow/github.mjs'
import { git } from '../../scripts/workflow/git.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const secret = ['test', 'credential', 'only'].join('-')
async function fixture(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'workflow targets '))
  t.after(() => rm(home, { recursive: true, force: true }))
  const repo = path.join(home, 'repo'),
    docs = path.join(home, 'docs')
  await mkdir(path.join(repo, '.agents'), { recursive: true })
  await mkdir(docs)
  await cp(path.join(root, 'scripts'), path.join(repo, 'scripts'), { recursive: true })
  await cp(path.join(root, 'workshop.config.json'), path.join(repo, 'workshop.config.json'))
  git(repo, ['init', '-b', 'main'])
  git(repo, ['remote', 'add', 'origin', 'https://github.com/company/site.git'])
  const values = {
    GH_TOKEN: secret,
    WORKSHOP_DOCS_ROOT: docs,
    GH_REPO: 'company/site',
    GH_ISSUE: '7',
    GH_PROJECT_URL: 'https://github.com/orgs/company/projects/2',
    GH_BASE_BRANCH: 'main',
  }
  async function env(patch = {}) {
    await writeFile(
      path.join(repo, '.agents/.env.workflow.local'),
      Object.entries({ ...values, ...patch })
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}="${value}"`)
        .join('\n') + '\n',
    )
  }
  await env()
  return { repo, docs, env }
}
test('env is the only target source; stale JSON/ambient bindings cannot choose another project', async (t) => {
  const f = await fixture(t)
  const policy = JSON.parse(await readFile(path.join(f.repo, 'workshop.config.json'), 'utf8'))
  policy.github.repository = 'stale/repo'
  policy.github.referenceIssue = 999
  policy.github.project = { owner: 'stale', number: 999, nodeId: 'STALE' }
  await writeFile(path.join(f.repo, 'workshop.config.json'), JSON.stringify(policy))
  const previous = process.env.GH_REPO
  process.env.GH_REPO = 'ambient/repo'
  try {
    const s = await loadConfig(f.repo)
    assert.deepEqual(publicTarget(s), {
      repository: 'company/site',
      issue: 7,
      baseBranch: 'main',
      project: { owner: 'company', number: 2, url: 'https://github.com/orgs/company/projects/2' },
    })
    assert.equal(s.config.github.project.nodeId, undefined)
    assert.equal(resolveIssue(s), 7)
    assert.equal(resolveIssue(s, '7'), 7)
    assert.equal(resolveIssue(s, '8'), 8)
    assert.ok(!JSON.stringify(publicTarget(s)).includes(secret))
    verifyCheckout(s)
    await f.env({
      GH_REPO: 'other/app',
      GH_ISSUE: '12',
      GH_PROJECT_URL: 'https://github.com/users/another/projects/9',
    })
    const second = await loadConfig(f.repo)
    assert.equal(second.config.github.issue, 12)
    assert.equal(second.config.github.project.number, 9)
    assert.throws(() => verifyCheckout(second), /không khớp origin/)
    git(f.repo, ['remote', 'set-url', 'origin', 'git@github.com:other/app.git'])
    verifyCheckout(second)
  } finally {
    if (previous === undefined) delete process.env.GH_REPO
    else process.env.GH_REPO = previous
  }
})
test('missing/invalid env targets fail before contacting GitHub', async (t) => {
  const f = await fixture(t)
  for (const patch of [
    { GH_REPO: '' },
    { GH_REPO: 'owner/repo/extra' },
    { GH_ISSUE: '0' },
    { GH_ISSUE: '1e3' },
    { GH_PROJECT_URL: '' },
    { GH_PROJECT_URL: 'https://github.com/orgs/company/projects/-1' },
    { GH_BASE_BRANCH: 'main..bad' },
  ]) {
    await f.env(patch)
    await assert.rejects(loadConfig(f.repo))
  }
})
test('remote matching supports SSH/HTTPS and rejects credentials and lookalike hosts', () => {
  for (const value of [
    'git@github.com:company/site.git',
    'https://github.com/company/site.git',
    'ssh://git@github.com/company/site.git',
  ])
    assert.equal(repositoryFromRemote(value), 'company/site')
  for (const value of [
    'https://github.com.evil/company/site.git',
    'https://x:y@github.com/company/site.git',
    'http://github.com/company/site',
    'https://github.com/company/site?token=hidden',
  ])
    assert.equal(repositoryFromRemote(value), null)
})
test('Project URL accepts organization/user boards and rejects ambiguous or unsafe URLs', () => {
  for (const kind of ['orgs', 'users']) {
    const value = projectFromUrl(`https://github.com/${kind}/company/projects/2/`)
    assert.equal(value.owner, 'company')
    assert.equal(value.number, 2)
    assert.equal(value.ownerType, kind === 'orgs' ? 'Organization' : 'User')
  }
  for (const value of [
    undefined,
    'https://github.com.evil/orgs/company/projects/2',
    'https://secret@github.com/orgs/company/projects/2',
    'http://github.com/orgs/company/projects/2',
    'https://github.com/orgs/company/projects/0',
    'https://github.com/orgs/company/projects/9007199254740992',
    'https://github.com/orgs/../company/projects/2',
    'https://github.com/orgs/%63ompany/projects/2',
    'https://github.com/orgs/company/projects/2?token=secret',
    'https://github.com/orgs/company/projects/2#fragment',
  ])
    assert.throws(() => projectFromUrl(value))
})
test('CLI target works without a default Issue; explicit ID overrides default and missing ID blocks stages', async (t) => {
  const f = await fixture(t)
  const run = (file, args) =>
    spawnSync(process.execPath, [path.join(f.repo, 'scripts', file), ...args], {
      cwd: f.repo,
      encoding: 'utf8',
      timeout: 10000,
    })
  const info = run('workflow.mjs', ['target', '8'])
  assert.equal(info.status, 0, info.stderr)
  assert.equal(JSON.parse(info.stdout).issue, 8)
  assert.ok(!info.stdout.includes(secret))
  for (const GH_ISSUE of [undefined, '']) {
    await f.env({ GH_ISSUE })
    const target = run('workflow.mjs', ['target'])
    assert.equal(target.status, 0, target.stderr)
    assert.equal(JSON.parse(target.stdout).issue, null)
    for (const [file, args] of [
      ['workflow.mjs', ['sync']],
      ['task.mjs', ['publish']],
      ['task.mjs', ['record', 'intake', 'unused.json']],
    ]) {
      const result = run(file, args)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Chưa chọn Issue/)
      assert.ok(!result.stderr.includes(secret))
    }
  }
})

function mock(
  settings,
  {
    ownerType = 'Organization',
    missing = false,
    noWrite = false,
    badStatus = false,
    missingItem = false,
  } = {},
) {
  const calls = []
  const fetcher = async (url, options) => {
    const endpoint = new URL(url).pathname,
      gh = settings.config.github
    calls.push(endpoint)
    let data
    if (endpoint === '/user') data = { login: 'developer' }
    else if (endpoint === `/repos/${gh.repository}`)
      data = { node_id: 'R_dynamic', full_name: gh.repository, permissions: { push: true } }
    else if (endpoint === `/users/${gh.project.owner}`)
      data = { login: gh.project.owner, type: ownerType }
    else if (endpoint === '/graphql') {
      const { query, variables } = JSON.parse(options.body)
      if (query.includes('projectV2(number:')) {
        assert.equal(variables.owner, gh.project.owner)
        assert.equal(variables.number, gh.project.number)
        const kind = ownerType === 'Organization' ? 'organization' : 'user'
        assert.ok(query.includes(`${kind}(login:`))
        const project = {
          id: `P_${gh.project.number}`,
          number: gh.project.number,
          url: 'https://github.com/project',
          viewerCanUpdate: !noWrite,
          fields: {
            nodes: [
              {
                id: `F_${gh.project.number}`,
                name: 'Status',
                options: gh.statusNames
                  .filter((n) => !badStatus || n !== 'Review')
                  .map((name, i) => ({ name, id: `O_${gh.project.number}_${i}` })),
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        }
        data = { data: { [kind]: { projectV2: missing ? null : project } } }
      } else {
        assert.equal(variables.id, `P_${gh.project.number}`)
        data = {
          data: {
            node: {
              items: {
                nodes: missingItem
                  ? []
                  : [
                      {
                        id: 'ITEM',
                        content: { id: 'I_7' },
                        fieldValueByName: { name: 'Backlog' },
                      },
                      {
                        id: 'ITEM_8',
                        content: { id: 'I_8' },
                        fieldValueByName: { name: 'Backlog' },
                      },
                    ],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        }
      }
    } else if (endpoint.endsWith('/comments')) data = []
    else if (new RegExp(`^/repos/${gh.repository}/issues/[1-9][0-9]*$`).test(endpoint))
      data = {
        node_id: `I_${endpoint.split('/').at(-1)}`,
        number: Number(endpoint.split('/').at(-1)),
        title: 'Example task',
        body: 'Requirement',
        comments: 0,
        updated_at: 'same',
      }
    else assert.fail('Unexpected endpoint')
    return { ok: true, json: async () => data }
  }
  return { fetcher, calls }
}
test('owner/number discovers fresh Project/status IDs for organization and user boards', async (t) => {
  const f = await fixture(t)
  for (const ownerType of ['Organization', 'User']) {
    await f.env({
      GH_PROJECT_URL: `https://github.com/${ownerType === 'Organization' ? 'orgs' : 'users'}/company/projects/2`,
    })
    const s = await loadConfig(f.repo),
      { fetcher } = mock(s, { ownerType })
    const client = githubClient(s, fetcher)
    await client.identity()
    assert.equal(s.config.github.project.nodeId, 'P_2')
    assert.equal(s.config.github.project.statusOptions.Review, 'O_2_4')
    s.config.github.project.number = 9
    await client.identity()
    assert.equal(s.config.github.project.nodeId, 'P_9')
    assert.equal(s.config.github.project.statusOptions.Review, 'O_9_4')
    const ticket = await client.ticket(7)
    assert.equal(ticket.repository, 'company/site')
    assert.equal(ticket.project.number, 9)
  }
})
test('unknown/read-only boards, incompatible statuses and Issue outside board fail clearly', async (t) => {
  const f = await fixture(t)
  for (const opt of [
    { missing: true },
    { noWrite: true },
    { badStatus: true },
    { ownerType: 'User' },
  ]) {
    const s = await loadConfig(f.repo)
    await assert.rejects(githubClient(s, mock(s, opt).fetcher).identity())
  }
  const s = await loadConfig(f.repo),
    client = githubClient(s, mock(s, { missingItem: true }).fetcher)
  await client.identity()
  await assert.rejects(client.ticket(7), /chưa được thêm/)
})

test('CLI routes explicit/default Issues independently through sync, record and stage gates', async (t) => {
  const f = await fixture(t)
  const { pathToFileURL } = await import('node:url')
  const loader = path.join(f.repo, 'mock-fetch.mjs')
  await writeFile(
    loader,
    `import assert from 'node:assert/strict';
import {loadConfig} from ${JSON.stringify(pathToFileURL(path.join(f.repo, 'scripts/workflow/config.mjs')).href)};
globalThis.fetch = (${mock.toString()})(await loadConfig(${JSON.stringify(f.repo)})).fetcher;`,
  )
  const run = (file, args) =>
    spawnSync(
      process.execPath,
      ['--import', pathToFileURL(loader).href, path.join(f.repo, 'scripts', file), ...args],
      {
        cwd: f.repo,
        encoding: 'utf8',
        timeout: 10000,
      },
    )
  await writeFile(path.join(f.repo, '.gitignore'), '.agents/.env.workflow.local\n')
  await f.env({ GH_ISSUE: undefined })
  const checked = run('workflow.mjs', ['check'])
  assert.equal(checked.status, 0, checked.stderr)
  assert.equal(JSON.parse(checked.stdout).issue, null)
  const checkedIssue = run('workflow.mjs', ['check', '8'])
  assert.equal(checkedIssue.status, 0, checkedIssue.stderr)
  assert.equal(JSON.parse(checkedIssue.stdout).issue, 8)
  await f.env()
  const synced = run('workflow.mjs', ['sync'])
  assert.equal(synced.status, 0, synced.stderr)
  const result = JSON.parse(synced.stdout)
  assert.equal(result.target.issue, 7)
  assert.equal(result.target.project.number, 2)
  assert.equal(result.revision, 1)
  const input = path.join(f.repo, 'intake.json')
  await writeFile(
    input,
    JSON.stringify({
      change: { summary: 'Record test stage', reason: 'Exercise workflow contract' },
      revision: 1,
      translatedSourceIds: ['issue:7'],
      documents: Object.fromEntries(
        ['task.md'].map((name) => [name, 'Synthetic integration fixture for routing.']),
      ),
    }),
  )
  const recorded = run('task.mjs', ['record', 'intake', input])
  assert.equal(recorded.status, 0, recorded.stderr)
  const repeated = run('workflow.mjs', ['sync', '7'])
  assert.equal(repeated.status, 0, repeated.stderr)
  assert.equal(JSON.parse(repeated.stdout).changed, false)
  assert.equal(JSON.parse(repeated.stdout).docsMissing, false)
  for (const command of ['can-implement', 'publish']) {
    const blocked = run('task.mjs', [command])
    assert.equal(blocked.status, 1)
    assert.doesNotMatch(blocked.stderr, /arguments|GitHub API|Số arguments/)
  }
  const second = run('workflow.mjs', ['sync', '8'])
  assert.equal(second.status, 0, second.stderr)
  const result8 = JSON.parse(second.stdout)
  assert.equal(result8.target.issue, 8)
  assert.notEqual(result8.directory, result.directory)
  const input8 = JSON.parse(await readFile(input, 'utf8'))
  input8.translatedSourceIds = ['issue:8']
  await writeFile(input, JSON.stringify(input8))
  const recorded8 = run('task.mjs', ['record', '8', 'intake', input])
  assert.equal(recorded8.status, 0, recorded8.stderr)
  assert.equal(JSON.parse(recorded8.stdout).target.issue, 8)
  const state8 = JSON.parse(
    await readFile(
      path.join(f.docs, 'company', 'site', 'developer', '8', '.workflow', 'state.json'),
      'utf8',
    ),
  )
  assert.equal(state8.issue, 8)
  assert.equal(state8.history.length, 1)
  const outsideBoard = run('workflow.mjs', ['sync', '9'])
  assert.equal(outsideBoard.status, 1)
  assert.match(outsideBoard.stderr, /chưa được thêm/)
  const state = JSON.parse(
    await readFile(
      path.join(f.docs, 'company', 'site', 'developer', '7', '.workflow', 'state.json'),
      'utf8',
    ),
  )
  assert.equal(state.issue, 7)
  assert.equal(state.history.length, 1)
})
