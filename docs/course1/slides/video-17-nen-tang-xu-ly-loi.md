---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 17: Nền Tảng Xử Lý Lỗi'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Nền Tảng
# Xử Lý Lỗi

### Khóa 1 — Video 17

**Error là feature — không phải afterthought**

> Response thành công 1 kiểu, lỗi 100 kiểu = client khóc

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Phân loại lỗi: **validation, not found, conflict, unauthorized, internal**
- ✅ Xây cấu trúc **`AppException` hierarchy**
- ✅ 4 subclass: **Validation, NotFound, Conflict, Unauthorized**
- ✅ Viết **`AllExceptionsFilter`** — bắt mọi exception
- ✅ Viết **`ZodValidationPipe`** — validate body bằng Zod tự động
- ✅ Standardize error response: **`{ ok, error: { code, message, details }, requestId }`**
- ✅ Không bao giờ leak stack trace ra client

> 🎯 Cuối video: mọi error response của API đúng format chuẩn

---

## Slide 3 — Vì sao chuẩn hoá error?

### Tình huống thực tế

**❌ Không chuẩn hoá:**

```json
// API 1
{ "error": "Invalid input" }

// API 2
{ "message": "Not found", "code": 404 }

// API 3
"Internal server error"   ← plain text!

// API 4
{ "errors": [{ "msg": "validation failed" }] }
```

→ Frontend viết code khác nhau cho mỗi endpoint → bug nhiều

**✅ Chuẩn hoá:**

```json
{
  "ok": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} },
  "requestId": "req-abc-123"
}
```

→ Frontend xử lý 1 lần, mọi endpoint giống nhau

---

## Slide 4 — Error contract chuẩn

### Mọi error response phải có 3 field

```typescript
type ApiError = {
  ok: false;
  error: {
    code: string;         // VALIDATION_ERROR, NOT_FOUND, ...
    message: string;      // Human-readable
    details?: unknown;    // Object chi tiết (vd: từng field lỗi)
  };
  requestId: string;      // Trace ID (từ Video 16)
};
```

**Ví dụ:**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {
      "fieldErrors": {
        "email": ["Invalid email"],
        "age": ["Must be ≥ 18"]
      }
    }
  },
  "requestId": "550e8400-e29b-41d4"
}
```

---

## Slide 5 — Phân loại lỗi: 6 nhóm chính

### Bảng map lỗi → HTTP status

| Code | HTTP | Khi nào |
|------|------|--------|
| `VALIDATION_ERROR` | 400 | Input không hợp lệ (Zod fail) |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập / token sai |
| `FORBIDDEN` | 403 | Đăng nhập rồi nhưng không có quyền |
| `NOT_FOUND` | 404 | Resource không tồn tại |
| `CONFLICT` | 409 | Vi phạm constraint (vd: slug trùng) |
| `RATE_LIMITED` | 429 | Quá nhiều request (Khóa 6) |
| `INTERNAL` | 500 | Lỗi không xác định |

**Quy tắc:**

- 4xx = lỗi do client → fix bằng cách gửi đúng
- 5xx = lỗi do server → client retry hoặc đợi fix

---

## Slide 6 — `AppException` hierarchy: Kiến trúc

### Inheritance tree

```
HttpException (NestJS built-in)
    ↓
AppException (base custom)
    ├── ValidationException     (400)
    ├── UnauthorizedException   (401)
    ├── ForbiddenException      (403)
    ├── NotFoundException       (404)
    ├── ConflictException       (409)
    └── RateLimitedException    (429)  ← Khóa 6
