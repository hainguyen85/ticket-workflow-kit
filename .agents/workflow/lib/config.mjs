import { readFile, realpath, lstat, copyFile, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const CONFIG_FILE = '.agents/workflow.config.json'
export const LOCAL_FILE = '.agents/workflow.local.json'
export const LOCAL_EXAMPLE = '.agents/workflow.local.example.json'
export const CLI = 'node .agents/workflow/task.mjs'
export class WorkflowError extends Error {}
export function fail(message) {
  throw new WorkflowError(message)
}

export function checkNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number)
  if (!((major === 22 && minor >= 12) || major >= 24)) {
    fail('Cần Node.js 22.12+ thuộc nhánh 22 hoặc 24+.')
  }
}

export async function setup(root = repoRoot) {
  await mkdir(path.join(root, '.agents'), { recursive: true })
  const destination = path.join(root, LOCAL_FILE)
  try {
    await copyFile(path.join(root, LOCAL_EXAMPLE), destination, constants.COPYFILE_EXCL)
    return {
      local: 'created',
      next: `Điền docsRepo (đường dẫn tuyệt đối tới checkout của repo hồ sơ) trong ${LOCAL_FILE}; chạy ${CLI} doctor.`,
    }
  } catch (error) {
    if (error.code !== 'EEXIST') fail(`Không tạo được ${LOCAL_FILE}.`)
    return { local: 'preserved', next: `Chạy ${CLI} doctor.` }
  }
}

export function segment(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value))
    fail('Thành phần đường dẫn không hợp lệ.')
  return value
}
export function isWithin(parent, child) {
  const relative = path.relative(parent, child)
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

// Ticket ID = <key>-<slug>. The key is an external tracker key or the creation time.
export function ticketKey(value) {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/.test(value)
  )
    fail('Ticket key chỉ gồm chữ/số nối bằng - _ . và tối đa 40 ký tự.')
  return value
}
export function ticketSlug(value) {
  if (
    typeof value !== 'string' ||
    value.length > 60 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+){1,5}$/.test(value)
  )
    fail('Slug gồm 2–6 từ ASCII chữ thường nối bằng dấu gạch, ví dụ note-search.')
  return value
}
export function generatedKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    pad(date.getFullYear() % 100) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    '-' +
    pad(date.getHours()) +
    pad(date.getMinutes())
  )
}
export function ticketName(value) {
  if (typeof value !== 'string' || value.length > 110) fail('Ticket ID không hợp lệ.')
  return segment(value)
}

// Ticket types and the prefix each gives to a generated key (REQ-260930-1415). One type may be
// the change-request type: a ticket of that type follows up on work that was already handed off.
export function ticketTypes(value = {}) {
  const types = value.types ?? { req: 'REQ', cr: 'CR' }
  if (!types || typeof types !== 'object' || Array.isArray(types) || !Object.keys(types).length)
    fail('tickets.types phải là object {loại: PREFIX} không rỗng.')
  const prefixes = Object.values(types)
  if (
    Object.keys(types).some((name) => !/^[a-z][a-z0-9-]{0,19}$/.test(name)) ||
    prefixes.some((prefix) => typeof prefix !== 'string' || !/^[A-Z][A-Z0-9]{1,9}$/.test(prefix)) ||
    new Set(prefixes).size !== prefixes.length
  )
    fail(
      'tickets.types: tên loại là chữ thường; prefix gồm 2–10 chữ hoa/số, bắt đầu bằng chữ và không trùng nhau.',
    )
  const defaultType = value.defaultType ?? Object.keys(types)[0]
  if (!Object.hasOwn(types, defaultType)) fail('tickets.defaultType không có trong tickets.types.')
  const changeRequestType =
    value.changeRequestType === undefined
      ? Object.hasOwn(types, 'cr')
        ? 'cr'
        : null
      : value.changeRequestType
  if (changeRequestType !== null && !Object.hasOwn(types, changeRequestType))
    fail('tickets.changeRequestType không có trong tickets.types.')
  return { types, defaultType, changeRequestType }
}

