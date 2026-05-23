# Tutor365 Backlog — Jira CSV Import Guide

File `tutor365-backlog.csv` chứa **88 row** (22 Epic + 65 Story + 1 header) sẵn sàng import vào Jira Cloud / Jira Server, hoặc copy thủ công sang GitHub Issues.

## 📁 File trong folder

| File | Mục đích |
|------|----------|
| `tutor365-backlog.csv` | Backlog gốc — import vào Jira |
| `gen_backlog.py` | Script generate CSV (source of truth, sửa script không sửa CSV) |
| `README.md` | File này |

---

## 1️⃣ Import vào Jira Cloud

### Bước 1: Chuẩn bị Project
1. Tạo project mới (hoặc dùng existing) với **template Scrum**
2. Đảm bảo issue types có: `Epic`, `Story` (default Scrum template đã có)
3. Quyền: cần `Administer Project` để import

### Bước 2: Run System Import
1. **Cog ⚙️ → System → External System Import → CSV**
2. Upload `tutor365-backlog.csv`
3. CSV File encoding: **UTF-8**
4. Delimiter: **Comma (,)**

### Bước 3: Map columns
Jira sẽ auto-detect, confirm mapping:

| CSV Column | Jira Field |
|------------|------------|
| Issue Type | Issue Type |
| Epic Name | Epic Name *(chỉ cho Epic rows)* |
| Epic Link | Epic Link *(link Story → Epic Name parent)* |
| Summary | Summary |
| Description | Description |
| Priority | Priority |
| Story Points | Story Points *(custom field)* |
| Labels | Labels *(semicolon → multi-value)* |
| Components | Component/s |
| Sprint | Sprint |

### Bước 4: Hierarchy
- **Epic Name** column populated cho 22 Epic rows.
- **Epic Link** column populated cho 65 Story rows, ref đến `Epic Name`.
- Jira auto-link Story → Epic nếu values khớp.

### Bước 5: Sprint
- 10 sprint được preset: `Sprint 1` … `Sprint 10`.
- Nếu chưa tạo sprint, Jira sẽ tạo placeholder hoặc bạn tạo trước trong backlog rồi import lại.

### Bước 6: Validate
Sau import, check:
- 22 Epic visible trong Roadmap view
- 65 Story link đúng Epic
- Story Points sum đúng (~270 points total)

---

## 2️⃣ Import vào Linear / ClickUp / Asana
- **Linear:** dùng CLI `linear-import` hoặc copy CSV qua "Import CSV" trong settings
- **ClickUp:** Settings → Import → CSV; map columns tương tự
- **Asana:** CSV importer chuẩn

---

## 3️⃣ Sử dụng với GitHub Issues + @claude

Workflow đề xuất:

### Phương án A — Manual copy
1. Mở `tutor365-backlog.csv` trong Numbers/Excel
2. Cho mỗi Story muốn implement:
   - Copy **Summary** → GitHub Issue title
   - Copy **Description** → GitHub Issue body (Markdown render đúng)
   - Add labels từ column **Labels**
   - Comment `@claude` đã có sẵn ở cuối Description → Claude Code Action sẽ trigger

### Phương án B — Auto-import via gh CLI

Script bash mẫu:

```bash
#!/usr/bin/env bash
# Yêu cầu: gh CLI authenticated, python3
set -e

REPO="your-org/tutor365"
CSV="tutor365-backlog.csv"

python3 -c "
import csv, json
with open('$CSV') as f:
    for row in csv.DictReader(f):
        if row['Issue Type'] != 'Story':
            continue
        # ghi từng story ra json line để gh process
        print(json.dumps({
            'title': row['Summary'],
            'body': row['Description'],
            'labels': row['Labels'].split(';'),
        }))
" | while read -r line; do
    echo "$line" | jq -r .title
    title=$(echo "$line" | jq -r .title)
    body=$(echo "$line" | jq -r .body)
    labels=$(echo "$line" | jq -r '.labels | join(",")')
    gh issue create --repo "$REPO" --title "$title" --body "$body" --label "$labels"
    sleep 1  # rate limit
done
```

### Phương án C — Bulk via Jira → GitHub sync
- Plugin **GitHub for Jira** sync issues 2 chiều
- Hoặc dùng GitHub Projects (V2) thay Jira luôn

---

## 4️⃣ Cấu trúc Description — DEV TICKET (không phải QC test plan)

Mỗi Story description là **developer ticket** GFM Markdown, có 10 phần:

```
# {Summary}
**Epic:** EP## | **Points:** N | **Priority:** ...

## 🎯 What to Build
1-2 câu mô tả deliverable

## 🛠 Implementation Tasks               ← CHECKLIST DEV TASKS
- [ ] Define DTO Zod schema in dto/...
- [ ] Implement Service.method() doing X
- [ ] Wire controller @Post() with @ZodBody
- [ ] Add Swagger decorators
...

## 📐 API Contract / Data Model           ← Reference table cho dev impl, QA verify sau
| Status | Trigger | Body |
| 200 | success | { ... } |
| 401 | invalid | { error: { code: ... } } |

## 📁 Files to Create / Modify
- `apps/api/src/...`

## 🔌 Libs / Dependencies
- npm: bcrypt, @nestjs/jwt
- Prior videos: V06

## 🧾 Reference (Excel QC — info only)    ← chỉ info cho QA về sau, dev không cần
Excel TC reference

## ⚠️ Gotchas / Implementation Notes      ← Pitfalls, security, conventions
- Generic error message chống user enumeration
- bcrypt rounds 10 dev / 12 prod
- JWT KHÔNG include passwordHash

## 🧪 Test Hints (cho dev viết unit test)
- Happy path → ...
- Edge case 1 → ...

## ✅ Definition of Done
- [ ] Code merged
- [ ] Unit tests pass
- [ ] Swagger updated
- [ ] PR reviewed

## 📚 Reference
planK23.md, khoa-hoc-2-3-vi.md, task.md

---

@claude implement this developer ticket. Read planK23.md section, then execute Implementation Tasks checklist in order. Create/modify files, add libs if missing, follow API Contract strictly, watch out for Gotchas, write unit tests guided by Test Hints, then run pnpm verify.
```

