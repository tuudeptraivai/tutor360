---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 4: Zod Validation Pipeline + Pipe Decorators'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Zod Validation Pipeline
# + Pipe Decorators

### Khóa 2-3 — Video 4

**Validate body / query / param thống nhất**

> Validation runtime = nửa cuộc đời backend production

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **`ZodValidationPipe`** đầy đủ (body, query, param)
- ✅ Tạo decorator **`@ZodBody()`**, **`@ZodQuery()`** gọn gàng
- ✅ Phân biệt **`safeParse` vs `parse`** — khi nào ném exception
- ✅ Hiểu **`z.coerce`** cho query/param (string → number/date)
- ✅ Refine logic phức tạp với **`.refine()` và `.superRefine()`**
- ✅ Format error message **i18n-ready** cho FE C4

> 🎯 Cuối video: validate được booking input phức tạp (combo session)

---

## Slide 3 — Vì sao Zod thay class-validator?

### Compare

| Feature | class-validator | Zod |
|---------|----------------|-----|
| Decorator | `@IsEmail()` | `z.string().email()` |
| Type inference | DTO + decorator riêng | `z.infer<typeof Schema>` 1 nguồn |
| Conditional | Decorator phức tạp | `.refine()`, `.superRefine()` |
| Custom message | Per decorator | Per field hoặc global |
| Shared FE/BE | Cần map | **Cùng schema** |
| Async validate | OK | `.refine(async)` |
| Discriminated union | Phức tạp | `z.discriminatedUnion(...)` |

> 💡 Tutor365 muốn 1 schema dùng cả FE + BE → Zod.

---

## Slide 4 — ZodValidationPipe đầy đủ

```ts
// common/pipes/zod-validation.pipe.ts
import {
  ArgumentMetadata, BadRequestException, Injectable, PipeTransform,
} from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: this.formatErrors(parsed.error),
      });
    }
    return parsed.data;
  }

  private formatErrors(err: ZodError) {
    return err.issues.map((i) => ({
      path: i.path.join('.'),
      code: i.code,
      message: i.message,
    }));
  }
}
```

---

## Slide 5 — `safeParse` vs `parse`

### Khác biệt quan trọng

```ts
// parse() — throw ZodError
try {
  const data = Schema.parse(input);
} catch (e) {
  if (e instanceof ZodError) { /* ... */ }
}

// safeParse() — không throw
const result = Schema.safeParse(input);
if (result.success) {
  result.data;       // T
} else {
  result.error;      // ZodError
}
```

**Khuyến nghị:** **`safeParse`** trong pipe — control flow rõ ràng, không phụ thuộc try/catch.

---

## Slide 6 — Tạo decorator gọn

### Trước (verbose)

```ts
@Post()
create(@Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput) {}
```

**Sau (gọn) — `@ZodBody`:**

```ts
// decorators/zod-body.decorator.ts
import { Body, PipeTransform, Type } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export const ZodBody = (schema: ZodSchema) =>
  Body(new ZodValidationPipe(schema));

export const ZodQuery = (schema: ZodSchema) =>
  Query(new ZodValidationPipe(schema));

export const ZodParam = (key: string, schema: ZodSchema) =>
  Param(key, new ZodValidationPipe(schema));
```

**Dùng:**

```ts
@Post()
create(@ZodBody(CreateCourseDto) body: CreateCourseInput) {}
```

---

## Slide 7 — Validate body: schema mẫu Course

```ts
// modules/courses/dto/create-course.dto.ts
import { z } from 'zod';

export const CreateCourseDto = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z.string()
    .regex(/^[a-z0-9-]+$/, 'slug only lowercase + digits + hyphen')
    .min(3).max(80),
  description: z.string().max(2000).optional(),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  price: z.number().int().nonnegative().max(50_000_000),
  durationHours: z.number().positive().max(200).optional(),
});

export type CreateCourseInput = z.infer<typeof CreateCourseDto>;
```

> 💡 Type `CreateCourseInput` tự suy ra → export cho FE C4 dùng.

---

## Slide 8 — Validate query: `z.coerce`

### Query string toàn `string` → cần cast

```ts
// modules/courses/dto/list-courses.query.ts
export const ListCoursesQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'pending_approval', 'published', 'archived', 'all'])
    .default('published'),
  subjectId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
  tutorId: z.string().uuid().optional(),
  sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'rating'])
    .default('newest'),
});
```

**Test:**

```bash
curl '/v1/courses?page=2&status=published&pageSize=10'
# page: 2, pageSize: 10 (đã cast number)
```

---

## Slide 9 — Validate param: `z.string().uuid()`

