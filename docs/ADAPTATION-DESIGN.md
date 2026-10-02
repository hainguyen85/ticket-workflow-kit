# Điều chỉnh bộ skill task-* cho context của team

Tài liệu ghi lại **vì sao** bộ kit khác với bản workshop gốc (gắn GitHub Issue/Project/PR, hồ sơ trên OneDrive, lệnh `pnpm`). Cách dùng xem [.agents/TASK-SKILLS-GUIDE.md](../.agents/TASK-SKILLS-GUIDE.md); hợp đồng chi tiết xem [.agents/workflow/CONTRACT.md](../.agents/workflow/CONTRACT.md); đặc tả đầy đủ để làm lại hoặc cải tiến xem [TASK-SKILLS-BLUEPRINT.md](TASK-SKILLS-BLUEPRINT.md).

## Context quyết định thiết kế

| Thực tế của team | Hệ quả |
|---|---|
| Yêu cầu đến từ file hoặc mô tả trong chat, không phải GitHub Issue | Không còn issue-id số, không cần token, helper không gọi API hosting |
| MR/PR do developer tạo thủ công | Bước cuối chỉ chuẩn bị và xác minh, không push/tạo MR |
| Policy cấm công cụ đồng bộ thư mục (OneDrive, Google Drive) | Hồ sơ chia sẻ qua một Git repo riêng |
| Repo hồ sơ tách khỏi repo source | Branch tạo lúc implement; hồ sơ thường nằm ngoài repo source, đặt bên trong cũng được nếu được ignore |
| Team dùng cả Codex và Claude Code | Runtime hooks đóng gói cho cả hai, chung một policy |
| Leader sync/analyze, developer nhận ticket rồi lập plan | Author ghi theo từng bản ghi; ticket chỉ do leader tạo nên không lo trùng key |
| Stack Java trên Windows, repo không có `package.json` | Gọi helper bằng `node` trực tiếp; runner chạy được `.cmd`/`.bat`; timeout dài hơn |
| Giữ quy tắc metadata trung lập | Giữ nguyên hooks, chỉ sửa lỗi chặn nhầm từ "ai" tiếng Việt |

## Quyết định

### 1. Ticket ID = `<key>-<slug>`

- Key: mã từ hệ thống ngoài nếu nguồn có (vd. `GL-123`); nếu không là `<PREFIX>-<số thứ tự>`, prefix theo loại ticket (`REQ` yêu cầu mới, `CR` thay đổi yêu cầu sau bàn giao; danh sách khai trong config) và số đếm riêng theo từng loại, lấy từ tên các thư mục ticket đang có. Bản đầu dùng thời điểm tạo `YYMMDD-HHMM` để khỏi cần bộ đếm; nó bị thay vì ID quá dài so với thông lệ của các tracker, còn ngày giờ thì hồ sơ đã có. Cái giá là số có thể trùng khi hai máy tạo ticket mà chưa pull repo hồ sơ: xử lý bằng quy ước pull trước khi tạo và báo cáo `duplicateKeys`.
- Prefix giúp nhìn ID là biết loại ticket, và để sẵn chỗ cho ticket đến từ GitLab/Redmine về sau.
- CR của ticket chưa bàn giao vẫn là revision của ticket đó; CR của ticket đã bàn giao là ticket `CR-…` mới, liên kết về ticket gốc.
- Slug: agent đặt, 2–4 từ ASCII chữ thường, tối đa 30 ký tự.
- Lý do chọn key theo thời gian thay vì số tuần tự: không cần bộ đếm dùng chung, sắp xếp được theo thời gian, và tự nói lên ticket được tạo khi nào.

### 2. Nguồn yêu cầu: `request/r<N>/` là bản lưu

Cả file lẫn chat đều được lưu vào hồ sơ, vì hai cơ chế cốt lõi phụ thuộc vào đó:

- **Phát hiện CR**: revision và hash nguồn quyết định khi nào các stage phải kiểm lại.
- **Căn cứ của approval**: plan được duyệt dựa trên đúng nội dung đã lưu. Nếu chỉ lưu đường dẫn, file gốc đổi/mất là mất căn cứ, và người khác trong team không đọc được.

Khác với bản gốc là không còn một bản JSON chứa lại toàn bộ nội dung: file nằm nguyên dạng trong `request/`, còn `.workflow/sync/<hash>.json` chỉ là manifest (tên, loại, kích thước, SHA-256).

Giới hạn đã biết: helper không đọc được khung chat nên không kiểm được agent chép có đúng nguyên văn. Skill bắt agent trích lại nội dung đã lưu để người dùng xác nhận.

### 3. Hồ sơ trong repo Git riêng

```text
<docsRepo>/docs/tickets/<key>-<slug>/
```

- Bỏ ba tầng `<org>/<repo>/<github-login>` của bản gốc: repo hồ sơ thuộc về dự án, và người làm được ghi trong từng bản ghi.
- `docsRepo` khai theo máy trong `.agents/workflow.local.json`; đường dẫn bên trong repo hồ sơ (`docs.ticketsPath`) khai chung trong `.agents/workflow.config.json`.
- Helper **không** commit/push repo hồ sơ. Lý do: push là hành động hướng ra ngoài, để người dùng quyết định; và hook đã chặn agent push ở mọi repo.
- Hồ sơ không được lọt vào fingerprint của code hay làm bẩn worktree. Nằm ngoài repo source thì hiển nhiên đạt. Nằm **trong** repo source cũng đạt nếu thư mục đó có trong `.gitignore`, vì fingerprint và kiểm tra worktree đều bỏ qua file bị ignore. Vì vậy helper không cấm vị trí bên trong repo source; nó chỉ từ chối khi thư mục hồ sơ nằm trong repo source mà chưa được ignore.
- Hồ sơ nằm trong chính repo source và bị ignore thì không đi theo repo đó tới team; helper báo `docsRepo.ignored` để người dùng biết phải chia sẻ bằng cách khác (ví dụ thư mục đó là một clone của repo hồ sơ).
- Toàn bộ thư mục ticket được commit, kể cả nguồn yêu cầu và log check (quyết định của team). Redaction secret chỉ là best effort, nên quyền đọc repo hồ sơ phải đặt tương ứng.
- Ràng buộc: một ticket chỉ ghi từ một máy tại một thời điểm (`state.json` không merge được).
- Glossary (`docs/GLOSSARY.md`) và ADR (`docs/adr/`) cũng nằm trong repo hồ sơ, cạnh thư mục ticket, để dùng chung và chia sẻ cùng một đường với hồ sơ. Đặt chúng trong repo source sẽ buộc mỗi lần chốt một thuật ngữ phải đi qua cổng `files` của plan và làm đổi fingerprint của code. Chúng là Markdown thường, helper chỉ biết vị trí; cùng quy tắc ignore với thư mục hồ sơ khi nằm trong repo source.

### 4. `task-release` → `task-handoff`

| Bản gốc | Hiện tại |
|---|---|
| Helper push branch bằng PAT, tạo PR, gắn Project | Helper `prepare`: kiểm gate, soạn `handoff.md` (lệnh push + nội dung MR) |
| | Developer tự push, tự tạo MR |
| Helper xác minh PR qua API | Helper `handoff`: dùng `git ls-remote` đối chiếu HEAD trên remote với code đã review; nhận URL MR do developer cung cấp |

Không xác minh được remote thì không ghi nhận bàn giao: giữ đúng nguyên tắc "không có evidence thì không qua cổng".

### 5. Không `package.json`, không pnpm

- Helper chỉ dùng module có sẵn của Node, nên chỉ cần Node ≥ 22.12 trên máy. Mọi lệnh `pnpm workshop:*` gộp vào một CLI: `node .agents/workflow/task.mjs`.
- Cả bộ kit nằm trong `.agents/` (cùng `.codex/hooks.json`, `.claude/settings.json`, `.githooks/`), không chiếm `scripts/` hay `tests/` của dự án.
- Bỏ ESLint riêng cho helper vì nó là dependency npm duy nhất.

