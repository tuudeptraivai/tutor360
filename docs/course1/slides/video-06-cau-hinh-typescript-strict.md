---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 6: Cấu Hình TypeScript Strict'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cấu Hình
# TypeScript Strict

### Khóa 1 — Video 6

**Khắt khe ở dev → an toàn ở production**

> Strict mode = bạn ngủ ngon hơn

---

## Slide 2 — Mục tiêu video này

Sau 20 phút, bạn sẽ:

- ✅ Hiểu **vì sao strict mode là bắt buộc** trong production
- ✅ Cấu hình **`tsconfig.base.json`** với 5 flag quan trọng
- ✅ Hiểu mỗi flag **bắt được lỗi gì** (kèm ví dụ)
- ✅ Setup pattern **`extends`** cho các package con
- ✅ Biết cách **xử lý lỗi strict thường gặp**

> 🎯 Cuối video: bạn có `tsconfig.base.json` sẵn sàng cho cả monorepo

---

## Slide 3 — Strict mode = "Bật mọi check"

### Default TypeScript dễ tính như JavaScript

```typescript
// tsconfig.json mặc định — không strict
function greet(name) {           // ✅ name có type 'any' ngầm
  return name.toUpperCase();      // ✅ TS không cản
}
greet();                          // ✅ Không có argument cũng OK
greet(123);                       // ✅ Vẫn pass — chỉ fail khi chạy
```

### Bật strict → TS bắt mọi lỗi tiềm ẩn

```typescript
// "strict": true
function greet(name) {            // ❌ Parameter implicit any
  return name.toUpperCase();
}
greet();                          // ❌ Expected 1 argument, got 0
```

---

## Slide 4 — Vì sao strict mode là BẮT BUỘC?

### 4 lý do quan trọng

**1. Bắt bug ngay từ lúc gõ**
Không phải đợi user click rồi mới biết crash

**2. Tự document code**
Type signature = mô tả chính xác function làm gì

**3. Refactor an toàn**
Đổi field → TS chỉ ra mọi nơi cần update

**4. Onboard dev mới nhanh**
IDE auto-complete chính xác → đỡ đọc docs

> 💰 **Cost-benefit thực tế:**
> Chậm 10% lúc viết → tránh 70% bug ở production

---

## Slide 5 — Cấu hình `tsconfig.base.json`

### File chính của toàn monorepo

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

---

## Slide 6 — Flag #1: `strict: true`

### Bật 1 lần → enable 8 flag con

`"strict": true` tương đương bật:

- `noImplicitAny` — không cho param không có type
- `strictNullChecks` — null và undefined là type riêng
- `strictFunctionTypes` — check chặt function parameter
- `strictBindCallApply` — check bind/call/apply
- `strictPropertyInitialization` — class field phải init
- `alwaysStrict` — emit "use strict"
- `noImplicitThis` — `this` phải có type
- `useUnknownInCatchVariables` — catch dùng unknown

> 💡 Đây là **flag quan trọng nhất** — riêng nó đã bắt 80% bug

---

## Slide 7 — `strictNullChecks` — Bug killer #1

### Ví dụ thực tế tiêu biểu

```typescript
// ❌ Không strict — null lén lút
function getUser(id: string) {
  return db.findUser(id);  // có thể trả null
}

const user = getUser("123");
console.log(user.name);    // 💥 TypeError: Cannot read property 'name' of null

// ✅ Strict — TS bắt ngay
function getUser(id: string): User | null {
  return db.findUser(id);
}

const user = getUser("123");
console.log(user.name);    // ❌ Object is possibly 'null'

// Phải narrow trước
if (user) {
  console.log(user.name);  // ✅ user chắc chắn không null ở đây
}
```

---

## Slide 8 — Flag #2: `noUncheckedIndexedAccess`

### Array index có thể trả undefined

**Không bật:**

```typescript
const users: string[] = ["Alice", "Bob"];
const third = users[2];          // type: string
console.log(third.toUpperCase()); // 💥 Runtime: Cannot read 'toUpperCase' of undefined
```

**Bật `noUncheckedIndexedAccess`:**

```typescript
const users: string[] = ["Alice", "Bob"];
const third = users[2];          // type: string | undefined
console.log(third.toUpperCase()); // ❌ Object is possibly 'undefined'

// Phải check
if (third) {
  console.log(third.toUpperCase());  // ✅
}
```

