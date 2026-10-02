# Bộ skill task-* — Kiến trúc và quy trình làm việc chung

> Tài liệu training và thống nhất workflow cho toàn bộ team dev.
> Nguồn chuẩn về schema/gate: [.agents/workflow/CONTRACT.md](workflow/CONTRACT.md). Nếu tài liệu này và CONTRACT khác nhau, CONTRACT và code helper trong [.agents/workflow/lib/](workflow/lib/) là đúng.

## Mục lục

1. [Tóm tắt trong 1 phút](#1-tóm-tắt-trong-1-phút)
2. [Vai trò và trách nhiệm](#2-vai-trò-và-trách-nhiệm)
3. [Nguyên tắc chung của team](#3-nguyên-tắc-chung-của-team)
4. [Kiến trúc](#4-kiến-trúc)
5. [Workflow từng bước](#5-workflow-từng-bước)
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
flowchart TD
    S["task-sync<br/>Create ticket"]:::leader --> A["task-analyze<br/>Investigate"]:::leader
    A -- "push docs repo" --> F["task-finalize<br/>Write PLAN"]:::dev
    F --> P(["Approve plan<br/>dev or leader"]):::gate
    P --> I["task-implement<br/>Code + checks"]:::dev
    I --> R["task-review<br/>Review code + evidence"]:::dev
    R -. "findings" .-> I
    R -- "pass" --> H["task-handoff<br/>Prepare MR"]:::dev
    H --> M(["Dev pushes + opens MR"]):::gate
    M --> L(["Leader reviews + merges"]):::gate
    classDef leader fill:#e8f0fe,stroke:#4a6fa5,color:#1a1a1a
    classDef dev fill:#e6f4ea,stroke:#4a8f5f,color:#1a1a1a
    classDef gate fill:#fff4e0,stroke:#c08a2e,color:#1a1a1a
```

Xanh dương: bước của leader · xanh lá: bước của developer (agent làm cùng) · cam: điểm quyết định của người. Ai làm gì ở từng bước: xem [mục 2](#2-vai-trò-và-trách-nhiệm).

Bốn điều quan trọng nhất:

- **Agent làm, người quyết.** Agent (AI coding agent) điều tra, lập plan, code, chạy test, soạn nội dung MR. Developer **chọn hướng**; plan phải được **duyệt** (bởi developer hoặc leader) trước khi code; developer **tự push và tạo MR**. Leader merge.
- **Không có evidence thì không qua cổng.** Mọi trạng thái `verified` / `reviewed` / đã bàn giao đều do helper tính từ kết quả check đã chạy thật, khớp đúng code và môi trường hiện tại. Không ai (kể cả agent) được tự khai "pass".
- **Hồ sơ ticket nằm ở repo Git riêng**, chia sẻ bằng commit/push. Mỗi ticket có `TASK.md`, `PLAN.md`, `CHECKS.md`, nguồn yêu cầu trong `request/` và lịch sử bất biến trong `.workflow/`. Không sửa tay.
- **Chỉ cần Git và Node.** Không token, không gọi API hosting, không `package.json`. Lệnh duy nhất: `node .agents/workflow/task.mjs`.

Cách gọi skill: Codex dùng `$task-sync`, Claude Code dùng `/task-sync`, kèm file hoặc mô tả yêu cầu; các bước sau kèm **ticket ID**, ví dụ `$task-analyze REQ-260930-1415` hoặc `/task-analyze REQ-260930-1415`. Agent cũng tự gọi được các skill này khi đi tiếp sang bước mà `status` chỉ ra, như ở bản workshop gốc. Ba điểm luôn dừng chờ người: chọn hướng xử lý, duyệt plan, và push/tạo MR.

---

## 2. Vai trò và trách nhiệm

Ba vai trò cùng làm việc trên một ticket: **Leader** đưa yêu cầu và merge, **Developer** chọn hướng, duyệt/push, **Agent** làm phần việc kỹ thuật. Agent không có quyền quyết định: không tự duyệt plan, không push, không merge.

### 2.1 Swimlane

```mermaid
sequenceDiagram
    participant L as Leader
    participant A as Agent
    participant D as Developer

    rect rgba(100,140,200,0.15)
    Note over L,D: 1. Intake and analysis
    L->>A: Request file or chat (sync)
    A-->>L: Summary to confirm
    L->>A: Answer open questions (analyze)
    A-->>L: Findings and options
    L->>D: Share docs repo + ticket ID
    end

    rect rgba(220,170,60,0.15)
    Note over L,D: 2. Plan
    D->>A: Choose option (finalize)
    A-->>D: PLAN with checks and delivery
    Note over L,D: Approver: developer or leader
    D->>A: Approval in exact words
    end

    rect rgba(80,160,100,0.15)
    Note over L,D: 3. Build and review
    Note over A: Code, run checks, commit (implement)
    Note over A: Review code + evidence (review)
    A-->>D: Findings or scope change
    D->>A: Decide
    end

    rect rgba(160,110,190,0.15)
    Note over L,D: 4. Handoff and merge
    A-->>D: Git commands + MR text (handoff)
    Note over D: Publish branch, open MR
    D->>A: MR URL
    A-->>D: Handoff recorded
    D->>L: MR ready
    Note over L: Review and merge
    end
```

### 2.2 Ai làm gì ở từng bước

| Bước | Agent | Leader | Developer |
|---|---|---|---|
| Sync | Lưu nguồn, tóm tắt | **Cung cấp nguồn**, xác nhận nội dung đã lưu | – |
| Analyze | Điều tra, đề xuất | Trả lời câu hỏi quyết định, **push repo hồ sơ** | – |
| Finalize | Soạn plan, checks, delivery | Tư vấn scope; **duyệt plan** nếu team giao leader duyệt | **Chọn hướng**; **duyệt plan** nếu developer tự duyệt |
| Implement | Code, chạy checks, commit | – | Theo dõi, cấp quyền/môi trường nếu plan nêu |
| Review | Review code + evidence | – | Đọc findings, quyết định khi đổi scope |
| Handoff | Prepare, ghi nhận | **Review MR, merge** | **Push, tạo MR** |
| Retro (tùy chọn) | Rút đề xuất, ghi `RETRO.md` | Quyết định áp dụng đề xuất nào | Yêu cầu retro; quyết định áp dụng đề xuất nào |

Helper không ép vai trò: nó chỉ ghi đúng tên người chạy lệnh vào từng bản ghi. Developer chịu trách nhiệm cuối cùng cho những gì mình duyệt và push; "agent đã làm" không phải lý do để bỏ qua việc đọc plan và diff.

---

## 3. Nguyên tắc chung của team

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

## 4. Kiến trúc

### 4.1 Các lớp

```mermaid
flowchart TB
    subgraph Runtime["Agent runtime"]
        SK["Skills<br/>.agents/skills/task-*/SKILL.md"]
        AH["Runtime hooks<br/>.codex/hooks.json · .claude/settings.json<br/>→ agent-hook.mjs"]
    end
    subgraph Repo["Source repo"]
        CLI["CLI<br/>.agents/workflow/task.mjs"]
        LIB["Libraries<br/>.agents/workflow/lib/*.mjs"]
        GH["Git hooks<br/>.githooks/ → git-hook.mjs"]
        CFG["Config<br/>workflow.config.json (shared)<br/>workflow.local.json (per machine)"]
    end
    subgraph Docs["Docs repo (separate Git repo)"]
        V["docs/tickets/&lt;key&gt;-&lt;slug&gt;/<br/>TASK · PLAN · CHECKS · request/ · .workflow/"]
    end
    REMOTE[("Source repo remote")]

    SK -- "run commands" --> CLI
    AH -. "block risky tool calls" .-> SK
    CLI --> LIB
    LIB -- "read" --> CFG
    LIB -- "read / write" --> V
    LIB -- "fetch base, ls-remote<br/>(dev's Git credential)" --> REMOTE
    GH -- "check commit / push" --> LIB
```

| Lớp | Vai trò | Không làm |
|---|---|---|
| **Skills** | Hướng dẫn agent phải làm gì ở mỗi bước, soạn nội dung tài liệu và JSON input. | Không tự ghi state, không tự quyết approval. |
| **CLI + thư viện** | Cổng duy nhất để sync, ghi stage, chạy check, chuẩn bị bàn giao. Kiểm mọi gate. | Không thiết kế steps/checks; không commit/push repo hồ sơ; không push/tạo MR. |
| **Repo hồ sơ** | Lưu nguồn yêu cầu, tài liệu, approval, evidence dạng bất biến + 3 view hiện hành. Chia sẻ qua Git. | Không được Git của repo source theo dõi. |
| **Guardrails** (runtime hooks + Git hooks) | Chặn lộ secret, bypass hook, agent push/tạo MR, metadata sai quy ước. | Không thay thế branch protection phía server. |

Việc helper liên tục ghi hồ sơ **không** được làm bẩn worktree hay ảnh hưởng tới fingerprint của code. Hồ sơ nằm ngoài repo source thì hiển nhiên đạt; đặt **trong** repo source cũng được, miễn thư mục đó có trong `.gitignore` của repo source (helper kiểm điều này khi nạp cấu hình).

### 4.2 Bản đồ file

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

### 4.3 Ticket ID

```text
<key>-<slug>        ví dụ: REQ-260930-1415-note-search   |   BUG-261001-1030-search-npe   |   CR-261002-0900-search-filter   |   GL-123-note-search
```

- **Loại ticket** quyết định prefix của key tự sinh, để nhìn ID là biết ticket thuộc loại nào:

  | Loại (`--type`) | Prefix | Dùng khi |
  |---|---|---|
  | `req` (mặc định) | `REQ` | Yêu cầu mới, từ file hoặc mô tả trong chat |
  | `cr` | `CR` | Thay đổi yêu cầu của một ticket **đã bàn giao** |
  | `bug` | `BUG` | Lỗi của chức năng đang có, từ mô tả lỗi và stack trace/log |
  | (dự án tự thêm) | ví dụ `US` | Khai trong `tickets.types` của `.agents/workflow.config.json` |

- **key tự sinh**: `<PREFIX>-YYMMDD-HHMM` (giờ local lúc tạo). Trùng phút thì lấy phút kế tiếp.
- **key ngoài**: nếu nguồn mang mã của hệ thống khác (issue GitLab/Redmine, Jira…) thì truyền `--key`, ví dụ `GL-123`, `RM-456`; mã đó được dùng nguyên vẹn nên prefix của tracker đã tự phân biệt.
- **Liên kết**: ticket nối tiếp một ticket khác ghi `--relates-to <ticket>`; link hiện ở đầu TASK/PLAN/CHECKS.
- **slug**: agent tự đặt, 2–6 từ ASCII chữ thường nối bằng `-`, mô tả nội dung chính.
- Mọi lệnh nhận ID đầy đủ hoặc chỉ key (khi key xác định đúng một ticket).

### 4.4 Hồ sơ ticket

```text
<docsRepo>/docs/tickets/<key>-<slug>/
├── TASK.md        # Yêu cầu, hiện trạng, phương án, quyết định, bước tiếp theo
├── PLAN.md        # AC, phương án đã chọn, steps, checks, delivery, approval
├── CHECKS.md      # Tiến độ thực, kết quả check, findings, trạng thái bàn giao
├── RETRO.md       # Đề xuất sau ticket; chỉ có khi chạy task-retro (mục 5.7)
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

#### Glossary và ADR: tài liệu dùng chung của mọi ticket

Bên cạnh thư mục `tickets/`, repo hồ sơ có hai thứ dùng chung:

```text
<docsRepo>/docs/
├── GLOSSARY.md            # Thuật ngữ nghiệp vụ: mỗi khái niệm một tên
├── adr/NNNN-<slug>.md     # Mỗi quyết định khó đảo ngược một file
└── tickets/…
```

| | Glossary | ADR |
|---|---|---|
| **Ghi gì** | Thuật ngữ nghiệp vụ, định nghĩa một hai câu, các từ nên tránh, quan hệ giữa các thuật ngữ, chỗ mơ hồ đã giải quyết | Một quyết định và lý do của nó, một đoạn văn là đủ |
| **Không ghi gì** | Chi tiết cài đặt, tên class, quyết định kỹ thuật | Quyết định dễ đảo ngược, hiển nhiên, hoặc không có phương án khác |
| **Ai cập nhật** | Agent ở bước Analyze, ngay khi một thuật ngữ được chốt | Agent đề nghị ở bước Analyze; người quyết định đồng ý thì mới ghi |
| **Ai đọc** | Mọi bước, để đặt tên trong plan, code, test, MR | Bước nào chạm tới vùng của quyết định đó |

ADR chỉ viết khi **cả ba** điều đúng: quyết định khó đảo ngược, gây ngạc nhiên nếu thiếu bối cảnh, và là kết quả của một đánh đổi thật. TASK.md hoặc PLAN.md trỏ tới ADR thay vì chép lại.

Khác với hồ sơ ticket, hai thứ này là **Markdown thường**: agent sửa trực tiếp, helper không băm và không tạo record. Chúng được commit cùng lúc với hồ sơ của ticket; `docsRepo.uncommitted` của `status` tính cả hai. Vị trí đổi được bằng `docs.glossaryPath` và `docs.adrPath` trong `.agents/workflow.config.json`; kết quả `status` trả đường dẫn thật trong `target.glossary` và `target.adr`. Định dạng chi tiết: [GLOSSARY-ADR.md](workflow/GLOSSARY-ADR.md).

Với Claude Code, repo hồ sơ nằm ngoài thư mục dự án nên lần đầu sửa glossary agent sẽ xin quyền ghi; cho phép, hoặc thêm repo hồ sơ làm thư mục làm việc bằng `/add-dir`.

### 4.5 State machine và dispatcher

#### Vòng đời trạng thái

Mỗi stage có status riêng. Sơ đồ dưới là đường đi bình thường; stage sau chỉ chạy khi stage trước đã đạt.

```mermaid
stateDiagram-v2
    direction TB
    state "Intake · Analysis · Finalize" as DOCS {
        direction LR
        [*] --> d0
        d0: not-started
        d1: complete
        d0 --> d1: record
    }
    state "Implement" as IMPL {
        direction LR
        [*] --> i0
        i0: not-started
        i1: in-progress
        i2: blocked
        i3: verified
        i0 --> i1: checkpoint
        i1 --> i2: blocker found
        i2 --> i1: blocker cleared
        i1 --> i3: record implement
    }
    state "Review" as REVW {
        direction LR
        [*] --> r0
        r0: not-started
        r1: changes-requested
        r2: reviewed
        r0 --> r1: has findings
        r0 --> r2: pass
        r1 --> r2: findings resolved, pass
    }
    state "Handoff" as HAND {
        direction LR
        [*] --> h0
        h0: not-started
        h1: prepared
        h2: complete
        h0 --> h1: prepare
        h1 --> h2: remote HEAD matches
    }
    DOCS --> IMPL: plan approved
    IMPL --> REVW: verified
    REVW --> HAND: reviewed
```

| Status | Được ghi bởi |
|---|---|
| `complete` (intake, analysis, finalize) | `record intake` / `analysis` / `finalize` |
| `in-progress`, `blocked` | `record checkpoint` (có `blocker` thì `blocked`) |
| `verified` | `record implement` |
| `changes-requested` | `record review-findings` |
| `reviewed` | `record review` với `verdict: "pass"` |
| `prepared` | `prepare` |
| `complete` (handoff) | `handoff`, sau khi HEAD trên remote khớp |

#### Khi nào stage bị `needs-revalidation`

Từ bất kỳ status nào (`complete`, `verified`, `reviewed`, `prepared`…), stage có thể chuyển sang `needs-revalidation`. Muốn quay lại trạng thái đạt thì phải ghi lại chính stage đó.

| Sự kiện | Stage bị `needs-revalidation` | Approval |
|---|---|---|
| Ghi lại một stage | Mọi stage **phía sau** nó | Bị xóa nếu stage ghi lại là intake / analysis / finalize |
| `sync` có nguồn mới (CR) | **Mọi** stage | Mất hiệu lực (đã gắn với revision cũ) |
| `observe` với context mới | implement, review, handoff | Giữ nguyên |

#### Dispatcher

`node .agents/workflow/task.mjs status <ticket>` gọi dispatcher. Dispatcher kiểm lần lượt từng điều kiện theo thứ tự 1 → 8, **dừng ở điều kiện đầu tiên không thỏa** và luôn trả về **một** bước tiếp theo (kèm lý do).

```mermaid
flowchart TD
    Start(["status &lt;ticket&gt;"]) --> C1
    C1["1. Intake, analysis, finalize<br/>complete for this revision?"] -- yes --> C2
    C2["2. Plan has checks<br/>and valid delivery?"] -- yes --> C3
    C3["3. Approval matches<br/>plan hash + revision?"] -- yes --> C4
    C4["4. Worktree clean,<br/>required checks pass + fresh?"] -- yes --> C5
    C5["5. Review not<br/>changes-requested?"] -- yes --> C6
    C6["6. Implement verified<br/>on current HEAD?"] -- yes --> C7
    C7["7. Review passed<br/>on current HEAD?"] -- yes --> C8
    C8["8. Handoff complete<br/>on current HEAD?"] -- yes --> N9(["handed-off<br/>wait for leader"])

    C1 -- no --> N1["sync / analysis / finalize"]
    C2 -- no --> N2["finalize"]
    C3 -- no --> N3["approve"]
    C4 -- no --> N4["implement"]
    C5 -- no --> N4
    C6 -- no --> N4
    C7 -- no --> N7["review"]
    C8 -- no --> N8["handoff<br/>prepare, or wait for dev push"]

    classDef out fill:#e6f4ea,stroke:#4a8f5f,color:#1a1a1a
    classDef done fill:#fff4e0,stroke:#c08a2e,color:#1a1a1a
    class N1,N2,N3,N4,N7,N8 out
    class N9 done
```

Bước tiếp theo có thể là: `sync`, `analyze`, `finalize`, `approve`, `implement`, `review`, `handoff`, hoặc `handed-off` (chờ leader merge). Ba điều kiện 4–6 đều trả về `implement` vì cùng một ý: code/evidence chưa đạt hoặc review đang đòi sửa.

**Khi nhận ticket từ người khác hoặc resume sau khi nghỉ, luôn bắt đầu bằng `status`**, không đoán từ trí nhớ.

### 4.6 Verification: evidence là gì, khi nào hết hiệu lực

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

### 4.7 Guardrails

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
| `commit-msg` | Conventional Commits (`feat\|fix\|refactor\|test\|docs\|chore\|perf\|build\|ci`), không attribution/tên công cụ. |
| `pre-push` | Chỉ push `feature/*`, không push nhánh bảo vệ, không xóa branch remote, không rewrite lịch sử, tối đa 200 commit, quét lại metadata và secret từng commit. |

Git hooks áp dụng cho **mọi** commit/push trong repo source, kể cả khi developer thao tác tay. Hooks local **không thay thế** branch protection trên server Git.

---

## 5. Workflow từng bước

Mỗi bước dưới đây ghi rõ người chạy, đầu vào, đầu ra và gate. Bức tranh tổng thể theo vai trò xem ở [swimlane mục 2.1](#21-swimlane).

Mọi skill (trừ sync khi tạo ticket mới) bắt đầu bằng `status <ticket>` để xác nhận đúng ticket, đọc state/view hiện hành. Chỉ đọc context vừa đủ, không nạp lại toàn bộ lịch sử.

Và kết thúc giống nhau, bằng một báo cáo gồm: **đã làm gì · phát hiện chính · trạng thái thật · tài liệu hiện hành · bước tiếp theo**; rồi commit phần hồ sơ của ticket trong repo hồ sơ (không push).

### 5.1 `task-sync`: Tạo ticket hoặc nhận CR

| | |
|---|---|
| **Người chạy** | Leader. |
| **Nguồn** | File người dùng chỉ định (docx, pdf, md, ảnh…) và/hoặc mô tả viết trực tiếp trong chat. |
| **Ticket mới** | `sync --title "<tiêu đề>" --slug <slug> [--type <loại>] [--key <mã ngoài>] [--relates-to <ticket>] [--file <path>]… [--chat <path>]` |
| **CR, ticket chưa bàn giao** | `sync <ticket> [--file <path>]… [--chat <path>]` → revision mới, mọi stage `needs-revalidation`. |
| **CR, ticket đã bàn giao** | `sync --type cr --relates-to <ticket> --title … --slug … …` → ticket mới `CR-…`, liên kết về ticket gốc. |
| **Output** | `request/r<N>/…`, và `TASK.md` (intake): tóm tắt yêu cầu tiếng Việt theo từng source ID (`r1/spec.docx`, `r2/chat.md`), delta so với revision trước, câu hỏi mở. |
| **Gate** | `translatedSourceIds` phải phủ **đúng** các nguồn hiện hành. |
| **Không làm** | Không chọn phương án, không lập plan, không code. Không tạo ticket mới cho yêu cầu thuộc ticket đã có. |

Với nguồn chat, agent chép **nguyên văn** phần yêu cầu vào `.workflow-tmp/request.md` rồi mới sync. Helper không đọc được khung chat, nên agent phải trích lại nội dung đã lưu để người dùng xác nhận.

**Ticket báo lỗi** tạo bằng `sync --type bug …`; nguồn là mô tả lỗi và stack trace/log, lưu nguyên văn như mọi nguồn khác. Phần tóm tắt trong TASK.md tách bốn mục: triệu chứng, thông báo lỗi và stack trace, điều kiện xảy ra, các bước tái hiện mà người báo lỗi đã cung cấp. Mục nào nguồn chưa nêu thì thành câu hỏi mở.

Sync lại cùng nội dung không tạo revision. Giới hạn: 20 file/lần, mỗi file dưới 20 MB, chat dưới 1 MB; nguồn text chứa mẫu secret bị từ chối.

### 5.2 `task-analyze`: Điều tra và đề xuất

| | |
|---|---|
| **Người chạy** | Leader. |
| **Mục tiêu** | Hiểu hiện trạng, khoảng cách so với yêu cầu, rủi ro và cách verify; đề xuất phương án. |
| **Output** | `TASK.md` (analysis) + danh sách `observations` với status `observed` / `inferred` / `unknown`. `observed` bắt buộc có evidence. |
| **Nội dung cần có** | Hiện trạng người dùng đang dùng; target bàn giao (runtime hay artifact); đường đi từ hiện trạng tới dùng được (chuẩn bị, dữ liệu, cấu hình, phụ thuộc); phân biệt môi trường test với môi trường bàn giao; security theo trust boundary thực của task. |
| **Phương án** | Đủ đánh đổi để quyết định. Một hướng rõ ràng + lựa chọn thay thế ngắn là đủ. |
| **Không làm** | Không sửa code. Không chạy thao tác phá hủy dữ liệu. Chỉ hỏi những **quyết định** còn thiếu; dữ kiện thu thập được thì tự điều tra. |
| **Cách hỏi** | Theo vòng: mỗi vòng gồm mọi câu hỏi quyết định đã đủ điều kiện hỏi, đánh số, mỗi câu kèm đáp án đề xuất để trả lời được bằng một từ. Câu chưa ai trả lời được ngay thì ghi vào mục câu hỏi mở của TASK.md kèm đáp án đề xuất. |
| **Thuật ngữ** | Đối chiếu từ ngữ trong yêu cầu với glossary và với tên trong code; một từ mang hai nghĩa thì hỏi lại; thuật ngữ vừa chốt ghi vào glossary ngay. Quyết định đủ ba điều kiện thì đề nghị ghi ADR. Xem [mục 4.4](#44-hồ-sơ-ticket). |

Người lập plan thường không phải người phân tích, nên **TASK.md phải tự đủ**: developer đọc là lập được plan, không cần hỏi lại bối cảnh.

**Với ticket loại `bug`**, căn cứ phân tích là mô tả lỗi, stack trace và source code:

1. Ghi triệu chứng và stack trace thành observation, căn cứ là source ID trong `request/`.
2. Lần từ stack trace vào code: các frame thuộc dự án, rồi đường đi của dữ liệu tới điểm lỗi. Đọc được trực tiếp từ code là `observed`; suy ra mà chưa được xác nhận là `inferred`.
3. Nêu các giả thuyết về nguyên nhân, xếp theo khả năng, mỗi giả thuyết kèm một dự đoán kiểm được ("nếu nguyên nhân là X thì đổi Y sẽ làm lỗi biến mất"). Stack trace đã chỉ thẳng nguyên nhân thì một giả thuyết là đủ.

Các bước sau của ticket bug giống mọi ticket: kiểm chứng là required checks do helper chạy. Plan thêm một test hồi quy cho đúng lỗi này khi dự án có điểm đặt test phù hợp. Khi implement, log gỡ lỗi tạm thời mang một tiền tố riêng (vd. `[DEBUG-<key>]`) để gỡ sạch trước khi commit; nguyên nhân đã xác định được ghi vào CHECKS.md và nội dung MR. Việc test tay và tái hiện lỗi trên môi trường thật do con người làm, ngoài luồng của helper.

**Bàn giao ticket:** leader commit + push repo hồ sơ, báo ticket ID cho developer.

### 5.3 `task-finalize`: Chốt PLAN

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

- **Steps là các lát dọc.** Mỗi step làm trọn một hành vi qua mọi tầng nó chạm tới và tự kiểm chứng được bằng checks của chính nó; không chia theo tầng (hết DB rồi mới tới API). Việc dọn đường (prefactor) đứng trước. Thay đổi cơ học lan rộng đi theo trình tự mở rộng → chuyển dần từng cụm → thu hẹp.
- **Mỗi check có điểm đặt test rõ ràng**: interface công khai mà check quan sát hành vi qua đó. Giá trị mong đợi lấy từ nguồn độc lập với code (yêu cầu, ví dụ đã biết đúng).

- Chức năng chạy local → mặc định "xong" là **dùng được trên local đã thống nhất**, không mặc định deploy remote.
- Test trên bản sao/fixture là lớp kiểm **bổ sung**, không thay nghiệm thu tại target.
- Có smoke test tình huống người dùng trên **dữ liệu/trạng thái hiện hữu** khi liên quan.
- `files` phải liệt kê đủ file sẽ đổi: lúc bàn giao, file nằm ngoài danh sách này sẽ bị chặn.
- Thiếu quyền để hoàn thành bước nào thì nói rõ **trước khi duyệt**.

**Điểm dừng để duyệt:** người có thẩm quyền — developer hoặc leader — đọc PLAN.md và **duyệt bằng lời rõ ràng** (ví dụ "Duyệt plan v2"). Nếu leader duyệt, developer chuyển nguyên văn lời duyệt cho agent và `approvedBy` ghi tên leader. Agent ghi `approve` với `approvedBy` và `evidence` là chính lời duyệt đó. Đã duyệt thì agent không hỏi lại; cũng không tự tạo approval.

### 5.4 `task-implement`: Code và kiểm chứng

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

### 5.5 `task-review`: Review độc lập

| | |
|---|---|
| **Mục tiêu** | Kiểm code **và** evidence trên đúng phiên bản (HEAD) đã implement. |
| **Đọc gì** | Plan/AC, **diff và code liên quan**, evidence. Không chỉ đọc summary của người implement. |
| **Hai trục, báo riêng** | **Yêu cầu**: diff so với AC/plan/delivery — thiếu, thừa, sai. **Chuẩn code**: diff so với chuẩn đã viết của repo và danh sách smell nền. Mỗi trục một lượt đọc riêng (subagent riêng khi runtime hỗ trợ); không gộp, vì thay đổi có thể đạt trục này mà trượt trục kia. |
| **Kiểm gì ở trục Yêu cầu** | Assertion có thật sự chứng minh AC không (không tự tính lại kết quả theo cách của code, không dính vào nội bộ); `kind`/target/điểm đặt test đúng không; có dùng mock thay DB/API/browser khi AC cần lớp đó không; security, data lifecycle, tương thích. Plan có đủ cho kết quả người dùng cần không. Target bàn giao đã thật sự dùng được chưa. |
| **Kiểm gì ở trục Chuẩn code** | Vi phạm chuẩn đã viết là finding cứng. Smell (tên khó hiểu, code lặp, Feature Envy, tổng quát hóa thừa…) luôn là nhận định; chuẩn của repo thắng khi mâu thuẫn. Bỏ qua thứ công cụ đã tự kiểm. |
| **Có findings** | `record review-findings` với findings `open` → status `changes-requested` → quay lại Implement. Sai scope → quay Finalize. |
| **Pass** | Mọi findings `resolved`, evidence còn hiệu lực, implement đúng HEAD → `record review` với `verdict: "pass"` → `reviewed`. |

> Review **không phải** bước chuẩn bị môi trường còn thiếu. Target chưa sẵn sàng là một finding.
> `reviewed` là review nội bộ trong workflow, **chưa phải** leader acceptance.

### 5.6 `task-handoff`: Bàn giao

```mermaid
sequenceDiagram
    participant A as Agent
    participant H as Helper
    participant D as Developer
    participant R as Git remote
    A->>H: prepare ticket + mr.json
    H-->>A: handoff.md (status: prepared)
    A->>D: Git commands + MR text
    D->>R: Push feature branch
    D->>R: Open MR (manual)
    D->>A: Pushed, MR URL
    A->>H: handoff ticket [mr-url]
    H->>R: ls-remote (compare HEAD)
    H-->>A: complete, or reject if HEAD differs
```

| | |
|---|---|
| **Prepare** | `prepare <ticket> .workflow-tmp/mr.json`. Helper kiểm: review đúng HEAD/branch; base là ancestor của HEAD; **mọi file trong diff nằm trong `files` của plan**; metadata và nội dung từng commit không có secret/attribution; body MR có `Refs <key>`. Ghi `handoff.md`. |
| **Developer** | Tự chạy lệnh push được in ra và tự tạo MR vào base branch, dùng title/body trong `handoff.md`. |
| **Ghi nhận** | `handoff <ticket> [mr-url]`. Helper đối chiếu HEAD của branch trên remote với code đã review. Khớp → `complete`. Chưa khớp, hoặc không kết nối được remote → từ chối, trạng thái vẫn `prepared`. |
| **Nội dung MR** | Theo mẫu trong skill: **Tóm tắt** (hình nhỏ nhất làm rõ thay đổi: pseudocode, cây gọi hàm, cây file, sơ đồ, diff phác thảo); **Bằng chứng** trước/sau lấy từ check đã chạy, ghi rõ local/mock/live; **Mức nguy hiểm khi merge** (đảo ngược dễ hay khó, phạm vi ảnh hưởng); **Vận hành và giới hạn**; `Refs <key>`. Không metrics RTK, không secret, không từ khóa tự đóng issue (`Fixes #…`). |
| **Giới hạn** | URL MR do developer cung cấp; helper không đọc được nội dung MR trên hệ thống hosting. |

### 5.7 `task-retro`: Nhìn lại (tùy chọn)

Retro không phải stage thứ bảy. Nó chạy khi người dùng yêu cầu, sau khi ticket đã review hoặc đã bàn giao, và trả lời một câu hỏi: **ticket vừa rồi cho thấy môi trường của agent cần sửa gì** để ticket sau ít vòng sửa hơn.

| | |
|---|---|
| **Người chạy** | Người vừa làm ticket, tốt nhất ngay trong phiên vừa làm, khi hội thoại còn đó. |
| **Nguồn** | Hội thoại của phiên; CHECKS.md (findings, check fail, checkpoint, blocker); changelog của PLAN.md; log check fail. |
| **Output** | `RETRO.md` trong thư mục ticket: bảng đề xuất xếp theo mức nghiêm trọng, mỗi đề xuất có sự việc, căn cứ và thay đổi cụ thể. Chạy lại thì thêm mục mới, giữ mục cũ. |
| **Không làm** | Không đổi state, không tạo record, không tự sửa hook, check, chuẩn code, AGENTS.md hay skill. `status` trước và sau như nhau. |

Mỗi sự việc được xếp vào đúng một loại:

| Sự việc | Đề xuất |
|---|---|
| **Lỗi máy móc**: mẫu cú pháp cố định, API bị cấm, file đặt sai chỗ | Một check tự động hoặc Git hook. Check đã có trong `pom.xml` hay `frontend/package.json` mà chưa được nối vào luồng cũng là một phát hiện. |
| **Lỗi phán đoán**: nhất quán giữa các file, hợp với code xung quanh | Một quy tắc trong chuẩn code của repo, nơi trục Chuẩn code của Review đọc. |
| **Tìm thông tin chậm** | Một dòng chỉ đường trong AGENTS.md. |
| **Chỉ dẫn không làm đổi hành vi** | Đề xuất xóa. |

Áp dụng đề xuất nào là quyết định của người; mỗi đề xuất được chấp nhận thành một thay đổi riêng (thường là một ticket nhỏ hoặc một commit bảo trì bộ kit).

---

## 6. Các tình huống đặc biệt

### 6.1 Thay đổi yêu cầu (Change Request)

CR đi theo trạng thái của ticket:

| Ticket gốc | CR là gì | Lệnh |
|---|---|---|
| **Chưa bàn giao** (đang sync … review, hoặc mới `prepared`) | Một **revision** của chính ticket đó | `sync <ticket> …` |
| **Đã bàn giao** (`status` trả `handed-off`) | Một **ticket mới** loại CR, có branch và MR riêng | `sync --type cr --relates-to <ticket> …` |

**Khi là revision:**

1. Leader (hoặc người đang giữ ticket) chạy `task-sync` với ticket ID và nguồn mới. Helper lưu vào `request/r<N>`, **giữ nguyên nguồn cũ**, tăng `revision`, chuyển mọi stage sang `needs-revalidation`.
2. `task-analyze` chỉ phân tích **delta** và ảnh hưởng, giữ lịch sử.
3. `task-finalize` chỉ rõ phần plan thay đổi cần quyết định; plan được duyệt lại.

Nếu developer đang làm dở, pull repo hồ sơ rồi `status` sẽ báo quay về `sync`/`analysis`.

**Khi là ticket CR mới:** ticket gốc giữ nguyên trạng thái đã bàn giao. Ticket `CR-…` đi lại đủ các bước từ sync đến handoff; ở bước analyze, agent đọc TASK/PLAN của ticket gốc (link ở đầu view) làm bối cảnh.

Helper cưỡng chế cả hai chiều: không cho thêm nguồn vào ticket đã bàn giao, và không cho tạo ticket CR trỏ tới ticket chưa bàn giao. Ngoại lệ duy nhất là `sync <ticket> … --reopen`, dùng khi MR chưa merge và công việc tiếp tục trên cùng branch.

CR **không tự động** là quyền implement, dù ở dạng nào.

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

### 7.1 Branch (repo source)

```text
feature/<key>-<slug>          ví dụ: feature/REQ-260930-1415-note-search
```

Tạo bằng `start <ticket>` lúc bắt đầu implement, không tạo tay.

### 7.2 Commit (repo source)

- Conventional Commits: `feat|fix|refactor|test|docs|chore|perf|build|ci`, scope tùy chọn: `feat(search): lọc theo danh mục`.
- Dùng đúng Git identity đã cấu hình trên máy.
- **Không** có tên công cụ/model (`claude`, `codex`, `copilot`, `gpt-…`), chữ viết tắt `AI` đứng riêng, `Co-authored-by`, "generated by", "AI-assisted". Từ "ai" thường trong câu tiếng Việt ("cho phép ai cũng xem được") thì dùng bình thường.

### 7.3 Merge Request

- Developer tự tạo. Tham chiếu ticket bằng `Refs <key>`; **không** dùng `Fixes/Closes/Resolves #<id>`.
- Nội dung lấy từ `handoff.md`: behavior thay đổi, validation thật (ghi rõ local/mock/live), bước vận hành, giới hạn đã biết.
- File trong MR phải nằm trong danh sách `files` của plan đã duyệt. Cần đụng file ngoài plan → quay Finalize.

### 7.4 Repo hồ sơ

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
| Tạo ticket | `T sync --title "<tiêu đề>" --slug <slug> [--type <loại>] [--key <key>] [--relates-to <ticket>] [--file <path>]… [--chat <path>]` |
| CR, ticket chưa bàn giao | `T sync <ticket> [--file <path>]… [--chat <path>] [--reopen]` |
| CR, ticket đã bàn giao | `T sync --type cr --relates-to <ticket> --title "<tiêu đề>" --slug <slug> …` |
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
| Loại ticket không hợp lệ | `--type` không có trong `tickets.types` | Dùng một loại đã khai, hoặc thêm loại vào `.agents/workflow.config.json` |
| Ticket đã bàn giao: thay đổi yêu cầu sau bàn giao là ticket mới | `sync <ticket>` kèm nguồn mới trên ticket đã bàn giao | Tạo ticket `--type cr --relates-to <ticket>`; hoặc `--reopen` nếu MR chưa merge |
| Ticket … chưa bàn giao: thay đổi yêu cầu là một revision | Tạo ticket CR trỏ tới ticket đang làm | `sync <ticket> …` trên chính ticket đó |
| Thư mục hồ sơ nằm trong repo source thì phải được thêm vào .gitignore | Hồ sơ đặt trong repo source nhưng chưa bị ignore | Thêm thư mục đó vào `.gitignore` của repo source, hoặc đặt repo hồ sơ ra ngoài |
| docs.glossaryPath / docs.adrPath nằm trong repo source thì phải được thêm vào .gitignore | Glossary hoặc thư mục ADR đặt trong repo source nhưng chưa bị ignore | Thêm `docs/GLOSSARY.md` và `docs/adr/` (hoặc đường dẫn đã cấu hình) vào `.gitignore` của repo source |
| docs.glossaryPath / docs.adrPath phải nằm ngoài docs.ticketsPath | Glossary hoặc ADR được cấu hình vào trong thư mục ticket | Đặt chúng cạnh thư mục ticket, không nằm trong |
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
| Check gọi file .cmd/.bat với tham số chứa ký tự đặc biệt | Tham số có `" % ! ^ & \| < >` | Bọc lệnh trong một script riêng trong repo |
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
- [ ] Chạy `task-retro`; đọc `RETRO.md` và kiểm `status` của ticket không đổi.

**Tham chiếu**

- Hợp đồng chi tiết: [.agents/workflow/CONTRACT.md](workflow/CONTRACT.md)
- Kiến trúc helper: [.agents/workflow/README.md](workflow/README.md)
- Quyết định thiết kế khi điều chỉnh bộ kit: [ADAPTATION-DESIGN.md](../docs/ADAPTATION-DESIGN.md)
- Setup: [WORKFLOW_SETUP.md](../WORKFLOW_SETUP.md)
- Đo RTK: [.agents/workflow/RTK.md](workflow/RTK.md)
- Quy tắc cho agent: [AGENTS.md](../AGENTS.md)
