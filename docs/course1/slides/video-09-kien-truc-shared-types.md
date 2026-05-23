---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 9: Kiến Trúc Shared Types'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Kiến Trúc
# Shared Types

### Khóa 1 — Video 9

**Single source of truth cho toàn monorepo**

> 1 schema — dùng được ở mọi app, mọi tầng

---

## Slide 2 — Mục tiêu video này

Sau 22 phút, bạn sẽ:

- ✅ Hiểu **vì sao cần shared types package**
- ✅ Tạo **package `@lms/types`** từ đầu
- ✅ Định nghĩa **5 domain schemas chuẩn**: User, Course, Lesson, Quiz, Enrollment
- ✅ Phân biệt **Entity vs DTO vs ViewModel**
- ✅ Setup **`package.json` exports** đúng cách
- ✅ Sẵn sàng cho **Khóa 4 frontend** dùng chung type

> 🎯 Cuối video: `apps/api` import `@lms/types` chạy được

---

## Slide 3 — Vấn đề: Type drift trong monorepo

### Backend và Frontend tự định nghĩa type riêng

**Backend:**

```typescript
// apps/api/src/types.ts
interface Course {
  id: string;
  title: string;
  level: "beginner" | "intermediate" | "advanced";
  publishedAt: Date | null;
}
```

**Frontend:**

```typescript
// apps/web/src/types.ts
interface Course {
  id: string;
  title: string;
  level: string;              // ⚠️ lỏng hơn
  publishedAt: string;        // ⚠️ string, không phải Date
}
```

→ **Drift dần theo thời gian → bug runtime khó tìm**

---

## Slide 4 — Giải pháp: 1 schema, mọi nơi dùng

### Pattern Shared Package

```
ai-lms/
├── apps/
│   ├── api/                ← import @lms/types
│   └── web/                ← import @lms/types (Khóa 4)
└── packages/
    └── types/              ← Single source of truth
        └── src/
            ├── schemas.ts  ← Zod schemas
            ├── utils.ts    ← Result, ApiResponse, ...
            └── index.ts    ← Re-export
```

> 🎯 Đổi `Course.level` ở 1 nơi → BE và FE đều thấy thay đổi

---

## Slide 5 — Tạo package `@lms/types`

### Bước 1: Tạo thư mục và package.json

```bash
# Trong root project ai-lms
mkdir -p packages/types/src
cd packages/types

# Init package.json
pnpm init
```

### Bước 2: Sửa `package.json`

