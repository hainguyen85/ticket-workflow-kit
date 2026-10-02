import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile, readFile, rm, readdir, cp } from 'node:fs/promises'
import path from 'node:path'
import {
  setup,
  loadConfig,
  redact,
  checkNode,
  ticketKey,
  ticketSlug,
  ticketTypes,
  nextKey,
} from '../lib/config.mjs'
import {
  createTicket,
  syncTicket,
  ticketDirectory,
  withLock,
  readState,
  readSnapshot,
  currentItems,
  resolveTicket,
  listTickets,
  duplicateKeys,
} from '../lib/vault.mjs'
import { chatSource, fileSource, readSources } from '../lib/source.mjs'
import { workspace, trySymlink } from './helpers.mjs'

const token = 'ghp_' + 'x'.repeat(36) // synthetic, never usable as a real credential
const identity = { key: 'T-1', slug: 'search-articles', title: 'Search articles' }
const first = () => [chatSource('Match body text')]

async function configured(t) {
  const settings = await workspace(t)
  await mkdir(path.join(settings.repoRoot, '.agents'))
  await writeFile(
    path.join(settings.repoRoot, '.agents/workflow.config.json'),
    JSON.stringify({ schemaVersion: 3, git: { baseBranch: 'develop' } }),
  )
  await writeFile(
    path.join(settings.repoRoot, '.agents/workflow.local.example.json'),
    '{ "docsRepo": "" }\n',
  )
  const local = path.join(settings.repoRoot, '.agents/workflow.local.json')
  await writeFile(local, JSON.stringify({ docsRepo: settings.docsRepo }))
  return { settings, local }
}

