import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  parseConfigEnv,
  setup,
  loadConfig,
  redact,
  issueNumber,
  checkNode,
} from '../../scripts/workflow/config.mjs'
import {
  saveSnapshot,
  syncTicket,
  ticketDirectory,
  withLock,
  readState,
} from '../../scripts/workflow/vault.mjs'
import { githubClient } from '../../scripts/workflow/github.mjs'

const token = 'ghp_' + 'x'.repeat(36) // synthetic, never usable as a real credential
const config = {
  schemaVersion: 2,
  github: {
    host: 'github.com',
    repository: 'example/workshop',
    repositoryNodeId: 'R_test',
    issue: 1,
    statusNames: ['Backlog'],
    pushUrl: 'https://github.com/example/workshop.git',
    project: {
      owner: 'example',
      nodeId: 'P_test',
      number: 1,
      statusFieldId: 'F_test',
      statusOptions: { Backlog: 'O_test' },
    },
  },
  release: { allowMerge: false, allowForcePush: false },
}
const source = () => ({
  repository: config.github.repository,
  number: 1,
  nodeId: 'I_test',
  url: 'https://github.com/example/workshop/issues/1',
  title: 'Search articles',
  body: 'Match body text',
  state: 'open',
  updatedAt: '2026-09-18T00:00:00Z',
  labels: ['enhancement'],
  assignees: [],
  comments: [{ id: 11, author: 'learner', body: 'first', updatedAt: 't1' }],
  project: { number: 1, id: 'ITEM_test', status: 'Backlog' },
})
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workshop-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repoRoot = path.join(root, 'repo'),
    docsRoot = path.join(root, 'documents')
  await mkdir(repoRoot)
  await mkdir(path.join(repoRoot, '.agents'))
  await mkdir(docsRoot)
  await writeFile(path.join(repoRoot, 'workshop.config.json'), JSON.stringify(config))
  await writeFile(
    path.join(repoRoot, '.agents/.env.workflow.example'),
    'GH_TOKEN=""\nWORKSHOP_DOCS_ROOT=""\n',
  )
  await writeFile(
    path.join(repoRoot, '.agents/.env.workflow.local'),
    `GH_TOKEN="${token}"\nWORKSHOP_DOCS_ROOT="${docsRoot}"\nGH_REPO="example/workshop"\nGH_ISSUE="1"\nGH_PROJECT_URL="https://github.com/orgs/example/projects/1"\n`,
  )
  return { root, repoRoot, docsRoot, token, config }
}

