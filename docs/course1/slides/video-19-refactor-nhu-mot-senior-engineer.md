---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 19: Refactor Như Một Senior Engineer'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Refactor Như
# Một Senior Engineer

### Khóa 1 — Video 19

**Code "chạy được" và code "sạch" — khác xa nhau**

> Refactor không phải làm lại — là cải thiện không đổi behavior

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Biết **khi nào nên refactor** — Rule of Three
- ✅ Nhận diện **6 code smell** phổ biến nhất
- ✅ Master 3 pattern: **Extract Function, Extract Module, Replace Magic Number**
- ✅ Refactor **`CoursesService`** dùng Repository pattern đúng cách
- ✅ Setup **ESLint + Prettier + Husky + lint-staged**
- ✅ Cấu hình **`pnpm verify`** = lint + typecheck + test + build
- ✅ Pre-commit hook chặn code xấu vào repo

> 🎯 Cuối video: commit code xấu → bị reject tự động

---

## Slide 3 — Refactor là gì?

### Định nghĩa của Martin Fowler

> **Refactoring**: thay đổi cấu trúc code mà **KHÔNG thay đổi behavior**

```typescript
// Before
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].quantity;
  }
  return total;
}

// After (refactored, same behavior)
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

**Behavior:** input giống → output giống → test pass

**Cấu trúc:** sạch hơn, dễ đọc, dễ extend

---

## Slide 4 — Khi nào nên refactor?

### Rule of Three (Don Roberts)

1. **Lần đầu** làm: cứ làm
2. **Lần thứ hai** làm tương tự: cảm thấy lặp, nhưng còn ráng
3. **Lần thứ ba**: REFACTOR

```typescript
// Lần 1: chỉ có CourseSchema, viết Zod inline
function validateCourse(body: unknown) {
  return CourseSchema.safeParse(body);
}

// Lần 2: thêm LessonSchema, lặp pattern
function validateLesson(body: unknown) {
  return LessonSchema.safeParse(body);
}

// Lần 3: thêm UserSchema → STOP, refactor
function validate<T extends ZodSchema>(schema: T, body: unknown) {
  return schema.safeParse(body);
}
```

> 💡 Quá sớm refactor (chỉ 1 use case) → over-engineering

---

## Slide 5 — Khi KHÔNG refactor

### 4 trường hợp đừng đụng

**1. Code đang chạy production ổn định, không cần thêm feature**
"If it ain't broke, don't fix it"

**2. Sắp delete trong sprint sau**
Refactor xong xoá → lãng phí

**3. Không có test bảo vệ**
Refactor không test → giới thiệu bug mới

**4. Bạn không thực sự hiểu code đó làm gì**
Đọc + run debug trước → hiểu rồi mới sửa

---

## Slide 6 — Code Smell #1: Duplicate Code

### Tín hiệu cần Extract

**Smell:**

```typescript
// CoursesService.list()
const result = await this.repo.findMany(q);
const items = result.items.map(toListItem);
return { items, total: result.total, page: q.page, pageSize: q.pageSize };

// LessonsService.list()
const result = await this.repo.findMany(q);
const items = result.items.map(toLessonListItem);
return { items, total: result.total, page: q.page, pageSize: q.pageSize };
```

**Refactor:** Extract pagination helper

```typescript
function toPage<T, U>(
  result: { items: T[]; total: number },
  q: PageRequest,
  mapper: (item: T) => U,
): Page<U> {
  return {
    items: result.items.map(mapper),
    total: result.total,
    page: q.page,
    pageSize: q.pageSize,
  };
}
```

---

## Slide 7 — Code Smell #2: Long Function

### Function > 30 dòng = warning

**Smell:**

```typescript
async create(input: CreateCourseInput): Promise<PublicCourse> {
  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(input.slug)) {
    throw new ValidationException({ slug: ["Invalid format"] });
  }

  // Check uniqueness
  const existing = await this.repo.findBySlug(input.slug);
  if (existing) {
    throw new ConflictException("Slug exists");
  }

  // Generate id
  const id = crypto.randomUUID();

  // Prepare entity
  const now = new Date();
  const course: Course = {
    id, ...input, status: "draft",
    version: 1, publishedAt: null,
    teacherId: DEFAULT_TEACHER_ID,
    createdAt: now, updatedAt: now, deletedAt: null,
  };

  // Insert
  const result = await this.repo.insert(course);

  // Map to public view
  const { deletedAt, ...publicCourse } = result;
  return publicCourse;
}
```

→ 25 dòng, làm 5 việc → tách

---

## Slide 8 — Sau khi Extract Function

```typescript
async create(input: CreateCourseInput): Promise<PublicCourse> {
  await this.ensureSlugAvailable(input.slug);
  const created = await this.repo.insert(this.buildEntity(input));
  return toPublic(created);
}

