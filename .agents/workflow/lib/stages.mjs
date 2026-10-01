import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fail, redact } from './config.mjs'
import {
  ticketDirectory,
  withLock,
  readState,
  readSnapshot,
  currentItems,
  regular,
  atomicWrite,
  projections,
} from './vault.mjs'
import { codeRevision, git } from './git.mjs'
import { checkBranch, hasSecret } from './policy.mjs'
import { validatePlan, validateDelivery, verifiedChecks, fingerprint } from './verification.mjs'

import { documentVersion } from './document-history.mjs'

const order = ['intake', 'analysis', 'finalize', 'implement', 'review', 'handoff']
const digest = (text) => createHash('sha256').update(text).digest('hex')
const json = (value) => JSON.stringify(value, null, 2) + '\n'
const requiredDocs = {
  intake: ['task.md'],
  analysis: ['task.md'],
  finalize: ['plan.md'],
  implement: ['checks.md'],
  checkpoint: ['checks.md'],
  review: ['checks.md'],
  approve: [],
  observe: [],
  'review-findings': ['checks.md'],
}

export async function context(settings, ticket) {
  const directory = await ticketDirectory(settings, ticket, false)
  const state = await readState(directory, { ticket })
  if (!state) fail('Chưa có hồ sơ; sync ticket trước.')
  return { directory, state }
}
export async function stageArtifact(
  directory,
  state,
  stage,
  statuses = ['complete', 'verified', 'reviewed'],
) {
  const record = state.stages[stage]
  if (!statuses.includes(record.status) || record.sourceRevision !== state.revision)
    fail(`Stage ${stage} chưa hoàn tất ở source revision hiện tại.`)
  if (!new RegExp(`^${stage}/[a-f0-9-]+/record\\.json$`).test(record.artifact ?? ''))
    fail('Artifact path không hợp lệ.')
  const folder = path.dirname(path.join(directory, record.artifact))
  await regular(path.join(directory, stage), true)
  await regular(folder, true)
  const file = path.join(directory, record.artifact)
  if (!(await regular(file))) fail('Thiếu artifact của stage.')
  const text = await readFile(file, 'utf8')
  if (digest(text) !== record.hash)
    fail('Artifact đã bị sửa sau khi ghi nhận; phải ghi revision stage mới.')
  let artifact
  try {
    artifact = JSON.parse(text)
  } catch {
    fail('Artifact JSON hỏng.')
  }
  // Markdown files are views of the recorded content and must agree with their record.
  for (const [name, content] of Object.entries(artifact.documents ?? {})) {
    if (!/^[a-z][a-z0-9-]*\.md$/.test(name)) fail('Tên tài liệu stage không hợp lệ.')
    const doc = path.join(folder, name)
    if (!(await regular(doc)) || (await readFile(doc, 'utf8')) !== content)
      fail('Tài liệu đã đổi ngoài stage helper; ghi nhận lại stage.')
  }
  return artifact
}

export async function persistStage(
  directory,
  state,
  stage,
  payload,
  status = 'complete',
  author = null,
) {
  const id = randomUUID(),
    folder = path.join(directory, stage, id)
  await regular(path.join(directory, stage), true)
  await mkdir(folder)
  const at = new Date().toISOString()
  const metadata = documentVersion(state, stage, payload, status, id, author, at)
  payload = { ...payload, metadata }
  const data = json(payload)
  await writeFile(path.join(folder, 'record.json'), data, { flag: 'wx', mode: 0o600 })
  for (const [name, content] of Object.entries(payload.documents ?? {})) {
    if (!/^[a-z][a-z0-9-]*\.md$/.test(name)) fail('Tên tài liệu không hợp lệ.')
    await writeFile(path.join(folder, name), content, { flag: 'wx', mode: 0o600 })
  }
  const record = {
    status,
    sourceRevision: state.revision,
    artifact: `${stage}/${id}/record.json`,
    hash: digest(data),
    ...(payload.code ? { code: payload.code } : {}),
  }
  state.documentHistory ??= {}
  const history = (state.documentHistory[metadata.document] ??= [])
  if (history.at(-1)?.signature !== metadata.signature)
    history.push({
      artifact: record.artifact,
      hash: record.hash,
      version: metadata.version,
      signature: metadata.signature,
    })
  state.stages[stage] = record
  state.workflowEvents ??= []
  state.workflowEvents.push({
    action: payload.action ?? stage,
    revision: state.revision,
    at,
    author,
    artifact: record.artifact,
  })
  await atomicWrite(path.join(directory, 'state.json'), json(state))
  await projections(directory, state, await readSnapshot(directory, state))
  return record
}