test('config reads committed policy plus the machine-local documents repo', async (t) => {
  const { settings, local } = await configured(t)
  const loaded = await loadConfig(settings.repoRoot)
  assert.equal(loaded.config.git.baseBranch, 'develop')
  assert.equal(loaded.config.git.remote, 'origin')
  assert.deepEqual(loaded.config.git.protectedBranches, ['develop'])
  assert.equal(loaded.config.checks.timeoutSeconds, 600)
  assert.equal(path.relative(loaded.docsRepo, loaded.docsRoot), path.join('docs', 'tickets'))
  assert.equal(path.relative(loaded.docsRepo, loaded.glossaryFile), path.join('docs', 'GLOSSARY.md'))
  assert.equal(path.relative(loaded.docsRepo, loaded.adrRoot), path.join('docs', 'adr'))
  assert.equal(loaded.insideSource, false)
  for (const invalid of [
    { docsRepo: 'relative/path' },
    { docsRepo: path.join(settings.root, 'missing') },
    { docsRepo: settings.docsRepo, token: 'unsupported' },
    {},
  ]) {
    await writeFile(local, JSON.stringify(invalid))
    await assert.rejects(loadConfig(settings.repoRoot))
  }
  await writeFile(local, '{broken')
  await assert.rejects(loadConfig(settings.repoRoot), /JSON/)
})
test('records inside the source repo are accepted only when the source repo ignores them', async (t) => {
  const { settings, local } = await configured(t)
  const ignore = path.join(settings.repoRoot, '.gitignore')
  // Tickets folder directly in the source repo: <repo>/docs/tickets.
  await writeFile(local, JSON.stringify({ docsRepo: settings.repoRoot }))
  await assert.rejects(loadConfig(settings.repoRoot), /\.gitignore/)
  // The shared glossary and decision records sit next to the tickets and follow the same rule.
  await writeFile(ignore, 'docs/tickets/\n')
  await assert.rejects(loadConfig(settings.repoRoot), /docs\.glossaryPath.*\.gitignore/)
  await writeFile(ignore, 'docs/tickets/\ndocs/GLOSSARY.md\n')
  await assert.rejects(loadConfig(settings.repoRoot), /docs\.adrPath.*\.gitignore/)
  await writeFile(ignore, 'docs/tickets/\ndocs/GLOSSARY.md\ndocs/adr/\n')
  const direct = await loadConfig(settings.repoRoot)
  assert.equal(direct.insideSource, true)
  assert.equal(path.relative(direct.repoRoot, direct.docsRoot), path.join('docs', 'tickets'))
  // A documents repo cloned into a folder of the source repo: <repo>/team-docs/docs/tickets.
  const nested = path.join(settings.repoRoot, 'team-docs')
  await mkdir(nested)
  await writeFile(local, JSON.stringify({ docsRepo: nested }))
  await assert.rejects(loadConfig(settings.repoRoot), /\.gitignore/)
  await writeFile(ignore, 'team-docs/\n')
  assert.equal((await loadConfig(settings.repoRoot)).insideSource, true)
})
test('glossary and decision record locations are configurable inside the documents repo', async (t) => {
  const { settings } = await configured(t)
  const file = path.join(settings.repoRoot, '.agents/workflow.config.json')
  const write = (docs) => writeFile(file, JSON.stringify({ schemaVersion: 3, docs }))
  await write({ glossaryPath: 'domain/terms.md', adrPath: 'domain/decisions' })
  const loaded = await loadConfig(settings.repoRoot)
  assert.equal(path.relative(loaded.docsRepo, loaded.glossaryFile), path.join('domain', 'terms.md'))
  assert.equal(path.relative(loaded.docsRepo, loaded.adrRoot), path.join('domain', 'decisions'))
  assert.deepEqual(loaded.config.docs, {
    ticketsPath: 'docs/tickets',
    glossaryPath: 'domain/terms.md',
    adrPath: 'domain/decisions',
  })
  for (const [docs, message] of [
    [{ glossaryPath: '../GLOSSARY.md' }, /docs\.glossaryPath/],
    [{ glossaryPath: '/abs/GLOSSARY.md' }, /docs\.glossaryPath/],
    [{ glossaryPath: '' }, /docs\.glossaryPath/],
    [{ glossaryPath: 7 }, /docs\.glossaryPath/],
    [{ adrPath: 'docs\\adr' }, /docs\.adrPath/],
    [{ adrPath: 'docs//adr' }, /docs\.adrPath/],
    [{ ticketsPath: '../tickets' }, /docs\.ticketsPath/],
    // The tickets folder is managed by the helper; shared documents stay out of it.
    [{ glossaryPath: 'docs/tickets/GLOSSARY.md' }, /docs\.glossaryPath.*docs\.ticketsPath/],
    [{ adrPath: 'docs/tickets/adr' }, /docs\.adrPath.*docs\.ticketsPath/],
    [{ adrPath: 'docs', glossaryPath: 'docs/GLOSSARY.md' }, /docs\.glossaryPath.*docs\.adrPath/],
  ]) {
    await write(docs)
    await assert.rejects(loadConfig(settings.repoRoot), message)
  }
})
test('setup creates only a blank local template and preserves an existing one', async (t) => {
  const { settings, local } = await configured(t)
  const before = await readFile(local, 'utf8')
  assert.equal((await setup(settings.repoRoot)).local, 'preserved')
  assert.equal(await readFile(local, 'utf8'), before)
  await rm(local)
  assert.equal((await setup(settings.repoRoot)).local, 'created')
  assert.equal(await readFile(local, 'utf8'), '{ "docsRepo": "" }\n')
  await assert.rejects(loadConfig(settings.repoRoot), /docsRepo/)
})
test('local config symlink is rejected', async (t) => {
  const { settings, local } = await configured(t)
  await rm(local)
  if (
    !(await trySymlink(
      t,
      path.join(settings.repoRoot, '.agents/workflow.local.example.json'),
      local,
    ))
  )
    return
  await assert.rejects(loadConfig(settings.repoRoot), /symlink/)
})
test('Node, key and slug validation reject unsupported runtime and traversal', () => {
  for (const version of ['20.19.5', '22.11.0', '23.1.0']) assert.throws(() => checkNode(version))
  for (const version of ['22.12.0', '24.0.0']) checkNode(version)
  for (const key of ['../1', '', 'a b', 'KEY-', '-KEY', 'x'.repeat(41), undefined])
    assert.throws(() => ticketKey(key))
  for (const key of ['PRJ-123', '260930-1415', 'T_1.2']) ticketKey(key)
  for (const slug of [
    'search',
    'Note-Search',
    'a-b-c-d-e',
    'note_search',
    'tìm-kiếm',
    '',
    'international-configuration-set', // three words, but longer than 30 characters
  ])
    assert.throws(() => ticketSlug(slug), /2–4 từ/)
  for (const slug of ['note-search', 'a-b-c-d', 'v2-api-paging', 'search-empty-keyword'])
    ticketSlug(slug)
})
test('a generated key is the type prefix plus the next number of that prefix', () => {
  assert.equal(nextKey('REQ', []), 'REQ-1')
  const names = [
    'REQ-1-note-search',
    'REQ-12-note-export',
    'BUG-40-wrong-total',
    'REQX-99-other-prefix',
    'GL-123-from-tracker',
    // A timestamp key of an earlier version: six digits, not a sequence number.
    'REQ-260930-1415-old-style',
    'REQ-7',
  ]
  assert.equal(nextKey('REQ', names), 'REQ-13')
  assert.equal(nextKey('BUG', names), 'BUG-41')
  assert.equal(nextKey('CR', names), 'CR-1')
  assert.equal(nextKey('REQ', ['REQ-99998-last-one']), 'REQ-99999')
  assert.throws(() => nextKey('REQ', ['REQ-99999-no-more']), /hết số thứ tự/)
})
test('ticket types map to key prefixes and are validated when configured', async (t) => {
  assert.deepEqual(ticketTypes(), {
    types: { req: 'REQ', cr: 'CR' },
    defaultType: 'req',
    changeRequestType: 'cr',
  })
  assert.deepEqual(ticketTypes({ types: { story: 'US', bug: 'BUG' }, defaultType: 'bug' }), {
    types: { story: 'US', bug: 'BUG' },
    defaultType: 'bug',
    changeRequestType: null,
  })
  assert.equal(
    ticketTypes({ types: { req: 'REQ', change: 'CHG' }, changeRequestType: 'change' })
      .changeRequestType,
    'change',
  )
  for (const invalid of [
    { types: {} },
    { types: [] },
    { types: { req: 'req' } },
    { types: { req: 'R' } },
    { types: { REQ: 'REQ' } },
    { types: { req: 'RE-Q' } },
    { types: { req: 'REQ', cr: 'REQ' } },
    { types: { req: 'REQ' }, defaultType: 'cr' },
    { types: { req: 'REQ' }, changeRequestType: 'cr' },
  ])
    assert.throws(() => ticketTypes(invalid), /tickets\./)
  const { settings } = await configured(t)
  const file = path.join(settings.repoRoot, '.agents/workflow.config.json')
  assert.deepEqual((await loadConfig(settings.repoRoot)).config.tickets.types, {
    req: 'REQ',
    cr: 'CR',
  })
  await writeFile(
    file,
    JSON.stringify({ schemaVersion: 3, tickets: { types: { req: 'REQ', bug: 'BUG' } } }),
  )
  assert.equal((await loadConfig(settings.repoRoot)).config.tickets.changeRequestType, null)
  await writeFile(file, JSON.stringify({ schemaVersion: 3, tickets: { types: { req: 'x' } } }))
  await assert.rejects(loadConfig(settings.repoRoot), /tickets\.types/)
})
test('the config shipped with the kit is valid and declares the bug ticket type', async () => {
  const shipped = JSON.parse(
    await readFile(new URL('../../workflow.config.json', import.meta.url), 'utf8'),
  )
  assert.equal(shipped.schemaVersion, 3)
  const { types, defaultType, changeRequestType } = ticketTypes(shipped.tickets)
  assert.deepEqual(types, { req: 'REQ', cr: 'CR', bug: 'BUG' })
  assert.equal(defaultType, 'req')
  assert.equal(changeRequestType, 'cr')
})
test('redacts known credentials and private key blocks', () => {
  const input = `${token} GH_TOKEN="${['other', 'secret'].join('-')}" api_key=abc password: xyz\n${'-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'}\nprivate-data\n${'-----END ' + 'OPENSSH PRIVATE KEY-----'}`
  const safe = redact(input)
  for (const value of [token, 'other-secret', 'abc', 'xyz', 'private-data'])
    assert.ok(!safe.includes(value))
  const heading = '## Basic information about the task'
  assert.equal(redact(heading), heading)
})

