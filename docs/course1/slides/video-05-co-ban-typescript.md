---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 5: Cơ Bản Về TypeScript'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cơ Bản Về
# TypeScript

### Khóa 1 — Video 5

**Mọi thứ bạn cần biết để bắt đầu**

> JavaScript có superpower = TypeScript

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **TypeScript khác JavaScript** ở điểm nào
- ✅ Biết các **kiểu dữ liệu cơ bản** và cách dùng
- ✅ Phân biệt **`type` vs `interface`** — khi nào dùng cái nào
- ✅ Hiểu **type inference** và khi nào cần annotation
- ✅ Sử dụng **union types** và **literal types** thành thạo

> 🎯 Mỗi concept đều có code example chạy được

---

## Slide 3 — TypeScript là gì?

### Định nghĩa siêu ngắn

> **TypeScript = JavaScript + Static Type System**

```typescript
// JavaScript: lỗi chỉ phát hiện khi chạy
function greet(name) {
  return "Hello " + name.toUpperCase();
}
greet(123);  // 💥 Runtime error: name.toUpperCase is not a function

// TypeScript: lỗi phát hiện ngay khi gõ code
function greet(name: string) {
  return "Hello " + name.toUpperCase();
}
greet(123);  // ❌ Compile error: Argument of type 'number' is not assignable
```

> 💡 **Cốt lõi:** TypeScript bắt lỗi *trước khi chạy*

---

## Slide 4 — Vì sao JavaScript thuần không đủ?

### 3 vấn đề thực tế

**1. Lỗi typo không được phát hiện**

```javascript
const user = { name: "Alice", age: 25 };
console.log(user.naem);  // undefined — không báo lỗi!
```

**2. Không biết function nhận gì, trả gì**

```javascript
function calculateTotal(items, discount) {
  // items là gì? array? object? discount là number hay string?
}
```

**3. Refactor cực kỳ rủi ro**

```javascript
// Đổi tên field "title" → "name" trong 100 file?
// Không có IDE nào auto-rename an toàn được
```

---

## Slide 5 — TypeScript giải quyết cả 3

```typescript
// 1. Typo bị bắt ngay
interface User { name: string; age: number }
const user: User = { name: "Alice", age: 25 };
console.log(user.naem);
//              ^^^^ Property 'naem' does not exist on type 'User'

// 2. Signature rõ ràng
function calculateTotal(
  items: { price: number; qty: number }[],
  discount: number
): number { /* ... */ }

// 3. Refactor an toàn
// Đổi tên 1 field → IDE tự đổi mọi nơi + báo lỗi nơi chưa đổi
```

---

## Slide 6 — Cài đặt và chạy TypeScript

### Setup trong 30 giây

```bash
# Trong project ai-lms
pnpm add -D typescript tsx @types/node

# Tạo file thử
echo 'console.log("Hello TS")' > hello.ts

# Chạy trực tiếp (không cần compile)
pnpm tsx hello.ts
# Output: Hello TS
```

**3 công cụ chính:**

- `tsc` — TypeScript compiler chính chủ
- `tsx` — chạy `.ts` trực tiếp (dev mode)
- `@types/node` — type definitions cho Node.js APIs

---

## Slide 7 — Kiểu dữ liệu cơ bản (1/2)

### Primitive types

```typescript
// 1. string
const name: string = "Alice";
const greeting: string = `Hello ${name}`;

// 2. number (cả integer và float)
const age: number = 25;
const price: number = 99.99;

// 3. boolean
const isActive: boolean = true;

// 4. null và undefined
const empty: null = null;
const notSet: undefined = undefined;

// 5. bigint (cho số rất lớn)
const huge: bigint = 9007199254740993n;
```

---

## Slide 8 — Kiểu dữ liệu cơ bản (2/2)

### Collection types

```typescript
// Array — 2 cách viết
const tags: string[] = ["typescript", "node"];
const scores: Array<number> = [90, 85, 100];

// Tuple — array có độ dài và kiểu cố định
const point: [number, number] = [10, 20];
const user: [string, number, boolean] = ["Alice", 25, true];

// Object
const course: { title: string; price: number } = {
  title: "TypeScript 101",
  price: 49,
};

// any — TUYỆT ĐỐI TRÁNH (xem Video 6)
const dangerous: any = "anything goes";
dangerous.foo.bar.baz();  // ❌ Không bị TS bắt lỗi
```

