---
name: task-review
description: Review code và evidence của Issue trên đúng phiên bản; ghi findings hoặc verdict trong CHECKS.md.
---

# Task review

Dùng Issue ID từ yêu cầu hiện tại; xác nhận `pnpm workshop:target <id>`. Không đoán repo/account/Issue hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../../docs/workflow/CONTRACT.md) tại repo root `docs/workflow/CONTRACT.md`.

1. Sync/state, đọc plan/AC, diff và code liên quan, implementation evidence. Không chỉ đọc summary của người implement.
2. Kiểm assertions có thật sự chứng minh AC, kind/target đúng và không dùng mock thay runtime bắt buộc. Đối chiếu security/data lifecycle/compatibility khi liên quan.
3. Có findings: record review-findings với checks.md và findings open; quay Implement sửa trong scope. Không ép report thành pass.
4. Code đổi: refresh evidence, record implement đúng HEAD, rồi review lại phần ảnh hưởng. Khi đủ: record review verdict pass, findings resolved; helper kiểm required evidence và ghi reviewed.
5. Đủ điều kiện thì chuyển Release theo yêu cầu user; review local chưa phải leader acceptance.

Kiểm cả độ đầy đủ của plan so với kết quả người dùng cần, không chỉ tuân thủ plan. Đối chiếu delivery target, phiên bản, preparation và assertions trên chính target: test copy pass không chứng minh target đã dùng được. Target chưa sẵn sàng hoặc plan loại mất bước bàn giao cần thiết là finding; sai phạm vi thì quay Finalize, không tự mở rộng quyền.

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author/account, thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/review-contract.md) cho format và helper của bước này.
