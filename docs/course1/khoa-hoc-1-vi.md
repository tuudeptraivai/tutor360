# KHÓA HỌC 1 — Khởi Tạo Nền Tảng AI LMS

## TypeScript + Node.js Foundations

---

## TỔNG QUAN DỰ ÁN

### AI-Powered LMS là dự án gì?

**AI-Powered LMS** là một **"AI-First Learning Management System"** — hệ thống quản lý học tập lấy AI làm trung tâm.

Dự án kết hợp ý tưởng từ:

- **Duolingo** — học tập cá nhân hóa và gamification
- **Coursera** — quản lý khóa học chuyên nghiệp
- **Khan Academy** — theo dõi tiến độ học tập
- **Notion** — giao diện tổ chức nội dung linh hoạt
- **Anthropic** — AI assistant thông minh

Tạo thành một nền tảng có khả năng:

- Quản lý khóa học
- Học tập cá nhân hóa bằng AI
- AI tóm tắt bài giảng tự động
- AI tạo quiz tự động
- Theo dõi tiến độ học tập
- Gửi thông báo và nhắc nhở học tập
- Phân tích dữ liệu thời gian thực cho giáo viên và học sinh

---

### Người dùng của hệ thống

**1. Học sinh (Students)**

Sử dụng để:

- Học online
- Xem bài giảng
- Làm quiz do AI tạo
- Theo dõi tiến độ học tập
- Nhận nhắc nhở học tập

**2. Giáo viên / Người tạo khóa học (Teachers / Course Creators)**

Sử dụng để:

- Tải lên bài giảng
- Tạo khóa học
- AI sinh quiz tự động
- Xem phân tích về học sinh
- Quản lý kết quả học tập

**3. EdTech Startups / Trường học**

Sử dụng để:

- Xây dựng LMS riêng
- Giáo dục có AI hỗ trợ
- Tự động hóa đánh giá học sinh
- Tăng mức độ tương tác trong học tập

---

### Các module của dự án

| STT | Module | Chức năng chính |
|-----|--------|----------------|
| 1 | **Authentication System** | Đăng ký, đăng nhập, OAuth Google, refresh token, phân quyền |
| 2 | **Course Management** | Tạo khóa học, upload bài giảng, quản lý chapter, ghi danh |
| 3 | **AI Lesson Summarization** | AI tóm tắt bài giảng, PDF, transcript video |
| 4 | **AI Quiz Generation** | Sinh quiz tự động, nhiều mức độ khó |
| 5 | **Student Dashboard** | Theo dõi tiến độ, streak học tập, gợi ý cá nhân hóa |
| 6 | **Notification & Reminder** | Email, push notification, background jobs |
| 7 | **AI Recommendation Engine** | Gợi ý bài học, lộ trình học tập cá nhân hóa |
| 8 | **Quiz & Results** | Làm bài, chấm điểm tự động, leaderboard |
| 9 | **Admin Dashboard** | Quản lý người dùng, thống kê AI usage |
| 10 | **Infrastructure** | Docker, CI/CD, monitoring, deployment |

---

### Kiến trúc tổng thể

| Tầng | Công nghệ | Chức năng |
|------|----------|-----------|
| **Frontend** | React App | Dashboard, course page, quiz, analytics |
| **Backend API** | Hono / Fastify Server | Auth, course, AI, analytics API |
| **Database** | PostgreSQL | Lưu users, courses, lessons, quizzes |
| **Cache Layer** | Redis | AI caching, session, rate limiting |
| **Queue System** | BullMQ Workers | Email reminder, AI jobs, scheduled notification |
| **AI Layer** | Claude API | Tóm tắt bài giảng, sinh quiz, gợi ý, AI tutor |

---

## KHÓA HỌC 1 — CHI TIẾT

### Mục tiêu khóa học

Khởi tạo nền móng vững chắc cho toàn bộ hệ thống LMS.

### Kết quả cuối khóa (Final Output)

- ✅ Monorepo hoàn chỉnh
- ✅ Backend skeleton sẵn sàng mở rộng
- ✅ Shared TypeScript packages (kiểu dữ liệu dùng chung)
- ✅ Quy trình làm việc với Claude Code
- ✅ Developer tooling đầy đủ

### Thông tin khóa học

