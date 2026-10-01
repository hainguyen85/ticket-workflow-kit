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
export function codeRevision(root) {
  if (git(root, ['status', '--porcelain', '--untracked-files=all']))
    fail('Working tree phải sạch trước review/release; giữ lại và xử lý thay đổi hiện có.')
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = git(root, ['symbolic-ref', '--short', 'HEAD'])
  return { head, branch }
}
