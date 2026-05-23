# PLAN K1 — Technical Spec
## Course 1: Bootstrapping the AI LMS (TypeScript + Node.js Foundations)

> Tài liệu này mô tả **kỹ thuật từng feature, từng function, từng endpoint** của Khóa 1.
>
> **Scope theo PDF syllabus:** Course 1 là khoá **Backend Foundations** — Final Output gồm Monorepo + **Backend skeleton (NestJS)** + Shared TypeScript packages + Claude Code workflow + Developer tooling. Video cuối: "Preparing for Backend Modules" (chuẩn bị cho Course 2).
>
> **Frontend KHÔNG nằm trong Course 1.** React/Next.js (Student Dashboard, TanStack Query, Forms…) là **Course 4**. Spec UI/UX đã chuyển sang [../course4/ui-screens.md](../course4/ui-screens.md).
>
> **CRUD design canonical** cho resource `Course` (Schema Zod + DB DDL + 7 endpoints + state machine + test matrix): [crud-courses.md](crud-courses.md). Tài liệu hiện tại chỉ tóm lược C1 subset; chi tiết đầy đủ tham chiếu file đó.

---

## STACK & CONVENTIONS (Course 1)

| Layer | Tech | Course |
|-------|------|--------|
| Runtime | Node.js 20 LTS | C1 |
| Language | TypeScript 5.4+ (strict) | C1 |
| Package manager | pnpm 9 (workspaces) | C1 |
| Backend framework | **NestJS 10** (Express adapter) | C1 |
| Validation | Zod 3 + custom `ZodValidationPipe` | C1 |
| Logger | `nestjs-pino` (pino under the hood) | C1 |
| Testing | Vitest + Nest `Test.createTestingModule` | C1 |
| Lint/Format | ESLint + Prettier | C1 |
| Database | PostgreSQL + Prisma | C3 |
| Frontend framework | Next.js 14+ (App Router) | **C4** |
| Data fetching FE | TanStack Query | **C4** |
| AI integration | Claude API | C5 |
| Cache + Queue | Redis + BullMQ | C6 |

**Naming conventions:**
- File: `kebab-case.ts` • Class: `PascalCase` • Function/var: `camelCase` • Const: `SCREAMING_SNAKE_CASE`
- Test file: `*.test.ts` cạnh source.
- Folder import alias: `@api/*`, `@types/*`, `@config/*`.

---

# EPIC 1 — Project Setup & Monorepo Foundation

## F1.1 — Monorepo Workspace

**Mục đích:** Quản lý nhiều package trong 1 repo, share dependencies, build có thứ tự.

**File path:**
- `/pnpm-workspace.yaml`
- `/package.json` (root)
- `/turbo.json` (optional, dùng TurboRepo cho cache build)

