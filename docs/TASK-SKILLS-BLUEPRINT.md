# Blueprint: chuyển bộ skill task-* sang context của team

| | |
|---|---|
| Phiên bản blueprint | 1.8 (2026-10-02) |
| Trạng thái | Đã thực hiện; code trong repo này là bản tham chiếu |
| Người đọc | Agent AI hoặc kỹ sư phải thực hiện lại việc chuyển đổi, hoặc cải tiến bộ kit về sau |

Tài liệu này là **đặc tả đầy đủ** để đưa bộ skill task-* từ bản workshop gốc sang bản dùng cho team. Nó được viết để người thực hiện không cần đọc lại lịch sử trao đổi: yêu cầu, điểm xuất phát, trạng thái đích, thứ tự làm, cách nghiệm thu và những cái bẫy đã gặp đều nằm ở đây.

Cách dùng:

- **Làm lại từ đầu** (ví dụ khi bản gốc có phiên bản mới): đọc lần lượt mục 1 → 9, làm theo mục 7, nghiệm thu theo mục 8.
- **Cải tiến về sau**: đọc mục 10 trước. Mọi thay đổi bắt đầu bằng việc sửa blueprint này (yêu cầu ở mục 1, đặc tả ở mục 4–6), sau đó mới sửa code, test và tài liệu. Việc kết hợp với bộ skill kỹ thuật bên ngoài (đã làm gì, còn gì, không làm gì) nằm ở mục 13.

Quy ước: **PHẢI** là bắt buộc; **NÊN** là mặc định, có thể đổi nếu ghi lý do vào mục 11. Các mã `R…`, `I…`, `D…` dùng để tham chiếu chéo.

Tài liệu liên quan: hợp đồng runtime [.agents/workflow/CONTRACT.md](../.agents/workflow/CONTRACT.md) · hướng dẫn cho team [.agents/TASK-SKILLS-GUIDE.md](../.agents/TASK-SKILLS-GUIDE.md) · tóm tắt lý do [ADAPTATION-DESIGN.md](ADAPTATION-DESIGN.md) · setup [WORKFLOW_SETUP.md](../WORKFLOW_SETUP.md).

---

## 1. Yêu cầu

### 1.1 Context của team

| Mã | Thực tế | Nguồn |
|---|---|---|
| R1 | Yêu cầu đến từ **file** hoặc **mô tả gõ trực tiếp trong chat**. Không có GitHub Issue, không có issue-id số, không có token. | Người dùng |
| R2 | MR/PR do **developer tạo thủ công**. Helper không gọi API của dịch vụ hosting nào. | Người dùng |
| R3 | Ticket ID = `<key>-<slug>`. Key: mã hệ thống ngoài nếu nguồn có, nếu không là key tự sinh chứa thời điểm tạo `YYMMDD-HHMM` (xem R15). Slug: agent đặt, 2–6 từ ASCII (vd. `note-search`). | Người dùng |
| R4 | Nguồn yêu cầu được lưu vào hồ sơ: file được đưa vào thư mục `request`, chat được snapshot. | Người dùng + D2 |
| R5 | Policy cấm OneDrive/Google Drive. Hồ sơ chia sẻ qua **Git**, trong một repo hồ sơ tách khỏi repo source, dưới `docs/tickets/`. | Người dùng |
| R6 | Thư mục hồ sơ **được phép** nằm trong repo source nếu được repo source Git ignore. Không được cấm vị trí này. | Người dùng |
| R7 | **Leader** sync/analyze và tạo ticket; **developer** nhận ticket rồi lập plan trở đi. Không có chuyện nhiều developer cùng tạo ticket. | Người dùng |
| R8 | Feature branch tạo **lúc bắt đầu implement**, không phải lúc sync. | Người dùng |
| R9 | Stack **Java Spring Boot** cho backend và **Vue.js** cho frontend, làm việc trên Windows, **cùng một repo**: project Maven của Spring Boot là project chính ở root; frontend nằm trong thư mục `frontend/`, dùng npm và Vitest. Root repo không có `package.json`; `frontend/package.json` chỉ phục vụ frontend. Helper gọi bằng `node`, không qua script npm/pnpm. Máy dev có Node ≥ 22.12. | Người dùng |
| R10 | Giữ quy tắc metadata trung lập: commit/MR không có tên công cụ AI, không `Co-authored-by`. | Người dùng |
| R11 | Dữ liệu trong hồ sơ (nguồn yêu cầu, log check) được **commit hết**. | Người dùng |
| R12 | Người duyệt plan là **người duyệt thật**: developer hoặc leader. | Người dùng |
| R13 | Runtime: **Codex và Claude Code**. Hook, skill và quy tắc agent phải chạy trên cả hai. | Người dùng |
| R14 | Tài liệu training nằm trong `.agents/` để đi cùng bộ kit. | Người dùng |
| R15 | Key tự sinh mang **prefix theo loại ticket** để nhìn ID là phân biệt được: `REQ` cho yêu cầu mới, `CR` cho thay đổi yêu cầu, và mở rộng được; ticket từ GitLab/Redmine về sau dùng mã của tracker. Danh sách loại khai trong config của dự án. | Người dùng |
| R16 | Thay đổi yêu cầu đi theo trạng thái ticket: chưa bàn giao thì là revision của ticket đó; đã bàn giao thì là ticket mới loại CR, có branch/MR riêng và liên kết về ticket gốc. | Người dùng |
| R17 | Học kỹ thuật từ bộ `mattpocock/skills` và kết hợp theo kiểu phân lớp: task-* vẫn là khung và nơi ghi nhận duy nhất. Làm nhóm việc nhỏ (chỉ sửa nội dung skill) trước; phần còn lại theo phương án ở mục 13. | Người dùng |
| R18 | Ghi nhận, **chưa kiểm chứng**: ở một số dự án của team, agent khó tự tái hiện lỗi và con người phải test tay; bug thường được phân tích từ mô tả lỗi, stack trace và source code. Theo R20, nhận xét này chưa dẫn tới thay đổi thiết kế nào. | Người dùng |
| R19 | Glossary và ADR lưu trong repo hồ sơ. Kết quả nhìn lại sau ticket (retro) chỉ là tài liệu. | Người dùng |
| R20 | **Bám sát baseline ở việc tự động các bước trong workflow và ở các trạng thái.** Luồng stage, status, cổng và cách agent đi qua các bước giữ như bản gốc; tạm coi dự án của team kiểm chứng tự động được như dự án workshop. Khác biệt đã xác nhận so với baseline: R1–R16 và **tech stack** (Java Spring Boot + Vue.js thay cho Next.js/Payload). Chỗ nào tắc khi dùng thật thì gỡ chỗ đó; không thêm stage, status hay cổng cho giả định chưa kiểm chứng. R20 **không** hạn chế việc tích hợp kỹ thuật vào từng bước (R17). | Người dùng |
| R21 | Agent **gọi được các bước** task-*, như baseline; skill không bị khóa ở chế độ chỉ người dùng gọi. | Người dùng |

### 1.2 Bất biến phải giữ từ bản gốc

Đây là giá trị cốt lõi của bộ kit. Mọi thay đổi PHẢI giữ nguyên các điểm này.

| Mã | Bất biến |
|---|---|
| I1 | Sáu stage theo thứ tự: intake → analysis → finalize → implement → review → (bàn giao). Dispatcher trả đúng **một** bước tiếp theo kèm lý do. |
| I2 | Không có evidence thì không qua cổng: `verified`/`reviewed`/bàn giao chỉ đạt khi mọi required check đã chạy thật qua helper và còn khớp plan, code, context. |
| I3 | Record bất biến có hash; ba view (TASK/PLAN/CHECKS) dựng lại từ record; sửa tay bị phát hiện và chặn. |
| I4 | Approval gắn với hash của plan và revision yêu cầu. Sửa plan hoặc yêu cầu đổi thì mất approval. |
| I5 | Ghi lại một stage làm các stage phía sau thành `needs-revalidation`. Yêu cầu đổi làm mọi stage phải kiểm lại. |
| I6 | Plan bắt buộc có `delivery` (target, preparation, permissions, recovery, checks tại target). |
| I7 | Nguồn yêu cầu là dữ liệu không tin cậy, không cấp quyền, không được coi là approval. |
| I8 | Fail closed: state/snapshot/record hỏng hoặc sai hash thì dừng, không tự reset; không ghi đè thứ chưa được state ghi nhận. |
| I9 | Một lock theo ticket; từ chối symlink trong thư mục hồ sơ; ghi `state.json` bằng rename nguyên tử. |
| I10 | Agent không push, không tạo/merge MR, không tắt hook, không đọc credential, không đưa secret vào hồ sơ. |
| I11 | Helper chỉ dùng module có sẵn của Node; thông báo lỗi không lộ đường dẫn, output thô hay secret. |

---

## 2. Điểm xuất phát (bản workshop gốc)

Nguồn: repo `payload-workshop`, commit `03ad2de` ("chore: establish workshop baseline"). Bản chụp nguyên trạng của commit đó được lưu trong repo này tại [baseline/workshop/](../baseline/workshop/) (xem [baseline/README.md](../baseline/README.md)), nên người thực hiện không cần truy cập repo gốc. Chỉ các phần liên quan đến skill task-*:

```text
.agents/skills/task-{sync,analyze,finalize,implement,review,release}/SKILL.md
.agents/skills/task-*/references/*-contract.md
.agents/.env.workflow.example          # GH_TOKEN, WORKSHOP_DOCS_ROOT, GH_REPO, GH_PROJECT_URL, GH_BASE_BRANCH, GH_ISSUE
scripts/workflow.mjs                   # setup | target | check | sync | status
scripts/task.mjs                       # record | next | check | can-implement | start | prepare | publish | board
scripts/workflow/*.mjs                 # agent-hook, config, credential, dispatch, document-history, git-hook, git,
                                       # github, policy, release, setup-hooks, stages, target, transport, vault,
                                       # verification, views (+ eslint.config.mjs, README.md)
tests/workflow/*.test.mjs              # foundation, stages-hooks, targets, verification (+ start-local của app)
docs/workflow/CONTRACT.md, RTK.md
.codex/hooks.json, .githooks/{pre-commit,commit-msg,pre-push}
WORKFLOW_SETUP.md, AGENTS.md, workshop.config.json, package.json (scripts workshop:*)
```

Những chỗ bản gốc gắn với thứ team không dùng:

| Gắn với | Biểu hiện trong bản gốc |
|---|---|
| GitHub Issue/Project/PR | `github.mjs` đọc Issue, comment, Project; mọi lệnh `task.mjs` sync lại từ API trước khi chạy; `release.mjs` push bằng PAT, tạo PR, gắn Project; lệnh `board`. |
| PAT | `.agents/.env.workflow.local`, `credential.mjs`, `transport.mjs`, redaction theo token. |
| GitHub login | Thư mục hồ sơ `<root>/<org>/<repo>/<login>/<issue>/`; author = login; branch `feature/<login>/issue-<id>-<slug>`. |
| OneDrive | `WORKSHOP_DOCS_ROOT` trỏ tới thư mục đồng bộ. |
| pnpm | Skill và thông báo gọi `pnpm workshop:*`; `package.json`; ESLint là dev dependency. |
| Windows/Java chưa tính tới | Check chạy bằng `spawnSync` không shell (không chạy được `.cmd`), timeout cứng 120 giây, fingerprint băm byte thô của file (đổi khi Git đổi line ending). |
| Một runtime | Chỉ có `.codex/hooks.json`; hook xét toàn bộ tool input kể cả nội dung file. |
| Tiếng Việt | Bộ lọc metadata chặn mọi từ `ai` đứng riêng, kể cả từ "ai" tiếng Việt. |

---

## 3. Tổng quan trạng thái đích

```text
<repo source>/
├── .agents/
│   ├── skills/task-{sync,analyze,finalize,implement,review,handoff}/   # bản skill duy nhất
│   ├── workflow/
│   │   ├── task.mjs                 # CLI duy nhất
│   │   ├── lib/*.mjs                # 16 module (mục 5)
│   │   ├── tests/*.test.mjs         # 4 file test + helpers.mjs
│   │   ├── CONTRACT.md  README.md  RTK.md
│   ├── TASK-SKILLS-GUIDE.md         # tài liệu training
│   ├── workflow.config.json         # commit, dùng chung
│   ├── workflow.local.example.json  # commit
│   └── workflow.local.json          # theo máy, Git ignore
├── .codex/hooks.json                # runtime hooks Codex
├── .claude/settings.json            # runtime hooks Claude Code (commit)
├── .claude/skills/task-*            # liên kết theo máy tới .agents/skills, Git ignore
├── .githooks/{pre-commit,commit-msg,pre-push}
├── AGENTS.md                        # quy tắc agent (một nguồn)
├── CLAUDE.md                        # có dòng @AGENTS.md
└── WORKFLOW_SETUP.md

<docsRepo>/docs/tickets/<key>-<slug>/        # repo hồ sơ (mục 4.3)
```

Không còn: `package.json`, `scripts/`, `tests/` ở root, `workshop.config.json`, file env của workflow, mọi module GitHub.

---

## 4. Đặc tả hành vi

### 4.1 Cấu hình

`.agents/workflow.config.json` (commit):

| Khóa | Mặc định | Ràng buộc |
|---|---|---|
| `schemaVersion` | – | PHẢI bằng `3` |
| `git.remote` | `origin` | `^[A-Za-z0-9][A-Za-z0-9_.-]*$` |
| `git.baseBranch` | `main` | Tên branch hợp lệ, không bắt đầu bằng `feature/` |
| `git.protectedBranches` | `[]` | Base branch luôn được thêm vào |
| `docs.ticketsPath` | `docs/tickets` | Các đoạn nối bằng `/`, mỗi đoạn `^[A-Za-z0-9][A-Za-z0-9_.-]*$` |
| `checks.timeoutSeconds` | `600` | Số nguyên 1…7200 |
| `tickets.types` | `{req: REQ, cr: CR}` | Object không rỗng `{loại: PREFIX}`. Tên loại `^[a-z][a-z0-9-]{0,19}$`; prefix `^[A-Z][A-Z0-9]{1,9}$`, không trùng nhau |
| `tickets.defaultType` | Loại đầu tiên trong `types` | Phải có trong `types` |
| `tickets.changeRequestType` | `cr` nếu có trong `types`, không thì `null` | `null` hoặc một loại có trong `types` |

`.agents/workflow.local.json` (theo máy, Git ignore): chỉ một khóa `docsRepo` là đường dẫn tuyệt đối tới thư mục có thật. Khóa lạ, file là symlink, JSON hỏng đều bị từ chối.

`docsRoot = realpath(docsRepo) + ticketsPath`. Nếu `docsRoot` nằm trong repo source (R6) thì nó PHẢI được repo source ignore; kiểm bằng `git check-ignore -q` trên một đường dẫn con (`<docsRoot>/.probe`), vì pattern thư mục không khớp với đường dẫn chưa tồn tại. Chưa ignore thì dừng với thông báo yêu cầu thêm vào `.gitignore`.

Định danh người chạy = `git config user.name` + `user.email` của repo source, dạng `Tên <email>`. Thiếu thì dừng.

### 4.2 Ticket ID

- `type`: `--type`, mặc định `tickets.defaultType`; phải có trong `tickets.types`. Luôn được ghi vào state, kể cả khi dùng key ngoài.
- `key`: `--key` nếu có (`^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$`, ≤ 40 ký tự), dùng nguyên vẹn; nếu không, `<PREFIX>-YYMMDD-HHMM` với `PREFIX = tickets.types[type]` và thời điểm theo giờ local. Key tự sinh mà đã có ticket bắt đầu bằng `<key>-` thì cộng 1 phút cho tới khi trống. Key ngoài đã tồn tại thì từ chối (đó là CR, không phải ticket mới).
- `relatesTo`: `--relates-to <ref>`, phân giải như mọi tham chiếu ticket và ticket đó phải tồn tại; lưu ID đầy đủ. Không truyền thì `null`.
- `slug`: `^[a-z0-9]+(?:-[a-z0-9]+){1,5}$`, ≤ 60 ký tự.
- `title`: bắt buộc khi tạo, một dòng, ≤ 120 ký tự, không chứa mẫu secret. Không đổi được sau khi tạo.
- Ticket ID đầy đủ ≤ 110 ký tự. Mọi lệnh nhận ID đầy đủ, hoặc một tiền tố `<ref>` sao cho đúng một ticket bắt đầu bằng `<ref>-`. Khớp nhiều hoặc không khớp thì dừng.
- Branch source: đúng bằng `feature/<key>-<slug>`.

### 4.3 Hồ sơ và state

```text
<docsRoot>/<key>-<slug>/
├── TASK.md  PLAN.md  CHECKS.md          # view dựng từ record
├── request/r<N>/<tên file> | chat.md    # nguồn theo revision
└── .workflow/
    ├── state.json                       # commit point
    ├── sync/<sha256>.json               # manifest nguồn; sync/source.md là file dẫn xuất
    ├── changelog.md                     # dẫn xuất
    ├── {intake,analysis,finalize,implement,review,handoff}/<uuid>/record.json (+ *.md)
    ├── finalize/<uuid>/approval.json + approval.md
    ├── evidence/<uuid>.json + <uuid>.log
    ├── observations/<uuid>.json
    └── .workflow-lock/                  # thư mục rỗng khi đang ghi
```

`state.json` (schema 3; schema khác bị từ chối, không đọc âm thầm):

```text
schemaVersion: 3, ticket, key, slug, title, type, relatesTo
revision, sourceHash, snapshot: "sync/<sourceHash>.json"
history[]: { revision, at, snapshot, changes[], author }
stages.<stage>: { status, sourceRevision, artifact, hash, code?, reason? }
approval?: { sourceRevision, finalizeHash, approvedBy, evidence, at, recordedBy }
documentHistory.{TASK,PLAN,CHECKS}[]: { artifact, hash, version, signature }
workflowEvents[]: { action, revision, at, author, artifact }
checkRuns.<checkId>: { evidence, hash }
verificationContext?, contextEvidence?
```

Manifest nguồn: `{ ticket, key, slug, title, items[] }`, mỗi item `{ id: "r<N>/<tên>", revision, kind: "file"|"chat", name, bytes, sha256 }`. `sourceHash` là SHA-256 của `JSON.stringify(manifest)`.

Mỗi lần đọc state PHẢI kiểm: schema, ticket khớp, `history.length === revision`, mọi manifest trong lịch sử đúng hash, và **mọi file trong `request/` đúng SHA-256** của manifest hiện hành (I8).

### 4.4 Sync (stage intake)

Lệnh: `sync --title … --slug … [--type …] [--key …] [--relates-to …] [--file p]… [--chat p]` (ticket mới) và `sync <ticket> [--file p]… [--chat p] [--reopen]` (revision; không nhận title/slug/key/type/relates-to).

Quy tắc CR (R16). Gọi một ticket là **đã bàn giao** khi stage `handoff` có status `complete` ở revision hiện hành.

- Tạo ticket có `type === tickets.changeRequestType` kèm `--relates-to` tới một ticket **chưa** bàn giao → từ chối, hướng dẫn `sync <ticket>`.
- `sync <ticket>` có nguồn mới trên ticket **đã** bàn giao → từ chối, hướng dẫn tạo ticket loại CR với `--relates-to`. Với `--reopen` thì cho phép (MR chưa merge, làm tiếp trên cùng branch). Sync không có nguồn mới luôn được phép.
- `--relates-to` với loại khác không bị ràng buộc theo trạng thái. `--reopen` khi tạo ticket mới bị từ chối.

Nguồn:

| Loại | Quy tắc |
|---|---|
| File | Copy **nguyên byte**, giữ tên gốc. Tên ≤ 150 ký tự, không chứa `\ / : * ? " < > |` hay ký tự điều khiển, không bắt đầu bằng `.`, không kết thúc bằng dấu cách/chấm, không trùng tên dành riêng `chat.md`. File thường (không symlink/thư mục), không rỗng, < 20 MB. Tối đa 20 file/lần, không trùng tên (không phân biệt hoa thường). Đường dẫn khớp `.env`, `credential`, `.ssh` bị từ chối. |
| Chat | Agent chép nguyên văn vào file tạm; helper lưu thành `chat.md`, bỏ BOM, không rỗng, < 1 MB. Một chat mỗi lần sync. |
| Quét secret | Nguồn giải mã được UTF-8 và ≤ 2 MB thì quét mẫu secret; có thì từ chối. Nguồn nhị phân không quét. |

Thuật toán ghi (dưới lock của ticket):