export async function recordStage(settings, ticket, action, input) {
  const author = settings.author ?? null
  const { directory } = await context(settings, ticket)
  return withLock(directory, async () => {
    const { state } = await context(settings, ticket)
    if (!Object.hasOwn(requiredDocs, action) || input.revision !== state.revision)
      fail('Action hoặc source revision không hợp lệ; sync và đọc lại state.')
    if (
      !requiredDocs[action].every(
        (name) => typeof input.documents?.[name] === 'string' && input.documents[name].trim(),
      )
    )
      fail('Thiếu tài liệu bắt buộc của stage.')
    if (
      Object.entries(input.documents ?? {}).some(
        ([name, text]) => !/^[a-z][a-z0-9-]*\.md$/.test(name) || typeof text !== 'string',
      )
    )
      fail('Documents phải là tên .md và nội dung text.')
    if (
      requiredDocs[action].length &&
      (!input.change ||
        !['summary', 'reason'].every(
          (key) => typeof input.change[key] === 'string' && input.change[key].trim(),
        ))
    )
      fail('Document stage cần change.summary và change.reason cho changelog.')
    const raw = JSON.stringify(input)
    if (hasSecret(raw) || redact(raw) !== raw)
      fail('Artifact chứa mẫu secret; sửa trước khi ghi hồ sơ.')
    let code
    if (action === 'observe') {
      if (
        !input.context ||
        typeof input.context !== 'object' ||
        Array.isArray(input.context) ||
        !input.evidence
      )
        fail('Observe cần context facts và evidence đã kiểm tra, không chứa credentials.')
      if (JSON.stringify(state.verificationContext) !== JSON.stringify(input.context)) {
        state.verificationContext = input.context
        state.contextEvidence = input.evidence
        for (const stage of ['implement', 'review', 'handoff'])
          state.stages[stage] = {
            ...state.stages[stage],
            status: 'needs-revalidation',
            reason: 'context-changed',
          }
      }
      const id = randomUUID()
      const folder = path.join(directory, 'observations')
      await mkdir(folder, { recursive: true })
      await regular(folder, true)
      await writeFile(
        path.join(folder, `${id}.json`),
        json({ ...input, recordedBy: author, at: new Date().toISOString() }),
        { flag: 'wx', mode: 0o600 },
      )
      await atomicWrite(path.join(directory, 'state.json'), json(state))
      await projections(directory, state, await readSnapshot(directory, state))
      return { directory, context: state.verificationContext }
    }
    if (action === 'intake') {
      const ids = currentItems(await readSnapshot(directory, state))
        .map((item) => item.id)
        .sort()
      if (
        !Array.isArray(input.translatedSourceIds) ||
        JSON.stringify([...input.translatedSourceIds].sort()) !== JSON.stringify(ids)
      )
        fail(
          'Bản tóm tắt phải đối chiếu đủ từng nguồn hiện hành trong request/ qua translatedSourceIds.',
        )
    }
    if (action === 'analysis') {
      await stageArtifact(directory, state, 'intake')
      if (
        !Array.isArray(input.observations) ||
        !input.observations.length ||
        new Set(input.observations.map((item) => item.id)).size !== input.observations.length ||
        input.observations.some(
          (item) =>
            !item.id ||
            !['observed', 'inferred', 'unknown'].includes(item.status) ||
            !item.description ||
            (item.status === 'observed' && !item.evidence),
        )
      )
        fail(
          'Analysis cần observations observed/inferred/unknown và evidence cho facts đã quan sát.',
        )
    }
    if (action === 'finalize') {
      const analysis = await stageArtifact(directory, state, 'analysis')
      validatePlan(input, analysis)
      if (
        !input.decision?.optionId ||
        !input.decision?.rationale ||
        !Array.isArray(input.files) ||
        !input.files.length ||
        input.files.some(
          (file) =>
            typeof file !== 'string' ||
            file.startsWith('/') ||
            file.includes('..') ||
            /[\\\r\n\0]/.test(file),
        )
      )
        fail('Finalize cần hướng đã chọn, lý do và danh sách file dự kiến thay đổi.')
      if (
        !Array.isArray(input.risks) ||
        input.risks.some(
          (risk) =>
            !['low', 'medium', 'high', 'critical'].includes(risk.severity) ||
            (['high', 'critical'].includes(risk.severity) &&
              (risk.resolution !== 'mitigated' ||
                typeof risk.mitigation !== 'string' ||
                !risk.mitigation.trim())),
        )
      )
        fail('Finalize còn risk high/critical chưa có mitigation.')
    }
    if (action === 'approve') {
      await stageArtifact(directory, state, 'finalize')
      if (input.decision !== 'approved' || !input.approvedBy || !input.evidence)
        fail('Cần quyết định duyệt plan và nguồn xác nhận từ developer.')
      state.approval = {
        sourceRevision: state.revision,
        finalizeHash: state.stages.finalize.hash,
        approvedBy: input.approvedBy,
        evidence: input.evidence,
        at: new Date().toISOString(),
        recordedBy: author,
      }
      // Approval is a separately versioned event, not a replacement of the finalized spec.
      const id = randomUUID(),
        artifact = `finalize/${id}/approval.json`
      await mkdir(path.join(directory, 'finalize', id))
      await writeFile(
        path.join(directory, artifact),
        json({ ...input, recordedBy: author, at: state.approval.at }),
        { flag: 'wx', mode: 0o600 },
      )
      await writeFile(path.join(directory, 'finalize', id, 'approval.md'), input.evidence + '\n', {
        flag: 'wx',
        mode: 0o600,
      })
      state.workflowEvents ??= []
      state.workflowEvents.push({
        action: 'approve',
        revision: state.revision,
        at: state.approval.at,
        artifact,
        author,
      })
      await atomicWrite(path.join(directory, 'state.json'), json(state))
      await projections(directory, state, await readSnapshot(directory, state))
      return { directory, approval: state.approval }
    }
    if (action === 'implement' || action === 'review') {
      await requireApproval(directory, state)
      code = codeRevision(settings.repoRoot)
      checkBranch(code.branch, ticket)
      if (action === 'review' && input.tests && input.tests.some((item) => item.result !== 'pass'))
        fail('Review chưa pass hoặc còn tests chưa xử lý.')
      input = { ...input, tests: await verifiedChecks(settings, directory, state) }
      if (
        !Array.isArray(input.tests) ||
        !input.tests.length ||
        input.tests.some(
          (item) =>
            !item.command || !item.evidence || !['pass', 'fail', 'not-run'].includes(item.result),
        )
      )
        fail('Cần test evidence thực tế, gồm command/result/evidence.')
    }
    if (action === 'review-findings') {
      await requireApproval(directory, state)
      code = codeRevision(settings.repoRoot)
      checkBranch(code.branch, ticket)
      if (
        !input.findings?.length ||
        input.findings.some(
          (item) => !item.description || !['open', 'resolved'].includes(item.status),
        )
      )
        fail('Review findings cần mô tả và trạng thái findings.')
    }
    if (action === 'checkpoint') {
      await requireApproval(directory, state)
      code = {
        head: git(settings.repoRoot, ['rev-parse', 'HEAD']),
        branch: git(settings.repoRoot, ['symbolic-ref', '--short', 'HEAD']),
        worktree: git(settings.repoRoot, ['status', '--porcelain']) ? 'dirty' : 'clean',
        fingerprint: await fingerprint(settings.repoRoot),
      }
      checkBranch(code.branch, ticket)
    }
    if (action === 'review') {
      const implementation = await stageArtifact(directory, state, 'implement')
      if (implementation.code.head !== code.head)
        fail('Code khác revision implement đã kiểm tra; ghi nhận implement lại.')
      if (
        input.verdict !== 'pass' ||
        input.tests.some((item) => item.result !== 'pass') ||
        !Array.isArray(input.findings) ||
        input.findings.some((item) => item.status !== 'resolved')
      )
        fail('Review chưa pass hoặc còn findings/test chưa xử lý.')
    }
    const stageName =
      action === 'checkpoint' ? 'implement' : action === 'review-findings' ? 'review' : action
    const index = order.indexOf(stageName)
    for (const stage of order.slice(index + 1))
      state.stages[stage] = {
        ...state.stages[stage],
        status: 'needs-revalidation',
        reason: `${action}-updated`,
      }
    if (['intake', 'analysis', 'finalize'].includes(action)) delete state.approval
    const record = await persistStage(
      directory,
      state,
      stageName,
      {
        ...input,
        action,
        ...(code ? { code } : {}),
      },
      action === 'review-findings'
        ? 'changes-requested'
        : action === 'checkpoint'
          ? input.blocker
            ? 'blocked'
            : 'in-progress'
          : action === 'implement'
            ? 'verified'
            : action === 'review'
              ? 'reviewed'
              : 'complete',
      author,
    )
    return { directory, stage: stageName, ...record }
  })
}

