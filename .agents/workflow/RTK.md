# RTK trong workflow

RTK giảm output CLI; không đo toàn bộ token/chi phí model. Skills không ghi metrics vào hồ sơ/MR.

- Dùng filter phù hợp cho status/log/test/build có noise: `rtk git status`, runner filter có trong `rtk --help` của bản đang dùng.
- Giữ raw bằng lệnh gốc hoặc `rtk proxy` khi đọc source/diff nguyên văn, JSON cần parse hoặc điều tra lỗi. Proxy chỉ tracking, gain 0% là đúng.
- Không chạy filter làm mất assertions/failure/exit code. Check helper đã giữ log gốc, khi chạy nó không cần bọc thêm filter chỉ để tăng gain.
- Không giả định hook Claude hoạt động trong Codex; không chạy `rtk hook claude` trong Codex.
- Trước/sau tại cùng cwd/account/máy: `rtk gain --project`, `rtk gain --project --history`. Đọc delta counters, không lấy lifetime % hoặc cộng phần trăm.
- Đánh giá adoption (filter/raw/proxy), output reduction và task outcome riêng. Lệnh đã gọn có thể không tiết kiệm; không tối ưu chỉ để làm gain đẹp.
- `discover`/`session` ở bản RTK mô tả Claude history không chứng minh coverage Codex. Muốn đo usage tổng phải dùng telemetry runtime/provider; ngoài phần RTK này.
