---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 8: Validation Runtime với Zod'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Validation Runtime
# với Zod

### Khóa 1 — Video 8

**TypeScript dừng ở compile time — Zod tiếp tục ở runtime**

> Zero-trust input handling

---

## Slide 2 — Mục tiêu video này

Sau 28 phút, bạn sẽ:

- ✅ Hiểu **vì sao TypeScript không đủ** cho data từ ngoài
- ✅ Cài và dùng **Zod** thành thạo
- ✅ Master các schema cơ bản: `z.object`, `z.string`, `z.number`, `z.enum`, `z.array`
- ✅ Dùng **refinement** và **transformations**
- ✅ Phân biệt **`safeParse` vs `parse`** — chọn cái nào
- ✅ Trick **`z.infer`** — sinh TypeScript type từ Zod schema

> 🎯 Cuối video: validate được request body từ HTTP

---

## Slide 3 — TypeScript hoạt động khi nào?

### Compile time only

```typescript
interface User {
  id: string;
  email: string;
  age: number;
}

// Lúc viết code: TS check
const user: User = {
  id: "1",
  email: "a@x.com",
  age: "25"           // ❌ Type error caught
};
```

**Nhưng ở runtime:**

```typescript
// Data từ API/database/user — chỉ là plain JSON
const data = await fetch("/api/user").then(r => r.json());

// ❌ TS không kiểm tra runtime
const user = data as User;     // assertion — NÓI DỐI compiler

// Nếu API trả về { id: 1, email: null, age: "25" }
// → user.email là null, .toLowerCase() crash
```

---

## Slide 4 — Vấn đề: Data từ "thế giới ngoài"

### 5 nguồn data không tin được

| Nguồn | Rủi ro |
|-------|--------|
| **HTTP request body** | User có thể gửi bất cứ thứ gì |
| **API bên thứ ba** | Schema có thể đổi không báo |
| **Database** | Migration cũ, data legacy |
| **File JSON/CSV** | User upload tự do |
| **Environment variables** | Typo, thiếu, sai format |

> 💡 **Rule:** Mọi data **vào** hệ thống → validate. Mọi data **bên trong** → tin TypeScript.

---

## Slide 5 — Zod là gì?

### Schema-first validation library

**Tagline:** *"TypeScript-first schema validation with static type inference"*

```typescript
import { z } from "zod";

// 1. Định nghĩa schema 1 lần
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().positive(),
});

// 2. Lấy TypeScript type miễn phí
type User = z.infer<typeof UserSchema>;
// = { id: string; email: string; age: number }

// 3. Validate runtime data
const result = UserSchema.safeParse(unknownData);
```

> 🎯 **1 schema → có cả type + validator**. Không drift.

---

## Slide 6 — Cài Zod

### Setup trong 10 giây

```bash
# Trong /packages/types
pnpm add zod
```

**Check version:**

```bash
pnpm list zod
# zod 3.x.x
```

### File `package.json` sau khi cài

```json
{
  "name": "@lms/types",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

---

## Slide 7 — Schema cơ bản: Primitives

### Các kiểu cơ bản nhất

```typescript
import { z } from "zod";

// Strings
const nameSchema = z.string();
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const uuidSchema = z.string().uuid();

// Numbers
const ageSchema = z.number();
const priceSchema = z.number().positive();
const countSchema = z.number().int().min(0).max(100);

// Boolean
const activeSchema = z.boolean();

// Date
const createdAtSchema = z.date();

// Test
nameSchema.parse("Alice");        // ✅ "Alice"
emailSchema.parse("not-email");   // ❌ Throw
ageSchema.parse(25);              // ✅ 25
ageSchema.parse("25");            // ❌ Throw (string ≠ number)
```

---

## Slide 8 — String validators chi tiết

### Chuỗi method tự gắn cờ

```typescript
const usernameSchema = z.string()
  .min(3, "At least 3 chars")
  .max(20, "Max 20 chars")
  .regex(/^[a-z0-9_]+$/, "Lowercase, digits, underscore only");

usernameSchema.parse("alice_99");      // ✅
usernameSchema.parse("ab");            // ❌ "At least 3 chars"
usernameSchema.parse("Alice 99");      // ❌ "Lowercase, ..."

// Các method khác
z.string().nonempty();          // không cho ""
z.string().trim();              // tự strip whitespace
z.string().toLowerCase();       // tự lowercase
z.string().startsWith("https://");
z.string().endsWith(".com");
z.string().includes("@");
z.string().datetime();          // ISO 8601 format
```

---

## Slide 9 — Number validators chi tiết

```typescript
const priceSchema = z.number()
  .int()                   // chỉ số nguyên
  .min(0)                  // ≥ 0
  .max(10_000_000)         // ≤ 10 triệu
  .multipleOf(100);        // chia hết cho 100 (tiền VND)

