---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 20: Chuẩn Bị Cho Các Module Backend'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Chuẩn Bị Cho
# Các Module Backend

### Khóa 1 — Video 20 (Final)

**Tổng kết hành trình — chuẩn bị cho Khóa 2**

> 20 video. Bạn vừa xây nền cho cả 7 khóa còn lại.

---

## Slide 2 — Mục tiêu video cuối

Sau 20 phút, bạn sẽ:

- ✅ **Tổng kết** những gì đã học trong Khóa 1
- ✅ **Checklist deliverables** đầy đủ
- ✅ Tag Git **`course-1-complete`** đúng cách
- ✅ Preview **Khóa 2** — Authentication & Authorization
- ✅ Nhận **bài tập tự luyện 1 tuần** trước khi sang khóa sau
- ✅ Biết **resources** học thêm

> 🎯 Cuối video: bạn closing Khóa 1 với cảm giác "đã làm xong cái gì đó thật"

---

## Slide 3 — Hành trình 20 video

### 5 Section × ~4 video

```
Section 1 — Project Setup        (V1-V4)
   ├─ Welcome
   ├─ Architecture overview
   ├─ Monorepo planning
   └─ Dev environment setup

Section 2 — TypeScript            (V5-V9)
   ├─ TS basics
   ├─ Strict mode
   ├─ Interfaces + Generics
   ├─ Zod runtime validation
   └─ Shared types architecture

Section 3 — Node.js               (V10-V13)
   ├─ Event loop
   ├─ Async/await + concurrency
   ├─ Streams
   └─ Env + configs

Section 4 — Backend NestJS        (V14-V17)
   ├─ API server bootstrap
   ├─ REST API design
   ├─ Middleware + logging
   └─ Error handling

Section 5 — Workflow              (V18-V20)
   ├─ Claude Code workflow
   ├─ Refactoring + tooling
   └─ Wrap up + next steps  ← BẠN ĐANG Ở ĐÂY
```

---

## Slide 4 — Stack bạn đã master

### 8 công nghệ + tools

| Layer | Tool | Confident? |
|-------|------|-----------|
| Runtime | Node.js 20 LTS | ✅ |
| Language | TypeScript 5.4 strict | ✅ |
| Package manager | pnpm 9 workspaces | ✅ |
| Backend framework | NestJS 10 | ✅ |
| Validation | Zod 3 | ✅ |
| Logging | nestjs-pino | ✅ |
| Testing | Vitest | ✅ |
| Linting | ESLint + Prettier + Husky | ✅ |

> 💪 8 công nghệ này là **stack core của 90% backend production Node** hiện nay

---

## Slide 5 — Checklist deliverables — Monorepo

### Section 1 outputs

- [ ] Folder structure đúng: `apps/`, `packages/`
- [ ] `pnpm-workspace.yaml` khai báo `apps/*` + `packages/*`
- [ ] Root `package.json` với scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `verify`
- [ ] `tsconfig.base.json` strict mode bật đủ flag
- [ ] `.gitignore`, `.editorconfig`, `.nvmrc` (`20`)
- [ ] `README.md` với getting started
- [ ] `CLAUDE.md` với conventions
- [ ] Git repo initialized, ít nhất 1 commit theo Conventional Commits

**Verify:**

```bash
pnpm install        # exit 0
pnpm typecheck      # 0 errors
```

---

## Slide 6 — Checklist deliverables — Shared packages

### `@lms/types`

- [ ] `package.json` name `@lms/types`, main point `./src/index.ts`
- [ ] 5 domain schemas: `UserSchema`, `CourseSchema`, `LessonSchema`, `QuizSchema`, `EnrollmentSchema`
- [ ] Enums: `RoleEnum`, `CourseLevelEnum`, `CourseStatusEnum`
- [ ] DTOs: `CreateCourseDto`, `UpdateCourseDto`
- [ ] ViewModels: `PublicCourse`, `CourseListItem`
- [ ] Utils: `Result<T,E>`, `ApiResponse<T>`, `Page<T>`, `Repository<T>`

### `@lms/config`

- [ ] Validated `env` với fail-fast
- [ ] `pMap` + `retry` với jitter
- [ ] `streamCopy` + `streamHash`
- [ ] `isProduction`, `isDevelopment`, `isTest`

