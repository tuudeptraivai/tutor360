---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 18: Claude Code Cho Tốc Độ Phát Triển'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Claude Code
# Cho Tốc Độ Phát Triển

### Khóa 1 — Video 18

**AI coding assistant: dùng đúng = 3x faster**

> Claude Code không thay bạn — nó nhân khả năng của bạn lên

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **Claude Code là gì** và khác Cursor/Copilot thế nào
- ✅ **Cài đặt và cấu hình** Claude Code trong dự án
- ✅ Viết file **`CLAUDE.md`** — chỉ dẫn cho Claude
- ✅ Biết cách **prompt hiệu quả**: cụ thể, có context, có acceptance
- ✅ Demo: nhờ Claude sinh **1 module mới** đúng convention dự án
- ✅ Phân biệt **task nên dùng AI vs task nên tự làm**

> 🎯 Cuối video: Claude sinh module `LessonsModule` đúng pattern Khóa 1

---

## Slide 3 — Claude Code là gì?

### CLI agent có khả năng đọc + sửa codebase

**Tính năng cốt lõi:**

- 📁 Đọc file, list folder, tìm code (grep)
- ✏️ Sửa file trực tiếp, tạo file mới
- 🖥️ Chạy bash command (test, build, install)
- 🧠 Hiểu context dự án qua `CLAUDE.md`
- 🔄 Multi-turn conversation — nhớ ngữ cảnh trong session

**Khác Cursor / Copilot:**

| | Copilot | Cursor | Claude Code |
|--|---------|--------|------|
| Autocomplete | ✅ | ✅ | ❌ (CLI-based) |
| Chat trong IDE | ⚠️ | ✅ | ✅ (terminal) |
| Run command | ❌ | ⚠️ | ✅ |
| Multi-file edit | ⚠️ | ✅ | ✅ |
| Memory persistence | ❌ | ⚠️ | ✅ (CLAUDE.md) |
| Free / Paid | $10/mo | $20/mo | API usage |

---

## Slide 4 — Vì sao dùng AI cho coding?

### Tăng tốc 3 loại task

**1. Boilerplate code** — viết nhanh code lặp lại

```
"Tạo module Lessons giống pattern Courses module"
→ Claude đọc CoursesModule → sinh LessonsModule tương tự
```

**2. Refactor mechanical** — rename, restructure

```
"Đổi mọi `findByUuid` thành `findById` trong project"
→ Claude grep → sửa 15 file → chạy test
```

**3. Boilerplate test** — generate test từ implementation

```
"Viết test cho CoursesService theo pattern HealthService test"
→ Claude xem code service → sinh test đủ coverage
```

> 💡 Đây là 3 task TỐN time nhưng KHÔNG tốn não → để AI lo

---

## Slide 5 — Khi nào KHÔNG dùng AI?

### 4 trường hợp tự code tốt hơn

**1. Học khái niệm mới**
Đừng nhờ AI viết code event loop khi bạn muốn HIỂU event loop

**2. Quyết định kiến trúc**
"Có nên dùng Repository pattern không?" — phải bạn quyết, AI không có context business

**3. Debug logic phức tạp**
Đọc code + đặt breakpoint vẫn nhanh hơn giải thích bug cho AI

**4. Security-critical code**
Auth, encryption, payment — review từng dòng, không generate

> 🎯 **Quy tắc:** AI cho TASK CƠ HỌC. Tư duy thì bạn làm.

---

## Slide 6 — Cài Claude Code

### Yêu cầu

- **Node.js 18+** (đã có ở Video 7)
- **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))
- Terminal: Terminal.app/iTerm2 (macOS) hoặc Windows Terminal (Windows)

### Cài đặt

```bash
# Cả macOS và Windows
npm install -g @anthropic-ai/claude-code

# Kiểm tra
claude --version
# 1.x.x

# Setup API key (lần đầu)
claude
# → Prompt: nhập API key
# → Hoặc set env: ANTHROPIC_API_KEY=sk-ant-...
```

