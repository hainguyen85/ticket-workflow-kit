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
  // Runtimes differ in where they read a blocking reason: some parse the JSON on stdout,
  // others (Claude Code on exit code 2) show stderr. Provide both.
  process.stderr.write(reason + '\n')
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
