# CRUD Design — Resource: `Courses`

> Thiết kế CRUD đầy đủ cho resource **Course** — dùng làm **canonical example** cho toàn bộ resource khác (Lesson, Quiz, Enrollment...).
>
> **Scope phân theo syllabus:**
> - **Course 1:** Spec đầy đủ + in-memory implementation cho `GET /courses` + `POST /courses` (Backend skeleton).
> - **Course 2:** Hoàn thiện 7 endpoints CRUD + Auth (JWT) + rate limiting + pagination filtering layer.
> - **Course 3:** Replace in-memory bằng PostgreSQL + Prisma + migrations + analytics queries.
>
> Tài liệu này là **single source of truth** cho team — bất kể đang ở khoá nào, schema và contract phải khớp file này.

---

## 1. RESOURCE OVERVIEW

| Field | Value |
|-------|-------|
| Resource name | `Course` |
| Base path | `/courses` |
| Owner role | `teacher` (write) — `student` (read) |
| Identifier | `id: uuid` (primary) + `slug: string` (secondary, public-facing URL) |
| Soft delete | Yes (`deletedAt: timestamptz`) — không hard delete trong K1 |
| Audit | `createdAt`, `updatedAt` (auto-managed bằng trigger) |
| Versioning | `version: int` (default 1, tăng mỗi lần update) |

---

## 2. DOMAIN SCHEMA (Zod — `@lms/types`)

**File:** `/packages/types/src/schemas.ts`

```ts
import { z } from "zod";

// Enums
export const CourseLevelEnum = z.enum(["beginner", "intermediate", "advanced"]);
export type CourseLevel = z.infer<typeof CourseLevelEnum>;

export const CourseStatusEnum = z.enum(["draft", "published", "archived"]);
export type CourseStatus = z.infer<typeof CourseStatusEnum>;

// Slug rule: lowercase, digits, hyphens; 3–80 chars; không bắt đầu/kết thúc bằng hyphen
export const SlugSchema = z.string()
  .min(3).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits, single hyphens only");

// Full domain object (như trong DB)
export const CourseSchema = z.object({
  id: z.string().uuid(),
  slug: SlugSchema,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(""),
  level: CourseLevelEnum.default("beginner"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  coverImageUrl: z.string().url().nullable().default(null),
  priceCents: z.number().int().min(0).max(10_000_000).default(0),  // 0 = free, max $100K
  status: CourseStatusEnum.default("draft"),
  teacherId: z.string().uuid(),
  version: z.number().int().positive().default(1),
  publishedAt: z.coerce.date().nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable().default(null),
});
export type Course = z.infer<typeof CourseSchema>;

// DTO khi CREATE (client không gửi: id, version, publishedAt, createdAt, updatedAt, deletedAt)
export const CreateCourseDto = CourseSchema.pick({
  slug: true,
  title: true,
  description: true,
  level: true,
  tags: true,
  coverImageUrl: true,
  priceCents: true,
});
export type CreateCourseInput = z.infer<typeof CreateCourseDto>;

// DTO khi PATCH (mọi field optional, không cho đổi teacherId trực tiếp)
export const UpdateCourseDto = CreateCourseDto.partial();
export type UpdateCourseInput = z.infer<typeof UpdateCourseDto>;

// DTO transition (publish/archive là endpoint riêng — không qua PATCH)
export const PublishCourseDto = z.object({}).strict();  // empty body
export const ArchiveCourseDto = z.object({ reason: z.string().max(500).optional() }).strict();

// View model trả cho public (ẩn deletedAt + version chi tiết)
export const PublicCourseSchema = CourseSchema.omit({ deletedAt: true });
export type PublicCourse = z.infer<typeof PublicCourseSchema>;

// View model rút gọn cho list (ẩn description dài, giữ summary)
export const CourseListItemSchema = CourseSchema.pick({
  id: true, slug: true, title: true, level: true, tags: true,
  coverImageUrl: true, priceCents: true, status: true,
  teacherId: true, publishedAt: true, createdAt: true,
});
export type CourseListItem = z.infer<typeof CourseListItemSchema>;
```