> 🎯 Áp dụng cho cả array `[i]`, object `obj[key]`, `Map.get()`

---

## Slide 9 — `noUncheckedIndexedAccess` ví dụ với object

### Trường hợp object dynamic key

```typescript
const scores: Record<string, number> = {
  alice: 90,
  bob: 85,
};

// ❌ Không bật flag
const charlie = scores["charlie"];     // type: number
console.log(charlie.toFixed(2));        // 💥 undefined.toFixed

// ✅ Bật flag
const charlie = scores["charlie"];     // type: number | undefined
console.log(charlie.toFixed(2));        // ❌ TS bắt

// Cách fix
const charlie = scores["charlie"] ?? 0;
console.log(charlie.toFixed(2));        // ✅
```

---

## Slide 10 — Flag #3: `exactOptionalPropertyTypes`

### `undefined` vs "không có field" — TS phân biệt

**Không bật:**

```typescript
interface User { name?: string }

const user: User = { name: undefined };  // ✅ pass
const user2: User = {};                   // ✅ pass
// → TS coi 2 cái như nhau
```

**Bật `exactOptionalPropertyTypes`:**

```typescript
interface User { name?: string }

const user: User = { name: undefined };  // ❌ Type 'undefined' not assignable to type 'string'
const user2: User = {};                   // ✅ pass

// Muốn cho phép undefined thì khai báo rõ
interface User { name?: string | undefined }
const user: User = { name: undefined };  // ✅
```

> 💡 Bắt được bug khi `JSON.stringify` (undefined biến mất khi serialize)

---

## Slide 11 — Flag #4: `noImplicitOverride`

### Override class method phải khai báo rõ

**Không bật:**

```typescript
class Animal {
  speak() { console.log("..."); }
}

class Dog extends Animal {
  speak() { console.log("Woof!"); }  // ✅ silent override
}

// Vấn đề: parent đổi tên speak() → speakLoud()
// Dog vẫn pass — nhưng speak() trở thành method MỚI, không override
```

**Bật `noImplicitOverride`:**

```typescript
class Dog extends Animal {
  speak() { /* ... */ }              // ❌ Must use 'override' modifier

  override speak() { /* ... */ }     // ✅ Explicit override
}
```

> 🎯 Bắt bug khi refactor parent class — child không bị broken silent

---

## Slide 12 — Flag #5: `noFallthroughCasesInSwitch`

### Quên `break` → fallthrough ngầm

**Không bật:**

```typescript
function getDay(d: number) {
  switch (d) {
    case 1: console.log("Mon");   // ⚠️ Quên break
    case 2: console.log("Tue");   // → Sẽ print cả Mon và Tue
    case 3: console.log("Wed"); break;
  }
}
```

**Bật `noFallthroughCasesInSwitch`:**

```typescript
function getDay(d: number) {
  switch (d) {
    case 1: console.log("Mon");   // ❌ Fallthrough case detected
    case 2: console.log("Tue"); break;
  }
}
```

> 💡 Vẫn cho fallthrough cố ý nếu case không có code (chỉ chuyển label)

---

## Slide 13 — Flag bonus: `isolatedModules`

### Quan trọng cho monorepo + bundler

```json
{ "isolatedModules": true }
```

**Bắt buộc khi dùng:**

- `tsx`, `vite`, `swc`, `esbuild` (Khóa 1 dùng `tsx`)
- Webpack với `babel-loader`
- Any tool compile từng file riêng

**Bắt 3 lỗi:**

```typescript
// ❌ Re-export type không có 'type' keyword
export { User } from "./types";

// ✅ Phải dùng
export type { User } from "./types";

// ❌ Const enum (single-file compile không hiểu)
const enum Status { Active }

// ❌ Namespace dùng cross-file
namespace MyLib { /* ... */ }
```

---

## Slide 14 — Flag bonus: `skipLibCheck`

### Bỏ qua check type của thư viện

```json
{ "skipLibCheck": true }
```

**Vì sao bật?**

- 99% thư viện `node_modules` có type sai vặt
- Build chậm gấp 3-5x nếu check hết
- Bạn không sửa được lỗi trong package người khác

**Trade-off:**

- ❌ Có thể miss bug trong type definition của lib
- ✅ Build nhanh hơn nhiều
- ✅ Ít noise lúc dev

