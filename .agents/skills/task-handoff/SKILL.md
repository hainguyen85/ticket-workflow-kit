---
name: task-handoff
description: Chuẩn bị bàn giao ticket đã verified/reviewed, soạn nội dung MR; developer tự push và tạo MR, helper xác minh và ghi nhận.
argument-hint: "<ticket> [mr-url]"
---

# Task handoff

Dùng ticket ID (`<key>-<slug>`, hoặc chỉ key) từ yêu cầu hiện tại; xác nhận bằng `node .agents/workflow/task.mjs status <ticket>`. Không đoán repo/ticket hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`.

1. Đọc next/state; kiểm plan/approval, reviewed HEAD, required evidence hiện hành, file scope và base.
2. Soạn title và body MR theo mẫu dưới đây. Metadata trung lập, body có `Refs <key>`, không dùng từ khóa tự đóng issue; không đưa metrics RTK hoặc secrets.
3. Chạy `prepare <ticket> .workflow-tmp/mr.json`, xem output cụ thể. Agent không push, không tạo/merge MR, không deploy. Đưa cho developer lệnh push (`pushCommand`), branch đích và nội dung MR trong `handoff.md`.
4. Sau khi developer báo đã push (và tạo MR), chạy `handoff <ticket> [mr-url]`. Helper đối chiếu HEAD trên remote với code đã review; chưa khớp hoặc không kết nối được thì chưa ghi nhận — báo đúng trạng thái, không tự khai đã bàn giao.
5. CHECKS hiện hành hiển thị branch, trạng thái push và link MR. Báo rõ phần local/mock/live; chưa xác minh push thì ghi prepared, không ghi đã bàn giao. Merge là việc của leader.

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

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author (Git identity), thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Khi lệnh báo `docsRepo.uncommitted: true`, commit phần hồ sơ của ticket trong repo hồ sơ (`docs(ticket): <ticket> <bước>`, metadata trung lập); không push — người dùng tự push để chia sẻ với team.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/handoff-contract.md) cho format và helper của bước này.
