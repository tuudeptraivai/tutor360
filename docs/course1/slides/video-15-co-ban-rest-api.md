---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 15: Cơ Bản về REST API'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cơ Bản về
# REST API

### Khóa 1 — Video 15

**Thiết kế API như senior engineer**

> Cùng REST nhưng có người làm đúng, có người làm sai cả 8 năm

---

## Slide 2 — Mục tiêu video này

Sau 30 phút, bạn sẽ:

- ✅ Hiểu **REST là gì**, 6 nguyên tắc cốt lõi
- ✅ Master **HTTP methods**: GET, POST, PUT, PATCH, DELETE
- ✅ Biết **HTTP status codes** dùng đúng (2xx, 3xx, 4xx, 5xx)
- ✅ Thiết kế **resource URL** đẹp: `/courses`, `/courses/:id`, `/courses/:id/lessons`
- ✅ Viết **`CoursesController`** với `GET /courses` và `POST /courses`
- ✅ Implement **pagination**: `page`, `pageSize`, `sort`, `filter`
- ✅ Áp dụng **Repository pattern** — tách logic dữ liệu

> 🎯 Cuối video: 2 endpoint `/courses` chạy ngon lành với in-memory store

---

## Slide 3 — REST là gì?

### REST = REpresentational State Transfer

**Roy Fielding (2000):** kiến trúc style cho distributed systems

**6 nguyên tắc:**

1. **Client-Server** — tách FE và BE
2. **Stateless** — mỗi request độc lập, server không nhớ
3. **Cacheable** — response phải tự khai báo có cache được không
4. **Uniform Interface** — API thống nhất (URL, methods, format)
5. **Layered System** — client không biết có proxy, CDN, load balancer
6. **Code on Demand** (optional) — server có thể gửi JS chạy ở client

> 💡 Hiểu nguyên tắc 2, 4 là đủ cho 95% use case

---

## Slide 4 — HTTP Methods: 5 method chính

### Mỗi method có ngữ nghĩa rõ ràng

| Method | Mục đích | Idempotent? | Safe? |
|--------|---------|------------|-------|
| **GET** | Lấy data | ✅ | ✅ |
| **POST** | Tạo mới | ❌ | ❌ |
| **PUT** | Replace toàn bộ | ✅ | ❌ |
| **PATCH** | Update 1 phần | ⚠️ | ❌ |
| **DELETE** | Xóa | ✅ | ❌ |

- **Safe** = không thay đổi state server
- **Idempotent** = gọi 1 hay 100 lần kết quả giống nhau

> 💡 GET KHÔNG được modify data — nếu modify → bot/crawler có thể vô tình xoá data của bạn

---

## Slide 5 — POST vs PUT vs PATCH: Khác biệt

### Cùng "thay đổi" nhưng ngữ nghĩa khác

```bash
# POST — tạo mới (server tự sinh id)
POST /courses
Body: { title: "React 101" }
→ 201 Created
→ Header: Location: /courses/c-uuid-1

# PUT — REPLACE toàn bộ (id đã biết trước)
PUT /courses/c-1
Body: { title: "React 102", description: "...", level: "beginner" }
→ 200 OK (tất cả field bắt buộc trong body)

# PATCH — UPDATE 1 phần
PATCH /courses/c-1
Body: { title: "React 102" }  ← chỉ field cần đổi
→ 200 OK
```

**Quy tắc thực tế:**
- POST cho create
- PATCH cho partial update (thông dụng)
- PUT chỉ dùng khi bạn thật sự muốn REPLACE

---

## Slide 6 — HTTP Status Codes: 5 nhóm

### Cheat sheet

| Range | Nghĩa | Ví dụ phổ biến |
|-------|------|---------------|
| **2xx** Success | OK | 200, 201, 204 |
| **3xx** Redirect | Đi chỗ khác | 301, 302, 304 |
| **4xx** Client error | Lỗi do client | 400, 401, 403, 404, 409, 429 |
| **5xx** Server error | Lỗi do server | 500, 502, 503 |

**Top 10 status codes cần thuộc:**

- **200 OK** — request thành công, có body
- **201 Created** — tạo mới thành công (kèm `Location` header)
- **204 No Content** — thành công, không có body (DELETE)
- **400 Bad Request** — validation fail
- **401 Unauthorized** — chưa đăng nhập
- **403 Forbidden** — đăng nhập rồi nhưng không có quyền
- **404 Not Found** — resource không tồn tại
- **409 Conflict** — vi phạm constraint (vd: slug trùng)
- **429 Too Many Requests** — rate limit
- **500 Internal Server Error** — server bug

