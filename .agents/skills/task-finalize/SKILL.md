---
name: task-finalize
description: "Chốt PLAN.md (AC, steps, checks, delivery) từ phương án đã chọn và trình duyệt; chưa implement. Dùng khi `status` trả `next: finalize` hoặc `next: approve`."
argument-hint: "<ticket>"
---

# Task finalize

Làm theo mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`; schema và các điều kiện của plan nằm ở mục "Schema stage" và "Hoàn thành và môi trường bàn giao". Bước này kết thúc ở plan đã được duyệt; việc sửa code thuộc Implement.

1. **Nắm đầu vào và hướng đã chọn.** Đọc TASK.md và nguồn hiện hành; ticket nhận từ người khác thì TASK.md là điểm bắt đầu. Analysis thiếu hoặc cần kiểm lại thì quay Analyze. Hướng xử lý hoặc scope chưa được quyết thì hỏi theo mục "Hỏi quyết định theo vòng" của contract. Xong khi có một hướng do người quyết định chọn, ghi được `decision.optionId` và `rationale`.
2. **Chốt hành vi.** AC đánh số, scope, giả định và giới hạn. Xong khi mỗi AC kiểm được bằng một quan sát cụ thể.
3. **Lập steps thành các lát dọc.** Mỗi step làm trọn một hành vi qua mọi tầng nó chạm tới (ví dụ API Spring Boot cùng màn hình Vue dùng nó) và tự kiểm chứng được bằng checks của chính nó. Việc dọn đường (prefactor) là step đứng trước. Thay đổi cơ học lan rộng (đổi tên, đổi kiểu dùng chung) đi theo trình tự mở rộng → chuyển dần từng cụm → thu hẹp, mỗi cụm là một step vẫn xanh. Sắp steps theo phụ thuộc; chỉ đưa vào những tầng task thật sự cần. Xong khi mỗi step có mục tiêu, `dependsOn` và ít nhất một check.
4. **Chốt facts và checks.** Mọi `requiredFacts` phải là observation `observed` của analysis; còn thiếu thì quay Analyze. Mỗi required check có ID, `kind`, AC, `command` dạng argv và `timeoutSeconds` khi lệnh chạy lâu. Trong plan.md, ghi cho mỗi check **điểm đặt test**: interface công khai mà check quan sát hành vi qua đó, ưu tiên điểm sẵn có và cao nhất có thể; giá trị mong đợi lấy từ nguồn độc lập với code (yêu cầu, ví dụ đã biết đúng). Hành vi cần runtime được kiểm trên môi trường hoặc fixture thật. Ghi rõ quyền chạy test, server, thao tác dữ liệu và cách phục hồi khi task cần đến. Xong khi mỗi AC có ít nhất một check và mỗi check thuộc một step.
5. **Chốt delivery**: `target` cụ thể, `preparation`, `permissions`, `recovery` và các check nghiệm thu chạy trên chính target đó. Chức năng chạy local thì "xong" nghĩa là dùng được trên local đã thống nhất; triển khai lên môi trường khác chỉ khi yêu cầu nêu. Các bước chuẩn bị target nằm trong plan; chỗ nào chưa có quyền để hoàn thành thì nêu rõ trước khi trình duyệt. Test trên bản sao là lớp kiểm bổ sung bên cạnh nghiệm thu tại target. Xét cả dữ liệu, trạng thái hiện hữu và hành vi khi điều kiện sẵn sàng còn thiếu. Xong khi mỗi check trong `delivery.checks` có `target` trùng `delivery.target`.
6. **Ghi plan**: `record <ticket> finalize` với plan.md, `decision`, `files` (đủ mọi file sẽ đổi), `risks`, `requiredFacts`, `requiredChecks`, `steps`, `delivery`. Xong khi `status` trả `next: approve`.
7. **Trình duyệt.** Đưa plan cụ thể cho người có thẩm quyền (developer hoặc leader). Lời duyệt đến từ người đó trong hội thoại: ghi `record <ticket> approve` với `approvedBy` là tên người duyệt và `evidence` là nguyên văn lời duyệt. Đã có lời duyệt cho đúng nội dung này thì ghi ngay. Với CR, bản plan cũ nằm lại trong lịch sử; nêu rõ phần thay đổi cần quyết định. Chưa có lời duyệt thì dừng ở đây và báo cáo. Xong khi `status` trả `next: implement`.
8. **Báo cáo.**