test('ticket ID is the external key or the next number of its type, followed by the slug', async (t) => {
  const settings = await workspace(t)
  const external = await createTicket(settings, identity, first())
  assert.equal(external.ticket, 'T-1-search-articles')
  assert.equal(external.revision, 1)
  await assert.rejects(
    createTicket(settings, { ...identity, slug: 'other-topic' }, first()),
    /key này/,
  )
  const generated = await createTicket(settings, { slug: 'note-search', title: 'Note search' }, first())
  assert.equal(generated.ticket, 'REQ-1-note-search')
  assert.equal(generated.type, 'req')
  const second = await createTicket(settings, { slug: 'note-export', title: 'Note export' }, first())
  assert.equal(second.ticket, 'REQ-2-note-export')
  // The prefix comes from the ticket type and each prefix counts on its own; each project
  // lists its own types.
  const custom = {
    ...settings,
    config: { ...settings.config, tickets: { types: { req: 'REQ', bug: 'BUG' } } },
  }
  const bug = await createTicket(
    custom,
    { slug: 'wrong-total', title: 'Wrong total', type: 'bug' },
    first(),
  )
  assert.equal(bug.ticket, 'BUG-1-wrong-total')
  assert.equal(bug.type, 'bug')
  await assert.rejects(
    createTicket(settings, { slug: 'other-kind', title: 'x', type: 'bug' }, first()),
    /Loại ticket không hợp lệ/,
  )
  // A ticket of an earlier version keeps its timestamp key and is not counted; a folder left
  // without a state by an interrupted creation still holds its number.
  await createTicket(
    settings,
    { key: 'REQ-260930-1415', slug: 'old-style', title: 'Old style' },
    first(),
  )
  await mkdir(path.join(settings.docsRoot, 'REQ-9-interrupted-sync'))
  const tenth = await createTicket(settings, { slug: 'note-tags', title: 'Note tags' }, first())
  assert.equal(tenth.ticket, 'REQ-10-note-tags')
  // An external key is used as it is; the type is still recorded.
  assert.equal(external.type, 'req')
  assert.deepEqual(await listTickets(settings), [
    'BUG-1-wrong-total',
    'REQ-1-note-search',
    'REQ-10-note-tags',
    'REQ-2-note-export',
    'REQ-260930-1415-old-style',
    'T-1-search-articles',
  ])
  assert.equal(await resolveTicket(settings, 'T-1'), 'T-1-search-articles')
  // REQ-1 does not match REQ-10: a key ends where the slug starts.
  assert.equal(await resolveTicket(settings, 'REQ-1'), 'REQ-1-note-search')
  assert.equal(await resolveTicket(settings, 'REQ-260930-1415'), 'REQ-260930-1415-old-style')
  await assert.rejects(resolveTicket(settings, 'REQ'), /nhiều hồ sơ/)
  await assert.rejects(resolveTicket(settings, 'T-9'), /Không tìm thấy/)
  assert.deepEqual(await duplicateKeys(settings), [])
  for (const invalid of [
    { slug: 'single', title: 'x' },
    { slug: 'one-two-three-four-five', title: 'x' },
    { slug: 'note-search', title: '' },
    { slug: 'note-search', title: 'two\nlines' },
  ])
    await assert.rejects(createTicket(settings, invalid, first()))
  await assert.rejects(createTicket(settings, { slug: 'no-source', title: 'x' }, []), /nguồn/)
})
test('tickets created on two machines before a pull share a key, and that is reported', async (t) => {
  const settings = await workspace(t)
  const mine = await createTicket(settings, { slug: 'note-search', title: 'Note search' }, first())
  // Another machine: its own checkout of the documents repo, not yet holding my ticket.
  const otherRepo = path.join(settings.root, 'other-docs')
  const other = { ...settings, docsRepo: otherRepo, docsRoot: path.join(otherRepo, 'docs', 'tickets') }
  await mkdir(otherRepo)
  const theirs = await createTicket(other, { slug: 'note-export', title: 'Note export' }, first())
  assert.equal(mine.ticket, 'REQ-1-note-search')
  assert.equal(theirs.ticket, 'REQ-1-note-export')
  // Git merges the two folders without a conflict because the slugs differ.
  await cp(
    path.join(other.docsRoot, theirs.ticket),
    path.join(settings.docsRoot, theirs.ticket),
    { recursive: true },
  )
  assert.deepEqual(await duplicateKeys(settings), [
    { key: 'REQ-1', tickets: ['REQ-1-note-export', 'REQ-1-note-search'] },
  ])
  await assert.rejects(resolveTicket(settings, 'REQ-1'), /nhiều hồ sơ/)
  assert.equal(await resolveTicket(settings, 'REQ-1-note-search'), 'REQ-1-note-search')
  // Both tickets keep working under their full ID, and the next number moves on.
  const copied = await ticketDirectory(settings, theirs.ticket, false)
  assert.equal((await readState(copied, { ticket: theirs.ticket })).key, 'REQ-1')
  const next = await createTicket(settings, { slug: 'note-tags', title: 'Note tags' }, first())
  assert.equal(next.ticket, 'REQ-2-note-tags')
})