- **Tổng số video:** 20
- **Stack chính:** TypeScript 5.4+, Node.js 20 LTS, pnpm 9, NestJS 10, Zod 3, Vitest
- **Trạng thái:** Backend Foundations — chưa có Frontend, Database thật, AI, Redis

---

## SECTION 1 — Thiết Lập Dự Án (Project Setup)

### Video 1: Chào mừng đến với dự án AI LMS

**Nội dung:**

- Giới thiệu tổng quan dự án và lộ trình 8 khóa
- Demo sản phẩm hoàn chỉnh ở cuối hành trình
- Vì sao dự án này phù hợp cho portfolio cấp cao
- Cách học hiệu quả nhất với chuỗi khóa học

### Video 2: Hiểu Kiến Trúc Toàn Diện Của LMS

**Nội dung:**

- Vẽ sơ đồ kiến trúc cấp cao: Frontend ↔ Backend ↔ Database ↔ Cache ↔ Queue ↔ AI
- Mỗi tầng làm gì, vì sao cần thiết
- Luồng dữ liệu khi học sinh làm quiz
- Định vị Khóa 1 trong toàn bộ bức tranh

### Video 3: Lên Kế Hoạch Monorepo

**Nội dung:**

- Tại sao dùng monorepo cho dự án này
- So sánh **monorepo** vs **polyrepo**
- Cấu trúc thư mục: `apps/`, `packages/`
- Giới thiệu pnpm workspaces và Turborepo
- Quy ước đặt tên package (`@lms/types`, `@lms/config`, `@lms/api`)

### Video 4: Thiết Lập Môi Trường Phát Triển

**Nội dung:**

- Cài Node.js 20 LTS qua `nvm`
- Cài `pnpm 9`
- Cấu hình VSCode: ESLint, Prettier, EditorConfig
- Tạo file `.nvmrc`, `.editorconfig`, `.gitignore`
- Khởi tạo Git repository và commit đầu tiên

---

## SECTION 2 — Nền Tảng TypeScript

### Video 5: Cơ Bản Về TypeScript

**Nội dung:**

- TypeScript khác JavaScript ở điểm nào
- Các kiểu dữ liệu cơ bản: `string`, `number`, `boolean`, `array`, `object`
- Type vs Interface — khi nào dùng cái nào
- Type inference và type annotation
- Union types và literal types

### Video 6: Cấu Hình TypeScript Strict

**Nội dung:**

