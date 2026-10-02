# Kế hoạch cập nhật bộ skill task-* theo blueprint 1.6

| | |
|---|---|
| Căn cứ | [TASK-SKILLS-BLUEPRINT.md](TASK-SKILLS-BLUEPRINT.md) bản 1.8, mục 13.4 (các việc 0, A–E) và R9, R17, R20, R21 |
| Trạng thái | **G0 đã làm** (2026-10-02). G1–G6 chưa bắt đầu; mỗi gói chỉ làm khi người dùng yêu cầu. |
| Người đọc | Người hoặc agent sẽ thực hiện việc cập nhật |

Kế hoạch này biến các quyết định đã chốt trong blueprint thành các gói việc làm được. Nó không thêm quyết định mới: chỗ nào kế hoạch và blueprint khác nhau thì blueprint đúng, và phải sửa kế hoạch.

## 1. Phạm vi

**Làm:**

| Gói | Việc | Blueprint |
|---|---|---|
| G0 | Cho agent gọi được các bước | 13.4-0, R21, D25 |
| G1 | Viết lại 6 skill theo nguyên tắc viết cho agent | 13.4-A |
| G2 | Loại ticket BUG | 13.4-B, D22 |
| G3 | Glossary và ADR trong repo hồ sơ | 13.4-C, D23 |
| G4 | Skill `task-retro` | 13.4-D, D24 |
| G5 | Bảng câu hỏi gửi người ngoài | 13.4-E |
| G6 | Ví dụ theo stack Spring Boot + Vue.js; chốt tài liệu | R9, R20 |

**Không làm:** những thứ ở blueprint mục 13.5 (không đưa vào) và 13.7 (hoãn: xác nhận của người test).

## 2. Ràng buộc chung

- **Luồng bước và trạng thái giữ như baseline (R20).** Không gói nào thêm stage, status hay cổng. Chỉ G3 sửa helper, và chỉ để thêm hai khóa cấu hình đường dẫn.
- **Kỹ thuật viết lại, không copy** (blueprint 13.6): tiếng Việt, ví dụ Spring Boot/Vue.js, ghi nguồn vào `.agents/CREDITS.md`.
- **Một bản skill duy nhất** trong `.agents/skills`; tên 6 skill hiện có không đổi.
- **Mỗi gói kết thúc bằng:** cập nhật trạng thái trong blueprint mục 13.2/13.3 và thêm một dòng vào lịch sử blueprint; kiểm link của các tài liệu đã sửa; chạy phần test nêu trong gói.
- **Commit trạng thái hiện tại trước khi bắt đầu G0** (đã chốt), rồi commit sau mỗi gói, để mỗi gói là một thay đổi tách bạch và hoàn tác được.
- Bộ test đầy đủ chạy khoảng 10 phút trên Windows; đặt timeout lệnh ≥ 15 phút hoặc chạy nền.

## 3. Thứ tự và phụ thuộc

```text
G0 ──> G1 ──> G2 ──> G3 ──> G4 ──> G5 ──> G6
        │      └──────┴──────┴──────┘
        └ viết lại cả 6 skill trước, để G2–G5 thêm nội dung theo đúng cấu trúc mới
```

- G0 trước G1: G1 viết lại frontmatter và lời văn chuyển bước, nên cần biết skill là loại agent gọi được.
- G1 trước G2–G5: các gói sau chỉ thêm đoạn vào skill đã viết lại; làm ngược lại thì phải viết hai lần.
- G2, G4, G5 độc lập với nhau; G3 là gói duy nhất đụng helper.
- G6 cuối cùng vì nó rà lại toàn bộ ví dụ và tài liệu.

## 4. Các gói việc

### G0. Cho agent gọi được các bước — ĐÃ LÀM

**Mục tiêu:** agent tự gọi được skill task-* như ở baseline; các điểm dừng chờ người không đổi.

| Sửa | Nội dung |
|---|---|
| `.agents/skills/task-*/SKILL.md` (6 file) | Gỡ dòng `disable-model-invocation: true`; giữ `argument-hint`. |
| `.agents/skills/task-*/agents/openai.yaml` (6 file) | Bỏ khối `policy`; giữ `interface`. |
| `.agents/TASK-SKILLS-GUIDE.md` | Sửa câu "Sáu skill này chỉ chạy khi người dùng gọi" thành mô tả đúng: agent gọi được; điểm dừng chờ người là chọn hướng, duyệt plan, push/MR. |
| `.agents/CREDITS.md` | Bỏ ý "phân loại skill chỉ người dùng gọi" ở dòng `writing-for-agents`. |

**Nghiệm thu:**