---

## Slide 7 — Status code thực dụng cho LMS

### Map endpoint → status

```
POST /courses
  ✅ 201 Created + body course mới + Location header
  ❌ 400 Bad Request (validation fail)
  ❌ 401 Unauthorized (chưa login)
  ❌ 409 Conflict (slug đã tồn tại)

GET /courses
  ✅ 200 OK + array
  ❌ 400 Bad Request (query param sai format)

GET /courses/:id
  ✅ 200 OK + body
  ❌ 404 Not Found

PATCH /courses/:id
  ✅ 200 OK + body updated
  ❌ 400 (validation fail)
  ❌ 404 (course không tồn tại)
  ❌ 409 (concurrent update conflict)

DELETE /courses/:id
  ✅ 204 No Content
  ❌ 404
```

---

## Slide 8 — Resource URL design: Tốt vs Tệ

### Pattern naming chuẩn

**❌ URL như RPC (xấu)**

```
GET  /getAllCourses
POST /createCourse
POST /updateCourse/:id
POST /deleteCourse/:id
GET  /getCoursesByTeacher/:teacherId
```

**✅ URL như resource (REST)**

```
GET    /courses
POST   /courses
PATCH  /courses/:id
DELETE /courses/:id
GET    /courses?teacherId=t-1
```

**Quy tắc:**

- ✅ Plural noun: `/courses` (không `/course`)
- ✅ Lowercase + hyphen: `/student-progress` (không `/StudentProgress`)
- ✅ Method thể hiện action — URL chỉ thể hiện resource

---

## Slide 9 — Nested resources

### Pattern cho relationship

```
GET    /courses/:id/lessons          ← bài giảng của course này
POST   /courses/:id/lessons          ← thêm bài cho course
GET    /courses/:id/lessons/:lesId   ← 1 bài cụ thể

GET    /users/:id/enrollments        ← khóa học user đã ghi danh
POST   /users/:id/enrollments        ← ghi danh
DELETE /users/:id/enrollments/:eId   ← huỷ ghi danh
```

**Nhưng đừng nest sâu hơn 2 levels:**

❌ `/teachers/:tid/courses/:cid/lessons/:lid/comments/:coid`

✅ `/comments/:id` + filter `/comments?lessonId=...`

---

## Slide 10 — Query parameters: Pagination + Filter + Sort

### URL pattern chuẩn

```
GET /courses?page=2&pageSize=20&sort=newest&status=published&level=intermediate
```

**Phân loại query:**

| Loại | Ví dụ |
|------|-------|
| **Pagination** | `page=1&pageSize=20` |
| **Sorting** | `sort=newest`, `sort=title_asc` |
| **Filter** | `status=published`, `level=beginner` |
| **Search** | `q=react` |
| **Field selection** | `fields=id,title,slug` |
| **Expand** | `include=lessons,teacher` |

> 💡 Khóa 1 implement: page, pageSize, q, status, level, teacherId, tag, sort

---

## Slide 11 — Validate query với Zod

### File `/apps/api/src/modules/courses/dto/list-courses.query.ts`

```typescript
import { z } from "zod";
import { CourseLevelEnum } from "@lms/types";

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

**`z.coerce.number()`** = cast string từ URL về number tự động.

---

## Slide 12 — CoursesModule: Setup tổng thể

### `/apps/api/src/modules/courses/courses.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";
import { InMemoryCourseRepository } from "./repositories/in-memory.repository";

export const COURSE_REPOSITORY = Symbol("COURSE_REPOSITORY");

@Module({
  controllers: [CoursesController],
  providers: [
    CoursesService,
    {
      provide: COURSE_REPOSITORY,
      useClass: InMemoryCourseRepository,
    },
  ],
})
export class CoursesModule {}
```

**Pattern Khóa 3 sẽ thay 1 dòng:**

```typescript
{ provide: COURSE_REPOSITORY, useClass: PrismaCourseRepository }
```

---

## Slide 13 — Repository Interface

### File `/apps/api/src/modules/courses/courses.repository.ts`

```typescript
import type { Course, CreateCourseInput } from "@lms/types";
import type { ListCoursesQueryInput } from "./dto/list-courses.query";

export interface CourseFilter extends ListCoursesQueryInput {}