priceSchema.parse(5000);         // ✅
priceSchema.parse(50.5);         // ❌ Not integer
priceSchema.parse(-100);         // ❌ Min 0
priceSchema.parse(150);          // ❌ Not multipleOf 100

// Cast string → number (form data)
const ageQuerySchema = z.coerce.number().int().positive();
ageQuerySchema.parse("25");      // ✅ → number 25
ageQuerySchema.parse("abc");     // ❌
```

---

## Slide 10 — Enum: Literal type cho runtime

### Cố định bộ giá trị

```typescript
// Cách 1: z.enum (recommended)
const RoleEnum = z.enum(["student", "teacher", "admin"]);
type Role = z.infer<typeof RoleEnum>;
// = "student" | "teacher" | "admin"

RoleEnum.parse("student");       // ✅
RoleEnum.parse("user");          // ❌ Invalid enum value

// Cách 2: z.nativeEnum (cho TypeScript enum sẵn có)
enum Status { Active, Inactive }
const StatusSchema = z.nativeEnum(Status);
StatusSchema.parse(Status.Active);  // ✅

// LMS use case
const CourseLevelEnum = z.enum(["beginner", "intermediate", "advanced"]);
const CourseStatusEnum = z.enum(["draft", "published", "archived"]);
```

---

## Slide 11 — Object Schema: Cú pháp chính

### Định nghĩa shape của object

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  age: z.number().int().positive(),
  isActive: z.boolean(),
});

type User = z.infer<typeof UserSchema>;

// Parse object
UserSchema.parse({
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "alice@example.com",
  fullName: "Alice Nguyen",
  age: 25,
  isActive: true,
});  // ✅

// Thiếu field → throw
UserSchema.parse({ id: "550e..." });  // ❌ Required fields missing
```

---

## Slide 12 — Optional, Nullable, Default

### 3 cách xử lý field không bắt buộc

```typescript
const PostSchema = z.object({
  title: z.string(),

  // Optional — có thể không có (undefined)
  subtitle: z.string().optional(),
  // type: string | undefined

  // Nullable — có thể là null
  publishedAt: z.date().nullable(),
  // type: Date | null

  // Default — không có thì dùng default
  views: z.number().default(0),
  // type: number (luôn có)

  tags: z.array(z.string()).default([]),
  // type: string[] (luôn có)
});

PostSchema.parse({ title: "Hello" });
// → { title: "Hello", views: 0, tags: [], publishedAt: ??? }
// → ❌ thiếu publishedAt (nullable nhưng vẫn cần có key)

PostSchema.parse({ title: "Hello", publishedAt: null });  // ✅
```

---

## Slide 13 — Array Schema

```typescript
// Array of strings
const tagsSchema = z.array(z.string());
tagsSchema.parse(["ts", "node"]);    // ✅
tagsSchema.parse(["ts", 123]);        // ❌ index 1 not string

// Với constraints
const limitedTags = z.array(z.string()).min(1).max(10);

// Array of objects
const lessonsSchema = z.array(
  z.object({
    title: z.string(),
    duration: z.number().int().positive(),
  })
);

// Tuple — array có thứ tự và type cố định
const pointSchema = z.tuple([z.number(), z.number()]);
pointSchema.parse([10, 20]);          // ✅
pointSchema.parse([10, 20, 30]);      // ❌ too many

// Variadic tuple
const namedPoint = z.tuple([z.string()]).rest(z.number());
namedPoint.parse(["origin", 0, 0]);   // ✅
```

---

## Slide 14 — Nested Object: Schema lồng nhau

### Compose schema từ schema con

```typescript
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string().length(2),    // ISO code
});

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: AddressSchema,                    // nested object
  shippingAddresses: z.array(AddressSchema), // array of objects
});

UserSchema.parse({
  id: "550e...",
  name: "Alice",
  address: { street: "123 Le Loi", city: "Saigon", country: "VN" },
  shippingAddresses: [
    { street: "...", city: "Hanoi", country: "VN" },
  ],
});  // ✅
```

---

## Slide 15 — `parse` vs `safeParse`: Khác biệt sống còn

### 2 cách xử lý lỗi

**`parse` — throw nếu invalid**

```typescript
try {
  const user = UserSchema.parse(unknownData);
  // user có type chính xác
} catch (err) {
  // err là ZodError
  console.error(err.errors);
}
```

**`safeParse` — trả về Result-like object**

```typescript
const result = UserSchema.safeParse(unknownData);

if (result.success) {
  console.log(result.data);     // type: User
} else {
  console.log(result.error.errors);
}
```

> 💡 **Quy tắc:** App code dùng `safeParse`. Test/script ngắn dùng `parse`.

---

## Slide 16 — `z.infer<typeof Schema>`: TypeScript miễn phí

### Sinh type từ schema

