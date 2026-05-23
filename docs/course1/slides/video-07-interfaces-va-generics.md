---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 7: Interfaces và Generics'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Interfaces
# và Generics

### Khóa 1 — Video 7

**Type system mạnh nhất bạn từng dùng**

> Generics = function cho type system

---

## Slide 2 — Mục tiêu video này

Sau 30 phút, bạn sẽ:

- ✅ Dùng **Interface nâng cao**: extends, implements
- ✅ Hiểu **Generics** từ cơ bản đến nâng cao
- ✅ Viết **Generic functions** và **Generic classes**
- ✅ Nắm 5 **Utility types** quan trọng nhất
- ✅ Tự xây `Result<T, E>` và `ApiResponse<T>` dùng chung
- ✅ Áp dụng `Repository<T>` pattern cho LMS

> 🎯 Cuối video: có `packages/types/src/utils.ts` hoàn chỉnh

---

## Slide 3 — Interface: Ôn lại cơ bản

### Interface mô tả "shape" của object

```typescript
interface User {
  id: string;
  email: string;
  fullName: string;
}

const alice: User = {
  id: "u-1",
  email: "alice@example.com",
  fullName: "Alice Nguyen",
};

// Function nhận interface
function sendEmail(user: User, subject: string) {
  console.log(`Sending "${subject}" to ${user.email}`);
}

sendEmail(alice, "Welcome!");
```

---

## Slide 4 — Interface Extends: Kế thừa

### Tránh lặp code

```typescript
interface Person {
  id: string;
  fullName: string;
  email: string;
}

// Student kế thừa Person + thêm field riêng
interface Student extends Person {
  enrolledCourses: string[];
  studyStreak: number;
}

// Teacher cũng kế thừa Person
interface Teacher extends Person {
  coursesCreated: string[];
  rating: number;
}

const alice: Student = {
  id: "s-1",
  fullName: "Alice",
  email: "alice@x.com",
  enrolledCourses: ["c-1", "c-2"],
  studyStreak: 7,
};
```

---

## Slide 5 — Interface Extends nhiều cha

### Multiple inheritance bằng interface

```typescript
interface HasId { id: string }
interface HasTimestamps {
  createdAt: Date;
  updatedAt: Date;
}
interface HasAuthor { teacherId: string }

// Course có cả 3
interface Course extends HasId, HasTimestamps, HasAuthor {
  title: string;
  slug: string;
}

const course: Course = {
  id: "c-1",
  title: "React 101",
  slug: "react-101",
  teacherId: "t-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

> 💡 Pattern thực tế: tách "trait" thành interface nhỏ → mix lại

---

## Slide 6 — Interface Implements: Class theo interface

### Class hứa hẹn implement interface

```typescript
interface Logger {
  info(msg: string): void;
  error(msg: string, err?: Error): void;
}

// Class phải có đủ method theo interface
class ConsoleLogger implements Logger {
  info(msg: string) {
    console.log(`[INFO] ${msg}`);
  }
  error(msg: string, err?: Error) {
    console.error(`[ERROR] ${msg}`, err?.stack);
  }
}

class JsonLogger implements Logger {
  info(msg: string) {
    console.log(JSON.stringify({ level: "info", msg }));
  }
  error(msg: string, err?: Error) {
    console.log(JSON.stringify({ level: "error", msg, err: err?.message }));
  }
}
```

---

## Slide 7 — Vì sao Generics?

### Vấn đề: Viết function 1 lần dùng cho mọi type

**Không có generics — viết lại liên tục:**

```typescript
function firstString(arr: string[]): string | undefined {
  return arr[0];
}
function firstNumber(arr: number[]): number | undefined {
  return arr[0];
}
function firstUser(arr: User[]): User | undefined {
  return arr[0];
}
// ... 100 hàm khác nhau cho 100 type khác nhau 😭
```

**Có generics — 1 hàm cho mọi type:**

```typescript
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

first(["a", "b"]);          // T = string
first([1, 2, 3]);           // T = number
first([user1, user2]);      // T = User
```

---

## Slide 8 — Generic Function: Cú pháp

### Đọc generic syntax

```typescript
//          ↓ type parameter
function map<T, U>(arr: T[], fn: (item: T) => U): U[] {
  return arr.map(fn);
}
//                ↑ input type    ↑ transform     ↑ output type

// Sử dụng — TS auto infer
const numbers = [1, 2, 3];
const strings = map(numbers, n => String(n));
// T = number, U = string → result: string[]