```ts
// modules/courses/courses.controller.ts
@Get(':id')
findOne(
  @ZodParam('id', z.string().uuid()) id: string,
) {
  return this.service.findOne(id);
}
```

**Khi user gọi `GET /v1/courses/abc` (không phải UUID):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "path": "", "code": "invalid_string", "message": "Invalid uuid" }]
  }
}
```

> 💡 Param validate sớm → service không phải check `if (!isUUID(id))`.

---

## Slide 10 — `.refine()`: Cross-field validation

### Ví dụ: combo session — month trong allowlist

```ts
export const CreateBookingDto = z.object({
  type: z.enum(['single', 'combo']),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  startAt: z.coerce.date(),
  durationHr: z.number().min(1.5).max(2),
  numMonths: z.number().int().optional(),  // chỉ combo dùng
}).refine(
  (data) => data.type !== 'combo' || [1, 2].includes(data.numMonths ?? 0),
  { message: 'combo phải numMonths = 1 hoặc 2', path: ['numMonths'] },
);
```

**Khi POST `{ type: 'combo' }` mà thiếu `numMonths`:**

```
path: numMonths
message: combo phải numMonths = 1 hoặc 2
```

---

## Slide 11 — `.superRefine()`: Lỗi nhiều field cùng lúc

```ts
export const SignupDto = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
  agreeTerms: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Mật khẩu xác nhận không khớp',
      path: ['confirmPassword'],
    });
  }
  if (!data.agreeTerms) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phải đồng ý điều khoản',
      path: ['agreeTerms'],
    });
  }
});
```

→ 2 lỗi trả về 1 lần, FE highlight cả 2 field.

---

## Slide 12 — Discriminated union: Booking single vs combo

```ts
const SingleBooking = z.object({
  type: z.literal('single'),
  startAt: z.coerce.date(),
  durationHr: z.number().min(1.5).max(2),
});

const ComboBooking = z.object({
  type: z.literal('combo'),
  startAt: z.coerce.date(),
  durationHr: z.number().min(1.5).max(2),
  numMonths: z.union([z.literal(1), z.literal(2)]),
  weeklyDays: z.array(z.number().int().min(0).max(6)).length(3),
});

export const CreateBookingDto = z.discriminatedUnion('type', [
  SingleBooking,
  ComboBooking,
]);
```

**Lợi ích:** Type narrow theo `type`:

```ts
if (input.type === 'combo') {
  input.numMonths;     // ✅ tồn tại
  input.weeklyDays;    // ✅
}
```

---

## Slide 13 — Custom error message bằng tiếng Việt

```ts
const ViMessages: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: `Phải là ${issue.expected}` };
    case z.ZodIssueCode.too_small:
      return { message: `Tối thiểu ${issue.minimum} ký tự` };
    case z.ZodIssueCode.too_big:
      return { message: `Tối đa ${issue.maximum} ký tự` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Email không hợp lệ' };
      if (issue.validation === 'uuid') return { message: 'ID không đúng định dạng' };
      return { message: ctx.defaultError };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(ViMessages);
```

> 💡 Set ở `main.ts` 1 lần → toàn bộ schema dùng tiếng Việt.

---

## Slide 14 — Async validation: check email tồn tại

```ts
const SignupDto = z.object({
  email: z.string().email(),
  password: z.string().min(8),
}).refine(
  async (data) => {
    const exists = await usersRepo.existsByEmail(data.email);
    return !exists;
  },
  { message: 'Email đã được dùng', path: ['email'] },
);

// Pipe phải dùng safeParseAsync
const result = await schema.safeParseAsync(value);
```

> ⚠️ **Trade-off:** async refine không cancellable, nếu DB lag → request lag.
> **Khuyến nghị:** check ở **service** thay vì pipe — throw `ConflictException(409)`.

---

## Slide 15 — Transform: `.transform()` chuyển kiểu

```ts
const TrimmedString = z.string().transform((v) => v.trim());

const PriceInVND = z.string()
  .regex(/^\d+$/)
  .transform((v) => parseInt(v, 10))
  .refine((n) => n >= 0 && n <= 50_000_000, 'Giá ngoài phạm vi cho phép');

const CreateCourseDto = z.object({
  title: TrimmedString.pipe(z.string().min(3)),
  price: PriceInVND,
});

// Input: { title: "  React  ", price: "499000" }
// Output: { title: "React", price: 499000 }
```

> 💡 `.transform()` chạy SAU khi parse — output type khác input type.

---

## Slide 16 — Schema reuse: extend + omit + pick

```ts
// Base
const CourseFields = z.object({
  title: z.string().min(3),
  slug: z.string(),
  description: z.string().optional(),
  price: z.number().int().nonnegative(),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
});

// Create — toàn bộ field
export const CreateCourseDto = CourseFields;

// Update — partial (PATCH)
export const UpdateCourseDto = CourseFields.partial();

// Public response — bỏ field nội bộ
export const PublicCourseDto = CourseFields.extend({
  id: z.string().uuid(),
  status: z.enum(['draft', 'published', 'archived']),
  createdAt: z.coerce.date(),
}).omit({ description: true });   // ví dụ ẩn ở list
```

---

## Slide 17 — Global ZodValidationPipe (advanced)

### Auto detect schema từ metadata

```ts
// pipes/global-zod.pipe.ts
import { Reflector } from '@nestjs/core';

@Injectable()
export class GlobalZodPipe implements PipeTransform {
  constructor(private reflector: Reflector) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    // metadata.metatype có Zod schema không?
    const schema = (metadata.metatype as any)?._zodSchema;
    if (!schema) return value;
    return schema.parse(value);
  }
}

