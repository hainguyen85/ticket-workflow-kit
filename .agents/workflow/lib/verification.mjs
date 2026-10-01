import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat, readlink } from 'node:fs/promises'
import { fail, redact } from './config.mjs'
import { git } from './git.mjs'
import { inspectHook } from './policy.mjs'
import { execute } from './command.mjs'
import { regular, withLock, atomicWrite, projections, readSnapshot } from './vault.mjs'
import { context, stageArtifact, requireApproval } from './stages.mjs'

export const digest = (value) => createHash('sha256').update(value).digest('hex')
export const contextHash = (state) => digest(JSON.stringify(state.verificationContext ?? {}))
const text = (value) => typeof value === 'string' && value.trim().length > 0
export function validateDelivery(plan) {
  const delivery = plan.delivery
  if (
    !delivery ||
    !['runtime', 'artifact'].includes(delivery.kind) ||
    !['target', 'preparation', 'permissions', 'recovery'].every((key) => text(delivery[key])) ||
    !Array.isArray(delivery.checks) ||
    !delivery.checks.length ||
    new Set(delivery.checks).size !== delivery.checks.length ||
    delivery.checks.some(
      (id) =>
        !plan.requiredChecks?.some((check) => check.id === id && check.target === delivery.target),
    )
  )
    fail(
      'Plan cần delivery kind/target/preparation/permissions/recovery và checks gắn đúng target; Finalize lại plan.',
    )
}

function deliveryContext(plan, state) {
  if (
    plan.delivery.kind === 'runtime' &&
    (state.verificationContext?.deliveryTarget !== plan.delivery.target ||
      !text(state.verificationContext?.deliveryIdentity))
  )
    fail('Cần observe deliveryTarget và deliveryIdentity của môi trường bàn giao trước nghiệm thu.')
}

export function validatePlan(input, analysis) {
  if (!Array.isArray(input.requiredFacts) || !Array.isArray(analysis.observations))
    fail('Plan cần requiredFacts và analysis observations có căn cứ.')
  for (const id of input.requiredFacts) {
    const fact = analysis.observations.find((item) => item.id === id)
    if (!fact || fact.status !== 'observed' || !text(fact.evidence))
      fail(`Fact ${id} chưa observed; điều tra trước Finalize.`)
  }
  const checks = input.requiredChecks
  if (!Array.isArray(checks) || !checks.length) fail('Plan cần requiredChecks theo task.')
  const ids = new Set()
  for (const check of checks) {
    if (
      !/^[A-Za-z0-9_-]+$/.test(check.id ?? '') ||
      ids.has(check.id) ||
      !text(check.kind) ||
      !Array.isArray(check.ac) ||
      !check.ac.length ||
      !check.ac.every(text) ||
      !Array.isArray(check.command) ||
      !check.command.length ||
      !check.command.every(text)
    )
      fail('Required check cần ID duy nhất, kind, AC và command argv.')
    if (
      check.timeoutSeconds !== undefined &&
      (!Number.isInteger(check.timeoutSeconds) ||
        check.timeoutSeconds < 1 ||
        check.timeoutSeconds > 7200)
    )
      fail('timeoutSeconds của check phải là số nguyên từ 1 đến 7200.')
    ids.add(check.id)
  }
  if (!Array.isArray(input.steps) || !input.steps.length)
    fail('Plan cần steps do agent lập theo task.')
  const visited = new Set()
  // Ordered steps make dependencies executable and rule out forward edges and cycles.
  for (const step of input.steps) {
    if (
      !text(step.id) ||
      visited.has(step.id) ||
      !text(step.goal) ||
      !Array.isArray(step.dependsOn) ||
      step.dependsOn.some((id) => !visited.has(id)) ||
      !Array.isArray(step.checks) ||
      !step.checks.length ||
      step.checks.some((id) => !ids.has(id))
    )
      fail('Steps cần mục tiêu, dependencies theo thứ tự và check IDs hợp lệ.')
    visited.add(step.id)
  }
  if (checks.some((check) => !input.steps.some((step) => step.checks.includes(check.id))))
    fail('Mỗi required check phải thuộc ít nhất một step.')
  validateDelivery(input)
}