> 💡 **Industry standard:** Mọi project lớn đều bật `skipLibCheck`

---

## Slide 15 — Pattern `extends` cho monorepo

### `tsconfig.base.json` ở root, các package extends

**Root:** `/tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
    // ... (đầy đủ ở Slide 5)
  }
}
```

**Package:** `/packages/types/tsconfig.json`

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

---

## Slide 16 — Apps cũng extends giống packages

### `/apps/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

> 💡 NestJS cần `experimentalDecorators` + `emitDecoratorMetadata` (cho `@Controller`, `@Injectable`...)

---

## Slide 17 — Cấu trúc thư mục TypeScript trong monorepo

```
ai-lms/
├── tsconfig.base.json          ← Strict config GỐC
│
├── apps/
│   └── api/
│       ├── tsconfig.json       ← extends base + NestJS config
│       └── src/
│
└── packages/
    ├── types/
    │   ├── tsconfig.json       ← extends base
    │   └── src/
    │
    ├── config/
    │   ├── tsconfig.json       ← extends base
    │   └── src/
    │
    └── eslint-config/
        ├── tsconfig.json       ← extends base
        └── src/
```

> ✅ Đổi rule strict ở `tsconfig.base.json` → áp dụng MỌI package

---

## Slide 18 — Lỗi strict thường gặp #1: Implicit any

### Pattern lỗi

```typescript
// ❌ Lỗi: Parameter 'data' implicitly has an 'any' type
function process(data) {
  return data.value;
}

// ❌ Lỗi: Variable 'arr' implicitly has type 'any[]'
const arr = [];
arr.push(1);
```

### Cách fix

```typescript
// ✅ Annotate parameter
function process(data: { value: number }) {
  return data.value;
}

// ✅ Annotate array type
const arr: number[] = [];
arr.push(1);

// ✅ Hoặc dùng generic
function process<T extends { value: unknown }>(data: T) {
  return data.value;
}
```

---

## Slide 19 — Lỗi strict thường gặp #2: Null possibility

### Pattern lỗi

```typescript
// ❌ Object is possibly 'null'
const user = document.getElementById("user");
user.innerHTML = "Hello";

// ❌ Object is possibly 'undefined'
const first = ["a", "b"][10];
first.toUpperCase();
```

### Cách fix — 3 cách

```typescript
// 1. Optional chaining
user?.innerHTML = "Hello";   // không an toàn cho assign — dùng if

// 2. If guard (recommended)
if (user) {
  user.innerHTML = "Hello";  // ✅ TS narrow
}

// 3. Non-null assertion (DÙNG CẨN THẬN)
user!.innerHTML = "Hello";   // ⚠️ Crash nếu null thật
```

---

## Slide 20 — Lỗi strict thường gặp #3: Class field init

### Pattern lỗi

```typescript
// ❌ Property 'name' has no initializer and is not definitely assigned
class User {
  name: string;
  age: number;
}
```

### 4 cách fix

```typescript
// 1. Init trong constructor
class User {
  name: string;
  age: number;
  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }
}

// 2. Default value
class User {
  name: string = "";
  age: number = 0;
}

// 3. Optional
class User {
  name?: string;
}

// 4. Definite assignment assertion (dùng với DI framework)
class User {
  name!: string;   // "tôi đảm bảo sẽ được set"
}
```

---

## Slide 21 — Lỗi strict thường gặp #4: Unknown in catch

### Catch error giờ là `unknown`

```typescript
try {
  await fetchUser();
} catch (err) {
  // ❌ 'err' is of type 'unknown'
  console.log(err.message);
}
```

### Cách fix — narrow trước khi dùng

```typescript
try {
  await fetchUser();
} catch (err) {
  // ✅ Cách 1: instanceof
  if (err instanceof Error) {
    console.log(err.message);
  }

  // ✅ Cách 2: type guard
  if (typeof err === "object" && err !== null && "message" in err) {
    console.log((err as { message: string }).message);
  }

  // ✅ Cách 3: helper function
  const message = getErrorMessage(err);
}
```

---

## Slide 22 — Helper `getErrorMessage` dùng chung

### Pattern cực kỳ phổ biến

```typescript
// /packages/config/src/errors.ts
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
}

// Sử dụng
try {
  await riskyOperation();
} catch (err) {
  logger.error(getErrorMessage(err));
}
```