```

**Vì sao kế thừa `HttpException`?**

- ✅ NestJS hiểu native (auto map status code)
- ✅ Filter có thể `instanceof` check
- ✅ Tích hợp với mọi tooling khác (Sentry, etc.)

---

## Slide 7 — Viết AppException base class

### File `/apps/api/src/common/errors/app-exception.ts`

```typescript
import { HttpException, HttpStatus } from "@nestjs/common";

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
```

**Đặc điểm:**

- Có `code` (string, không phải number)
- Có optional `details` (object cấu trúc tự do)
- Body trả ra là `{ code, message, details }` (filter sẽ wrap thêm `ok` + `requestId`)

---

## Slide 8 — 4 subclass cơ bản

### Cùng file `app-exception.ts`

```typescript
export class ValidationException extends AppException {
  constructor(details: unknown) {
    super("VALIDATION_ERROR", "Invalid input", HttpStatus.BAD_REQUEST, details);
  }
}

export class NotFoundException extends AppException {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found`, HttpStatus.NOT_FOUND);
  }
}

export class ConflictException extends AppException {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, HttpStatus.CONFLICT, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = "Access denied") {
    super("FORBIDDEN", message, HttpStatus.FORBIDDEN);
  }
}
```

---

## Slide 9 — Sử dụng trong service

### Throw đúng exception cho từng case

```typescript
import {
  NotFoundException, ConflictException,
} from "../../common/errors/app-exception";

@Injectable()
export class CoursesService {
  async findBySlug(slug: string): Promise<PublicCourse> {
    const course = await this.repo.findBySlug(slug);
    if (!course) {
      throw new NotFoundException("Course");
      // → 404 { code: "NOT_FOUND", message: "Course not found" }
    }
    return toPublic(course);
  }

  async create(input: CreateCourseInput): Promise<PublicCourse> {
    if (await this.repo.existsBySlug(input.slug)) {
      throw new ConflictException(
        "Course slug already exists",
        { field: "slug", reason: "already_exists" },
      );
      // → 409 { code: "CONFLICT", message: "...", details: {...} }
    }
    // ...
  }
}
```

---

## Slide 10 — AllExceptionsFilter: Bắt mọi error

### File `/apps/api/src/common/filters/all-exceptions.filter.ts`

```typescript
import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";
import { AppException } from "../errors/app-exception";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.id;

    // Case 1: AppException của ta
    if (exception instanceof AppException) {
      const body = exception.getResponse() as {
        code: string; message: string; details?: unknown;
      };
      return res.status(exception.getStatus()).json({
        ok: false,
        error: body,
        requestId,
      });
    }

    // Case 2: HttpException khác của NestJS
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return res.status(status).json({
        ok: false,
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : "HTTP_ERROR",
          message: exception.message,
          details: exception.getResponse(),
        },
        requestId,
      });
    }

    // Case 3: Lỗi không xác định → 500 INTERNAL
    this.logger.error({ err: exception, requestId }, "Unhandled exception");
    return res.status(500).json({
      ok: false,
      error: { code: "INTERNAL", message: "Internal server error" },
      requestId,
    });
  }
}
```

---

## Slide 11 — Đăng ký filter global

### Trong `main.ts`

```typescript
import { Logger } from "nestjs-pino";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

  await app.listen(env.PORT);
}
```

**Hoặc qua APP_FILTER (recommended cho test dễ):**

```typescript
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

---

## Slide 12 — KHÔNG bao giờ leak stack trace ra client

### So sánh xấu vs đúng

**❌ Tệ — leak internal info:**

```json
{
  "error": "Error: Cannot read property 'foo' of undefined\n    at /app/src/users.service.ts:42:18\n    at processTicksAndRejections (internal/process/task_queues.js:95:5)\n    at /app/node_modules/@nestjs/...",
  "stack": "..."
}
```

→ Hacker thấy framework, version, file path → tấn công dễ hơn

**✅ Đúng — log full stack server-side, client chỉ thấy generic:**

```json
{
  "ok": false,
  "error": { "code": "INTERNAL", "message": "Internal server error" },
  "requestId": "abc-123"
}
```

→ User báo cáo "requestId: abc-123" → dev search log thấy full stack

---

## Slide 13 — ZodValidationPipe: Auto validate body

### File `/apps/api/src/common/pipes/zod-validation.pipe.ts`

```typescript
import {
  Injectable, PipeTransform, ArgumentMetadata,
} from "@nestjs/common";
import { ZodSchema } from "zod";
import { ValidationException } from "../errors/app-exception";

@Injectable()
export class ZodValidationPipe<T extends ZodSchema> implements PipeTransform {
  constructor(private readonly schema?: T) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Schema có thể đến từ:
    // 1. Constructor: new ZodValidationPipe(MySchema)
    // 2. Metatype (TypeScript class): auto-detect
    const schema = this.schema ?? (metadata.metatype as unknown as ZodSchema | undefined);

