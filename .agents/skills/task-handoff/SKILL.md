---
name: task-handoff
description: "Chuẩn bị bàn giao ticket đã reviewed và soạn nội dung MR; developer tự push và tạo MR, helper xác minh rồi ghi nhận. Dùng khi `status` trả `next: handoff` và người dùng yêu cầu bàn giao."
argument-hint: "<ticket> [mr-url]"
---

# Task handoff

Làm theo mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`. Phần việc của agent là chuẩn bị và ghi nhận; push, tạo MR, merge và deploy do con người làm.

1. **Kiểm điều kiện**: plan và approval còn hiệu lực, review `pass` trên đúng HEAD, mọi required check còn hiệu lực, diff chỉ gồm file trong `files` của plan, base branch đã nằm trong lịch sử của branch. Xong khi `status` trả `next: handoff`.
2. **Soạn title và body MR** theo mẫu dưới đây. Metadata trung lập; body tham chiếu ticket bằng `Refs <key>`, là cách tham chiếu duy nhất được dùng (helper từ chối từ khóa tự đóng issue như `Fixes #…`); nội dung gồm hành vi, bằng chứng và vận hành, không chứa secret hay số liệu RTK. Xong khi mỗi mục của mẫu đã có nội dung hoặc được bỏ có lý do.
3. **Chạy `prepare <ticket> .workflow-tmp/mr.json`** và đọc kết quả. Đưa cho developer lệnh push (`pushCommand`), branch đích và nội dung MR trong `handoff.md`. Xong khi trạng thái là `prepared`.
4. **Sau khi developer báo đã push** (và tạo MR): chạy `handoff <ticket> [mr-url]`. Helper đối chiếu HEAD trên remote với code đã review. Chưa khớp, hoặc không kết nối được remote, thì trạng thái vẫn là `prepared`: báo đúng như vậy. Xong khi `status` trả `next: handed-off`.
5. **Báo cáo** branch, trạng thái push, link MR, và phần nào được kiểm ở local, bằng mock hay trên môi trường thật. Việc merge thuộc về leader.

## Mẫu body MR

```markdown
## Tóm tắt

<hình nhỏ nhất làm rõ thay đổi, kèm một hai câu>

## Bằng chứng

- **Trước:** <hành vi cũ, hoặc lần chạy check fail trước khi sửa>
- **Sau:** <check ID, lệnh, kết quả; ghi rõ local / mock / live>

## Mức nguy hiểm khi merge

**Đảo ngược:** <dễ | khó> — <vì sao khó, nếu khó>

**Phạm vi ảnh hưởng:** <một cụm từ> — <hệ quả có thể xảy ra>

## Vận hành và giới hạn

<bước vận hành cần làm khi merge/deploy, giới hạn đã biết>

Refs <key>
```

- **Tóm tắt**: chọn một dạng hình hợp với thay đổi — pseudocode cho logic, cây gọi hàm cho luồng chạy, cây file cho thay đổi bố cục, sơ đồ Mermaid cho tương tác giữa các thành phần, hoặc diff phác thảo khi điều cần thấy là "cái gì đổi". Giữ lại đúng những lời gọi, file, trạng thái cần để hiểu thay đổi.
- **Bằng chứng**: lấy từ check đã chạy qua helper trong CHECKS.md; ảnh chụp cho thay đổi giao diện. Không có lần chạy "trước" thì mô tả hành vi cũ.
- **Đảo ngược**: *dễ* khi revert MR là đủ; *khó* khi có thao tác phá hủy hoặc khó hoàn tác (migration dữ liệu, đổi hợp đồng API đã có người dùng, xóa dữ liệu).
- **Phạm vi ảnh hưởng**: nơi có thể bị tác động ngoài phạm vi ticket (người dùng API, dữ liệu hiện hữu, hiệu năng, cấu hình triển khai).
- Bỏ mục "Vận hành và giới hạn" khi không có gì để ghi.
