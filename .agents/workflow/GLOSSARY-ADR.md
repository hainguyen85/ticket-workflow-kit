# Glossary và ADR

Hai loại tài liệu dùng chung cho mọi ticket, nằm trong repo hồ sơ. Vị trí lấy từ kết quả `status`, `sync` hoặc `doctor`: `target.glossary` là file glossary, `target.adr` là thư mục ADR. Cả hai là Markdown thường: sửa trực tiếp, helper không băm và không tạo record. Tạo khi có nội dung đầu tiên để ghi; chưa có gì để ghi thì chưa cần file.

## Glossary

Glossary ghi **ngôn ngữ nghiệp vụ** của dự án: mỗi khái niệm một tên, để yêu cầu, plan, code, test và MR gọi cùng một thứ bằng cùng một từ.

```md
# Thuật ngữ: <tên dự án hoặc phân hệ>

<Một hai câu: phân hệ này làm gì.>

## Thuật ngữ

**Ghi chú**:
Một mẩu nội dung do một người dùng tạo và sở hữu.
_Tránh dùng_: note item, bản ghi

**Lưu trữ**:
Trạng thái của ghi chú đã bị ẩn khỏi danh sách mặc định nhưng còn khôi phục được.
_Tránh dùng_: xóa mềm, ẩn
_Liên quan_: khác **Xóa**, là thao tác không khôi phục được.

## Chỗ mơ hồ đã giải quyết

- "Tài khoản" từng được dùng cho cả **Người dùng** và **Tổ chức**. Từ REQ-7: "tài khoản" chỉ **Người dùng**.
```

Quy tắc:

- **Chọn một từ.** Khi nhiều từ chỉ cùng một khái niệm, chọn một và ghi các từ còn lại ở `_Tránh dùng_`.
- **Định nghĩa ngắn**, một hai câu, nói khái niệm đó **là gì**.
- **Chỉ thuật ngữ riêng của nghiệp vụ này.** Khái niệm lập trình chung (timeout, cache, DTO) nằm ngoài glossary, kể cả khi dự án dùng nhiều.
- **Nội dung là ngôn ngữ nghiệp vụ.** Chi tiết cài đặt, tên class, quyết định kỹ thuật và ghi chú công việc thuộc về TASK/PLAN hoặc ADR.
- **Quan hệ giữa các thuật ngữ** ghi ở `_Liên quan_` khi nó giúp phân biệt hai khái niệm dễ nhầm.
- **Ghi lại chỗ mơ hồ đã giải quyết** kèm ticket nơi nó được chốt, để người sau biết vì sao một từ bị tránh.
- Gom thuật ngữ dưới tiêu đề con khi chúng tự thành cụm; ít thuật ngữ thì một danh sách phẳng là đủ.

Cách dùng trong các bước:

- **Analyze** là nơi chủ động: đối chiếu từ ngữ trong yêu cầu với glossary; thấy một từ đang mang hai nghĩa, hoặc trái với định nghĩa đã có, thì hỏi lại người dùng bằng một câu cụ thể ("Glossary định nghĩa *lưu trữ* là còn khôi phục được; yêu cầu này nói lưu trữ sau 30 ngày thì mất. Ý nào đúng?"); đối chiếu lời mô tả với code khi hai bên nói khác nhau. Thuật ngữ vừa được chốt thì ghi vào glossary ngay lúc đó.
- **Các bước khác** đọc glossary và dùng đúng từ trong đó khi đặt tên trong plan, code, test và nội dung MR.

## ADR

Một ADR ghi lại **một quyết định và lý do của nó**. Mỗi quyết định một file `NNNN-<slug>.md` trong thư mục ADR; số thứ tự bốn chữ số, lấy số lớn nhất đang có cộng một.

```md
# <Tiêu đề ngắn của quyết định>

<Một tới ba câu: bối cảnh, đã quyết định gì, vì sao.>
```

Một đoạn văn là đủ. Chỉ thêm các mục dưới đây khi chúng có giá trị thật:

- **Trạng thái** (`đề xuất | đã chấp nhận | đã thay bằng ADR-NNNN`): khi quyết định được xét lại.
- **Phương án đã cân nhắc**: khi lý do loại một phương án đáng được nhớ.
- **Hệ quả**: khi có tác động về sau khó thấy.

Chỉ đề nghị viết ADR khi **cả ba** điều đúng:

1. **Khó đảo ngược**: đổi ý về sau tốn kém đáng kể.
2. **Gây ngạc nhiên nếu thiếu bối cảnh**: người đọc code sau này sẽ hỏi "sao lại làm thế này?".
3. **Là kết quả của một đánh đổi thật**: đã có phương án khác và có lý do cụ thể để chọn phương án này.

Thiếu một trong ba thì quyết định nằm trong TASK.md hoặc PLAN.md của ticket là đủ. Các quyết định thường đủ điều kiện:

- hình dạng kiến trúc (cách chia module, luồng dữ liệu giữa backend và frontend);
- lựa chọn công nghệ mang tính ràng buộc lâu dài (cơ sở dữ liệu, message broker, cơ chế xác thực);
- ranh giới sở hữu dữ liệu giữa các phân hệ;
- chỗ cố ý đi khác đường quen thuộc ("dùng SQL viết tay thay cho ORM ở báo cáo này vì …");
- ràng buộc không nhìn thấy trong code (yêu cầu tuân thủ, cam kết về thời gian phản hồi);
- phương án bị loại vì lý do không hiển nhiên.

TASK.md hoặc PLAN.md của ticket **trỏ tới** ADR bằng tên file, không chép lại nội dung. ADR do người có thẩm quyền quyết định đồng ý trước khi ghi; agent đề nghị và soạn.

## Chia sẻ

Glossary và ADR được commit trong repo hồ sơ cùng lúc với hồ sơ của ticket đã làm thay đổi chúng. `docsRepo.uncommitted` trong kết quả `status` tính cả hai đường dẫn này.
