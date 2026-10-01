import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
test('startup wrapper handles paths with spaces, preserves env and stops after failed install', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workshop startup '))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'test bin')
  await mkdir(bin)
  await mkdir(path.join(root, 'scripts'))
  for (const file of ['start-local.bat', 'start-local.sh', 'scripts/start-local.mjs'])
    await cp(path.join(projectRoot, file), path.join(root, file))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@10.32.1' }),
  )
  await writeFile(path.join(root, '.env.example'), 'PAYLOAD_SECRET=REPLACE_WITH_RANDOM_SECRET\n')
  const stub = path.join(bin, 'stub.mjs')
  await writeFile(
    stub,
    `import {appendFileSync, existsSync} from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') console.log('10.32.1');
else {
  appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
  if(args[0] === 'install' && existsSync('fail-install')) process.exit(1);
}`,
  )
  const windows = process.platform === 'win32'
  await writeFile(
    path.join(bin, windows ? 'pnpm.cmd' : 'pnpm'),
    windows
      ? `@echo off\r\n"${process.execPath}" "${stub}" %*\r\nexit /b %errorlevel%\r\n`
      : `#!/bin/sh\nexec '${process.execPath}' '${stub}' "$@"\n`,
    { mode: 0o755 },
  )
  // Windows environment keys are case-insensitive; avoid duplicate Path/PATH entries.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'),
  )
  env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? process.env.Path}`
  const run = () =>
    spawnSync(
      windows ? 'cmd.exe' : 'bash',
      windows ? ['/d', '/s', '/c', 'start-local.bat'] : ['start-local.sh'],
      { cwd: root, env, encoding: 'utf8', timeout: 15000 },
    )
  let result = run()
  assert.equal(result.status, 0, result.stderr)
  const content = await readFile(path.join(root, '.env'), 'utf8')
  assert.match(content, /^PAYLOAD_SECRET=[a-f0-9]{64}\n$/)
  assert.ok(!result.stdout.includes(content.trim()))
  const calls = async () =>
    (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(await calls(), [
    ['install', '--frozen-lockfile'],
    ['dev', '--hostname', '127.0.0.1', '--port', '3000'],
  ])
  await writeFile(path.join(root, 'calls.jsonl'), '')
  await writeFile(path.join(root, 'fail-install'), '')
  result = run()
  assert.equal(result.status, 1)
  assert.equal(await readFile(path.join(root, '.env'), 'utf8'), content)
  assert.deepEqual(await calls(), [['install', '--frozen-lockfile']])
})