// Hoặc explicit
const explicit = map<number, string>([1, 2, 3], n => String(n));
```

> 💡 `<T>` chỉ là tên — có thể dùng `<Input>`, `<Output>` cho rõ nghĩa

---

## Slide 9 — Generic Constraint: `extends`

### Giới hạn T phải có shape nhất định

```typescript
// ❌ T không có guarantee về .length
function longest<T>(a: T, b: T): T {
  return a.length > b.length ? a : b;
  //       ^^^^^^ Property 'length' does not exist on type 'T'
}

// ✅ Constraint: T phải có property length
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length > b.length ? a : b;
}

longest("hello", "world");           // ✅ string có .length
longest([1, 2], [3, 4, 5]);          // ✅ array có .length
longest({ length: 5 }, { length: 3 }); // ✅ object có .length
longest(10, 20);                      // ❌ number không có .length
```

---

## Slide 10 — Default Generic Type

### Set giá trị default cho T

```typescript
// E mặc định là Error
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Không cần truyền E
type StringResult = Result<string>;
// = { ok: true; value: string } | { ok: false; error: Error }

// Vẫn có thể override
type StringResultStr = Result<string, string>;
// = { ok: true; value: string } | { ok: false; error: string }
```

---

## Slide 11 — Multiple Type Parameters

### Generic với nhiều type cùng lúc

```typescript
// Function entries → object
function fromEntries<K extends string, V>(
  entries: [K, V][]
): Record<K, V> {
  const result = {} as Record<K, V>;
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

// Sử dụng
const obj = fromEntries([
  ["name", "Alice"],
  ["age", "25"],
]);
// Type: Record<"name" | "age", string>

// Pair generic
function pair<A, B>(a: A, b: B): [A, B] {
  return [a, b];
}

const tuple = pair("hello", 42);  // [string, number]
```

---

## Slide 12 — Generic Class

### Class có type parameter

```typescript
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length;
  }
}

const numberStack = new Stack<number>();
numberStack.push(1);
numberStack.push(2);
numberStack.pop();   // type: number | undefined

const userStack = new Stack<User>();
userStack.push(alice);  // type: User
```

---

## Slide 13 — Utility Type: `Partial<T>`

### Mọi field thành optional

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

// Partial<User> = mọi field optional
type UserUpdate = Partial<User>;
// = { id?: string; name?: string; email?: string; age?: number }

// Use case: update function chỉ cần update vài field
function updateUser(id: string, changes: Partial<User>): User {
  // chỉ update field nào có trong changes
}

updateUser("u-1", { name: "Bob" });          // ✅
updateUser("u-1", { age: 30, email: "x" });  // ✅
updateUser("u-1", {});                        // ✅
```

---

## Slide 14 — Utility Type: `Required<T>`

### Ngược lại Partial — mọi field bắt buộc

```typescript
interface User {
  id: string;
  name?: string;       // optional
  email?: string;      // optional
}

// Required<User> = mọi field bắt buộc
type CompleteUser = Required<User>;
// = { id: string; name: string; email: string }

// Use case: sau khi validate, đảm bảo user có đủ field
function validateAndProcess(user: User): CompleteUser {
  if (!user.name || !user.email) {
    throw new Error("Missing fields");
  }
  return user as CompleteUser;
}
```

---

## Slide 15 — Utility Type: `Pick<T, K>`

### Chọn vài field từ type

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password: string;     // sensitive!
  createdAt: Date;
}

// Pick chỉ các field public
type PublicUser = Pick<User, "id" | "name" | "email">;
// = { id: string; name: string; email: string }