> 💡 API key được lưu local trong `~/.claude/` (macOS) hoặc `%USERPROFILE%\.claude\` (Windows)

---

## Slide 7 — Chạy Claude Code lần đầu

### Mở Claude trong project ai-lms

```bash
# Trong root project
cd ~/projects/ai-lms
claude
```

Output:
```
Welcome to Claude Code!
Project: ai-lms
Type your request, or use /help for commands

> _
```

**Thử lệnh đầu:**

```
> Đọc README.md và tóm tắt dự án này
```

→ Claude đọc → trả lời ngắn gọn bằng tiếng Việt

---

## Slide 8 — `CLAUDE.md`: "Quyển sổ tay" cho Claude

### Vì sao quan trọng?

Mỗi session mới, Claude **không biết gì** về project bạn:

- Stack gì? (NestJS hay Express?)
- Convention naming? (camelCase hay snake_case?)
- Folder structure? (apps/ packages/ hay src/?)
- Test framework? (Vitest hay Jest?)

**Giải pháp:** Tạo `CLAUDE.md` ở root → Claude tự đọc đầu session

```
ai-lms/
├── CLAUDE.md          ← Claude đọc tự động
├── apps/
├── packages/
└── README.md
```

---

## Slide 9 — Template `CLAUDE.md` cho dự án LMS

### File `/CLAUDE.md`

```markdown
# AI LMS — Claude Code Instructions

## Project Overview
AI-First Learning Management System. Backend NestJS + Frontend Next.js
(Course 4). Khóa 1 chỉ build backend foundation: monorepo + shared types +
NestJS skeleton + 3 endpoint (health, list courses, create course).

## Stack
- Node.js 20 LTS, TypeScript 5.4+ strict mode
- pnpm 9 workspaces (monorepo)
- NestJS 10 với Express adapter
- Zod 3 cho runtime validation
- nestjs-pino cho structured logging
- Vitest cho testing

## Folder Structure
- `apps/api/` — NestJS backend
- `packages/types/` — Shared Zod schemas + TS types
- `packages/config/` — env, pMap, retry, streams

## Naming Conventions
- File: `kebab-case.ts` (e.g. `course.service.ts`)
- Class: `PascalCase` (e.g. `CourseService`)
- Function/var: `camelCase`
- Const: `SCREAMING_SNAKE_CASE`
- Test file: `*.test.ts` cạnh source
- Import alias: `@lms/types`, `@lms/config`

## Commit Message
Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`

## Important Commands
- `pnpm verify` — chạy lint + typecheck + test (gate trước PR)
- `pnpm --filter @lms/api dev` — start NestJS server
- `pnpm --filter @lms/api test` — chạy test

## Do This
- ✅ Dùng Zod schema từ @lms/types, KHÔNG viết lại type
- ✅ Throw AppException subclass cho error (NotFoundException, ConflictException)
- ✅ Inject service qua constructor + @Injectable
- ✅ Test mỗi controller/service mới

## Don't Do This
- ❌ KHÔNG dùng `any` (ESLint sẽ chặn)
- ❌ KHÔNG hardcode env (dùng `env` từ @lms/config)
- ❌ KHÔNG dùng fs.readFileSync trong request handler
- ❌ KHÔNG commit .env

## When Adding a New Module
Pattern reference: `apps/api/src/modules/courses/`
1. Tạo folder modules/<name>/
2. Tạo controller.ts, service.ts, module.ts
3. Tạo repository interface + in-memory impl
4. Đăng ký vào AppModule
5. Viết test
```

---

## Slide 10 — Prompt hiệu quả: 3 tầng

### Tệ → OK → Tốt

**❌ Tệ — quá ngắn, không context:**

```
> Tạo endpoint lessons
```

→ Claude đoán → kết quả random, không đúng convention

**⚠️ OK — có context nhưng thiếu acceptance:**

```
> Tạo LessonsModule cho NestJS, có CRUD endpoints
```

→ Có hướng nhưng vẫn nhiều lựa chọn

**✅ Tốt — đầy đủ context + acceptance:**