private async ensureSlugAvailable(slug: string): Promise<void> {
  if (await this.repo.existsBySlug(slug)) {
    throw new ConflictException("Slug exists");
  }
}

private buildEntity(input: CreateCourseInput): Course {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    ...input,
    status: "draft",
    version: 1,
    publishedAt: null,
    teacherId: DEFAULT_TEACHER_ID,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
```

→ Method chính chỉ 3 dòng, đọc như tiếng người

---

## Slide 9 — Code Smell #3: Deep Nesting

### Pyramid of doom

**Smell:**

```typescript
if (user) {
  if (user.role === "teacher") {
    if (course) {
      if (course.teacherId === user.id) {
        if (!course.deletedAt) {
          return doSomething(course);
        }
      }
    }
  }
}
return null;
```

**Refactor: Early return (guard clauses)**

```typescript
if (!user) return null;
if (user.role !== "teacher") return null;
if (!course) return null;
if (course.teacherId !== user.id) return null;
if (course.deletedAt) return null;

return doSomething(course);
```

> 💡 Đảo điều kiện, return sớm → mỗi check là 1 dòng, dễ đọc tuyến tính

---

## Slide 10 — Code Smell #4: Magic Number / Magic String

### Số không có ngữ nghĩa rải khắp code

**Smell:**

```typescript
if (course.priceCents > 10000000) {
  throw new ValidationException({ price: ["Too high"] });
}

if (user.role === "admin") {
  // ...
}

setTimeout(() => poll(), 5000);
```

**Refactor: Replace Magic Number with Named Constant**

```typescript
const MAX_COURSE_PRICE_CENTS = 10_000_000;  // $100,000
const POLL_INTERVAL_MS = 5_000;
const ROLES = { STUDENT: "student", TEACHER: "teacher", ADMIN: "admin" } as const;

if (course.priceCents > MAX_COURSE_PRICE_CENTS) { /* ... */ }
if (user.role === ROLES.ADMIN) { /* ... */ }
setTimeout(() => poll(), POLL_INTERVAL_MS);
```

---

## Slide 11 — Code Smell #5: Primitive Obsession

### Nhồi nhét primitive thay vì type riêng

**Smell:**

```typescript
function transferMoney(
  fromUserId: string,
  toUserId: string,
  amount: number,
  currency: string,
): void {
  // 4 string/number — dễ truyền nhầm thứ tự
  // transferMoney("USD", "u-1", "u-2", 100) → compile pass!
}
```

**Refactor: Value Object**

```typescript
type UserId = string & { readonly brand: unique symbol };
type Money = { amount: number; currency: "USD" | "VND" | "EUR" };

function transferMoney(from: UserId, to: UserId, money: Money): void {
  // Compiler bắt mọi nhầm thứ tự
}
```

> 💡 Khóa 1 chưa cần Branded types — đây là gợi ý cho Khóa 3+ khi có domain phức tạp

---

## Slide 12 — Code Smell #6: Feature Envy

### Method dùng quá nhiều data của class khác

**Smell:**

```typescript
class CoursesController {
  formatPrice(course: Course): string {
    const cents = course.priceCents;
    const usd = cents / 100;
    const formatted = `$${usd.toFixed(2)}`;
    if (course.priceCents === 0) return "Free";
    return formatted;
  }
}
// → Controller "envy" Course data
```

**Refactor: Move Method**

```typescript
class CoursesService {
  formatPrice(course: Course): string {
    if (course.priceCents === 0) return "Free";
    return `$${(course.priceCents / 100).toFixed(2)}`;
  }
}

// Hoặc tách helper riêng nếu pure
function formatCoursePrice(priceCents: number): string {
  if (priceCents === 0) return "Free";
  return `$${(priceCents / 100).toFixed(2)}`;
}
```

---

## Slide 13 — Pattern: Extract Module

### Tách 1 file thành nhiều file/module

**Before:** `courses.service.ts` 500 dòng

```
courses.service.ts
├── list()
├── create()
├── update()
├── publish()
├── archive()
├── validateSlug()
├── ensureUnique()
├── notifySubscribers()
└── trackAnalytics()
```

**After:** Tách responsibility

```
modules/courses/
├── courses.service.ts        ← orchestrator (50 dòng)
├── course-validator.ts       ← validation logic
├── course-publisher.ts       ← publish workflow
├── course-notifier.ts        ← email subscribers
└── course-analytics.ts       ← analytics tracking
```

> 💡 Mỗi file 1 trách nhiệm → test riêng, change riêng

---

## Slide 14 — Pattern: Replace Conditional with Polymorphism

### Switch dài → class hierarchy

**Smell:**

```typescript
function getRolePermissions(role: string): string[] {
  switch (role) {
    case "student":
      return ["read:course", "submit:quiz"];
    case "teacher":
      return ["read:course", "create:course", "grade:quiz"];
    case "admin":
      return ["*"];
    default:
      throw new Error("Unknown role");
  }
}
```

**Refactor: Map-based (đơn giản hơn polymorphism)**

```typescript
const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  student: ["read:course", "submit:quiz"],
  teacher: ["read:course", "create:course", "grade:quiz"],
  admin: ["*"],
};