export interface CourseRepository {
  findMany(filter: CourseFilter): Promise<{ items: Course[]; total: number }>;
  findById(id: string): Promise<Course | null>;
  findBySlug(slug: string): Promise<Course | null>;
  existsBySlug(slug: string): Promise<boolean>;
  insert(input: CreateCourseInput & { teacherId: string }): Promise<Course>;
  update(id: string, patch: Partial<Course>): Promise<Course>;
  softDelete(id: string): Promise<void>;
}
```

**Vì sao tách interface?**

- ✅ Service depend interface, không depend impl
- ✅ Khóa 3 swap PrismaRepository không sửa controller/service
- ✅ Test dùng MockRepository dễ dàng

---

## Slide 14 — In-Memory Repository: Khóa 1

### File `/apps/api/src/modules/courses/repositories/in-memory.repository.ts`

```typescript
import { Injectable } from "@nestjs/common";
import type { Course, CreateCourseInput } from "@lms/types";
import type { CourseRepository, CourseFilter } from "../courses.repository";

const SORTERS = {
  newest:     (a: Course, b: Course) => +b.createdAt - +a.createdAt,
  oldest:     (a: Course, b: Course) => +a.createdAt - +b.createdAt,
  title_asc:  (a: Course, b: Course) => a.title.localeCompare(b.title),
  title_desc: (a: Course, b: Course) => b.title.localeCompare(a.title),
};

@Injectable()
export class InMemoryCourseRepository implements CourseRepository {
  private readonly store = new Map<string, Course>();

  async findMany(filter: CourseFilter) {
    let arr = Array.from(this.store.values())
      .filter(c => c.deletedAt === null);

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
    const items = arr.slice(
      (filter.page - 1) * filter.pageSize,
      filter.page * filter.pageSize,
    );
    return { items, total };
  }
  // ... findById, insert (xem slide tiếp)
}
```

---

## Slide 15 — Repository methods còn lại

```typescript
async findById(id: string) {
  return this.store.get(id) ?? null;
}

async findBySlug(slug: string) {
  for (const c of this.store.values()) {
    if (c.slug === slug && c.deletedAt === null) return c;
  }
  return null;
}

async existsBySlug(slug: string) {
  return (await this.findBySlug(slug)) !== null;
}

async insert(input: CreateCourseInput & { teacherId: string }): Promise<Course> {
  const now = new Date();
  const course: Course = {
    id: crypto.randomUUID(),
    ...input,
    status: "draft",
    version: 1,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  this.store.set(course.id, course);
  return course;
}

async update(id: string, patch: Partial<Course>) {
  const existing = this.store.get(id);
  if (!existing) throw new Error("Not found");
  const updated = { ...existing, ...patch, version: existing.version + 1, updatedAt: new Date() };
  this.store.set(id, updated);
  return updated;
}
```

---

## Slide 16 — Service: Business logic

### File `/apps/api/src/modules/courses/courses.service.ts`

```typescript
import { Inject, Injectable, ConflictException } from "@nestjs/common";
import type { CourseListItem, PublicCourse, CreateCourseInput } from "@lms/types";
import type { Page } from "@lms/types";
import { COURSE_REPOSITORY } from "./courses.module";
import type { CourseRepository } from "./courses.repository";
import type { ListCoursesQueryInput } from "./dto/list-courses.query";

const DEFAULT_TEACHER_ID = "00000000-0000-0000-0000-000000000001";

@Injectable()
export class CoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY)
    private readonly repo: CourseRepository,
  ) {}

  async list(q: ListCoursesQueryInput): Promise<Page<CourseListItem>> {
    const { items, total } = await this.repo.findMany(q);
    return {
      items: items.map(toListItem),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async create(input: CreateCourseInput): Promise<PublicCourse> {
    if (await this.repo.existsBySlug(input.slug)) {
      throw new ConflictException("Course slug already exists");
    }
    const created = await this.repo.insert({
      ...input,
      teacherId: DEFAULT_TEACHER_ID,  // C2 sẽ lấy từ JWT
    });
    return toPublic(created);
  }
}
```

---

## Slide 17 — Helper functions: toListItem, toPublic

### File `/apps/api/src/modules/courses/courses.mapper.ts`

```typescript
import type { Course, CourseListItem, PublicCourse } from "@lms/types";

export function toListItem(c: Course): CourseListItem {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    level: c.level,
    tags: c.tags,
    coverImageUrl: c.coverImageUrl,
    priceCents: c.priceCents,
    status: c.status,
    teacherId: c.teacherId,
    publishedAt: c.publishedAt,
    createdAt: c.createdAt,
  };
}

