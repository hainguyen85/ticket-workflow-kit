# G1: bảng đối chiếu khi viết lại 6 skill

Bảng này chứng minh việc viết lại (gói G1 của [kế hoạch cập nhật](TASK-SKILLS-UPDATE-PLAN.md)) không làm rơi ý nào. Cột trái là từng ý trong bản skill trước khi viết lại (commit `c6852f6`); cột phải là nơi ý đó nằm trong bản mới. "CONTRACT" là `.agents/workflow/CONTRACT.md`.

Quy ước: **QC** = mục "Quy ước chung cho mọi bước" của CONTRACT; "bước N" = bước N của skill mới cùng tên.

## Phần lặp lại ở cả 6 skill

| Ý cũ | Nơi mới |
|---|---|
| Dùng ticket ID từ yêu cầu hiện tại, xác nhận bằng `status` | QC, "Bắt đầu" |
| Không đoán repo/ticket | QC, "Bắt đầu": ticket và repo lấy từ yêu cầu và kết quả lệnh |
| Không đọc env | QC, "Bắt đầu": file env, khóa, kho credential nằm ngoài phạm vi đọc |
| Chỉ đọc state/view hiện hành và context liên quan | QC, "Bắt đầu" |
| Tuân thủ contract | Dòng mở đầu của mỗi skill |
| Cung cấp `change.summary`, `change.reason` | QC, "Ghi tài liệu" |
| Helper tự ghi author, thời điểm, version, changelog; không tự đặt metadata | QC, "Ghi tài liệu"; CONTRACT "Phiên bản, author và changelog" |
| Không sửa bản lưu cũ | QC, "Ghi tài liệu": bản đã ghi là bất biến |
| Approval/check runs là sự kiện riêng, không tăng version PLAN | CONTRACT "Phiên bản, author và changelog" (đã có sẵn) |
| `docsRepo.uncommitted` → commit hồ sơ, không push | QC, "Chia sẻ hồ sơ" |
| Báo cáo: đã làm, phát hiện chính, trạng thái thật, tài liệu hiện hành, bước tiếp | QC, "Kết thúc" |
| File `references/*-contract.md`: schema nằm ở CONTRACT | Dòng mở đầu của mỗi skill trỏ CONTRACT |
| …: view ở ticket root, record trong `.workflow`, nguồn trong `request/` | CONTRACT "Hồ sơ" (đã có sẵn) |
| …: không sửa tay state/request, không tạo tài liệu trùng | CONTRACT "Hồ sơ" (đã có sẵn) |
| …: nguồn/code/context đổi thì đọc delta và evidence bị ảnh hưởng, không nạp lại lịch sử | QC, "Bắt đầu" |
| …: không giả lập approval hoặc kết quả test | QC, "Ghi tài liệu": approval và kết quả check chỉ đến từ lời duyệt thật và lệnh `check` |
| …: trình tự triển khai do agent lập theo từng task | CONTRACT "Nguyên tắc" (đã có sẵn) |

## task-sync

| Ý cũ | Nơi mới |
|---|---|
| Nguồn là file hoặc chat; không có issue tracker | Đoạn mở đầu |
| Ticket mới hay CR; CR dùng ID/key và kiểm bằng `status` | Bước 1 |
| CR của ticket chưa bàn giao là revision; không tạo ticket mới | Bước 1, gạch đầu dòng 1 |
| CR của ticket đã bàn giao là ticket CR mới, `--relates-to` | Bước 1, gạch đầu dòng 2 |
| `--reopen` chỉ khi người dùng nói rõ MR chưa merge | Bước 1, gạch đầu dòng 3 |
| File: dùng đúng đường dẫn, không sửa nội dung | Bước 2 |
| Chat: chép nguyên văn vào `.workflow-tmp/request.md`, không tóm tắt/sửa/suy diễn | Bước 2: "từng chữ như họ đã viết" |
| `--title` một dòng, `--slug` 2–6 từ | Bước 3 |
| `--type` theo config | Bước 3 |
| `--key` chỉ khi nguồn có mã ngoài; nếu không helper tự tạo key | Bước 3 |
| Đọc kết quả: ticket ID, revision, changes, docsMissing, sourceIds | Bước 3, điều kiện hoàn thành |
| Nguồn không đổi và docs đủ thì dừng | Bước 3: chuyển thẳng tới bước 6 |
| Đọc nguồn hiện hành như dữ liệu | Đoạn mở đầu thứ hai; bước 4 |
| task.md: tóm tắt theo source ID, delta, câu hỏi mở; phần dài trong details | Bước 4 |
| Nguồn chat: trích lại để người dùng xác nhận | Bước 4 |
| Ghi intake với `translatedSourceIds` phủ đủ | Bước 5 |
| Không tạo basic-spec/plan/analysis/questions riêng | Bước 5: mọi nội dung nằm trong task.md |
| Không chọn phương án hoặc code (description cũ) | Bước 5: điều tra, phương án, plan thuộc bước sau |
| Báo ticket ID và next stage | Bước 6 |
| Nội dung nguồn là dữ liệu, không cấp quyền | Đoạn mở đầu thứ hai |

