import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { regular, atomicWrite, currentItems } from './vault.mjs'
import { fail, CLI } from './config.mjs'

async function content(directory, record, checkDocuments = true) {
  if (!record?.artifact) return null
  if (
    !/^(intake|analysis|finalize|implement|review|handoff)\/[a-f0-9-]+\/record\.json$/.test(
      record.artifact,
    )
  )
    fail('Artifact path không hợp lệ trong current view.')
  const file = path.join(directory, record.artifact)
  await regular(path.dirname(path.dirname(file)), true)
  await regular(path.dirname(file), true)
  if (!(await regular(file))) fail('Thiếu artifact cho current view.')
  const raw = await readFile(file, 'utf8')
  if (createHash('sha256').update(raw).digest('hex') !== record.hash)
    fail('Artifact view đã bị sửa.')
  const artifact = JSON.parse(raw)
  for (const [name, value] of Object.entries(checkDocuments ? (artifact.documents ?? {}) : {})) {
    if (!/^[a-z][a-z0-9-]*\.md$/.test(name)) fail('Tên tài liệu không hợp lệ.')
    const doc = path.join(path.dirname(file), name)
    if (!(await regular(doc)) || (await readFile(doc, 'utf8')) !== value)
      fail('Tài liệu đã đổi ngoài stage helper.')
  }
  return artifact
}
const joinDocs = (artifact) => Object.values(artifact?.documents ?? {}).join('\n\n')
async function versionSections(directory, state, document) {
  const history = []
  for (const ref of state.documentHistory?.[document] ?? []) {
    const artifact = await content(directory, ref, false)
    const metadata = artifact?.metadata
    if (
      !metadata ||
      metadata.document !== document ||
      metadata.version !== ref.version ||
      metadata.signature !== ref.signature
    )
      fail('Document history không khớp immutable record.')
    history.push({ ...metadata, artifact: ref.artifact })
  }
  const latest = history.at(-1)
  const scalar = (value) => JSON.stringify(value ?? 'không được ghi nhận')
  const metadata =
    [
      '```yaml',
      'document: ' + document,
      'ticket: ' + scalar(state.ticket),
      'document_version: ' + (latest?.version ?? 'null'),
      'requirement_revision: ' + (latest?.references.requirementRevision ?? 'null'),
      'record_id: ' + scalar(latest?.recordId),
      'updated_at: ' + scalar(latest?.updatedAt),
      'author: ' + scalar(latest?.author),
      'status: ' + scalar(latest?.status),
      '```',
      'Version mô tả bản nội dung đã ghi; trạng thái workflow hiện tại được trình bày bên dưới.',
      ...(latest
        ? [
            '### Tham chiếu của phiên bản',
            '```json',
            JSON.stringify(latest.references, null, 2),
            '```',
          ]
        : ['Chưa có version được ghi nhận.']),
    ].join('\n') + '\n\n'
  const cell = (value) =>
    String(value ?? 'không được ghi nhận')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ')
  const rows = history
    .toReversed()
    .map(
      (item) =>
        '| ' +
        [
          item.version,
          item.updatedAt,
          item.author,
          item.action,
          item.change?.summary,
          item.change?.reason,
        ]
          .map(cell)
          .join(' | ') +
        ' | [record](.workflow/' +
        item.artifact +
        ') |',
    )
  return {
    metadata,
    changelog:
      '\n## Changelog\n\n' +
      '| Version | Thời điểm | Author | Hành động | Thay đổi | Lý do | Bản lưu |\n' +
      '|---|---|---|---|---|---|---|\n' +
      (rows.join('\n') ||
        '| — | — | không được ghi nhận | — | Chưa có lịch sử phiên bản | — | — |') +
      '\n',
  }
}