export async function fingerprint(root) {
  const files = [
    ...new Set(
      git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter(Boolean),
    ),
  ].sort()
  const values = []
  const regulars = []
  for (const name of files) {
    const file = path.join(root, name)
    let stat
    try {
      stat = await lstat(file)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (stat.isDirectory()) values.push([name, git(root, ['ls-files', '--stage', '--', name])])
    else if (stat.isSymbolicLink()) values.push([name, 'link', digest(await readlink(file))])
    else regulars.push([name, stat.mode & 0o111 ? 'exec' : 'file'])
  }
  if (regulars.length) {
    // Hash what Git would store, so a checkout that only converts line endings (autocrlf on
    // Windows) does not make evidence look stale.
    if (regulars.some(([name]) => /[\r\n]/.test(name))) fail('Tên file chứa ký tự xuống dòng.')
    const ids = git(root, ['hash-object', '--stdin-paths'], {
      input: regulars.map(([name]) => name).join('\n') + '\n',
    }).split('\n')
    if (ids.length !== regulars.length || ids.some((id) => !/^[a-f0-9]{40,64}$/.test(id)))
      fail('Không tính được fingerprint của source.')
    regulars.forEach(([name, kind], index) => values.push([name, kind, ids[index]]))
  }
  values.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return digest(JSON.stringify(values))
}

export async function runCheck(settings, ticket, checkId) {
  const { directory } = await context(settings, ticket)
  return withLock(directory, async () => {
    const { state } = await context(settings, ticket)
    await requireApproval(directory, state)
    const plan = await stageArtifact(directory, state, 'finalize')
    const check = plan.requiredChecks?.find((item) => item.id === checkId)
    if (!check) fail('Check ID không nằm trong plan đã duyệt.')
    const isDelivery = plan.delivery.checks.includes(checkId)
    if (isDelivery) deliveryContext(plan, state)
    const before = await fingerprint(settings.repoRoot)
    const denied = inspectHook({
      hook_event_name: 'PreToolUse',
      tool_input: { command: check.command.join(' ') },
    })
    if (denied) fail(denied)
    const timeoutSeconds = check.timeoutSeconds ?? settings.config.checks?.timeoutSeconds ?? 600
    const startedAt = new Date().toISOString()
    const run = await execute(check.command, {
      cwd: settings.repoRoot,
      timeoutSeconds,
      env: {
        ...process.env,
        WORKFLOW_CHECK_TARGET: check.target ?? '',
        WORKFLOW_DELIVERY_IDENTITY: isDelivery
          ? (state.verificationContext?.deliveryIdentity ?? '')
          : '',
      },
    })
    const after = await fingerprint(settings.repoRoot)
    const result = run.status === 0 && !run.error && before === after ? 'pass' : 'fail'
    const id = randomUUID()
    const folder = path.join(directory, 'evidence')
    await mkdir(folder, { recursive: true })
    await regular(folder, true)
    const log = redact(run.output)
    const record = {
      id: check.id,
      kind: check.kind,
      target: check.target ?? null,
      command: check.command,
      result,
      exitCode: run.status,
      signal: run.signal,
      startedAt,
      finishedAt: new Date().toISOString(),
      requirement: state.sourceHash,
      planHash: state.stages.finalize.hash,
      codeFingerprint: before,
      contextHash: contextHash(state),
      changedDuringRun: before !== after,
      executionError: Boolean(run.error),
      timedOut: run.timedOut,
      timeoutSeconds,
      log: `evidence/${id}.log`,
      logHash: digest(log),
    }
    await writeFile(path.join(folder, `${id}.log`), log, { flag: 'wx', mode: 0o600 })
    const content = JSON.stringify(record, null, 2) + '\n'
    const evidence = `evidence/${id}.json`
    await writeFile(path.join(directory, evidence), content, { flag: 'wx', mode: 0o600 })
    state.checkRuns ??= {}
    state.checkRuns[check.id] = { evidence, hash: digest(content) }
    for (const stage of ['implement', 'review', 'handoff']) {
      if (state.stages[stage].status !== 'not-started')
        state.stages[stage] = {
          ...state.stages[stage],
          status: 'needs-revalidation',
          reason: 'check-rerun',
        }
    }
    await atomicWrite(path.join(directory, 'state.json'), JSON.stringify(state, null, 2) + '\n')
    await projections(directory, state, await readSnapshot(directory, state))
    return {
      id: check.id,
      result,
      exitCode: run.status,
      timedOut: run.timedOut,
      changedDuringRun: before !== after,
      evidence,
      codeFingerprint: before,
    }
  })
}

export async function verifiedChecks(settings, directory, state) {
  const plan = await stageArtifact(directory, state, 'finalize')
  if (!Array.isArray(plan.requiredChecks) || !plan.requiredChecks.length)
    fail('Plan chưa có requiredChecks; Finalize và duyệt plan mới trước verification.')
  validateDelivery(plan)
  deliveryContext(plan, state)
  const current = await fingerprint(settings.repoRoot)
  const results = []
  for (const check of plan.requiredChecks) {
    const ref = state.checkRuns?.[check.id]
    if (!ref || !/^evidence\/[a-f0-9-]+\.json$/.test(ref.evidence))
      fail(`Required check ${check.id} chưa chạy qua helper.`)
    await regular(path.join(directory, 'evidence'), true)
    const file = path.join(directory, ref.evidence)
    if (!(await regular(file))) fail('Thiếu evidence record.')
    const raw = await readFile(file, 'utf8')
    if (digest(raw) !== ref.hash) fail('Evidence record đã bị sửa.')
    const result = JSON.parse(raw)
    if (
      !/^evidence\/[a-f0-9-]+\.log$/.test(result.log) ||
      !(await regular(path.join(directory, result.log))) ||
      digest(await readFile(path.join(directory, result.log))) !== result.logHash
    )
      fail('Evidence log đã bị sửa hoặc thiếu.')
    if (
      result.id !== check.id ||
      result.kind !== check.kind ||
      result.target !== (check.target ?? null) ||
      JSON.stringify(result.command) !== JSON.stringify(check.command) ||
      result.result !== 'pass' ||
      result.exitCode !== 0 ||
      result.changedDuringRun ||
      result.planHash !== state.stages.finalize.hash ||
      result.codeFingerprint !== current ||
      result.contextHash !== contextHash(state)
    )
      fail(
        `Required check ${check.id} fail hoặc evidence đã cũ; chạy lại check trên trạng thái hiện tại.`,
      )
    results.push({ ...result, evidence: ref.evidence })
  }
  return results
}