// main.ts
app.useGlobalPipes(new GlobalZodPipe(reflector));
```

**Pattern alternative đơn giản hơn:** chỉ apply pipe per-decorator như slide 6.

> 💡 Tutor365 chọn **per-decorator** vì rõ hơn, dễ đọc.

---

## Slide 18 — Error format chuẩn: bench với FE

### Frontend C4 sẽ parse format này

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "path": "title", "code": "too_small", "message": "Tối thiểu 3 ký tự" },
      { "path": "slug", "code": "invalid_string", "message": "slug only lowercase + digits + hyphen" },
      { "path": "price", "code": "invalid_type", "message": "Phải là number" }
    ]
  },
  "requestId": "abc-123"
}
```

**FE map:**

```ts
data.error.details.forEach((e) => {
  formik.setFieldError(e.path, e.message);
});
```

> 💡 Standardize format từ ngày đầu → FE không phải đoán shape.

---

## Slide 19 — Bài tập thực hành

### 🎯 Validate booking complex

**Bài 1:** Implement `ZodValidationPipe` + `@ZodBody`, `@ZodQuery`, `@ZodParam`.

**Bài 2:** Tạo `CreateBookingDto` với discriminated union (single | combo). Verify:
- POST `{ type: "single", startAt, durationHr: 2 }` → ok
- POST `{ type: "combo", numMonths: 3 }` → fail (phải 1|2)
- POST `{ type: "combo", weeklyDays: [1,2,3,4] }` → fail (phải length 3)

**Bài 3:** Set error map tiếng Việt + verify response trả message VN.

**Bài 4:** `CourseFields.partial()` dùng cho `PATCH` — verify body chỉ có `{title}` không fail vì thiếu các field khác.

**Bài 5:** `.transform()` lấy `price` dạng `"499000"` (string) → cast về `number`.

---

## Slide 20 — Anti-pattern

```ts
// ❌ Validate trong service
async create(input: any) {
  if (!input.title) throw new Error('title required');
  if (input.price < 0) throw new Error('price invalid');
  // → boilerplate, không centralized
}

// ❌ Plain JSON Schema thay Zod
const schema = { type: 'object', properties: {...} };
// → mất type inference, không refine async được

// ❌ Validate request 2 lần (controller + service)
// → duplicated, lệch định nghĩa schema

// ❌ Throw Error thay ZodError trong pipe
throw new Error('bad input');  // filter trả 500 chứ không 400

// ❌ Hardcode message tiếng Anh khi user VN
z.string().min(3, 'Too short')  // dùng error map
```

---

## Slide 21 — Tổng kết Video 4

### Bạn vừa học

- ✅ Implement `ZodValidationPipe` đầy đủ
- ✅ Decorator gọn `@ZodBody`, `@ZodQuery`, `@ZodParam`
- ✅ `safeParse` vs `parse`
- ✅ `z.coerce` cho query/param
- ✅ `.refine()` + `.superRefine()` cross-field
- ✅ `z.discriminatedUnion()` cho booking single/combo
- ✅ Custom error map tiếng Việt
- ✅ Schema reuse: `extend`, `partial`, `omit`, `pick`
- ✅ Error format chuẩn cho FE

> 💪 Validate đúng = nửa cuộc đời backend production

---

<!-- _class: lead -->

# Tiếp theo: Video 5

## Modular Backend Design + Folder Convention

Cách tổ chức module / controller / service / repository / dto / mapper cho 14 module Tutor365 không rối.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 5 🚀

> *"Validate at the boundary. Trust inside."*