- Sáu `SKILL.md` không còn `disable-model-invocation`; sáu `openai.yaml` không còn `policy`.
- Test liên kết skill pass (`--test-name-pattern="links the kit skills"`).
- Kiểm tay, cả Claude Code và Codex, session mới: sáu skill xuất hiện trong danh sách skill agent gọi được; sau khi `status` trả `next: review`, yêu cầu "làm tiếp" khiến agent tự gọi `task-review`.
- Kiểm tay cổng: yêu cầu agent implement khi plan chưa duyệt → helper từ chối.

**Kết quả (2026-10-02):** hai tiêu chí đầu đạt. Trong Claude Code, sáu skill xuất hiện lại trong danh sách skill agent gọi được ngay sau khi gỡ cờ. Chưa kiểm: Codex; việc agent tự gọi `task-review` sau implement và việc helper từ chối implement khi plan chưa duyệt trong một ticket thật (cổng này đã có test tự động).

**Rủi ro:** agent tự chạy skill khi người dùng không định làm ticket. Giảm bằng description mô tả đúng điều kiện dùng (xử lý ở G1).

### G1. Viết lại 6 skill

**Mục tiêu:** skill ngắn hơn, mỗi bước có điều kiện hoàn thành kiểm được, mỗi ý một chỗ. Hành vi và thứ tự bước không đổi.

| Sửa | Nội dung |
|---|---|
| `.agents/workflow/CONTRACT.md` | Thêm ba mục dùng chung, lấy từ ba đoạn đang lặp ở cuối mỗi skill: cách ghi tài liệu (`change.summary/reason`, metadata do helper ghi); commit phần hồ sơ khi `docsRepo.uncommitted`; mẫu báo cáo cuối bước. |
| 6 `SKILL.md` | Viết lại theo khung ở dưới. Description của mỗi skill nêu điều kiện gọi (đúng một nhánh, không lặp từ đồng nghĩa). |
| `.agents/skills/task-*/references/*-contract.md` (6 file) | Xóa: nội dung gần giống nhau và đã có trong CONTRACT. Giữ `task-review/references/review-axes.md`. |
| Blueprint mục 6 | Cập nhật mô tả nội dung skill. |

Khung mỗi skill:

1. Một dòng mở đầu: ticket ID, lệnh `status`, đường dẫn CONTRACT.
2. Các bước đánh số. Mỗi bước là một hành động và kết thúc bằng **điều kiện hoàn thành** kiểm được. Ví dụ: "Xong khi `translatedSourceIds` trùng đúng `sourceIds` mà `status` trả về" thay cho "tóm tắt đủ nguồn".
3. Câu khẳng định thay câu cấm. Câu cấm chỉ giữ cho ranh giới cứng (push, secret, sửa tay hồ sơ, tự tạo approval) và luôn kèm việc phải làm thay.
4. Chuyển bước theo lời văn của baseline: implement xong thì chuyển review; review xong chuyển handoff theo yêu cầu người dùng; các bước khác báo bước tiếp theo.
5. Phần tham khảo chỉ một số nhánh mới cần (mẫu MR, hai trục review) nằm sau các bước hoặc trong `references/`.

**Cách làm an toàn:** viết lại từng skill một; với mỗi skill, lập bảng đối chiếu "ý trong bản cũ → vị trí trong bản mới" để không rơi ý nào (đặc biệt các quy tắc delivery trong `task-finalize`, `task-implement`, `task-review`).

**Nghiệm thu:**

- Bảng đối chiếu của 6 skill không còn ý nào "chưa có chỗ".
- Không còn đoạn nào lặp nguyên văn giữa hai skill.
- Link trong skill, CONTRACT, guide không hỏng; test liên kết skill pass.
- Kiểm tay: chạy một ticket thử từ sync tới `prepared` trên một runtime; agent không bỏ bước nào so với trước khi viết lại.

**Rủi ro:** làm mất một quy tắc khi rút gọn. Bảng đối chiếu là biện pháp chính; bản gốc để so nằm ở `baseline/workshop/.agents/skills/`.

### G2. Loại ticket BUG

**Mục tiêu:** tạo được ticket `BUG-…`; sync và analyze biết cách xử lý mô tả lỗi và stack trace. Không có cổng mới.

| Sửa | Nội dung |
|---|---|
| `.agents/workflow.config.json` | Thêm `"bug": "BUG"` vào `tickets.types`. |
| `task-sync/SKILL.md` | Nhánh ticket bug: bản tóm tắt nêu riêng triệu chứng, thông báo lỗi và stack trace, điều kiện xảy ra, bước tái hiện nếu người báo đã cung cấp; thiếu thì thành câu hỏi mở. |
| `task-analyze/SKILL.md` | Nhánh ticket bug: observation cho triệu chứng; lần từ stack trace vào code (`observed` so với `inferred`); giả thuyết kèm dự đoán kiểm được. |
| `task-implement/SKILL.md` | Log gỡ lỗi tạm mang tiền tố riêng, gỡ sạch trước commit; nguyên nhân ghi vào CHECKS và MR. |
| CONTRACT, guide, WORKFLOW_SETUP | Thêm `bug` vào bảng loại ticket và ví dụ. |
| `.agents/workflow/tests/foundation.test.mjs` | Một test đọc `workflow.config.json` đi kèm bộ kit và khẳng định nó hợp lệ, có `bug`. |