### 6. Runner cho Java trên Windows

- Node không chạy trực tiếp được `.cmd`/`.bat`. Runner tự tìm file theo `PATH`/`PATHEXT` và gọi qua `cmd.exe` với từng tham số trong dấu nháy; tham số chứa ký tự mà `cmd` vẫn diễn giải thì từ chối thay vì cố escape.
- Timeout mặc định 600 giây (bản gốc 120), đặt riêng được cho từng check; quá hạn thì kill cả cây process vì Maven/Gradle sinh JVM con.
- Fingerprint tính theo nội dung Git sẽ commit (`git hash-object`), nên `core.autocrlf` đổi LF↔CRLF khi checkout không làm evidence bị cũ.

### 7. Những gì giữ nguyên

Gate theo evidence, record bất biến, approval gắn hash plan, dispatcher một bước, `delivery` bắt buộc, lock theo ticket, từ chối symlink, runtime hooks và Git hooks, Conventional Commits, metadata trung lập.

## Đã loại bỏ

`github.mjs`, `transport.mjs`, `credential.mjs`, `target.mjs`, lệnh `board`, file `.agents/.env.workflow.local`, cơ chế import hồ sơ legacy, `package.json`, `workshop.config.json`.

### 8. Người duyệt plan

Plan do người có thẩm quyền duyệt: developer hoặc leader. Helper không ép vai trò; nó ghi `approvedBy` và lời duyệt đúng như thực tế, tách khỏi `recordedBy` (người chạy lệnh). Approval vẫn gắn với hash của plan, ai duyệt cũng vậy.

### 9. Runtime hooks cho Codex và Claude Code

- Một policy (`policy.mjs`), một adapter (`agent-hook.mjs`), hai file cấu hình: `.codex/hooks.json` và `.claude/settings.json`.
- Adapter trả lý do chặn theo cả hai kiểu: JSON trên stdout và văn bản trên stderr cùng exit code 2 (Claude Code đọc stderr).
- Launcher của Claude Code dùng `CLAUDE_PROJECT_DIR` nên session mở ở thư mục khác (ví dụ repo hồ sơ) vẫn tìm đúng policy; không tải được policy thì chặn, không cho qua.
- Claude Code gọi hook cho cả tool ghi file, với toàn bộ nội dung file trong input. Nếu áp luật về lệnh lên nội dung đó, agent không soạn được tài liệu nào nhắc tới lệnh push hay file env. Vì vậy với Write/Edit, hook chỉ xét đường dẫn đích và quét secret trong nội dung; luật về lệnh áp cho tool chạy lệnh và mọi tool khác.

### 10. Skills và quy tắc cho Claude Code

- Skill chỉ có một bản, ở `.agents/skills`. Claude Code tìm skill ở `.claude/skills`, nên ở đó chỉ đặt liên kết `task-*` trỏ về bản gốc; không copy, để hai nơi không thể lệch nhau.
- Liên kết không được commit. Máy Windows chưa bật Developer Mode không tạo được symlink, và Git với `core.symlinks=false` sẽ checkout symlink thành một file text chứa đường dẫn — vô dụng với Claude Code. Vì vậy `setup` tạo liên kết trên từng máy: symlink khi được phép, nếu không thì junction (không cần quyền admin). `.claude/skills/task-*` nằm trong `.gitignore`; `doctor` dừng nếu thiếu dòng ignore này, vì liên kết chưa bị ignore sẽ làm bẩn worktree.
- Junction lưu đường dẫn tuyệt đối: chuyển repo sang thư mục khác thì chạy lại `setup` để sửa. Thư mục skill thật mà dự án đã có trong `.claude/skills` không bị ghi đè.
- Quy tắc cho agent chỉ viết ở `AGENTS.md`; `CLAUDE.md` nạp nó bằng `@AGENTS.md`.