**Tại sao split DTO:**
- `CourseSchema` = ground truth (DB row).
- `CreateCourseDto` = subset client được phép gửi (loại bỏ field server-managed).
- `UpdateCourseDto` = `.partial()` — client có thể update từng field.
- `PublicCourseSchema` = subset trả ra (ẩn `deletedAt` khỏi response).
- `CourseListItemSchema` = nhẹ hơn cho list view (không kèm `description` dài).

---

## 3. DATABASE SCHEMA (PostgreSQL — Course 3)

**Migration file:** `/apps/api/prisma/migrations/0001_init_courses/migration.sql`

### 3.1 Table DDL

```sql
-- Enable extensions (chạy 1 lần ở migration đầu tiên)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- full-text search trên title
CREATE EXTENSION IF NOT EXISTS "citext";        -- case-insensitive text (cho slug nếu cần)

-- Enums (PG native enum để tiết kiệm storage + validate ở DB)
CREATE TYPE course_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');

-- Table
CREATE TABLE courses (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(80)  NOT NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT         NOT NULL DEFAULT '',
  level           course_level NOT NULL DEFAULT 'beginner',
  tags            TEXT[]       NOT NULL DEFAULT '{}',           -- PG array, max 20 enforce ở app
  cover_image_url TEXT,                                          -- NULLable
  price_cents     INTEGER      NOT NULL DEFAULT 0 CHECK (price_cents >= 0 AND price_cents <= 10000000),
  status          course_status NOT NULL DEFAULT 'draft',
  teacher_id      UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version         INTEGER      NOT NULL DEFAULT 1 CHECK (version > 0),
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ                                    -- soft delete; NULL = live

  -- Constraints
  CONSTRAINT courses_title_len     CHECK (char_length(title) BETWEEN 3 AND 200),
  CONSTRAINT courses_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT courses_slug_len      CHECK (char_length(slug) BETWEEN 3 AND 80),
  CONSTRAINT courses_published_at  CHECK (
    (status = 'published' AND published_at IS NOT NULL) OR
    (status <> 'published' AND published_at IS NULL OR status = 'archived')
  )
);

-- Trigger tự động update updated_at + version
CREATE OR REPLACE FUNCTION trg_courses_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER courses_touch
BEFORE UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION trg_courses_touch();
```

### 3.2 Indexes

```sql
-- Unique slug nhưng chỉ với row chưa bị soft-delete (partial unique index)
CREATE UNIQUE INDEX idx_courses_slug_live
  ON courses (slug)
  WHERE deleted_at IS NULL;

-- Filter theo teacher (dashboard "khoá học của tôi")
CREATE INDEX idx_courses_teacher_id ON courses (teacher_id) WHERE deleted_at IS NULL;

-- List public — chỉ courses published và còn live
CREATE INDEX idx_courses_published
  ON courses (published_at DESC NULLS LAST)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Full-text search trigram trên title (?q=react)
CREATE INDEX idx_courses_title_trgm ON courses USING GIN (title gin_trgm_ops);

-- Tag search (?tag=javascript) — GIN trên array
CREATE INDEX idx_courses_tags ON courses USING GIN (tags);

-- Sort theo created_at default
CREATE INDEX idx_courses_created_at ON courses (created_at DESC) WHERE deleted_at IS NULL;
```

### 3.3 Lý do thiết kế

| Quyết định | Lý do |
|-----------|-------|
| `UUID` thay `bigserial` | Tránh leak business volume; safe để gen client-side (Prisma `cuid()` cũng ok). |
| `slug` partial unique | Soft delete rồi vẫn cho người khác dùng lại slug đó. |
| `price_cents` integer thay `numeric` | Tránh floating-point error, nhanh hơn. |
| `tags` PG array thay bảng `course_tags` | Số tag/course ≤ 20, query đơn giản hơn JOIN; GIN index đủ nhanh. |
| Soft delete | Audit + recoverable; không hard delete trong K1. |
| `version` bump tự động | Optimistic concurrency control sau này (`WHERE version = ?`). |
| Enum native PG | Validate ở DB; storage 4 byte; vẫn migrate được. |
| Trigger `updated_at` | Đảm bảo mọi UPDATE đều cập nhật, kể cả khi app quên. |

---

## 4. API CONTRACT — 7 ENDPOINTS CRUD