    if (!schema || typeof (schema as ZodSchema).safeParse !== "function") {
      return value;
    }

    const parsed = (schema as ZodSchema).safeParse(value);
    if (!parsed.success) {
      throw new ValidationException(parsed.error.flatten());
    }
    return parsed.data;
  }
}
```

---

## Slide 14 — Sử dụng ZodValidationPipe

### Trong Controller

```typescript
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CreateCourseDto, type CreateCourseInput } from "@lms/types";

@Controller("courses")
export class CoursesController {
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput,
    //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //     Validate body với schema
  ): Promise<PublicCourse> {
    return this.service.create(body);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(ListCoursesQuery)) q: ListCoursesQueryInput,
  ) {
    return this.service.list(q);
  }
}
```

**Workflow:**

1. Request đến → Pipe nhận body
2. `safeParse` với schema
3. ❌ Fail → throw `ValidationException` → Filter format → 400
4. ✅ Pass → controller nhận data đã typed + cleaned

---

## Slide 15 — Đăng ký Pipe global (tuỳ chọn)

### Auto validate mọi `@Body`

```typescript
// /apps/api/src/main.ts
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe";

app.useGlobalPipes(new ZodValidationPipe());
```

→ Mọi `@Body` không cần truyền schema (pipe sẽ infer từ metatype)

**Trade-off:**

- ✅ Đỡ phải truyền schema mỗi nơi
- ⚠️ Khó debug khi schema không nhận diện được
- ⚠️ Magic — dev mới không hiểu đang validate cái gì

> 💡 Khóa 1: **explicit schema** dễ học hơn — `new ZodValidationPipe(MySchema)`

---

## Slide 16 — Test error responses

### Trigger từng loại lỗi

**Validation error:**

```bash
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{}'

# 400 Bad Request
# {
#   "ok": false,
#   "error": {
#     "code": "VALIDATION_ERROR",
#     "message": "Invalid input",
#     "details": {
#       "fieldErrors": {
#         "slug": ["Required"],
#         "title": ["Required"]
#       }
#     }
#   },
#   "requestId": "..."
# }
```

---

## Slide 17 — Test các lỗi khác

**Not found:**

```bash
curl http://localhost:3000/courses/non-existent-slug
# 404 { "ok": false, "error": { "code": "NOT_FOUND", "message": "Course not found" } }
```

**Conflict:**

```bash
# Tạo course slug "react-101"
curl -X POST ... -d '{"slug":"react-101","title":"x"}'
# 201 OK

# Tạo lại với cùng slug
curl -X POST ... -d '{"slug":"react-101","title":"y"}'
# 409 Conflict
# { "ok": false, "error": { "code": "CONFLICT", "message": "Course slug already exists" } }
```

**Internal error (cố ý trigger):**

```typescript
@Get("crash")
crash() {
  throw new Error("boom!");
}
```

```bash
curl http://localhost:3000/health/crash
# 500 { "ok": false, "error": { "code": "INTERNAL", "message": "Internal server error" } }
# Log server: full stack trace
```

---

## Slide 18 — Async error handling

### NestJS auto-catch promise rejection

```typescript
@Get(":slug")
async getCourse(@Param("slug") slug: string) {
  const course = await this.service.findBySlug(slug);
  if (!course) throw new NotFoundException("Course");
  return course;
}

