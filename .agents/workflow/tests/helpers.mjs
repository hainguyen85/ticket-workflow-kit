import { mkdtemp, mkdir, writeFile, rm, symlink, cp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { git } from '../lib/git.mjs'
import { createTicket } from '../lib/vault.mjs'
import { chatSource } from '../lib/source.mjs'
import { recordStage } from '../lib/stages.mjs'

export const kitRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const author = 'Workflow Tester <tester@example.test>'
export const change = { summary: 'Record test stage', reason: 'Exercise workflow contract' }
export const config = () => ({
  git: { remote: 'origin', baseBranch: 'main', protectedBranches: ['main'] },
  docs: { ticketsPath: 'docs/tickets' },
  checks: { timeoutSeconds: 60 },
  tickets: { types: { req: 'REQ', cr: 'CR' }, defaultType: 'req', changeRequestType: 'cr' },
})

// A source repo with a real bare remote, plus a documents repo checkout: separate by default,
// or (docsInside) a git-ignored folder inside the source repo.
export async function workspace(t, file = 'feature.txt', { docsInside = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repoRoot = path.join(root, 'repo'),
    docsRepo = docsInside ? path.join(repoRoot, 'team-docs') : path.join(root, 'team-docs'),
    remote = path.join(root, 'remote.git')
  await mkdir(repoRoot)
  await mkdir(docsRepo)
  git(repoRoot, ['init', '-b', 'main'])
  git(repoRoot, ['config', 'user.name', 'Workflow Tester'])
  git(repoRoot, ['config', 'user.email', 'tester@example.test'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repoRoot, file), 'baseline\n')
  if (docsInside) await writeFile(path.join(repoRoot, '.gitignore'), 'team-docs/\n')
  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-m', 'chore: initialize fixture'])
  git(root, ['init', '--bare', remote])
  git(repoRoot, ['remote', 'add', 'origin', remote])
  git(repoRoot, ['push', 'origin', 'main:main']) // also creates refs/remotes/origin/main
  return {
    root,
    repoRoot,
    docsRepo,
    docsRoot: path.join(docsRepo, 'docs', 'tickets'),
    remote,
    author,
    config: config(),
    base: git(repoRoot, ['rev-parse', 'HEAD']),
  }
}

// The parts of the kit a project commits besides .agents/: Git hooks and one hook config per
// agent runtime.
export async function installHooks(repoRoot) {
  for (const folder of ['.githooks', '.codex'])
    await cp(path.join(kitRoot, folder), path.join(repoRoot, folder), { recursive: true })
  await mkdir(path.join(repoRoot, '.claude'), { recursive: true })
  await cp(
    path.join(kitRoot, '.claude/settings.json'),
    path.join(repoRoot, '.claude/settings.json'),
  )
}

export async function ticketFixture(
  t,
  { key = 'T-1', slug = 'search-articles', file, docsInside } = {},
) {
  const settings = await workspace(t, file, { docsInside })
  const { ticket } = await createTicket(settings, { key, slug, title: 'Search articles' }, [
    chatSource('Find articles by body text.'),
  ])
  git(settings.repoRoot, ['switch', '--no-track', '-c', `feature/${ticket}`])
  await recordStage(settings, ticket, 'intake', {
    change,
    revision: 1,
    translatedSourceIds: ['r1/chat.md'],
    documents: { 'task.md': 'Test intake document.' },
  })
  return { settings, ticket }
}

// Creating symlinks needs Developer Mode or elevation on Windows; skip instead of failing.
export async function trySymlink(t, target, link, type) {
  try {
    await symlink(target, link, type)
    return true
  } catch (error) {
    if (error.code !== 'EPERM') throw error
    t.skip('Máy không cho tạo symlink (Windows cần Developer Mode).')
    return false
  }
}
