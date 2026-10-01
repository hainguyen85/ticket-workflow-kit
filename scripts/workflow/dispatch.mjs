import path from 'node:path'
import { context, stageArtifact, requireApproval } from './stages.mjs'
import { verifiedChecks, validateDelivery } from './verification.mjs'
import { git } from './git.mjs'
import { WorkflowError } from './config.mjs'

// Only route workflow stages. The agent derives implementation steps for each task.
export async function nextAction(settings, login, number) {
  const { directory, state } = await context(settings, login, number)
  const result = (stage, reason) => ({
    directory,
    documents: path.dirname(directory),
    revision: state.revision,
    next: stage,
    reason,
    stages: state.stages,
  })
  for (const stage of ['intake', 'analysis', 'finalize']) {
    const record = state.stages[stage]
    if (record.status !== 'complete' || record.sourceRevision !== state.revision)
      return result(
        stage === 'intake' ? 'sync' : stage,
        'Stage chưa hoàn tất ở requirement hiện tại.',
      )
    await stageArtifact(directory, state, stage) // corruption must not look like ordinary missing work
  }
  const plan = await stageArtifact(directory, state, 'finalize')
  if (!plan.requiredChecks?.length)
    return result('finalize', 'Plan legacy cần requiredChecks và approval mới.')
  try {
    validateDelivery(plan)
  } catch (error) {
    if (!(error instanceof WorkflowError)) throw error
    return result('finalize', error.message)
  }
  if (
    state.approval?.finalizeHash !== state.stages.finalize.hash ||
    state.approval?.sourceRevision !== state.revision
  )
    return result('approve', 'Cần quyết định developer cho đúng plan.')
  await requireApproval(directory, state)
  if (git(settings.repoRoot, ['status', '--porcelain']))
    return result('implement', 'Có thay đổi chưa commit; tiếp tục plan/checkpoint.')
  try {
    await verifiedChecks(settings, directory, state)
  } catch (error) {
    if (!(error instanceof WorkflowError)) throw error
    return result('implement', error.message)
  }
  if (state.stages.review.status === 'changes-requested')
    return result('implement', 'Review yêu cầu xử lý findings trước khi bàn giao.')
  const head = git(settings.repoRoot, ['rev-parse', 'HEAD'])
  if (state.stages.implement.status !== 'verified' || state.stages.implement.code?.head !== head)
    return result('implement', 'Checks đã đạt; ghi completion trên HEAD hiện tại.')
  await stageArtifact(directory, state, 'implement')
  if (state.stages.review.status !== 'reviewed' || state.stages.review.code?.head !== head)
    return result('review', 'Cần review đúng code và evidence hiện tại.')
  await stageArtifact(directory, state, 'review')
  if (state.stages.release.status === 'complete' && state.stages.release.code?.head === head)
    return result('pr-ready', 'PR đã ghi nhận; chưa merge/deploy.')
  return result('release', 'Đủ điều kiện prepare; publish theo phạm vi user đã yêu cầu.')
}
