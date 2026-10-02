---
name: task-review
description: "Review code và evidence của ticket trên đúng commit theo hai trục, ghi findings hoặc verdict vào CHECKS.md. Dùng khi `status` trả `next: review`."
argument-hint: "<ticket>"
---

# Task review

Làm theo mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`. Review là một lượt kiểm độc lập trên chính diff và evidence; bản tóm tắt của bước Implement chỉ là điểm bắt đầu để đọc.

1. **Đọc căn cứ**: plan và AC, diff từ base branch tới HEAD đã implement, code liên quan, evidence của các check. Xong khi đã đọc toàn bộ diff.
2. **Review theo hai trục tách riêng**, mỗi trục một lượt đọc diff riêng (một subagent cho mỗi trục khi runtime hỗ trợ), theo [review-axes](references/review-axes.md) tại `.agents/skills/task-review/references/review-axes.md`:
   - **Yêu cầu**: diff so với AC, plan và delivery — phần thiếu hoặc làm dở, phần thừa ngoài plan, phần có làm nhưng sai. Kiểm assertion thật sự chứng minh AC, `kind`/target đúng, runtime bắt buộc được kiểm bằng runtime thật. Đối chiếu bảo mật, vòng đời dữ liệu và tương thích khi liên quan.
   - **Chuẩn code**: diff so với chuẩn code đã viết ra của repo, cộng danh sách smell nền.

   Xong khi mỗi trục có danh sách findings riêng (có thể rỗng), mỗi finding ghi `axis`.
3. **Kiểm độ đầy đủ của plan** so với kết quả người dùng cần: delivery target, phiên bản, phần chuẩn bị và assertion trên chính target. Test trên bản sao pass chưa chứng minh target dùng được. Target chưa sẵn sàng, hoặc plan thiếu một bước bàn giao cần thiết, là một finding; sai phạm vi thì quay Finalize để plan được duyệt lại. Xong khi trả lời được, kèm evidence: target bàn giao đã dùng được hay chưa.
4. **Có findings ở bất kỳ trục nào**: `record <ticket> review-findings` với checks.md (hai tiêu đề `## Yêu cầu` và `## Chuẩn code`, giữ nguyên từng trục) và các findings `open`; quay Implement sửa trong scope. Verdict phản ánh đúng những gì tìm thấy. Xong khi `status` trả `next: implement`.
5. **Sau khi code đổi**: chạy lại các check bị ảnh hưởng, `record implement` trên HEAD mới, rồi review lại phần bị ảnh hưởng. Xong khi các check pass trên HEAD mới và mỗi finding cũ đã được kiểm lại.
6. **Đủ điều kiện**: `record <ticket> review` với `verdict: "pass"` và mọi finding `resolved`; helper kiểm evidence và ghi `reviewed`. Xong khi `status` trả `next: handoff`.
7. **Báo cáo.** Chuyển Handoff khi người dùng yêu cầu. `reviewed` là review nội bộ của workflow; việc nghiệm thu của leader diễn ra trên MR.