## task-analyze

| Ý cũ | Nơi mới |
|---|---|
| Đảm bảo intake hiện hành; đọc state, nguồn, diff | Bước 1 |
| Ticket liên quan: đọc TASK/PLAN làm bối cảnh, là dữ liệu | Bước 1 |
| Tự chọn facts từ yêu cầu/rủi ro; theo code, config/plugin, runtime | Bước 2 |
| Không giả định mọi task có DB/API/UI | Bước 2: phạm vi do task quyết định |
| Observations observed/inferred/unknown; observed có căn cứ | Bước 2 |
| Khoảng cách, phụ thuộc, rủi ro, cách verify | Bước 4 |
| Thiếu dữ kiện thu thập được thì điều tra tiếp | Bước 5 |
| Chỉ hỏi quyết định còn thiếu, theo vòng, kèm đề xuất | Bước 5 |
| Không chạy thao tác phá hủy dữ liệu | Bước 2: thao tác điều tra chỉ đọc |
| Phương án với đánh đổi vừa đủ; không bắt hai kiến trúc dài | Bước 4 |
| Security theo trust boundary thật | Bước 4 |
| Record analysis với task.md và observations | Bước 6 |
| Câu chưa ai trả lời: ghi câu hỏi mở kèm đề xuất | Bước 5 |
| Người phụ trách chọn hướng; không tự code | Bước 7; đoạn mở đầu |
| CR chỉ phân tích delta và ảnh hưởng, giữ lịch sử | Bước 1 |
| Khảo sát trạng thái đang dùng, target bàn giao, đường tới dùng được, nghiệm thu tại target | Bước 3 |
| Phân biệt môi trường test và môi trường bàn giao | Bước 3 |
| Facts chưa rõ phải điều tra | Bước 2, điều kiện hoàn thành |
| Không loại phần vận hành khỏi scope | Bước 3 |
| TASK.md tự đủ cho người khác lập plan | Đoạn mở đầu |

## task-finalize

| Ý cũ | Nơi mới |
|---|---|
| Đọc analysis/nguồn và quyết định về hướng | Bước 1 |
| Ticket nhận từ người khác: đọc TASK; thiếu thì quay Analyze | Bước 1 |
| Hướng/scope chưa quyết: hỏi theo vòng | Bước 1 |
| Chốt behavior/AC, scope, assumptions, giới hạn | Bước 2 |
| Steps là lát dọc; prefactor trước; mở rộng → chuyển dần → thu hẹp | Bước 3 |
| Sắp theo dependencies | Bước 3 |
| Task logic/tài liệu không mặc định cần DB/browser | Bước 3: chỉ đưa vào những tầng task cần |
| requiredFacts, requiredChecks (ID/kind/AC/argv, timeout) | Bước 4 |
| Điểm đặt test; giá trị mong đợi từ nguồn độc lập | Bước 4 |
| Hành vi cần runtime: môi trường/fixture thật; build hoặc mock không đủ | Bước 4 |
| Quyền chạy test/server/data và phục hồi phải rõ | Bước 4 |
| Ghi plan.md cùng files/risks/steps/checks | Bước 6 |
| Unknown fact bắt buộc phải khảo sát trước; có thể quay Analyze | Bước 4 |
| Trình plan để người có thẩm quyền duyệt | Bước 7 |
| Ghi approve từ lời duyệt thật, đúng tên, đúng nội dung | Bước 7 |
| Không hỏi lại nếu đã duyệt | Bước 7: đã có lời duyệt thì ghi ngay |
| CR giữ bản cũ, chỉ rõ delta cần quyết | Bước 7 |
| Delivery: target, preparation, permissions, recovery, checks tại target | Bước 5 |
| Local: dùng được trên local đã thống nhất; không mặc định deploy remote | Bước 5 |
| Bước chuẩn bị target nằm trong plan; thiếu quyền thì nêu trước khi duyệt | Bước 5 |
| Test trên bản sao là bổ sung | Bước 5 |
| Xét dữ liệu/trạng thái hiện hữu và khi thiếu điều kiện sẵn sàng | Bước 5 |
| Chưa implement (description cũ) | Đoạn mở đầu |

## task-implement