test('env parsing preserves Windows paths and rejects duplicate/executable/unknown settings', () => {
  assert.deepEqual(
    parseConfigEnv(
      '\uFEFF# comment\r\nGH_TOKEN="test"\r\nWORKSHOP_DOCS_ROOT="C:\\Users\\Admin\\OneDrive"',
    ),
    { GH_TOKEN: 'test', WORKSHOP_DOCS_ROOT: 'C:\\Users\\Admin\\OneDrive' },
  )
  for (const input of [
    'GH_TOKEN=a\nGH_TOKEN=b',
    'GH_TOKEN=$(cat secret)',
    'GH_TOKEN=`whoami`',
    'OTHER=value',
    'GH_TOKEN="oops',
  ])
    assert.throws(() => parseConfigEnv(input))
})
test('setup preserves existing credentials and creates only a blank template on first run', async (t) => {
  const settings = await fixture(t)
  const file = path.join(settings.repoRoot, '.agents/.env.workflow.local')
  const before = await readFile(file, 'utf8')
  assert.equal((await setup(settings.repoRoot)).env, 'preserved')
  assert.equal(await readFile(file, 'utf8'), before)
  await rm(file)
  assert.equal((await setup(settings.repoRoot)).env, 'created')
  assert.equal(await readFile(file, 'utf8'), 'GH_TOKEN=""\nWORKSHOP_DOCS_ROOT=""\n')
})
test('file credentials override ambient identity; blank file token cannot fall back', async (t) => {
  const settings = await fixture(t)
  const previous = process.env.GH_TOKEN
  process.env.GH_TOKEN = ['ambient', 'other', 'account'].join('-')
  try {
    assert.equal((await loadConfig(settings.repoRoot)).token, token)
    await writeFile(
      path.join(settings.repoRoot, '.agents/.env.workflow.local'),
      `GH_TOKEN=""\nWORKSHOP_DOCS_ROOT="${settings.docsRoot}"\n`,
    )
    await assert.rejects(loadConfig(settings.repoRoot), /GH_TOKEN/)
  } finally {
    if (previous === undefined) delete process.env.GH_TOKEN
    else process.env.GH_TOKEN = previous
  }
})
test('documents within repo and env symlinks are rejected', async (t) => {
  const settings = await fixture(t)
  const file = path.join(settings.repoRoot, '.agents/.env.workflow.local')
  await writeFile(file, `GH_TOKEN=${token}\nWORKSHOP_DOCS_ROOT=${settings.repoRoot}\n`)
  await assert.rejects(loadConfig(settings.repoRoot), /ngoài repo/)
  await rm(file)
  await symlink(path.join(settings.repoRoot, '.agents/.env.workflow.example'), file)
  await assert.rejects(loadConfig(settings.repoRoot), /symlink/)
})
test('Node and issue validation reject unsupported runtime and traversal', () => {
  for (const version of ['20.19.5', '22.11.0', '23.1.0']) assert.throws(() => checkNode(version))
  for (const version of ['22.12.0', '24.0.0']) checkNode(version)
  for (const id of ['../1', 0, -1, '01', '1e2', '9007199254740992', undefined])
    assert.throws(() => issueNumber(id))
})
test('redacts known credentials and private key blocks', () => {
  const input = `${token} GH_TOKEN="${['other', 'secret'].join('-')}" api_key=abc password: xyz\n${'-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'}\nprivate-data\n${'-----END ' + 'OPENSSH PRIVATE KEY-----'}`
  const safe = redact(input, token)
  for (const value of [token, 'other-secret', 'abc', 'xyz', 'private-data'])
    assert.ok(!safe.includes(value))
})
test('sync is idempotent, tracks edited/deleted comments and invalidates downstream work', async (t) => {
  const settings = await fixture(t)
  const first = await saveSnapshot(settings, 'learner', source())
  assert.equal(first.revision, 1)
  const changelogBefore = await readFile(path.join(first.directory, 'changelog.md'), 'utf8')
  assert.equal((await saveSnapshot(settings, 'learner', source())).changed, false)
  assert.equal(await readFile(path.join(first.directory, 'changelog.md'), 'utf8'), changelogBefore)
  const edited = source()
  edited.comments[0].body = 'edited'
  edited.comments.push({ id: 12, body: 'new', author: 'learner' })
  const second = await saveSnapshot(settings, 'learner', edited)
  assert.deepEqual(second.changes, ['comment-edited:11', 'comment-added:12'])
  assert.equal(second.stages.review.status, 'needs-revalidation')
  edited.comments.shift()
  assert.deepEqual((await saveSnapshot(settings, 'learner', edited)).changes, [
    'comment-deleted:11',
  ])
  const state = await readState(first.directory, {
    repository: config.github.repository,
    login: 'learner',
    issue: 1,
  })
  assert.equal(state.history.length, 3)
})
test('board-only change preserves stage state and stale projections can be rebuilt', async (t) => {
  const settings = await fixture(t)
  const first = await saveSnapshot(settings, 'learner', source())
  const moved = source()
  moved.project.status = 'Analysis'
  assert.equal(
    (await saveSnapshot(settings, 'learner', moved)).stages.analysis.status,
    'not-started',
  )
  await rm(path.join(first.directory, 'changelog.md'))
  await rm(path.join(first.directory, 'sync', 'source.md'))
  assert.equal((await saveSnapshot(settings, 'learner', moved)).changed, false)
  assert.match(await readFile(path.join(first.directory, 'changelog.md'), 'utf8'), /Revision 2/)
})
test('lock blocks concurrent writers without removing another writer lock', async (t) => {
  const settings = await fixture(t)
  const directory = await ticketDirectory(settings, 'learner', 1)
  await withLock(directory, async () => {
    await assert.rejects(saveSnapshot(settings, 'learner', source()), /khóa/)
    await assert.rejects(
      withLock(directory, async () => {}),
      /khóa/,
    )
  })
  assert.equal((await saveSnapshot(settings, 'learner', source())).revision, 1)
})
test('network sync holds the ticket lock and rejects a mismatched returned Issue', async (t) => {
  const settings = await fixture(t)
  await syncTicket(settings, 'learner', 1, async () => {
    await assert.rejects(
      syncTicket(settings, 'learner', 1, async () => assert.fail('must not fetch under lock')),
      /khóa/,
    )
    return source()
  })
  await assert.rejects(
    syncTicket(settings, 'learner', 1, async () => ({ ...source(), number: 2 })),
    /không khớp/,
  )
  assert.equal((await saveSnapshot(settings, 'learner', source())).revision, 1)
})
test('corrupt state or modified snapshot fails closed and preserves prior bytes', async (t) => {
  const settings = await fixture(t)
  const { directory } = await saveSnapshot(settings, 'learner', source())
  const stateFile = path.join(directory, 'state.json'),
    stateText = await readFile(stateFile, 'utf8')
  await writeFile(stateFile, '{broken')
  await assert.rejects(saveSnapshot(settings, 'learner', source()), /hỏng/)
  assert.equal(await readFile(stateFile, 'utf8'), '{broken')
  await writeFile(stateFile, stateText)
  await writeFile(path.join(directory, JSON.parse(stateText).snapshot), '{}')
  await assert.rejects(saveSnapshot(settings, 'learner', source()), /đã bị sửa/)
  assert.equal(await readFile(stateFile, 'utf8'), stateText)
})
test('symlink directory/file and mismatched ticket never write outside vault', async (t) => {
  const settings = await fixture(t)
  const outside = path.join(settings.root, 'outside')
  await mkdir(outside)
  await symlink(outside, path.join(settings.docsRoot, 'example'), 'dir')
  await assert.rejects(saveSnapshot(settings, 'learner', source()), /symlink/)
  await rm(path.join(settings.docsRoot, 'example'))
  const { directory } = await saveSnapshot(settings, 'learner', source())
  await assert.rejects(
    readState(directory, { repository: config.github.repository, login: 'other', issue: 1 }),
    /không khớp/,
  )
  const target = path.join(outside, 'protected')
  await writeFile(target, 'untouched')
  await rm(path.join(directory, 'changelog.md'))
  await symlink(target, path.join(directory, 'changelog.md'))
  await assert.rejects(saveSnapshot(settings, 'learner', source()), /symlink/)
  assert.equal(await readFile(target, 'utf8'), 'untouched')
})

