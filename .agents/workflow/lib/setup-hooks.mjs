import { chmod, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fail } from './config.mjs'
import { git } from './git.mjs'
import { linkSkills } from './skill-links.mjs'

// One policy (agent-hook.mjs), packaged for each supported agent runtime.
const runtimes = { codex: '.codex/hooks.json', claude: '.claude/settings.json' }

async function runtimeHooks(root) {
  const configured = []
  for (const [name, file] of Object.entries(runtimes)) {
    let text
    try {
      text = await readFile(path.join(root, file), 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    let hooks
    try {
      hooks = JSON.parse(text).hooks
    } catch {
      fail(`${file} không phải JSON hợp lệ.`)
    }
    const wired = (event) => JSON.stringify(hooks?.[event] ?? '').includes('agent-hook.mjs')
    if (!wired('UserPromptSubmit') || !wired('PreToolUse'))
      fail(`${file} thiếu runtime hook UserPromptSubmit/PreToolUse của workflow.`)
    configured.push(name)
  }
  if (!configured.length) fail('Thiếu runtime hook config (.codex/hooks.json hoặc .claude/settings.json).')
  return configured
}

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
  const configured = await runtimeHooks(root)
  git(root, ['config', '--local', 'core.hooksPath', '.githooks'])
  return {
    git: 'enabled-local',
    runtime: 'configured-needs-trust',
    runtimes: configured,
    ...(configured.includes('claude') ? { claudeSkills: await linkSkills(root) } : {}),
    next: 'Codex: mở session tại repo, vào /hooks để review/trust. Claude Code: mở session mới tại repo và chấp nhận hooks của project. Sau đó thử một lệnh bị chặn để xác nhận.',
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
