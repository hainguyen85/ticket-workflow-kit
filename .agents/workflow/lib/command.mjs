import { spawn, spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { fail } from './config.mjs'

const OUTPUT_LIMIT = 64 * 1024 * 1024

function isFile(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

// Windows resolves `mvn` to mvn.cmd only through a shell. Find the real file instead, so the
// plan's argv never passes through shell expansion.
function findWindowsExecutable(executable, cwd, env) {
  const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const suffixes = path.extname(executable) ? ['', ...extensions] : extensions
  const folders =
    path.isAbsolute(executable) || /[\\/]/.test(executable)
      ? [cwd]
      : [cwd, ...(env.Path || env.PATH || '').split(';').filter(Boolean)]
  for (const folder of folders)
    for (const suffix of suffixes) {
      const candidate = path.resolve(folder, executable + suffix)
      if (isFile(candidate)) return candidate
    }
  return null
}

export function resolveCommand(command, cwd, platform = process.platform, env = process.env) {
  const [executable, ...args] = command
  if (executable === 'node') return { file: process.execPath, args, options: {} }
  if (platform !== 'win32') return { file: executable, args, options: {} }
  const found = findWindowsExecutable(executable, cwd, env)
  if (!found || !/\.(?:cmd|bat)$/i.test(found))
    return { file: found ?? executable, args, options: {} }
  // Batch files only run through cmd.exe. Quote every argument and refuse the characters
  // cmd would still interpret inside quotes, rather than trying to escape them.
  for (const value of [found, ...args])
    if (/["%!^&|<>\r\n]/.test(value) || value.endsWith('\\'))
      fail(
        'Check gọi file .cmd/.bat với tham số chứa ký tự đặc biệt của cmd (" % ! ^ & | < >); bọc lệnh trong một script riêng.',
      )
  const line = [found, ...args].map((value) => `"${value}"`).join(' ')
  return {
    file: env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    options: { windowsVerbatimArguments: true },
  }
}

function killTree(child) {
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
}

// Run one check. A timeout kills the whole process tree: a build tool usually forks a JVM.
export function execute(command, { cwd, env, timeoutSeconds }) {
  const { file, args, options } = resolveCommand(command, cwd)
  return new Promise((resolve) => {
    const chunks = []
    let size = 0,
      timedOut = false,
      overflow = false,
      child
    const done = (status, signal, error) =>
      resolve({
        status,
        signal,
        error: error || timedOut || overflow,
        timedOut,
        output: Buffer.concat(chunks).toString('utf8'),
      })
    try {
      child = spawn(file, args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
      })
    } catch {
      return done(null, null, true)
    }
    const collect = (chunk) => {
      size += chunk.length
      if (size <= OUTPUT_LIMIT) chunks.push(chunk)
      else if (!overflow) {
        overflow = true
        killTree(child)
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutSeconds * 1000)
    child.on('error', () => {
      clearTimeout(timer)
      done(null, null, true)
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      done(status, signal, false)
    })
  })
}
