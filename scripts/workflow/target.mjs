import { git } from './git.mjs'
import { fail } from './config.mjs'

export function repositoryFromRemote(value) {
  const scp = /^git@github\.com:([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/i.exec(value)
  if (scp) return scp[1]
  try {
    const url = new URL(value)
    if (
      url.hostname.toLowerCase() !== 'github.com' ||
      url.search ||
      url.hash ||
      url.port ||
      url.password ||
      !['https:', 'ssh:'].includes(url.protocol) ||
      (url.protocol === 'https:' ? url.username : url.username !== 'git')
    )
      return null
    const match = /^\/([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function verifyCheckout(settings) {
  const urls = git(settings.repoRoot, ['remote', 'get-url', '--all', 'origin']).split('\n')
  if (
    urls.length !== 1 ||
    repositoryFromRemote(urls[0])?.toLowerCase() !== settings.config.github.repository.toLowerCase()
  )
    fail(
      'GH_REPO không khớp origin của checkout. Kiểm tra repo/env; helper không tự đổi remote hoặc đích GitHub.',
    )
}