**Verify:**

```bash
# apps/api có thể import được
import { CourseSchema, env, pMap } from "@lms/types";
import { env, pMap, streamCopy } from "@lms/config";
```

---

## Slide 7 — Checklist deliverables — NestJS API

### `apps/api/`

- [ ] NestJS app chạy `pnpm dev` thành công
- [ ] Listen port từ `env.PORT` (default 3000)
- [ ] Endpoint `GET /health` trả `{ status, uptime, version, timestamp }`
- [ ] Endpoint `GET /courses` với pagination + filter + sort
- [ ] Endpoint `POST /courses` với validation + conflict detection
- [ ] `InMemoryCourseRepository` implement `CourseRepository` interface
- [ ] `CoursesService` + `CoursesController` clean, dùng repository

### Infra layer

- [ ] `RequestIdMiddleware` — gán `x-request-id`
- [ ] `LoggingInterceptor` — log mỗi request
- [ ] `AllExceptionsFilter` — format error chuẩn
- [ ] `ZodValidationPipe` — validate body/query
- [ ] `AppException` hierarchy: `ValidationException`, `NotFoundException`, `ConflictException`, `UnauthorizedException`

---

## Slide 8 — Checklist deliverables — Tooling

### Developer experience

- [ ] ESLint với rules: `no-explicit-any`, `no-floating-promises`, `consistent-type-imports`
- [ ] Prettier với config thống nhất
- [ ] Husky pre-commit hook
- [ ] lint-staged chỉ check file đã add
- [ ] `pnpm verify` = format + lint + typecheck + test + build, exit 0
- [ ] `.env.example` với mọi key cần thiết

### Test coverage

- [ ] Test cho `packages/types` Zod schemas
- [ ] Test cho `packages/config` (env, pMap, retry)
- [ ] Test cho `HealthController`, `CoursesController`
- [ ] Test cho middleware, interceptor, filter, pipe

---

## Slide 9 — Verify cuối khóa: 1 lệnh

### Chạy `pnpm verify`

```bash
cd ai-lms
pnpm verify
```

**Expected output:**

```
✓ Format check pass (Prettier)
✓ Lint pass (ESLint, 0 errors)
✓ Typecheck pass (TS strict)
✓ Test pass
  - packages/types: 12/12
  - packages/config: 15/15
  - apps/api: 23/23
✓ Build pass
  - packages/types: built
  - packages/config: built
  - apps/api: built

🎉 All checks passed. Ready to commit/tag.
```

→ Nếu pass → bạn đã hoàn thành Khóa 1

---

## Slide 10 — Tag Git: `course-1-complete`

### Đánh dấu cột mốc

```bash
# Đảm bảo working tree clean
git status
# nothing to commit, working tree clean

# Tag với annotated message
git tag -a course-1-complete -m "Complete Course 1: Bootstrapping AI LMS

Monorepo + Shared packages + NestJS skeleton + Tooling.
Ready for Course 2: Authentication."

# Push tag lên remote (nếu có)
git push origin course-1-complete

# Verify
git tag -l
# course-1-complete
```

> 💡 Tag = bookmark — bạn có thể `git checkout course-1-complete` bất cứ lúc nào để xem snapshot

---

## Slide 11 — Snapshot codebase cuối Khóa 1

### Cấu trúc đầy đủ

```
ai-lms/
├── apps/
│   └── api/                          ← NestJS backend
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── modules/
│       │   │   ├── health/
│       │   │   └── courses/
│       │   └── common/
│       │       ├── middleware/
│       │       ├── interceptors/
│       │       ├── filters/
│       │       ├── pipes/
│       │       └── errors/
│       └── package.json
├── packages/
│   ├── types/                        ← Domain schemas + types
│   ├── config/                       ← env, utils
│   └── eslint-config/                ← ESLint preset
├── .husky/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── CLAUDE.md
├── README.md
└── package.json
```

---

## Slide 12 — Câu hỏi tự kiểm tra

### 10 câu để chắc rằng bạn đã hiểu