**Nghiệm thu:** test mới pass; `sync --type bug …` tạo ticket `BUG-YYMMDD-HHMM-<slug>`; một ticket BUG thử có TASK.md thể hiện triệu chứng, đường lần từ stack trace và giả thuyết.

### G3. Glossary và ADR trong repo hồ sơ

**Mục tiêu:** có một glossary và thư mục ADR dùng chung trong repo hồ sơ; analyze cập nhật, các bước khác đọc. Đây là gói duy nhất sửa helper.

| Sửa | Nội dung |
|---|---|
| `.agents/workflow/lib/config.mjs` | Hai khóa `docs.glossaryPath` (mặc định `docs/GLOSSARY.md`) và `docs.adrPath` (mặc định `docs/adr`), tính từ `docsRepo`; validate như `docs.ticketsPath`; nếu nằm trong repo source thì phải được ignore (cùng quy tắc với thư mục hồ sơ). Trả đường dẫn tuyệt đối trong settings. |
| `.agents/workflow/task.mjs` | `status`, `doctor`, `sync` trả `target.glossary` và `target.adr`. |
| `.agents/workflow/tests/foundation.test.mjs`, `cli.test.mjs` | Mặc định, giá trị tùy biến, đường dẫn không hợp lệ, quy tắc ignore; trường mới trong output. |
| `task-analyze/SKILL.md` | Chủ động: đối chiếu thuật ngữ trong yêu cầu với glossary, hỏi lại khi một từ mang hai nghĩa, cập nhật glossary ngay khi chốt; đề nghị ADR khi đủ ba điều kiện. |
| `task-finalize`, `task-implement`, `task-review`, `task-handoff` | Một dòng: đọc glossary để đặt tên trong plan, code, test, MR. |
| `.agents/workflow/` | File tham chiếu mới về định dạng glossary và ADR. |
| CONTRACT, guide, WORKFLOW_SETUP, README của workflow | Vị trí, quy tắc, bảng cấu hình. |

Glossary và ADR là Markdown thường do agent sửa trực tiếp; helper không băm, không tạo record. Chúng được commit cùng lúc với hồ sơ ticket.

**Nghiệm thu:** bộ test đầy đủ pass; sau một ticket thử, glossary có thuật ngữ mới và `git status` của repo source sạch.

**Rủi ro:** `docsRepo.uncommitted` hiện chỉ xét thư mục ticket, nên thay đổi glossary có thể bị quên commit. Xử lý trong gói này: mở rộng phạm vi kiểm sang hai đường dẫn mới.

### G4. Skill `task-retro`

**Mục tiêu:** sau một ticket, có đề xuất cải thiện môi trường của agent, ghi thành `RETRO.md`. Không đổi state.

| Sửa | Nội dung |
|---|---|
| `.agents/skills/task-retro/SKILL.md` + `agents/openai.yaml` | Skill mới. Đọc phiên vừa làm và CHECKS; phân loại: lỗi máy móc → check tự động hoặc Git hook; lỗi phán đoán → quy tắc trong chuẩn code; tìm thông tin chậm → một dòng chỉ đường trong AGENTS.md; chỉ dẫn không đổi hành vi → đề xuất xóa. Ghi `RETRO.md` trong thư mục ticket; chỉ đề xuất, không tự sửa hook hay chuẩn code. |
| `.agents/workflow/tests/stages-hooks.test.mjs`, `cli.test.mjs` | Danh sách skill được liên kết tăng từ 6 lên 7. |
| `CLAUDE.md`, guide, WORKFLOW_SETUP, CONTRACT (cây thư mục hồ sơ) | Thêm skill và file `RETRO.md`. |

`setup` tự liên kết skill mới vào `.claude/skills/` vì nó liên kết mọi thư mục có `SKILL.md`; mẫu ignore `.claude/skills/task-*` đã bao gồm tên mới.

**Nghiệm thu:** test liên kết pass với 7 skill; chạy `task-retro` trên một ticket thử tạo `RETRO.md`, và `status` của ticket trước và sau giống nhau.

### G5. Bảng câu hỏi gửi người ngoài

**Mục tiêu:** câu hỏi mở cần người không dùng agent trả lời được gửi đi dưới dạng một file dễ trả lời.

