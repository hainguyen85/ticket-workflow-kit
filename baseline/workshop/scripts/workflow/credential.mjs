import { loadConfig, repoRoot } from './config.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export function credentialResponse(settings, request, operation) {
  if (operation !== 'get') return '' // Do not store or erase credentials globally.
  const fields = Object.fromEntries(
    request
      .trim()
      .split('\n')
      .map((line) => {
        const split = line.indexOf('=')
        return [line.slice(0, split), line.slice(split + 1)]
      }),
  )
  if (
    fields.protocol !== 'https' ||
    fields.host !== 'github.com' ||
    fields.path?.replace(/\.git$/, '') !== settings.config.github.repository ||
    (fields.username && fields.username !== 'x-access-token')
  )
    return ''
  return `username=x-access-token\npassword=${settings.token}\n\n`
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let input = ''
    for await (const chunk of process.stdin) {
      input += chunk
      if (input.length > 8192) throw Error('limit')
    }
    const response = credentialResponse(await loadConfig(repoRoot), input, process.argv[2])
    // Private credential-helper protocol: stdout goes only to Git, never invoke directly in chat.
    process.stdout.write(response)
  } catch {
    process.exitCode = 1
  }
}