---

## Slide 9 — Type Inference: TS đoán type giùm bạn

### Đừng annotate khi TS có thể đoán

```typescript
// ❌ Không cần — TS biết là string
const name: string = "Alice";

// ✅ Tốt hơn — để TS infer
const name = "Alice";  // TS hiểu: string

// Inference hoạt động với mọi loại
const age = 25;                    // number
const isActive = true;             // boolean
const tags = ["ts", "node"];       // string[]
const user = { name: "Alice" };    // { name: string }

// Function return cũng được infer
function add(a: number, b: number) {
  return a + b;        // TS infer return type: number
}
```

---

## Slide 10 — Khi nào CẦN annotation?

### 4 trường hợp annotation bắt buộc

```typescript
// 1. Function parameters (TS không đoán được)
function greet(name: string) { /* ... */ }

// 2. Khai báo trước, gán sau
let user: User;
user = fetchUser();

// 3. Khi cần widen type
const status = "active";              // type: "active" (literal)
const status2: string = "active";     // type: string  (widened)

// 4. Khi return type cần explicit (public API)
function getUser(id: string): User | null {
  // ...
}
```

> 💡 **Quy tắc:** Annotate input + public API. Còn lại để TS infer.

---

## Slide 11 — Union Types: "Cái này HOẶC cái kia"

### Dùng `|` để combine types

```typescript
// Variable có thể là string HOẶC number
let id: string | number;
id = "abc-123";     // ✅
id = 42;            // ✅
id = true;          // ❌ boolean không được

// Function nhận nhiều kiểu input
function format(input: string | number): string {
  return String(input);
}

// Array chứa nhiều loại
const mixed: (string | number)[] = ["a", 1, "b", 2];
```

> 🎯 Use case thực tế: ID có thể là UUID string hoặc auto-increment number

---

## Slide 12 — Type Narrowing: Thu hẹp union

### TypeScript thông minh hơn bạn nghĩ

```typescript
function format(input: string | number): string {
  // Trước if: input là string | number
  if (typeof input === "string") {
    // TS biết: ở đây input chắc chắn là string
    return input.toUpperCase();  // ✅ method của string
  }
  // Sau else: TS biết input chắc chắn là number
  return input.toFixed(2);       // ✅ method của number
}
```

**Cách narrow phổ biến:**

- `typeof x === "string"` cho primitives
- `x instanceof Date` cho classes
- `"foo" in obj` cho object properties
- `x !== null` cho null checks

---

## Slide 13 — Literal Types: Giá trị cụ thể

### Không phải `string` chung chung, mà là chuỗi cụ thể

```typescript
// Literal type — chỉ chấp nhận đúng giá trị "draft"
let status: "draft" = "draft";
status = "published";  // ❌ Type '"published"' is not assignable

// Kết hợp với union → enum cực mạnh
type CourseStatus = "draft" | "published" | "archived";

let courseStatus: CourseStatus;
courseStatus = "draft";       // ✅
courseStatus = "published";   // ✅
courseStatus = "deleted";     // ❌ Compile error

// Number literal cũng được
type DiceRoll = 1 | 2 | 3 | 4 | 5 | 6;
const roll: DiceRoll = 4;     // ✅
const cheat: DiceRoll = 7;    // ❌
```

---

## Slide 14 — Literal Types áp dụng cho LMS

### Ví dụ thật từ dự án Khóa 1

```typescript
// Role học sinh / giáo viên / admin
type Role = "student" | "teacher" | "admin";

// Mức độ khóa học
type CourseLevel = "beginner" | "intermediate" | "advanced";

// Loại nội dung bài học
type LessonContent = "video" | "pdf" | "text";

// Status quiz
type QuizStatus = "not_started" | "in_progress" | "completed";

// Dùng trong function — autocomplete tự nhảy ra
function checkPermission(role: Role, action: string) {
  // IDE gợi ý: "student", "teacher", "admin"
}
```

> 💡 IDE auto-complete sẽ liệt kê đúng 3 giá trị — không sợ typo

---

## Slide 15 — `type` vs `interface`: Câu hỏi muôn thuở