| # | Method | Path | Mục đích | Auth | Course |
|---|--------|------|----------|------|--------|
| 1 | `GET` | `/courses` | List + filter + paginate | Public | C1 |
| 2 | `GET` | `/courses/:idOrSlug` | Lấy 1 course | Public | C2 |
| 3 | `POST` | `/courses` | Tạo mới | Teacher | C1 (in-mem) → C2 (auth) |
| 4 | `PATCH` | `/courses/:id` | Cập nhật một phần | Owner / Admin | C2 |
| 5 | `POST` | `/courses/:id/publish` | Transition draft → published | Owner / Admin | C2 |
| 6 | `POST` | `/courses/:id/archive` | Transition → archived | Owner / Admin | C2 |
| 7 | `DELETE` | `/courses/:id` | Soft delete | Owner / Admin | C2 |

**Conventions chung:**
- Mọi response thành công wrap trong `ApiSuccess<T>` (xem F2.2): `{ ok: true, data: T, requestId }`.
- Mọi response lỗi wrap trong `ApiFailure`: `{ ok: false, error: { code, message, details? }, requestId }`.
- `requestId` header `x-request-id` echo về response.
- Content-Type: `application/json; charset=utf-8`.
- Date format: ISO 8601 UTC (`2026-05-16T10:42:00.000Z`).

---

### 4.1 `GET /courses` — List

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/courses` |
| **Auth** | Public (không cần token) |
| **Idempotent** | Yes • **Cacheable** | Yes (Course 6 sẽ cache Redis 60s) |

**Query params (Zod `ListCoursesQuery`):**
```ts
{
  page: number = 1,              // ≥ 1
  pageSize: number = 20,         // 1–100
  q?: string,                    // search title (trigram)
  status?: "draft"|"published"|"archived"|"all",  // default: "published" cho public; admin có thể "all"
  level?: "beginner"|"intermediate"|"advanced",
  teacherId?: uuid,
  tag?: string,                  // exact match trong tags array
  sort?: "newest"|"oldest"|"title_asc"|"title_desc",  // default "newest"
}
```

**Request example:**
```
GET /courses?page=2&pageSize=10&q=react&level=intermediate&sort=newest
Accept: application/json
x-request-id: 7c9a-...        (optional, server sẽ generate nếu thiếu)
```

**Response 200 OK:**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "slug": "intro-to-react-hooks",
        "title": "Intro to React Hooks",
        "level": "intermediate",
        "tags": ["react", "hooks", "frontend"],
        "coverImageUrl": "https://cdn.lms.io/c/abc.png",
        "priceCents": 1990,
        "status": "published",
        "teacherId": "22222222-2222-2222-2222-222222222222",
        "publishedAt": "2026-04-10T08:00:00.000Z",
        "createdAt": "2026-04-01T00:00:00.000Z"
      }
    ],
    "total": 47,
    "page": 2,
    "pageSize": 10
  },
  "requestId": "7c9a-..."
}
```

**SQL pseudo (Course 3):**
```sql
SELECT id, slug, title, level, tags, cover_image_url, price_cents,
       status, teacher_id, published_at, created_at
FROM courses
WHERE deleted_at IS NULL
  AND status = 'published'                          -- nếu public
  AND ($q IS NULL OR title ILIKE '%' || $q || '%')
  AND ($level IS NULL OR level = $level)
  AND ($teacher_id IS NULL OR teacher_id = $teacher_id)
  AND ($tag IS NULL OR $tag = ANY(tags))
ORDER BY
  CASE WHEN $sort = 'newest' THEN created_at END DESC NULLS LAST,
  CASE WHEN $sort = 'oldest' THEN created_at END ASC  NULLS LAST,
  CASE WHEN $sort = 'title_asc' THEN title END ASC,
  CASE WHEN $sort = 'title_desc' THEN title END DESC
LIMIT $pageSize OFFSET (($page - 1) * $pageSize);

-- Total count cho pagination
SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL ...;
```

**Error responses:**
| Status | Code | Khi nào |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | `pageSize > 100`, `page < 1`, sort không nằm trong enum |

**Acceptance:**
- ✅ `?pageSize=999` → 400 + `error.details` chỉ rõ field.
- ✅ Không có result → `items: []`, `total: 0`, vẫn `ok: true`.
- ✅ `total` đếm sau filter, không phải toàn bảng.

---

