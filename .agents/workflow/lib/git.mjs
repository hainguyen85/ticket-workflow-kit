import { spawnSync } from 'node:child_process'
import { fail } from './config.mjs'

export function git(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120000,
    ...options,
  })
  if (result.status !== 0)
    fail(
      'Git command thất bại; kiểm tra repository, quyền hoặc xung đột. Output thô đã được giữ kín.',
    )
  return result.stdout.trimEnd()
}
// For probes whose failure is an answer (missing ref, offline remote), not an error.
export function tryGit(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120000,
    ...options,
  })
  return { ok: result.status === 0, stdout: (result.stdout ?? '').trimEnd() }
}
// Never let a helper-run network command wait on an interactive credential prompt.
export const quietEnv = () => ({ ...process.env, GIT_TERMINAL_PROMPT: '0' })

export function identity(root) {
  const name = tryGit(root, ['config', 'user.name']).stdout.trim()
  const email = tryGit(root, ['config', 'user.email']).stdout.trim()
  if (!name || !email || /[\r\n<>]/.test(name + email))
    fail('Cần cấu hình git user.name và user.email để ghi author hồ sơ.')
  return `${name} <${email}>`
}
export function codeRevision(root) {
  if (git(root, ['status', '--porcelain', '--untracked-files=all']))
    fail('Working tree phải sạch trước review/handoff; giữ lại và xử lý thay đổi hiện có.')
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = git(root, ['symbolic-ref', '--short', 'HEAD'])
  return { head, branch }
}