test('file sources are copied byte for byte into request/ and chat is snapshotted', async (t) => {
  const settings = await workspace(t)
  const binary = Buffer.from([0, 255, 1, 254, 13, 10, 200])
  const origin = path.join(settings.root, 'Yêu cầu tìm kiếm.docx')
  const chat = path.join(settings.root, 'request.md')
  await writeFile(origin, binary)
  await writeFile(chat, '﻿Tìm bài viết theo nội dung.\n')
  const sources = await readSources({ files: [origin], chat })
  const { ticket, directory } = await createTicket(settings, identity, sources)
  const request = path.join(path.dirname(directory), 'request', 'r1')
  assert.deepEqual((await readdir(request)).sort(), ['Yêu cầu tìm kiếm.docx', 'chat.md'])
  assert.deepEqual(await readFile(path.join(request, 'Yêu cầu tìm kiếm.docx')), binary)
  assert.equal(await readFile(path.join(request, 'chat.md'), 'utf8'), 'Tìm bài viết theo nội dung.\n')
  const state = await readState(directory, { ticket })
  assert.equal(state.history[0].author, settings.author)
  const snapshot = await readSnapshot(directory, state)
  assert.deepEqual(
    snapshot.items.map((item) => [item.id, item.kind]),
    [
      ['r1/Yêu cầu tìm kiếm.docx', 'file'],
      ['r1/chat.md', 'chat'],
    ],
  )
  assert.match(await readFile(path.join(path.dirname(directory), 'TASK.md'), 'utf8'), /r1\/chat\.md/)
  // The original may now change or disappear without affecting the record.
  await rm(origin)
  assert.equal((await syncTicket(settings, ticket)).changed, false)
})
test('unsafe or secret-bearing sources are refused before anything is written', async (t) => {
  const settings = await workspace(t)
  for (const name of ['../escape.md', 'a/b.md', '.hidden', 'trailing.', 'chat.md', 'x'.repeat(151)])
    assert.throws(() => fileSource(name, Buffer.from('data')))
  assert.throws(() => fileSource('empty.md', Buffer.alloc(0)))
  assert.throws(() => fileSource('leak.md', Buffer.from(`key ${token}`)), /secret/)
  assert.throws(() => chatSource(`My key is ${token}`), /secret/)
  assert.throws(() => chatSource('   '))
  const same = path.join(settings.root, 'same.md')
  await writeFile(same, 'x')
  await mkdir(path.join(settings.root, 'other'))
  await writeFile(path.join(settings.root, 'other', 'SAME.md'), 'y')
  await assert.rejects(
    readSources({ files: [same, path.join(settings.root, 'other', 'SAME.md')] }),
    /trùng tên/,
  )
  await assert.rejects(readSources({ files: [settings.root] }), /file thường/)
  await assert.rejects(readSources({ files: [path.join(settings.root, '.env')] }), /credential/)
  assert.deepEqual(await listTickets(settings), [])
})