// Use case: response trả về client không có password
function getPublicProfile(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
```

> 🎯 Dự án LMS dùng pick để tạo `CourseListItem` (xem Slide 22)

---

## Slide 16 — Utility Type: `Omit<T, K>`

### Loại bỏ vài field

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

// Bỏ password đi
type SafeUser = Omit<User, "password">;
// = { id: string; name: string; email: string }

// Bỏ nhiều field
type AnonymousUser = Omit<User, "password" | "email">;
// = { id: string; name: string }

// Use case khác: input cho create, bỏ id (server tự sinh)
type CreateUserInput = Omit<User, "id">;
// = { name: string; email: string; password: string }
```

---

## Slide 17 — Utility Type: `Record<K, V>`

### Tạo object với key/value type cố định

```typescript
// Mapping role → array permissions
type Role = "student" | "teacher" | "admin";

type RolePermissions = Record<Role, string[]>;

const permissions: RolePermissions = {
  student: ["read:course", "submit:quiz"],
  teacher: ["read:course", "create:course", "grade:quiz"],
  admin: ["*"],
};

// Dictionary string → number
type ScoreMap = Record<string, number>;

const scores: ScoreMap = {
  alice: 90,
  bob: 85,
  charlie: 78,
};
```

---

## Slide 18 — Xây dựng `Result<T, E>` từ đầu

### Functional error handling pattern

```typescript
// File: /packages/types/src/utils.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Helper constructors
export const Ok  = <T>(value: T): Result<T, never>  =>
  ({ ok: true, value });

export const Err = <E>(error: E): Result<never, E>  =>
  ({ ok: false, error });

// Sử dụng
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return Err("Division by zero");
  return Ok(a / b);
}

const r = divide(10, 2);
if (r.ok) {
  console.log(r.value);   // ✅ TS biết là number
} else {
  console.log(r.error);   // ✅ TS biết là string
}
```

---

## Slide 19 — Vì sao `Result` thay vì throw?

### So sánh 2 cách

**❌ Throw — type không thể hiện**

```typescript
function parseJson(s: string): unknown {
  return JSON.parse(s);   // throws nếu invalid
}

// Caller không biết có thể throw → quên try/catch
const data = parseJson("invalid");   // 💥 crash
```

**✅ Result — type hint rõ ràng**

```typescript
function parseJson(s: string): Result<unknown, Error> {
  try {
    return Ok(JSON.parse(s));
  } catch (err) {
    return Err(err as Error);
  }
}

const r = parseJson("invalid");
if (r.ok) {                          // TS BẮT BUỘC check
  console.log(r.value);
} else {
  console.log(r.error.message);
}
```

---

## Slide 20 — Xây dựng `ApiResponse<T>`

### Standard envelope cho API response

```typescript
// File: /packages/types/src/utils.ts
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;        // VALIDATION_ERROR, NOT_FOUND, ...
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// Sử dụng trong API
function fetchCourse(id: string): Promise<ApiResponse<Course>> {
  // ...
}
```

---

## Slide 21 — Discriminated Union: TS narrowing thần kỳ

### `ok: true | false` là discriminator

```typescript
const response = await fetchCourse("c-1");

// Trước if: ApiSuccess<Course> | ApiFailure
if (response.ok) {
  // Sau if: TS biết chắc là ApiSuccess<Course>
  console.log(response.data.title);   // ✅
  console.log(response.error);         // ❌ không tồn tại field này
} else {
  // Sau else: TS biết là ApiFailure
  console.log(response.error.code);    // ✅
  console.log(response.data);          // ❌ không tồn tại field này
}
```

> 💡 **Pattern:** dùng literal type chung (`ok`) để TS narrow tự động

---

## Slide 22 — Pagination types

### Dùng generic cho mọi resource

```typescript
// File: /packages/types/src/utils.ts
export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Sử dụng
type CoursesPage = Page<Course>;
type UsersPage = Page<User>;
type LessonsPage = Page<Lesson>;

async function listCourses(req: PageRequest): Promise<Page<Course>> {
  const items = await db.courses.findMany({ skip: ..., take: ... });
  const total = await db.courses.count();
  return { items, total, page: req.page, pageSize: req.pageSize };
}
```

---

## Slide 23 — `Repository<T>` Pattern

### Interface dùng chung cho mọi resource

```typescript
// File: /packages/types/src/utils.ts
export interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findMany(filter?: Partial<T>): Promise<T[]>;
  create(input: Omit<T, "id">): Promise<T>;
  update(id: ID, patch: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
}

// In-memory implementation
class InMemoryCourseRepository implements Repository<Course> {
  private store = new Map<string, Course>();

  async findById(id: string) {
    return this.store.get(id) ?? null;
  }
  async create(input: Omit<Course, "id">) {
    const course = { ...input, id: crypto.randomUUID() };
    this.store.set(course.id, course);
    return course;
  }
  // ... rest
}
```

---

## Slide 24 — Repository với Prisma (preview Khóa 3)

### Cùng interface, implementation khác

```typescript
// Khóa 3 swap implementation — interface không đổi
class PrismaCourseRepository implements Repository<Course> {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.course.findUnique({ where: { id } });
  }
  async create(input: Omit<Course, "id">) {
    return this.prisma.course.create({ data: input });
  }
  // ... rest
}

// Service code không cần thay đổi!
class CoursesService {
  constructor(private repo: Repository<Course>) {}

  async getCourse(id: string) {
    return this.repo.findById(id);  // ✅ dùng được mọi impl
  }
}
```

> 🎯 Đây là **Dependency Inversion** — code phụ thuộc interface, không phụ thuộc impl

---

## Slide 25 — `keyof` Operator

### Lấy tên các field làm union type

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

type UserKey = keyof User;
// = "id" | "name" | "email"

// Use case: getter tổng quát
function getField<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const alice: User = { id: "1", name: "Alice", email: "a@x.com" };
const name = getField(alice, "name");    // type: string
const id = getField(alice, "id");        // type: string
const wrong = getField(alice, "foo");    // ❌ "foo" not in keyof User
```

---

## Slide 26 — `typeof` Operator (type context)

### Lấy type từ runtime value

```typescript
// Có 1 object const
const config = {
  port: 3000,
  host: "localhost",
  debug: true,
} as const;

// Lấy type từ object đó
type Config = typeof config;
// = { readonly port: 3000; readonly host: "localhost"; readonly debug: true }

// Use case: function typing
const defaultUser = {
  role: "student" as const,
  active: true,
};

type DefaultUser = typeof defaultUser;
// = { role: "student"; active: boolean }
```

> 💡 Sẽ dùng nhiều ở Video 8 với Zod: `type Course = z.infer<typeof CourseSchema>`

---

## Slide 27 — Mapped Types: Transform interface

### Sinh type mới từ type cũ

```typescript
// Tự build Partial từ đầu
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Tự build Readonly
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Use case: tất cả field thành nullable
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

type NullableUser = Nullable<User>;
// = { id: string | null; name: string | null; email: string | null }
```

---

## Slide 28 — Áp dụng tất cả vào dự án LMS

### File `/packages/types/src/utils.ts` hoàn chỉnh

```typescript
// 1) ApiResponse envelope
export type ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type ApiFailure   = { ok: false; error: ApiError; requestId: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export interface ApiError { code: string; message: string; details?: unknown }

// 2) Result type
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
export const Ok  = <T>(value: T): Result<T, never>  => ({ ok: true,  value });
export const Err = <E>(error: E): Result<never, E>  => ({ ok: false, error });

// 3) Repository contract
export interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findMany(filter?: Partial<T>): Promise<T[]>;
  create(input: Omit<T, "id">): Promise<T>;
  update(id: ID, patch: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
}

// 4) Pagination
export interface PageRequest { page: number; pageSize: number }
export interface Page<T>     { items: T[]; total: number; page: number; pageSize: number }
```

---

## Slide 29 — Bài tập thực hành

### 🎯 Code ngay trong `packages/types/src/`

**Bài 1:** Generic Cache class

```typescript
// Tự viết class:
class Cache<K, V> {
  // get(key: K): V | undefined
  // set(key: K, value: V, ttlMs?: number): void
  // delete(key: K): void
}
```

**Bài 2:** Utility type custom

```typescript
// Type loại bỏ field optional
type RequireOnly<T, K extends keyof T> = ...

// Test:
type X = RequireOnly<User, "id" | "email">;
// = { id: string; email: string; name?: string }
```

**Bài 3:** Generic `groupBy<T, K>`

```typescript
function groupBy<T, K extends keyof T>(
  items: T[],
  key: K
): Record<string, T[]> { /* ... */ }
```

---

## Slide 30 — Tổng kết Video 7

### Bạn vừa học

- ✅ Interface nâng cao: extends nhiều cha, implements
- ✅ Generics: function, class, constraint, default
- ✅ 5 utility types: `Partial`, `Required`, `Pick`, `Omit`, `Record`
- ✅ Xây `Result<T, E>`, `ApiResponse<T>`, `Page<T>`
- ✅ `Repository<T>` pattern cho LMS
- ✅ Operators: `keyof`, `typeof`, mapped types
- ✅ Discriminated union cho TS narrowing

> 💪 File `utils.ts` của bạn giờ sẵn sàng cho 7 khóa sau

---

<!-- _class: lead -->

# Tiếp theo: Video 8

## Validation Runtime với Zod

TypeScript không bắt được lỗi ở runtime. Zod = "TypeScript cho data thật" — validate input API, parse JSON từ user.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 8 🚀

> *"Make illegal states unrepresentable."*
> *— Yaron Minsky*