```
> Tạo LessonsModule theo pattern apps/api/src/modules/courses/
>
> Yêu cầu:
> - Endpoint: GET /lessons, POST /lessons, GET /lessons/:id
> - Dùng LessonSchema từ @lms/types
> - Repository interface + InMemoryLessonRepository
> - Đăng ký vào AppModule
> - Viết test cho controller + service
>
> Acceptance:
> - pnpm typecheck pass 0 error
> - pnpm test pass tất cả test mới
```

---

## Slide 11 — Pattern prompt: "5 yếu tố"

### Mỗi prompt nên có

1. **What** — làm cái gì? (cụ thể, không vu vơ)
2. **Where** — file nào, folder nào?
3. **How** — theo pattern nào? (reference existing code)
4. **Constraints** — không được dùng gì?
5. **Acceptance** — đánh giá xong thế nào?

**Example:**

```
What:    Thêm endpoint GET /courses/:slug
Where:   apps/api/src/modules/courses/
How:     Pattern giống GET /courses, dùng repo.findBySlug()
Constraint: Throw NotFoundException nếu không có
Accept:  - curl /courses/xxx → 200 với PublicCourse
         - curl /courses/non-existent → 404
         - Test pass
```

---

## Slide 12 — Demo: Nhờ Claude tạo LessonsModule

### Thực hành thật

**Bạn gõ:**

```
> Tạo LessonsModule theo pattern modules/courses/, 3 endpoints
> (list, get by id, create), dùng LessonSchema từ @lms/types.
> Đăng ký vào AppModule. Sau khi xong chạy pnpm test verify.
```

**Claude sẽ:**

1. Đọc `modules/courses/` để hiểu pattern
2. Đọc `@lms/types` để biết `LessonSchema`
3. Tạo files:
   - `modules/lessons/lessons.module.ts`
   - `modules/lessons/lessons.controller.ts`
   - `modules/lessons/lessons.service.ts`
   - `modules/lessons/lessons.repository.ts`
   - `modules/lessons/repositories/in-memory.repository.ts`
4. Sửa `app.module.ts` thêm `LessonsModule`
5. Chạy `pnpm test`
6. Báo cáo kết quả

---

## Slide 13 — Review output của Claude

### Đừng tin tuyệt đối — luôn review

**Sau khi Claude xong, bạn:**

```
> Show diff các file mới tạo
```

**Check:**

- ✅ File path đúng chỗ?
- ✅ Naming convention theo `CLAUDE.md`?
- ✅ Có thiếu `@Injectable()` không?
- ✅ Repository pattern đúng không (interface + impl)?
- ✅ Test có meaningful không, hay chỉ "should be defined"?

**Hỏi tiếp nếu thấy chưa ổn:**

```
> Test bài 3 chỉ check "should be defined", viết test thật
> assert behavior (list trả đúng items, create insert vào store)
```

---

## Slide 14 — Lệnh hữu ích trong Claude Code

### Commands cần biết

| Lệnh | Tác dụng |
|------|---------|
| `/help` | Liệt kê mọi command |
| `/clear` | Xoá conversation history (start fresh) |
| `/init` | Sinh CLAUDE.md cho project |
| `/cost` | Xem token usage trong session |
| `/model` | Đổi model (Sonnet/Opus/Haiku) |
| `/agents` | Quản lý sub-agents |
| `/config` | Đổi config (theme, autocomplete) |

**Phím tắt:**

- `Esc` × 2 — interrupt Claude đang chạy
- `Up arrow` — gọi lại prompt trước
- `Ctrl+C` — exit Claude

---

## Slide 15 — Tệp `.claude/settings.json`: Cấu hình project

### Sinh tự động khi cần permission

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)"
    ]
  }
}
```

**Lợi ích:**

- ✅ Claude không hỏi permission cho command đã allow
- ✅ Chặn command nguy hiểm tự động
- ✅ Team chia sẻ setting qua git (.claude/settings.json commit được)

> ⚠️ KHÔNG commit `.claude/settings.local.json` — chứa API key cá nhân

---

## Slide 16 — Pattern: Iterative refinement

### Đừng kỳ vọng 1 prompt ra perfect

**Realistic workflow:**

```
Prompt 1: "Tạo LessonsModule"
  → Claude tạo skeleton