// Nếu service throw → NestJS auto catch → filter format response
// KHÔNG cần try/catch trong controller
```

**Nhưng:** Floating promise sẽ KHÔNG catch được

```typescript
@Post()
create(@Body() body: any) {
  this.service.create(body);   // ❌ quên await
  return { ok: true };          // response gửi ngay, lỗi mất
}
```

> 💡 ESLint `no-floating-promises: error` sẽ bắt được lỗi này (Video 19)

---

## Slide 19 — Error mapping: ZodError → ValidationException

### Detail giúp client hiển thị form lỗi

**Zod flatten:**

```typescript
const result = CreateCourseDto.safeParse(body);
console.log(result.error.flatten());
// {
//   formErrors: [],
//   fieldErrors: {
//     slug: ["lowercase, digits, single hyphens only"],
//     priceCents: ["Number must be greater than or equal to 0"]
//   }
// }
```

**Response cuối:**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {
      "fieldErrors": {
        "slug": ["..."],
        "priceCents": ["..."]
      },
      "formErrors": []
    }
  },
  "requestId": "..."
}
```

**Frontend (Khóa 4):** map `details.fieldErrors.slug` vào input field error

---

## Slide 20 — Error logging với request ID

### Liên kết với Video 16

```typescript
// Trong AllExceptionsFilter
this.logger.error({
  err: exception,
  requestId: req.id,
  method: req.method,
  path: req.originalUrl,
  status: 500,
}, "Unhandled exception");
```

**Log output (production JSON):**

```json
{
  "level": 50,
  "time": 1705320618,
  "requestId": "550e8400-...",
  "method": "POST",
  "path": "/courses",
  "status": 500,
  "err": {
    "type": "Error",
    "message": "DB connection lost",
    "stack": "..."
  },
  "msg": "Unhandled exception"
}
```

> 🎯 User báo "requestId: 550e8400" → dev grep ngay → thấy full stack

---

## Slide 21 — Error categories: Operational vs Programmer

### Khác biệt sống còn

**Operational errors** — predictable, tạm thời

```typescript
// User gửi sai data → 400
throw new ValidationException(...);

// Resource không tồn tại → 404
throw new NotFoundException(...);

// DB connection timeout (transient)
throw new ServiceUnavailableException();
```

→ Không cần restart, không cần alert dev

**Programmer errors** — bug trong code

```typescript
const user = users.find(...);
console.log(user.name);  // ⛔ user có thể undefined → TypeError

// Hoặc:
throw new Error("unreachable");  // logic sai
```

→ Cần fix code, alert dev, log + Sentry

---

## Slide 22 — Tích hợp với Sentry (preview Khóa 8)

### Auto-report lỗi 500 ra dashboard

**Cài (Khóa 8):**

```bash
pnpm --filter @lms/api add @sentry/node
```

**Trong filter:**

```typescript
import * as Sentry from "@sentry/node";

catch(exception: unknown, host: ArgumentsHost): void {
  // ...

  // Nếu lỗi không xác định → gửi Sentry
  if (!(exception instanceof HttpException)) {
    Sentry.captureException(exception, {
      tags: { requestId: req.id },
      extra: { method: req.method, path: req.originalUrl },
    });
  }
}
```

> 💡 Khóa 1 skip Sentry. Pattern này sẽ thêm ở Khóa 8.

---

## Slide 23 — Test AllExceptionsFilter

### Unit test với mock

```typescript
import { describe, it, expect, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { NotFoundException } from "../errors/app-exception";

describe("AllExceptionsFilter", () => {
  it("formats AppException with ok=false", () => {
    const logger = { error: vi.fn() };
    const filter = new AllExceptionsFilter(logger as any);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status };
    const req = { id: "req-1" };
    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => req,
      }),
    };

    filter.catch(new NotFoundException("Course"), host as any);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: { code: "NOT_FOUND", message: "Course not found" },
      requestId: "req-1",
    });
  });
});
```

---

## Slide 24 — Cross-cutting: Cấu trúc thư mục common

