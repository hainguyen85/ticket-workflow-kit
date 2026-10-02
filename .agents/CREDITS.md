# Ghi công

Một số kỹ thuật trong các skill task-* được phỏng theo bộ skill mã nguồn mở dưới đây. Nội dung được viết lại cho workflow của bộ kit này, không sao chép nguyên văn.

## mattpocock/skills

- Nguồn: <https://github.com/mattpocock/skills>, commit `d81f3a1` (v1.3), giấy phép MIT, © 2026 Matt Pocock.
- Đã phỏng theo:
  - `grilling` → mục "Hỏi quyết định theo vòng" trong `workflow/CONTRACT.md` (vòng hỏi, đáp án đề xuất, dữ kiện là việc của agent).
  - `to-tickets` → quy tắc lát dọc và trình tự mở rộng → chuyển dần → thu hẹp trong `task-finalize`.
  - `tdd` → điểm đặt test trong `task-finalize` và các kiểu test kém trong `task-review/references/review-axes.md`.
  - `code-review` → hai trục review và danh sách smell nền trong `task-review`.
  - `pr` → mẫu body MR trong `task-handoff`. Skill `pr` ghi công skill `show-me` của Dex Horthy (Humanlayer).
  - `writing-for-agents` → cách viết 6 skill: điều kiện hoàn thành cho từng bước, câu khẳng định thay câu cấm, mỗi ý một chỗ, description nêu khi nào dùng.
  - `diagnosing-bugs` → nhánh ticket loại `bug`: giả thuyết xếp theo khả năng kèm dự đoán kiểm được trong `task-analyze`; tiền tố riêng cho log gỡ lỗi tạm và việc ghi nguyên nhân trong `task-implement`, `task-handoff`; test hồi quy tại điểm đặt đúng trong `task-finalize`. Phần dựng lệnh tái hiện lỗi của skill gốc không được lấy.
  - `domain-modeling` → `workflow/GLOSSARY-ADR.md` (định dạng glossary, ba điều kiện của ADR) và bước "Chốt thuật ngữ" trong `task-analyze`. Khác bản gốc: glossary và ADR nằm trong repo hồ sơ, không nằm trong repo source; không có glossary theo từng phân hệ.
  - `retro` → skill `task-retro`: đối tượng là môi trường của agent; lỗi máy móc ưu tiên check tự động hơn quy tắc viết; đọc check sẵn có của repo trước khi đề xuất check mới. Khác bản gốc: bốn loại đề xuất thay cho bảy, kết quả ghi vào `RETRO.md` trong hồ sơ ticket, và skill không tự sửa gì.
  - Quy ước của repo đó về `agents/openai.yaml` → file tên hiển thị cho Codex cạnh mỗi `SKILL.md`.

## Martin Fowler

Danh sách smell nền lấy từ *Refactoring* (chương 3).