| Sửa | Nội dung |
|---|---|
| `task-sync/SKILL.md`, `task-analyze/SKILL.md` | Khi câu hỏi mở cần khách hàng hoặc bộ phận khác trả lời: soạn file câu hỏi (mục đích, bối cảnh một đoạn, câu quan trọng nhất trước, mỗi câu một ý kèm chỗ trả lời, kèm đáp án đề xuất). Trước khi soạn, hỏi người dùng hai điều: gửi cho ai, cần nhận lại gì. |
| CONTRACT | Vị trí file (trong `.workflow-tmp/` để người dùng tự gửi) và đường quay lại: câu trả lời được đưa vào bằng `sync <ticket> --file …`. |
| guide | Một đoạn trong mục sync/analyze. |

**Nghiệm thu:** trên một ticket thử có câu hỏi mở, agent tạo file câu hỏi; file trả lời sync vào tạo revision mới và intake phủ nguồn đó.

### G6. Ví dụ theo stack và chốt tài liệu

**Mục tiêu:** mọi ví dụ nói đúng stack của team; blueprint phản ánh trạng thái đã làm.

| Sửa | Nội dung |
|---|---|
| CONTRACT (ví dụ plan) | Một ví dụ là **lát dọc chạm cả hai phía** của cùng một repo, mọi lệnh chạy từ root: backend `["mvn","-q","-Dtest=NoteSearchServiceTest","test"]`; frontend `["npm","--prefix","frontend","run","test:unit","--","--run"]` (Vitest; tên script theo `frontend/package.json` của dự án) và `["npm","--prefix","frontend","run","build"]`. Mỗi check có `timeoutSeconds`. `files` liệt kê đường dẫn cả hai phía (`src/main/java/…`, `frontend/src/…`). |
| `task-review/references/review-axes.md` | Nguồn chuẩn code thêm phía frontend: cấu hình ESLint/Prettier, quy ước component Vue. |
| guide (mục lưu ý cho dự án), ADAPTATION-DESIGN, WORKFLOW_SETUP | "Java trên Windows" → Spring Boot (Maven, root) + Vue.js (`frontend/`, npm, Vitest). Thư mục phải nằm trong `.gitignore`: `target/`, `frontend/node_modules/`, `frontend/dist/`, thư mục coverage. Ghi chú: check không được làm đổi file được Git theo dõi, nên dùng `npm ci` thay cho `npm install` nếu check cần cài dependency (tránh sửa `package-lock.json`). |
| Blueprint | Mục 13.2/13.3: chuyển các dòng đã làm sang "Đã làm"; mục 6, 4.1, 4.10 khớp với code; thêm dòng lịch sử. |

**Nghiệm thu:** bộ test đầy đủ pass; không link hỏng trong mọi tài liệu; tìm trong repo không còn chỗ nào ghi stack chỉ là "Java" mà thiếu frontend.

**Cần kiểm khi làm:** runner đã chạy được file `.cmd` (đã thử với `mvn.cmd`); `npm` trên Windows cũng là `npm.cmd` nên đi cùng đường đó, nhưng chưa được thử thật. Thử `npm --prefix frontend run …` qua lệnh `check` trên một repo có thư mục `frontend/` trước khi đưa ví dụ vào tài liệu.

## 5. Nghiệm thu chung sau G6

1. `node --test ".agents/workflow/tests/*.test.mjs"`: không fail (hai test symlink có thể skip trên Windows).
2. Cài bộ kit vào một repo Spring Boot + Vue.js thật: `setup`, `doctor` không lỗi.
3. Một ticket `REQ` và một ticket `BUG` đi từ sync tới `handed-off` trên Claude Code; lặp lại ít nhất phần sync → review trên Codex.
4. Trong lần chạy đó: agent tự chuyển implement → review; dừng đúng ở duyệt plan và ở push.
5. Blueprint mục 8 (kết quả test tham chiếu) và mục 13 khớp với thực tế.

## 6. Đã chốt với người dùng

| Câu hỏi | Trả lời | Dùng ở |
|---|---|---|
| Frontend Vue.js nằm cùng repo với backend hay ở repo riêng? | **Cùng repo.** | G6; một ticket vẫn gắn với một repo source và một branch, nên không cần đổi luồng. |
| Bố cục và công cụ? | Project **Maven Spring Boot là project chính ở root**; frontend là thư mục **`frontend/`** dùng **npm** và **Vitest**. | G6: lệnh ví dụ, danh sách ignore; G1: ví dụ trong skill. |
| Có commit trạng thái hiện tại trước G0 không? | **Có**, commit trước khi bắt đầu G0. | Mục 2; điều kiện trước G0. |
