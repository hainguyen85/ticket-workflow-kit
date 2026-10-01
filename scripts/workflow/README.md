# Workflow foundation contract

`target.mjs` đối chiếu repo trong env với origin; `workshop.config.json` chỉ giữ policy. `workshop:target` in routing không có PAT.

CLI nền: `scripts/workflow.mjs`; CLI stage/release: `scripts/task.mjs`. Helpers chỉ dùng Node built-ins. Hợp đồng sử dụng: [docs/workflow/CONTRACT.md](../../docs/workflow/CONTRACT.md).

- `config.mjs`: parse env và target repo/Project dạng dữ liệu; Issue lấy từ lệnh, `GH_ISSUE` chỉ là mặc định tùy chọn; không đọc token từ ambient environment hoặc gh login. Canonical documents root ở ngoài repo; không theo symlink env.
- `github.mjs`: PAT chỉ nằm trong Authorization header gửi đến `api.github.com`, không theo redirect. Resolve Project qua owner/number trích từ `GH_PROJECT_URL` (organization hoặc user), lấy Status IDs hiện tại. Check repo Write, Project viewerCanUpdate; đọc đủ các trang comments/items, dừng nếu vượt giới hạn hoặc lỗi. Không retry mutation tự động; release lưu partial state để retry có kiểm tra.
- `vault.mjs`: một folder theo account/ticket; kiểm tra thành phần đường dẫn và từ chối symlink dưới root. Giữ khóa `.workflow-lock` từ trước khi lấy nguồn cho đến khi ghi xong. Không tự phá stale lock.

## State và phục hồi

`.workflow/state.json` schema 1 là commit point. `revision` tăng khi snapshot đã làm sạch thay đổi; `sourceHash` là SHA-256 của JSON snapshot. Snapshot trong `sync/<hash>.json` giữ lịch sử body/comments đã bị sửa hoặc xóa ở GitHub. Đồng bộ không xóa lịch sử local.

Ghi snapshot trước, sau đó thay `state.json` bằng rename cùng filesystem, rồi dựng lại `sync/source.md` và `changelog.md`. Nếu ngắt sau commit point, sync lại cùng dữ liệu sẽ dựng lại hai file dẫn xuất, không thêm revision. Snapshot chưa được state tham chiếu có thể còn lại nếu ngắt trước commit point; không tự xóa. Atomic rename không bảo đảm chống mất điện hoặc transaction trên OneDrive cloud.

State/snapshot hỏng hoặc không khớp hash thì dừng, không reset. Phục hồi từ bản sao tốt. Nếu còn `.workflow-lock` do process bị ngắt, chỉ xóa sau khi xác nhận không còn process ghi ticket. Khóa chỉ có ý nghĩa trên một filesystem local; không dùng nhiều máy cùng ghi folder của một account qua OneDrive.

`stages` dành cho analysis/finalize/implement/review/release. Lần đầu là `not-started`. Khi nguồn yêu cầu thay đổi, các stage hiện có thành `needs-revalidation`; metadata trước đó vẫn giữ. Chỉ đổi Project status thì chuyển tham chiếu source revision mà không vô hiệu hóa nội dung stage. Chỉ đổi Issue updatedAt do timeline event không tạo revision. Không suy luận approval từ board status.

`stages.mjs` ghi artifact immutable, hash, workflow events và approval tham chiếu hash finalize. `release.mjs` ràng buộc review với HEAD/branch sạch và file manifest, prepare rồi publish; giữ partial state khi push xong nhưng PR chưa xác minh. `transport.mjs`/`credential.mjs` dùng private Git credential protocol chỉ cho đúng host/repo. Không chạy credential helper trực tiếp trong tool/chat.

## Giới hạn bảo mật

Redaction che PAT đang dùng, các mẫu token/key phổ biến, private-key blocks và các trường secret thông dụng trước khi lưu. Đây là best effort, không phải DLP đầy đủ. Issue/comment là dữ liệu không tin cậy, kể cả sau redaction; helper không thực thi nội dung. Hook policy nằm ở `policy.mjs`; adapters `agent-hook.mjs`, `git-hook.mjs`. Chỉ runtime hooks đã trust mới có hiệu lực trong session.

Không đưa RTK metrics vào state hoặc hồ sơ ticket. Token không được lưu trong vault. Folder theo username tránh ghi đè, không phải phân quyền đọc. Bản tóm tắt tiếng Việt và tài liệu từng stage thuộc skills; `source.md` giữ nguyên ngôn ngữ nguồn.

## Kiểm tra

`pnpm test:workflow` chạy tests bằng folder tạm và mock API, không dùng PAT thật. `pnpm lint:workflow` dùng config riêng cho Node helpers, không tải cấu hình Next.js. `pnpm workshop:check` dùng PAT thật, chỉ đọc GitHub và tạo/xóa một probe local. `pnpm workshop:sync <id>` đọc GitHub và ghi hồ sơ local.

## Điều phối v2

`views.mjs` dựng TASK/PLAN/CHECKS từ records; `verification.mjs` chạy checks thật và khóa evidence theo plan, code content và context; `dispatch.mjs` chỉ chọn stage tiếp theo. Agent tự thiết kế steps theo task. Không có classifier bên ngoài hoặc pipeline Search cố định.

Migration hồ sơ giữ bản gốc; không tự nâng plan cũ thành verified. Context ngoại vi cần probe/observe lại; helper không tự phát hiện DB remote thay đổi. Check command thành công chưa chứng minh assertions đúng — Review kiểm cả chất lượng kiểm thử.