test('sync is idempotent; a change request adds a revision and invalidates downstream work', async (t) => {
  const settings = await workspace(t)
  const spec = (text) => fileSource('spec.md', Buffer.from(text))
  const created = await createTicket(settings, identity, [spec('v1'), chatSource('first')])
  const { ticket, directory } = created
  const changelog = await readFile(path.join(directory, 'changelog.md'), 'utf8')
  for (const same of [[], [spec('v1')], [chatSource('first')], [spec('v1'), chatSource('first')]])
    assert.equal((await syncTicket(settings, ticket, same)).changed, false)
  assert.equal(await readFile(path.join(directory, 'changelog.md'), 'utf8'), changelog)
  const second = await syncTicket(settings, ticket, [
    spec('v2'),
    fileSource('extra.md', Buffer.from('more')),
    chatSource('second'),
    chatSource('first'),
  ])
  assert.equal(second.revision, 2)
  assert.deepEqual(second.changes, [
    'item-replaced:r2/spec.md',
    'item-added:r2/extra.md',
    'item-added:r2/chat.md',
  ])
  assert.equal(second.stages.review.status, 'needs-revalidation')
  const state = await readState(directory, { ticket })
  assert.equal(state.history.length, 2)
  const snapshot = await readSnapshot(directory, state)
  assert.deepEqual(
    currentItems(snapshot).map((item) => item.id),
    ['r1/chat.md', 'r2/spec.md', 'r2/extra.md', 'r2/chat.md'],
  )
  // The superseded file stays on disk as history.
  const request = path.join(path.dirname(directory), 'request')
  assert.equal(await readFile(path.join(request, 'r1', 'spec.md'), 'utf8'), 'v1')
  assert.equal(await readFile(path.join(request, 'r2', 'spec.md'), 'utf8'), 'v2')
  // Stale projections can be rebuilt from state.
  await rm(path.join(directory, 'changelog.md'))
  await rm(path.join(directory, 'sync', 'source.md'))
  assert.equal((await syncTicket(settings, ticket)).changed, false)
  assert.match(await readFile(path.join(directory, 'changelog.md'), 'utf8'), /Revision 2/)
  assert.match(await readFile(path.join(directory, 'sync', 'source.md'), 'utf8'), /đã được thay thế/)
})

