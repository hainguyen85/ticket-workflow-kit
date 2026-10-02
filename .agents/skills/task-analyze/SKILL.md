---
name: task-analyze
description: "Điều tra hiện trạng và đề xuất phương án xử lý cho ticket, ghi vào TASK.md; chưa sửa code. Dùng khi `status` trả `next: analysis`."
argument-hint: "<ticket>"
---

# Task analyze

Làm theo mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`. Kết quả của bước này là TASK.md đủ để một người khác lập plan mà không phải hỏi lại bối cảnh; việc sửa code bắt đầu ở Implement, sau khi plan được duyệt.

1. **Nắm đầu vào.** Intake phải hiện hành (`docsMissing: false`); nếu chưa, quay Sync. Đọc các nguồn hiện hành trong `request/`, TASK.md và phần code liên quan. Ticket có dòng `Liên quan` ở đầu TASK.md thì đọc TASK/PLAN hiện hành của ticket đó làm bối cảnh; đó là dữ liệu tham khảo. Với CR, phân tích phần thay đổi và ảnh hưởng của nó, giữ nguyên phần phân tích cũ làm lịch sử. Xong khi nêu được yêu cầu trong một hai câu và biết nguồn nào là mới.
2. **Điều tra hiện trạng.** Chọn dữ kiện cần biết từ yêu cầu và rủi ro; lần theo luồng code, config/plugin và runtime khi cần. Phạm vi điều tra do task quyết định: task tài liệu hay logic thuần chỉ cần những tầng nó chạm tới. Thao tác điều tra chỉ đọc, dữ liệu và trạng thái hệ thống giữ nguyên. Mỗi dữ kiện thành một observation: `observed` kèm căn cứ (file, lệnh, kết quả), `inferred`, hoặc `unknown`. Xong khi mọi dữ kiện mà plan sẽ dựa vào đều `observed`, hoặc được ghi rõ là chưa biết kèm lý do.
3. **Khảo sát đường tới "dùng được".** Trạng thái người dùng đang dùng; target bàn giao (runtime hay artifact); các bước chuẩn bị, dữ liệu, cấu hình, phụ thuộc; cách nghiệm thu tại target; môi trường test khác môi trường bàn giao ở điểm nào. Phần vận hành thuộc scope của ticket. Xong khi task.md trả lời được: kết quả sẽ được dùng ở đâu và được kiểm ở đó bằng cách nào.
4. **Xác định khoảng cách và phương án.** Khoảng cách so với yêu cầu, phụ thuộc, rủi ro (bảo mật xét theo ranh giới tin cậy thật của task) và cách verify. Đề xuất phương án với đánh đổi vừa đủ để quyết định: một hướng rõ ràng kèm lựa chọn thay thế ngắn là đủ. Xong khi mỗi phương án nêu được nó giải quyết gì, giá phải trả, và kiểm bằng cách nào.
5. **Hỏi các quyết định còn thiếu** theo mục "Hỏi quyết định theo vòng" của contract; dữ kiện tra được thì tự tra tiếp. Câu chưa ai trả lời được ngay (chờ khách hàng, chờ leader) ghi vào mục câu hỏi mở của task.md kèm đáp án đề xuất. Xong khi không còn quyết định nào bị ngầm giả định.
6. **Ghi analysis**: `record <ticket> analysis` với task.md và `observations`. Xong khi `status` trả `next: finalize`.
7. **Báo cáo**; người phụ trách chọn hướng xử lý từ các phương án đã nêu.