```
apps/api/src/common/
├── errors/
│   └── app-exception.ts          ← AppException hierarchy
├── filters/
│   └── all-exceptions.filter.ts  ← Global filter
├── pipes/
│   └── zod-validation.pipe.ts    ← Validate body/query
├── interceptors/
│   └── logging.interceptor.ts    ← Log mỗi request (Video 16)
└── middleware/
    └── request-id.middleware.ts  ← Request ID (Video 16)
```

**Pattern:** mỗi loại "cross-cutting concern" 1 folder
→ Tách rời với business logic (modules/)

---

## Slide 25 — Best practices error handling

### 7 nguyên tắc vàng

**1. Throw exception, đừng return null/false**
✅ `throw new NotFoundException("Course")` ❌ `return null`

**2. Mỗi loại lỗi 1 code string** — không số HTTP
✅ `"NOT_FOUND"` ❌ `404` (frontend khó map)

**3. Message human-readable, ngắn gọn**
✅ `"Course not found"` ❌ `"DB query returned 0 rows for table courses where slug=..."`

**4. Details = structured object** — cho frontend dùng

**5. Đừng catch để swallow**
❌ `try { ... } catch (e) {}` ⛔

**6. Log lỗi 500 với full stack** — nhưng KHÔNG ra client

**7. Test error path không kém test happy path**

---

## Slide 26 — Anti-patterns phổ biến

```typescript
// ❌ 1. Trả error trong response 200
return res.status(200).json({ error: "Not found" });
// → Frontend không biết check ở đâu

// ❌ 2. Catch và rethrow generic
try {
  await db.query(...);
} catch (err) {
  throw new Error("Something went wrong");  // ⛔ mất context
}

// ❌ 3. Expose stack trace
catch(err, host) {
  res.json({ error: err.message, stack: err.stack });  // ⛔
}

// ❌ 4. Check error message string
if (err.message.includes("not found")) { /* ... */ }   // ⛔ fragile
// → Dùng instanceof hoặc error code

// ❌ 5. Mỗi service tự định nghĩa format error riêng
// → Dùng AppException + AllExceptionsFilter chung
```

---

## Slide 27 — Bài tập thực hành

### 🎯 Build error stack hoàn chỉnh

**Bài 1:** Implement `AppException` + 4 subclass

- Theo Slide 7-8
- Test mỗi class throw → status code đúng

**Bài 2:** Implement `AllExceptionsFilter`

- Format đúng 3 case: AppException, HttpException, Error
- Log unhandled với full stack
- KHÔNG leak stack ra client

**Bài 3:** Implement `ZodValidationPipe`

- Apply cho `POST /courses`, `GET /courses`
- Trigger validation fail → 400 đúng format

**Bài 4:** Thêm `GET /courses/:slug`

- Throw `NotFoundException("Course")` nếu không có
- Test: 404 với body đúng contract

**Bài 5:** Cố tình throw `new Error("boom")` → kiểm tra 500 không leak stack

---

## Slide 28 — Tổng kết Video 17 + Section 4

### Bạn vừa hoàn thành Section 4 — Backend Skeleton 🎉

**4 video Section 4:**

- ✅ Video 14: API Server NestJS + HealthModule
- ✅ Video 15: REST API + CoursesModule + Repository pattern
- ✅ Video 16: Middleware + Structured logging
- ✅ Video 17: Error handling + Validation pipeline

**Backend của bạn giờ có:**

- ✅ NestJS API chạy `:3000`
- ✅ 3 endpoint: `/health`, `GET /courses`, `POST /courses`
- ✅ Request ID + JSON logging
- ✅ `AppException` hierarchy + global filter
- ✅ Zod validation pipeline tự động
- ✅ Error contract chuẩn `{ ok, error, requestId }`

> 🚀 **Tiếp theo: Section 5 — Developer Workflow**

---

<!-- _class: lead -->

# Tiếp theo: Video 18

## Claude Code Cho Tốc Độ Phát Triển

Cài + cấu hình Claude Code, viết file `CLAUDE.md` chuẩn cho dự án, cách prompt hiệu quả, demo sinh module mới đúng convention.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 18 🚀

> *"Errors are values."*
> *— Rob Pike*
