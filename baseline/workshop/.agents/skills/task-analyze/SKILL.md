---
name: task-analyze
description: Điều tra hiện trạng và lựa chọn xử lý Issue; cập nhật TASK.md, không sửa code.
---

# Task analyze

Dùng Issue ID từ yêu cầu hiện tại; xác nhận `pnpm workshop:target <id>`. Không đoán repo/account/Issue hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../../docs/workflow/CONTRACT.md) tại repo root `docs/workflow/CONTRACT.md`.

1. Đảm bảo intake hiện hành; đọc current state, nguồn và diff liên quan.
2. Tự chọn facts cần điều tra từ yêu cầu/rủi ro. Theo luồng code, config/plugins và runtime khi cần; không giả định mọi task có DB/API/UI. Ghi observations observed/inferred/unknown; facts observed có căn cứ.
3. Tìm khoảng cách với yêu cầu, dependencies, rủi ro và cách verify. Thiếu dữ kiện có thể thu thập thì tiếp tục điều tra; chỉ hỏi quyết định còn thiếu. Không khởi chạy thao tác phá hủy dữ liệu.
4. Đề xuất phương án với đánh đổi vừa đủ. Một hướng rõ có thể kèm lựa chọn thay thế ngắn; không bắt mọi task có hai kiến trúc dài. Security analysis theo trust boundary thực của task.
5. Record analysis task.md và observations. Developer chọn hướng; không tự code. CR chỉ phân tích delta và ảnh hưởng, giữ lịch sử.

Khảo sát trạng thái người dùng đang dùng và target bàn giao (runtime hoặc artifact). Xác định đường đi từ hiện trạng tới dùng được: các bước chuẩn bị, dữ liệu/cấu hình/phụ thuộc khi liên quan và cách nghiệm thu tại target. Phân biệt môi trường test với môi trường bàn giao; facts chưa rõ phải được điều tra, không tự loại phần vận hành khỏi scope.

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author/account, thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/analysis-contract.md) cho format và helper của bước này.