### 4.2 `GET /courses/:idOrSlug` — Detail

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/courses/:idOrSlug` (uuid HOẶC slug) |
| **Auth** | Public cho `published`; Owner/Admin cho `draft`/`archived` |

**Path param resolver:**
- Regex UUID v4: nếu match → query `WHERE id = $1`.
- Ngược lại → coi như slug, query `WHERE slug = $1`.

**Request example:**
```
GET /courses/intro-to-react-hooks
```

**Response 200 OK:**
```json
{
  "ok": true,
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "slug": "intro-to-react-hooks",
    "title": "Intro to React Hooks",
    "description": "Learn modern React hooks from scratch...",
    "level": "intermediate",
    "tags": ["react", "hooks", "frontend"],
    "coverImageUrl": "https://cdn.lms.io/c/abc.png",
    "priceCents": 1990,
    "status": "published",
    "teacherId": "22222222-2222-2222-2222-222222222222",
    "version": 3,
    "publishedAt": "2026-04-10T08:00:00.000Z",
    "createdAt": "2026-04-01T00:00:00.000Z",
    "updatedAt": "2026-04-15T12:30:00.000Z"
  },
  "requestId": "..."
}
```

**Error responses:**
| Status | Code | Khi nào |
|--------|------|---------|
| 404 | `NOT_FOUND` | Không tồn tại / đã soft-delete / draft mà user không phải owner |
| 403 | `FORBIDDEN` | Course `archived` hoặc `draft` mà user là student khác |

**Acceptance:**
- ✅ Slug và id đều hoạt động.
- ✅ Draft course chỉ owner + admin xem được.
- ✅ Response có `version` (cho optimistic concurrency ở PATCH).

---

### 4.3 `POST /courses` — Create

| | |
|--|--|
| **Method** | `POST` |
| **Path** | `/courses` |
| **Auth** | `teacher` hoặc `admin` (C2) — C1 in-memory không check auth |
| **Idempotent** | No (mỗi POST tạo mới); client có thể dùng `Idempotency-Key` header (Course 2) |

**Request body (Zod `CreateCourseDto`):**
```json
{
  "slug": "intro-to-react-hooks",
  "title": "Intro to React Hooks",
  "description": "Learn modern React hooks from scratch...",
  "level": "intermediate",
  "tags": ["react", "hooks"],
  "coverImageUrl": "https://cdn.lms.io/c/abc.png",
  "priceCents": 1990
}
```

**Server-set fields (client KHÔNG được gửi):**
- `id` → `crypto.randomUUID()`
- `teacherId` → từ JWT `sub` (C2) — C1 dùng default user
- `status` → luôn `"draft"` lúc tạo (publish qua endpoint riêng)
- `version` → 1
- `createdAt`/`updatedAt` → `NOW()` (DB default)
- `publishedAt` → `null`
- `deletedAt` → `null`

**Validation chain:**
1. `CreateCourseDto.safeParse(body)` → 400 nếu fail.
2. Check slug unique (in-mem trong C1, DB query trong C3) → 409 nếu trùng.
3. Insert.

**Response 201 Created:**
```http
HTTP/1.1 201 Created
Location: /courses/intro-to-react-hooks
Content-Type: application/json
x-request-id: 7c9a-...
```
```json
{
  "ok": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "slug": "intro-to-react-hooks",
    "title": "Intro to React Hooks",
    "description": "Learn modern React hooks from scratch...",
    "level": "intermediate",
    "tags": ["react", "hooks"],
    "coverImageUrl": "https://cdn.lms.io/c/abc.png",
    "priceCents": 1990,
    "status": "draft",
    "teacherId": "22222222-2222-2222-2222-222222222222",
    "version": 1,
    "publishedAt": null,
    "createdAt": "2026-05-16T10:42:00.000Z",
    "updatedAt": "2026-05-16T10:42:00.000Z"
  },
  "requestId": "7c9a-..."
}
```

**Error responses:**
| Status | Code | Khi nào | Body `error.details` |
|--------|------|---------|----------------------|
| 400 | `VALIDATION_ERROR` | Body fail Zod | `{ title: ["String too short"], ... }` |
| 401 | `UNAUTHORIZED` | Thiếu JWT (C2) | — |
| 403 | `FORBIDDEN` | Role không phải teacher/admin (C2) | — |
| 409 | `CONFLICT` | `slug` đã tồn tại (chưa soft delete) | `{ field: "slug", reason: "already_exists" }` |

**Acceptance:**
- ✅ Body thiếu `title` → 400 + details chỉ rõ field.
- ✅ Slug "Bad Slug!" → 400 (regex fail).
- ✅ Slug trùng → 409 `CONFLICT`.
- ✅ Hợp lệ → 201 + `Location` header + body parse được `CourseSchema`.

---

### 4.4 `PATCH /courses/:id` — Partial Update

| | |
|--|--|
| **Method** | `PATCH` |
| **Path** | `/courses/:id` (chỉ chấp nhận UUID, không slug) |
| **Auth** | Owner (teacher tạo course) hoặc `admin` |
| **Idempotent** | Yes (gửi cùng body 2 lần → cùng kết quả) |

**Request body (Zod `UpdateCourseDto` = `CreateCourseDto.partial()`):**
```json
{
  "title": "Intro to React Hooks (2026 Edition)",
  "tags": ["react", "hooks", "2026"]
}
```

**Optimistic concurrency (optional but recommended):**
- Client gửi header `If-Match: "3"` (version hiện tại).
- Server check `WHERE id = ? AND version = ?` — nếu 0 row → 412 `PRECONDITION_FAILED`.

**Slug change behavior:**
- Đổi slug → check unique như POST.
- Đề nghị **immutable sau khi published** (slug = canonical URL): nếu `status = "published"` thì không cho đổi slug → 400.

**Response 200 OK:**
```json
{
  "ok": true,
  "data": {
    "id": "33333333-...",
    "slug": "intro-to-react-hooks",
    "title": "Intro to React Hooks (2026 Edition)",
    "tags": ["react", "hooks", "2026"],
    "version": 4,
    "updatedAt": "2026-05-16T11:00:00.000Z",
    "...": "(các field khác giữ nguyên)"
  },
  "requestId": "..."
}
```

**Error responses:**
| Status | Code | Khi nào |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Body fail Zod / cố đổi slug khi đã published |
| 401 | `UNAUTHORIZED` | Thiếu token |
| 403 | `FORBIDDEN` | Không phải owner / admin |
| 404 | `NOT_FOUND` | Course không tồn tại |
| 409 | `CONFLICT` | Đổi slug → trùng |
| 412 | `PRECONDITION_FAILED` | `If-Match` không khớp `version` |

**Acceptance:**
- ✅ Body rỗng `{}` → 200 không thay đổi gì (nhưng `version` không bump vì không update thật).
- ✅ Đổi slug khi `status = "draft"` → OK.
- ✅ Đổi slug khi `status = "published"` → 400.

---

### 4.5 `POST /courses/:id/publish` — Transition draft → published

| | |
|--|--|
| **Method** | `POST` (action endpoint, không phải PATCH) |
| **Path** | `/courses/:id/publish` |
| **Auth** | Owner hoặc admin |
| **Idempotent** | Yes (publish 2 lần = published vẫn published) |

**Request body:** Empty `{}` (Zod `PublishCourseDto`).

**Business rules:**
- Chỉ cho phép từ `status = "draft"` (hoặc `archived` → unarchive).
- Pre-condition: `title`, `description` không rỗng, có ít nhất 1 lesson (kiểm tra ở C2 khi có Lesson resource).
- Set `status = "published"`, `publishedAt = NOW()`.

**Response 200 OK:**
```json
{
  "ok": true,
  "data": { "...course đầy đủ...", "status": "published", "publishedAt": "2026-05-16T11:05:00Z" },
  "requestId": "..."
}
```

**Error responses:**
| Status | Code | Khi nào |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Course chưa đủ điều kiện publish (no lessons, title empty) |
| 403 | `FORBIDDEN` | Không phải owner |
| 404 | `NOT_FOUND` | Course không tồn tại |
| 409 | `CONFLICT` | Course đang `archived` (cần unarchive trước) |

---

### 4.6 `POST /courses/:id/archive` — Transition → archived

| | |
|--|--|
| **Method** | `POST` |
| **Path** | `/courses/:id/archive` |
| **Auth** | Owner / admin |
| **Idempotent** | Yes |

**Request body:**
```json
{ "reason": "Outdated content" }
```

**Behavior:**
- Set `status = "archived"`.
- Course không còn xuất hiện trong list public.
- Student đã enroll vẫn xem được (logic ở Enrollment, không phải Course).
- Log `reason` vào audit table (Course 7).

**Response 200 OK** — same shape như publish.

---

### 4.7 `DELETE /courses/:id` — Soft Delete

| | |
|--|--|
| **Method** | `DELETE` |
| **Path** | `/courses/:id` |
| **Auth** | Owner / admin |
| **Idempotent** | Yes (delete 2 lần = vẫn deleted) |

**Behavior:**
- `UPDATE courses SET deleted_at = NOW(), status = 'archived' WHERE id = ?`.
- Slug được giải phóng (partial unique index không tính row có `deleted_at`).
- Student không còn thấy course.
- Admin có thể restore qua endpoint `POST /admin/courses/:id/restore` (deferred).

**Response 204 No Content** (body rỗng).

```http
HTTP/1.1 204 No Content
x-request-id: ...
```

**Error responses:**
| Status | Code | Khi nào |
|--------|------|---------|
| 401 | `UNAUTHORIZED` | Thiếu token |
| 403 | `FORBIDDEN` | Không phải owner |
| 404 | `NOT_FOUND` | Đã bị delete hoặc không tồn tại |

**Cascade behavior:**
- Lessons thuộc course → KHÔNG hard delete; mark `archived` (xử lý ở C2 Lesson module).
- Enrollments → giữ nguyên (audit, refund logic ở C2).
- Quizzes/Submissions → giữ nguyên cho analytics.

---

## 5. CONTROLLER LAYOUT (NestJS)

**File:** `/apps/api/src/modules/courses/courses.controller.ts`

```ts
@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // 1) GET /courses
  @Get()
  list(
    @Query(new ZodValidationPipe(ListCoursesQuery)) query: ListCoursesQueryInput,
    @CurrentUser() user?: UserContext,
  ): Promise<Page<CourseListItem>> {
    return this.courses.list(query, user);
  }

  // 2) GET /courses/:idOrSlug
  @Get(":idOrSlug")
  detail(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user?: UserContext,
  ): Promise<PublicCourse> {
    return this.courses.detail(idOrSlug, user);
  }

  // 3) POST /courses
  @Post()
  @HttpCode(201)
  @Roles("teacher", "admin")
  async create(
    @Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput,
    @CurrentUser() user: UserContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicCourse> {
    const created = await this.courses.create(body, user);
    res.setHeader("Location", `/courses/${created.slug}`);
    return created;
  }

  // 4) PATCH /courses/:id
  @Patch(":id")
  @Roles("teacher", "admin")
  update(
    @Param("id", new ParseUuidPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCourseDto)) body: UpdateCourseInput,
    @Headers("if-match") ifMatch: string | undefined,
    @CurrentUser() user: UserContext,
  ): Promise<PublicCourse> {
    return this.courses.update(id, body, { ifMatch, user });
  }

  // 5) POST /courses/:id/publish
  @Post(":id/publish")
  @Roles("teacher", "admin")
  publish(
    @Param("id", new ParseUuidPipe()) id: string,
    @CurrentUser() user: UserContext,
  ): Promise<PublicCourse> {
    return this.courses.publish(id, user);
  }

  // 6) POST /courses/:id/archive
  @Post(":id/archive")
  @Roles("teacher", "admin")
  archive(
    @Param("id", new ParseUuidPipe()) id: string,
    @Body(new ZodValidationPipe(ArchiveCourseDto)) body: { reason?: string },
    @CurrentUser() user: UserContext,
  ): Promise<PublicCourse> {
    return this.courses.archive(id, body.reason, user);
  }

  // 7) DELETE /courses/:id
  @Delete(":id")
  @HttpCode(204)
  @Roles("teacher", "admin")
  remove(
    @Param("id", new ParseUuidPipe()) id: string,
    @CurrentUser() user: UserContext,
  ): Promise<void> {
    return this.courses.softDelete(id, user);
  }
}
```

---

## 6. SERVICE LAYER (signature only)

**File:** `/apps/api/src/modules/courses/courses.service.ts`

```ts
@Injectable()
export class CoursesService {
  constructor(
    @Inject("COURSE_REPOSITORY") private readonly repo: CourseRepository,
  ) {}