function apiMock({ comments = [], projectWrite = true, repoWrite = true, mutate = false } = {}) {
  const calls = []
  let issueReads = 0
  const mock = async (url, options) => {
    calls.push({ url, options })
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    assert.equal(options.redirect, 'error')
    const endpoint = new URL(url).pathname
    let data
    if (endpoint === '/user') data = { login: 'learner' }
    else if (endpoint === '/users/example') data = { login: 'example', type: 'Organization' }
    else if (endpoint === '/repos/example/workshop')
      data = { node_id: 'R_test', full_name: 'example/workshop', permissions: { push: repoWrite } }
    else if (endpoint.endsWith('/comments')) {
      const page = Number(new URL(url).searchParams.get('page'))
      data = comments.slice((page - 1) * 100, page * 100)
    } else if (endpoint.endsWith('/issues/1')) {
      issueReads++
      data = {
        ...source(),
        node_id: 'I_test',
        html_url: source().url,
        updated_at: mutate && issueReads > 1 ? 'changed' : 'same',
        comments: comments.length,
      }
    } else if (endpoint === '/graphql') {
      const body = JSON.parse(options.body)
      if (body.query.includes('items(first')) {
        data = {
          data: {
            node: {
              items: {
                nodes: body.variables.after
                  ? [
                      {
                        id: 'ITEM_test',
                        content: { id: 'I_test' },
                        fieldValueByName: { name: 'Backlog', optionId: 'O_test' },
                      },
                    ]
                  : [],
                pageInfo: {
                  hasNextPage: !body.variables.after,
                  endCursor: body.variables.after ? null : 'page-2',
                },
              },
            },
          },
        }
      } else
        data = {
          data: {
            organization: {
              projectV2: {
                id: 'P_test',
                number: 1,
                public: false,
                viewerCanUpdate: projectWrite,
                fields: {
                  nodes: [
                    { id: 'F_test', name: 'Status', options: [{ name: 'Backlog', id: 'O_test' }] },
                  ],
                  pageInfo: { hasNextPage: false },
                },
              },
            },
          },
        }
    } else throw Error('Unexpected endpoint')
    return { ok: true, json: async () => data }
  }
  return { mock, calls }
}
test('API reads paginated comments/Project, uses explicit PAT and sanitizes snapshots', async () => {
  const comments = Array.from({ length: 101 }, (_, i) => ({
    id: i + 1,
    user: { login: 'test[bot]' },
    body: i ? 'comment' : token,
  }))
  const { mock, calls } = apiMock({ comments })
  const client = githubClient({ token, config }, mock)
  assert.equal((await client.identity()).login, 'learner')
  const snapshot = await client.ticket(1)
  assert.equal(snapshot.comments.length, 101)
  assert.equal(snapshot.comments[0].body, '[REDACTED]')
  assert.equal(snapshot.project.id, 'ITEM_test')
  assert.ok(calls.some(({ url }) => url.includes('page=2')))
  assert.ok(!JSON.stringify(snapshot).includes(token))
})
test('API denies insufficient permissions and detects edits during sync', async () => {
  for (const permissions of [{ repoWrite: false }, { projectWrite: false }]) {
    await assert.rejects(
      githubClient({ token, config }, apiMock(permissions).mock).identity(),
      /quyền/,
    )
  }
  await assert.rejects(
    githubClient({ token, config }, apiMock({ mutate: true }).mock).ticket(1),
    /thay đổi/,
  )
})
test('API never includes raw server/transport errors or credentials in failures', async () => {
  for (const mock of [
    async () => {
      throw Error(token)
    },
    async () => ({ ok: false, status: 403, json: async () => ({ message: token }) }),
    async () => ({ ok: true, json: async () => ({ errors: [{ message: token }] }) }),
  ]) {
    await assert.rejects(
      githubClient({ token, config }, mock).identity(),
      (error) => !error.message.includes(token),
    )
  }
})