function getRolePermissions(role: Role): readonly string[] {
  return ROLE_PERMISSIONS[role];
}
```

---

## Slide 15 — Refactor thực tế: CoursesService trước

### Before — service vừa orchestrate vừa làm logic

```typescript
@Injectable()
export class CoursesService {
  private courses = new Map<string, Course>();   // ⛔ business + data lẫn lộn

  async list(q: ListCoursesQueryInput) {
    let arr = Array.from(this.courses.values());
    if (q.status !== "all") arr = arr.filter(c => c.status === q.status);
    if (q.q) arr = arr.filter(c => c.title.includes(q.q));
    // ... 30 dòng filter/sort/paginate
    return { items: arr.slice(...), total: arr.length, ... };
  }

  async create(input: CreateCourseInput) {
    for (const c of this.courses.values()) {
      if (c.slug === input.slug) throw new ConflictException("...");
    }
    const course = { id: crypto.randomUUID(), ...input, /* server fields */ };
    this.courses.set(course.id, course);
    return course;
  }
}
```

→ Khó test, khó swap Postgres, vi phạm Single Responsibility

---

## Slide 16 — Refactor sau: Repository pattern

### Tách data layer

```typescript
// 1. Interface
export interface CourseRepository {
  findMany(filter: CourseFilter): Promise<{ items: Course[]; total: number }>;
  findBySlug(slug: string): Promise<Course | null>;
  existsBySlug(slug: string): Promise<boolean>;
  insert(input: CreateCourseInput & { teacherId: string }): Promise<Course>;
}

// 2. Implementation
@Injectable()
export class InMemoryCourseRepository implements CourseRepository { /* ... */ }