  list(q: ListCoursesQueryInput, user?: UserContext): Promise<Page<CourseListItem>>;
  detail(idOrSlug: string, user?: UserContext): Promise<PublicCourse>;
  create(input: CreateCourseInput, user: UserContext): Promise<PublicCourse>;
  update(id: string, patch: UpdateCourseInput, ctx: { ifMatch?: string; user: UserContext }): Promise<PublicCourse>;
  publish(id: string, user: UserContext): Promise<PublicCourse>;
  archive(id: string, reason: string | undefined, user: UserContext): Promise<PublicCourse>;
  softDelete(id: string, user: UserContext): Promise<void>;
}
```

**Authorization helper:**
```ts
private assertOwner(course: Course, user: UserContext): void {
  if (user.role === "admin") return;
  if (course.teacherId !== user.id) throw new ForbiddenException();
}
```

---

## 7. REPOSITORY INTERFACE (cho phép swap in-mem ↔ Postgres)

**File:** `/apps/api/src/modules/courses/courses.repository.ts`

```ts
export interface CourseRepository {
  findMany(filter: CourseFilter): Promise<{ items: Course[]; total: number }>;
  findById(id: string): Promise<Course | null>;
  findBySlug(slug: string): Promise<Course | null>;
  existsBySlug(slug: string): Promise<boolean>;
  insert(input: Omit<Course, "createdAt" | "updatedAt" | "version" | "publishedAt" | "deletedAt"> & { teacherId: string }): Promise<Course>;
  update(id: string, patch: Partial<Course>, expectedVersion?: number): Promise<Course>;
  softDelete(id: string): Promise<void>;
}
```

**Course 1 implementation:** `InMemoryCourseRepository` (Map<string, Course>).
**Course 3 implementation:** `PrismaCourseRepository`.

Cùng interface → controller + service không đổi khi swap.

---

## 8. EXAMPLES — `curl` đầy đủ

```bash
# List
curl -i "http://localhost:3000/courses?page=1&pageSize=10&q=react"

