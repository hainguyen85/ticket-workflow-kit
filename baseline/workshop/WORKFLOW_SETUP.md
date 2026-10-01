# Setup workflow

**Cần có:** Node.js 22.12+ thuộc nhánh 22 hoặc 24+, pnpm 10.32.1, Git; quyền Write repo/Project; một folder documents nằm ngoài repo.

Chạy tại repo root, cùng lệnh trên Windows/Linux/WSL/macOS:

| Bước | Lệnh / file |
|---|---|
| 1. Setup | `pnpm workshop:setup` — tạo env nếu thiếu và bật Git hooks trong repo. |
| 2. Điền cấu hình | Mở `.agents/.env.workflow.local`, điền các biến theo bảng bên dưới. |
| 3. Kiểm tra | `pnpm workshop:check` |
| 4. Sync Issue | `pnpm workshop:sync <id>` — ví dụ `pnpm workshop:sync 1`. |
| 5. Xem trạng thái | `pnpm workshop:status <id>` |
| 6. Trust runtime hooks | Mở Codex tại repo → `/hooks` → review/trust hai hooks; kiểm tra lại trong session mới. |

| Biến env | Giá trị cần điền |
|---|---|
| `GH_TOKEN` | PAT riêng của account đang làm việc. |
| `WORKSHOP_DOCS_ROOT` | Đường dẫn tuyệt đối đến folder documents ngoài repo. |
| `GH_REPO` | `owner/repository`, phải khớp origin của checkout. |
| `GH_PROJECT_URL` | URL đầy đủ, ví dụ `https://github.com/orgs/KITS-Hanoi-2026/projects/1`. |
| `GH_BASE_BRANCH` | Branch đích của PR; mặc định `main`. |

`pnpm workshop:target <id>` hiển thị repo/Project/Issue, không in credentials. Đổi ticket bằng ID trong lệnh; không sửa env. `GH_ISSUE` là mặc định tùy chọn, ID trong lệnh luôn được ưu tiên. `workshop:check` kiểm tra repo/Project/documents; thêm `<id>` để kiểm tra cả Issue thuộc board. Helper tự tra Project/Status IDs; board cần Backlog, Analysis, Ready, In progress, Review, PR ready.

**PAT:** tạo [token classic](https://github.com/settings/tokens/new), chọn scope `repo` + `project`, đặt ngày hết hạn. Mỗi người dùng token riêng, chỉ dán vào env bằng editor. Không gửi qua chat hoặc lưu trong documents. Classic `repo` có phạm vi rộng, không giới hạn riêng repo workshop.

**Documents path:** Windows: `C:/Users/Admin/OneDrive/KITS-2026`; WSL: `/mnt/c/Users/Admin/OneDrive/KITS-2026`. Dùng đường dẫn local theo máy của mình, không dùng sharing URL. Có thể dùng folder local thường.

Hồ sơ được lưu tại:

```text
<documents-root>/KITS-Hanoi-2026/payload-workshop/<github-login>/<issue-id>/
├── TASK.md        # Yêu cầu, hiện trạng, quyết định và bước tiếp theo
├── PLAN.md        # AC, kế hoạch theo task, checks và approval
├── CHECKS.md      # Kết quả thực, findings và bàn giao
└── .workflow/     # State, snapshots, lịch sử và evidence máy quản lý
```

**Skills có sẵn:** `$task-sync` → `$task-analyze` → `$task-finalize` → `$task-implement` → `$task-review` → `$task-release`, kèm Issue ID đang xử lý, ví dụ `$task-sync 1`, `$task-analyze 1`. Developer chọn hướng và duyệt plan trước code; release dừng ở PR ready.

Skills nằm trong `.agents/skills`, hooks trong `.codex/hooks.json` và `.githooks`. Codex yêu cầu trust hooks theo [cơ chế runtime](https://learn.chatgpt.com/docs/hooks); clone/setup Git không tự trust runtime. `workshop:check` không chứng minh hook đang được session thực thi hoặc OneDrive cloud đã sync.

Schema/helper chi tiết dành cho skills: [docs/workflow/CONTRACT.md](docs/workflow/CONTRACT.md).

## Kiểm chứng

Sau approval, skill tự lập và chạy checks bằng `node scripts/task.mjs check <id> <check-id>`. Helper chỉ cho ghi verified khi đủ evidence còn hiệu lực; build không thay DB/API/browser nếu task cần những lớp đó. `node scripts/task.mjs next <id>` xác định bước tiếp theo. Không sửa tay ba views hoặc state.

Đo RTK: [docs/workflow/RTK.md](docs/workflow/RTK.md). Hồ sơ cũ được copy vào `.workflow`, giữ nguyên bản gốc; plan cũ cần bổ sung checks và được duyệt lại.
