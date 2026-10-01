---
name: task-release
description: Prepare và publish PR của Issue đã verified/reviewed, giữ partial retry; dừng PR ready chờ leader.
---

# Task release

Dùng Issue ID từ yêu cầu hiện tại; xác nhận `pnpm workshop:target <id>`. Không đoán repo/account/Issue hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../../docs/workflow/CONTRACT.md) tại repo root `docs/workflow/CONTRACT.md`.

1. Sync và next/state; kiểm plan/approval, reviewed HEAD, required evidence hiện hành, file scope và base.
2. Soạn PR mô tả behavior, validation thật, bước vận hành/giới hạn liên quan. Metadata trung lập, Refs #ID, không tự đóng Issue; không đưa metrics RTK hoặc secrets.
3. Chạy prepare, xem output cụ thể. Publish nếu user đã yêu cầu; không hỏi lại quyền đã có. Không push main/force/merge/auto-merge/deploy.
4. Nếu partial, đọc state và retry publish để tìm branch/PR đã tồn tại; không tạo trùng. Cập nhật Project theo helper, xác minh head/base/PR ready.
5. CHECKS hiện hành hiển thị link/trạng thái bàn giao. Báo rõ phần local/mock/live; chưa publish thì ghi prepared, không ghi PR ready.

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author/account, thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/release-contract.md) cho format và helper của bước này.
