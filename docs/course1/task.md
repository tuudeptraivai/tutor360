# Course 1 — Task List

> Bản markdown của [trello-course-1.csv](trello-course-1.csv) — dùng để track tiến độ trực tiếp trong repo. Tick `[x]` khi hoàn thành.
>
> **Scope theo syllabus PDF:** Course 1 chỉ làm **Backend Foundations + Monorepo + Shared Packages**. Frontend (Next.js, UI screens) thuộc **Course 4** — xem [../course4/ui-screens.md](../course4/ui-screens.md).
>
> **CRUD design canonical** cho resource `Course` (Schema Zod + DB DDL + 7 endpoints + state machine + test matrix): [crud-courses.md](crud-courses.md).

---

## Epic 1 — Project Setup

### F1.1 Monorepo Workspace
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Tooling`
- **Spec:** Setup pnpm workspaces — Course 1 chỉ tạo `apps/api` (NestJS). `apps/web` sẽ thêm ở Course 4.
- **Files:** `/pnpm-workspace.yaml` (glob `apps/*` + `packages/*`), `/package.json` (root), `/turbo.json`.
- **Folder:** `apps/api` (NestJS), `packages/types`, `packages/config`, `packages/eslint-config`.
- **Root scripts:** `dev`, `build`, `lint`, `typecheck`, `test`, `verify`.
- **AC:** `pnpm install` exit 0 · `pnpm -r run typecheck` pass 0 lỗi.

### F1.2 Git & Tooling Bootstrap
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Tooling`
- **Files:** `/.gitignore` (Node + `.next` + `dist` + `.env*`), `/.editorconfig`, `/.nvmrc` (20), `/CLAUDE.md`, `/README.md`.
- **AC:** `git status` sau `pnpm install` không có `node_modules`, `.next`, `dist`.

---

## Epic 2 — TypeScript

### F2.1 Strict tsconfig.base.json
- [ ] **Status:** Todo
- **Labels:** `Feature` · `TypeScript` · `Config`
- **File:** `/tsconfig.base.json`.
- **Options:** `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `isolatedModules`, `declaration`, `sourceMap`, `experimentalDecorators true`, `emitDecoratorMetadata true` (cho NestJS DI).
- **Per-package:** extends + paths alias.
- **AC:** code dùng `any` ngầm phải fail typecheck.

### F2.2 Generic Utility Types
- [ ] **Status:** Todo
- **Labels:** `Feature` · `TypeScript` · `SharedTypes`
- **File:** `/packages/types/src/utils.ts`.
- **Types:** `ApiSuccess<T>`, `ApiFailure`, `ApiResponse<T>` (discriminated union), `Result<T,E>` + `Ok`/`Err` helpers, `Repository<T,ID>` interface, `PageRequest`, `Page<T>`.
- **AC:** TS narrow được sau `if (res.ok)` · `Ok(1)` có type `Result<number, never>`.

### F2.3 Zod Domain Schemas
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Validation` · `SharedTypes`
- **File:** `/packages/types/src/schemas.ts`.
- **Spec đầy đủ:** [crud-courses.md §2](crud-courses.md).
- **Schemas:** `RoleEnum`, `UserSchema`, `LessonSchema`, `QuizSchema`, `EnrollmentSchema`, + **Course bundle** đầy đủ: `CourseLevelEnum`, `CourseStatusEnum`, `SlugSchema`, `CourseSchema` (15 field: id, slug, title, description, level, tags, coverImageUrl, priceCents, status, teacherId, version, publishedAt, createdAt, updatedAt, deletedAt).
- **DTOs:** `CreateCourseDto = CourseSchema.pick(...)`, `UpdateCourseDto = CreateCourseDto.partial()`, `PublicCourseSchema = CourseSchema.omit({deletedAt})`, `CourseListItemSchema = CourseSchema.pick(...)`.
- **AC:** parse reject thiếu `title` / slug sai regex / priceCents âm · `z.infer` khớp manual types · 5 Course schemas khớp 1-1 với `crud-courses.md §2`.

### F2.4 Shared Types Package Export
- [ ] **Status:** Todo
- **Labels:** `Feature` · `SharedTypes`
- **File:** `/packages/types/src/index.ts` re-export utils + schemas.
- **Package:** `package.json` name `@lms/types`. NestJS import trực tiếp qua paths alias (`apps/api` `tsconfig.json` `paths`).
- **AC:** `import { CourseSchema } from "@lms/types"` từ `apps/api` resolve được, không cần build.
- **C4 note:** khi thêm `apps/web`, dùng `transpilePackages: ["@lms/types"]` trong `next.config.mjs`.

---

## Epic 3 — Node.js

### F3.1 Event Loop Demo Module
- [ ] **Status:** Todo
- **Labels:** `Feature` · `NodeJS`
- **File:** `/apps/api/src/demos/event-loop.ts`.
- **Function:** `demonstrateEventLoop(): void` in thứ tự `sync` → `nextTick` → `Promise.then` → `setTimeout` → `setImmediate`.
- **AC:** test capture stdout assert đúng thứ tự 5 bước.

### F3.2 Concurrency Helpers
- [ ] **Status:** Todo
- **Labels:** `Feature` · `NodeJS` · `Utils`
- **File:** `/packages/config/src/concurrency.ts`.
- **Functions:** `pMap<T,R>(items, fn, { concurrency=5 })` · `retry<T>(fn, { retries=3, baseMs=200, maxMs=5000 })` với exponential backoff + jitter.
- **AC:** `pMap` không vượt concurrency · `retry` retry đúng số lần.

### F3.3 Stream Helpers
- [ ] **Status:** Todo
- **Labels:** `Feature` · `NodeJS` · `Utils`
- **File:** `/packages/config/src/streams.ts`.
- **Functions:** `streamCopy(src, dst)` dùng `pipeline` + fs streams · `streamHash(src, algo)` pipe vào `crypto.createHash`.
- **AC:** copy file 100MB không vượt 64MB heap.

### F3.4 Env Config Module
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Config` · `Validation`
- **File:** `/packages/config/src/env.ts`.
- **EnvSchema Zod:** `NODE_ENV`, `PORT` (default 3000), `LOG_LEVEL`, `DATABASE_URL` optional (C3), `REDIS_URL` optional (C6), `ANTHROPIC_API_KEY` optional (C5), `WEB_ORIGIN` optional (C4 CORS). Export `const env`.
- **AC:** `PORT=abc` → exit 1 · thiếu `PORT` vẫn run vì có default.

---

## Epic 4 — Backend NestJS

### F4.1 NestJS App Bootstrap
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Backend` · `NestJS`
- **Files:** `/apps/api/src/main.ts` (bootstrap), `/apps/api/src/app.module.ts` (root `AppModule`), `/apps/api/nest-cli.json`.
- **`main.ts`:** `NestFactory.create` + `useLogger(Logger từ nestjs-pino)` + `useGlobalPipes(ZodValidationPipe)` + `useGlobalFilters(AllExceptionsFilter)` + `enableShutdownHooks` + `enableCors({ origin: env.WEB_ORIGIN })`.
- **`AppModule`:** imports `ConfigModule`, `LoggerModule` (nestjs-pino), `HealthModule`, `CoursesModule` + apply `RequestIdMiddleware` `forRoutes("*")`.
- **Scripts:** `dev=nest start --watch`, `build=nest build`.
- **AC:** `pnpm --filter @lms/api dev` chạy `localhost:3000` · DI resolve được controllers.

### F4.2 Endpoint GET /health (NestJS)
- [ ] **Status:** Todo
- **Labels:** `Endpoint` · `NestJS`
- **Files:** `health.controller.ts` (`@Controller("health")` + `@Get() check()`), `health.service.ts` (`@Injectable getStatus()` trả `{ status, uptime, version, timestamp }`), `health.module.ts`.
- **Contract:** `GET /health` · no auth · `200 OK`.
- **AC:** body parse `HealthResponseSchema` · unit test `controller.check()` không throw.

### F4.3 Endpoint GET /courses (NestJS)
- [ ] **Status:** Todo
- **Labels:** `Endpoint` · `NestJS`
- **Spec đầy đủ:** [crud-courses.md §4.1](crud-courses.md).
- **Files:** `courses.controller.ts`, `courses.service.ts`, `dto/list-courses.query.ts`.
- **Query Zod (C1 scope):** `page` (default 1) · `pageSize` (default 20, max 100) · `q` (max 100) · `status` (default `published`, enum + `all`) · `level` optional · `teacherId` UUID optional · `tag` optional · `sort` (`newest`/`oldest`/`title_asc`/`title_desc`, default `newest`).
- **Service:** delegate qua `CourseRepository.findMany()` (F4.3b) → map `Course` → `CourseListItem`.
- **AC:** `?page=1&pageSize=2` → 2 items match `CourseListItemSchema` · `?pageSize=999` → 400 · `?sort=title_asc` sort đúng · `?q=react&level=intermediate` filter AND · `?tag=hooks` chỉ items có "hooks" trong tags array.

### F4.3b CourseRepository Interface + In-Memory Impl
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Backend` · `NestJS` · `Repository`
- **Spec đầy đủ:** [crud-courses.md §7](crud-courses.md).
- **Files:** `/apps/api/src/modules/courses/courses.repository.ts` (interface + DI token `COURSE_REPOSITORY`), `/apps/api/src/modules/courses/repositories/in-memory.repository.ts`, `courses.module.ts` wiring.
- **Interface methods:** `findMany(filter)`, `findById`, `findBySlug`, `existsBySlug`, `insert`, `update(id, patch, expectedVersion?)`, `softDelete(id)`.
- **In-memory impl:** Map<string, Course>, filter chain cho `findMany`, set `createdAt`/`updatedAt`/`version` server-side, soft delete = set `deletedAt`.
- **Module wiring:** `{ provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository }` — C3 sẽ swap `PrismaCourseRepository`.
- **AC:** Controller + Service không biết về Map/Prisma; interface là duy nhất surface · Test pass với in-memory · `findMany` đúng filter logic (status, level, teacherId, tag, q, sort).

### F4.4 Endpoint POST /courses (NestJS)
- [ ] **Status:** Todo
- **Labels:** `Endpoint` · `NestJS`
- **Spec đầy đủ:** [crud-courses.md §4.3](crud-courses.md).
- **Files:** `courses.controller.ts` (`@Post @HttpCode(201) create(@Body(new ZodValidationPipe(CreateCourseDto)))`), `courses.service.ts` create method.
- **Body fields (client gửi):** `slug`, `title`, `description`, `level`, `tags`, `coverImageUrl`, `priceCents`.
- **Server-set:** `id=crypto.randomUUID()`, `teacherId=DEFAULT_TEACHER_ID` (C1; C2 lấy từ JWT), `status="draft"`, `version=1`, `publishedAt=null`, `createdAt/updatedAt=new Date()`, `deletedAt=null`.
- **Flow:** `CreateCourseDto.safeParse` → `repo.existsBySlug` (409 nếu trùng) → `repo.insert` → return `PublicCourse` (omit `deletedAt`).
- **Header response:** `Location: /courses/{slug}`.
- **AC:** thiếu `title` → 400 + `error.details.title` · slug `"Bad Slug!"` → 400 (regex) · slug trùng → 409 với `error.details = { field, reason }` · hợp lệ → 201 + Location · body parse `PublicCourseSchema`.

### F4.5 RequestIdMiddleware (NestJS)
- [ ] **Status:** Todo
- **Labels:** `Middleware` · `NestJS`
- **File:** `/apps/api/src/common/middleware/request-id.middleware.ts`.
- **Spec:** `@Injectable implements NestMiddleware`. Đọc header `x-request-id` từ client (cross-service trace), nếu không có generate `randomUUID()`. Gán `req.id` + `res.setHeader("x-request-id")`. Đăng ký trong `AppModule.configure()` `forRoutes("*")`.
- **AC:** mỗi response có header `x-request-id` · client gửi → echo lại.

### F4.6 LoggingInterceptor (nestjs-pino)
- [ ] **Status:** Todo
- **Labels:** `Interceptor` · `NestJS` · `Logging`
- **File:** `/apps/api/src/common/interceptors/logging.interceptor.ts`.
- **Spec:** `@Injectable implements NestInterceptor`. Inject `PinoLogger`. `intercept`: tính `durationMs`, log JSON `{ level, time, requestId, method, path, status, durationMs }`. 5xx → `error`, 4xx → `warn`, 2xx/3xx → `info`. Đăng ký `useGlobalInterceptors`.
- **AC:** `durationMs` chính xác · level mapping đúng theo status.

### F4.7 AppException & AllExceptionsFilter
- [ ] **Status:** Todo
- **Labels:** `Feature` · `NestJS` · `ErrorHandling`
- **Files:**
  - `/apps/api/src/common/errors/app-exception.ts` — `AppException extends HttpException`, subclasses `ValidationException` (400), `NotFoundException` (404), `ConflictException` (409), `UnauthorizedException` (401).
  - `/apps/api/src/common/filters/all-exceptions.filter.ts` — `@Catch() implements ExceptionFilter`.
  - `/apps/api/src/common/pipes/zod-validation.pipe.ts` — `PipeTransform` `safeParse` → throw `ValidationException`.
- **Filter:** `AppException` → response chuẩn · `HttpException` → map · unknown → log full + 500 `INTERNAL` không leak stack.
- **AC:** `NotFoundException("Course")` → 404 `NOT_FOUND` · `new Error` → 500 `INTERNAL` · body luôn `{ ok, error, requestId }`.

---

## Epic 5 — Dev Workflow

### F5.1 CLAUDE.md Conventions
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Documentation`
- **File:** `/CLAUDE.md`.
- **Sections:** project overview · stack (NestJS + TypeScript + Zod + pnpm) · naming conventions · commit format (Conventional Commits) · Do/Don't cho Claude Code (vd: dùng `ZodValidationPipe` không dùng `class-validator`) · lệnh: `pnpm verify`, `pnpm test --filter`.
- **AC:** Claude Code sinh code đúng convention ngay lần đầu.

### F5.2 Lint & Format Stack
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Tooling` · `Lint`
- **Files:** `/packages/eslint-config/index.js` (preset chung), `/apps/api/.eslintrc.cjs` (extend + `@nestjs` rules), `/.prettierrc.json`, `/.lintstagedrc.json`, `/.husky/pre-commit`.
- **Rules:** `no-explicit-any` error · `no-floating-promises` error · `consistent-type-imports` error · `import/order` warn.
- **AC:** commit có file dùng `any` → reject.

### F5.3 pnpm verify Gate
- [ ] **Status:** Todo
- **Labels:** `Feature` · `Tooling` · `CI`
- **Script root `package.json`:** `verify = pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Build chạy `nest build` cho `apps/api`.
- **AC:** trước khi tag `course-1-complete`, `pnpm verify` pass clean.

---

## Cross-Cutting

### CC1 API Error Code Table
- [ ] **Status:** Reference
- **Labels:** `Reference` · `ErrorHandling`
- **Codes:** `VALIDATION_ERROR` (400) · `UNAUTHORIZED` (401) · `FORBIDDEN` (403) · `NOT_FOUND` (404) · `CONFLICT` (409) · `RATE_LIMITED` (429) · `INTERNAL` (500).
- **Dùng thống nhất** trong `AppException` subclasses + `AllExceptionsFilter`.
- **AC:** mọi error response có `error.code` thuộc bảng này.

### CC2 Test Coverage Targets
- [ ] **Status:** Reference
- **Labels:** `Reference` · `Testing`
- **Targets:** `packages/types` Zod schemas 100% branch · `packages/config` (env, pMap, retry, stream) ≥ 90% · `apps/api` controllers + services ≥ 80% · `apps/api` filters/pipes/interceptors/middleware 100%.
- **Test API** dùng `Test.createTestingModule` của NestJS.
- **AC:** `vitest --coverage` đạt target mỗi module.

### CC3 Final Deliverables Checklist (theo PDF syllabus)
- [ ] 1) Monorepo hoàn chỉnh + `pnpm verify` exit 0.
- [ ] 2) Backend skeleton: NestJS API `:3000` với `GET /health`, `GET /courses`, `POST /courses`.
- [ ] 3) `@lms/types` export domain schemas: Course bundle đầy đủ (`CourseSchema`, `CreateCourseDto`, `UpdateCourseDto`, `PublicCourseSchema`, `CourseListItemSchema`) + User/Lesson/Quiz/Enrollment.
- [ ] 4) `@lms/config` export `env` + `pMap` + `retry` + `streamCopy` + `streamHash`.
- [ ] 5) NestJS infra: `RequestIdMiddleware` + `LoggingInterceptor` + `AllExceptionsFilter` + `ZodValidationPipe`.
- [ ] 6) `AppException` hierarchy: `Validation`/`NotFound`/`Conflict`/`Unauthorized`.
- [ ] 7) Error contract `{ ok, error: { code, message, details? }, requestId }`.
- [ ] 8) `CourseRepository` interface + `InMemoryCourseRepository` impl — abstraction ready cho C3 swap Prisma.
- [ ] 9) Test pass cho CRUD subset C1: T1, T2, T3, T6, T7, T8, T9 (xem `crud-courses.md §10`).
- [ ] 10) Developer tooling: ESLint preset + Prettier + Husky + lint-staged.
- [ ] 11) Claude Code workflow: `CLAUDE.md` + `README.md` + `.env.example`.
- [ ] 12) Git tag `course-1-complete`.

### CC4 Out of Scope (sẽ làm ở các Course sau)
- ❌ **C2** Auth (JWT, OAuth), full CRUD APIs (Course, Lesson, Quiz, Enrollment, Submission), rate limiting, search, pagination filtering layer.
- ❌ **C3** PostgreSQL + Prisma + migrations + analytics queries.
- ❌ **C4** Next.js Student Dashboard, React/TanStack Query, Forms, UI screens (spec ở `../course4/ui-screens.md`).
- ❌ **C5** Claude API, AI summarize/quiz-gen/recommendations.
- ❌ **C6** Redis cache, BullMQ workers, notifications.
- ❌ **C7** Vitest depth, Playwright E2E.
- ❌ **C8** Docker, GitHub Actions, deployment.

---

## Tổng quan tiến độ

| Epic | Số task | Hoàn thành |
|------|---------|------------|
| Epic 1 — Project Setup | 2 | 0 / 2 |
| Epic 2 — TypeScript | 4 | 0 / 4 |
| Epic 3 — Node.js | 4 | 0 / 4 |
| Epic 4 — Backend NestJS | 8 (F4.1–F4.7 + F4.3b) | 0 / 8 |
| Epic 5 — Dev Workflow | 3 | 0 / 3 |
| Cross-Cutting | 4 | 0 / 4 |
| **Tổng** | **25** | **0 / 25** |