1. Đọc state và manifest hiện hành. Tính **nguồn hiện hành**: với file, bản mới nhất theo tên (không phân biệt hoa thường); với chat, tất cả.
2. Loại nguồn đã có: cùng loại, cùng SHA-256, và (với file) cùng tên. Không còn gì mới thì dựng lại file dẫn xuất và trả `changed: false`. Ticket mới không có nguồn thì từ chối.
3. `revision = cũ + 1`. Nếu `request/r<revision>` đã tồn tại thì dừng (lần chạy trước bị ngắt; yêu cầu dọn thủ công).
4. Ghi nguồn mới vào `request/.incoming-<uuid>` rồi rename thành `request/r<revision>`.
5. Ghi manifest mới (cộng dồn mọi item), rồi `state.json` (rename nguyên tử), rồi các file dẫn xuất.
6. `changes`: `initial-sync`, hoặc từng `item-added:<id>` / `item-replaced:<id>` (file trùng tên với một file hiện hành).
7. Với ticket đã có: mọi stage → `needs-revalidation`, `reason: source-revision-<N>`.

Kiểm "đã bàn giao" ở bước 2, sau khi biết có nguồn mới và trước khi ghi bất cứ gì. Kết quả sync trả thêm `type` và `relatesTo`. Ba view ghi `Loại: <type>` và, nếu có, link `Liên quan` tới `../<ticket>/TASK.md` ở dòng đầu.

Ghi intake: `translatedSourceIds` PHẢI bằng đúng tập ID nguồn hiện hành. `sync`/`status` trả `docsMissing` và `sourceIds` để skill biết phải phủ những gì.

### 4.5 Các stage và cổng

Giữ nguyên logic bản gốc, đổi định danh và tên stage cuối:

| Hành động `record` | Stage | Status sau khi ghi | Cổng chính |
|---|---|---|---|
| `intake` | intake | `complete` | `translatedSourceIds` phủ đủ |
| `analysis` | analysis | `complete` | intake hợp lệ; observations có id duy nhất, status `observed|inferred|unknown`, observed có evidence |
| `finalize` | finalize | `complete` | analysis hợp lệ; plan hợp lệ (mục 4.6); risk high/critical phải `mitigated` kèm mitigation |
| `approve` | – | ghi `approval` | finalize hợp lệ; `decision: "approved"`, `approvedBy`, `evidence` |
| `observe` | – | ghi context | context là object, có evidence; context đổi → implement/review/handoff `needs-revalidation`, giữ approval |
| `checkpoint` | implement | `in-progress` / `blocked` | approval; đúng branch; cho phép worktree bẩn |
| `implement` | implement | `verified` | approval; worktree sạch; đúng branch; mọi required check còn hiệu lực |
| `review-findings` | review | `changes-requested` | approval; worktree sạch; có findings |
| `review` | review | `reviewed` | implement đúng HEAD; `verdict: "pass"`; mọi finding `resolved`; check còn hiệu lực |

Chung cho mọi hành động: `input.revision` bằng revision hiện hành; stage có tài liệu PHẢI kèm `change: {summary, reason}`; input chứa mẫu secret bị từ chối; ghi intake/analysis/finalize xóa approval; author lấy từ định danh người chạy, không lấy từ input (R12: `approvedBy` là tên người duyệt thật, `recordedBy` là người chạy lệnh).

Dispatcher (`status`/`next`) trả một trong: `sync`, `analysis`, `finalize`, `approve`, `implement`, `review`, `handoff`, `handed-off`.

### 4.6 Plan, check và evidence

