import { readFile, realpath, lstat, copyFile, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
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

// Deliberately small data-only format: no shell expansion, multiline or executable syntax.
export function parseConfigEnv(text) {
  const result = {}
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const match =
      /^\s*(GH_TOKEN|WORKSHOP_DOCS_ROOT|GH_REPO|GH_ISSUE|GH_PROJECT_URL|GH_PROJECT_OWNER|GH_PROJECT_NUMBER|GH_BASE_BRANCH)\s*=\s*(.*?)\s*$/.exec(
        line,
      )
    if (!match || Object.hasOwn(result, match[1]))
      fail('Env sai định dạng, trùng hoặc có biến không hỗ trợ.')
    let value = match[2]
    if (value.startsWith('"') || value.startsWith("'")) {
      if (value.at(-1) !== value[0] || value.length < 2) fail('Env có dấu nháy chưa đóng.')
      value = value.slice(1, -1)
    }
    if (/[\r\n\0]/.test(value) || value.includes('$(') || value.includes('`'))
      fail('Env chỉ được chứa giá trị, không chứa lệnh.')
    result[match[1]] = value
  }
  return result
}

export async function setup(root = repoRoot) {
  await mkdir(path.join(root, '.agents'), { recursive: true })
  const destination = path.join(root, '.agents/.env.workflow.local')
  try {
    await copyFile(
      path.join(root, '.agents/.env.workflow.example'),
      destination,
      constants.COPYFILE_EXCL,
    )
    const { chmod } = await import('node:fs/promises')
    await chmod(destination, 0o600)
    return {
      env: 'created',
      next: 'Điền PAT, documents root, repo và URL Project trong .agents/.env.workflow.local; chạy pnpm workshop:check.',
    }
  } catch (error) {
    if (error.code !== 'EEXIST') fail('Không tạo được .agents/.env.workflow.local.')
    return { env: 'preserved', next: 'Chạy pnpm workshop:check.' }
  }
}

export function segment(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value))
    fail('Thành phần đường dẫn không hợp lệ.')
  return value
}
export function issueNumber(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    fail('Issue ID phải là số nguyên dương an toàn.')
  return Number(value)
}
export function isWithin(parent, child) {
  const relative = path.relative(parent, child)
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

export async function loadConfig(root = repoRoot) {
  let env, config
  try {
    const envPath = path.join(root, '.agents/.env.workflow.local')
    if (!(await lstat(envPath)).isFile()) fail('Env phải là file thường, không phải symlink.')
    env = parseConfigEnv(await readFile(envPath, 'utf8'))
    config = JSON.parse(await readFile(path.join(root, 'workshop.config.json'), 'utf8'))
  } catch (error) {
    if (error instanceof WorkflowError) throw error
    fail('Không đọc được cấu hình. Chạy pnpm workshop:setup và kiểm tra workshop.config.json.')
  }
  if (!env.GH_TOKEN || /[\s"'<>]/.test(env.GH_TOKEN))
    fail('Điền GH_TOKEN hợp lệ trong .agents/.env.workflow.local.')
  if (!env.WORKSHOP_DOCS_ROOT || !path.isAbsolute(env.WORKSHOP_DOCS_ROOT))
    fail('WORKSHOP_DOCS_ROOT phải là đường dẫn tuyệt đối theo hệ điều hành đang chạy.')
  let docsRoot, canonicalRepo
  try {
    docsRoot = await realpath(env.WORKSHOP_DOCS_ROOT)
    canonicalRepo = await realpath(root)
    if (!(await lstat(docsRoot)).isDirectory()) fail('Documents root phải là thư mục local.')
  } catch {
    fail('Documents root chưa tồn tại hoặc không truy cập được.')
  }
  if (isWithin(canonicalRepo, docsRoot)) fail('Documents root phải nằm ngoài repo.')
  if (config.schemaVersion !== 2 || config.github?.host !== 'github.com')
    fail('Workshop policy phải dùng schemaVersion 2; cập nhật bộ workflow.')
  const parts = env.GH_REPO?.split('/') ?? []
  if (parts.length !== 2) fail('Điền GH_REPO theo dạng owner/repository trong env.')
  parts.forEach(segment)
  const project = projectFromUrl(env.GH_PROJECT_URL)
  const configuredIssue = env.GH_ISSUE ? issueNumber(env.GH_ISSUE) : null
  const baseBranch = env.GH_BASE_BRANCH || 'main'
  if (
    !/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(baseBranch) ||
    baseBranch.endsWith('/') ||
    baseBranch.includes('//') ||
    baseBranch.startsWith('feature/')
  )
    fail('GH_BASE_BRANCH không hợp lệ.')
  if (config.release?.allowMerge !== false || config.release?.allowForcePush !== false)
    fail('Release policy không hợp lệ.')
  // Targets come only from this env, never from policy JSON or ambient GH_* variables.
  config.github = {
    host: 'github.com',
    repository: env.GH_REPO,
    issue: configuredIssue,
    baseBranch,
    pushUrl: `https://github.com/${env.GH_REPO}.git`,
    statusNames: ['Backlog', 'Analysis', 'Ready', 'In progress', 'Review', 'PR ready'],
    project,
  }
  config.release.protectedBranches = [
    ...new Set([...(config.release.protectedBranches ?? []), baseBranch]),
  ]
  return { config, token: env.GH_TOKEN, docsRoot, repoRoot: canonicalRepo }
}

// Match the original string so URL normalization cannot hide traversal or credentials.
export function projectFromUrl(value) {
  const match =
    /^https:\/\/github\.com\/(orgs|users)\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/projects\/([1-9]\d*)\/?$/.exec(
      value ?? '',
    )
  if (!match || !Number.isSafeInteger(Number(match[3])))
    fail(
      'Điền GH_PROJECT_URL đầy đủ, dạng https://github.com/orgs/<owner>/projects/<number> (hoặc /users/). Thay các biến owner/number cũ bằng URL này.',
    )
  return {
    owner: match[2],
    number: Number(match[3]),
    ownerType: match[1] === 'orgs' ? 'Organization' : 'User',
    url: `https://github.com/${match[1]}/${match[2]}/projects/${Number(match[3])}`,
  }
}

export function resolveIssue(settings, requested, { required = true } = {}) {
  const selected = requested ?? settings.config.github.issue
  if (selected === null || selected === undefined) {
    if (required) fail('Chưa chọn Issue. Truyền Issue ID trong lệnh, ví dụ: pnpm workshop:sync 1.')
    return null
  }
  return issueNumber(selected)
}

export function publicTarget(settings, selectedIssue = settings.config.github.issue) {
  const gh = settings.config.github
  return {
    repository: gh.repository,
    issue: selectedIssue ?? null,
    baseBranch: gh.baseBranch,
    project: { owner: gh.project.owner, number: gh.project.number, url: gh.project.url },
  }
}

// Best-effort redaction before content is written; not a DLP/security boundary.
export function redact(text, token = '') {
  let value = String(text ?? '')
  if (token) value = value.split(token).join('[REDACTED]')
  return value
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g,
      '[REDACTED PRIVATE KEY]',
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g,
      '[REDACTED]',
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|password|secret|GH_TOKEN)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9+/_.=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(Basic)\s+[A-Za-z0-9+/]{16,}={0,2}\b/gi, '$1 [REDACTED]')
}