test('basic document headings are not mistaken for HTTP auth credentials', () => {
  const prose = '# Basic spec\n# Basic plan\n# Basic analysis\n'
  assert.equal(redact(prose), prose)
  assert.notEqual(
    redact('Authorization: Basic ' + Buffer.from('tester:synthetic-password').toString('base64')),
    'Authorization: Basic ' + Buffer.from('tester:synthetic-password').toString('base64'),
  )
})

test('PR is added to configured Project, status is verified, retry reuses its card', async () => {
  let added = false,
    status = 'Backlog',
    updates = 0
  const settings = {
    token,
    config: {
      ...config,
      github: {
        ...config.github,
        project: {
          ...config.github.project,
          statusOptions: {
            Backlog: 'O_test',
            'PR ready': 'O_ready',
          },
        },
      },
    },
  }
  const client = githubClient(settings, async (_url, options) => {
    const { query, variables } = JSON.parse(options.body)
    assert.equal(variables.project ?? variables.id, 'P_test')
    let data
    if (query.includes('addProjectV2ItemById')) {
      assert.equal(variables.content, 'PR_test')
      added = true
      data = { addProjectV2ItemById: { item: { id: 'PR_ITEM' } } }
    } else if (query.includes('updateProjectV2ItemFieldValue')) {
      assert.equal(variables.item, 'PR_ITEM')
      assert.equal(variables.option, 'O_ready')
      updates++
      status = 'PR ready'
      data = { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PR_ITEM' } } }
    } else {
      assert.ok(query.includes('... on PullRequest'))
      data = {
        node: {
          items: {
            nodes: added
              ? [
                  {
                    id: 'PR_ITEM',
                    content: { id: 'PR_test' },
                    fieldValueByName: {
                      name: status,
                      optionId: status === 'Backlog' ? 'O_test' : 'O_ready',
                    },
                  },
                ]
              : [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }
    }
    return { ok: true, json: async () => ({ data }) }
  })
  const pr = {
    number: 2,
    node_id: 'PR_test',
    base: { repo: { full_name: 'example/workshop' } },
    head: { repo: { full_name: 'example/workshop' } },
  }
  for (let i = 0; i < 2; i++) assert.equal((await client.attachPR(pr)).status, 'PR ready')
  assert.equal(updates, 1)
  await assert.rejects(
    client.attachPR({ ...pr, head: { repo: { full_name: 'wrong/repo' } } }),
    /không thuộc/,
  )
})
