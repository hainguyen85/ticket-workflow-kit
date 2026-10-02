---
name: task-analyze
description: "Điều tra hiện trạng và đề xuất phương án xử lý cho ticket, ghi vào TASK.md; chưa sửa code. Dùng khi `status` trả `next: analysis`."
argument-hint: "<ticket>"
---

# Task analyze

Làm theo mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`. Kết quả của bước này là TASK.md đủ để một người khác lập plan mà không phải hỏi lại bối cảnh; việc sửa code bắt đầu ở Implement, sau khi plan được duyệt.

1. **Nắm đầu vào.** Intake phải hiện hành (`docsMissing: false`); nếu chưa, quay Sync. Đọc các nguồn hiện hành trong `request/`, TASK.md và phần code liên quan. Ticket có dòng `Liên quan` ở đầu TASK.md thì đọc TASK/PLAN hiện hành của ticket đó làm bối cảnh; đó là dữ liệu tham khảo. Với CR, phân tích phần thay đổi và ảnh hưởng của nó, giữ nguyên phần phân tích cũ làm lịch sử. Xong khi nêu được yêu cầu trong một hai câu và biết nguồn nào là mới.
2. **Điều tra hiện trạng.** Chọn dữ kiện cần biết từ yêu cầu và rủi ro; lần theo luồng code, config/plugin và runtime khi cần. Phạm vi điều tra do task quyết định: task tài liệu hay logic thuần chỉ cần những tầng nó chạm tới. Thao tác điều tra chỉ đọc, dữ liệu và trạng thái hệ thống giữ nguyên. Mỗi dữ kiện thành một observation: `observed` kèm căn cứ (file, lệnh, kết quả), `inferred`, hoặc `unknown`. Xong khi mọi dữ kiện mà plan sẽ dựa vào đều `observed`, hoặc được ghi rõ là chưa biết kèm lý do.

   Ticket loại `bug` điều tra theo ba việc, căn cứ là mô tả lỗi, stack trace và source code:
   - **Ghi triệu chứng và stack trace** thành observation, căn cứ là source ID trong `request/`.
   - **Lần từ stack trace vào code**: các frame thuộc dự án, rồi đường đi của dữ liệu tới điểm lỗi. Điều đọc được trực tiếp từ code là `observed` kèm file và dòng; điều suy ra mà chưa được xác nhận là `inferred`.
   - **Nêu giả thuyết về nguyên nhân**, xếp theo khả năng, mỗi giả thuyết kèm một dự đoán kiểm được: "nếu nguyên nhân là X thì đổi Y sẽ làm lỗi biến mất". Stack trace đã chỉ thẳng nguyên nhân thì một giả thuyết là đủ.

   Xong khi task.md có triệu chứng, đường lần từ stack trace tới điểm lỗi, và mỗi giả thuyết có dự đoán của nó.
3. **Chốt thuật ngữ** theo [glossary và ADR](../../workflow/GLOSSARY-ADR.md) tại `.agents/workflow/GLOSSARY-ADR.md`. Đối chiếu từ ngữ nghiệp vụ trong yêu cầu với file glossary (`target.glossary` trong kết quả `status`) và với tên đang dùng trong code. Một từ mang hai nghĩa, hoặc trái với định nghĩa đã có, thì hỏi lại người dùng bằng một câu nêu rõ hai nghĩa. Thuật ngữ vừa được chốt thì ghi vào glossary ngay lúc đó. Xong khi mỗi thuật ngữ nghiệp vụ mà task.md dùng đều có trong glossary với đúng một nghĩa.
4. **Khảo sát đường tới "dùng được".** Trạng thái người dùng đang dùng; target bàn giao (runtime hay artifact); các bước chuẩn bị, dữ liệu, cấu hình, phụ thuộc; cách nghiệm thu tại target; môi trường test khác môi trường bàn giao ở điểm nào. Phần vận hành thuộc scope của ticket. Xong khi task.md trả lời được: kết quả sẽ được dùng ở đâu và được kiểm ở đó bằng cách nào.
5. **Xác định khoảng cách và phương án.** Khoảng cách so với yêu cầu, phụ thuộc, rủi ro (bảo mật xét theo ranh giới tin cậy thật của task) và cách verify. Đề xuất phương án với đánh đổi vừa đủ để quyết định: một hướng rõ ràng kèm lựa chọn thay thế ngắn là đủ. Xong khi mỗi phương án nêu được nó giải quyết gì, giá phải trả, và kiểm bằng cách nào.
6. **Hỏi các quyết định còn thiếu** theo mục "Hỏi quyết định theo vòng" của contract; dữ kiện tra được thì tự tra tiếp. Câu chưa ai trả lời được ngay (chờ khách hàng, chờ leader) ghi vào mục câu hỏi mở của task.md kèm đáp án đề xuất. Quyết định vừa được chốt mà khó đảo ngược, gây ngạc nhiên nếu thiếu bối cảnh, và là kết quả của một đánh đổi thật thì đề nghị người quyết định ghi một ADR vào `target.adr`; được đồng ý thì soạn ADR và để task.md trỏ tới file đó. Xong khi không còn quyết định nào bị ngầm giả định.
7. **Ghi analysis**: `record <ticket> analysis` với task.md và `observations`. Xong khi `status` trả `next: finalize`.
8. **Báo cáo**, kèm thuật ngữ và ADR vừa thêm; người phụ trách chọn hướng xử lý từ các phương án đã nêu.