1. Vì sao chọn monorepo cho dự án này?
2. `type` vs `interface` — khi nào dùng cái nào?
3. `noUncheckedIndexedAccess` bắt được lỗi gì?
4. `Promise.all` vs `Promise.allSettled` — khi nào dùng?
5. `pipeline` vs `pipe` — khác biệt là gì?
6. Vì sao validate env phải fail-fast?
7. NestJS `Module` chứa những gì?
8. Repository pattern giải quyết vấn đề gì?
9. Vì sao tách `AppException` từ `HttpException`?
10. Quy tắc Rule of Three trong refactor là gì?

> 💡 Trả lời được 8/10 → tự tin sang Khóa 2

---

## Slide 13 — Bài tập tự luyện 1 tuần

### Trước khi sang Khóa 2

**Bài 1 — Mở rộng API (2 ngày):**

Thêm 3 endpoint:
- `GET /courses/:slug` — get by slug
- `PATCH /courses/:slug` — partial update
- `DELETE /courses/:slug` — soft delete

Yêu cầu:
- Theo pattern hiện tại
- Test đầy đủ
- Pass `pnpm verify`

---

## Slide 14 — Bài tập (tiếp)

### Bài 2 — Tạo LessonsModule (2 ngày)

- Module mới `modules/lessons/`
- 4 endpoint: list, get by id, create, delete
- `LessonRepository` interface + in-memory impl
- Lessons thuộc về 1 course (`courseId`)
- Endpoint nested: `GET /courses/:courseId/lessons`

### Bài 3 — Seed data + UI test (1 ngày)

- Tạo seed file: 50 courses + 200 lessons random
- Tạo file `.http` test tất cả endpoint
- Document trong README cách dùng

### Bài 4 — Documentation (2 ngày)

- Viết `API.md` mô tả mọi endpoint
- Viết `ARCHITECTURE.md` giải thích folder structure
- Vẽ sơ đồ dependency packages → app

---

## Slide 15 — Resources học thêm

### Sách

- 📖 **"Refactoring"** — Martin Fowler (đặc biệt cho Video 19)
- 📖 **"Clean Architecture"** — Robert C. Martin
- 📖 **"Designing Data-Intensive Applications"** — Martin Kleppmann (cho Khóa 3+)

### Docs chính chủ

