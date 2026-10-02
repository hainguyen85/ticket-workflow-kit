# Hai trục review

Đọc diff của ticket từ base branch tới HEAD đã implement. Mỗi trục là một lượt đọc riêng; chạy mỗi trục trong một subagent riêng khi runtime hỗ trợ, và đưa cho subagent đúng tài liệu của trục đó. Báo cáo từng trục dưới 400 từ, trích hunk hoặc dòng yêu cầu cho mỗi finding.

Trong `findings` của input `review-findings`/`review`, mỗi phần tử có thêm `axis`: `"spec"` (Yêu cầu) hoặc `"standards"` (Chuẩn code).

## Trục Yêu cầu

Nguồn đối chiếu: AC và scope trong PLAN.md, `delivery`, nguồn hiện hành trong `request/`.

Báo ba loại:

- **Thiếu**: yêu cầu hoặc AC chưa làm, hoặc mới làm một phần.
- **Thừa**: hành vi trong diff mà plan không yêu cầu.
- **Sai**: có làm nhưng làm không đúng điều AC mô tả.

Kiểm chất lượng của chính các check, vì helper chỉ chứng minh lệnh đã chạy:

- **Tự xác nhận**: assertion tính lại giá trị mong đợi theo đúng cách code tính, nên luôn pass. Giá trị mong đợi phải đến từ nguồn độc lập: yêu cầu, ví dụ đã biết đúng, literal.
- **Dính nội bộ**: test mock cộng tác viên nội bộ, gọi phương thức private, hoặc kiểm qua đường vòng (đọc thẳng DB thay vì qua interface). Dấu hiệu: refactor không đổi hành vi mà test vẫn vỡ.
- **Sai điểm đặt**: check quan sát ở tầng thấp hơn nơi lỗi thật sự xảy ra, hoặc khác điểm đặt test đã ghi trong plan.
- **Mock thay runtime**: AC cần DB/API/browser thật nhưng check chạy trên mock; target bàn giao chưa được nghiệm thu tại chỗ.

## Trục Chuẩn code

Nguồn đối chiếu, theo thứ tự ưu tiên:

1. Chuẩn code đã viết ra của repo (`CONTRIBUTING.md`, `CODING_STANDARDS.md`, tài liệu kiến trúc, cấu hình Checkstyle/SpotBugs/formatter). Vi phạm chuẩn đã viết là finding cứng; trích file và quy tắc.
2. Danh sách smell nền dưới đây. Mỗi smell luôn là một **nhận định** ("có thể là Feature Envy"), và chuẩn của repo thắng khi hai bên mâu thuẫn.

Bỏ qua những gì công cụ của repo đã tự kiểm.

| Smell | Dấu hiệu trong diff | Hướng sửa |
|---|---|---|
| Tên khó hiểu | Tên hàm, biến, kiểu không nói lên nó làm gì hay chứa gì | Đặt lại tên; không tìm được tên trung thực thì thiết kế đang mờ |
| Code lặp | Cùng một khối logic xuất hiện ở nhiều chỗ trong thay đổi | Tách phần chung, gọi từ các nơi |
| Feature Envy | Phương thức dùng dữ liệu của object khác nhiều hơn của chính nó | Chuyển phương thức về nơi chứa dữ liệu |
| Data Clumps | Vài field/tham số luôn đi cùng nhau | Gom thành một kiểu |
| Primitive Obsession | Chuỗi/số nguyên thủy đứng thay một khái niệm nghiệp vụ | Tạo kiểu nhỏ cho khái niệm đó |
| Switch lặp lại | Cùng một `switch`/chuỗi `if` trên cùng một kiểu ở nhiều nơi | Đa hình, hoặc một bảng tra dùng chung |
| Shotgun Surgery | Một thay đổi logic buộc sửa rải rác nhiều file | Gom thứ thay đổi cùng nhau vào một module |
| Divergent Change | Một module bị sửa vì nhiều lý do không liên quan | Tách để mỗi module đổi vì một lý do |
| Tổng quát hóa thừa | Abstraction, tham số, hook cho nhu cầu plan không có | Xóa; chỉ thêm khi có nhu cầu thật |
| Message Chains | Chuỗi `a.b().c().d()` mà nơi gọi phải biết cả đường đi | Giấu đường đi sau một phương thức |
| Middle Man | Lớp/hàm hầu như chỉ chuyển tiếp | Bỏ, gọi thẳng đích |
| Refused Bequest | Lớp con bỏ qua hoặc ghi đè phần lớn thứ nó kế thừa | Thay kế thừa bằng composition |

Danh sách smell lấy từ Martin Fowler, *Refactoring*, chương 3; cách chia hai trục theo skill `code-review` của bộ mattpocock/skills (xem `.agents/CREDITS.md`).
