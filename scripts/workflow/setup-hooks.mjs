import { chmod, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fail } from './config.mjs'
import { git } from './git.mjs'

export async function setupHooks(root) {
  const existing = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (existing.status !== 0 && existing.status !== 1) fail('Không đọc được Git hooksPath.')
  if (existing.stdout.trim() && existing.stdout.trim() !== '.githooks')
    fail('Repo đang dùng hooksPath khác; cần tích hợp thủ công để giữ hooks hiện có.')
  for (const hook of ['pre-commit', 'commit-msg', 'pre-push'])
    await chmod(path.join(root, '.githooks', hook), 0o755)
  // Validate packaging before enabling it. No global changes or trust-store edits.
  const hooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'))
  if (!hooks.hooks?.UserPromptSubmit || !hooks.hooks?.PreToolUse) fail('Thiếu runtime hook config.')
  git(root, ['config', '--local', 'core.hooksPath', '.githooks'])
  return {
    git: 'enabled-local',
    runtime: 'configured-needs-trust',
    next: 'Mở session Codex tại repo, vào /hooks để review/trust hooks. Chỉ demo khi smoke test bằng key giả đã pass.',
  }
}

export function hookStatus(root) {
  const result = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: root,
    encoding: 'utf8',
  })
  return {
    git:
      result.status === 0 && result.stdout.trim() === '.githooks' ? 'enabled-local' : 'not-enabled',
    runtime: 'trust-and-session-smoke-not-verified',
  }
}
