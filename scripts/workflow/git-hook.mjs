import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { git } from './git.mjs'
import { hasSecret, checkMetadata } from './policy.mjs'
import { fail, WorkflowError } from './config.mjs'

export function checkFiles(root, tree = null) {
  const files = git(
    root,
    tree
      ? ['ls-tree', '-r', '--name-only', '-z', tree]
      : ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  )
    .split('\0')
    .filter(Boolean)
  for (const file of files) {
    if (/(^|\/)\.env($|\.)/.test(file) && !/\.example$/.test(file))
      fail('Không được commit file env chứa cấu hình local.')
    if (/(^|\/)(?:id_rsa|id_ed25519)$|\.(?:pem|p12|pfx)$/.test(file))
      fail('Không được commit private-key file.')
    const content = git(root, ['show', tree ? `${tree}:${file}` : `:${file}`])
    if (hasSecret(content))
      fail('Phát hiện mẫu secret trong nội dung chuẩn bị commit/push; không ghi lên remote.')
  }
}
export function checkPush(root, config, input) {
  const zero = /^0+$/
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const [localRef, localSha, remoteRef, remoteSha, extra] = line.trim().split(/\s+/)
    if (
      extra ||
      !localRef ||
      !/^[a-f0-9]{40,64}$/.test(localSha ?? '') ||
      !/^[a-f0-9]{40,64}$/.test(remoteSha ?? '')
    )
      fail('Pre-push input không hợp lệ.')
    if (
      !remoteRef?.startsWith('refs/heads/feature/') ||
      config.release.protectedBranches.includes(remoteRef.slice('refs/heads/'.length))
    )
      fail('Chỉ được push feature branch; nhánh bảo vệ không được phép.')
    checkMetadata(remoteRef)
    if (zero.test(localSha)) fail('Không xóa remote branch trong workflow workshop.')
    if (!zero.test(remoteSha)) git(root, ['merge-base', '--is-ancestor', remoteSha, localSha])
    const commits = git(root, [
      'rev-list',
      zero.test(remoteSha) ? localSha : `${remoteSha}..${localSha}`,
    ])
      .split('\n')
      .filter(Boolean)
    if (commits.length > 200) fail('Dải push vượt giới hạn workshop; cần thu hẹp lịch sử.')
    for (const commit of commits) {
      checkMetadata(git(root, ['show', '-s', '--format=%B%n%an <%ae>%n%cn <%ce>', commit]))
      checkFiles(root, commit)
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel'])
    const command = process.argv[2]
    if (command === 'pre-commit') {
      const branch = git(root, ['symbolic-ref', '--short', 'HEAD'])
      checkMetadata(
        branch,
        git(root, ['var', 'GIT_AUTHOR_IDENT']),
        git(root, ['var', 'GIT_COMMITTER_IDENT']),
      )
      checkFiles(root)
    } else if (command === 'commit-msg') {
      const message = await readFile(process.argv[3], 'utf8')
      checkMetadata(message)
      if (
        !/^(?:feat|fix|refactor|test|docs|chore|perf|build|ci)(?:\([a-z0-9_-]+\))?: .+/m.test(
          message,
        )
      )
        fail('Commit phải dùng Conventional Commits: feat|fix|docs|...: mô tả.')
    } else if (command === 'pre-push') {
      let input = ''
      for await (const chunk of process.stdin) input += chunk
      const config = JSON.parse(await readFile(path.join(root, 'workshop.config.json'), 'utf8'))
      checkPush(root, config, input)
    } else fail('Git hook không hợp lệ.')
  } catch (error) {
    process.stderr.write(
      `Workshop guard: ${error instanceof WorkflowError ? error.message : 'Kiểm tra thất bại; thao tác bị chặn.'}\n`,
    )
    process.exitCode = 1
  }
}
