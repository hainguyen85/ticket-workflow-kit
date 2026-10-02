---
name: task-implement
description: Triển khai plan ticket đã duyệt, tự kiểm tra/sửa lỗi trong scope, commit local và ghi CHECKS.md; dừng trước push.
argument-hint: "<ticket>"
disable-model-invocation: true
---

# Task implement

Dùng ticket ID (`<key>-<slug>`, hoặc chỉ key) từ yêu cầu hiện tại; xác nhận bằng `node .agents/workflow/task.mjs status <ticket>`. Không đoán repo/ticket hoặc đọc env. Chỉ đọc state/current views và context liên quan; tuân thủ [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`.

1. Đọc next/state, kiểm can-implement. Đọc plan active và diff. Tạo/resume branch `feature/<ticket>` bằng `start <ticket>`, giữ thay đổi ngoài scope.
2. Thực hiện các steps do agent đã lập trong plan; không có thứ tự DB/API/UI cố định trong skill. Kiểm đầu vào/phụ thuộc trước mỗi phần; nếu assumptions sai, thu evidence và đánh giá ảnh hưởng.
3. Khi task cần môi trường/dữ liệu, probe target thật rồi record observe context với evidence, không in secrets. Chỉ thao tác trong quyền đã duyệt; không hỏi lại cho test cần thiết đã nằm trong scope.
4. Chạy từng required check bằng `check <ticket> <check-id>`. Lỗi trong scope: tự chẩn đoán/sửa và kiểm lại. Check làm thay đổi code, fail, timeout hoặc context/code drift phải xử lý; không tự điền pass. Nếu cần đổi scope/phương án thì trình delta về Finalize.
5. Record checkpoint checks.md khi cần resume hoặc blocker. Không tạo một tài liệu tiến độ mới cho mỗi phần.
6. Soát diff/metadata, commit local bằng identity repo, chạy lại checks cần thiết nếu content đổi. Record implement chỉ khi clean và đủ required evidence; helper ghi verified. Báo phần chưa kiểm nếu có, không coi code đã viết là xong.
7. Chuyển Review; không push/MR ở bước này.

Sau kiểm thử cô lập, thực hiện preparation trên target bàn giao trong quyền đã duyệt, probe và observe deliveryTarget/deliveryIdentity rồi chạy delivery checks tại đó. Runner phải xác minh đúng target và phiên bản đang chạy; không thay bằng server/fixture riêng rồi xóa sau test. Nếu thiếu quyền hoặc target chưa dùng được, ghi checkpoint và phần còn lại, không record verified. Hoàn thành phải báo nơi sử dụng và kết quả smoke thực tế; không để Review làm nốt bước triển khai.

Khi ghi tài liệu, cung cấp change.summary và change.reason ngắn gọn. Helper tự ghi author (Git identity), thời điểm, version và changelog; không tự đặt metadata hoặc sửa bản lưu cũ. Approval/check runs là sự kiện riêng, không tăng version PLAN.

Khi lệnh báo `docsRepo.uncommitted: true`, commit phần hồ sơ của ticket trong repo hồ sơ (`docs(ticket): <ticket> <bước>`, metadata trung lập); không push — người dùng tự push để chia sẻ với team.

Mỗi lần báo: đã làm, phát hiện chính, trạng thái thật, current doc, bước tiếp theo. Đọc [reference](references/implementation-contract.md) cho format và helper của bước này.
