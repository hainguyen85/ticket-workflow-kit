# Setup workflow

**Cần có:** Git; Node.js 22.12+ thuộc nhánh 22 hoặc 24+ (chỉ để chạy helper — repo không cần `package.json` hay package manager); một checkout của **repo hồ sơ** (thường nằm ngoài repo source; nếu đặt bên trong thì phải được `.gitignore` của repo source bỏ qua).

## Đưa bộ kit vào repo source

Copy các mục sau vào root repo source và commit:

```text
.agents/skills/            # 6 skills task-*
.agents/workflow/          # CLI, helpers, CONTRACT, tests
.agents/TASK-SKILLS-GUIDE.md  # tài liệu training về kiến trúc và workflow
.agents/workflow.config.json
.agents/workflow.local.example.json
.codex/hooks.json          # runtime hooks cho Codex
.claude/settings.json      # runtime hooks cho Claude Code (gộp khóa "hooks" nếu file đã có)
CLAUDE.md                  # dòng `@AGENTS.md` để Claude Code nạp quy tắc (thêm vào file hiện có nếu đã có)
.githooks/                 # Git hooks
AGENTS.md                  # quy tắc cho agent (gộp vào file hiện có nếu đã có)
```

Thêm vào `.gitignore` của repo source:

```gitignore
.agents/workflow.local.json
.workflow-tmp/
.claude/settings.local.json
.claude/skills/task-*
# Chỉ khi đặt hồ sơ bên trong repo source, ví dụ:
# team-docs/
```

`.claude/settings.json` phải được commit (không ignore cả thư mục `.claude/`), vì nó chứa hooks dùng chung của team.

Thư mục build (`target/`, `build/`, `out/`…) cũng phải được ignore: check làm thay đổi file không bị ignore sẽ bị tính là fail.

Chỉnh `.agents/workflow.config.json` cho dự án (commit, dùng chung cả team):

| Khóa | Ý nghĩa | Mặc định |
|---|---|---|
| `git.remote` | Remote của repo source | `origin` |
| `git.baseBranch` | Branch đích của MR | `main` |
| `git.protectedBranches` | Nhánh không được push từ máy dev | `["main"]` |
| `docs.ticketsPath` | Thư mục ticket bên trong repo hồ sơ | `docs/tickets` |
| `checks.timeoutSeconds` | Timeout mặc định của một check | `600` |
| `tickets.types` | Các loại ticket và prefix của key tự sinh | `{"req": "REQ", "cr": "CR"}` |
| `tickets.defaultType` | Loại dùng khi không truyền `--type` | `req` |
| `tickets.changeRequestType` | Loại dành cho thay đổi yêu cầu sau bàn giao | `cr` |

## Setup trên từng máy

Chạy tại root repo source; cùng lệnh trên Windows/Linux/macOS. `T` là `node .agents/workflow/task.mjs`.

| Bước | Lệnh / việc làm |
|---|---|
| 1. Clone repo hồ sơ | Clone ra một thư mục ngoài repo source, ví dụ `D:/Workspace/team-docs`. Nếu clone vào trong repo source, thêm thư mục đó vào `.gitignore` của repo source. |
| 2. Setup | `T setup` — tạo `.agents/workflow.local.json` nếu thiếu, bật Git hooks trong repo, và liên kết skills vào `.claude/skills/` cho Claude Code. |
| 3. Điền cấu hình máy | Mở `.agents/workflow.local.json`, điền `docsRepo` bằng đường dẫn tuyệt đối tới checkout ở bước 1. |
| 4. Kiểm tra | `T doctor` |
| 5. Bật runtime hooks | **Codex:** mở tại repo → `/hooks` → review/trust hai hooks; kiểm tra lại trong session mới. **Claude Code:** mở session tại repo và trust thư mục project; `/hooks` hiển thị hai hooks lấy từ `.claude/settings.json`. |
| 6. Xem ticket | `T list`, `T status <ticket>` |

```json
{ "docsRepo": "D:/Workspace/team-docs" }
```

`doctor` kiểm: Git identity (`user.name`, `user.email`), quyền ghi thư mục hồ sơ, repo hồ sơ có phải Git repo (và thư mục hồ sơ có đang bị ignore không), Git hooks đã bật, `.agents/workflow.local.json` và `.workflow-tmp/` đã được ignore, base ref `<remote>/<base>` đã có. `doctor` không chứng minh runtime hook đang được session thực thi.

Không có token nào cần cấu hình: helper không gọi API hosting. Fetch/push dùng credential Git sẵn có của developer.

## Hồ sơ ticket

