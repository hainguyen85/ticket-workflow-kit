---
name: task-implement
description: "Triển khai plan đã duyệt của ticket, chạy required checks, commit local và ghi CHECKS.md; dừng trước push. Dùng khi `status` trả `next: implement`."
argument-hint: "<ticket>"
---

# Task implement

Làm theo mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`. "Xong" ở bước này nghĩa là kết quả dùng được tại target bàn giao và có evidence từ check runner; code đã viết mà chưa kiểm thì chưa xong.

1. **Vào đúng chỗ làm.** `can-implement <ticket>` phải qua; đọc plan đang hiệu lực và diff hiện có. `start <ticket>` tạo hoặc quay lại branch `feature/<ticket>`. Thay đổi ngoài scope đang có trong worktree được giữ nguyên. Xong khi đang ở đúng branch của ticket.
2. **Làm theo steps của plan**, theo thứ tự phụ thuộc. Trước mỗi step, kiểm đầu vào và phụ thuộc của nó; giả định nào sai thì thu căn cứ và đánh giá ảnh hưởng tới plan. Xong một step khi các check của step đó pass.

   Ticket loại `bug`: mỗi dòng log gỡ lỗi tạm thời mang cùng một tiền tố riêng của ticket (vd. `[DEBUG-<key>]`), đặt tại ranh giới phân biệt được các giả thuyết của TASK.md; tìm tiền tố đó trong worktree là thấy hết để gỡ.
3. **Dùng môi trường thật khi task cần.** Probe target rồi `record <ticket> observe` với các dữ kiện đã kiểm và căn cứ; giá trị bí mật ở lại trong môi trường, hồ sơ chỉ ghi tên và danh tính không nhạy cảm. Mọi thao tác nằm trong phạm vi quyền plan đã duyệt; test cần thiết thuộc phạm vi đó thì chạy luôn. Xong khi mỗi dữ kiện môi trường mà check dựa vào đã nằm trong một bản ghi `observe`.
4. **Chạy từng required check** bằng `check <ticket> <check-id>`; kết quả check chỉ đến từ lệnh này. Lỗi trong scope thì tự chẩn đoán, sửa và chạy lại. Check fail, timeout, làm đổi source, hoặc evidence cũ vì code/context đổi đều phải xử lý xong. Cần đổi scope hoặc phương án thì trình phần thay đổi và quay Finalize. Xong khi mọi required check pass trên trạng thái code hiện tại.
5. **Nghiệm thu tại target bàn giao**, sau kiểm thử cô lập: thực hiện `preparation` trong phạm vi quyền đã duyệt; probe và `observe` `deliveryTarget` cùng `deliveryIdentity`; chạy các delivery check tại chính target đó, để runner xác minh đúng target và phiên bản đang chạy. Thiếu quyền hoặc target chưa dùng được thì ghi checkpoint với phần còn lại. Xong khi các delivery check pass tại target.
6. **Checkpoint khi cần dừng giữa chừng**: `record <ticket> checkpoint` với checks.md nêu phần đã làm, phần còn lại, bước tiếp, và `blocker` nếu bị chặn. Toàn bộ tiến độ nằm trong checks.md. Xong khi `status` cho thấy stage implement ở `in-progress` hoặc `blocked`.
7. **Hoàn tất.** Soát diff và metadata; với ticket loại `bug`, diff đã sạch log gỡ lỗi tạm và checks.md ghi nguyên nhân đã xác định. Commit local bằng Git identity của repo; chạy lại các check bị ảnh hưởng nếu nội dung vừa đổi. `record <ticket> implement` khi worktree sạch và đủ evidence; helper ghi `verified`. Xong khi `status` trả `next: review`.
8. **Báo cáo** nơi sử dụng, kết quả smoke thực tế và phần chưa kiểm được nếu có; rồi chuyển Review. Push và MR thuộc bước Handoff, do developer thực hiện.
