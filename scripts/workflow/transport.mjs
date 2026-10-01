import path from 'node:path'
import { git } from './git.mjs'
import { verifyCheckout } from './target.mjs'
import { fail } from './config.mjs'

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
export function transport(settings) {
  verifyCheckout(settings)
  const helper = `!${shellQuote(process.execPath.replaceAll('\\', '/'))} ${shellQuote(path.join(settings.repoRoot, 'scripts/workflow/credential.mjs').replaceAll('\\', '/'))}`
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  for (const key of Object.keys(env))
    if (
      /^(?:GIT_TRACE|GIT_CURL_VERBOSE|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG|GH_TOKEN|GITHUB_TOKEN)/.test(
        key,
      )
    )
      delete env[key]
  const args = [
    '-c',
    'credential.helper=',
    '-c',
    `credential.helper=${helper}`,
    '-c',
    'credential.useHttpPath=true',
    '-c',
    'http.followRedirects=false',
    '-c',
    'core.askPass=',
  ]
  const url = settings.config.github.pushUrl
  if (url !== `https://github.com/${settings.config.github.repository}.git`)
    fail('Đích Git HTTPS không hợp lệ.')
  return {
    fetchBase() {
      return git(
        settings.repoRoot,
        [
          ...args,
          'fetch',
          '--no-tags',
          url,
          `${settings.config.github.baseBranch}:refs/remotes/workshop/${settings.config.github.baseBranch}`,
        ],
        { env },
      )
    },
    remoteHead(branch) {
      return (
        git(settings.repoRoot, [...args, 'ls-remote', '--heads', url, `refs/heads/${branch}`], {
          env,
        }).split(/\s+/)[0] || null
      )
    },
    push(branch) {
      return git(settings.repoRoot, [...args, 'push', url, `HEAD:refs/heads/${branch}`], { env })
    },
  }
}