### Khác biệt vs ticket QC

| Khía cạnh | Dev ticket (file này) | QC ticket (KHÔNG phải đây) |
|---|---|---|
| Primary action | "Define Service.method()", "Wire @Post()" | "Send invalid hash → check code 97" |
| AC style | Implementation checklist | Behavior verification list |
| Code samples | Có (signature, snippet) | Không |
| Libs section | Có (npm deps) | Không |
| Gotchas | Có (security, race condition) | Không |
| Excel TC | Info-only, dưới cùng | Là focus chính |
| @claude trigger | Có (auto-impl) | Không |

→ Khi copy Description vào GitHub Issue, GitHub render Markdown đầy đủ. Tag `@claude` trigger Claude Code Action (yêu cầu đã install [@anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) vào repo).

---

## 5️⃣ Story Points Total + Sprint Distribution

| Sprint | Section | Total Points |
|--------|---------|--------------|
| Sprint 1 | EP01 NestJS + EP02 Auth | 12 + 16 = 28 |
| Sprint 2 | EP03 Users + EP04 Taxonomy | 18 + 9 = 27 |
| Sprint 3 | EP05 Course + EP06 Approval | 18 + 5 = 23 |
| Sprint 4 | EP07 Enrollment + EP08 Availability | 8 + 5 = 13 |
| Sprint 5 | EP09 Booking + EP10 Hanah Assign | 21 + 18 = 39 |
| Sprint 6 | EP11 Jitsi + EP12 Calendar | 13 + 10 = 23 |
| Sprint 7 | EP13 VNPay + EP14 Order State | 24 + 6 = 30 |
| Sprint 8 | EP15 Payouts + EP16 Notifications | 11 + 5 = 16 |
| Sprint 9 | EP17 PostgreSQL + EP18 SQL | 10 + 14 = 24 |
| Sprint 10 | EP19 Prisma + EP20 Indexing + EP21 Tx + EP22 Final | 21 + 9 + 11 + 8 = 49 |
| **TOTAL** | | **272 points** |

⚠️ Sprint 5 + 10 nặng — cân nhắc split nếu velocity team < 35 points/sprint.

---

## 6️⃣ Regenerate CSV

Nếu cần update Story / Epic content, edit `gen_backlog.py` (KHÔNG edit CSV trực tiếp), rồi:

```bash
cd docs/course2-3/tickets
python3 gen_backlog.py
```

Re-run sẽ overwrite `tutor365-backlog.csv`.

---

## 7️⃣ Notes về @claude trigger

Mỗi Story description kết thúc bằng:

> `@claude implement this ticket. Read the referenced planK23.md section first for context, then create/modify the files in Files to Create / Modify. Write unit tests for the acceptance criteria. Run pnpm verify and report results. If anything is ambiguous, ask before implementing.`

→ Yêu cầu repo có:
- [Claude Code GitHub App](https://github.com/apps/claude) installed
- Workflow `.github/workflows/claude.yml` configured
- `ANTHROPIC_API_KEY` secret set

→ Khi Issue được tạo, Claude Code đọc body, plan, implement, mở PR. Quy trình review/merge bình thường.

---

## 8️⃣ Excel QC Reference mapping

CSV đã embed reference đến `(tuu)Tutor365-QC Test Case.xlsx` ở các Story relevant. Một số mapping chính:

| Story | Excel Sheet | TC Count |
|-------|------------|----------|
| V06 (Signup) | Guest.Sign Up | 11 TC |
| V07 (Login) | Guest.Login + Admin/Tutor/Student.Login | 18 TC |
| V10 (Admin user CRUD) | Admin.User | 39 TC |
| V11 (Tutor approval) | Admin.User.Approve a Tutor | 2 TC |
| V13-V15 (Taxonomy) | Admin.Settings | 15 TC |
| V16-V20 (Course) | Admin.Course + Tutor.Courses | 9 TC |
| V26-V29 (Booking) | Student/Parent/Tutor.Booking | 38 TC |
| V32 (Tutor accept) | Tutor.Booking.Accept | 2 TC |
| V34 (Join meeting) | Booking.Join a Booking | 4 TC |
| V39-V41 (VNPay) | Student.Cart.Checkout | 5 TC |
| V44-V46 (Payouts) | Admin.Reports.Tutor payment | 5 TC |

Total Excel TC mapped: ~150 / 336 (44%). Phần còn lại (Chat, Recording, Parent role, Header/Footer/FAQ) không thuộc scope C2-3.