```text
<docsRepo>/docs/tickets/<key>-<slug>/
├── TASK.md        # Yêu cầu, hiện trạng, quyết định và bước tiếp theo
├── PLAN.md        # AC, kế hoạch theo task, checks và approval
├── CHECKS.md      # Kết quả thực, findings và bàn giao
├── request/       # Nguồn yêu cầu theo revision: r1/, r2/ (CR)…
└── .workflow/     # State, manifest, lịch sử và evidence máy quản lý
```

Ticket ID là `<key>-<slug>`. Key tự sinh có dạng `<PREFIX>-YYMMDD-HHMM`, prefix theo loại ticket (`REQ` cho yêu cầu mới, `CR` cho thay đổi yêu cầu sau bàn giao); nguồn có mã từ hệ thống ngoài thì dùng mã đó (vd. `GL-123`). Slug 2–6 từ ASCII do agent đặt. Ví dụ: `REQ-260930-1415-note-search`. Các lệnh nhận ID đầy đủ hoặc chỉ key.

**Chia sẻ qua Git:** helper chỉ ghi file. Sau mỗi bước, commit phần hồ sơ của ticket trong repo hồ sơ và push; người nhận ticket pull trước khi làm. Mỗi ticket chỉ làm trên một máy tại một thời điểm.

## Luồng làm việc

Gọi skill: Codex dùng `$task-sync`, Claude Code dùng `/task-sync` (tương tự cho các skill còn lại).

**Leader tạo ticket** — `$task-sync` (từ file hoặc mô tả trong chat) → `$task-analyze <ticket>` → commit + push repo hồ sơ.

**Developer nhận ticket** — pull repo hồ sơ → `$task-finalize <ticket>` → plan được duyệt (developer hoặc leader, ghi đúng tên người duyệt) → `$task-implement <ticket>` → `$task-review <ticket>` → `$task-handoff <ticket>`.

Handoff dừng ở trạng thái đã chuẩn bị: developer tự chạy lệnh push được in ra, tự tạo MR, rồi cho agent chạy `T handoff <ticket> [mr-url]` để helper xác minh branch trên remote đúng code đã review. Leader review và merge MR.

Skills nằm trong `.agents/skills`; runtime hooks trong `.codex/hooks.json` (Codex) và `.claude/settings.json` (Claude Code); Git hooks trong `.githooks`. Hai runtime dùng chung một policy (`.agents/workflow/lib/policy.mjs`).

**Skills cho Claude Code.** Chỉ có một bản skill, trong `.agents/skills`. Claude Code tìm skill ở `.claude/skills`, nên `setup` tạo ở đó các liên kết `task-*` trỏ về `.agents/skills/task-*`: symlink nếu máy cho phép, nếu không (Windows chưa bật Developer Mode) thì dùng junction, không cần quyền admin. Liên kết là của từng máy nên được Git ignore; mỗi người chạy `T setup` một lần sau khi clone. Thư mục skill có sẵn của dự án trong `.claude/skills` không bị ghi đè. Quy tắc cho agent nằm ở `AGENTS.md`; `CLAUDE.md` nạp nó bằng dòng `@AGENTS.md`. Codex yêu cầu trust hooks theo [cơ chế runtime](https://learn.chatgpt.com/docs/hooks); clone/setup Git không tự trust runtime.

Runtime hook chặn agent: gửi/ghi mẫu secret, đọc/ghi file env và khóa, dump biến môi trường, tắt hooks, push và tạo/merge MR. Luật về lệnh chỉ áp cho tool chạy lệnh; khi agent ghi file, hook chỉ xét đường dẫn đích và quét secret trong nội dung.

Schema/helper chi tiết dành cho skills: [.agents/workflow/CONTRACT.md](.agents/workflow/CONTRACT.md). Tài liệu training: [.agents/TASK-SKILLS-GUIDE.md](.agents/TASK-SKILLS-GUIDE.md).

## Kiểm chứng

Sau approval, skill tự lập và chạy checks bằng `T check <ticket> <check-id>`. Helper chỉ cho ghi verified khi đủ evidence còn hiệu lực; build không thay DB/API/browser nếu task cần những lớp đó. `T status <ticket>` xác định bước tiếp theo. Không sửa tay ba views, `request/` hoặc state.

Lệnh check là argv, không qua shell. Trên Windows, runner tự gọi được `mvn`, `mvnw.cmd`, `gradlew.bat`; lệnh Maven/Gradle chạy lâu cần `timeoutSeconds` trong plan.

Kiểm bộ helper sau khi chỉnh sửa: `node --test ".agents/workflow/tests/*.test.mjs"`. Đo RTK: [.agents/workflow/RTK.md](.agents/workflow/RTK.md).