Prompt 2: "Thêm validation Zod cho POST"
  → Claude thêm ZodValidationPipe

Prompt 3: "Service phải dùng repository, không inject DB trực tiếp"
  → Claude refactor

Prompt 4: "Test fail ở line 23, xem và fix"
  → Claude debug + fix

Prompt 5: "Run pnpm verify"
  → Claude chạy + báo cáo

→ Total: 5 prompt × 30 giây = 2.5 phút cho 1 module hoàn chỉnh
```

vs **Tự code:** ~30-60 phút

---

## Slide 17 — Trick: Reference existing code

### "Như cái này nhưng cho X"

```
> Tạo UserModule giống CourseModule, đổi:
> - resource: user thay vì course
> - schema: UserSchema thay vì CourseSchema
> - không có slug (dùng id)
> - thêm endpoint GET /users/me (sẽ implement ở Khóa 2)
```

**Vì sao tốt?**

- ✅ Claude có pattern cụ thể để copy
- ✅ Đồng bộ codebase (mọi module trông giống nhau)
- ✅ Bạn không cần giải thích từ đầu

---

## Slide 18 — Trick: Acceptance test as prompt

### Mô tả test case → Claude implement đúng

```
> Implement GET /courses/:slug:
>
> Acceptance test:
> describe("GET /courses/:slug", () => {
>   it("returns 200 + PublicCourse if found", async () => {
>     const res = await request.get("/courses/react-101");
>     expect(res.status).toBe(200);
>     expect(res.body.slug).toBe("react-101");
>   });
>
>   it("returns 404 with NOT_FOUND code if not found", async () => {
>     const res = await request.get("/courses/non-existent");
>     expect(res.status).toBe(404);
>     expect(res.body.error.code).toBe("NOT_FOUND");
>   });
> });
>
> Run test sau khi implement, đảm bảo cả 2 pass.
```

→ Claude implement code + chạy test → xác nhận pass

---

## Slide 19 — Workflow thực tế hàng ngày

### 1 buổi sáng làm việc với Claude

```
9:00 - Mở claude, đọc CLAUDE.md
9:05 - "Tạo LessonsModule giống CoursesModule"
9:08 - Review diff, hỏi sửa 2 chỗ
9:15 - "Run pnpm verify"
9:16 - Verify pass → commit "feat: add lessons module"
9:20 - "Thêm endpoint GET /lessons/by-course/:courseId"
9:25 - Review + tweak
9:30 - Tự viết logic phức tạp (AI gen rồi mình tinh chỉnh)
```

**Tốc độ:** 1 module/30 phút thay vì 2-3 giờ

**Quan trọng:** Vẫn phải hiểu code Claude sinh ra — không phải copy-paste mù

---

## Slide 20 — Anti-pattern khi dùng Claude

### 5 lỗi phổ biến

**❌ 1. Dùng AI cho task quá lớn**

```
> Build toàn bộ Khóa 5 — AI integration
```

→ Output sẽ shallow, lỗi nhiều. Chia nhỏ ra.

**❌ 2. Không có CLAUDE.md**

→ Mỗi prompt phải giải thích lại convention

**❌ 3. Accept blindly**

→ Bug + tech debt tích luỹ

**❌ 4. Dùng AI thay vì học**

```
> Giải thích event loop là gì
```

→ OK, nhưng phải tự code thử để hiểu, không chỉ đọc

**❌ 5. Quên security review**

→ Auth, payment, file upload — review từng dòng

---

## Slide 21 — Cost management

### API có giá — track usage

**Pricing (tham khảo):**

- Claude Sonnet 4.5: ~$3/1M input tokens, $15/1M output
- Mỗi prompt ~1-5K tokens (đọc CLAUDE.md + code)
- Mỗi session làm việc: ~$0.10 - $1

**Tối ưu cost:**

1. Dùng `/clear` khi sang task khác (clear context)
2. CLAUDE.md ngắn gọn — không paste tất cả docs
3. Reference file bằng path, đừng paste content
4. Dùng Haiku cho task đơn giản (rẻ 10x)

**Xem usage:**

```bash
/cost
# Session cost: $0.23
# Total this month: $12.45
```

---

## Slide 22 — Khi dùng Claude vs Cursor

### Cùng task, công cụ khác

| Task | Tool tốt nhất |
|------|---------------|
| Autocomplete khi gõ | Cursor / Copilot |
| Refactor 1 file | Cursor (Cmd+K) |
| Sinh module mới đầy đủ | Claude Code |
| Refactor nhiều file | Claude Code |
| Debug + chạy test | Claude Code |
| Generate test boilerplate | Cả 2 đều OK |
| Explain code | Cả 2 đều OK |
| Edit khi đang ở IDE | Cursor |
| Edit từ CLI / SSH server | Claude Code |

> 💡 Dùng song song được — Claude cho task lớn, Cursor cho gõ nhanh

---

## Slide 23 — Tích hợp với Git

### Pattern thực tế

```
> Đọc git diff, viết commit message theo Conventional Commits
```

Claude sẽ:
1. Chạy `git diff --cached`
2. Phân tích thay đổi
3. Đề xuất message như:

```
feat(lessons): add LessonsModule with CRUD endpoints