# Detail
curl -i "http://localhost:3000/courses/intro-to-react-hooks"

# Create (C2 cần Authorization header)
curl -i -X POST "http://localhost:3000/courses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{
    "slug":"intro-to-react-hooks",
    "title":"Intro to React Hooks",
    "description":"Learn modern React hooks from scratch",
    "level":"intermediate",
    "tags":["react","hooks"],
    "priceCents":1990
  }'

# Patch với optimistic concurrency
curl -i -X PATCH "http://localhost:3000/courses/33333333-3333-3333-3333-333333333333" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -H "If-Match: 3" \
  -d '{ "title": "Intro to React Hooks (2026 Edition)" }'

# Publish
curl -i -X POST "http://localhost:3000/courses/33333333-3333-3333-3333-333333333333/publish" \
  -H "Authorization: Bearer <jwt>"

# Archive
curl -i -X POST "http://localhost:3000/courses/33333333-.../archive" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{ "reason": "Outdated content" }'

# Soft delete
curl -i -X DELETE "http://localhost:3000/courses/33333333-..." \
  -H "Authorization: Bearer <jwt>"
```

---

## 9. STATE MACHINE — Course Status

```
   ┌─────────┐  publish   ┌────────────┐  archive  ┌──────────┐
   │  draft  │ ─────────▶ │ published  │ ────────▶ │ archived │
   │ (init)  │ ◀───────── │            │ ◀──────── │          │
   └─────────┘  (no path) └────────────┘  publish  └──────────┘
        │                                              │
        │                soft delete                    │
        └──────────────────────┬────────────────────────┘
                               ▼
                         ┌──────────┐
                         │ deleted  │  (deleted_at IS NOT NULL)
                         │ (hidden) │
                         └──────────┘
                               │
                               │  admin restore (deferred)
                               ▼
                         (back to archived)
