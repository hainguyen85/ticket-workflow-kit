import { inspectHook } from './policy.mjs'

let reason, event
try {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (input.length > 2_000_000) throw new Error('oversized')
  }
  const parsed = JSON.parse(input)
  event = parsed.hook_event_name
  reason = inspectHook(parsed)
} catch {
  reason = 'Hook không đọc được input; dừng để kiểm tra cấu hình.'
}
if (reason) {
  // Never echo prompt, arguments, credentials or transcript path.
  if (event === 'UserPromptSubmit')
    process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n')
  else
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }) + '\n',
    )
  process.exitCode = 2
}