### So sánh trực diện

```typescript
// === Type alias ===
type User = {
  id: string;
  name: string;
  age: number;
};

// === Interface ===
interface User {
  id: string;
  name: string;
  age: number;
}

// Cả 2 đều dùng được như nhau cho object shape
const alice: User = { id: "1", name: "Alice", age: 25 };
```

> 🤔 Vậy chọn cái nào?

---

## Slide 16 — `interface` mạnh hơn ở 2 điểm

### Extend và Declaration Merging

**1. Interface extends rõ ràng hơn**

```typescript
interface Animal { name: string }
interface Dog extends Animal { breed: string }

// Type tương đương — verbose hơn
type Animal = { name: string };
type Dog = Animal & { breed: string };  // intersection
```

**2. Interface có thể merge nhiều khai báo**

```typescript
interface User { id: string }
interface User { name: string }
// → User giờ có CẢ id và name (merged)

// Type không merge được — sẽ báo lỗi duplicate
```

---

## Slide 17 — `type` mạnh hơn ở 4 điểm

### Linh hoạt hơn cho complex types

```typescript
// 1. Union types
type Status = "draft" | "published";       // ✅
interface Status = ...                      // ❌ không làm được

// 2. Tuple types
type Point = [number, number];              // ✅
interface Point = ...                       // ❌

// 3. Mapped types
type Optional<T> = { [K in keyof T]?: T[K] };  // ✅

// 4. Conditional types
type IsString<T> = T extends string ? true : false;  // ✅
```

---

## Slide 18 — Quy tắc chọn: Cực kỳ đơn giản

### Cheat sheet cho dự án LMS

| Trường hợp | Dùng |
|-----------|------|
| Object shape (User, Course, Lesson) | `interface` |
| Class implements / extends | `interface` |
| Union types (`"draft" \| "published"`) | `type` |
| Tuple, mapped, conditional | `type` |
| Khi không chắc | `interface` |

```typescript
// Trong dự án LMS Khóa 1:
interface User { id: string; email: string }       // ✅ interface
interface Course { id: string; title: string }     // ✅ interface

type Role = "student" | "teacher" | "admin";       // ✅ type (union)
type CourseId = string;                            // ✅ type (alias)
```

---

## Slide 19 — Type Aliases hữu ích

### Đặt tên cho type phức tạp

```typescript
// ❌ Khó đọc, lặp lại
function processUser(
  data: { id: string; name: string; email: string },
  callback: (result: { success: boolean; userId: string }) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  // ...
}

// ✅ Sạch hơn với type alias
type UserData = { id: string; name: string; email: string };
type ProcessResult = { success: boolean; userId: string };
type ProcessResponse = { ok: true } | { ok: false; error: string };

function processUser(
  data: UserData,
  callback: (result: ProcessResult) => void
): Promise<ProcessResponse> {
  // ...
}
```

---

## Slide 20 — Readonly: Bảo vệ data khỏi mutation

### Ngăn vô tình sửa object

```typescript
interface User {
  readonly id: string;       // không sửa được sau khi tạo
  name: string;              // sửa được
}

const user: User = { id: "1", name: "Alice" };
user.name = "Bob";    // ✅
user.id = "2";        // ❌ Cannot assign to 'id' because it is read-only

// Cho cả object
const config: Readonly<{ port: number; host: string }> = {
  port: 3000,
  host: "localhost",
};
config.port = 4000;   // ❌

// Cho array
const tags: ReadonlyArray<string> = ["ts", "node"];
tags.push("react");   // ❌ Property 'push' does not exist
```

---

## Slide 21 — Optional Properties: `?`

### Field có thể không có

```typescript
interface User {
  id: string;
  name: string;
  avatar?: string;       // optional — có thể có hoặc không
  bio?: string;          // optional
}

// Cả 2 đều hợp lệ
const minimalUser: User = { id: "1", name: "Alice" };
const fullUser: User = {
  id: "2",
  name: "Bob",
  avatar: "bob.jpg",
  bio: "Developer",
};

// Khi đọc optional field
console.log(minimalUser.avatar);
// Type: string | undefined → phải check trước khi dùng

if (minimalUser.avatar) {
  console.log(minimalUser.avatar.length);  // ✅
}
```