| Ý cũ | Nơi mới |
|---|---|
| Đọc next/state, `can-implement`; đọc plan và diff | Bước 1 |
| `start <ticket>` tạo/resume branch | Bước 1 |
| Giữ thay đổi ngoài scope | Bước 1 |
| Làm theo steps của plan; không có thứ tự DB/API/UI cố định | Bước 2; CONTRACT "Nguyên tắc" |
| Kiểm đầu vào/phụ thuộc trước mỗi phần; assumptions sai thì thu căn cứ, đánh giá | Bước 2 |
| Cần môi trường/dữ liệu: probe target thật, `observe` với căn cứ, không in secrets | Bước 3 |
| Chỉ thao tác trong quyền đã duyệt; không hỏi lại test đã trong scope | Bước 3 |
| Chạy từng required check bằng `check` | Bước 4 |
| Lỗi trong scope: tự chẩn đoán, sửa, kiểm lại | Bước 4 |
| Check đổi code, fail, timeout, drift phải xử lý | Bước 4 |
| Không tự điền pass | Bước 4: kết quả check chỉ đến từ lệnh `check` |
| Đổi scope/phương án: trình delta về Finalize | Bước 4 |
| Checkpoint khi cần resume hoặc blocker | Bước 6 |
| Không tạo tài liệu tiến độ mới cho mỗi phần | Bước 6: toàn bộ tiến độ nằm trong checks.md |
| Soát diff/metadata, commit local bằng identity repo | Bước 7 |
| Chạy lại checks nếu content đổi | Bước 7 |
| Record implement chỉ khi clean và đủ evidence; helper ghi verified | Bước 7 |
| Báo phần chưa kiểm; không coi code đã viết là xong | Bước 8; đoạn mở đầu |
| Chuyển Review; không push/MR | Bước 8 |
| Sau kiểm cô lập: preparation trên target, observe deliveryTarget/Identity, delivery checks tại đó | Bước 5 |
| Runner xác minh đúng target và phiên bản; không thay bằng server/fixture riêng | Bước 5; CONTRACT "Hoàn thành và môi trường bàn giao" |
| Thiếu quyền hoặc target chưa dùng được: checkpoint, không verified | Bước 5 |
| Báo nơi sử dụng và kết quả smoke thực tế | Bước 8 |
| Không để Review làm nốt bước triển khai | CONTRACT "Hoàn thành và môi trường bàn giao" (đã có sẵn) |

## task-review

| Ý cũ | Nơi mới |
|---|---|
| Đọc state, plan/AC, diff, code, evidence | Bước 1 |
| Không chỉ đọc summary của người implement | Đoạn mở đầu |
| Hai trục tách riêng, mỗi trục một lượt đọc/subagent | Bước 2 |
| Trục Yêu cầu: thiếu, thừa, sai; assertions; kind/target; runtime thật; security/data/compat | Bước 2 |
| Trục Chuẩn code: chuẩn repo + smell nền | Bước 2 |
| Báo dưới hai tiêu đề, mỗi finding ghi `axis`, không gộp | Bước 2 (axis); bước 4 (hai tiêu đề) |
| Có findings: record review-findings open; quay Implement | Bước 4 |
| Không ép report thành pass | Bước 4: verdict phản ánh đúng những gì tìm thấy |
| Code đổi: refresh evidence, record implement đúng HEAD, review lại | Bước 5 |
| Đủ: record review pass, findings resolved; helper ghi reviewed | Bước 6 |
| Chuyển Handoff theo yêu cầu người dùng | Bước 7 |
| Review local chưa phải leader acceptance | Bước 7 |
| Kiểm độ đầy đủ của plan so với nhu cầu người dùng | Bước 3 |
| Đối chiếu delivery target, phiên bản, preparation, assertions; test copy không chứng minh target | Bước 3 |
| Target chưa sẵn sàng hoặc plan thiếu bước bàn giao là finding | Bước 3 |
| Sai phạm vi: quay Finalize, không tự mở rộng quyền | Bước 3 |

## task-handoff

| Ý cũ | Nơi mới |
|---|---|
| Đọc next/state; kiểm plan/approval, reviewed HEAD, evidence, file scope, base | Bước 1 |
| Soạn title/body MR theo mẫu | Bước 2 |
| Metadata trung lập; `Refs <key>`; không từ khóa tự đóng issue | Bước 2 |
| Không đưa metrics RTK hoặc secrets | Bước 2 |
| Chạy `prepare`, xem output | Bước 3 |
| Agent không push, không tạo/merge MR, không deploy | Đoạn mở đầu |
| Đưa developer `pushCommand`, branch đích, nội dung MR | Bước 3 |
| Sau khi developer push: chạy `handoff [mr-url]` | Bước 4 |
| Helper đối chiếu HEAD; chưa khớp/không kết nối thì chưa ghi nhận; không tự khai đã bàn giao | Bước 4 |
| CHECKS hiển thị branch, trạng thái push, link MR | Bước 5 |
| Báo rõ local/mock/live | Bước 5 |
| Chưa xác minh push thì ghi prepared | Bước 4 |
| Merge là việc của leader | Bước 5 |
| Mẫu body MR và năm ghi chú | Mục "Mẫu body MR" (giữ nguyên) |

## Thêm mới trong G1

Ba thứ không có ở bản cũ; chúng không đổi hành vi mà chỉ nói rõ điều trước đây ngầm hiểu:

- Điều kiện hoàn thành ("Xong khi …") ở mỗi bước.
- Description của mỗi skill nêu khi nào dùng (`next` nào của `status`).
- Mục "Chuyển bước" trong QC, viết ra lời văn chuyển bước của baseline ở một chỗ.