- TypeScript Handbook: [typescriptlang.org/docs](https://www.typescriptlang.org/docs)
- NestJS Docs: [docs.nestjs.com](https://docs.nestjs.com)
- Zod Docs: [zod.dev](https://zod.dev)
- Node.js Best Practices: [github.com/goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices)

### YouTube (Tiếng Anh)

- Theo dõi Matt Pocock cho TypeScript advanced
- Channel "Programming with Mosh" cho intro patterns

---

## Slide 16 — Preview Khóa 2: Authentication & Authorization

### Khóa 2 sẽ thêm

```
┌─────────────────────────────────┐
│  Khóa 1: Backend skeleton ✅    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Khóa 2: Auth & Authorization   │  ← BẠN SẮP HỌC
│  - User signup / login          │
│  - JWT access + refresh token   │
│  - OAuth Google                 │
│  - Password hashing (bcrypt)    │
│  - Guards: AuthGuard, RoleGuard │
│  - RBAC: student/teacher/admin  │
│  - Rate limiting (basic)        │
└─────────────────────────────────┘
```

**Endpoint mới:**
- `POST /auth/signup`, `POST /auth/login`
- `POST /auth/refresh`, `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/google` (OAuth)

---

## Slide 17 — Khóa 2 dùng lại gì từ Khóa 1?

### 80% code bạn vừa viết

✅ **Reuse 100%:**

- `@lms/types` — `UserSchema`, `RoleEnum`
- `@lms/config` — env, pMap, retry
- NestJS skeleton — Module/Controller/Service pattern
- Error handling — `UnauthorizedException`, `ForbiddenException`
- Logging stack — đã có request ID
- Validation pipeline — Zod
- Tooling — ESLint, Prettier, Husky

⚠️ **Thêm mới ở Khóa 2:**

- `AuthModule`, `JwtStrategy`, `AuthGuard`
- Password hashing utilities
- OAuth Google integration
- Permission system

---

## Slide 18 — Lộ trình 8 khóa: Bạn đang ở đâu

```
✅ Khóa 1: Bootstrapping ← VỪA XONG
⬜ Khóa 2: Auth & Authorization
⬜ Khóa 3: Database (PostgreSQL + Prisma)
⬜ Khóa 4: Frontend (Next.js + TanStack Query)
⬜ Khóa 5: AI Integration (Claude API)
⬜ Khóa 6: Cache + Queue (Redis + BullMQ)
⬜ Khóa 7: Testing chuyên sâu (E2E, integration)
⬜ Khóa 8: Production (Docker + CI/CD + Deploy)
```

**Sau Khóa 8:** Bạn có AI SaaS product hoàn chỉnh + portfolio cấp senior

---

## Slide 19 — Lời khuyên cho hành trình tiếp theo

### 5 điều quan trọng

**1. Code along — không xem suông**
Mỗi video → mở IDE, gõ lại, hiểu

**2. Đừng skip bài tập**
Bài tập = nơi kiến thức biến thành kỹ năng

**3. Commit thường xuyên**
Git history = bằng chứng tiến bộ. Sau Khóa 8: 500+ commits

**4. Nghỉ ngơi giữa các khóa**
Đừng cố học 8 khóa trong 2 tuần. 1 khóa/2 tuần là tốc độ healthy

**5. Build phụ project song song**
Áp dụng concept đã học vào idea của riêng bạn

---

## Slide 20 — Bạn đã trở thành ai?

### So với 20 video trước

**Trước Khóa 1:**

- "Biết Node.js cơ bản"
- "Đụng vào TypeScript chút chút"
- "Tutorial-driven developer"

**Sau Khóa 1:**

- ✅ Setup monorepo production-grade từ đầu
- ✅ TypeScript strict mode + Zod validation
- ✅ Hiểu event loop, async, streams sâu
- ✅ Build NestJS API với architecture senior
- ✅ Tooling automation (linting, hooks, CI)
- ✅ Làm việc hiệu quả với AI assistant

> 💪 **Bạn KHÔNG còn là junior nữa** — bạn là engineer có method

---

## Slide 21 — Show your work

### Commit ngay lên GitHub portfolio

```bash
# Push lên GitHub
git remote add origin git@github.com:username/ai-lms.git
git push -u origin main
git push origin course-1-complete

# README đẹp
# Demo URL (Khóa 8 sẽ deploy)
# Screenshots
```

**Tự giới thiệu trên LinkedIn:**

> "Just completed Course 1 of AI LMS — building production-grade monorepo with NestJS, TypeScript strict, Zod, structured logging. Repository: github.com/.../ai-lms"

→ **Recruiter sẽ click link.** Hứa luôn.

---

## Slide 22 — Cảm ơn bạn đã đồng hành

### Khóa 1 chính thức hoàn thành 🎉

**20 video, ~10 giờ học, 1 codebase production-ready.**

Bạn đã:

- Build được nền tảng vững chắc
- Học architecture của senior engineer
- Có portfolio piece thực sự
- Sẵn sàng cho 7 khóa thử thách hơn

> 🚀 **Hẹn gặp bạn ở Khóa 2!**

---

## Slide 23 — Nghỉ 1 tuần, rồi gặp lại

### Schedule khuyến nghị

**Tuần này (sau khi xem Video 20):**

- Ngày 1-3: Làm bài tập 1 (mở rộng API)
- Ngày 4-5: Làm bài tập 2 (LessonsModule)
- Ngày 6: Bài tập 3 (seed + .http test)
- Ngày 7: Bài tập 4 (documentation) + nghỉ ngơi

**Tuần sau:**

- Bắt đầu Khóa 2 với năng lượng mới

> 💡 **Đừng burn out.** Học bền bỉ tốt hơn học gấp gáp.

---

## Slide 24 — Final words

### Một câu nói

> *"The only way to learn a new programming language is by writing programs in it."*
>
> *— Brian Kernighan*

**Áp dụng cho Khóa 1:**

Không phải xem 20 video.

Không phải đọc 20 file slide này.

Mà là **code 20 video — bằng tay**.

---

<!-- _class: lead -->

# Khóa 1 hoàn thành! 🎉

### Hẹn gặp bạn ở Khóa 2

## Authentication & Authorization

JWT, OAuth Google, password hashing, RBAC, rate limiting.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Chúc bạn thành công!

### Tiếp tục hành trình của một fullstack senior 🚀

> *"You don't have to be great to start.*
> *But you have to start to be great."*
> *— Zig Ziglar*