- Vì sao **strict mode** là bắt buộc trong dự án production
- Cấu hình `tsconfig.base.json` với:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true`
  - `noImplicitOverride: true`
- Pattern `extends` cho các package con
- Cách xử lý lỗi strict thường gặp

### Video 7: Interfaces và Generics

**Nội dung:**

- Interface nâng cao: extends, implements
- Generics cơ bản: `<T>`, `<T extends ...>`
- Generic functions và generic classes
- Utility types: `Partial`, `Pick`, `Omit`, `Record`
- Xây dựng `Result<T, E>` và `ApiResponse<T>` dùng chung

### Video 8: Validation Runtime với Zod

**Nội dung:**

- Vì sao TypeScript không đủ — runtime validation là gì
- Cài đặt Zod và tạo schema đầu tiên
- `z.object`, `z.string`, `z.number`, `z.enum`, `z.array`
- Refinement và transformations
- `safeParse` vs `parse` — chọn cái nào
- `z.infer<typeof X>` — sinh TypeScript type từ schema

### Video 9: Kiến Trúc Shared Types

**Nội dung:**

- Tạo package `@lms/types`
- Định nghĩa domain schemas: `UserSchema`, `CourseSchema`, `LessonSchema`, `QuizSchema`, `EnrollmentSchema`
- DTOs cho input API: `CreateCourseDto`, `UpdateCourseDto`
- View models cho response: `PublicCourse`, `CourseListItem`
- Cấu hình `package.json` export đúng cách để package nội bộ dùng được

---

## SECTION 3 — Nền Tảng Node.js

### Video 10: Hiểu Event Loop

**Nội dung:**

- Event loop là gì, vì sao Node.js single-thread vẫn nhanh
- 6 pha của event loop: timers → pending callbacks → poll → check → close → microtasks
- `process.nextTick` vs `Promise.then` vs `setTimeout(0)` vs `setImmediate`
- Viết demo `event-loop.ts` in ra thứ tự log thực tế
- Hiểu khi nào code bị block

### Video 11: Async/Await và Concurrency

**Nội dung:**

- Callback → Promise → async/await
- `Promise.all`, `Promise.allSettled`, `Promise.race`
- Xây dựng helper `pMap<T, R>` giới hạn concurrency
- Xây dựng helper `retry` với exponential backoff + jitter
- Lỗi thường gặp: floating promises, unhandled rejections

### Video 12: Streams và File System

**Nội dung:**

- Vì sao stream tốt hơn `readFile` cho file lớn
- `Readable`, `Writable`, `Transform`, `Duplex` streams
- `pipeline` vs `pipe` — chọn cái nào
- Viết `streamCopy(src, dst)` — copy file 1GB không cần 1GB RAM
- Viết `streamHash(src, "sha256")` — hash file dạng stream
- Backpressure là gì

### Video 13: Biến Môi Trường và Configs

**Nội dung:**

- Vì sao không hardcode config vào code
- `dotenv` và file `.env`, `.env.example`
- Validate biến môi trường bằng Zod ở thời điểm khởi động
- Module `env.ts` với fail-fast khi thiếu biến quan trọng
- Quản lý nhiều môi trường: development, test, production
- Bảo mật: không commit `.env`, dùng secret manager ở production

---

## SECTION 4 — Backend Skeleton (NestJS)

### Video 14: Khởi Tạo API Server

**Nội dung:**

- Giới thiệu NestJS — vì sao chọn framework này
- Khái niệm cốt lõi: Module, Controller, Service, Provider
- Tạo `apps/api` với `nest-cli`
- Viết `main.ts`, `app.module.ts`, `HealthModule`
- Chạy `pnpm dev` và gọi `GET /health` thành công

### Video 15: Cơ Bản về REST API

**Nội dung:**

- REST là gì, các HTTP methods (GET, POST, PUT, PATCH, DELETE)
- HTTP status codes: 2xx, 3xx, 4xx, 5xx
- Resource design: `/courses`, `/courses/:id`, `/courses/:id/lessons`
- Tạo `CoursesController` với endpoint `GET /courses` và `POST /courses`
- Pagination: `page`, `pageSize`, `sort`, `filter`
- Pattern **Repository** — tách logic truy cập dữ liệu

### Video 16: Middleware và Logging

**Nội dung:**

- Middleware là gì trong NestJS
- Viết `RequestIdMiddleware` — gán `x-request-id` cho mỗi request
- Cấu hình `nestjs-pino` cho structured JSON logging
- Viết `LoggingInterceptor` — log method, path, status, duration
- Phân biệt log level: `info`, `warn`, `error`
- Vì sao request ID giúp debug production

### Video 17: Nền Tảng Xử Lý Lỗi

**Nội dung:**

- Phân loại lỗi: validation, not found, conflict, unauthorized, internal
- Xây dựng cấu trúc `AppException` kế thừa `HttpException`
- Các subclass: `ValidationException`, `NotFoundException`, `ConflictException`, `UnauthorizedException`
- Viết `AllExceptionsFilter` — bắt mọi exception và trả format chuẩn
- Viết `ZodValidationPipe` — validate request body bằng Zod tự động
- Contract chuẩn cho error response: `{ ok, error: { code, message, details }, requestId }`
- Không bao giờ leak stack trace ra client

---

## SECTION 5 — Quy Trình Phát Triển

### Video 18: Claude Code Cho Tốc Độ Phát Triển

**Nội dung:**

- Giới thiệu Claude Code — AI coding assistant
- Cài đặt và cấu hình ban đầu
- Viết file `CLAUDE.md` — chỉ dẫn cho Claude về dự án
  - Tổng quan dự án (5 dòng)
  - Stack và cấu trúc
  - Quy ước đặt tên
  - Format commit message (Conventional Commits)
  - "Do this / Don't do this"
- Cách prompt hiệu quả: cụ thể, có context, có acceptance criteria
- Demo: nhờ Claude tạo một module mới đúng convention dự án

### Video 19: Refactor Như Một Senior Engineer

**Nội dung:**

- Khi nào nên refactor — quy tắc "Rule of Three"
- Code smell phổ biến: duplicate code, long function, deep nesting
- Pattern **Extract Function**, **Extract Module**, **Replace Magic Number**
- Refactor `CoursesService` để dùng Repository pattern
- Setup ESLint + Prettier + Husky + lint-staged
- Cấu hình `pnpm verify` = `lint + typecheck + test + build`
- Pre-commit hook chặn code xấu vào repository

### Video 20: Chuẩn Bị Cho Các Module Backend

**Nội dung:**

- Tổng kết những gì đã học ở Khóa 1
- Checklist deliverables:
  - Monorepo build clean
  - `pnpm verify` exit 0
  - NestJS API chạy `:3000` với `GET /health`, `GET /courses`, `POST /courses`
  - Package `@lms/types` đủ 5 domain schemas
  - Package `@lms/config` có `env`, `pMap`, `retry`, `streamCopy`, `streamHash`
  - Đủ infra: `RequestIdMiddleware`, `LoggingInterceptor`, `AllExceptionsFilter`, `ZodValidationPipe`
  - `CLAUDE.md`, `README.md`, `.env.example`
- Tag Git `course-1-complete`
- Preview Khóa 2: Authentication & Authorization
- Bài tập tự luyện kéo dài 1 tuần trước khi sang khóa sau

---

## LUỒNG SỬ DỤNG THỰC TẾ CỦA SẢN PHẨM CUỐI

> Đây là viễn cảnh khi đã hoàn thành toàn bộ 8 khóa. Khóa 1 chỉ xây nền móng cho luồng này.

**Bước 1 — Giáo viên tạo khóa học:** "Introduction to System Design"

**Bước 2 — Upload nội dung:** `lecture.pdf`, transcript bài giảng, `slides.pptx`

**Bước 3 — AI xử lý tự động:**

- Tóm tắt bài học
- Sinh flashcard
- Sinh quiz

**Bước 4 — Học sinh mở dashboard:**

- Xem tiến độ học
- Làm quiz
- Xem gợi ý từ AI

**Bước 5 — BullMQ worker chạy nền:**

- Gửi email nhắc nhở
- Thông báo trì hoãn
- Job xử lý AI

**Bước 6 — Redis cache:**

- AI summaries
- Recommendations
- Quiz results

**Bước 7 — Thông báo gửi tới học sinh:**

> "Bạn có quiz cần hoàn thành hôm nay"

---

## GIÁ TRỊ KHÓA HỌC

### Vì sao dự án này mạnh cho portfolio?

Nó cover toàn bộ kỹ năng cần có của một fullstack senior:

- Frontend engineering
- Backend engineering
- AI engineering
- Kiến trúc caching
- Hệ thống queue
- Scalable API
- Educational analytics
- Production deployment

### Sau khi hoàn thành học viên có gì?

**1. Một sản phẩm AI SaaS cấp production**

Không phải CRUD app đơn giản — mà là hệ thống thật, sẵn sàng đem đi pitch.

**2. Portfolio fullstack rất mạnh** bao gồm:

- AI integration
- Redis caching
- Queue system
- Analytics
- Notifications
- Backend có khả năng scale
- Docker
- CI/CD

**3. Kinh nghiệm gần với startup EdTech thật**

Kiểu kiến trúc mà các AI education startup, SaaS learning platform, modern LMS đang sử dụng ngày nay.

---

## NHỮNG GÌ KHÔNG THUỘC KHÓA 1

Để tránh hiểu lầm về phạm vi:

| Tính năng | Thuộc khóa nào |
|-----------|---------------|
| ❌ Frontend (Next.js / React / TanStack Query) | **Khóa 4** — Student Dashboard |
| ❌ Giao diện UI / Tailwind | **Khóa 4** |
| ❌ Database thật (PostgreSQL / Prisma) | **Khóa 3** |
| ❌ Auth (JWT, OAuth Google) | **Khóa 2** |
| ❌ AI integration (Claude API) | **Khóa 5** |
| ❌ Redis / BullMQ | **Khóa 6** |
| ❌ Testing chuyên sâu, E2E | **Khóa 7** |
| ❌ Docker / CI/CD / Deploy | **Khóa 8** |

---

## TÀI LIỆU LIÊN QUAN

- **Spec kỹ thuật chi tiết:** [planK1.md](planK1.md) — kỹ thuật từng feature, function, endpoint
- **CRUD chuẩn cho resource Course:** [crud-courses.md](crud-courses.md) — Schema Zod + DB DDL + 7 endpoints + state machine + test matrix
- **Task breakdown:** [task.md](task.md)
- **Trello board CSV:** [trello-course-1.csv](trello-course-1.csv)
