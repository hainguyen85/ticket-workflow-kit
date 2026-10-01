# Bộ skill task-* — Kiến trúc và quy trình làm việc chung

> Tài liệu training và thống nhất workflow cho toàn bộ team dev.
> Nguồn chuẩn về schema/gate: [.agents/workflow/CONTRACT.md](workflow/CONTRACT.md). Nếu tài liệu này và CONTRACT khác nhau, CONTRACT và code helper trong [.agents/workflow/lib/](workflow/lib/) là đúng.

## Mục lục

1. [Tóm tắt trong 1 phút](#1-tóm-tắt-trong-1-phút)
2. [Nguyên tắc chung của team](#2-nguyên-tắc-chung-của-team)
3. [Kiến trúc](#3-kiến-trúc)
4. [Workflow từng bước](#4-workflow-từng-bước)
5. [Vai trò và trách nhiệm](#5-vai-trò-và-trách-nhiệm)
6. [Các tình huống đặc biệt](#6-các-tình-huống-đặc-biệt)
7. [Quy ước Git, MR và repo hồ sơ](#7-quy-ước-git-mr-và-repo-hồ-sơ)
8. [Onboarding: setup máy mới](#8-onboarding-setup-máy-mới)
9. [Cheat sheet lệnh](#9-cheat-sheet-lệnh)
10. [Lỗi thường gặp](#10-lỗi-thường-gặp)
11. [Checklist training](#11-checklist-training)

---

## 1. Tóm tắt trong 1 phút

Bộ skill gồm **6 bước cố định** để đưa một yêu cầu (file hoặc mô tả trong chat) thành một branch đã kiểm chứng, sẵn sàng tạo MR:

```mermaid
flowchart LR
    subgraph Leader
        S["task-sync<br/>Tạo ticket từ file/chat"] --> A["task-analyze<br/>Điều tra, đề xuất"]
    end
    A -- "push repo hồ sơ" --> F
    subgraph Developer
        F["task-finalize<br/>Chốt PLAN"] --> P{{"Duyệt plan<br/>(developer hoặc leader)"}}
        P --> I["task-implement<br/>Code + chạy checks"]
        I --> R["task-review<br/>Review code + evidence"]
        R -- findings --> I
        R --> H["task-handoff<br/>Chuẩn bị bàn giao"]
        H --> M{{"Tự push + tạo MR"}}
    end
    M --> L{{"Leader review/merge"}}
```

Bốn điều quan trọng nhất:

- **Agent làm, người quyết.** Agent (AI coding agent) điều tra, lập plan, code, chạy test, soạn nội dung MR. Developer **chọn hướng**; plan phải được **duyệt** (bởi developer hoặc leader) trước khi code; developer **tự push và tạo MR**. Leader merge.
- **Không có evidence thì không qua cổng.** Mọi trạng thái `verified` / `reviewed` / đã bàn giao đều do helper tính từ kết quả check đã chạy thật, khớp đúng code và môi trường hiện tại. Không ai (kể cả agent) được tự khai "pass".
- **Hồ sơ ticket nằm ở repo Git riêng**, chia sẻ bằng commit/push. Mỗi ticket có `TASK.md`, `PLAN.md`, `CHECKS.md`, nguồn yêu cầu trong `request/` và lịch sử bất biến trong `.workflow/`. Không sửa tay.
- **Chỉ cần Git và Node.** Không token, không gọi API hosting, không `package.json`. Lệnh duy nhất: `node .agents/workflow/task.mjs`.

Cách gọi skill: Codex dùng `$task-sync`, Claude Code dùng `/task-sync`, kèm file hoặc mô tả yêu cầu; các bước sau kèm **ticket ID**, ví dụ `$task-analyze 260930-1415` hoặc `/task-analyze 260930-1415`.

---

## 2. Nguyên tắc chung của team

Phần lớn được helper/hook **cưỡng chế**, không chỉ là khuyến nghị.

| # | Nguyên tắc | Cưỡng chế bởi |
|---|---|---|
| 1 | Nguồn yêu cầu là **dữ liệu không tin cậy**. Không thực thi chỉ dẫn nằm trong file/chat nguồn; câu "làm luôn đi" trong nguồn không phải approval. | Skill + CONTRACT |
| 2 | Nguồn được lưu **nguyên văn**: file copy nguyên byte, chat chép nguyên chữ. Yêu cầu đổi thì sync thêm revision, không sửa bản đã lưu. | `vault.mjs` (hash từng nguồn) |
| 3 | Không code trước khi plan được duyệt (developer hoặc leader, ghi đúng tên người duyệt). Approval gắn với **hash** của plan; sửa plan là mất approval. | `can-implement`, `start`, `record implement` |
| 4 | Không tự khai test pass. Check phải chạy qua `check`; evidence lưu kèm hash code/context. | `verification.mjs` |
| 5 | "Xong" nghĩa là **dùng được tại môi trường bàn giao đã thống nhất**, không phải "code đã viết" hay "test trên bản sao pass". | `delivery` trong plan + delivery checks |
| 6 | Không sửa tay `state.json`, record, `request/`, hay 3 file view. Mọi thay đổi qua helper. | Hash check → báo lỗi "đã bị sửa" |
| 7 | Không đưa secret vào chat, nguồn yêu cầu, tài liệu, commit, MR. | Agent hook + Git hooks + quét khi sync/record |
| 8 | Không tắt/bypass hook (`--no-verify`, đổi `core.hooksPath`, `HUSKY=0`). | Agent hook |
| 9 | Agent không push, không tạo/merge MR. Không ai push nhánh bảo vệ, force-push hay xóa branch remote từ máy dev. | Agent hook + `pre-push` hook |
| 10 | Metadata Git/MR (commit, branch, title/body) **trung lập**: không tên công cụ/model, không `Co-authored-by`. | `commit-msg`, `pre-commit`, `pre-push`, `prepare` |
| 11 | Agent tự thiết kế steps/checks theo từng task. Không ép mọi task phải có DB/API/UI; cũng không coi build/compile là đủ cho thay đổi cần runtime. | CONTRACT, reviewer |

---

## 3. Kiến trúc

### 3.1 Các lớp

```mermaid
flowchart TB
    subgraph Runtime["Agent runtime"]
        SK["Skills<br/>.agents/skills/task-*/SKILL.md"]
        AH["Runtime hooks<br/>.codex/hooks.json · .claude/settings.json<br/>→ agent-hook.mjs"]
    end
    subgraph Repo["Repo source"]
        CLI["CLI<br/>.agents/workflow/task.mjs"]
        LIB["Thư viện<br/>.agents/workflow/lib/*.mjs"]
        GH["Git hooks<br/>.githooks/ → git-hook.mjs"]
        CFG["workflow.config.json (commit)<br/>workflow.local.json (theo máy)"]
    end
    subgraph Docs["Repo hồ sơ (Git repo riêng)"]
        V["docs/tickets/&lt;key&gt;-&lt;slug&gt;/<br/>TASK · PLAN · CHECKS · request/ · .workflow/"]
    end
    REMOTE[("Git remote<br/>của repo source")]

    SK -- "gọi lệnh" --> CLI
    AH -. "chặn tool call nguy hiểm" .-> SK
    CLI --> LIB
    LIB -- "đọc" --> CFG
    LIB -- "ghi/đọc file" --> V
    LIB -- "fetch base, ls-remote<br/>(credential Git của dev)" --> REMOTE
    GH -- "kiểm commit/push" --> LIB
```

| Lớp | Vai trò | Không làm |
|---|---|---|
| **Skills** | Hướng dẫn agent phải làm gì ở mỗi bước, soạn nội dung tài liệu và JSON input. | Không tự ghi state, không tự quyết approval. |
| **CLI + thư viện** | Cổng duy nhất để sync, ghi stage, chạy check, chuẩn bị bàn giao. Kiểm mọi gate. | Không thiết kế steps/checks; không commit/push repo hồ sơ; không push/tạo MR. |
| **Repo hồ sơ** | Lưu nguồn yêu cầu, tài liệu, approval, evidence dạng bất biến + 3 view hiện hành. Chia sẻ qua Git. | Không được Git của repo source theo dõi. |
| **Guardrails** (runtime hooks + Git hooks) | Chặn lộ secret, bypass hook, agent push/tạo MR, metadata sai quy ước. | Không thay thế branch protection phía server. |

Việc helper liên tục ghi hồ sơ **không** được làm bẩn worktree hay ảnh hưởng tới fingerprint của code. Hồ sơ nằm ngoài repo source thì hiển nhiên đạt; đặt **trong** repo source cũng được, miễn thư mục đó có trong `.gitignore` của repo source (helper kiểm điều này khi nạp cấu hình).

### 3.2 Bản đồ file

| Thành phần | File | Chức năng chính |
|---|---|---|
| CLI | [task.mjs](workflow/task.mjs) | `setup`, `doctor`, `list`, `sync`, `status`, `record`, `can-implement`, `start`, `check`, `prepare`, `handoff` |
| Cấu hình | [config.mjs](workflow/lib/config.mjs) | Đọc config, vị trí repo hồ sơ, quy tắc key/slug, redaction |
| Nguồn yêu cầu | [source.mjs](workflow/lib/source.mjs) | Đọc/kiểm file và chat nguồn |
| Hồ sơ | [vault.mjs](workflow/lib/vault.mjs), [document-history.mjs](workflow/lib/document-history.mjs) | Thư mục ticket, `request/`, manifest, lock, revision, lịch sử tài liệu |
| Stage & gate | [stages.mjs](workflow/lib/stages.mjs) | Ghi record bất biến, approval, vô hiệu hóa stage phía sau |
| Kiểm chứng | [verification.mjs](workflow/lib/verification.mjs), [command.mjs](workflow/lib/command.mjs) | Validate plan, chạy check (kể cả `.cmd`/`.bat` trên Windows), khóa evidence |
| Điều phối | [dispatch.mjs](workflow/lib/dispatch.mjs) | Trả về **một** bước tiếp theo + lý do |
| View | [views.mjs](workflow/lib/views.mjs) | Dựng `TASK.md` / `PLAN.md` / `CHECKS.md` từ records |
| Bàn giao | [handoff.mjs](workflow/lib/handoff.mjs) | Prepare; xác minh HEAD trên remote sau khi developer push |
| Policy | [policy.mjs](workflow/lib/policy.mjs) | Phát hiện secret, metadata cấm, quy tắc branch, luật hook |
| Hook adapter | [agent-hook.mjs](workflow/lib/agent-hook.mjs), [git-hook.mjs](workflow/lib/git-hook.mjs), [setup-hooks.mjs](workflow/lib/setup-hooks.mjs) | Nối policy vào runtime hooks và Git hooks |
| Skill cho Claude Code | [skill-links.mjs](workflow/lib/skill-links.mjs) | Liên kết `.claude/skills/task-*` tới bản duy nhất trong `.agents/skills` |

### 3.3 Ticket ID

```text
<key>-<slug>        ví dụ: 260930-1415-note-search   |   PRJ-123-note-search
```

- **key**: nếu nguồn yêu cầu mang mã từ hệ thống ngoài (Jira, Redmine…) thì dùng mã đó; nếu không, helper tạo từ thời điểm tạo ticket `YYMMDD-HHMM` (giờ local). Trùng phút thì lấy phút kế tiếp.
- **slug**: agent tự đặt, 2–6 từ ASCII chữ thường nối bằng `-`, mô tả nội dung chính.
- Mọi lệnh nhận ID đầy đủ hoặc chỉ key (khi key xác định đúng một ticket).

### 3.4 Hồ sơ ticket

```text
<docsRepo>/docs/tickets/<key>-<slug>/
├── TASK.md        # Yêu cầu, hiện trạng, phương án, quyết định, bước tiếp theo
├── PLAN.md        # AC, phương án đã chọn, steps, checks, delivery, approval
├── CHECKS.md      # Tiến độ thực, kết quả check, findings, trạng thái bàn giao
├── request/
│   ├── r1/        # Nguồn lúc tạo ticket: file gốc (giữ tên) và/hoặc chat.md
│   └── r2/        # CR: nguồn bổ sung/thay thế
└── .workflow/
    ├── state.json                     # Commit point của toàn bộ hồ sơ
    ├── sync/<hash>.json               # Manifest nguồn (tên, loại, SHA-256) theo revision
    ├── <stage>/<event-id>/record.json # Record bất biến của từng lần ghi stage
    ├── evidence/<run-id>.json + .log  # Kết quả check thật (đã redaction)
    └── observations/<event-id>.json   # Facts môi trường đã probe
```

Điểm cần nhớ:

- **`request/` là bản lưu yêu cầu.** File được copy nguyên byte vào hồ sơ (không chỉ ghi đường dẫn), vì file gốc có thể đổi/mất và người khác trong team không thấy được. Chat được lưu thành `chat.md`. Plan được duyệt dựa trên đúng các byte này.
- **File trùng tên ở revision sau thay thế file cũ** (bản cũ vẫn nằm trong `request/` làm lịch sử); **mỗi `chat.md` là bổ sung**, không thay thế chat trước.
- **3 file `.md` ở root là view**, được helper dựng lại từ records. Sửa tay sẽ bị phát hiện qua hash.
- **Mỗi tài liệu có version riêng.** Intake/analysis tăng version TASK; finalize tăng version PLAN; checkpoint/implement/review/handoff tăng version CHECKS. Approval và chạy check **không** tăng version PLAN.
- **Mỗi lần ghi phải kèm `change: {summary, reason}`**; helper tự ghi author (Git identity của người chạy lệnh), thời điểm, version, changelog. Leader và developer ghi vào cùng một hồ sơ thì mỗi bản ghi mang đúng tên người ghi.
- **Helper không commit/push repo hồ sơ.** Xem [mục 7](#7-quy-ước-git-mr-và-repo-hồ-sơ).

### 3.5 State machine và dispatcher

| Stage | Status có thể có |
|---|---|
| intake, analysis, finalize | `not-started` → `complete` · `needs-revalidation` |
| implement | `in-progress` / `blocked` (checkpoint) → `verified` · `needs-revalidation` |
| review | `changes-requested` → `reviewed` · `needs-revalidation` |
| handoff | `prepared` → `complete` · `needs-revalidation` |

Quy tắc lan truyền: **ghi lại một stage thì mọi stage phía sau chuyển `needs-revalidation`**. Ghi lại intake/analysis/finalize còn **xóa approval**. Ghi `observe` với context mới làm implement/review/handoff phải kiểm lại. Sync có nguồn mới làm **mọi** stage phải kiểm lại.

`node .agents/workflow/task.mjs status <ticket>` gọi dispatcher, luôn trả **một** bước tiếp theo:

```mermaid
flowchart TD
    A{"intake / analysis / finalize<br/>complete ở revision hiện tại?"} -- chưa --> A1["sync / analysis / finalize"]
    A -- rồi --> B{"Plan có requiredChecks<br/>và delivery hợp lệ?"}
    B -- không --> B1["finalize"]
    B -- có --> C{"Approval khớp hash plan<br/>và revision hiện tại?"}
    C -- không --> C1["approve (developer)"]
    C -- có --> D{"Worktree sạch và mọi<br/>required check pass, còn hiệu lực?"}
    D -- không --> D1["implement"]
    D -- có --> E{"Review đang changes-requested?"}
    E -- có --> E1["implement"]
    E -- không --> F{"implement verified<br/>đúng HEAD?"}
    F -- không --> F1["implement"]
    F -- có --> G{"review reviewed<br/>đúng HEAD?"}
    G -- không --> G1["review"]
    G -- có --> H{"handoff complete<br/>đúng HEAD?"}
    H -- có --> H1["handed-off"]
    H -- không --> H2["handoff<br/>(prepare, hoặc chờ developer push)"]
```

**Khi nhận ticket từ người khác hoặc resume sau khi nghỉ, luôn bắt đầu bằng `status`**, không đoán từ trí nhớ.

### 3.6 Verification: evidence là gì, khi nào hết hiệu lực

`node .agents/workflow/task.mjs check <ticket> <check-id>`:

1. Chỉ chạy check có trong **plan đã duyệt** (đúng ID, đúng argv, không qua shell).
2. Lấy fingerprint nội dung code trước và sau khi chạy. Check làm **thay đổi source** thì bị tính `fail`.
3. Timeout mặc định 600 giây (cấu hình được; mỗi check có thể đặt `timeoutSeconds` riêng). Quá hạn thì kill cả cây process và tính `fail`.
4. Với delivery check, runner cấp biến `WORKFLOW_CHECK_TARGET` và `WORKFLOW_DELIVERY_IDENTITY` để script đối chiếu đúng môi trường bàn giao.
5. Lưu evidence: kết quả, exit code, log (đã redaction), hash plan, hash requirement, fingerprint code, hash context.

Lưu ý cho dự án Java trên Windows:

- Viết lệnh dạng argv: `["mvn","-q","-Dtest=NoteSearchServiceTest","test"]`, `["gradlew.bat","test"]`. Runner tự tìm `mvn.cmd`/`gradlew.bat`.
- Tham số chứa `" % ! ^ & | < >` không dùng được với file `.cmd`/`.bat`: đưa lệnh vào một script riêng trong repo.
- `target/`, `build/` phải nằm trong `.gitignore`. Fingerprint tính cả file untracked chưa bị ignore, nên build output không bị ignore sẽ làm check fail vì "đổi source".
- Fingerprint tính theo nội dung Git sẽ commit, nên việc Git đổi LF↔CRLF khi checkout (`core.autocrlf`) không làm evidence bị cũ.

Evidence **bị coi là cũ (stale)** khi:

| Thay đổi | Hệ quả |
|---|---|
| Nội dung code đổi | Check phải chạy lại. (Commit thêm mà nội dung y hệt thì vẫn giữ.) |
| Plan đổi (finalize lại) | Mất approval, mọi evidence phải chạy lại sau khi duyệt lại. |
| Context môi trường đổi (`observe` mới) | implement/review/handoff → `needs-revalidation`. |
| Yêu cầu đổi (sync có nguồn mới) | Mọi stage → `needs-revalidation`. |
| Evidence/log bị sửa tay | Báo "đã bị sửa", chặn gate. |

> Helper chứng minh **command đã chạy và evidence còn khớp**. Helper **không** chứng minh test viết đúng nghiệp vụ. Đó là việc của reviewer.

### 3.7 Guardrails

**Runtime hooks** chạy trước mỗi prompt và mỗi tool call của agent. Codex đọc `.codex/hooks.json`, Claude Code đọc `.claude/settings.json`; cả hai gọi cùng một `agent-hook.mjs` nên luật giống hệt nhau. Chặn khi:

| Tình huống | Thông báo (tóm tắt) |
|---|---|
| Prompt chứa mẫu token/key | Không gửi key qua chat; nếu là key thật, thu hồi và tạo lại. |
| Tool đọc/ghi `.env*` (trừ `.example`), `.ssh/`, `id_rsa`, `credentials.json`, `auth.json` | Người dùng tự sửa env bằng editor. |
| Dump biến môi trường (`printenv`, `env`, `process.env`, `Get-ChildItem Env:`) | Không dump env vào output. |
| `--no-verify`, `core.hooksPath`, `HUSKY=0` | Không tắt/đổi hooks khi làm ticket. |
| `git push` (ở bất kỳ repo nào), `gh pr create/merge`, `glab mr create/merge` | Agent không push/tạo MR; developer tự làm. |

Các luật về **lệnh** (dump env, tắt hooks, push/MR) áp cho tool chạy lệnh. Khi agent **ghi file** (Write/Edit), hook chỉ xét đường dẫn đích và quét secret trong nội dung, nên agent vẫn soạn được tài liệu có nhắc tới những lệnh nó không được chạy.

Runtime hook **chỉ hoạt động sau khi developer trust** trong runtime (Codex: lệnh `/hooks`; Claude Code: trust thư mục project, xem bằng `/hooks`). Clone repo hay chạy setup không tự trust.

**Git hooks** (`.githooks/`, bật bằng `setup`):

| Hook | Kiểm tra |
|---|---|
| `pre-commit` | Tên branch, author/committer trung lập; không commit file `.env*` (trừ `.example`), private key, nội dung chứa secret. |
| `commit-msg` | Conventional Commits (`feat|fix|refactor|test|docs|chore|perf|build|ci`), không attribution/tên công cụ. |
| `pre-push` | Chỉ push `feature/*`, không push nhánh bảo vệ, không xóa branch remote, không rewrite lịch sử, tối đa 200 commit, quét lại metadata và secret từng commit. |

Git hooks áp dụng cho **mọi** commit/push trong repo source, kể cả khi developer thao tác tay. Hooks local **không thay thế** branch protection trên server Git.

---

## 4. Workflow từng bước

Mọi skill (trừ sync khi tạo ticket mới) bắt đầu bằng `status <ticket>` để xác nhận đúng ticket, đọc state/view hiện hành. Chỉ đọc context vừa đủ, không nạp lại toàn bộ lịch sử.

Và kết thúc giống nhau, bằng một báo cáo gồm: **đã làm gì · phát hiện chính · trạng thái thật · tài liệu hiện hành · bước tiếp theo**; rồi commit phần hồ sơ của ticket trong repo hồ sơ (không push).

### 4.1 `task-sync`: Tạo ticket hoặc nhận CR

| | |
|---|---|
| **Người chạy** | Leader. |
| **Nguồn** | File người dùng chỉ định (docx, pdf, md, ảnh…) và/hoặc mô tả viết trực tiếp trong chat. |
| **Ticket mới** | `sync --title "<tiêu đề>" --slug <slug> [--key <mã ngoài>] [--file <path>]… [--chat <path>]` |
| **CR** | `sync <ticket> [--file <path>]… [--chat <path>]` → revision mới, mọi stage `needs-revalidation`. |
| **Output** | `request/r<N>/…`, và `TASK.md` (intake): tóm tắt yêu cầu tiếng Việt theo từng source ID (`r1/spec.docx`, `r2/chat.md`), delta so với revision trước, câu hỏi mở. |
| **Gate** | `translatedSourceIds` phải phủ **đúng** các nguồn hiện hành. |
| **Không làm** | Không chọn phương án, không lập plan, không code. Không tạo ticket mới cho yêu cầu thuộc ticket đã có. |

Với nguồn chat, agent chép **nguyên văn** phần yêu cầu vào `.workflow-tmp/request.md` rồi mới sync. Helper không đọc được khung chat, nên agent phải trích lại nội dung đã lưu để người dùng xác nhận.

Sync lại cùng nội dung không tạo revision. Giới hạn: 20 file/lần, mỗi file dưới 20 MB, chat dưới 1 MB; nguồn text chứa mẫu secret bị từ chối.

### 4.2 `task-analyze`: Điều tra và đề xuất

| | |
|---|---|
| **Người chạy** | Leader. |
| **Mục tiêu** | Hiểu hiện trạng, khoảng cách so với yêu cầu, rủi ro và cách verify; đề xuất phương án. |
| **Output** | `TASK.md` (analysis) + danh sách `observations` với status `observed` / `inferred` / `unknown`. `observed` bắt buộc có evidence. |
| **Nội dung cần có** | Hiện trạng người dùng đang dùng; target bàn giao (runtime hay artifact); đường đi từ hiện trạng tới dùng được (chuẩn bị, dữ liệu, cấu hình, phụ thuộc); phân biệt môi trường test với môi trường bàn giao; security theo trust boundary thực của task. |
| **Phương án** | Đủ đánh đổi để quyết định. Một hướng rõ ràng + lựa chọn thay thế ngắn là đủ. |
| **Không làm** | Không sửa code. Không chạy thao tác phá hủy dữ liệu. Chỉ hỏi những **quyết định** còn thiếu; dữ kiện thu thập được thì tự điều tra. |

Người lập plan thường không phải người phân tích, nên **TASK.md phải tự đủ**: developer đọc là lập được plan, không cần hỏi lại bối cảnh.

**Bàn giao ticket:** leader commit + push repo hồ sơ, báo ticket ID cho developer.

### 4.3 `task-finalize`: Chốt PLAN

| | |
|---|---|
| **Người chạy** | Developer nhận ticket (pull repo hồ sơ trước). |
| **Mục tiêu** | Biến hướng đã chọn thành plan có thể kiểm chứng. |
| **Output** | `PLAN.md` + JSON gồm `decision`, `files`, `risks`, `requiredFacts`, `requiredChecks`, `steps`, `delivery`. |
| **Gate của helper** | Mọi `requiredFacts` phải đã `observed`; `requiredChecks` không rỗng, ID duy nhất, có `kind`/`ac`/`command` argv; mọi check thuộc ít nhất một step; steps không có dependency lạ hay vòng lặp; risk `high`/`critical` phải có mitigation; `delivery` đầy đủ. |

Nếu analysis còn thiếu fact cần cho plan, quay lại Analyze (developer cũng chạy được), không đoán.

`delivery` là phần hay bị làm thiếu nhất:

| Trường | Ý nghĩa |
|---|---|
| `kind` | `runtime` (chức năng chạy) hoặc `artifact` (tài liệu, thư viện, file). |
| `target` | URL/path/định danh cụ thể của nơi bàn giao, không chứa secret. |
| `preparation` | Việc cần làm để target dùng được (migration, seed, cấu hình…), hoặc lý do không cần. |
| `permissions` | Phạm vi quyền được phép (chạy server local, reset DB tạm…). |
| `recovery` | Cách phục hồi nếu hỏng. |
| `checks` | Các required check nghiệm thu **tại chính target**; `target` của các check đó phải trùng `delivery.target`. |

Nguyên tắc chốt plan:

- Chức năng chạy local → mặc định "xong" là **dùng được trên local đã thống nhất**, không mặc định deploy remote.
- Test trên bản sao/fixture là lớp kiểm **bổ sung**, không thay nghiệm thu tại target.
- Có smoke test tình huống người dùng trên **dữ liệu/trạng thái hiện hữu** khi liên quan.
- `files` phải liệt kê đủ file sẽ đổi: lúc bàn giao, file nằm ngoài danh sách này sẽ bị chặn.
- Thiếu quyền để hoàn thành bước nào thì nói rõ **trước khi duyệt**.

**Điểm dừng để duyệt:** người có thẩm quyền — developer hoặc leader — đọc PLAN.md và **duyệt bằng lời rõ ràng** (ví dụ "Duyệt plan v2"). Nếu leader duyệt, developer chuyển nguyên văn lời duyệt cho agent và `approvedBy` ghi tên leader. Agent ghi `approve` với `approvedBy` và `evidence` là chính lời duyệt đó. Đã duyệt thì agent không hỏi lại; cũng không tự tạo approval.

### 4.4 `task-implement`: Code và kiểm chứng

| | |
|---|---|
| **Mục tiêu** | Thực hiện plan đã duyệt, tự kiểm/sửa trong scope, commit local, đạt `verified`. |
| **Bắt đầu** | `can-implement <ticket>` → `start <ticket>` tạo/resume branch `feature/<key>-<slug>` từ base mới nhất. |
| **Trong khi làm** | Làm theo steps trong plan. Probe môi trường thật và `record observe` khi task cần. Chạy từng check bằng `check`. Lỗi trong scope: tự chẩn đoán, sửa, chạy lại. |
| **Checkpoint** | Cần tạm dừng hoặc bị chặn: `record checkpoint` (cho phép worktree dirty, status `in-progress`/`blocked`), ghi phần đã làm, phần còn lại, bước tiếp. |
| **Delivery** | Sau kiểm thử cô lập: chuẩn bị target bàn giao (trong quyền đã duyệt), probe và `observe` `deliveryTarget` + `deliveryIdentity`, rồi chạy delivery checks tại đó. |
| **Hoàn tất** | Soát diff/metadata → commit (Conventional Commits) → worktree sạch → đủ evidence → `record implement` → helper ghi `verified`. |
| **Không làm** | Không push, không tạo MR. Không tự điền pass. Không đổi scope; cần đổi thì trình delta, quay về Finalize. Không thay target bằng server/fixture riêng rồi xóa đi sau test. |

Báo cáo cuối Implement phải nói **nơi sử dụng** và **kết quả smoke thực tế**, kèm những phần chưa kiểm được (nếu có).

### 4.5 `task-review`: Review độc lập

| | |
|---|---|
| **Mục tiêu** | Kiểm code **và** evidence trên đúng phiên bản (HEAD) đã implement. |
| **Đọc gì** | Plan/AC, **diff và code liên quan**, evidence. Không chỉ đọc summary của người implement. |
| **Kiểm gì** | Assertion có thật sự chứng minh AC không; `kind`/target của check đúng không; có dùng mock thay DB/API/browser khi AC cần lớp đó không; security, data lifecycle, tương thích. Plan có đủ cho kết quả người dùng cần không. Target bàn giao đã thật sự dùng được chưa. |
| **Có findings** | `record review-findings` với findings `open` → status `changes-requested` → quay lại Implement. Sai scope → quay Finalize. |
| **Pass** | Mọi findings `resolved`, evidence còn hiệu lực, implement đúng HEAD → `record review` với `verdict: "pass"` → `reviewed`. |

> Review **không phải** bước chuẩn bị môi trường còn thiếu. Target chưa sẵn sàng là một finding.
> `reviewed` là review nội bộ trong workflow, **chưa phải** leader acceptance.

### 4.6 `task-handoff`: Bàn giao

```mermaid
sequenceDiagram
    participant A as Agent
    participant H as Helper
    participant D as Developer
    participant R as Git remote
    A->>H: prepare <ticket> mr.json
    H-->>A: handoff.md (lệnh push + nội dung MR), status prepared
    A->>D: Đưa lệnh push và nội dung MR
    D->>R: git push -u origin feature/<ticket>
    D->>R: Tạo MR (thủ công)
    D->>A: Đã push, URL MR là …
    A->>H: handoff <ticket> [mr-url]
    H->>R: ls-remote (đối chiếu HEAD)
    H-->>A: complete, hoặc từ chối nếu chưa khớp
```

| | |
|---|---|
| **Prepare** | `prepare <ticket> .workflow-tmp/mr.json`. Helper kiểm: review đúng HEAD/branch; base là ancestor của HEAD; **mọi file trong diff nằm trong `files` của plan**; metadata và nội dung từng commit không có secret/attribution; body MR có `Refs <key>`. Ghi `handoff.md`. |
| **Developer** | Tự chạy lệnh push được in ra và tự tạo MR vào base branch, dùng title/body trong `handoff.md`. |
| **Ghi nhận** | `handoff <ticket> [mr-url]`. Helper đối chiếu HEAD của branch trên remote với code đã review. Khớp → `complete`. Chưa khớp, hoặc không kết nối được remote → từ chối, trạng thái vẫn `prepared`. |
| **Nội dung MR** | Behavior thay đổi, validation thật (phân biệt local/mock/live), bước vận hành và giới hạn. Không metrics RTK, không secret, không từ khóa tự đóng issue (`Fixes #…`). |
| **Giới hạn** | URL MR do developer cung cấp; helper không đọc được nội dung MR trên hệ thống hosting. |

---

## 5. Vai trò và trách nhiệm

| Bước | Agent | Leader | Developer |
|---|---|---|---|
| Sync | Lưu nguồn, tóm tắt | **Cung cấp nguồn**, xác nhận nội dung đã lưu | – |
| Analyze | Điều tra, đề xuất | Trả lời câu hỏi quyết định, **push repo hồ sơ** | – |
| Finalize | Soạn plan, checks, delivery | Tư vấn scope; **duyệt plan** nếu team giao leader duyệt | **Chọn hướng**; **duyệt plan** nếu developer tự duyệt |
| Implement | Code, chạy checks, commit | – | Theo dõi, cấp quyền/môi trường nếu plan nêu |
| Review | Review code + evidence | – | Đọc findings, quyết định khi đổi scope |
| Handoff | Prepare, ghi nhận | **Review MR, merge** | **Push, tạo MR** |

Helper không ép vai trò: nó chỉ ghi đúng tên người chạy lệnh vào từng bản ghi. Developer chịu trách nhiệm cuối cùng cho những gì mình duyệt và push; "agent đã làm" không phải lý do để bỏ qua việc đọc plan và diff.

---

## 6. Các tình huống đặc biệt

### 6.1 Yêu cầu thay đổi giữa chừng (Change Request)

1. Leader (hoặc người đang giữ ticket) chạy `task-sync` với ticket ID và nguồn mới. Helper lưu vào `request/r<N>`, **giữ nguyên nguồn cũ**, tăng `revision`, chuyển mọi stage sang `needs-revalidation`.
2. `task-analyze` chỉ phân tích **delta** và ảnh hưởng, giữ lịch sử.
3. `task-finalize` chỉ rõ phần plan thay đổi cần quyết định; developer duyệt lại.

CR **không tự động** là quyền implement. Nếu developer đang làm dở, pull repo hồ sơ rồi `status` sẽ báo quay về `sync`/`analysis`.

### 6.2 Review có findings

Review → `review-findings` (findings `open`) → Implement sửa → chạy lại checks bị ảnh hưởng → `record implement` đúng HEAD mới → Review lại phần bị ảnh hưởng → `review` pass (findings `resolved`).

### 6.3 Bị chặn (thiếu quyền, target chưa sẵn sàng, delivery check fail)

`record checkpoint` với `blocker`. Ghi rõ đã làm gì, còn gì, cần ai làm gì. **Không** giảm scope hay đổi target sang fixture để vượt gate.

### 6.4 Môi trường thay đổi (DB, server, config)

Helper **không tự phát hiện** thay đổi ngoài repo. Khi môi trường đổi: probe lại, `record observe` context mới → implement/review/handoff chuyển `needs-revalidation` → chạy lại checks liên quan.

### 6.5 Nhận ticket từ người khác / resume

Pull repo hồ sơ → `status <ticket>` → làm đúng bước được trả về. Đọc 3 view hiện hành, không đọc toàn bộ lịch sử. Evidence gắn với nội dung code, không gắn với máy: máy khác có cùng nội dung code thì evidence vẫn hợp lệ; nội dung khác thì chạy lại check.

### 6.6 Base branch có commit mới trước khi bàn giao

`prepare` báo "Base branch đã có commit mà feature chưa chứa". Cập nhật branch (merge/rebase base), chạy lại checks, `record implement`, review lại, rồi prepare. Không force-push branch đã push.

### 6.7 State hỏng, lock kẹt, sync bị ngắt

- State/manifest/`request/` hỏng hoặc sai hash → helper dừng, **không reset**. Phục hồi bằng Git của repo hồ sơ.
- `.workflow-lock` còn lại do process bị ngắt → chỉ xóa sau khi chắc chắn không còn process nào đang ghi ticket đó.
- `request/r<N>` tồn tại mà state chưa ghi nhận → kiểm và xóa thư mục đó thủ công rồi sync lại.

---

## 7. Quy ước Git, MR và repo hồ sơ

### Branch (repo source)

```text
feature/<key>-<slug>          ví dụ: feature/260930-1415-note-search
```

Tạo bằng `start <ticket>` lúc bắt đầu implement, không tạo tay.

### Commit (repo source)

- Conventional Commits: `feat|fix|refactor|test|docs|chore|perf|build|ci`, scope tùy chọn: `feat(search): lọc theo danh mục`.
- Dùng đúng Git identity đã cấu hình trên máy.
- **Không** có tên công cụ/model (`claude`, `codex`, `copilot`, `gpt-…`), chữ viết tắt `AI` đứng riêng, `Co-authored-by`, "generated by", "AI-assisted". Từ "ai" thường trong câu tiếng Việt ("cho phép ai cũng xem được") thì dùng bình thường.

### Merge Request

- Developer tự tạo. Tham chiếu ticket bằng `Refs <key>`; **không** dùng `Fixes/Closes/Resolves #<id>`.
- Nội dung lấy từ `handoff.md`: behavior thay đổi, validation thật (ghi rõ local/mock/live), bước vận hành, giới hạn đã biết.
- File trong MR phải nằm trong danh sách `files` của plan đã duyệt. Cần đụng file ngoài plan → quay Finalize.

### Repo hồ sơ

- Helper chỉ ghi file. **Commit sau mỗi bước** phần hồ sơ của ticket (`docs(ticket): <ticket> <bước>`); agent có thể commit, **người dùng push**.
- **Pull trước khi làm** một ticket nhận từ người khác.
- **Một ticket chỉ ghi từ một máy tại một thời điểm.** `state.json` không merge được; nếu hai người cùng ghi, Git sẽ báo conflict và phải bỏ một bên.
- Commit **toàn bộ** thư mục ticket, kể cả `.workflow/` và log evidence: thiếu chúng thì người khác không kiểm lại được gate.
- Hồ sơ chứa nguồn yêu cầu và log check. Redaction secret chỉ là best effort; **quyền đọc repo hồ sơ quyết định ai xem được**.

---

## 8. Onboarding: setup máy mới

**Cần có:** Git; Node.js 22.12+ (nhánh 22) hoặc 24+; một checkout của repo hồ sơ (thường **ngoài repo source**; đặt bên trong thì phải được repo source ignore). Không cần `package.json`, không cần cài dependency, không cần token.

`T` dưới đây là `node .agents/workflow/task.mjs`, chạy ở root repo source.

| Bước | Việc làm |
|---|---|
| 1 | Clone repo hồ sơ ra thư mục riêng, ví dụ `D:/Workspace/team-docs`. |
| 2 | `T setup`: tạo `.agents/workflow.local.json` nếu thiếu, bật Git hooks (`core.hooksPath=.githooks`), liên kết skills vào `.claude/skills/` cho Claude Code. |
| 3 | Mở `.agents/workflow.local.json`, điền `docsRepo` bằng đường dẫn tuyệt đối tới checkout ở bước 1. |
| 4 | `T doctor`: kiểm Git identity, quyền ghi hồ sơ, hooks, `.gitignore`, base ref. |
| 5 | Bật runtime hooks. Codex: `/hooks` → review/trust hai hooks. Claude Code: trust thư mục project, `/hooks` hiển thị hai hooks từ `.claude/settings.json`. Mở session mới và thử một lệnh bị chặn để kiểm tra. |
| 6 | `T list` và `T status <ticket>` với một ticket có sẵn. |

Cấu hình dùng chung của dự án nằm trong `.agents/workflow.config.json` (đã commit): remote, base branch, nhánh bảo vệ, thư mục ticket, timeout mặc định của check. Chi tiết: [WORKFLOW_SETUP.md](../WORKFLOW_SETUP.md).

---

## 9. Cheat sheet lệnh

| Việc | Lệnh (`T` = `node .agents/workflow/task.mjs`) |
|---|---|
| Setup / kiểm môi trường | `T setup` · `T doctor` |
| Liệt kê ticket | `T list` |
| Tạo ticket | `T sync --title "<tiêu đề>" --slug <slug> [--key <key>] [--file <path>]… [--chat <path>]` |
| CR | `T sync <ticket> [--file <path>]… [--chat <path>]` |
| Trạng thái + bước tiếp theo | `T status <ticket>` |
| Ghi stage | `T record <ticket> <stage> .workflow-tmp/input.json` |
| Kiểm approval | `T can-implement <ticket>` |
| Tạo/resume branch | `T start <ticket>` |
| Chạy check | `T check <ticket> <check-id>` |
| Chuẩn bị bàn giao | `T prepare <ticket> .workflow-tmp/mr.json` |
| Ghi nhận sau khi push | `T handoff <ticket> [mr-url]` |
| Test bộ helper | `node --test ".agents/workflow/tests/*.test.mjs"` |

Các `<stage>` hợp lệ cho `record`: `intake`, `analysis`, `finalize`, `approve`, `observe`, `checkpoint`, `implement`, `review-findings`, `review`. JSON input do skill soạn; developer không cần nhớ schema. Input dưới 1 MB và không chứa secret.

---

## 10. Lỗi thường gặp

| Thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| Không tìm thấy hồ sơ ticket | Sai ID, hoặc chưa pull repo hồ sơ | `T list`; pull repo hồ sơ |
| Ticket key khớp nhiều hồ sơ | Key chưa đủ để xác định | Dùng ID đầy đủ `<key>-<slug>` |
| Thư mục hồ sơ nằm trong repo source thì phải được thêm vào .gitignore | Hồ sơ đặt trong repo source nhưng chưa bị ignore | Thêm thư mục đó vào `.gitignore` của repo source, hoặc đặt repo hồ sơ ra ngoài |
| Nguồn yêu cầu trong request/ đã bị sửa hoặc thiếu | Có người sửa/xóa file trong `request/` | Phục hồi bằng Git của repo hồ sơ |
| request/r\<N\> đã tồn tại nhưng chưa được state ghi nhận | Lần sync trước bị ngắt | Kiểm, xóa thư mục đó, sync lại |
| Bản tóm tắt phải đối chiếu đủ từng nguồn hiện hành | `translatedSourceIds` thiếu/thừa | Dùng đúng `sourceIds` mà `status` trả về |
| Chưa có approval đúng source/spec hiện tại | Plan mới/sửa hoặc yêu cầu đổi sau khi duyệt | Đọc PLAN hiện hành và duyệt lại |
| Artifact đã bị sửa sau khi ghi nhận / Tài liệu đã đổi ngoài stage helper | Có người sửa tay file trong hồ sơ | Không sửa tay; ghi lại stage qua helper |
| Fact `<id>` chưa observed; điều tra trước Finalize | `requiredFacts` chưa có observation có evidence | Quay Analyze điều tra fact đó |
| Finalize còn risk high/critical chưa có mitigation | Risk nghiêm trọng thiếu biện pháp | Bổ sung mitigation hoặc đổi phương án |
| Cần observe deliveryTarget và deliveryIdentity… | Chạy delivery check trước khi probe target | Chuẩn bị target, `record observe`, rồi chạy check |
| Required check `<id>` chưa chạy qua helper | Chưa chạy check | `T check <ticket> <check-id>` |
| Required check `<id>` fail hoặc evidence đã cũ | Check fail/timeout, hoặc code/context đổi sau khi chạy | Xem log trong `.workflow/evidence/`, sửa, chạy lại check |
| Check gọi file .cmd/.bat với tham số chứa ký tự đặc biệt | Tham số có `" % ! ^ & | < >` | Bọc lệnh trong một script riêng trong repo |
| Check ID không nằm trong plan đã duyệt | Check mới chưa có trong plan | Thêm vào plan qua Finalize và duyệt lại |
| Working tree phải sạch trước review/handoff | Còn file chưa commit (thường là build output chưa ignore) | Commit, hoặc thêm thư mục build vào `.gitignore` |
| Code khác revision implement đã kiểm tra | Có commit mới sau `record implement` | Chạy lại checks, `record implement`, rồi review |
| Branch phải theo mẫu `feature/<key>-<slug>` | Làm việc trên branch tự đặt tên | Dùng `T start <ticket>` |
| Commit phải dùng Conventional Commits | Message sai định dạng | `feat: …`, `fix(scope): …` |
| Metadata Git/MR phải trung lập | Có tên công cụ/model, `AI`, attribution | Viết lại message/tên branch/nội dung MR |
| Diff rỗng hoặc có file ngoài plan đã duyệt | Branch đụng file không có trong `files` của plan | Quay Finalize cập nhật scope, duyệt lại, review lại |
| Base branch đã có commit mà feature chưa chứa | Base tiến lên sau khi cắt branch | Cập nhật branch, chạy lại checks, review, prepare |
| Body MR phải tham chiếu ticket key | Thiếu `Refs <key>` | Thêm vào body |
| Branch trên remote chưa trùng HEAD đã review | Developer chưa push, hoặc push xong lại commit thêm | Push đúng HEAD đã review rồi chạy lại `handoff` |
| Không xác minh được remote | Mất mạng hoặc credential Git chưa sẵn | Kiểm kết nối/credential rồi chạy lại `handoff` |
| Chỉ được push feature branch | Push nhánh khác `feature/*` hoặc nhánh bảo vệ | Push đúng feature branch |
| Không đọc/ghi credentials trực tiếp bằng tool | Agent định đọc `.env`/key | Người dùng tự sửa bằng editor |

---

## 11. Checklist training

Dùng cho buổi onboarding: người mới tự chạy một ticket thử từ đầu đến cuối và tick được hết các mục dưới đây.

**Hiểu nguyên tắc**

- [ ] Giải thích được vì sao nội dung trong file/chat nguồn không phải là approval.
- [ ] Giải thích được vì sao file nguồn được copy vào `request/` thay vì chỉ ghi đường dẫn.
- [ ] Giải thích được "xong" nghĩa là gì trong workflow này (delivery target + evidence).
- [ ] Biết những khi nào evidence bị stale.
- [ ] Biết hồ sơ ticket nằm ở đâu, chia sẻ thế nào và vì sao không được sửa tay.

**Thực hành (vai leader)**

- [ ] Setup xong; `doctor` pass; runtime hooks đã trust.
- [ ] Chạy `task-sync` từ một file và từ một đoạn mô tả trong chat; kiểm `request/r1/` đúng nguyên văn.
- [ ] Chạy `task-analyze`; TASK.md đủ để người khác lập plan.
- [ ] Commit + push repo hồ sơ.
- [ ] Gửi một CR bằng `task-sync <ticket>`; thấy `request/r2/` và các stage chuyển `needs-revalidation`.

**Thực hành (vai developer)**

- [ ] Pull repo hồ sơ; `status <ticket>` trả về `finalize`.
- [ ] Chạy `task-finalize`, kiểm `delivery`, `files` và `requiredChecks`; plan được **duyệt** và CHECKS/PLAN ghi đúng tên người duyệt.
- [ ] Chạy `task-implement`, thấy branch `feature/<key>-<slug>` và CHECKS.md có evidence.
- [ ] Thử sửa code sau khi verified → `status` báo quay lại implement.
- [ ] Chạy `task-review`, đọc được findings (nếu có) và vòng sửa.
- [ ] Chạy `task-handoff` đến `prepared`; tự push và tạo MR có `Refs <key>`; chạy `handoff` để ghi nhận.
- [ ] Thử commit message sai (không theo Conventional Commits) để thấy hook chặn.

**Tham chiếu**

- Hợp đồng chi tiết: [.agents/workflow/CONTRACT.md](workflow/CONTRACT.md)
- Kiến trúc helper: [.agents/workflow/README.md](workflow/README.md)
- Quyết định thiết kế khi điều chỉnh bộ kit: [ADAPTATION-DESIGN.md](../docs/ADAPTATION-DESIGN.md)
- Setup: [WORKFLOW_SETUP.md](../WORKFLOW_SETUP.md)
- Đo RTK: [.agents/workflow/RTK.md](workflow/RTK.md)
- Quy tắc cho agent: [AGENTS.md](../AGENTS.md)