```typescript
const CourseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  tags: z.array(z.string()),
  publishedAt: z.date().nullable(),
});

// Lấy type
type Course = z.infer<typeof CourseSchema>;

// Tương đương viết tay:
// type Course = {
//   id: string;
//   title: string;
//   level: "beginner" | "intermediate" | "advanced";
//   tags: string[];
//   publishedAt: Date | null;
// }
```

> 🎯 **Single source of truth:** Đổi schema → type tự đổi theo. Không drift.

---

## Slide 17 — Refinement: Custom validation

### Khi built-in không đủ

```typescript
// Password phải khớp confirmPassword
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ["confirmPassword"],    // gắn error vào field này
  }
);

SignupSchema.parse({
  email: "alice@x.com",
  password: "secret123",
  confirmPassword: "secret456",
});  // ❌ "Passwords don't match"

// Refine 1 field
const ageSchema = z.number().refine(
  (n) => n >= 13,
  { message: "Must be 13 or older" }
);
```

---

## Slide 18 — `superRefine`: Refinement nâng cao

### Nhiều check, control error chi tiết

```typescript
const QuizSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).min(2).max(6),
  answerIndex: z.number().int(),
}).superRefine((data, ctx) => {
  // Check 1: answerIndex phải nằm trong choices
  if (data.answerIndex >= data.choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "answerIndex out of bounds",
      path: ["answerIndex"],
    });
  }

  // Check 2: choices không được trùng nhau
  const unique = new Set(data.choices);
  if (unique.size !== data.choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Duplicate choices",
      path: ["choices"],
    });
  }
});
```

---

## Slide 19 — Transform: Đổi format khi parse

### Parse + transform trong 1 bước

```typescript
// String "2024-01-15" → Date object
const dateSchema = z.string().transform((s) => new Date(s));
const date = dateSchema.parse("2024-01-15");  // Date object

// Tags string "ts,node,react" → string[]
const tagsSchema = z.string().transform((s) =>
  s.split(",").map(t => t.trim())
);
tagsSchema.parse("ts, node, react");  // ["ts", "node", "react"]

// Coerce: built-in transform phổ biến
const numberSchema = z.coerce.number();
numberSchema.parse("42");        // 42 (number)
numberSchema.parse("3.14");      // 3.14

const boolSchema = z.coerce.boolean();
boolSchema.parse("true");        // true (boolean)
boolSchema.parse("");            // false

const dateSchema2 = z.coerce.date();
dateSchema2.parse("2024-01-15"); // Date object
```

---

## Slide 20 — Composition: Pick, Omit, Partial

### Reuse schema giống TypeScript

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string(),
  createdAt: z.coerce.date(),
});

// Pick fields cụ thể
const LoginSchema = UserSchema.pick({
  email: true,
  password: true,
});
// { email: string, password: string }

// Omit fields nhạy cảm
const PublicUserSchema = UserSchema.omit({ password: true });

// Mọi field thành optional
const UpdateUserSchema = UserSchema.partial();
// { id?, email?, password?, ... }

// Mọi field bắt buộc
const RequiredUserSchema = UserSchema.required();

// Extend thêm field
const AdminUserSchema = UserSchema.extend({
  permissions: z.array(z.string()),
});
```

---

## Slide 21 — Union và Discriminated Union

### Schema cho "this OR that"

```typescript
// Union đơn giản
const idSchema = z.union([z.string().uuid(), z.number().int()]);
idSchema.parse("550e...");  // ✅
idSchema.parse(42);         // ✅

// Discriminated union — hiệu năng tốt hơn
const ShapeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("circle"), radius: z.number() }),
  z.object({ type: z.literal("square"), side: z.number() }),
  z.object({ type: z.literal("rect"), width: z.number(), height: z.number() }),
]);

type Shape = z.infer<typeof ShapeSchema>;
// = { type: "circle", radius: number }
// | { type: "square", side: number }
// | { type: "rect", width: number, height: number }

const shape = ShapeSchema.parse({ type: "circle", radius: 10 });
if (shape.type === "circle") {
  console.log(shape.radius);  // ✅ TS narrow
}
```

---

## Slide 22 — Áp dụng vào LMS: CourseSchema đầy đủ

```typescript
const SlugSchema = z.string()
  .min(3).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase, digits, hyphens only");

const CourseLevelEnum = z.enum(["beginner", "intermediate", "advanced"]);
const CourseStatusEnum = z.enum(["draft", "published", "archived"]);

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

## Slide 23 — DTO Schema: Tách input từ entity

### Khác biệt giữa "client gửi" vs "DB lưu"