export async function intakeStatus(settings, ticket) {
  const { directory, state } = await context(settings, ticket)
  try {
    await stageArtifact(directory, state, 'intake')
    return { docsMissing: false, artifact: state.stages.intake.artifact }
  } catch {
    return {
      docsMissing: true,
      required: requiredDocs.intake,
      sourceIds: currentItems(await readSnapshot(directory, state)).map((item) => item.id),
      revision: state.revision,
      directory,
    }
  }
}

export async function requireApproval(directory, state) {
  const plan = await stageArtifact(directory, state, 'finalize')
  if (!plan.requiredChecks?.length)
    fail('Plan thiếu requiredChecks; Finalize lại trước khi tiếp tục.')
  validateDelivery(plan)
  if (
    state.approval?.sourceRevision !== state.revision ||
    state.approval.finalizeHash !== state.stages.finalize.hash
  )
    fail('Chưa có approval đúng source/spec hiện tại. Developer cần duyệt plan trước implement.')
}

export async function handoffGate(settings, ticket) {
  const { directory, state } = await context(settings, ticket)
  await requireApproval(directory, state)
  await verifiedChecks(settings, directory, state)
  const review = await stageArtifact(directory, state, 'review')
  const finalized = await stageArtifact(directory, state, 'finalize')
  const code = codeRevision(settings.repoRoot)
  checkBranch(code.branch, ticket)
  if (
    review.code.head !== code.head ||
    review.code.branch !== code.branch ||
    review.verdict !== 'pass'
  )
    fail('Review không khớp HEAD/branch hiện tại; review lại trước handoff.')
  return { directory, state, code, finalized, review }
}