**Spec `pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Spec root `package.json` scripts:**
| Script | Lệnh | Mô tả |
|--------|------|-------|
| `dev` | `pnpm -r --parallel run dev` | Chạy dev mọi app |
| `build` | `pnpm -r run build` | Build tuần tự theo dependency graph |
| `lint` | `pnpm -r run lint` | ESLint toàn repo |
| `typecheck` | `pnpm -r run typecheck` | `tsc --noEmit` toàn repo |
| `test` | `pnpm -r run test` | Vitest |
| `verify` | `pnpm lint && pnpm typecheck && pnpm test` | Gate pre-PR |

**Folder structure (Course 1):**
```
/
├── apps/
│   └── api/                  # Backend NestJS (nest-cli) — DUY NHẤT trong Course 1
│       ├── src/
│       │   ├── main.ts             # bootstrap()
│       │   ├── app.module.ts       # root module
│       │   ├── modules/
│       │   │   ├── health/         # HealthModule
│       │   │   └── courses/        # CoursesModule
│       │   ├── common/
│       │   │   ├── filters/        # exception filters
│       │   │   ├── interceptors/   # logger interceptor
│       │   │   ├── middleware/     # request-id middleware
│       │   │   ├── pipes/          # ZodValidationPipe
│       │   │   └── errors/         # AppException hierarchy
│       │   └── demos/              # event-loop, streams (Epic 3)
│       └── nest-cli.json
│   # apps/web/ — Next.js Student Dashboard sẽ thêm ở COURSE 4
├── packages/
│   ├── types/                # Shared domain types + Zod schemas (dùng chung khi C4 thêm FE)
│   ├── config/               # Shared utils (env, pMap, retry, streams)
│   └── eslint-config/        # Shared ESLint preset
├── pnpm-workspace.yaml       # workspace glob "apps/*" — sẵn cho C4 drop apps/web vào
├── package.json
├── tsconfig.base.json
└── CLAUDE.md
```

> **Lưu ý monorepo-ready:** `pnpm-workspace.yaml` đã khai báo `apps/*` nên Course 4 chỉ cần `pnpm create next-app apps/web --ts --app` là plug-in ngay, không phải sửa root config.

**Acceptance:** `pnpm install` exit 0. `pnpm -r run typecheck` pass với 0 lỗi.

---

## F1.2 — Git & Tooling Bootstrap

**Files:**
- `/.gitignore` (chuẩn Node + IDE + OS + `.env*`)
- `/.editorconfig`
- `/.nvmrc` (`20`)
- `/CLAUDE.md` (conventions cho Claude Code)
- `/README.md`

**Spec `.gitignore` (tối thiểu):**
```
node_modules
dist
.turbo
.env
.env.local
.env.*.local
coverage
*.log
.DS_Store
```

**Acceptance:** `git status` sau `pnpm install` không có file `node_modules` hay `dist`.

---

# EPIC 2 — TypeScript Foundations

## F2.1 — Strict `tsconfig.base.json`

**File:** `/tsconfig.base.json`

**Spec:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Per-package `tsconfig.json` extends:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*"]
}
```

**Acceptance:** Bật strict, code dùng `any` ngầm phải fail.

---

## F2.2 — Generic Utility Types

**File:** `/packages/types/src/utils.ts`

**Functions / Types:**

```ts
// 1) Standard API envelope
export type ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type ApiFailure   = { ok: false; error: { code: string; message: string }; requestId: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// 2) Result type (functional error handling)
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok  = <T>(value: T): Result<T, never>  => ({ ok: true,  value });
export const Err = <E>(error: E): Result<never, E>  => ({ ok: false, error });

// 3) Repository contract (dùng lại ở Course 3)
export interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findMany(filter?: Partial<T>): Promise<T[]>;
  create(input: Omit<T, "id">): Promise<T>;
  update(id: ID, patch: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
}

// 4) Pagination
export interface PageRequest  { page: number; pageSize: number }
export interface Page<T>      { items: T[]; total: number; page: number; pageSize: number }
```

**Acceptance:**
- `ApiResponse<T>` discriminated union: TS narrow được sau `if (res.ok)`.
- Test: `Ok(1)` có type `Result<number, never>`.

---

## F2.3 — Zod Domain Schemas

**File:** `/packages/types/src/schemas.ts`

**Schemas bắt buộc:**

```ts
import { z } from "zod";

export const RoleEnum = z.enum(["student", "teacher", "admin"]);
export type Role = z.infer<typeof RoleEnum>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  role: RoleEnum,
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

// Course — schema đầy đủ, spec chi tiết ở `crud-courses.md` §2
export const CourseLevelEnum  = z.enum(["beginner", "intermediate", "advanced"]);
export const CourseStatusEnum = z.enum(["draft", "published", "archived"]);
export const SlugSchema = z.string().min(3).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase, digits, single hyphens only");

export const CourseSchema = z.object({
  id: z.string().uuid(),
  slug: SlugSchema,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(""),
  level: CourseLevelEnum.default("beginner"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  coverImageUrl: z.string().url().nullable().default(null),
  priceCents: z.number().int().min(0).max(10_000_000).default(0),
  status: CourseStatusEnum.default("draft"),
  teacherId: z.string().uuid(),
  version: z.number().int().positive().default(1),
  publishedAt: z.coerce.date().nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable().default(null),
});
export type Course = z.infer<typeof CourseSchema>;

export const LessonSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  order: z.number().int().nonnegative(),
  contentType: z.enum(["video", "pdf", "text"]),
  contentUrl: z.string().url().optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const QuizSchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().uuid(),
  questions: z.array(z.object({
    q: z.string(),
    choices: z.array(z.string()).min(2).max(6),
    answerIndex: z.number().int().nonnegative(),
  })).min(1),
});
export type Quiz = z.infer<typeof QuizSchema>;

export const EnrollmentSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrolledAt: z.coerce.date(),
  progress: z.number().min(0).max(1),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

// DTOs cho input API — chỉ subset client được gửi
export const CreateCourseDto = CourseSchema.pick({
  slug: true, title: true, description: true, level: true, tags: true,
  coverImageUrl: true, priceCents: true,
});
export type CreateCourseInput = z.infer<typeof CreateCourseDto>;

export const UpdateCourseDto = CreateCourseDto.partial();
export type UpdateCourseInput = z.infer<typeof UpdateCourseDto>;

// View model cho response (ẩn deletedAt)
export const PublicCourseSchema = CourseSchema.omit({ deletedAt: true });
export type PublicCourse = z.infer<typeof PublicCourseSchema>;

// View model rút gọn cho list
export const CourseListItemSchema = CourseSchema.pick({
  id: true, slug: true, title: true, level: true, tags: true,
  coverImageUrl: true, priceCents: true, status: true,
  teacherId: true, publishedAt: true, createdAt: true,
});
export type CourseListItem = z.infer<typeof CourseListItemSchema>;
```

> **Spec đầy đủ + DB schema + 7 endpoint CRUD + state machine + test matrix:** [crud-courses.md](crud-courses.md).

**Acceptance:**
- `CreateCourseDto.parse({...})` reject input thiếu `title` / `slug` sai regex.
- `z.infer` cho ra types khớp manual types — không drift.
- 5 schemas khớp 1-1 với spec ở `crud-courses.md §2`.

---

## F2.4 — Shared Types Package Export

**File:** `/packages/types/src/index.ts`

**Spec:**
```ts
export * from "./utils";
export * from "./schemas";
```

**`packages/types/package.json`:**
```json
{
  "name": "@lms/types",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

**Acceptance:** Trong `apps/api`: `import { CourseSchema } from "@lms/types"` resolve được, không cần build.

---

# EPIC 3 — Node.js Foundations

## F3.1 — Event Loop Demo Module

**File:** `/apps/api/src/demos/event-loop.ts`

**Function:**
```ts
export function demonstrateEventLoop(): void
```
- In ra thứ tự log của: sync code → `process.nextTick` → `Promise.resolve().then` → `setTimeout(0)` → `setImmediate`.
- Mục đích: chứng minh microtask queue chạy trước macrotask.

**Expected output:**
```
1. sync
2. nextTick
3. promise.then
4. setTimeout
5. setImmediate
```

**Acceptance:** Test `event-loop.test.ts` capture stdout, assert đúng thứ tự.

---

## F3.2 — Concurrency Helpers

**File:** `/packages/config/src/concurrency.ts`

**Functions:**

```ts
// Map có giới hạn concurrency
export async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options?: { concurrency?: number }   // default: 5
): Promise<R[]>
```
- **Error:** nếu 1 task throw → reject toàn batch (giống `Promise.all`).
- **Edge:** `items` rỗng → return `[]`.

```ts
// Retry với exponential backoff + jitter
export async function retry<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseMs?: number; maxMs?: number }
): Promise<T>
```
- Default: `retries=3`, `baseMs=200`, `maxMs=5000`.
- Backoff: `min(maxMs, baseMs * 2^attempt) + random(0, baseMs)`.

**Acceptance:**
- `pMap([1,2,3,4,5], slowFn, {concurrency:2})` không bao giờ > 2 in-flight (test bằng counter).
- `retry` retry đúng số lần khi fn liên tục throw.

---

## F3.3 — Stream Helpers

**File:** `/packages/config/src/streams.ts`

**Functions:**

```ts
import { Readable, Writable } from "node:stream";

export async function streamCopy(src: string, dst: string): Promise<void>
```
- Dùng `fs.createReadStream` → `pipeline` → `fs.createWriteStream`.
- Memory footprint constant, kể cả file 1GB.

```ts
export async function streamHash(src: string, algo?: "sha256" | "md5"): Promise<string>
```
- Pipe file vào `crypto.createHash`, trả về hex digest.

**Acceptance:** Copy file 100MB không vượt 64MB heap (kiểm bằng `--max-old-space-size=64`).

---

## F3.4 — Env Config Module

**File:** `/packages/config/src/env.ts`

**Spec:**
```ts
import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().url().optional(),    // bật ở Course 3
  REDIS_URL: z.string().url().optional(),       // bật ở Course 6
  ANTHROPIC_API_KEY: z.string().min(10).optional(), // bật ở Course 5
  WEB_ORIGIN: z.string().url().optional(),      // CORS — bật ở Course 4 khi có apps/web
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = (() => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();
```

**File mẫu:** `/.env.example` liệt kê đầy đủ keys.

**Acceptance:**
- Thiếu `PORT` (vô lệ) → vẫn run vì có default.
- `PORT=abc` → process exit code 1, in lỗi rõ.

---

# EPIC 4 — Backend Skeleton (NestJS)

## F4.1 — Nest Application Bootstrap

**Files:**
- `/apps/api/src/main.ts` — entry, `bootstrap()`
- `/apps/api/src/app.module.ts` — root module
- `/apps/api/nest-cli.json`

**Spec `main.ts`:**
```ts
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { env } from "@lms/config";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
  app.enableShutdownHooks();
  if (env.WEB_ORIGIN) app.enableCors({ origin: env.WEB_ORIGIN, credentials: true }); // bật khi C4 thêm FE
  await app.listen(env.PORT);
}
bootstrap();
```

**Spec `app.module.ts`:**
```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [() => env] }),
    LoggerModule.forRoot({ pinoHttp: { level: env.LOG_LEVEL, genReqId: () => randomUUID() } }),
    HealthModule,
    CoursesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
```

**Scripts** (`apps/api/package.json`):
| Script | Lệnh |
|--------|------|
| `dev` | `nest start --watch` |
| `build` | `nest build` |
| `start` | `node dist/main.js` |
| `test` | `vitest` |

**Acceptance:**
- `pnpm --filter @lms/api dev` chạy server tại `http://localhost:3000`.
- DI container resolve được `HealthController`, `CoursesController`.
- Test với `Test.createTestingModule({ imports: [AppModule] })` không cần listen.

---

## F4.2 — Endpoint: `GET /health`

**Files:**
- `/apps/api/src/modules/health/health.controller.ts`
- `/apps/api/src/modules/health/health.service.ts`
- `/apps/api/src/modules/health/health.module.ts`

**Controller:**
```ts
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): HealthResponse {
    return this.health.getStatus();
  }
}
```

**Service:**
```ts
@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return {
      status: "ok",
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    };
  }
}
```

**Contract:**
| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/health` |
| Auth | None |
| Status | `200 OK` |

**Acceptance:**
- 200 OK + body parse được bằng `HealthResponseSchema` (Zod).
- Unit test: `controller.check()` không throw, có 4 field đúng.

---

## F4.3 — Endpoint: `GET /courses`

> Spec đầy đủ ở [crud-courses.md §4.1](crud-courses.md). Mục dưới đây là **Course 1 subset** (in-memory, public filter only).

**Files:**
- `/apps/api/src/modules/courses/courses.controller.ts`
- `/apps/api/src/modules/courses/courses.service.ts`
- `/apps/api/src/modules/courses/dto/list-courses.query.ts`
- `/apps/api/src/modules/courses/courses.repository.ts` — interface (F4.3b)
- `/apps/api/src/modules/courses/repositories/in-memory.repository.ts` — C1 impl
- `/apps/api/src/modules/courses/data/seed-courses.ts` (in-memory; Course 3 thay Postgres)

**Query DTO (Zod) — Course 1 scope:**
```ts
export const ListCoursesQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.enum(["draft", "published", "archived", "all"]).default("published"),
  level: CourseLevelEnum.optional(),
  teacherId: z.string().uuid().optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  sort: z.enum(["newest", "oldest", "title_asc", "title_desc"]).default("newest"),
});
export type ListCoursesQueryInput = z.infer<typeof ListCoursesQuery>;
```

**Controller:**
```ts
@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListCoursesQuery)) query: ListCoursesQueryInput,
  ): Promise<Page<CourseListItem>> {
    return this.courses.list(query);
  }
}
```

**Service (delegate cho Repository):**
```ts
@Injectable()
export class CoursesService {
  constructor(@Inject("COURSE_REPOSITORY") private readonly repo: CourseRepository) {}

  async list(q: ListCoursesQueryInput): Promise<Page<CourseListItem>> {
    const { items, total } = await this.repo.findMany(q);
    return { items: items.map(toListItem), total, page: q.page, pageSize: q.pageSize };
  }
}
```

**Response:** `Page<CourseListItem>` — schema rút gọn (xem F2.3).

**Acceptance:**
- `GET /courses?page=1&pageSize=2` → 200, đúng 2 item, mỗi item match `CourseListItemSchema`.
- `GET /courses?pageSize=999` → 400 `VALIDATION_ERROR`.
- `GET /courses?status=draft` (chưa có auth ở C1) → cho phép trả; C2 sẽ chặn nếu không phải admin.
- `GET /courses?sort=title_asc` → items sort theo `title` asc.
- `GET /courses?q=react&level=intermediate` → filter cả 2 điều kiện (AND).
- `GET /courses?tag=hooks` → chỉ courses có `"hooks"` trong `tags`.

---

## F4.3b — `CourseRepository` Interface + In-Memory Impl

**Files:**
- `/apps/api/src/modules/courses/courses.repository.ts`
- `/apps/api/src/modules/courses/repositories/in-memory.repository.ts`
- `/apps/api/src/modules/courses/courses.module.ts`

**Interface:**
```ts
export interface CourseFilter extends ListCoursesQueryInput {}

export interface CourseRepository {
  findMany(filter: CourseFilter): Promise<{ items: Course[]; total: number }>;
  findById(id: string): Promise<Course | null>;
  findBySlug(slug: string): Promise<Course | null>;
  existsBySlug(slug: string): Promise<boolean>;
  insert(input: CreateCourseInput & { teacherId: string }): Promise<Course>;
  update(id: string, patch: Partial<Course>, expectedVersion?: number): Promise<Course>;
  softDelete(id: string): Promise<void>;
}
export const COURSE_REPOSITORY = Symbol("COURSE_REPOSITORY");
```

**In-memory implementation (Course 1):**
```ts
@Injectable()
export class InMemoryCourseRepository implements CourseRepository {
  private readonly store = new Map<string, Course>();   // key = id

  async findMany(filter: CourseFilter) {
    let arr = Array.from(this.store.values()).filter(c => c.deletedAt === null);
    if (filter.status !== "all") arr = arr.filter(c => c.status === filter.status);
    if (filter.level)     arr = arr.filter(c => c.level === filter.level);
    if (filter.teacherId) arr = arr.filter(c => c.teacherId === filter.teacherId);
    if (filter.tag)       arr = arr.filter(c => c.tags.includes(filter.tag!));
    if (filter.q) {
      const q = filter.q.toLowerCase();
      arr = arr.filter(c => c.title.toLowerCase().includes(q));
    }
    arr.sort(SORTERS[filter.sort]);
    const total = arr.length;
    const items = arr.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize);
    return { items, total };
  }
  // ...findById, findBySlug, insert, update, softDelete (xem crud-courses.md §7)
}
```

**Module wiring:**
```ts
@Module({
  controllers: [CoursesController],
  providers: [
    CoursesService,
    { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },  // C3 swap PrismaCourseRepository
  ],
})
export class CoursesModule {}
```

**Acceptance:**
- Controller + service không biết about Map vs Prisma — chỉ dùng interface.
- Course 3 chỉ cần đổi 1 dòng `useClass: PrismaCourseRepository`.

---

## F4.4 — Endpoint: `POST /courses`

> Spec đầy đủ + error matrix ở [crud-courses.md §4.3](crud-courses.md). C1 scope: tạo course `status="draft"`, in-memory store, default `teacherId` (vì chưa có auth ở C1).

**Files:**
- `/apps/api/src/modules/courses/courses.controller.ts`
- DTO: `CreateCourseDto` từ `@lms/types` (xem F2.3).

**Server-set fields (client KHÔNG gửi):**
| Field | Giá trị |
|-------|---------|
| `id` | `crypto.randomUUID()` |
| `teacherId` | Default user ở C1 (JWT `sub` ở C2) |
| `status` | `"draft"` cố định lúc tạo |
| `version` | `1` |
| `publishedAt` | `null` |
| `createdAt`, `updatedAt` | `new Date()` |
| `deletedAt` | `null` |

**Controller:**
```ts
@Post()
@HttpCode(201)
async create(
  @Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput,
  @Res({ passthrough: true }) res: Response,
): Promise<PublicCourse> {
  const created = await this.courses.create(body);
  res.setHeader("Location", `/courses/${created.slug}`);  // slug-based URL
  return created;
}
```

**Service (qua Repository):**
```ts
async create(input: CreateCourseInput): Promise<PublicCourse> {
  if (await this.repo.existsBySlug(input.slug)) {
    throw new ConflictException("Course slug already exists");
  }
  const teacherId = DEFAULT_TEACHER_ID;  // C2 lấy từ JWT
  const created = await this.repo.insert({ ...input, teacherId });
  return toPublic(created);  // strip deletedAt
}
```

**Contract:**
| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/courses` |
| Body | `CreateCourseDto` (slug, title, description, level, tags, coverImageUrl, priceCents) |
| Status | `201` Created • `400` validation • `409` slug trùng |
| Headers | `Location: /courses/{slug}` |

**Acceptance:**
- Body thiếu `title` → 400 + `error.details.title`.
- Slug `"Bad Slug!"` → 400 (regex fail).
- Slug trùng → 409 `CONFLICT` với `error.details = { field: "slug", reason: "already_exists" }`.
- Hợp lệ → 201 + `Location` header, body parse được `PublicCourseSchema`, có đủ field server-set (`id`, `status="draft"`, `version=1`, `createdAt`, ...).

---

## F4.5 — Middleware: Request ID (NestJS)

**File:** `/apps/api/src/common/middleware/request-id.middleware.ts`

**Spec:**
```ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers["x-request-id"] as string) ?? randomUUID();
    req.id = id;                    // augment Express Request
    res.setHeader("x-request-id", id);
    next();
  }
}
```

**Registration:** đăng ký trong `AppModule.configure()` (xem F4.1) cho `forRoutes("*")`.

**Acceptance:**
- Mỗi response có header `x-request-id`.
- Client gửi `x-request-id` → echo lại y nguyên (trace cross-service).

---

## F4.6 — Logger Interceptor (nestjs-pino)

**File:** `/apps/api/src/common/interceptors/logging.interceptor.ts`

**Approach:** Dùng `nestjs-pino` `LoggerModule.forRoot()` đã tự log mỗi request. Bổ sung interceptor để gán `durationMs` + `requestId`.

**Spec:**
```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.log(req, ctx.switchToHttp().getResponse(), start),
        error: () => this.log(req, ctx.switchToHttp().getResponse(), start, "error"),
      }),
    );
  }

  private log(req: Request, res: Response, start: number, level: "info" | "error" = "info"): void {
    this.logger[level === "error" ? "error" : res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"]({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  }
}
```

**Đăng ký global:** `app.useGlobalInterceptors(app.get(LoggingInterceptor))`.

**Output JSON line:**
```json
{ "level": "info", "time": "...", "requestId": "uuid", "method": "GET", "path": "/courses", "status": 200, "durationMs": 12 }
```

**Acceptance:**
- 5xx → level `error`, 4xx → `warn`, 2xx/3xx → `info`.
- `durationMs` chính xác (test với fake timer).

---

## F4.7 — Exception Filter & AppException Hierarchy

**Files:**
- `/apps/api/src/common/errors/app-exception.ts`
- `/apps/api/src/common/filters/all-exceptions.filter.ts`

**Class hierarchy (extend Nest's HttpException):**
```ts
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: unknown) {
    super("VALIDATION_ERROR", "Invalid input", HttpStatus.BAD_REQUEST, details);
  }
}
export class NotFoundException extends AppException {
  constructor(resource: string) { super("NOT_FOUND", `${resource} not found`, HttpStatus.NOT_FOUND); }
}
export class ConflictException extends AppException {
  constructor(message: string) { super("CONFLICT", message, HttpStatus.CONFLICT); }
}
export class UnauthorizedException extends AppException {
  constructor() { super("UNAUTHORIZED", "Authentication required", HttpStatus.UNAUTHORIZED); }
}
```

**Global filter:**
```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.id;

    if (exception instanceof AppException) {
      const body = exception.getResponse() as { code: string; message: string; details?: unknown };
      return res.status(exception.getStatus()).json({ ok: false, error: body, requestId });
    }
    if (exception instanceof HttpException) {
      // Nest built-in (e.g. BadRequestException từ ZodValidationPipe)
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return res.status(status).json({
        ok: false,
        error: { code: status === 400 ? "VALIDATION_ERROR" : "HTTP_ERROR", message: exception.message, details: payload },
        requestId,
      });
    }
    this.logger.error({ err: exception, requestId }, "Unhandled exception");
    return res.status(500).json({
      ok: false,
      error: { code: "INTERNAL", message: "Internal server error" },
      requestId,
    });
  }
}
```

**ZodValidationPipe** (`/apps/api/src/common/pipes/zod-validation.pipe.ts`):
```ts
@Injectable()
export class ZodValidationPipe<T extends ZodSchema> implements PipeTransform {
  constructor(private readonly schema?: T) {}
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = this.schema ?? (metadata.metatype as unknown as ZodSchema | undefined);
    if (!schema || typeof (schema as ZodSchema).safeParse !== "function") return value;
    const parsed = (schema as ZodSchema).safeParse(value);
    if (!parsed.success) throw new ValidationException(parsed.error.flatten());
    return parsed.data;
  }
}
```

**Acceptance:**
- Throw `new NotFoundException("Course")` → 404 + `error.code = "NOT_FOUND"`.
- Throw `new Error("boom")` → 500 `INTERNAL`, log full stack, KHÔNG leak stack ra client.
- Mọi error response có 3 field: `ok`, `error`, `requestId`.

---

> **Course 4 sẽ thêm:** `apps/web` (Next.js Student Dashboard) + `api-client.ts` typed bằng `@lms/types` + UI screens. Spec đầy đủ ở [../course4/ui-screens.md](../course4/ui-screens.md).

---

# EPIC 5 — Developer Workflow & Polish

## F5.1 — CLAUDE.md Conventions

**File:** `/CLAUDE.md`

**Sections bắt buộc:**
- Project overview (5 dòng).
- Stack & layout.
- Naming conventions.
- Commit message format (Conventional Commits).
- "Do this / Don't do this" cho Claude Code.
- Lệnh quan trọng: `pnpm verify`, `pnpm test --filter`.

**Acceptance:** Claude Code đọc CLAUDE.md và sinh code đúng convention ở lần đầu.

---

## F5.2 — Lint & Format Stack

**Files:**
- `/packages/eslint-config/index.js` — shared preset.
- `/.prettierrc.json`
- `/.lintstagedrc.json`
- `/.husky/pre-commit`

**ESLint rules tối thiểu:**
- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/no-floating-promises`: error
- `@typescript-eslint/consistent-type-imports`: error
- `import/order`: warn

**Pre-commit hook:**
```sh
pnpm lint-staged
```

**`lint-staged`:**
```json
{ "*.{ts,tsx}": ["eslint --fix", "prettier --write"] }
```

**Acceptance:** Commit có file dùng `any` → reject.

---

## F5.3 — `pnpm verify` Gate

**File:** root `package.json`

**Script:**
```json
"verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
```

**Acceptance:** Trước khi tag `course-1-complete`, lệnh `pnpm verify` phải pass clean.

---

# CROSS-CUTTING: API ERROR CODE TABLE

| Code | HTTP | Khi nào dùng |
|------|------|--------------|
| `VALIDATION_ERROR` | 400 | Zod parse fail |
| `UNAUTHORIZED` | 401 | Thiếu/sai token (Course 2) |
| `FORBIDDEN` | 403 | Đủ auth nhưng không quyền |
| `NOT_FOUND` | 404 | Resource không tồn tại |
| `CONFLICT` | 409 | Vi phạm unique constraint |
| `RATE_LIMITED` | 429 | Course 2 — rate limiter |
| `INTERNAL` | 500 | Lỗi không xác định |

---

# CROSS-CUTTING: TEST COVERAGE TARGETS

| Module | Target |
|--------|--------|
| `packages/types` (Zod schemas) | 100% schema branch |
| `packages/config` (env, pMap, retry, stream) | ≥ 90% |
| `apps/api` routes | ≥ 80% |
| `apps/api` middleware | 100% |

---

# DELIVERABLES (kết thúc K1 — theo syllabus PDF)

**Final Output of Course 1** (trích PDF):
- ✅ Monorepo hoàn chỉnh
- ✅ Backend skeleton
- ✅ Shared TypeScript packages
- ✅ Claude Code workflow
- ✅ Developer tooling

**Cụ thể:**
- Monorepo build clean: `pnpm verify` exit 0.
- **NestJS API** chạy tại `:3000`: `GET /health`, `GET /courses`, `POST /courses` (in-memory store; C3 thay Postgres).
- Shared package `@lms/types` export đủ 5 domain schemas (User, Course, Lesson, Quiz, Enrollment) — sẵn sàng cho C2/C3/C4 dùng lại.
- Shared package `@lms/config` export `env`, `pMap`, `retry`, `streamCopy`, `streamHash`.
- NestJS infra: `RequestIdMiddleware`, `LoggingInterceptor` (nestjs-pino), `AllExceptionsFilter`, `ZodValidationPipe`.
- `AppException` hierarchy: `ValidationException`, `NotFoundException`, `ConflictException`, `UnauthorizedException`.
- Error contract chuẩn `{ ok, error: { code, message, details? }, requestId }`.
- CLAUDE.md + README.md + `.env.example`.
- Git tag `course-1-complete`.

**KHÔNG nằm trong Course 1 (theo PDF):**
- ❌ Frontend (Next.js / React / TanStack Query) → **Course 4** — Building the Student Dashboard.
- ❌ UI screens / Tailwind setup → **Course 4**.
- ❌ Database (PostgreSQL / Prisma) → **Course 3**.
- ❌ Auth (JWT, OAuth) → **Course 2**.
- ❌ AI integration (Claude API) → **Course 5**.
- ❌ Redis / BullMQ → **Course 6**.
- ❌ Testing depth, E2E → **Course 7**.
- ❌ Docker / CI-CD / Deploy → **Course 8**.