```json
{
  "name": "@lms/types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Slide 6 — Vì sao point thẳng vào `.ts`?

### Trade-off: build vs no-build packages

**Cách 1: No-build (Khóa 1 dùng)**

```json
"main": "./src/index.ts"
```

✅ Sửa code → app khác thấy ngay (no rebuild)
✅ Setup đơn giản, ít moving parts
❌ App consumer phải biết compile TS (cần `tsx`/`ts-node`)

**Cách 2: Build trước**

```json
"main": "./dist/index.js",
"types": "./dist/index.d.ts"
```

✅ Consumer chỉ cần JS — chạy bất cứ đâu
❌ Phải `pnpm build` mỗi khi đổi
❌ Setup phức tạp (watch mode...)

> 💡 **Khóa 1:** Vì cả monorepo dùng TS strict → no-build đơn giản hơn

---

## Slide 7 — Cài Zod vào package

```bash
# Trong packages/types/
pnpm add zod
```

### `package.json` sau khi cài

```json
{
  "name": "@lms/types",
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

---

## Slide 8 — Thêm `tsconfig.json` cho package

### `/packages/types/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

### Kiểm tra
```bash
pnpm typecheck
# Done in 0.5s
```

> 💡 Mọi package extends `tsconfig.base.json` → strict config nhất quán

---

## Slide 9 — Cấu trúc file trong `src/`

```
packages/types/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts        ← Re-export all
    ├── utils.ts        ← Generic types: Result, ApiResponse, Page
    ├── schemas.ts      ← Domain schemas (User, Course, ...)
    └── enums.ts        ← Shared enums (Role, CourseLevel, ...)
```

### `src/index.ts` — Barrel export

```typescript
export * from "./utils";
export * from "./schemas";
export * from "./enums";
```

> 💡 Consumer chỉ cần `import { ... } from "@lms/types"` — không cần biết file nội bộ

---

## Slide 10 — File `enums.ts`

### Shared enum schemas

```typescript
import { z } from "zod";

// Roles trong hệ thống
export const RoleEnum = z.enum(["student", "teacher", "admin"]);
export type Role = z.infer<typeof RoleEnum>;

// Mức độ khóa học
export const CourseLevelEnum = z.enum(["beginner", "intermediate", "advanced"]);
export type CourseLevel = z.infer<typeof CourseLevelEnum>;

// Trạng thái khóa học
export const CourseStatusEnum = z.enum(["draft", "published", "archived"]);
export type CourseStatus = z.infer<typeof CourseStatusEnum>;

// Loại nội dung bài học
export const LessonContentEnum = z.enum(["video", "pdf", "text"]);
export type LessonContent = z.infer<typeof LessonContentEnum>;
```

---

## Slide 11 — File `utils.ts`

### Generic utility types (từ Video 7)

```typescript
// API envelope
export type ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type ApiFailure   = { ok: false; error: ApiError; requestId: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Result for functional error handling
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok  = <T>(value: T): Result<T, never>  => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E>  => ({ ok: false, error });

// Pagination
export interface PageRequest { page: number; pageSize: number }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

// Repository contract
export interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findMany(filter?: Partial<T>): Promise<T[]>;
  create(input: Omit<T, "id">): Promise<T>;
  update(id: ID, patch: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
}
```

---

## Slide 12 — File `schemas.ts` — Phần 1: User

```typescript
import { z } from "zod";
import { RoleEnum } from "./enums";

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  role: RoleEnum,
  passwordHash: z.string(),         // chỉ ở backend
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

// DTO: Input cho đăng ký (client gửi)
export const SignupDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(120),
});
export type SignupInput = z.infer<typeof SignupDto>;

// ViewModel: Public profile (bỏ passwordHash)
export const PublicUserSchema = UserSchema.omit({ passwordHash: true });
export type PublicUser = z.infer<typeof PublicUserSchema>;
```

---

## Slide 13 — File `schemas.ts` — Phần 2: Course

```typescript
import { CourseLevelEnum, CourseStatusEnum } from "./enums";

const SlugSchema = z.string().min(3).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase, digits, hyphens only");

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
```

---

## Slide 14 — Course DTOs và ViewModels

```typescript
// DTO: POST /courses (client gửi)
export const CreateCourseDto = CourseSchema.pick({
  slug: true, title: true, description: true, level: true,
  tags: true, coverImageUrl: true, priceCents: true,
});
export type CreateCourseInput = z.infer<typeof CreateCourseDto>;

// DTO: PATCH /courses/:id
export const UpdateCourseDto = CreateCourseDto.partial();
export type UpdateCourseInput = z.infer<typeof UpdateCourseDto>;

// ViewModel: Response (ẩn deletedAt)
export const PublicCourseSchema = CourseSchema.omit({ deletedAt: true });
export type PublicCourse = z.infer<typeof PublicCourseSchema>;

// ViewModel: List item (rút gọn cho UI list)
export const CourseListItemSchema = CourseSchema.pick({
  id: true, slug: true, title: true, level: true,
  tags: true, coverImageUrl: true, priceCents: true,
  status: true, teacherId: true, publishedAt: true, createdAt: true,
});
export type CourseListItem = z.infer<typeof CourseListItemSchema>;
```

---

## Slide 15 — Entity vs DTO vs ViewModel: 3 khái niệm

### Cùng resource — 3 góc nhìn khác nhau

| Khái niệm | Mục đích | Ví dụ field bỏ |
|-----------|---------|---------------|
| **Entity** (`CourseSchema`) | Full shape ở DB | Có hết: `passwordHash`, `deletedAt` |
| **DTO** (`CreateCourseDto`) | Input từ client | Bỏ `id`, `createdAt`, `version` (server tự sinh) |
| **ViewModel** (`PublicCourse`) | Output ra client | Bỏ `deletedAt`, `passwordHash` (sensitive) |

```typescript
// Backend flow:
//   client body → CreateCourseDto (validate)
//                ↓
//   service     → Course (entity, lưu DB)
//                ↓
//   response    → PublicCourse (strip sensitive)
```

---

## Slide 16 — Schemas: Lesson, Quiz, Enrollment

```typescript
// === Lesson ===
export const LessonSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  order: z.number().int().nonnegative(),
  contentType: LessonContentEnum,
  contentUrl: z.string().url().optional(),
  durationSeconds: z.number().int().positive().optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;

// === Quiz ===
export const QuestionSchema = z.object({
  q: z.string().min(1),
  choices: z.array(z.string()).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
});
export const QuizSchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().uuid(),
  questions: z.array(QuestionSchema).min(1).max(50),
});
export type Quiz = z.infer<typeof QuizSchema>;

// === Enrollment ===
export const EnrollmentSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrolledAt: z.coerce.date(),
  progress: z.number().min(0).max(1),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;
```

---

## Slide 17 — Khai báo dependency trong `apps/api`

### Bước 1: Add `@lms/types` vào dependencies

**`/apps/api/package.json`:**

```json
{
  "name": "@lms/api",
  "dependencies": {
    "@lms/types": "workspace:*",
    "@nestjs/common": "^10.0.0",
    "zod": "^3.23.0"
  }
}
```

### Bước 2: Install

```bash
pnpm install
```

→ pnpm tự symlink `@lms/types` vào `apps/api/node_modules/`

---

## Slide 18 — Sử dụng trong `apps/api`

### Import giống npm package bình thường

```typescript
// /apps/api/src/modules/courses/courses.controller.ts
import {
  CreateCourseDto,
  type CreateCourseInput,
  type Course,
  type PublicCourse,
} from "@lms/types";

@Controller("courses")
export class CoursesController {
  @Post()
  create(@Body() body: unknown): Promise<PublicCourse> {
    const validation = CreateCourseDto.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException(validation.error.flatten());
    }
    // validation.data: CreateCourseInput — type safe
    return this.service.create(validation.data);
  }
}
```

> 💡 IDE auto-complete `@lms/types` → thấy mọi schema và type

---

## Slide 19 — Tránh circular dependency

### Quy tắc vàng: dependency chiều 1 chiều

```
✅ Cho phép:
apps/api  → @lms/types
apps/web  → @lms/types
@lms/api  → @lms/config
@lms/config → @lms/types

❌ Tuyệt đối tránh:
@lms/types → @lms/api          (types phụ thuộc app)
@lms/types → @lms/config       (types phụ thuộc utility)
@lms/types ↔ @lms/types-helper (circular)
```

**Quy tắc:** Packages càng "thấp" càng không phụ thuộc gì
→ `@lms/types` là package thấp nhất → chỉ phụ thuộc Zod (external)

---

## Slide 20 — Naming convention: Schema vs Type

### Quy ước đặt tên dễ scan

| Thứ | Suffix | Ví dụ |
|-----|--------|-------|
| Zod schema | `Schema` | `CourseSchema`, `UserSchema` |
| TypeScript type | (không suffix) | `Course`, `User` |
| Enum schema | `Enum` | `RoleEnum`, `CourseLevelEnum` |
| Input DTO | `Dto` | `CreateCourseDto`, `UpdateCourseDto` |
| Input type | `Input` | `CreateCourseInput`, `UpdateCourseInput` |
| ViewModel schema | `Schema` (với prefix Public/List) | `PublicCourseSchema`, `CourseListItemSchema` |
| ViewModel type | (không suffix) | `PublicCourse`, `CourseListItem` |

```typescript
export const CourseSchema = z.object({ /* ... */ });
export type   Course      = z.infer<typeof CourseSchema>;

export const CreateCourseDto    = CourseSchema.pick({ /* ... */ });
export type  CreateCourseInput  = z.infer<typeof CreateCourseDto>;
```

---

## Slide 21 — Test schema có "ổn định" không?

### Schema test pattern

```typescript
// packages/types/src/schemas.test.ts
import { describe, it, expect } from "vitest";
import { CreateCourseDto, CourseSchema } from "./schemas";

describe("CreateCourseDto", () => {
  it("accepts valid input", () => {
    const result = CreateCourseDto.safeParse({
      slug: "react-101",
      title: "React Fundamentals",
      level: "beginner",
      tags: ["react"],
      priceCents: 4900,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid slug", () => {
    const result = CreateCourseDto.safeParse({
      slug: "Invalid Slug!",
      title: "React",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.slug).toBeDefined();
  });

  it("infers correct type", () => {
    type Input = z.infer<typeof CreateCourseDto>;
    const input: Input = { slug: "x", title: "x" };  // compile check
  });
});
```

---

## Slide 22 — Versioning shared types

### Khi nào "bump version" hay không?

**Internal monorepo (`workspace:*`):**

- ❌ Không cần version — luôn dùng latest
- ✅ Đổi schema → consumer tự thấy ngay
- ⚠️ Breaking change → cập nhật mọi consumer trong cùng PR

**Nếu publish ra ngoài (Khóa 8+):**

- ✅ Semver: `0.2.0` → `0.3.0` cho breaking
- ✅ Changelog mô tả thay đổi
- ✅ Migration guide

> 💡 Khóa 1: không publish → cứ thoải mái đổi schema

---

## Slide 23 — Best practices từ kinh nghiệm thật

### 6 nguyên tắc

**1. Schema là source of truth — KHÔNG viết type tay**
✅ `type X = z.infer<typeof XSchema>` ❌ `type X = { ... }`

**2. 1 entity = 1 file**
Không gộp `users.ts`, `courses.ts`, `quizzes.ts` chung

**3. Re-export từ `index.ts`, consumer chỉ import path gốc**
✅ `from "@lms/types"` ❌ `from "@lms/types/src/schemas/courses"`

**4. Sensitive field tách ra ViewModel**
Đừng trả `passwordHash` ra client, dù "tạm thời"

**5. DTO khác Entity — đừng dùng chung**
Server-set field (id, createdAt) không nên có trong DTO

**6. Test schema chính = test contract**
Schema thay đổi → test phải chạy

---

## Slide 24 — Khóa 4 chuẩn bị sẵn

### Frontend Next.js cũng dùng `@lms/types`

**Tương lai khi thêm `apps/web` (Khóa 4):**

```typescript
// apps/web/src/lib/api-client.ts
import {
  type Course,
  type CreateCourseInput,
  type ApiResponse,
  CourseListItemSchema,
} from "@lms/types";

export async function fetchCourses(): Promise<Course[]> {
  const res = await fetch("/api/courses");
  const json: ApiResponse<Course[]> = await res.json();

  if (!json.ok) throw new Error(json.error.message);

  // Validate response shape (defensive)
  return json.data.map(c => CourseListItemSchema.parse(c));
}
```

> 🎯 **Backend đổi schema** → Frontend phát hiện ngay ở compile time

---

## Slide 25 — Sơ đồ dependency cuối cùng

```
                    ┌──────────────┐
                    │  @lms/types  │   ← Foundation
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  @lms/config │   ← Utilities
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                          ▼
       ┌──────────────┐         ┌──────────────┐
       │  apps/api    │         │  apps/web    │
       │  (Khóa 1)    │         │  (Khóa 4)    │
       └──────────────┘         └──────────────┘
```

> 💡 Mọi mũi tên chỉ đi **xuống** trong sơ đồ — không có ngược

---

## Slide 26 — Bài tập thực hành

### 🎯 Hoàn thiện `packages/types/`

**Bài 1:** Tạo full package theo cấu trúc Slide 9

- `package.json` đúng
- `tsconfig.json` extends base
- `src/enums.ts`, `utils.ts`, `schemas.ts`, `index.ts`

**Bài 2:** Tạo schema cho `QuizResult`

```typescript
// QuizResult lưu kết quả 1 lần làm quiz:
// - id, userId, quizId (uuid)
// - score (0-100)
// - answers (mảng: questionId + selectedIndex)
// - submittedAt, gradedAt (date)
// - status: "submitted" | "graded"
```

**Bài 3:** Test schemas

- Viết test cho `CreateCourseDto` (3 case pass + 3 case fail)
- Đảm bảo `z.infer` type khớp manual type

---

## Slide 27 — Tổng kết Video 9 + Section 2

### Bạn vừa hoàn thành Section 2 — TypeScript Foundations 🎉

**5 video Section 2:**

- ✅ Video 5: Cơ bản TypeScript
- ✅ Video 6: TypeScript Strict mode
- ✅ Video 7: Interfaces và Generics
- ✅ Video 8: Validation Runtime với Zod
- ✅ Video 9: Kiến trúc Shared Types

**Bạn có gì rồi:**

- Package `@lms/types` với 5 domain schemas
- Generic utilities: `Result`, `ApiResponse`, `Page`, `Repository`
- DTO/ViewModel patterns sẵn sàng
- Setup workspace cho consumer

> 🚀 **Tiếp theo: Section 3 — Node.js Foundations**

---

<!-- _class: lead -->

# Tiếp theo: Video 10

## Hiểu Event Loop

Node.js single-thread vẫn nhanh nhờ event loop. 6 pha của event loop, microtask vs macrotask, `process.nextTick` vs `setTimeout`.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 10 🚀

> *"A schema shared is a bug avoided."*