> 💡 Sẽ dùng helper này xuyên suốt Khóa 1 (error handling, logging)

---

## Slide 23 — Compile vs Check: `tsc` vs `tsc --noEmit`

### 2 use case khác nhau

```bash
# Compile thật — sinh file .js trong dist/
pnpm tsc

# CHỈ check type, không emit file
pnpm tsc --noEmit
```

**`--noEmit` dùng khi:**

- ✅ CI/CD chỉ cần biết "code có valid không"
- ✅ Dev mode dùng `tsx` (chạy `.ts` thẳng) → không cần emit
- ✅ Bundler khác (esbuild, swc) lo việc compile

**Script `typecheck` ở root `package.json`:**

```json
{
  "scripts": {
    "typecheck": "pnpm -r run typecheck"
  }
}
```

---

## Slide 24 — Mỗi package có script `typecheck`

### `/apps/api/package.json`

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

### Workflow thực tế

```bash
# Trong khi code — IDE đã hiển thị lỗi real-time
# Trước khi commit — chạy:
pnpm typecheck

# Output mẫu khi pass:
# packages/types typecheck: Done in 1.2s
# packages/config typecheck: Done in 0.8s
# apps/api typecheck: Done in 2.1s

# Output mẫu khi fail:
# apps/api/src/main.ts:12:8 - error TS2322:
#   Type 'string' is not assignable to type 'number'
```

---

## Slide 25 — Đo "Strictness" của project

### `tsc` flag `--strict` log chi tiết

```bash
# Hiện mọi setting hiện tại (debug config)
pnpm tsc --showConfig

# Build kèm thống kê
pnpm tsc --extendedDiagnostics
# Output:
# Files:              123
# Lines of Library:   38456
# Lines of Definitions: 12340
# Type Check Time:    1.23s
```

**Health check cho project:**

| Metric | Target |
|--------|--------|
| `strict` enable | ✅ true |
| `any` count (grep) | < 5 |
| Type check time | < 5s |
| Build time full | < 30s |

---

## Slide 26 — Migration strategy: Project có sẵn

### Bật strict cho codebase cũ

**Bước 1:** Bật từng flag, fix dần

```json
// Tuần 1
{ "noImplicitAny": true }

// Tuần 2
{ "noImplicitAny": true, "strictNullChecks": true }

// Tuần N — full strict
{ "strict": true }
```

**Bước 2:** Dùng `// @ts-expect-error` cho chỗ chưa fix

```typescript
// @ts-expect-error TODO: fix in PR-123
const value = legacyFunction(input);
```

> 💡 Khóa 1 build mới → bật full strict từ đầu, không cần migration

---

## Slide 27 — Bài tập thực hành

### 🎯 Áp dụng vào project ai-lms

**Bài 1:** Setup `tsconfig.base.json`

- Copy config từ Slide 5
- Tạo `apps/api/tsconfig.json` extends base
- Chạy `pnpm tsc --noEmit` thấy 0 error

**Bài 2:** Trigger từng lỗi strict

```typescript
// File test-strict.ts — viết code cố ý sai để xem lỗi:
// 1. Implicit any
// 2. Null access
// 3. Array index out of bounds
// 4. Class field không init
```

**Bài 3:** Đọc TS error messages

Lấy 3 lỗi strict bạn gặp → giải thích bằng lời (không Google)

---

## Slide 28 — Tổng kết Video 6

### Bạn vừa học

- ✅ Strict mode = bật mọi check
- ✅ 5 flag quan trọng: strict, noUncheckedIndexedAccess, noImplicitOverride, noFallthroughCasesInSwitch, exactOptionalPropertyTypes
- ✅ Pattern `extends` từ `tsconfig.base.json`
- ✅ 4 loại lỗi strict thường gặp + cách fix
- ✅ Helper `getErrorMessage` cho catch unknown
- ✅ Workflow `tsc --noEmit` cho CI

> 💪 Project của bạn giờ "đứng vững" trước mọi bug type-related

---

<!-- _class: lead -->

# Tiếp theo: Video 7

## Interfaces và Generics

Interface nâng cao, generics cơ bản đến nâng cao, utility types, xây dựng `Result<T, E>` và `ApiResponse<T>` dùng chung.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 7 🚀

> *"Strict mode is a love letter to your future self."*