Plan (input của `finalize`): `decision{optionId,rationale}`, `files[]` (đường dẫn tương đối, không `..`, không `\`), `risks[]`, `requiredFacts[]` (đều đã `observed` trong analysis), `requiredChecks[]`, `steps[]`, `delivery{}`.

- `requiredChecks[]`: `id` (`^[A-Za-z0-9_-]+$`, duy nhất), `kind`, `ac[]`, `command[]` (argv, mọi phần tử không rỗng), tùy chọn `target`, tùy chọn `timeoutSeconds` (nguyên, 1…7200).
- `steps[]`: `id` duy nhất, `goal`, `dependsOn[]` chỉ trỏ tới step đứng trước, `checks[]` không rỗng. Mọi check thuộc ít nhất một step.
- `delivery`: `kind` ∈ {`runtime`,`artifact`}; `target`, `preparation`, `permissions`, `recovery` không rỗng; `checks[]` không rỗng, mỗi check có `target` trùng `delivery.target`. Với `runtime`, trước khi chạy delivery check PHẢI có `observe` với `deliveryTarget` trùng target và `deliveryIdentity` không rỗng.

Chạy check (`check <ticket> <check-id>`), dưới lock:

1. Yêu cầu approval; check phải thuộc plan đã duyệt; lệnh đi qua chính policy của runtime hook.
2. Fingerprint trước → chạy → fingerprint sau. `pass` khi exit 0, không lỗi thực thi, không timeout, và fingerprint không đổi.
3. Môi trường thêm `WORKFLOW_CHECK_TARGET` và (với delivery check) `WORKFLOW_DELIVERY_IDENTITY`.
4. Ghi `evidence/<uuid>.log` (đã redaction) và `evidence/<uuid>.json`: `id, kind, target, command, result, exitCode, signal, startedAt, finishedAt, requirement, planHash, codeFingerprint, contextHash, changedDuringRun, executionError, timedOut, timeoutSeconds, log, logHash`.
5. Cập nhật `checkRuns`; implement/review/handoff đã bắt đầu → `needs-revalidation`. CLI trả exit 1 khi check không pass.

Evidence còn hiệu lực khi: đúng id/kind/target/command của plan, `result: pass`, exit 0, không đổi source khi chạy, `planHash`, `codeFingerprint` và `contextHash` khớp hiện tại, record và log đúng hash.

**Fingerprint code** (D6): danh sách file từ `git ls-files --cached --others --exclude-standard`; với file thường, lấy ID blob bằng `git hash-object --stdin-paths` (tức nội dung Git sẽ commit, đã chuẩn hóa line ending); symlink băm đích; thư mục (gitlink) lấy `ls-files --stage`. File bị ignore không tham gia.

**Runner** (D5):

- `node` → dùng chính `process.execPath`. Không bao giờ chạy qua shell.
- Windows: tìm file thực thi trong thư mục repo rồi `PATH`, theo `PATHEXT`. Nếu ra `.cmd`/`.bat` thì gọi `cmd.exe /d /s /c "<dòng lệnh>"` với **từng** tham số trong dấu nháy kép và `windowsVerbatimArguments`. Tham số chứa `" % ! ^ & | < >`, xuống dòng, hoặc kết thúc bằng `\` thì từ chối.
- Chạy bất đồng bộ, gom stdout+stderr (tối đa 64 MB). Hết timeout thì kill cả cây process (`taskkill /T /F` trên Windows, kill process group trên POSIX) và tính fail.
- Mọi check chạy với thư mục làm việc là **root repo**. Lệnh của frontend trỏ vào thư mục con bằng tham số của chính công cụ, ví dụ `["npm","--prefix","frontend","run","test:unit","--","--run"]`. Check không có trường `cwd` riêng.
- Timeout: `check.timeoutSeconds` → `checks.timeoutSeconds` → 600.

### 4.7 Handoff (thay cho release)

`start <ticket>`: yêu cầu approval và worktree sạch. Đang ở base branch thì: branch đã có → `switch`; chưa có → fetch base (không được chờ prompt credential), tạo `feature/<ticket>` từ `refs/remotes/<remote>/<base>`. Fetch lỗi nhưng ref có sẵn thì vẫn tạo và ghi chú; không có ref thì dừng. Đang ở branch khác thì dừng.

`prepare <ticket> <mr.json>` với `{revision, title, body}`:

1. Cổng: approval, mọi check còn hiệu lực, review `pass` đúng HEAD và branch, worktree sạch, đúng branch ticket.
2. Title/body: không rỗng, metadata trung lập, không từ khóa tự đóng issue (`close|fix|resolve … #<số>`), body PHẢI chứa ticket key.
3. Base: fetch (lỗi thì dùng ref có sẵn, báo `baseFetched: false`); base PHẢI là ancestor của HEAD.
4. Diff `base...HEAD` không rỗng và mọi file ∈ `plan.files`. Mọi commit `base..HEAD` qua kiểm metadata và quét secret.
5. Ghi record `handoff` status `prepared` kèm `handoff.md` (lệnh `git push -u <remote> <branch>`, branch đích, title/body). **Không push.**

`handoff <ticket> [mr-url]`:

1. Cùng cổng với prepare; bản prepare còn khớp HEAD, branch, revision, `sourceHash`, hash của review.
2. `git ls-remote --heads <remote> refs/heads/<branch>` (không chờ prompt). Lỗi kết nối → từ chối. HEAD trên remote khác HEAD đã review → từ chối.
3. URL (tùy chọn): `http(s)`, không có user/password, không khoảng trắng, không mẫu secret. Helper không kiểm nội dung MR.
4. Ghi `handoff` status `complete` với `pushedHead` và `mr`. Gọi lại không kèm URL thì giữ URL đã ghi.

### 4.8 Policy và hooks

Mẫu secret (`hasSecret`): token `ghp_…`/`github_pat_…`/`glpat-…`/`sk-…`/`AKIA…`, khối private key, và các gán `api_key|access_token|private_token|GH_TOKEN|password|secret = <≥12 ký tự>` trừ vài placeholder đã biết.

Metadata trung lập (`checkMetadata`): chặn tên công cụ/model, `generated by`, `ai-generated|assisted`, `co-authored-by`, và chữ `AI` **viết hoa đứng riêng** (dùng lookaround Unicode để không khớp trong từ có dấu); từ "ai" thường không bị chặn (D8).

Runtime hook (`inspectHook`), cùng một policy cho mọi runtime:

| Luật | Phạm vi |
|---|---|
| Prompt chứa mẫu secret | `UserPromptSubmit` |
| Tool input chứa mẫu secret | Mọi tool, **toàn bộ** input |
| Đường dẫn credential: `.env*` (trừ `*.example`), `.ssh/`, `id_rsa`, `id_ed25519`, `credentials.json`, `auth.json` | Xem dưới |
| Dump env: `printenv`, `set |`, `Get-ChildItem Env:`, `process.env`, `os.environ`, lệnh `env` | Xem dưới |
| Tắt hook: `--no-verify`, `core.hooksPath`, `HUSKY=0`, `GIT_CONFIG_COUNT` | Xem dưới |
| Push/MR: `git … push`, `gh pr create|merge`, `glab mr create|merge` | Xem dưới |

Phạm vi của bốn luật cuối (D9): với tool ghi file (`Write`, `Edit`, `MultiEdit`, `NotebookEdit` có `file_path`/`notebook_path`) chỉ xét **đường dẫn đích**; với mọi tool khác (kể cả tool không rõ tên) xét toàn bộ input.

Adapter `agent-hook.mjs`: khi chặn, ghi lý do ra **stderr**, ghi JSON quyết định ra stdout, và thoát với exit code 2. Không bao giờ in lại prompt hay tham số.

Đóng gói:

- `.codex/hooks.json`: launcher `node -e` tìm root bằng `git rev-parse --show-toplevel`.
- `.claude/settings.json`: launcher `node -e` dùng `CLAUDE_PROJECT_DIR`, không có thì dùng Git root; không tải được policy thì thoát exit 2 (chặn). Matcher `*`.
- `setup` kiểm mỗi file cấu hình có mặt đều nối cả `UserPromptSubmit` và `PreToolUse` tới `agent-hook.mjs`; cần ít nhất một runtime.

Git hooks giữ nguyên bản gốc, chỉ đổi đường dẫn script và nguồn cấu hình: `pre-commit` (branch, identity, file env/khóa, secret), `commit-msg` (Conventional Commits + metadata), `pre-push` (chỉ `feature/*`, không nhánh bảo vệ, không xóa, không rewrite, ≤ 200 commit, quét từng commit).

### 4.9 Skill và quy tắc cho từng runtime

- Một bản skill duy nhất trong `.agents/skills`. Một nguồn quy tắc duy nhất là `AGENTS.md`.
- Claude Code: `CLAUDE.md` chứa dòng `@AGENTS.md`. `setup` tạo `.claude/skills/<tên>` trỏ tới `.agents/skills/<tên>` cho mọi thư mục có `SKILL.md`: thử symlink thư mục (đường dẫn tương đối); gặp `EPERM` trên Windows thì tạo **junction** (đường dẫn tuyệt đối). Trạng thái mỗi liên kết: `linked`, `missing`, `stale` (liên kết trỏ sai/hỏng → thay), `conflict` (file/thư mục thật → để nguyên, báo cáo).
- Liên kết là của từng máy: `.claude/skills/task-*` PHẢI nằm trong `.gitignore`; `doctor` dừng nếu có liên kết mà chưa bị ignore.

### 4.10 CLI

`node .agents/workflow/task.mjs <lệnh>`; kết quả là JSON trên stdout; lỗi là một dòng `Task: <thông báo>` trên stderr và exit 1. Lệnh lạ hoặc sai số tham số in hướng dẫn dùng.

| Lệnh | Tác dụng |
|---|---|
| `setup` | Tạo `workflow.local.json` từ file mẫu nếu thiếu; bật `core.hooksPath=.githooks` (từ chối nếu repo đã dùng hooksPath khác); kiểm cấu hình runtime hook; tạo liên kết skill cho Claude Code. |
| `doctor` | Kiểm: local config và `.workflow-tmp/` đã ignore; liên kết skill đã ignore. Trả: `node`, `author`, `target`, `documents`, `docsRepo`, `tickets`, `hooks`, `claudeSkills`, `baseRef`. |
| `list` | Mọi ticket: `ticket`, `title`, `revision`, status từng stage. |
| `sync …` | Mục 4.4. Trả thêm `docsMissing`, `sourceIds`, `docsRepo`. |
| `status`/`next <ticket>` | `target`, `title`, `next`, `reason`, `stages`, `docsMissing`, `docsRepo`. |
| `record <ticket> <stage> <file>` | Mục 4.5. Input là JSON file thường < 1 MB, không phải file credential. |
| `can-implement`, `start`, `check`, `prepare`, `handoff` | Mục 4.6–4.7. |

`docsRepo` trong kết quả: `{git:false}` nếu thư mục hồ sơ không thuộc Git repo; `{git:true, ignored:true}` nếu thư mục hồ sơ bị chính repo chứa nó ignore; còn lại `{git:true, uncommitted}`. Helper **không** commit hay push repo hồ sơ.

---

## 5. Bảng chuyển đổi file

| Bản gốc | Đích | Việc làm |
|---|---|---|
| `scripts/workflow.mjs` + `scripts/task.mjs` | `.agents/workflow/task.mjs` | Gộp thành một CLI; bỏ `target`, `board`, `publish`; thêm `doctor` (thay `check` môi trường), `list`, `handoff` |
| `scripts/workflow/config.mjs` | `lib/config.mjs` | Viết lại: bỏ parser env và mọi biến `GH_*`; thêm config JSON, quy tắc key/slug, kiểm ignore |
| `scripts/workflow/vault.mjs` | `lib/vault.mjs` | Viết lại phần sync và đường dẫn; giữ lock, atomic write, kiểm symlink; bỏ import legacy |
| – | `lib/source.mjs` | Mới: đọc và kiểm nguồn file/chat |
| `scripts/workflow/stages.mjs` | `lib/stages.mjs` | Đổi chữ ký `(settings, ticket, …)`; intake theo source ID; stage `release` → `handoff`; author từ `settings.author` |
| `scripts/workflow/verification.mjs` | `lib/verification.mjs` | Fingerprint qua `hash-object`; runner bất đồng bộ; `timeoutSeconds` |
| – | `lib/command.mjs` | Mới: phân giải lệnh trên Windows, timeout, kill cây process |
| `scripts/workflow/dispatch.mjs` | `lib/dispatch.mjs` | `release`/`pr-ready` → `handoff`/`handed-off` |
| `scripts/workflow/views.mjs` | `lib/views.mjs` | Header theo ticket; danh sách nguồn; mục "Bàn giao" |
| `scripts/workflow/document-history.mjs` | `lib/document-history.mjs` | Chữ ký tính trên `mr`, `pushedHead` thay cho `pr`, `projectItem` |
| `scripts/workflow/release.mjs` | `lib/handoff.mjs` | Viết lại theo mục 4.7 |
| `scripts/workflow/policy.mjs` | `lib/policy.mjs` | Thêm mẫu GitLab; sửa luật `AI`; branch theo ticket; phạm vi theo loại tool |
| `scripts/workflow/git.mjs` | `lib/git.mjs` | Thêm `tryGit`, `quietEnv`, `identity` |
| `scripts/workflow/agent-hook.mjs` | `lib/agent-hook.mjs` | Thêm ghi lý do ra stderr |
| `scripts/workflow/git-hook.mjs` | `lib/git-hook.mjs` | Đọc `.agents/workflow.config.json` |
| `scripts/workflow/setup-hooks.mjs` | `lib/setup-hooks.mjs` | Kiểm nhiều runtime; gọi liên kết skill |
| – | `lib/skill-links.mjs` | Mới: mục 4.9 |
| `github.mjs`, `transport.mjs`, `credential.mjs`, `target.mjs`, `eslint.config.mjs` | – | Xóa |
| `tests/workflow/*` | `.agents/workflow/tests/*` | Viết lại (mục 8); bỏ `targets`, `start-local` |
| `docs/workflow/CONTRACT.md`, `RTK.md`, `scripts/workflow/README.md` | `.agents/workflow/` | CONTRACT viết lại (v4); README viết lại; RTK chuyển chỗ |
| `.agents/skills/task-release` | `.agents/skills/task-handoff` | Đổi tên và viết lại; 5 skill còn lại sửa theo mục 6 |
| `.codex/hooks.json`, `.githooks/*` | giữ chỗ | Sửa đường dẫn script |
| – | `.claude/settings.json`, phần đầu `CLAUDE.md` | Mới |
| `workshop.config.json`, `.agents/.env.workflow.example`, `package.json` | `.agents/workflow.config.json`, `.agents/workflow.local.example.json` | Thay thế; xóa `package.json` |
| `WORKFLOW_SETUP.md`, `AGENTS.md` | giữ chỗ | Viết lại |
| – | `.agents/TASK-SKILLS-GUIDE.md`, `docs/ADAPTATION-DESIGN.md`, blueprint này | Mới |

`.gitignore` của repo source PHẢI có: `.agents/workflow.local.json`, `.workflow-tmp/`, `.claude/settings.local.json`, `.claude/skills/task-*`, và thư mục build của dự án. KHÔNG được ignore cả `.claude/`.

---

## 6. Nội dung skill

Phần chung của mọi skill:

- Frontmatter: `name`, `description` một dòng, `argument-hint`. **Không** đặt `disable-model-invocation` (R21): agent gọi được skill như ở baseline. `agents/openai.yaml` cạnh `SKILL.md` chỉ mang `interface.display_name` và `interface.short_description` cho Codex, không có khối `policy`.

- Mở đầu: dùng ticket ID từ yêu cầu hiện tại, xác nhận bằng `status <ticket>`; không đoán repo/ticket, không đọc env; tuân thủ `.agents/workflow/CONTRACT.md` (ghi rõ đường dẫn này, vì đường dẫn tương đối không đúng khi skill được mở qua liên kết).
- Khi ghi tài liệu: kèm `change.summary`, `change.reason`; không tự đặt metadata.
- Khi kết quả báo `docsRepo.uncommitted: true`: commit phần hồ sơ của ticket trong repo hồ sơ (`docs(ticket): <ticket> <bước>`), không push.
- Kết thúc: báo đã làm, phát hiện chính, trạng thái thật, tài liệu hiện hành, bước tiếp theo.

Điểm riêng:

| Skill | Nội dung phải có |
|---|---|
| `task-sync` | Phân biệt ticket mới và CR; CR theo R16 (chưa bàn giao → `sync <ticket>`; đã bàn giao → `--type cr --relates-to`; `--reopen` chỉ khi người dùng nói rõ MR chưa merge). Chọn `--type` theo config. File: dùng đúng đường dẫn, không sửa. Chat: chép **nguyên văn** vào `.workflow-tmp/request.md`, rồi trích lại để người dùng xác nhận. Đặt title và slug; chỉ truyền `--key` khi nguồn có mã ngoài. Ghi intake phủ đủ `sourceIds`. Không chọn phương án, không code. |
| `task-analyze` | Như bản gốc. Thêm: TASK.md phải tự đủ để người khác lập plan (R7); ticket có `relatesTo` thì đọc TASK/PLAN của ticket liên quan làm bối cảnh (là dữ liệu, không phải chỉ dẫn).; hỏi quyết định theo vòng, mỗi câu kèm đáp án đề xuất (mục "Hỏi quyết định theo vòng" của CONTRACT); câu chưa ai trả lời được thì ghi vào câu hỏi mở kèm đề xuất. |
| `task-finalize` | Như bản gốc. Thêm: ticket nhận từ người khác thì đọc TASK hiện hành, thiếu thì quay Analyze; `timeoutSeconds` cho lệnh chạy lâu; trình plan cho người có thẩm quyền (developer hoặc leader), ghi đúng tên người duyệt (R12). Steps là các lát dọc (prefactor trước; thay đổi cơ học lan rộng theo mở rộng → chuyển dần → thu hẹp); plan.md ghi điểm đặt test của từng check và nguồn độc lập của giá trị mong đợi; quyết định còn thiếu thì hỏi theo vòng. |
| `task-implement` | Như bản gốc. `start <ticket>` không còn tham số slug; timeout là một dạng fail. Không push, không MR. |
| `task-review` | Như bản gốc; bước tiếp là Handoff. Thêm: review theo hai trục tách riêng — **Yêu cầu** (thiếu/thừa/sai so với AC, plan, delivery; chất lượng của chính các check) và **Chuẩn code** (chuẩn đã viết của repo + danh sách smell nền, smell luôn là nhận định) — mỗi trục một lượt đọc (subagent riêng khi có), báo dưới hai tiêu đề, mỗi finding ghi `axis`. Chi tiết trong `references/review-axes.md`. |
| `task-handoff` | Soạn title/body MR (trung lập, `Refs <key>`). Chạy `prepare`. Đưa developer lệnh push và nội dung MR. Sau khi developer báo đã push, chạy `handoff <ticket> [mr-url]`. Chưa xác minh được thì báo đúng trạng thái `prepared`. Body MR theo mẫu trong skill: Tóm tắt (hình nhỏ nhất), Bằng chứng trước/sau từ check đã chạy, Mức nguy hiểm khi merge (đảo ngược, phạm vi ảnh hưởng), Vận hành và giới hạn, `Refs <key>`. |

---

## 7. Trình tự thực hiện

Làm theo thứ tự. Sau mỗi giai đoạn, bộ test hiện có của giai đoạn đó PHẢI pass trước khi sang giai đoạn sau.

| # | Giai đoạn | Việc làm | Kiểm |
|---|---|---|---|
| P0 | Chuẩn bị | Lấy các file ở mục 2 từ `baseline/workshop/` (hoặc `git archive` từ repo gốc). **Không** lấy file env local (chứa PAT) và test của app. Giữ nguyên `baseline/`; làm việc trên bản copy, trong một Git repo để hoàn tác được. | Đủ 49 file như `baseline/README.md` liệt kê |
| P1 | Lõi không phụ thuộc mạng | Viết `config`, `git`, `policy`, `source`, `vault`, `document-history`, `views`. | Test nền: config, key/slug, sync, CR, lock, fail-closed |
| P2 | Stage và kiểm chứng | `stages`, `verification`, `command`, `dispatch`. | Test gate, evidence, runner, timeout, `.cmd` |
| P3 | Bàn giao | `handoff`; `start` trong CLI. | Test prepare/handoff với bare remote thật |
| P4 | CLI và hook | `task.mjs`; chuyển `agent-hook`, `git-hook`, `setup-hooks`; sửa `.codex/hooks.json`, `.githooks/*`. | Test CLI đầu-cuối; test Git hook thật |
| P5 | Dọn | Xóa `scripts/`, `tests/`, `package.json`, `workshop.config.json`, env mẫu, module GitHub. | Không còn tham chiếu `pnpm`, `workshop`, `GH_` ngoài mẫu secret |
| P6 | Skill và tài liệu | Sáu skill; CONTRACT; README; WORKFLOW_SETUP; AGENTS; guide. | Mọi link tương đối trỏ tới file có thật |
| P7 | Hồ sơ trong repo source | Kiểm ignore thay cho cấm; `docsRepo.ignored`. | Test cấu hình và CLI tương ứng |
| P8 | Claude Code | `.claude/settings.json`; stderr trong adapter; phạm vi luật theo loại tool; `skill-links`; `CLAUDE.md`. | Test launcher hai runtime, test liên kết; mở session mới thấy 6 skill |

### Bẫy đã gặp

| Bẫy | Cách tránh |
|---|---|
| Sau P8, hook có hiệu lực **ngay trong session đang làm**. Sửa `policy.mjs` thành trạng thái lỗi cú pháp sẽ khiến hook chặn mọi tool, kể cả tool dùng để sửa lại. | Sửa `policy.mjs` bằng một lệnh duy nhất: sao lưu → ghi → chạy kiểm tra nạp module → lỗi thì khôi phục. |
| Hook quét cả lệnh và input của tool. Lệnh thử chứa chuỗi giống token, cờ bỏ qua hook hay lệnh push sẽ bị chặn. | Đưa các ca "bị chặn" vào file test; trong test, ghép chuỗi token lúc chạy thay vì viết liền. |
| Trên Node 24/Windows, process con gọi `process.exit()` đôi khi crash với exit code `3221225477` khi máy tải nặng (đo được khoảng 3%), làm check fail oan. | Lệnh check trong test và script check dùng `process.exitCode` rồi tự kết thúc. |
| `core.autocrlf` đổi line ending khi checkout, làm fingerprint theo byte thô thay đổi. | Fingerprint qua `git hash-object` (mục 4.6). |
| Node từ chối spawn `.cmd`/`.bat` khi không có shell. | Runner ở mục 4.6. |
| `PATHEXT` thực tế viết hoa; hệ file phân biệt hoa thường thì không. | Test dùng `PATHEXT` chữ thường và so sánh đúng tên file tìm được. |
| Windows chưa bật Developer Mode không tạo được symlink; Git với `core.symlinks=false` checkout symlink thành file text. | Liên kết skill tạo theo máy, có junction dự phòng, không commit. Test symlink tự skip khi gặp `EPERM`. |
| `git check-ignore` với pattern thư mục không khớp đường dẫn chưa tồn tại. | Kiểm trên một đường dẫn con. |
| Xóa junction bằng công cụ đi xuyên liên kết có thể xóa cả đích. | Dùng `unlink`/`rmdir` trên chính liên kết; test khẳng định đích còn nguyên. |
| Bộ test sinh rất nhiều process Git, chạy khoảng 5–7 phút trên Windows. | Chấp nhận; đặt timeout lệnh ≥ 10 phút. |

---

## 8. Nghiệm thu

Lệnh: `node --test ".agents/workflow/tests/*.test.mjs"`. Kết quả tham chiếu: **63 test, 61 pass, 2 skip** (hai test symlink trên Windows chưa bật Developer Mode), 0 fail. Test dùng thư mục tạm, một bare remote local, không cần mạng.

Hành vi mà bộ test PHẢI phủ (tên test hiện tại diễn đạt đúng các ý này):

| Nhóm | Hành vi |
|---|---|
| Cấu hình | Đọc config + local; từ chối đường dẫn tương đối, thiếu, khóa lạ, JSON hỏng, symlink; hồ sơ trong repo source chỉ nhận khi đã ignore; `setup` không ghi đè local config. |
| Ticket và nguồn | Key ngoài/tự sinh, cộng phút khi trùng, từ chối key ngoài trùng; phân giải theo key; copy nguyên byte kể cả tên Unicode và file nhị phân; BOM của chat; từ chối tên/nguồn không an toàn và secret. |
| Loại ticket và CR | Prefix theo loại, loại tùy biến trong config, loại lạ bị từ chối, validate `tickets.*`; CR trỏ tới ticket chưa bàn giao bị từ chối; sync có nguồn mới trên ticket đã bàn giao bị từ chối, sync rỗng vẫn được; ticket CR lưu và hiển thị `relatesTo`; `--reopen` tạo revision. |
| Sync | Idempotent với mọi tổ hợp nguồn cũ; CR thêm revision, `item-added`/`item-replaced`, vô hiệu hóa stage; file cũ còn nguyên; dựng lại file dẫn xuất. |
| Fail closed | Lock; state hỏng; manifest bị sửa; file `request/` bị sửa/xóa; `request/r<N>` mồ côi; symlink trong thư mục hồ sơ. |
| Stage | Thứ tự và approval; secret trong input; checkpoint; CR xóa approval; code bẩn/đổi sau review; sai branch; intake phủ đủ nguồn. |
| Kiểm chứng | Không tự khai pass; exit khác 0; thiếu file thực thi; timeout bị kill; check sửa source; `.cmd` trên Windows; phân giải lệnh; fingerprint qua commit giống hệt; line ending; hồ sơ không ảnh hưởng fingerprint (ngoài repo và trong repo đã ignore); context đổi; log bị sửa; delivery runtime cần smoke tại target. |
| Bàn giao | Chặn file ngoài plan, base chưa được chứa; prepare không push; `handoff` từ chối khi chưa push, nhận sau khi push; URL không hợp lệ; remote không tới được; CR sau prepare. |
| Policy và hook | Metadata trung lập nhưng cho phép "ai" tiếng Việt; mẫu secret; hook chặn/cho qua đúng ca; phạm vi theo loại tool; launcher của cả hai runtime từ thư mục con; `CLAUDE_PROJECT_DIR`; fail closed khi thiếu kit; Git hook thật với bare remote; hooksPath có sẵn không bị thay. |
| Liên kết skill | Tạo, idempotent, không ghi đè thư mục thật, sửa liên kết hỏng, xóa liên kết không xóa đích; `doctor` dừng khi liên kết chưa ignore. |
| CLI | Chỉ cần `node`; luồng chat → intake; luồng file → handoff đã xác minh; sai lệnh/sai số tham số; không lộ đường dẫn trong lỗi; worktree của repo source luôn sạch sau khi helper ghi hồ sơ. |

Kiểm tay sau khi cài vào một repo thật:

1. `setup` rồi `doctor` không lỗi; `baseRef: present`.
2. Trong Codex và Claude Code: gõ một prompt chứa chuỗi giống token → bị chặn; yêu cầu agent push → bị chặn.
3. Claude Code session mới liệt kê 6 skill `task-*`.
4. Chạy một ticket thử với lệnh check Maven/Gradle thật, có `timeoutSeconds`.

---

## 9. Giới hạn đã biết

| Giới hạn | Ghi chú |
|---|---|
| Helper không đọc được khung chat | Không kiểm được agent chép nguyên văn; bù bằng bước người dùng xác nhận trong skill. |
| URL MR không được kiểm | Helper chỉ xác minh HEAD của branch trên remote. |
| Lock chỉ có nghĩa trên một máy | Quy ước: một ticket ghi từ một máy tại một thời điểm; `state.json` không merge được. |
| Helper không commit/push repo hồ sơ | Agent commit theo skill, người dùng push. |
| Redaction là best effort | Hồ sơ được commit hết (R11); quyền đọc repo hồ sơ phải đặt tương ứng. |
| Ghi file rồi chạy file | Vì luật về lệnh không xét nội dung file, agent có thể ghi một script chứa lệnh push rồi chạy nó. Lớp chặn còn lại là Git hook `pre-push`. |
| Kill cây process khi timeout | Đã test với script Node; chưa test với Maven/Gradle daemon thật. |
| Log check lưu UTF-8 | Output của công cụ dùng code page khác có thể hiển thị sai ký tự. |
| Junction dùng đường dẫn tuyệt đối | Chuyển repo thì chạy lại `setup`. |
| Hook phụ thuộc trust của runtime | `doctor` không chứng minh hook đang chạy trong session. |
| Kiểm thủ công không được mô hình hóa | Như baseline, chỉ check là lệnh do helper chạy mới tính. Xác nhận của người test, nếu có, chỉ là text trong CHECKS/MR và không gắn với cổng nào. Phương án khi cần nằm ở mục 13.7. |
| Check không có `cwd` riêng | Lệnh frontend dùng `npm --prefix frontend …`. Nếu một công cụ buộc phải chạy từ trong `frontend/`, cần bọc bằng một script trong repo, hoặc thêm trường `cwd` cho check (chưa làm; theo R20 chỉ thêm khi thực tế cần). |

---

## 10. Cập nhật và cải tiến về sau

### Quy trình

1. **Sửa blueprint trước**: thêm/sửa yêu cầu ở mục 1, đặc tả ở mục 4–6, ghi quyết định vào mục 11, thêm dòng vào mục 12.
2. Viết hoặc sửa test thể hiện hành vi mới (mục 8).
3. Sửa code; chạy toàn bộ test.
4. Cập nhật CONTRACT (hợp đồng cho agent), skill liên quan, guide, WORKFLOW_SETUP.
5. Nếu thay đổi chạm vào hook, thử trong session thật của cả hai runtime.

### Quy tắc tương thích

| Thay đổi | Bắt buộc |
|---|---|
| Hình dạng `state.json` hoặc manifest | Tăng `schemaVersion` của state; viết bước chuyển đổi cho hồ sơ đang có **hoặc** ghi rõ hồ sơ cũ phải làm lại. Không âm thầm đọc schema cũ. |
| Khóa trong `workflow.config.json` | Khóa mới có mặc định thì giữ `schemaVersion: 3`; đổi nghĩa/xóa khóa thì tăng. |
| Thêm lệnh CLI hoặc trường output | Cập nhật bảng lệnh trong CONTRACT và mục 4.10. |
| Đổi tên stage/status | Sửa đồng thời `vault`, `stages`, `dispatch`, `views` (regex đường dẫn record), `verification`. |
| Nới lỏng một luật hook | Ghi rõ phần rủi ro còn lại vào mục 9. |
| Thêm dependency ngoài Node | Không được (I11), trừ khi blueprint được sửa và người dùng đồng ý. |

### Điểm mở rộng thường gặp

| Nhu cầu | Chỗ sửa |
|---|---|
| Runtime agent mới | Thêm file cấu hình hook vào `runtimes` trong `setup-hooks.mjs`; nếu runtime đặt tên tool ghi file khác, thêm vào `contentTools` trong `policy.mjs`; nếu cần thư mục skill riêng, mở rộng `skill-links.mjs`. |
| Loại nguồn mới (URL, ticket từ tracker) | Thêm hàm trong `source.mjs` trả `{kind, name, data, sha256}`; quyết định nó thay thế theo tên (như file) hay cộng dồn (như chat) trong `currentItems`. |
| Tự tạo MR qua API | Thêm sau bước `handoff` như một bước tùy chọn; giữ nguyên việc xác minh HEAD trên remote; token phải nằm ngoài hồ sơ và ngoài chat. |
| Leader bắt buộc duyệt | Thêm cấu hình danh sách người duyệt và kiểm `approvedBy` trong hành động `approve`. |
| Tự commit repo hồ sơ | Thêm lệnh riêng; không gộp vào `record`, và không push. |
| Thêm loại ticket (BUG, STORY…) | Chỉ sửa `tickets.types` trong `workflow.config.json` của dự án; không sửa code. |
| Ticket từ GitLab/Redmine | Hiện tại: truyền mã issue qua `--key` (vd. `GL-123`) và nội dung qua `--file`/`--chat`. Muốn helper tự lấy nội dung: thêm loại nguồn mới (dòng trên) và giữ token ngoài hồ sơ. |
| Đổi quy tắc key | `generatedKey`, `ticketKey`, `ticketTypes` trong `config.mjs` và `createTicket` trong `vault.mjs`; cập nhật mục 4.2. |
| Stack khác (không phải Java) | Thường chỉ cần đúng `.gitignore` cho thư mục build và `timeoutSeconds` phù hợp. |

---

## 11. Nhật ký quyết định

| Mã | Quyết định | Lý do | Phương án đã loại |
|---|---|---|---|
| D1 | Key tự sinh chứa thời điểm `YYMMDD-HHMM` (có prefix theo D15) | Không cần bộ đếm dùng chung; sắp xếp được; người dùng chọn | Số tuần tự `<PREFIX>-NNN`: ngắn hơn nhưng cần phối hợp |
| D2 | Lưu cả file lẫn chat vào `request/r<N>/`, manifest chỉ chứa hash | Phát hiện CR và căn cứ của approval phụ thuộc vào nội dung đã lưu; team phải đọc được | Chỉ lưu đường dẫn file gốc: file đổi/mất là mất căn cứ |
| D3 | File trùng tên thay thế, chat cộng dồn | CR bằng file thường là bản mới của cùng tài liệu; CR bằng chat là yêu cầu bổ sung | Mọi nguồn đều cộng dồn |
| D4 | Bước cuối là prepare + xác minh, không push | R2; push là hành động hướng ra ngoài | Helper push bằng credential của developer |
| D5 | Runner tự phân giải `.cmd`/`.bat`, từ chối ký tự đặc biệt | Không qua shell expansion mà vẫn chạy được Maven/Gradle | `shell: true`; hoặc cố escape cho `cmd.exe` |
| D6 | Fingerprint qua `git hash-object` | Ổn định trước `autocrlf` | Băm byte thô |
| D7 | Bỏ import hồ sơ legacy | Team không có hồ sơ cũ | Giữ lại code chuyển đổi |
| D8 | Chỉ chặn `AI` viết hoa đứng riêng | Commit tiếng Việt dùng từ "ai" | Giữ luật cũ; bỏ hẳn luật |
| D9 | Luật về lệnh không áp lên nội dung của tool ghi file | Claude Code gọi hook cho Write/Edit với toàn bộ nội dung; luật cũ khiến agent không soạn được tài liệu | Áp mọi luật lên mọi input |
| D10 | Hồ sơ trong repo source được phép nếu đã ignore | R6: file bị ignore không ảnh hưởng fingerprint hay worktree | Cấm hẳn |
| D11 | Liên kết skill tạo theo máy, không commit | Symlink không dùng được trên Windows mặc định | Commit symlink; copy skill sang `.claude/skills` |
| D12 | Một policy, một adapter, mỗi runtime một file cấu hình | Luật không thể lệch giữa các runtime | Mỗi runtime một bộ luật |
| D13 | Helper không commit/push repo hồ sơ | Chia sẻ là quyết định của người; hook chặn agent push ở mọi repo | Tự commit sau mỗi `record` |
| D14 | `handoff` từ chối khi không tới được remote | I2: không có evidence thì không ghi nhận | Ghi nhận kèm cờ "chưa xác minh" |
| D15 | Prefix của key tự sinh thể hiện **loại ticket**, khai trong config; key ngoài dùng nguyên vẹn | R15; mã của tracker đã tự mang prefix nên không cần thêm | Prefix theo kênh nguồn (FILE/CHAT/…); danh sách cố định trong code |
| D16 | CR là revision khi ticket chưa bàn giao, là ticket CR mới khi đã bàn giao; helper cưỡng chế cả hai chiều, có `--reopen` làm ngoại lệ tường minh | R16; revision giữ được cơ chế buộc kiểm lại (I5), còn ticket đã bàn giao thì branch/MR đã chốt | CR luôn là ticket mới (mất việc buộc kiểm lại); CR luôn là revision (phải làm tiếp trên branch đã merge) |
| D17 | Thêm `type`, `relatesTo` làm tăng schema của state lên 3, không có bước chuyển đổi | Chưa có hồ sơ nào ở schema 2 được dùng thật | Đọc cả schema 2 và coi thiếu `type` là mặc định |
| D18 | Kết hợp với `mattpocock/skills` theo kiểu phân lớp: task-* là khung và nơi ghi nhận duy nhất; chỉ lấy lớp kỹ thuật | Hai bộ trả lời hai câu hỏi khác nhau (điều gì phải đúng để qua cổng / làm từng bước thế nào cho tốt) | Cài nguyên plugin chạy song song (hai luồng cạnh tranh, hai nguồn sự thật); bỏ qua hoàn toàn |
| D19 | Viết lại kỹ thuật vào skill của mình thay vì phụ thuộc skill ngoài | Không thêm phụ thuộc cài đặt; nội dung bằng tiếng Việt, ví dụ theo Java; không bị nội dung chỉ dẫn tự cập nhật | Gọi skill ngoài theo tên (phải cài thêm, ví dụ thiên TypeScript); copy nguyên văn |
| D20 | ~~Sáu skill task-* là skill chỉ người dùng gọi~~ — **thay bởi D25** | (lý do cũ: skill có tác dụng phụ nên agent không nên tự kích hoạt) | – |
| D21 | Phần dùng chung của nhiều skill (cách hỏi theo vòng) đặt trong CONTRACT | CONTRACT là tài liệu mọi skill đã trỏ tới, nên mỗi ý chỉ nằm một chỗ | Lặp lại trong từng skill; tách thành một skill model tự gọi |
| D22 | Ticket BUG không có cơ chế kiểm chứng riêng: không bắt buộc lệnh tái hiện lỗi, không có cổng hay bản ghi cho việc test tay. Kiểm chứng theo đúng quy tắc chung (required checks do helper chạy) | R20: bám sát baseline; R18 mới là nhận xét chưa kiểm chứng | Bắt buộc lệnh tái hiện (skill gốc `diagnosing-bugs`); mục "Kiểm bởi người" và bản ghi xác nhận của người test (hoãn, mục 13.7) |
| D23 | Glossary và ADR lưu trong repo hồ sơ, là Markdown thường ngoài cơ chế record | R19; không đụng cổng `files` của plan, chia sẻ cùng cách với hồ sơ | Lưu trong repo source (mọi sửa đổi phải nằm trong `files` của plan, hoặc phải nới cổng) |
| D24 | Kết quả retro là một file `RETRO.md` trong thư mục ticket, không phải stage | R19; không đổi state, không cần sửa helper | Thêm stage `retro` có record và cổng |
| D25 | Agent gọi được sáu skill task-*; gỡ cờ chỉ-người-gọi đã thêm ở bản 1.2. Các điểm dừng chờ người giữ nguyên như baseline và do helper cưỡng chế: duyệt plan (cổng approval), push và tạo MR (helper không push) | R20, R21: workflow tự động như baseline | Giữ chỉ-người-gọi (D20) |
| D26 | Hoãn mọi cơ chế cho kiểm thủ công (xác nhận của người test) cho tới khi dùng thật bị tắc | R20: chưa có bằng chứng dự án nào không tự động hóa được check | Thêm ngay hành động ghi xác nhận kiểu approval và một cổng |
| D27 | Phạm vi của "bám sát baseline" là luồng bước và trạng thái; kỹ thuật từ bộ skill của Matt Pocock vẫn được tích hợp vào từng bước | R17 và R20 theo cách người dùng nêu: tự động như baseline, tối ưu từng bước bằng kỹ thuật bổ sung | Bỏ các mục A, C, D, E để giống baseline hoàn toàn |

---

## 12. Lịch sử blueprint

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.8 | 2026-10-02 | **Thực hiện mục 13.4-0 (gói G0):** gỡ `disable-model-invocation` khỏi 6 skill và khối `policy` khỏi 6 `agents/openai.yaml`; sửa tài liệu training và CREDITS. Mục 6, 13.2, 13.3 cập nhật theo. `task-retro` (13.4-D) không còn ghi là skill chỉ người dùng gọi. |
| 1.7 | 2026-10-02 | R9 ghi rõ bố cục repo: project Maven Spring Boot ở root, frontend Vue.js trong `frontend/` dùng npm và Vitest. Mục 4.6 và mục 9 ghi rõ check chạy từ root repo, lệnh frontend dùng `npm --prefix frontend`. Chỉ sửa blueprint, chưa thực hiện. |
| 1.6 | 2026-10-02 | R20 thu hẹp đúng phạm vi: bám sát baseline ở việc tự động các bước và ở trạng thái; thêm khác biệt tech stack (Spring Boot + Vue.js, R9); kỹ thuật từ bộ skill của Matt Pocock vẫn tích hợp (D27). Thêm liên kết tới kế hoạch thực hiện `TASK-SKILLS-UPDATE-PLAN.md`. Chỉ sửa blueprint, chưa thực hiện. |
| 1.5 | 2026-10-02 | Thêm nguyên tắc bám sát baseline (R20) và agent gọi được các bước (R21, D25, mục 13.4-0; D20 bị thay). R18 hạ xuống thành nhận xét chưa kiểm chứng; mục 13.4-B bỏ phần "Kiểm bởi người"; cơ chế xác nhận của người test được hoãn (D26, mục 13.7). Chỉ sửa blueprint, chưa thực hiện. |
| 1.4 | 2026-10-01 | Sửa R18, D22 và mục 13.4-B cho đúng thực tế của team: con người test và tái hiện lỗi; agent phân tích bug từ mô tả lỗi, stack trace và source code, rồi soạn yêu cầu kiểm cho người test. Bỏ cách diễn đạt "khả thi ở mọi dự án" của bản 1.3. Chỉ sửa blueprint, chưa thực hiện. |
| 1.3 | 2026-10-01 | Chốt ba quyết định còn mở của mục 13.4 (R18–R19, D22–D24): ticket BUG không dùng lệnh tái hiện lỗi; glossary và ADR lưu trong repo hồ sơ; retro chỉ là tài liệu `RETRO.md`. Chỉ sửa blueprint, chưa thực hiện. |
| 1.2 | 2026-10-01 | Thêm R17, D18–D21 và mục 13: kết hợp kỹ thuật từ `mattpocock/skills`. Đã đưa vào skill: chỉ người dùng gọi, hỏi theo vòng, lát dọc và điểm đặt test, review hai trục, mẫu body MR. Phần còn lại là kế hoạch ở mục 13.4. |
| 1.1 | 2026-10-01 | Thêm R15–R16, D15–D17: loại ticket và prefix của key tự sinh (`tickets.*` trong config, `--type`), liên kết `--relates-to`, quy tắc CR theo trạng thái bàn giao và `--reopen`; state schema 3. |
| 1.0 | 2026-10-01 | Bản đầu: đặc tả trạng thái sau khi chuyển đổi xong (nguồn file/chat, repo hồ sơ, handoff, runner Windows, hook hai runtime, liên kết skill). |

---

## 13. Kết hợp với bộ skill kỹ thuật `mattpocock/skills`

### 13.1 Nguồn và bản chất

- Repo `https://github.com/mattpocock/skills`, đọc ở commit `d81f3a1` (v1.3, 2026-09-29), giấy phép MIT. Ghi công trong [.agents/CREDITS.md](../.agents/CREDITS.md).
- Bộ đó chủ trương skill nhỏ, ghép được, **không sở hữu quy trình**: không helper, không cổng, không state. Kết quả nằm trong issue tracker (GitHub, GitLab, hoặc file markdown trong `.scratch/`), `GLOSSARY.md` và ADR.
- Luồng chính của nó: `grill-with-docs` → `to-spec` → `to-tickets` → `implement` (`tdd`, `code-review`) → `pr` → `retro`. Skill chia hai loại: chỉ người dùng gọi (điều phối) và model tự gọi (kỹ thuật dùng lại).

### 13.2 Mô hình kết hợp

```text
Người dùng ──gọi──> task-*  (khung: stage, cổng, evidence, hồ sơ — nơi ghi nhận DUY NHẤT)
                      │
                      └─ dùng kỹ thuật ─> lớp kỹ thuật (cách hỏi, cắt việc, viết test, review, viết MR, gỡ bug, nhìn lại)
```

- task-* trả lời "điều gì phải đúng thì mới qua bước"; lớp kỹ thuật trả lời "làm bước đó thế nào cho tốt". Mọi kết quả của lớp kỹ thuật đi vào hồ sơ qua helper (TASK/PLAN/CHECKS), không tạo nơi lưu thứ hai.
- Kỹ thuật được **viết lại vào skill của bộ kit** (D19), không gọi skill ngoài. Ánh xạ:

| Stage | Kỹ thuật | Nguồn | Trạng thái |
|---|---|---|---|
| analyze, finalize | Hỏi quyết định theo vòng, kèm đáp án đề xuất | `grilling` | Đã làm (v1.2) |
| finalize | Steps là lát dọc; mở rộng → chuyển dần → thu hẹp | `to-tickets` | Đã làm (v1.2) |
| finalize, review | Điểm đặt test; các kiểu test kém | `tdd` | Đã làm (v1.2) |
| review | Hai trục Yêu cầu / Chuẩn code; smell nền | `code-review` | Đã làm (v1.2) |
| handoff | Mẫu body MR | `pr` | Đã làm (v1.2) |
| mọi skill | Agent gọi được các bước, như baseline (cờ chỉ-người-gọi của v1.2 đã gỡ) | – | Đã làm (v1.8; D25) |
| mọi skill | Viết lại theo nguyên tắc viết cho agent | `writing-for-agents` | Kế hoạch (13.4-A) |
| sync, analyze | Phân tích bug từ mô tả lỗi, stack trace và source code; giả thuyết kiểm được | `diagnosing-bugs` (chỉ lấy phần giả thuyết và dọn log; bỏ phần lệnh tái hiện) | Kế hoạch (13.4-B) |
| analyze | Glossary và ADR, lưu trong repo hồ sơ | `domain-modeling` | Kế hoạch (13.4-C) |
| sau handoff | Nhìn lại, cải thiện môi trường của agent; kết quả là tài liệu | `retro` | Kế hoạch (13.4-D) |
| sync, analyze | Bảng câu hỏi gửi người ngoài | `to-questionnaire` | Kế hoạch (13.4-E) |

### 13.3 Đã đưa vào (v1.2)

Chỉ sửa nội dung skill và tài liệu; helper và test không đổi.

| Việc | Nơi sửa |
|---|---|
| Tên hiển thị cho Codex | `agents/openai.yaml` cạnh mỗi `SKILL.md` (chỉ khối `interface`). Cờ chỉ-người-gọi thêm ở v1.2 đã gỡ ở v1.8. |
| Hỏi theo vòng | Mục "Hỏi quyết định theo vòng" trong CONTRACT; `task-analyze`, `task-finalize` trỏ tới |
| Lát dọc, điểm đặt test | `task-finalize` bước 2–3 |
| Review hai trục | `task-review` bước 2; `task-review/references/review-axes.md`; trường `axis` trong findings (helper không kiểm trường này) |
| Mẫu body MR | `task-handoff` (helper vẫn chỉ kiểm metadata trung lập, có ticket key, không từ khóa tự đóng issue) |

### 13.4 Kế hoạch (chưa làm)

Mỗi mục làm theo quy trình ở mục 10. Thứ tự: 0 → A → B → C → D → E; kế hoạch thực hiện chi tiết (gói việc, file phải sửa, nghiệm thu) nằm ở [TASK-SKILLS-UPDATE-PLAN.md](TASK-SKILLS-UPDATE-PLAN.md). R20 áp cho luồng bước và trạng thái: các mục dưới đây không thêm stage, status hay cổng mới; chúng chỉ đưa kỹ thuật vào bên trong từng bước (R17). Ví dụ trong skill và tài liệu viết theo stack của team: Spring Boot ở backend, Vue.js ở frontend.

**0. Cho agent gọi được các bước (D25). — ĐÃ LÀM (v1.8).** Chỉ sửa frontmatter và tài liệu.

- Gỡ `disable-model-invocation: true` khỏi 6 `SKILL.md`; giữ `argument-hint`.
- Trong 6 file `agents/openai.yaml`, bỏ khối `policy` (giữ `interface`).
- Giữ nguyên lời văn chuyển bước của baseline trong skill: implement xong thì chuyển review; review xong thì chuyển handoff theo yêu cầu của người dùng; các bước còn lại báo bước tiếp theo.
- Điểm dừng chờ người không đổi: chọn hướng xử lý, duyệt plan, và push/tạo MR. Hai điểm sau do helper cưỡng chế (cổng approval; helper không push), không phụ thuộc vào việc skill do ai gọi.
- Sửa câu "chỉ chạy khi người dùng gọi" trong tài liệu training và dòng tương ứng trong `.agents/CREDITS.md`.
- Kết quả: trong Claude Code, ngay sau khi gỡ cờ, sáu skill xuất hiện lại trong danh sách skill agent gọi được. Còn phải kiểm tay: trên Codex, và việc agent tự chuyển implement → review trong một ticket thật. Tiêu chí: trong Claude Code và Codex, sau khi `status` trả `next: review`, agent tự gọi được `task-review` mà người dùng không phải gõ tên skill.

**A. Viết lại 6 skill theo nguyên tắc viết cho agent.** Chỉ sửa nội dung.

- Mỗi bước kết thúc bằng một **điều kiện hoàn thành** kiểm được (ví dụ "mọi `sourceIds` có trong `translatedSourceIds`" thay cho "tóm tắt đủ").
- Viết khẳng định thay cho cấm đoán; giữ câu cấm chỉ cho ranh giới cứng (push, secret, sửa tay hồ sơ) và kèm việc phải làm thay thế.
- Mỗi ý một chỗ: ba đoạn cuối đang lặp ở cả 6 skill (cách ghi tài liệu, commit repo hồ sơ, cách báo cáo) và 6 file `references/*-contract.md` gần giống nhau chuyển về một chỗ trong CONTRACT.
- Bỏ câu không làm đổi hành vi so với mặc định của model.
- Nghiệm thu: chạy một ticket thử trên cả Codex và Claude Code trước và sau khi viết lại, so số lần agent bỏ sót bước.

**B. Loại ticket BUG.** Sửa config và skill; **không sửa helper**.

Theo D22 và R20: ticket BUG đi đúng luồng và đúng cổng của mọi ticket khác. Không có lệnh tái hiện bắt buộc, không có cơ chế riêng cho test tay.

- Thêm `bug` → `BUG` vào `tickets.types` trong `workflow.config.json` đi kèm bộ kit. Mặc định trong code (khi config không khai `tickets`) giữ nguyên `req`, `cr`.
- `task-sync` cho ticket loại bug: nguồn là mô tả lỗi và stack trace/log, lưu nguyên văn như mọi nguồn khác. Bản tóm tắt intake nêu riêng triệu chứng, thông báo lỗi và stack trace, điều kiện xảy ra, và các bước tái hiện nếu người báo lỗi đã cung cấp. Thiếu thông tin thì ghi vào câu hỏi mở.
- `task-analyze` cho ticket loại bug:
  1. Ghi đúng triệu chứng và stack trace thành observation, căn cứ là source ID trong `request/`.
  2. Lần từ stack trace vào source code: các frame thuộc dự án, đường đi của dữ liệu tới điểm lỗi. Điều đọc được trực tiếp từ code là `observed`; điều suy ra mà chưa được xác nhận là `inferred`.
  3. Nêu các giả thuyết về nguyên nhân, xếp theo khả năng, mỗi giả thuyết kèm một dự đoán kiểm được. Khi stack trace đã chỉ thẳng nguyên nhân thì một giả thuyết là đủ.
- `task-finalize`, `task-implement`, `task-review`, `task-handoff`: như mọi ticket. Kiểm chứng là các required check do helper chạy; một test hồi quy cho đúng lỗi này được thêm khi dự án có điểm đặt test phù hợp. Log gỡ lỗi tạm thời mang một tiền tố riêng để gỡ sạch trước khi commit; nguyên nhân đã xác định được ghi vào CHECKS và nội dung MR.
- Nghiệm thu: một ticket BUG thử đi hết luồng; TASK.md thể hiện triệu chứng, đường lần từ stack trace vào code và các giả thuyết.

**C. Glossary và ADR.** Sửa skill; thêm cấu hình đường dẫn.

Đã quyết (D23): lưu trong **repo hồ sơ**. Không đụng tới cổng `files` của plan, và được chia sẻ cùng cách với hồ sơ ticket.

- Vị trí, tính từ `docsRepo`: `docs.glossaryPath` (mặc định `docs/GLOSSARY.md`) và `docs.adrPath` (mặc định `docs/adr`, mỗi quyết định một file `NNNN-<slug>.md`). Kết quả `status`/`doctor` trả hai đường dẫn này để skill không phải đoán. Nếu chúng nằm trong repo source thì phải được ignore, cùng quy tắc với thư mục hồ sơ ở mục 4.1.
- Đây là tài liệu dùng chung cho mọi ticket, là Markdown thường: agent sửa trực tiếp, helper không băm và không đưa vào record. Chúng được commit cùng lúc với hồ sơ ticket trong repo hồ sơ.
- Glossary chỉ chứa thuật ngữ nghiệp vụ: thuật ngữ, định nghĩa, các từ nên tránh, quan hệ giữa các thuật ngữ, và các chỗ mơ hồ đã được giải quyết. Không chứa chi tiết cài đặt hay quyết định kỹ thuật.
- ADR chỉ viết khi cả ba điều đúng: quyết định khó đảo ngược, gây ngạc nhiên nếu thiếu bối cảnh, và là kết quả của một đánh đổi thật. TASK.md hoặc PLAN.md của ticket trỏ tới ADR thay vì chép lại.
- `task-analyze` là nơi **chủ động** làm việc này: đối chiếu thuật ngữ trong yêu cầu với glossary, hỏi lại khi một từ đang mang hai nghĩa, cập nhật glossary ngay khi một thuật ngữ được chốt. Các skill khác chỉ **đọc** glossary để đặt tên trong plan, code, test và nội dung MR.
- Nghiệm thu: sau một ticket thử, glossary có thuật ngữ mới của ticket đó và worktree của repo source vẫn sạch.

**D. Bước nhìn lại (`task-retro`).** Skill mới; **không sửa helper**.

Đã quyết (D24): kết quả **chỉ là tài liệu**, không phải stage và không có record.

- Skill chạy theo yêu cầu của người dùng, sau khi review hoặc handoff, trong phiên vừa làm. Nó không đổi `state.json` và không ảnh hưởng tới bước tiếp theo mà `status` trả về.
- Đề xuất cải thiện **môi trường của agent**, xếp theo mức nghiêm trọng: lỗi máy móc (mẫu cú pháp, API bị cấm, vị trí file) → một check tự động hoặc Git hook; lỗi phán đoán → một quy tắc trong chuẩn code mà trục Chuẩn code của review dùng; tìm thông tin chậm → một dòng chỉ đường trong AGENTS.md; chỉ dẫn không làm đổi hành vi → đề xuất xóa.
- Ghi vào `RETRO.md` trong thư mục ticket, là Markdown thường do skill viết trực tiếp và được commit cùng hồ sơ. Skill chỉ đề xuất; việc sửa hook, chuẩn code hay skill là một thay đổi riêng do người quyết.
- Nghiệm thu: sau một ticket thử có `RETRO.md`; `status` của ticket không đổi trước và sau khi chạy.

**E. Bảng câu hỏi gửi người ngoài.** Chỉ sửa skill.

- Khi câu hỏi mở của TASK.md cần người không dùng agent trả lời (khách hàng, bộ phận khác), `task-sync`/`task-analyze` soạn một file câu hỏi: mục đích, bối cảnh một đoạn, câu quan trọng nhất trước, mỗi câu một ý kèm chỗ trả lời.
- File trả lời quay lại qua `sync <ticket> --file …` như một nguồn mới, nên đi qua cơ chế revision sẵn có.

### 13.5 Không đưa vào

| Thứ | Lý do |
|---|---|
| `implement-spec` (nhiều subagent, nhiều worktree, một integration branch) | Helper giả định một branch `feature/<ticket>` và một worktree cho mỗi ticket; fingerprint và lock không thiết kế cho nhiều worktree. |
| `to-spec`, `to-tickets`, `triage`, `wayfinder` ở dạng nguyên bản | Ghi spec/ticket lên tracker hoặc `.scratch/`, tạo nguồn sự thật thứ hai bên cạnh PLAN.md; gọi `gh`/`glab`, trái R2. Ý tưởng của `to-tickets` đã vào `steps`. |
| `implement` | Trùng vai với `task-implement` và tự commit không qua cổng. |
| `handoff` (tài liệu chuyển phiên) | Trùng tên gây nhầm với `task-handoff`; việc chuyển người đã có TASK/PLAN/CHECKS và `status`. |
| Cài nguyên plugin | Hai luồng cạnh tranh; nội dung chỉ dẫn tự cập nhật mà team không duyệt. |

### 13.6 Quy tắc khi lấy thêm từ bộ skill ngoài

- Lấy **ý tưởng và cấu trúc**, viết lại bằng tiếng Việt với ví dụ theo stack của team (Spring Boot, Vue.js); ghi nguồn và commit vào `.agents/CREDITS.md`.
- Nếu về sau cần copy nguyên một skill: chỉ copy skill kỹ thuật (loại model tự gọi), cố định theo một commit, giữ thông báo giấy phép, và kiểm ba điều trước khi đưa vào: (1) nó không ghi ra nơi lưu thứ hai; (2) nó không gọi `gh`/`glab`/push; (3) tên không trùng skill có sẵn của runtime (ví dụ Claude Code có sẵn một skill tên `code-review`).
- Mọi thứ lớp kỹ thuật sinh ra trong repo source trên feature branch phải nằm trong `files` của plan, nếu không `prepare` chặn.

### 13.7 Hoãn lại, chờ thực tế sử dụng

Theo R20, những ý dưới đây **không được làm** cho tới khi một dự án thật bị tắc vì thiếu chúng. Khi đó: ghi tình huống cụ thể vào mục 1, rồi mới đặc tả và làm.

**Xác nhận của người test (kiểm thủ công).**

- Dấu hiệu cần đến: một dự án thật có AC mà không check tự động nào chứng minh được, nên ticket đạt `verified`/`reviewed` chỉ nhờ build pass trong khi chưa ai test.
- Baseline xử lý thế nào: không có khái niệm kiểm thủ công. Mọi check là lệnh do helper chạy; kết quả test tự khai trong input bị thay bằng kết quả helper tự chạy; việc con người nghiệm thu nằm ngoài workflow (leader xem MR).
- Hướng làm khi cần, phỏng theo cách baseline ghi lời duyệt plan (`approve`): plan khai các check thủ công có ID; một hành động ghi xác nhận gồm người test, kết quả, nguyên văn lời xác nhận, lưu thành sự kiện bất biến; xác nhận gắn với nội dung code nên hết hiệu lực khi code đổi; một cổng chặn khi thiếu xác nhận.
- Còn phải quyết khi đó: ai test và vào lúc nào (developer trước khi tạo MR, hay QA sau khi lên môi trường test), vì điều đó quyết định cổng đặt trước `verified`, trước `handoff`, hay thành một trạng thái sau `handed-off`.
