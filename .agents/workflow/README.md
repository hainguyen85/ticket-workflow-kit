# Workflow helpers

CLI duy nhất: `node .agents/workflow/task.mjs`. Helpers chỉ dùng Node built-ins: không `package.json`, không cài dependency, không gọi mạng ngoài các lệnh Git mà developer vốn dùng. Hợp đồng sử dụng: [CONTRACT.md](CONTRACT.md).

| Module (`lib/`) | Trách nhiệm |
|---|---|
| `config.mjs` | Đọc `.agents/workflow.config.json` (commit) và `.agents/workflow.local.json` (theo máy); kiểm thư mục hồ sơ nằm ngoài repo source hoặc được repo source ignore; quy tắc key/slug; redaction. |
| `source.mjs` | Đọc và kiểm nguồn yêu cầu từ file/chat: tên, kích thước, mẫu secret. |
| `vault.mjs` | Thư mục ticket, khóa `.workflow-lock`, `request/r<N>`, manifest nguồn, revision, `state.json`. Từ chối symlink dưới repo hồ sơ. |
| `stages.mjs` | Ghi record bất biến theo stage, approval, vô hiệu hóa stage phía sau. |
| `verification.mjs` | Validate plan, fingerprint code, chạy check, khóa evidence theo plan/code/context. |
| `command.mjs` | Chạy argv không qua shell; tìm `.cmd`/`.bat` trên Windows; timeout và kill cây process. |
| `dispatch.mjs` | Chọn một stage tiếp theo kèm lý do. |
| `views.mjs`, `document-history.mjs` | Dựng TASK/PLAN/CHECKS và version/changelog từ records. |
| `handoff.mjs` | Prepare bàn giao; xác minh HEAD trên remote sau khi developer push. |
| `policy.mjs` | Mẫu secret, metadata trung lập, quy tắc branch, luật runtime hook. |
| `agent-hook.mjs`, `git-hook.mjs`, `setup-hooks.mjs` | Nối policy vào runtime hooks (Codex: `.codex/hooks.json`; Claude Code: `.claude/settings.json`) và Git hooks. |
| `skill-links.mjs` | Liên kết `.claude/skills/task-*` tới `.agents/skills/task-*` cho Claude Code (symlink, hoặc junction trên Windows). |
| `git.mjs` | Gọi Git, đọc identity. |

## State và phục hồi

`.workflow/state.json` schema 2 là commit point. `revision` tăng khi có nguồn mới; `sourceHash` là SHA-256 của manifest nguồn `sync/<hash>.json`. Manifest liệt kê mọi nguồn từng được sync (ID, loại, kích thước, SHA-256); nội dung nằm trong `request/r<N>/`.

Thứ tự ghi khi sync: copy nguồn vào thư mục tạm rồi rename thành `request/r<N>` → ghi manifest → thay `state.json` bằng rename cùng filesystem → dựng lại `sync/source.md`, `changelog.md` và ba views. Ngắt trước commit point để lại `request/r<N>` chưa được state tham chiếu: helper dừng và yêu cầu dọn thủ công, không ghi đè. Ngắt sau commit point: chạy lại `sync <ticket>` để dựng lại các file dẫn xuất.

State/manifest/request hỏng hoặc không khớp hash thì dừng, không reset. Phục hồi bằng Git của repo hồ sơ. Nếu còn `.workflow-lock` do process bị ngắt, chỉ xóa sau khi xác nhận không còn process ghi ticket. Lock là thư mục rỗng nên Git không theo dõi; nó chỉ bảo vệ trên một máy.

`stages` gồm intake/analysis/finalize/implement/review/handoff. Lần đầu là `not-started`. Khi nguồn yêu cầu thay đổi, các stage hiện có thành `needs-revalidation`; metadata trước đó vẫn giữ.

## Giới hạn bảo mật

Redaction che các mẫu token/key phổ biến, private-key blocks và các trường secret thông dụng trước khi lưu log. Đây là best effort, không phải DLP đầy đủ. Nguồn yêu cầu là dữ liệu không tin cậy; helper không thực thi nội dung. Hồ sơ (gồm nguồn yêu cầu và log check) được commit vào repo hồ sơ: quyền đọc repo đó quyết định ai xem được. Chỉ runtime hooks đã trust mới có hiệu lực trong session.

Không đưa RTK metrics vào state hoặc hồ sơ ticket.

## Kiểm tra bộ helper

```bash
node --test ".agents/workflow/tests/*.test.mjs"
```

Tests dùng thư mục tạm, một bare remote local và repo hồ sơ giả; không cần mạng. Hai test symlink tự skip trên Windows chưa bật Developer Mode.

Lưu ý khi viết script check bằng Node: đặt `process.exitCode` rồi để script tự kết thúc, không gọi `process.exit()`. Trên Windows (Node 24), process con gọi `process.exit()` đôi khi crash với exit code `3221225477` khi máy tải nặng, làm check fail oan. `node .agents/workflow/task.mjs doctor` kiểm cấu hình thật của máy: identity, quyền ghi repo hồ sơ, hooks, `.gitignore`, base ref.
