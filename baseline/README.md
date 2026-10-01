# Baseline: bộ skill task-* bản workshop gốc

Thư mục `workshop/` là bản chụp **nguyên trạng** của bộ skill task-* trước khi được điều chỉnh cho team. Nó chỉ để tham chiếu và so sánh; bộ kit đang dùng nằm ở `.agents/` tại root repo.

## Gồm những gì

Đường dẫn bên trong `workshop/` giữ đúng như trong repo gốc (49 file):

```text
.agents/skills/task-{sync,analyze,finalize,implement,review,release}/   # 6 skill + references
.agents/.env.workflow.example                                           # file mẫu, không có giá trị thật
scripts/workflow.mjs, scripts/task.mjs, scripts/workflow/               # helper
tests/workflow/                                                         # test của helper
docs/workflow/CONTRACT.md, RTK.md
.codex/hooks.json, .githooks/
WORKFLOW_SETUP.md, AGENTS.md, workshop.config.json, package.json
```

Không gồm: file cấu hình local chứa token, mã nguồn của ứng dụng Payload/Next.js, `node_modules`.

`package.json` và `AGENTS.md` là bản đầy đủ của repo gốc, nên còn chứa phần thuộc về ứng dụng (dependency của Next.js/Payload, khối quy tắc Next.js). `tests/workflow/start-local.test.mjs` kiểm script khởi động của ứng dụng, không thuộc bộ skill.

## Quy tắc

- **Không sửa** nội dung trong `workshop/`. Nếu bản gốc có phiên bản mới, lưu nó vào một thư mục anh em (ví dụ `workshop-v2/`) thay vì ghi đè.
- Không chạy helper hay test trong thư mục này: chúng cần GitHub token, pnpm và phần còn lại của repo gốc. Hook và skill ở đây không được runtime nào nạp.
- So sánh với bản hiện tại: bảng chuyển đổi từng file nằm ở mục 5 của [docs/TASK-SKILLS-BLUEPRINT.md](../docs/TASK-SKILLS-BLUEPRINT.md).
