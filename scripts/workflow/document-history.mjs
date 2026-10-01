import { createHash } from 'node:crypto'

export const documentName = (stage) =>
  ['intake', 'analysis'].includes(stage) ? 'TASK' : stage === 'finalize' ? 'PLAN' : 'CHECKS'
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const reference = (record) =>
  record?.artifact ? { artifact: record.artifact, hash: record.hash } : null

// All identity/time/version fields are helper-owned, never copied from input metadata.
export function documentVersion(state, stage, payload, status, id, author, at) {
  const document = documentName(stage)
  const references = {
    source: state.snapshot,
    requirementRevision: state.revision,
    ...(document === 'TASK' && stage === 'analysis'
      ? { intake: reference(state.stages.intake) }
      : {}),
    ...(document === 'PLAN'
      ? {
          task: state.documentHistory?.TASK?.at(-1) ?? null,
          intake: reference(state.stages.intake),
          analysis: reference(state.stages.analysis),
        }
      : {}),
    ...(document === 'CHECKS'
      ? {
          plan: reference(state.stages.finalize),
          planVersion: state.documentHistory?.PLAN?.at(-1)?.version ?? null,
          approval: state.approval ?? null,
          code: payload.code ?? null,
          context: state.verificationContext ?? null,
          tests: payload.tests ?? [],
          ...(stage === 'review' ? { implementation: reference(state.stages.implement) } : {}),
        }
      : {}),
  }
  const signature = hash({
    stage,
    status,
    documents: payload.documents,
    pr: payload.pr ?? null,
    projectItem: payload.projectItem ?? null,
    references,
  })
  const previous = state.documentHistory?.[document]?.at(-1)
  return {
    document,
    version: previous?.signature === signature ? previous.version : (previous?.version ?? 0) + 1,
    recordId: id,
    author: author ?? null,
    updatedAt: at,
    status,
    action: payload.action ?? stage,
    change: payload.change ?? null,
    references,
    signature,
  }
}