```typescript
// DTO cho POST /courses — client chỉ gửi vài field
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

// DTO cho PATCH /courses/:id — tất cả optional
export const UpdateCourseDto = CreateCourseDto.partial();

// View model cho response (ẩn deletedAt)
export const PublicCourseSchema = CourseSchema.omit({ deletedAt: true });

// View model rút gọn cho list
export const CourseListItemSchema = CourseSchema.pick({
  id: true, slug: true, title: true, level: true,
  tags: true, status: true, publishedAt: true,
});
```

---

## Slide 24 — Error Handling: ZodError có gì?

### Cấu trúc lỗi chi tiết

```typescript
const result = UserSchema.safeParse({
  email: "not-email",
  age: -5,
});

if (!result.success) {
  console.log(result.error.errors);
  // [
  //   { path: ["email"], message: "Invalid email", code: "invalid_string" },
  //   { path: ["age"], message: "Number must be greater than 0", code: "too_small" }
  // ]

  // Flatten để dễ trả về API
  console.log(result.error.flatten());
  // {
  //   formErrors: [],
  //   fieldErrors: {
  //     email: ["Invalid email"],
  //     age: ["Number must be greater than 0"]
  //   }
  // }
}
```

---

## Slide 25 — Format error cho client (chuẩn API)

### Tích hợp với `ApiResponse<T>` (từ Video 7)

```typescript
function validateBody<T extends z.ZodSchema>(
  schema: T,
  body: unknown
): ApiResponse<z.infer<T>> {
  const result = schema.safeParse(body);

  if (result.success) {
    return {
      ok: true,
      data: result.data,
      requestId: getCurrentRequestId(),
    };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: result.error.flatten().fieldErrors,
    },
    requestId: getCurrentRequestId(),
  };
}

// Sử dụng trong controller
const validation = validateBody(CreateCourseDto, req.body);
if (!validation.ok) return res.status(400).json(validation);
```

---

## Slide 26 — Validate Environment Variables

### Use case quan trọng nhất

```typescript
// /packages/config/src/env.ts
import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  DATABASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
});

export const env = (() => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();

// Sử dụng — type safe
console.log(env.PORT);          // type: number
console.log(env.NODE_ENV);      // type: "dev" | "test" | "prod"
```

---

## Slide 27 — Performance: Zod schema reuse

### Cache schema, không tạo lại mỗi request

**❌ Sai — tạo schema mỗi lần gọi**

```typescript
function validateUser(data: unknown) {
  const schema = z.object({       // tạo mới mỗi lần — chậm
    id: z.string().uuid(),
    email: z.string().email(),
  });
  return schema.safeParse(data);
}
```

**✅ Đúng — schema ở module level**

```typescript
const UserSchema = z.object({     // tạo 1 lần khi import
  id: z.string().uuid(),
  email: z.string().email(),
});

function validateUser(data: unknown) {
  return UserSchema.safeParse(data);   // chỉ parse, không build schema
}
```

> 💡 Schema build tốn ~100x time so với parse. Luôn module-level.

---

## Slide 28 — Bài tập thực hành

### 🎯 Code trong `packages/types/src/`

**Bài 1:** QuizSchema đầy đủ

```typescript
// Quiz có:
// - id (uuid)
// - lessonId (uuid)
// - title (string, 3-200 chars)
// - questions (array, 1-50 items, mỗi question):
//   - q (string)
//   - choices (string[], 2-6 items, không trùng)
//   - answerIndex (int, phải < choices.length)
// - timeLimit (int seconds, optional, 60-3600)
```

**Bài 2:** Transform input

```typescript
// Schema nhận input:
// "tags": "ts, node, react"  → ["ts", "node", "react"]
// "publishedAt": "2024-01-15" → Date object
// "priceCents": "5000" → 5000 (number)
```

**Bài 3:** Reuse schema

```typescript
// Tạo CreateQuizDto từ QuizSchema (bỏ id, thêm gì cần)
// Tạo UpdateQuizDto (partial)
```

---

## Slide 29 — Tổng kết Video 8

### Bạn vừa học

- ✅ Vì sao TypeScript không đủ — runtime validation
- ✅ Zod schema cơ bản: string, number, boolean, enum, array, object
- ✅ Optional, nullable, default — 3 kiểu "không bắt buộc"
- ✅ Refinement + transform cho custom logic
- ✅ `parse` vs `safeParse` — chọn cái phù hợp
- ✅ `z.infer` — sinh TS type miễn phí từ schema
- ✅ Compose: `pick`, `omit`, `partial`, `extend`
- ✅ Áp dụng vào `CourseSchema` thật của LMS

> 💪 Mọi data từ "thế giới ngoài" giờ đều an toàn

---

<!-- _class: lead -->

# Tiếp theo: Video 9

## Kiến Trúc Shared Types

Đóng gói tất cả schemas vào package `@lms/types` để mọi app/package khác dùng chung. Single source of truth thật sự.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 9 🚀

> *"Parse, don't validate."*
> *— Alexis King*
