---
name: task-retro
description: "Nhìn lại một ticket đã review hoặc đã bàn giao, đề xuất cải thiện môi trường làm việc của agent (check tự động, chuẩn code, chỉ đường trong AGENTS.md) và ghi vào RETRO.md. Dùng khi người dùng yêu cầu nhìn lại hoặc retro một ticket."
argument-hint: "<ticket>"
---

# Task retro

Làm theo các phần "Bắt đầu", "Chia sẻ hồ sơ" và "Kết thúc" trong mục "Quy ước chung cho mọi bước" của [contract](../../workflow/CONTRACT.md) tại `.agents/workflow/CONTRACT.md`. Bước này nằm ngoài sáu stage: kết quả duy nhất là file `RETRO.md` trong thư mục ticket, viết trực tiếp; state, record và bước tiếp theo của ticket giữ nguyên.

Đối tượng của retro là **môi trường của agent**: check tự động, Git hook, chuẩn code, AGENTS.md, skill. Thay đổi yêu cầu và quyết định nghiệp vụ của ticket nằm ngoài retro.

1. **Ghi lại trạng thái trước khi làm.** Từ kết quả `status <ticket>`, giữ lại `next` và status của từng stage để đối chiếu ở bước 6. Retro dành cho ticket đã review hoặc đã bàn giao; ticket chưa tới đó thì nói rõ điều này với người dùng trước khi làm tiếp. Xong khi có `next` và status sáu stage.
2. **Thu thập sự việc từ nguồn gốc**: hội thoại của phiên vừa làm khi còn trong phiên đó; CHECKS.md (findings của review, check fail, checkpoint, blocker); changelog cuối PLAN.md (plan phải sửa mấy lần, vì sao); log của các check fail trong `.workflow/evidence/`. Mỗi sự việc ghi ba ý: chuyện gì đã xảy ra, cái giá (vòng sửa, lần chạy lại check, lần phải hỏi lại), căn cứ. Xong khi mỗi sự việc trỏ tới được một căn cứ: finding ID, check ID, version của tài liệu, hoặc một lượt trong hội thoại.
3. **Xếp mỗi sự việc vào đúng một loại đề xuất:**
   - **Lỗi máy móc** (mẫu cú pháp cố định, API bị cấm, dạng import, file đặt sai chỗ) → một **check tự động** hoặc Git hook. Đọc trước các check repo đang có: plugin trong `pom.xml` (Checkstyle, SpotBugs, formatter), script `lint` và test trong `frontend/package.json`, cấu hình CI, `.githooks/`. Check đã có mà chưa được nối vào luồng, hoặc đang hỏng, chính là phát hiện.
   - **Lỗi phán đoán** (nhất quán giữa các file, hợp với code xung quanh, điều không check nào thay được) → một **quy tắc trong chuẩn code** của repo, nơi trục Chuẩn code của Review đọc.
   - **Tìm thông tin chậm** (mất nhiều lượt mới ra file, lệnh hay quy ước cần dùng) → **một dòng chỉ đường** trong AGENTS.md, trỏ tới nơi chứa thông tin.
   - **Chỉ dẫn không làm đổi hành vi** (câu trong AGENTS.md, CLAUDE.md hay skill mà bỏ đi agent vẫn làm y như cũ) → **đề xuất xóa**.

   Lỗi máy móc ưu tiên check hơn quy tắc viết. Sự việc không thuộc loại nào thì để ngoài RETRO.md. Xong khi mỗi sự việc giữ lại có đúng một loại.
4. **Soạn đề xuất, xếp theo mức nghiêm trọng**: cái giá đã trả và khả năng lặp lại ở ticket sau. Mỗi đề xuất nêu thay đổi cụ thể tới mức làm được ngay: file nào, thêm hoặc xóa nội dung gì trong một hai dòng. Xong khi mỗi đề xuất có sự việc, căn cứ, loại và thay đổi cụ thể.
5. **Ghi `RETRO.md`** trong thư mục ticket (`<target.documents>/<ticket>/RETRO.md`) theo mẫu dưới đây. File đã có thì thêm một mục mới ở cuối, giữ nguyên các mục cũ. Trích đúng dòng cần từ log; secret và log thô ở lại nơi của chúng. Xong khi file có mục của lần retro này.
6. **Đối chiếu và chia sẻ.** Chạy lại `status <ticket>`: `next` và status sáu stage trùng với bước 1. Commit hồ sơ khi `docsRepo.uncommitted: true`. Xong khi trạng thái không đổi và RETRO.md đã được commit.
7. **Báo cáo** các đề xuất theo thứ tự đã xếp. Việc áp dụng từng đề xuất (sửa hook, thêm check, sửa chuẩn code, AGENTS.md hay skill) là một thay đổi riêng do người dùng quyết định và giao; skill này dừng ở đề xuất.

## Mẫu RETRO.md

```markdown
# Retro: <ticket>

## <YYYY-MM-DD> · revision <N> · <người chạy>

### Đề xuất

| # | Loại | Sự việc | Căn cứ | Thay đổi đề xuất |
|---|---|---|---|---|
| 1 | Check tự động | <chuyện gì đã xảy ra, cái giá> | <finding ID / check ID / lượt hội thoại> | <file, nội dung một hai dòng> |
| 2 | Chuẩn code | … | … | … |
| 3 | Chỉ đường | … | … | … |
| 4 | Xóa chỉ dẫn | … | … | … |
```

- Cột **Loại** dùng đúng bốn giá trị: `Check tự động`, `Chuẩn code`, `Chỉ đường`, `Xóa chỉ dẫn`.
- Không có đề xuất nào thì ghi đúng như vậy trong mục của lần retro; một retro rỗng vẫn là kết quả.
