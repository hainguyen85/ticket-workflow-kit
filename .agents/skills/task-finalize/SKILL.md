---
name: task-finalize
description: Chốt PLAN.md từ yêu cầu, hiện trạng đã điều tra và phương án developer chọn; chưa implement.
---

# Task finalize

Dùng Issue ID từ yêu cầu hiện tại; xác nhận `pnpm workshop:target <id>`. Không đoán repo/account/Issue hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../../docs/workflow/CONTRACT.md) tại repo root `docs/workflow/CONTRACT.md`.

1. Đọc analysis/source hiện hành và quyết định developer. Chốt behavior/AC, scope, assumptions và giới hạn.
2. Tự lập steps theo dependencies của task, mỗi step có mục tiêu và checks. Không sao chép trình tự Search; task logic/tài liệu không mặc định cần DB/browser.
3. Chốt requiredFacts và requiredChecks (ID/kind/AC/command argv). Với hành vi cần runtime, xác định môi trường/fixture thật; build hoặc mock không đủ. Quyền chạy test/server/data operations và phục hồi phải rõ khi liên quan.
4. Ghi plan.md cùng fields/files/risks/steps/checks. Unknown fact bắt buộc phải được khảo sát trước khi chốt; có thể quay Analyze.
5. Trình plan cụ thể để developer duyệt. Ghi approve từ lời duyệt thật, đúng hash/scope; không hỏi lại nếu đã được duyệt. CR giữ v1 và chỉ rõ delta cần quyết định.

Chốt delivery theo contract: target cụ thể, preparation, permissions, recovery và required checks nghiệm thu trên target đó. Với chức năng chạy local, mặc định kết quả implement là dùng được trên local đã thống nhất; không mặc định deploy remote. Đưa các bước chuẩn bị target vào plan được duyệt; nếu chưa có quyền, nêu rõ điểm chưa thể hoàn thành trước khi duyệt. Test trên bản sao là lớp kiểm bổ sung, không thay nghiệm thu bàn giao. Xét cả dữ liệu/trạng thái hiện hữu và hành vi khi thiếu điều kiện sẵn sàng nếu liên quan.

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author/account, thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/finalize-contract.md) cho format và helper của bước này.