export function toPublic(c: Course): PublicCourse {
  const { deletedAt, ...rest } = c;
  return rest;
}
```

**Tại sao tách mapper?**

- ✅ Service không "biết" về shape response
- ✅ Đổi shape response → chỉ sửa mapper
- ✅ Test mapper riêng dễ

---

## Slide 18 — Controller: HTTP layer

### File `/apps/api/src/modules/courses/courses.controller.ts`

```typescript
import {
  Controller, Get, Post, Body, Query, Res, HttpCode,
} from "@nestjs/common";
import type { Response } from "express";
import { CreateCourseDto, type CreateCourseInput, type PublicCourse } from "@lms/types";
import { CoursesService } from "./courses.service";
import { ListCoursesQuery, type ListCoursesQueryInput } from "./dto/list-courses.query";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";  // (Video 17)

@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListCoursesQuery)) q: ListCoursesQueryInput,
  ) {
    return this.courses.list(q);
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicCourse> {
    const created = await this.courses.create(body);
    res.setHeader("Location", `/courses/${created.slug}`);
    return created;
  }
}
```

---

## Slide 19 — Đăng ký CoursesModule vào AppModule

### `/apps/api/src/app.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";
import { CoursesModule } from "./modules/courses/courses.module";

@Module({
  imports: [
    HealthModule,
    CoursesModule,
  ],
})
export class AppModule {}
```

### Restart server và test

```bash
pnpm --filter @lms/api dev
```

```bash
curl http://localhost:3000/courses
# {"items":[],"total":0,"page":1,"pageSize":20}
```

---

## Slide 20 — Test endpoint với data thực

### Tạo course mới

```bash
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "react-101",
    "title": "React Fundamentals",
    "description": "Learn React from scratch",
    "level": "beginner",
    "tags": ["react", "frontend"],
    "priceCents": 4900
  }'

# Response: 201 Created
# Header: Location: /courses/react-101
# Body:
# {
#   "id": "c-uuid-1",
#   "slug": "react-101",
#   "title": "React Fundamentals",
#   "status": "draft",
#   "version": 1,
#   "createdAt": "...",
#   ...
# }
```

---

## Slide 21 — Test pagination + filter

```bash
# Tạo thêm vài courses, sau đó:

# Lấy tất cả (default published only — sẽ rỗng vì status=draft)
curl "http://localhost:3000/courses"

# Lấy cả draft
curl "http://localhost:3000/courses?status=all"

# Pagination
curl "http://localhost:3000/courses?status=all&page=1&pageSize=2"

# Search
curl "http://localhost:3000/courses?status=all&q=react"

# Filter by level
curl "http://localhost:3000/courses?status=all&level=beginner"

# Filter by tag
curl "http://localhost:3000/courses?status=all&tag=react"

# Sort
curl "http://localhost:3000/courses?status=all&sort=title_asc"

# Multiple filters
curl "http://localhost:3000/courses?status=all&level=beginner&q=react"
```

---

## Slide 22 — Test validation errors

### Body invalid → 400

```bash
# Thiếu title
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{"slug":"x"}'

# 400 Bad Request
# { ok: false, error: { code: "VALIDATION_ERROR", details: {...} } }

# Slug có space → fail regex
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{"slug":"Bad Slug","title":"X"}'

# 400 Bad Request

# Slug trùng → 409
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{"slug":"react-101","title":"X"}'

# 409 Conflict — "Course slug already exists"
```

> 💡 Error format chuẩn `{ ok, error, requestId }` sẽ làm ở Video 17

---

## Slide 23 — Idempotency: Thiết kế cho retry an toàn

### POST KHÔNG idempotent — gây vấn đề

**Tình huống:**

```
Client gửi POST /courses → ✅ tạo course
Network timeout, client retry
→ Tạo course thứ 2 (duplicate!)
```

**Giải pháp: `Idempotency-Key` header**

```bash
curl -X POST http://localhost:3000/courses \
  -H "Idempotency-Key: abc-123" \
  -d '{"slug":"react-101", ...}'

# Server:
# - Lưu key → response mapping
# - Cùng key → trả response cũ (không tạo duplicate)
```

> 💡 Khóa 1 chưa implement — Khóa 2+ thêm khi có Redis. Stripe, GitHub đều dùng pattern này.

---

## Slide 24 — REST API documentation: OpenAPI (preview)

### Tự sinh docs từ code

**Cài (Khóa 8 sẽ làm đầy đủ):**

```bash
pnpm --filter @lms/api add @nestjs/swagger
```

```typescript
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";