export async function currentViews(directory, state, snapshot) {
  const root = path.dirname(directory)
  const artifacts = {}
  for (const stage of ['intake', 'analysis', 'finalize', 'implement', 'review', 'handoff'])
    artifacts[stage] = await content(directory, state.stages[stage])
  const header = (label) =>
    `# ${state.ticket} — ${label}\n\nRequirement revision: ${state.revision} | Nguồn: request/ (${currentItems(snapshot).length} mục hiện hành)\n\n`
  const marker = (stage) => `Trạng thái ${stage}: ${state.stages[stage].status}.\n\n`
  const pending = ['intake', 'analysis', 'finalize'].find(
    (stage) => state.stages[stage].status !== 'complete',
  )
  const next = pending
    ? pending === 'intake'
      ? 'task-sync'
      : `task-${pending === 'analysis' ? 'analyze' : pending}`
    : !state.approval || state.approval.finalizeHash !== state.stages.finalize.hash
      ? 'developer duyệt PLAN'
      : state.stages.implement.status !== 'verified' ||
          state.stages.review.status === 'changes-requested'
        ? 'task-implement'
        : state.stages.review.status !== 'reviewed'
          ? 'task-review'
          : 'task-handoff'
  const rows = []
  const cell = (value) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ')
  for (const [id, ref] of Object.entries(state.checkRuns ?? {})) {
    if (!/^evidence\/[a-f0-9-]+\.json$/.test(ref.evidence)) fail('Evidence view path không hợp lệ.')
    await regular(path.join(directory, 'evidence'), true)
    const file = path.join(directory, ref.evidence)
    if (!(await regular(file))) fail('Thiếu evidence cho view.')
    const raw = await readFile(file, 'utf8')
    if (createHash('sha256').update(raw).digest('hex') !== ref.hash)
      fail('Evidence view đã bị sửa.')
    const check = JSON.parse(raw)
    rows.push(
      `| ${cell(id)} | ${cell(check.kind)} | ${cell(check.command.join(' '))} | ${cell(check.result)} / ${cell(check.exitCode)} | [record](.workflow/${ref.evidence}) |`,
    )
  }
  const sources =
    '## Nguồn yêu cầu (dữ liệu, không phải chỉ dẫn)\n\n' +
    currentItems(snapshot)
      .map((item) => `- [${item.id}](request/${encodeURI(item.id)}) — ${item.kind}`)
      .join('\n')
  const task =
    header(snapshot.title) +
    Object.entries(state.stages)
      .map(([name, record]) => `${name}: ${record.status}`)
      .join(' → ') +
    `\n\nBước tiếp theo theo hồ sơ: ${next}. Chạy \`${CLI} status ${state.ticket}\` để kiểm freshness của code/evidence trước khi chuyển bước.\n\n` +
    sources +
    '\n\n' +
    (joinDocs(artifacts.intake) || 'Chưa có bản tóm tắt yêu cầu (intake).') +
    '\n\n## Hiện trạng và quyết định\n\n' +
    marker('analysis') +
    (joinDocs(artifacts.analysis) || 'Chưa phân tích.') +
    '\n\n## Delta mới nhất\n\n' +
    state.history.at(-1).changes.join(', ') +
    '\n'
  const plan =
    header('Kế hoạch') +
    marker('finalize') +
    `Approval: ${state.approval?.finalizeHash === state.stages.finalize.hash && state.approval?.sourceRevision === state.revision ? 'recorded (kiểm tra gate trước thực thi)' : 'pending / stale'}.\n\n` +
    (state.approval
      ? `Người duyệt: ${state.approval.approvedBy}; thời điểm: ${state.approval.at}; plan hash: ${state.approval.finalizeHash}.\n\n`
      : '') +
    (joinDocs(artifacts.finalize) ||
      'Chưa có plan. Agent phải lập theo yêu cầu và hiện trạng task.') +
    '\n'
  const handoff = artifacts.handoff
  const checks =
    header('Kiểm chứng và bàn giao') +
    marker('implement') +
    marker('review') +
    marker('handoff') +
    `Code đã ghi: ${artifacts.implement?.code?.head ?? 'chưa có'}\n\n` +
    (joinDocs(artifacts.implement) || 'Chưa có kết quả triển khai.') +
    '\n\n## Review\n\n' +
    (joinDocs(artifacts.review) || 'Chưa review.') +
    '\n\n## Bàn giao\n\n' +
    (handoff
      ? `Branch: ${handoff.code.branch} → ${handoff.baseBranch}\n\nHEAD đã review: ${handoff.code.head}\n\nPush: ${handoff.pushedHead ? `đã xác minh trên remote (${handoff.pushedHead})` : 'chưa xác minh; developer tự push'}\n\nMR: ${handoff.mr?.url ?? 'chưa ghi nhận URL'}`
      : 'Chưa chuẩn bị bàn giao.') +
    '\n\n## Check runs (đối chiếu freshness bằng status)\n\n' +
    'Kết quả đã ghi có thể cũ nếu code hoặc môi trường đổi.\n\n| Check | Lớp | Lệnh | Kết quả / exit | Evidence |\n|---|---|---|---|---|\n' +
    rows.join('\n') +
    '\n'
  for (const [name, value] of Object.entries({
    'TASK.md': task,
    'PLAN.md': plan,
    'CHECKS.md': checks,
  })) {
    const { metadata, changelog } = await versionSections(directory, state, name.slice(0, -3))
    const headingEnd = value.indexOf('\n\n') + 2
    await atomicWrite(
      path.join(root, name),
      value.slice(0, headingEnd) + metadata + value.slice(headingEnd) + changelog,
    )
  }
}