```

**Transition rules:**
| From | To | Endpoint | Side effect |
|------|-----|----------|-------------|
| `draft` | `published` | `POST /:id/publish` | Set `publishedAt = NOW()` |
| `published` | `archived` | `POST /:id/archive` | Hide khỏi list public |
| `archived` | `published` | `POST /:id/publish` | Re-set `publishedAt = NOW()` |
| any (not deleted) | (soft) deleted | `DELETE /:id` | Set `deletedAt = NOW()` |
| `published` | `draft` | ❌ Không cho phép | (force user archive trước) |

---

## 10. TEST MATRIX

| # | Test case | Endpoint | Expected | Course |
|---|-----------|----------|----------|--------|
| T1 | List default | `GET /courses` | 200, `page=1, pageSize=20, status=published` | C1 |
| T2 | List validation | `GET /courses?pageSize=999` | 400 `VALIDATION_ERROR` | C1 |
| T3 | List search | `GET /courses?q=react` | 200, items chứa "react" | C1 |
| T4 | Detail by slug | `GET /courses/intro-to-react-hooks` | 200 | C2 |
| T5 | Detail not found | `GET /courses/missing` | 404 `NOT_FOUND` | C2 |
| T6 | Create valid | `POST /courses` body hợp lệ | 201 + `Location` header | C1 |
| T7 | Create missing title | `POST /courses` body `{}` | 400 + details | C1 |
| T8 | Create slug duplicate | `POST /courses` slug trùng | 409 `CONFLICT` | C1 |
| T9 | Create bad slug | `POST /courses` slug `"Bad Slug!"` | 400 | C1 |
| T10 | Patch | `PATCH /courses/:id` title mới | 200, `version` +1 | C2 |
| T11 | Patch wrong version | `PATCH` `If-Match: 1` (current 2) | 412 `PRECONDITION_FAILED` | C2 |
| T12 | Patch slug khi published | `PATCH` đổi slug | 400 | C2 |
| T13 | Publish | `POST /:id/publish` từ draft | 200, `status=published`, `publishedAt` set | C2 |
| T14 | Archive | `POST /:id/archive` | 200, `status=archived`, không còn trong list public | C2 |
| T15 | Soft delete | `DELETE /:id` | 204 no body | C2 |
| T16 | Forbidden | `PATCH /:id` không phải owner | 403 `FORBIDDEN` | C2 |

---

## 11. PERFORMANCE TARGETS

| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| `GET /courses` (no filter, 1k rows) | 15ms | 40ms | 80ms |
| `GET /courses?q=...` (trigram) | 25ms | 70ms | 150ms |
| `GET /courses/:slug` | 5ms | 15ms | 30ms |
| `POST /courses` | 20ms | 50ms | 100ms |
| `PATCH /courses/:id` | 15ms | 40ms | 80ms |

**Đạt qua:**
- Partial unique index trên `slug` (lookup O(log n)).
- GIN trigram cho search.
- Connection pooling (Course 3).
- Redis cache 60s cho `GET /courses` (Course 6).

---

## 12. CHECKLIST PER COURSE

### Course 1 (đang làm — backend skeleton)
- [x] Domain Zod schemas (F2.3).
- [x] `CoursesController` với `GET` + `POST` (F4.3, F4.4).
- [x] `CoursesService` in-memory store.
- [x] `ZodValidationPipe` validate body/query.
- [x] `AllExceptionsFilter` map error chuẩn.
- [ ] Repository interface (`CourseRepository`) — abstraction ready để C3 swap.
- [ ] Test T1, T2, T3, T6, T7, T8, T9.

### Course 2 (Backend full)
- [ ] Auth guard (`@Roles("teacher","admin")`, `@CurrentUser()`).
- [ ] Endpoints 2, 4, 5, 6, 7 (Detail, Patch, Publish, Archive, Delete).
- [ ] Optimistic concurrency (`If-Match` header).
- [ ] Rate limiting trên `POST`/`PATCH`/`DELETE`.
- [ ] Test T4, T5, T10–T16.

### Course 3 (Database)
- [ ] Migration `0001_init_courses` chạy thành công.
- [ ] `PrismaCourseRepository` implement đầy đủ `CourseRepository`.
- [ ] Trigger `trg_courses_touch` + 6 index tạo OK.
- [ ] Performance target đạt ở dataset 10k rows.
- [ ] Seed script tạo 50 course mẫu.

### Course 4 (Frontend)
- [ ] `apiFetch<Course>("/courses/...")` typed end-to-end.
- [ ] Optimistic update khi PATCH (TanStack Query).
- [ ] UI screens S3/S4 wire với 7 endpoints này.
