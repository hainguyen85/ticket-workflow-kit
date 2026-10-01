---
name: task-handoff
description: Chuẩn bị bàn giao ticket đã verified/reviewed, soạn nội dung MR; developer tự push và tạo MR, helper xác minh và ghi nhận.
---

# Task handoff

Dùng ticket ID (`<key>-<slug>`, hoặc chỉ key) từ yêu cầu hiện tại; xác nhận bằng `node .agents/workflow/task.mjs status <ticket>`. Không đoán repo/ticket hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`.

1. Đọc next/state; kiểm plan/approval, reviewed HEAD, required evidence hiện hành, file scope và base.
2. Soạn title/body MR mô tả behavior, validation thật, bước vận hành/giới hạn liên quan. Metadata trung lập, body có `Refs <key>`, không dùng từ khóa tự đóng issue; không đưa metrics RTK hoặc secrets.
3. Chạy `prepare <ticket> .workflow-tmp/mr.json`, xem output cụ thể. Agent không push, không tạo/merge MR, không deploy. Đưa cho developer lệnh push (`pushCommand`), branch đích và nội dung MR trong `handoff.md`.
4. Sau khi developer báo đã push (và tạo MR), chạy `handoff <ticket> [mr-url]`. Helper đối chiếu HEAD trên remote với code đã review; chưa khớp hoặc không kết nối được thì chưa ghi nhận — báo đúng trạng thái, không tự khai đã bàn giao.
5. CHECKS hiện hành hiển thị branch, trạng thái push và link MR. Báo rõ phần local/mock/live; chưa xác minh push thì ghi prepared, không ghi đã bàn giao. Merge là việc của leader.

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author (Git identity), thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Khi lệnh báo `docsRepo.uncommitted: true`, commit phần hồ sơ của ticket trong repo hồ sơ (`docs(ticket): <ticket> <bước>`, metadata trung lập); không push — người dùng tự push để chia sẻ với team.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/handoff-contract.md) cho format và helper của bước này.