const config = new DocumentBuilder()
  .setTitle("AI LMS API")
  .setVersion("0.1.0")
  .build();

const doc = SwaggerModule.createDocument(app, config);
SwaggerModule.setup("docs", app, doc);
```

→ Truy cập `http://localhost:3000/docs` → Swagger UI tự động

> 💡 Khóa 1 skip — nhưng tốt cho team to: API spec đồng bộ với code

---

## Slide 25 — Test integration với supertest

### File `courses.controller.test.ts`

```typescript
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { CoursesModule } from "./courses.module";

describe("CoursesController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [CoursesModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it("creates and lists course", async () => {
    await request(app.getHttpServer())
      .post("/courses")
      .send({ slug: "test", title: "Test Course" })
      .expect(201)
      .expect("Location", "/courses/test");

    const res = await request(app.getHttpServer())
      .get("/courses?status=all")
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].slug).toBe("test");
  });
});
```

---

## Slide 26 — Best practices REST API

### 8 nguyên tắc cho production

**1. Consistent response format** — `{ ok, data | error, requestId }`

**2. Versioning từ ngày đầu** — `/v1/courses` thay `/courses`

**3. Pagination MAX limit** — `pageSize` max 100, không cho `?pageSize=999999`

**4. Use proper status codes** — 201 cho create, không 200

**5. Filter, sort, paginate qua query params** — không dùng POST cho list

**6. Include resource ID trong URL khi update/delete** — không qua body

**7. Return `Location` header** sau POST create

**8. Đặt rate limit** (Khóa 6 với Redis) — chống abuse

---

## Slide 27 — Anti-patterns cần tránh

```typescript
// ❌ 1. Method trong URL
GET /courses/getAll
POST /courses/delete/:id  // dùng DELETE method

// ❌ 2. POST cho mọi thứ
POST /getCourses          // dùng GET
POST /deleteCourse        // dùng DELETE

// ❌ 3. Return mixed format
GET /courses → [...]                    // lúc trả array
GET /courses?page=1 → { items, total }  // lúc trả object
// → Frontend không predict được

// ❌ 4. Status code sai
return res.status(200).json({ error: "Not found" });  // phải 404
return res.status(500).json({ ok: true });            // phải 200

// ❌ 5. Expose internal IDs trong URL public
GET /courses?id=1,2,3   // dùng /courses?ids=uuid-1,uuid-2

// ❌ 6. Trả lỗi không có context
{ "error": "fail" }  // → fail vì gì?
```

---

## Slide 28 — Bài tập thực hành

### 🎯 Build full feature

**Bài 1:** Implement đầy đủ `CoursesController` + `CoursesService` + `InMemoryCourseRepository`

- 2 endpoint: `GET /courses`, `POST /courses`
- Pagination + filter + sort
- Test tất cả query trong slide 21

**Bài 2:** Thêm endpoint `GET /courses/:slug`

- Trả `PublicCourse` nếu tìm thấy
- 404 nếu không tìm thấy (Video 17 sẽ dùng `NotFoundException`)

**Bài 3:** Seed data tự động

```typescript
// CoursesService có method seed() chạy lúc startup
// Tạo 50 courses ngẫu nhiên
// → test pagination với data thật
```

**Bài 4:** Implement `PATCH /courses/:slug` + `DELETE /courses/:slug`

- PATCH update title/description/tags
- DELETE soft delete (set deletedAt)

---

## Slide 29 — Tổng kết Video 15

### Bạn vừa học

- ✅ REST 6 nguyên tắc + 5 HTTP methods + status codes
- ✅ Resource URL design: plural, lowercase, hyphenated
- ✅ Query pattern: page, pageSize, sort, filter
- ✅ Validate query bằng Zod (`z.coerce.number()`)
- ✅ Repository pattern: interface + in-memory impl
- ✅ Tách Controller → Service → Repository
- ✅ Mapper functions (Course → PublicCourse → CourseListItem)
- ✅ Test integration với supertest

> 💪 2 endpoint `/courses` chạy + chuẩn architecture senior

---

<!-- _class: lead -->

# Tiếp theo: Video 16

## Middleware và Logging

Middleware trong NestJS, `RequestIdMiddleware`, cấu hình `nestjs-pino`, `LoggingInterceptor`, log level, vì sao request ID giúp debug production.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 16 🚀

> *"REST is not about CRUD. It's about resources and uniform interfaces."*
> *— Roy Fielding*
