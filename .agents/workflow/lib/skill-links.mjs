import { lstat, mkdir, readdir, realpath, symlink, unlink, rmdir } from 'node:fs/promises'
import path from 'node:path'

export const SKILLS_SOURCE = '.agents/skills'
export const CLAUDE_SKILLS = '.claude/skills'

async function stat(target) {
  try {
    return await lstat(target)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
const same = (left, right) =>
  process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right

async function skillNames(root) {
  const source = path.join(root, SKILLS_SOURCE)
  if (!(await stat(source))?.isDirectory()) return []
  const names = []
  for (const entry of await readdir(source, { withFileTypes: true }))
    if (entry.isDirectory() && (await stat(path.join(source, entry.name, 'SKILL.md')))?.isFile())
      names.push(entry.name)
  return names.sort()
}

// linked: points at the kit's skill. stale: a link pointing elsewhere or nowhere (for example
// after the repo moved). conflict: a real file or folder that is not ours to replace.
async function state(root, name) {
  const link = path.join(root, CLAUDE_SKILLS, name)
  const info = await stat(link)
  if (!info) return 'missing'
  if (!info.isSymbolicLink()) return 'conflict'
  try {
    return same(await realpath(link), await realpath(path.join(root, SKILLS_SOURCE, name)))
      ? 'linked'
      : 'stale'
  } catch {
    return 'stale'
  }
}

export async function skillLinkStatus(root) {
  const result = {}
  for (const name of await skillNames(root)) result[name] = await state(root, name)
  return result
}

// Claude Code looks for skills in .claude/skills; the kit keeps its single copy in
// .agents/skills. Link instead of copying so the two can never drift apart.
export async function linkSkills(root) {
  const result = { linked: [], present: [], conflicts: [] }
  const names = await skillNames(root)
  if (!names.length) return result
  await mkdir(path.join(root, CLAUDE_SKILLS), { recursive: true })
  for (const name of names) {
    const target = path.join(root, SKILLS_SOURCE, name)
    const link = path.join(root, CLAUDE_SKILLS, name)
    const current = await state(root, name)
    if (current === 'linked') {
      result.present.push(name)
      continue
    }
    if (current === 'conflict') {
      result.conflicts.push(name)
      continue
    }
    if (current === 'stale') await unlink(link).catch(() => rmdir(link))
    try {
      await symlink(path.relative(path.dirname(link), target), link, 'dir')
    } catch (error) {
      if (error.code !== 'EPERM' || process.platform !== 'win32') throw error
      // Windows without Developer Mode cannot create symlinks; a junction needs no privilege.
      await symlink(target, link, 'junction')
    }
    result.linked.push(name)
  }
  return result
}