// 3. Service — clean orchestrator
@Injectable()
export class CoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY) private readonly repo: CourseRepository,
  ) {}

  async list(q: ListCoursesQueryInput): Promise<Page<CourseListItem>> {
    const { items, total } = await this.repo.findMany(q);
    return toPage({ items, total }, q, toListItem);
  }

  async create(input: CreateCourseInput): Promise<PublicCourse> {
    if (await this.repo.existsBySlug(input.slug)) {
      throw new ConflictException("Slug exists");
    }
    return toPublic(await this.repo.insert({ ...input, teacherId: DEFAULT_TEACHER_ID }));
  }
}
```

> 🎯 Service không biết Map vs Postgres → Khóa 3 chỉ swap 1 dòng

---

## Slide 17 — Setup ESLint cho monorepo

### Shared config trong `packages/eslint-config/`

**`/packages/eslint-config/index.js`:**

```javascript
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "import/order": ["warn", {
      groups: ["builtin", "external", "internal", "parent", "sibling"],
    }],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
};
```

---

## Slide 18 — Apply ESLint config

### `/apps/api/.eslintrc.js`

```javascript
module.exports = {
  root: true,
  extends: ["@lms/eslint-config"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
};
```

### Script trong `package.json`

```json
{
  "scripts": {
    "lint": "eslint 'src/**/*.ts' --max-warnings 0",
    "lint:fix": "eslint 'src/**/*.ts' --fix"
  }
}
```

### Test

```bash
pnpm --filter @lms/api lint
```

**Trigger lỗi để thử:**

```typescript
const x: any = "wrong";  // ❌ @typescript-eslint/no-explicit-any
saveUser(user);          // ❌ @typescript-eslint/no-floating-promises (thiếu await)
```

---

## Slide 19 — Prettier: Format thống nhất

### `/.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### `/.prettierignore`

```
node_modules
dist
build
coverage
pnpm-lock.yaml
*.md
```

### Scripts

```json
{
  "scripts": {
    "format": "prettier --write \"**/*.{ts,tsx,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json}\""
  }
}
```

> 💡 `format:check` cho CI — chỉ check, không sửa

---

## Slide 20 — Husky: Git hooks dễ dàng

### Cài đặt

```bash
pnpm add -Dw husky lint-staged
pnpm husky init     # tạo .husky/ folder
```

### `/.husky/pre-commit`

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm lint-staged
```

### `/package.json`

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix --max-warnings 0",
      "prettier --write"
    ],
    "*.{json,md}": ["prettier --write"]
  }
}
```

> 💡 `lint-staged` chỉ check file đã `git add` → nhanh hơn lint toàn repo

---

## Slide 21 — Test Husky hoạt động

### Trigger lỗi commit

```bash
# Tạo file xấu
echo "const x: any = 1;" > apps/api/src/bad.ts

git add apps/api/src/bad.ts
git commit -m "test"

# Output:
# ✖ eslint --fix --max-warnings 0:
#   bad.ts:1:10  error  Unexpected any. Specify a different type
#
# husky - pre-commit hook exited with code 1 (error)
# → commit BỊ CHẶN
```

**Sửa code:**

```typescript
const x: string = "1";   // ✅
```

```bash
git add bad.ts && git commit -m "test"
# ✅ pass → commit thành công
```

---

## Slide 22 — `pnpm verify`: Gate trước PR

### Root `package.json`

```json
{
  "scripts": {
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "build": "pnpm -r run build",
    "format:check": "prettier --check \"**/*.{ts,tsx,json}\"",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

### Workflow

```bash
# Trước khi push branch / tạo PR
pnpm verify

# Output:
# ✓ Format check pass
# ✓ Lint pass (0 errors, 0 warnings)
# ✓ Typecheck pass
# ✓ Test pass (45/45)
# ✓ Build pass
```

→ Nếu fail → fix → re-verify → push

---

## Slide 23 — CI/CD integration (preview Khóa 8)

### `.github/workflows/verify.yml`

```yaml
name: Verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

> 💡 Mọi PR phải qua CI verify trước khi merge — không bypass được

---

## Slide 24 — Refactor process: Step-by-step

### Workflow an toàn

```
1. Đảm bảo có test bảo vệ
   $ pnpm test
   ✅ 45 passed

2. Commit current state
   $ git commit -m "chore: snapshot before refactor"

3. Refactor TỪNG BƯỚC NHỎ
   - Đổi 1 thứ → run test
   - Pass → tiếp
   - Fail → undo, làm nhỏ hơn

4. Commit từng micro-refactor
   $ git commit -m "refactor: extract ensureSlugAvailable"
   $ git commit -m "refactor: extract buildEntity"

5. Cuối cùng squash hoặc giữ history
   $ git rebase -i HEAD~5
```

> 💡 KHÔNG refactor 10 thứ cùng lúc — fail không biết do đâu

---

## Slide 25 — Best practices refactor

### 8 nguyên tắc

**1. Test trước, refactor sau** — không có test thì viết test trước

**2. Một refactor một commit** — dễ revert nếu sai

**3. Đừng thay đổi behavior + refactor cùng commit** — tách riêng

**4. Refactor "in passing"** — sửa khi đang đụng file đó, không quá đà

**5. Đặt tên tốt > comment** — code đọc như văn

**6. Xoá code chết không tiếc** — Git nhớ cho rồi

**7. Đo trước khi optimize** — không guess performance

**8. Rule of Three** — đợi đến lần 3 mới abstract

---

## Slide 26 — Anti-patterns refactor

### 5 lỗi phổ biến

**❌ 1. Big-bang refactor**

```
Refactor 5 module cùng 1 PR
→ Review không nổi
→ Conflict nhiều
→ Bug khó tìm
```

**❌ 2. Refactor không có test**

```
Refactor "có vẻ tốt hơn"
→ Test thiếu → bug silent vào prod
```

**❌ 3. Premature abstraction**

```
"Tôi nghĩ sau này sẽ cần multiple DB"
→ Build abstraction phức tạp cho 1 DB
→ Tốn code, complex hơn cần thiết
```

**❌ 4. Refactor + feature trong cùng commit**

```
"Refactor + thêm endpoint mới"
→ Reviewer không biết đâu là cải thiện, đâu là feature
```

**❌ 5. Để TODO comment thay vì làm**

```typescript
// TODO: refactor this
```
→ Sẽ ngồi đó vĩnh viễn. Tạo issue / không thì làm luôn.

---

## Slide 27 — Bài tập thực hành

### 🎯 Apply lên dự án thật

**Bài 1:** Setup ESLint + Prettier + Husky + lint-staged

- Theo Slide 17-21
- Test commit code xấu → bị reject

**Bài 2:** Refactor CoursesService

- Apply Extract Function cho method `create` dài
- Tách helper `toPage<T, U>()`
- Đảm bảo test vẫn pass sau mỗi refactor

**Bài 3:** Replace magic numbers

- Tìm hardcoded number trong code (page size, timeout...)
- Tạo named constants ở `packages/config/src/constants.ts`

**Bài 4:** Setup `pnpm verify`

- Chạy được local, pass clean
- Trigger từng failure (lint fail, typecheck fail, test fail) → fix

**Bài 5:** Nhờ Claude refactor

- Prompt: "Refactor CoursesService: extract long methods theo Rule of Three"
- Review diff trước khi accept

---

## Slide 28 — Tổng kết Video 19

### Bạn vừa học

- ✅ Refactor = đổi cấu trúc, KHÔNG đổi behavior
- ✅ Rule of Three — khi nào nên refactor
- ✅ 6 code smell: duplicate, long function, deep nesting, magic number, primitive obsession, feature envy
- ✅ 3 pattern: Extract Function, Extract Module, Replace Conditional with Map
- ✅ Setup ESLint + Prettier + Husky + lint-staged
- ✅ `pnpm verify` gate trước PR
- ✅ Refactor process an toàn (test trước, commit nhỏ)

> 💪 Code base của bạn giờ "khó làm xấu" — tooling chặn tự động

---

<!-- _class: lead -->

# Tiếp theo: Video 20

## Chuẩn Bị Cho Các Module Backend

Tổng kết Khóa 1, checklist deliverables, tag `course-1-complete`, preview Khóa 2 (Authentication), bài tập tự luyện 1 tuần.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 20 🚀

> *"Make the change easy, then make the easy change."*
> *— Kent Beck*