---

## Slide 22 — Function Types: Định nghĩa shape của function

### 3 cách khai báo function type

```typescript
// 1. Inline annotation
const add = (a: number, b: number): number => a + b;

// 2. Function type alias
type BinaryOp = (a: number, b: number) => number;
const subtract: BinaryOp = (a, b) => a - b;

// 3. Interface với call signature
interface Logger {
  (message: string): void;       // callable
  level: string;                  // có property
}

const log: Logger = (msg) => console.log(msg);
log.level = "info";
log("Hello");                     // gọi như function
```

---

## Slide 23 — Ví dụ tổng hợp: Course type cho LMS

### Áp dụng tất cả vào 1 ví dụ thật

```typescript
type CourseLevel = "beginner" | "intermediate" | "advanced";
type CourseStatus = "draft" | "published" | "archived";

interface Course {
  readonly id: string;
  slug: string;
  title: string;
  description?: string;
  level: CourseLevel;
  tags: string[];
  status: CourseStatus;
  price: number;
  createdAt: Date;
}

const reactCourse: Course = {
  id: "c-1",
  slug: "react-101",
  title: "React Fundamentals",
  level: "beginner",
  tags: ["react", "frontend"],
  status: "published",
  price: 49,
  createdAt: new Date(),
};
```

---

## Slide 24 — Anti-pattern: Đừng dùng `any`

### `any` = vứt bỏ TypeScript

```typescript
// ❌ TUYỆT ĐỐI TRÁNH
function process(data: any) {
  return data.foo.bar.baz();  // TS không kiểm tra gì
}

// ✅ Dùng unknown nếu thật sự không biết type
function process(data: unknown) {
  if (typeof data === "object" && data !== null && "foo" in data) {
    // narrow trước khi access
  }
}

// ✅ Hoặc dùng generic
function process<T>(data: T): T {
  return data;
}
```

> ⚠️ Khóa 1 có ESLint rule `no-explicit-any: error` — dùng `any` không commit được

---

## Slide 25 — `unknown` vs `any`: Khác biệt sống còn

### Cùng "không biết type", nhưng `unknown` an toàn

```typescript
const value: any = "hello";
value.toUpperCase();          // ✅ TS không cản
value.foo.bar();              // ✅ TS cũng không cản (nguy hiểm!)
value();                      // ✅ TS không cản

const safe: unknown = "hello";
safe.toUpperCase();           // ❌ Object is of type 'unknown'

// Phải narrow trước
if (typeof safe === "string") {
  safe.toUpperCase();         // ✅ giờ TS biết safe là string
}
```

> 💡 **Quy tắc:** Khi không biết type → dùng `unknown`, không bao giờ `any`

---

## Slide 26 — Bài tập thực hành

### 🎯 Code ngay sau video

**Bài 1:** Tạo type cho Quiz

```typescript
// Yêu cầu:
// - Quiz có id (string, readonly), title (string)
// - Có array questions
// - Mỗi question: text (string), options (string[]), correctIndex (number)
// - difficulty: "easy" | "medium" | "hard"
// - timeLimit (number, optional)
```

**Bài 2:** Viết function `formatScore`

```typescript
// Nhận score: number | "N/A"
// Nếu number → return "85/100"
// Nếu "N/A" → return "Chưa làm"
```

**Bài 3:** Refactor JS → TS

Lấy 1 file JS bất kỳ của bạn → convert sang TypeScript, fix tất cả lỗi

---

## Slide 27 — Tổng kết Video 5

### Bạn vừa học

- ✅ TypeScript là gì, khác JavaScript thế nào
- ✅ 5 kiểu primitive + array/tuple/object
- ✅ Type inference — để TS tự đoán
- ✅ Union types và literal types
- ✅ `type` vs `interface` — quy tắc chọn
- ✅ Readonly, Optional, Function types
- ✅ Tại sao tránh `any`, dùng `unknown`

> 💪 Đây là foundation cho mọi video sau

---

<!-- _class: lead -->

# Tiếp theo: Video 6

## Cấu Hình TypeScript Strict

Strict mode là gì, tsconfig.base.json với 5 flag quan trọng, cách xử lý lỗi strict thường gặp.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 6 🚀

> *"Types are documentation that can't lie."*