async function readJson(file, label) {
  let stat
  try {
    stat = await lstat(file)
  } catch {
    fail(`Không đọc được ${label}. Chạy ${CLI} setup.`)
  }
  if (!stat.isFile()) fail(`${label} phải là file thường, không phải symlink.`)
  let value
  try {
    value = JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''))
  } catch {
    fail(`${label} không phải JSON hợp lệ.`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} phải là một JSON object.`)
  return value
}

const branchName = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(value) &&
  !value.endsWith('/') &&
  !value.includes('//') &&
  !value.includes('..')

export async function loadConfig(root = repoRoot) {
  const config = await readJson(path.join(root, CONFIG_FILE), CONFIG_FILE)
  const local = await readJson(path.join(root, LOCAL_FILE), LOCAL_FILE)
  if (config.schemaVersion !== 3) fail('Workflow config phải dùng schemaVersion 3.')
  const remote = config.git?.remote ?? 'origin'
  if (typeof remote !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(remote))
    fail('git.remote không hợp lệ.')
  const baseBranch = config.git?.baseBranch ?? 'main'
  if (!branchName(baseBranch) || baseBranch.startsWith('feature/'))
    fail('git.baseBranch không hợp lệ.')
  const protectedBranches = config.git?.protectedBranches ?? []
  if (!Array.isArray(protectedBranches) || !protectedBranches.every(branchName))
    fail('git.protectedBranches không hợp lệ.')
  const ticketsPath = config.docs?.ticketsPath ?? 'docs/tickets'
  if (typeof ticketsPath !== 'string' || !ticketsPath) fail('docs.ticketsPath không hợp lệ.')
  const segments = ticketsPath.split('/')
  segments.forEach(segment)
  const timeoutSeconds = config.checks?.timeoutSeconds ?? 600
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 7200)
    fail('checks.timeoutSeconds phải là số nguyên từ 1 đến 7200.')
  if (config.tickets !== undefined && (typeof config.tickets !== 'object' || !config.tickets))
    fail('tickets phải là một object.')
  const tickets = ticketTypes(config.tickets)
  if (Object.keys(local).some((key) => key !== 'docsRepo'))
    fail(`${LOCAL_FILE} chỉ hỗ trợ khóa docsRepo.`)
  if (typeof local.docsRepo !== 'string' || !path.isAbsolute(local.docsRepo))
    fail(`docsRepo trong ${LOCAL_FILE} phải là đường dẫn tuyệt đối tới checkout của repo hồ sơ.`)
  let docsRepo, canonicalRepo
  try {
    docsRepo = await realpath(local.docsRepo)
    canonicalRepo = await realpath(root)
    if (!(await lstat(docsRepo)).isDirectory()) fail('docsRepo phải là thư mục local.')
  } catch {
    fail('docsRepo chưa tồn tại hoặc không truy cập được.')
  }
  const docsRoot = path.join(docsRepo, ...segments)
  // Ticket records are written continuously. Inside the source repo they must be ignored by it,
  // otherwise every record would dirty the worktree and change the code fingerprint.
  const insideSource = isWithin(canonicalRepo, docsRoot)
  if (insideSource) {
    const probe = path.relative(canonicalRepo, path.join(docsRoot, '.probe'))
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', probe.split(path.sep).join('/')], {
      cwd: canonicalRepo,
      stdio: 'ignore',
    })
    if (ignored.status !== 0)
      fail(
        'Thư mục hồ sơ nằm trong repo source thì phải được thêm vào .gitignore của repo source.',
      )
  }
  return {
    config: {
      git: { remote, baseBranch, protectedBranches: [...new Set([...protectedBranches, baseBranch])] },
      docs: { ticketsPath },
      checks: { timeoutSeconds },
      tickets,
    },
    docsRepo,
    docsRoot,
    insideSource,
    repoRoot: canonicalRepo,
  }
}

export function publicTarget(settings, ticket = null) {
  return {
    ticket,
    documents: settings.docsRoot,
    remote: settings.config.git.remote,
    baseBranch: settings.config.git.baseBranch,
  }
}

// Best-effort redaction before content is written; not a DLP/security boundary.
export function redact(text) {
  return String(text ?? '')
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g,
      '[REDACTED PRIVATE KEY]',
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,}|glpat-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g,
      '[REDACTED]',
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|private[_-]?token|password|secret|GH_TOKEN)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9+/_.=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(Basic)\s+[A-Za-z0-9+/]{16,}={0,2}\b/gi, '$1 [REDACTED]')
}