test('lock blocks concurrent writers without removing another writer lock', async (t) => {
  const settings = await workspace(t)
  const { ticket } = await createTicket(settings, identity, first())
  const directory = await ticketDirectory(settings, ticket)
  await withLock(directory, async () => {
    await assert.rejects(syncTicket(settings, ticket, [chatSource('more')]), /khóa/)
    await assert.rejects(
      withLock(directory, async () => {}),
      /khóa/,
    )
  })
  assert.equal((await syncTicket(settings, ticket)).revision, 1)
})
test('corrupt state, modified snapshot or modified request source fails closed', async (t) => {
  const settings = await workspace(t)
  const { ticket, directory } = await createTicket(settings, identity, first())
  const stateFile = path.join(directory, 'state.json'),
    stateText = await readFile(stateFile, 'utf8')
  await writeFile(stateFile, '{broken')
  await assert.rejects(syncTicket(settings, ticket), /hỏng/)
  assert.equal(await readFile(stateFile, 'utf8'), '{broken')
  await writeFile(stateFile, stateText)
  const snapshotFile = path.join(directory, JSON.parse(stateText).snapshot)
  const snapshotText = await readFile(snapshotFile, 'utf8')
  await writeFile(snapshotFile, '{}')
  await assert.rejects(syncTicket(settings, ticket), /đã bị sửa/)
  await writeFile(snapshotFile, snapshotText)
  const source = path.join(path.dirname(directory), 'request', 'r1', 'chat.md')
  await writeFile(source, 'edited requirement')
  await assert.rejects(syncTicket(settings, ticket, [chatSource('new')]), /request\/ đã bị sửa/)
  await rm(source)
  await assert.rejects(syncTicket(settings, ticket), /request\/ đã bị sửa/)
  assert.equal(await readFile(stateFile, 'utf8'), stateText)
  await assert.rejects(readState(directory, { ticket: 'T-2-other-ticket' }), /không khớp/)
})
test('an unrecorded request revision folder is never overwritten', async (t) => {
  const settings = await workspace(t)
  const { ticket, directory } = await createTicket(settings, identity, first())
  const orphan = path.join(path.dirname(directory), 'request', 'r2')
  await mkdir(orphan)
  await writeFile(path.join(orphan, 'chat.md'), 'left by an interrupted run')
  await assert.rejects(syncTicket(settings, ticket, [chatSource('change')]), /chưa được state ghi nhận/)
  assert.equal(await readFile(path.join(orphan, 'chat.md'), 'utf8'), 'left by an interrupted run')
  await rm(orphan, { recursive: true })
  assert.equal((await syncTicket(settings, ticket, [chatSource('change')])).revision, 2)
})
test('symlinked folders or files never let a write escape the vault', async (t) => {
  const settings = await workspace(t)
  const outside = path.join(settings.root, 'outside')
  await mkdir(outside)
  await mkdir(path.join(settings.docsRepo, 'docs'))
  if (!(await trySymlink(t, outside, settings.docsRoot, 'dir'))) return
  await assert.rejects(createTicket(settings, identity, first()), /symlink/)
  await rm(settings.docsRoot)
  const { ticket, directory } = await createTicket(settings, identity, first())
  const target = path.join(outside, 'protected')
  await writeFile(target, 'untouched')
  await rm(path.join(directory, 'changelog.md'))
  await trySymlink(t, target, path.join(directory, 'changelog.md'))
  await assert.rejects(syncTicket(settings, ticket), /symlink/)
  assert.equal(await readFile(target, 'utf8'), 'untouched')
})
