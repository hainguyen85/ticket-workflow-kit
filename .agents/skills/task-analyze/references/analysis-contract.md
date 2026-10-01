# analyze: artifact và validation

Nguồn schema duy nhất: `.agents/workflow/CONTRACT.md`, đọc phần stage `analyze` và các gate liên quan. Current views nằm ở ticket root trong repo hồ sơ; immutable records bên trong `.workflow`; nguồn yêu cầu trong `request/`. Không sửa tay state, request hoặc tạo docs trùng nội dung.

Khi source/code/context đổi, đọc delta và evidence bị ảnh hưởng; không nạp lại cả lịch sử. Dùng helper record/check/next theo contract, không tự giả lập approval hoặc test result. Trình tự triển khai do agent lập cho từng task; reference này không quy định các bước đặc thù của một loại task nào.