- Add LessonsController with 3 endpoints
- Add LessonsService with repository pattern
- Add InMemoryLessonRepository
- Register module in AppModule
- Add controller/service tests
```

**Lệnh khác:**

```
> Tạo PR description từ commits trên branch
> Generate CHANGELOG từ git log tuần này
```

---

## Slide 24 — Sub-agents: Delegate task

### Claude có thể spawn agent con

```
> Dùng general-purpose agent để search xem có chỗ nào còn
> dùng `any` trong codebase không
```

Claude spawn sub-agent → search → trả về list → context window không bị clutter

**Use case:**

- Search rộng (nhiều file)
- Run long task (build, test suite)
- Independent research (mỗi agent 1 task)

---

## Slide 25 — Bài tập thực hành

### 🎯 Make Claude work for you

**Bài 1:** Tạo `CLAUDE.md` cho project

- Theo template Slide 9
- Tuỳ chỉnh cho dự án của bạn
- Commit `CLAUDE.md` vào git

**Bài 2:** Dùng Claude tạo `LessonsModule`

- Prompt theo pattern "5 yếu tố" (Slide 11)
- Review từng file
- Đảm bảo pass `pnpm verify`

**Bài 3:** Dùng Claude refactor

- Đổi tên `CoursesService.list()` → `findMany()`
- Quan sát Claude update tất cả callers

**Bài 4:** Dùng Claude debug

- Cố tình break 1 test
- Yêu cầu Claude fix với prompt: "test fail, xem và fix"

**Bài 5:** Thử sub-agent

- Yêu cầu Claude dùng Explore agent tìm tất cả `console.log` còn sót

---

## Slide 26 — Tổng kết Video 18

### Bạn vừa học

- ✅ Claude Code là gì, khác Cursor/Copilot thế nào
- ✅ Cài đặt + config trong dự án
- ✅ Viết `CLAUDE.md` chuẩn cho project
- ✅ 5 yếu tố của prompt tốt
- ✅ Pattern "reference existing code"
- ✅ Iterative refinement workflow
- ✅ Cost management + tích hợp Git
- ✅ Khi dùng AI vs khi tự code

> 💪 Tốc độ phát triển x3 — nhưng vẫn hiểu mọi dòng code

---

<!-- _class: lead -->

# Tiếp theo: Video 19

## Refactor Như Một Senior Engineer

Khi nào nên refactor, code smell phổ biến, Extract Function/Module pattern, setup ESLint + Prettier + Husky + lint-staged, `pnpm verify` gate.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 19 🚀

> *"AI is a force multiplier — for good engineers."*
