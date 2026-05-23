---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 13: Biến Môi Trường và Configs'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Biến Môi Trường
# và Configs

### Khóa 1 — Video 13

**12-Factor App: Cấu hình tách khỏi code**

> Code = nguyên liệu. Env = công thức. Đừng trộn lẫn.

---

## Slide 2 — Mục tiêu video này

Sau 22 phút, bạn sẽ:

- ✅ Hiểu **vì sao không hardcode** config vào code
- ✅ Dùng **`dotenv`** + file `.env`, `.env.example` đúng cách
- ✅ Validate biến môi trường bằng **Zod** ở thời điểm khởi động
- ✅ Viết module **`env.ts`** với **fail-fast pattern**
- ✅ Quản lý nhiều môi trường: dev, test, production
- ✅ Bảo mật: **không commit `.env`**, dùng secret manager

> 🎯 Cuối video: `packages/config/src/env.ts` hoàn chỉnh, type-safe

---

## Slide 3 — Vấn đề: Hardcode config

### 5 loại config thường bị hardcode

```typescript
// ❌ Tệ — config rải rác trong code
const app = createServer({
  port: 3000,                                     // ⛔ hardcode
  database: "postgres://user:pass@localhost/db",  // ⛔ secret!
  apiKey: "sk-ant-api03-xxxxxxxx",                // ⛔ secret!
  redisUrl: "redis://localhost:6379",             // ⛔
  emailFrom: "noreply@lms.com",                   // ⛔
});
```

**Hậu quả:**

- 🚨 Push lên GitHub → lộ API key, password
- 🔥 Đổi env (dev/staging/prod) → phải sửa code
- 😵 Mỗi dev có config khác → conflict liên tục
- 🐛 Đổi 1 config → phải tìm khắp codebase

---

## Slide 4 — Giải pháp: 12-Factor Principle #3

### "Store config in environment"

> *Strict separation of config from code*
> — 12factor.net

```typescript
// ✅ Đúng — config từ env
const app = createServer({
  port: env.PORT,
  database: env.DATABASE_URL,
  apiKey: env.ANTHROPIC_API_KEY,
  redisUrl: env.REDIS_URL,
  emailFrom: env.EMAIL_FROM,
});
```

**Lợi ích:**

- ✅ Code không đổi giữa các môi trường
- ✅ Secret không nằm trong git
- ✅ Mỗi dev tự config local
- ✅ Production dùng secret manager (Vault, AWS Secrets Manager)

---

## Slide 5 — Process.env: Cách Node đọc env

### Built-in từ Node.js

```typescript
// Linux/macOS shell
export PORT=4000
export DATABASE_URL="postgres://..."
node app.js

// Windows PowerShell
$env:PORT=4000
$env:DATABASE_URL="postgres://..."
node app.js

// Truy cập trong code
console.log(process.env.PORT);          // "4000" (LUÔN là string!)
console.log(process.env.DATABASE_URL);  // "postgres://..."
console.log(process.env.NOT_SET);       // undefined
```

**Vấn đề:**

- ❌ Mọi giá trị là `string` (không phải number, boolean)
- ❌ `undefined` nếu thiếu — không cảnh báo
- ❌ Không có type check, không có validation

---

## Slide 6 — `.env` file: Local development

### Lưu env vào file thay vì export shell

**Tạo file `.env`:**

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
DATABASE_URL=postgres://lms:secret@localhost:5432/lms_dev
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

**Load file với `dotenv`:**

```bash
pnpm add dotenv
```

```typescript
import "dotenv/config";          // load .env vào process.env

console.log(process.env.PORT);   // "3000"
```

> 💡 `dotenv` chỉ cần import 1 lần ở entry point

---

## Slide 7 — `.env.example`: Template cho team

### Commit `.env.example`, ignore `.env`

**File `.env.example`** (commit vào Git):

```env
# === Required ===
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://USER:PASS@HOST:5432/DBNAME

# === Optional (default in code) ===
LOG_LEVEL=info

# === Khóa 5+ ===
ANTHROPIC_API_KEY=

# === Khóa 6+ ===
REDIS_URL=

# === Khóa 4 ===
WEB_ORIGIN=http://localhost:3001
```

**Onboarding mới:**

```bash
cp .env.example .env
# → điền giá trị thật vào .env
```

---

## Slide 8 — `.gitignore`: Tuyệt đối ignore `.env`

```gitignore
# Environment
.env
.env.local
.env.*.local

# Vẫn cho commit template
!.env.example
```

> 🚨 **Nếu lỡ commit `.env` lên GitHub:**
>
> 1. **Đổi ngay mọi secret** (password, API key) — coi như đã lộ
> 2. Remove khỏi history: `git filter-repo --path .env --invert-paths`
> 3. Force push (sau khi backup)
> 4. Mọi dev khác phải clone lại
>
> Việc 1 quan trọng nhất — bot scan GitHub liên tục tìm leaked secret

---

## Slide 9 — `process.env` LUÔN là string

### Trap cho người mới

```typescript
// .env
// PORT=3000
// DEBUG=true

console.log(typeof process.env.PORT);    // "string"
console.log(typeof process.env.DEBUG);   // "string"

// ❌ So sánh sai
if (process.env.DEBUG) {                  // "false" cũng truthy!
  enableDebug();
}

if (process.env.DEBUG === true) {         // không bao giờ true
  enableDebug();
}

// ✅ So sánh string
if (process.env.DEBUG === "true") {
  enableDebug();
}

// ✅ Hoặc cast
const port = parseInt(process.env.PORT ?? "3000", 10);
```

---

## Slide 10 — Vấn đề: Manual validation cực mệt

```typescript
// ❌ Tệ — viết tay validation
function getConfig() {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT");
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");
  if (!dbUrl.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must be postgres://");
  }

  const logLevel = process.env.LOG_LEVEL ?? "info";
  if (!["error", "warn", "info", "debug"].includes(logLevel)) {
    throw new Error("Invalid LOG_LEVEL");
  }

  // ... 10 biến khác nữa 😭
}
```

> 💡 Có công cụ tốt hơn nhiều: **Zod**

---

## Slide 11 — Validate env bằng Zod

### Sạch + type-safe + helpful errors

```typescript
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Required ở Khóa 3+
  DATABASE_URL: z.string().url().optional(),

  // Required ở Khóa 6+
  REDIS_URL: z.string().url().optional(),

  // Required ở Khóa 5+
  ANTHROPIC_API_KEY: z.string().min(10).optional(),

  // Required ở Khóa 4+ khi có frontend
  WEB_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
```

---

## Slide 12 — Fail-fast pattern

### Validate ngay khi import — crash sớm nếu sai

```typescript
// /packages/config/src/env.ts
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({ /* ... */ });

export const env = (() => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();
```

**Hành vi:**

- ✅ Env hợp lệ → `env` object có type chuẩn
- ❌ Env sai → in lỗi rõ ràng + **exit code 1 NGAY**
- 🎯 App không chạy với config sai → không có lỗi mơ hồ sau này

---

## Slide 13 — Sử dụng `env` trong code

### Type-safe, autocomplete đầy đủ

```typescript
import { env } from "@lms/config";

// Type của env:
// {
//   NODE_ENV: "development" | "test" | "production";
//   PORT: number;
//   LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
//   DATABASE_URL?: string;
//   ...
// }

console.log(env.PORT);          // number — không phải string!
console.log(env.NODE_ENV);      // "development" | "test" | "production"

// IDE autocomplete:
env.   // → gợi ý tất cả keys hợp lệ

env.FOOBAR;  // ❌ TS error — không có key này
```

---

## Slide 14 — Test fail-fast hoạt động đúng

### Trigger từng loại lỗi

```bash
# Test 1: Thiếu PORT (default OK)
unset PORT
pnpm dev
# ✅ Run với PORT=3000

# Test 2: PORT sai format
PORT=abc pnpm dev
# ❌ Output:
# Invalid environment variables:
# { PORT: [ 'Expected number, received nan' ] }
# (exit code 1)

# Test 3: PORT âm
PORT=-1 pnpm dev
# ❌ Output:
# { PORT: [ 'Number must be greater than 0' ] }

# Test 4: ANTHROPIC_API_KEY quá ngắn
ANTHROPIC_API_KEY=abc pnpm dev
# ❌ Output:
# { ANTHROPIC_API_KEY: [ 'String must contain at least 10 characters' ] }
```

> 💡 **Lỗi rõ ràng** → fix trong < 30 giây

---

## Slide 15 — Nhiều môi trường: dev, test, prod

### Convention: file `.env.<environment>`

```
.env                    ← chung (commit .env.example)
.env.local              ← local override (KHÔNG commit)
.env.development        ← dev mode
.env.test               ← test (Vitest)
.env.production         ← production (hiếm — thường dùng secret manager)
```

**Load theo `NODE_ENV`:**

```typescript
import dotenv from "dotenv";

const envFile = `.env.${process.env.NODE_ENV ?? "development"}`;
dotenv.config({ path: envFile });
dotenv.config({ path: ".env" });  // fallback
```

> 💡 Khóa 1 chỉ cần `.env` đơn giản. Khóa 7+ chia môi trường rõ ràng.

---

## Slide 16 — Test env: Override cho Vitest

### Setup file để mock env trong test

**`/apps/api/vitest.setup.ts`:**

```typescript
process.env.NODE_ENV = "test";
process.env.PORT = "0";                       // random port
process.env.DATABASE_URL = "postgres://test@localhost:5432/lms_test";
process.env.LOG_LEVEL = "error";              // ít noise khi test
```

**`vitest.config.ts`:**

```typescript
export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

> 💡 Test env phải set TRƯỚC khi import `env.ts` — vì validation chạy lúc import

---

## Slide 17 — Conditional config theo env

### Pattern: enable/disable feature

```typescript
// /packages/config/src/env.ts (cuối file)
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

// Sử dụng
import { env, isProduction } from "@lms/config";

// Logging level
const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProduction
    ? undefined                              // JSON logs cho prod
    : { target: "pino-pretty" },             // pretty cho dev
});

// CORS
if (env.WEB_ORIGIN) {
  app.use(cors({ origin: env.WEB_ORIGIN }));
}

// Stack trace exposure
app.use(errorHandler({
  exposeStack: !isProduction,
}));
```

---

## Slide 18 — Refinement: Conditional required

### "Required nếu production, optional nếu dev"

```typescript
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
}).superRefine((data, ctx) => {
  // Production BẮT BUỘC có API key
  if (data.NODE_ENV === "production" && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ANTHROPIC_API_KEY required in production",
      path: ["ANTHROPIC_API_KEY"],
    });
  }
});
```

**Hành vi:**

- Dev: thiếu key → OK (skip AI features)
- Production: thiếu key → app không start

---

## Slide 19 — Secrets management: Production

### KHÔNG dùng `.env` ở production

**❌ Tệ — production:**

```
my-server:
  /app/.env       ← chứa DATABASE_URL, API keys
```

→ Ai SSH vào server đều đọc được

**✅ Tốt — dùng secret manager:**

| Platform | Secret tool |
|----------|------------|
| AWS | AWS Secrets Manager, Parameter Store |
| GCP | Secret Manager |
| Azure | Key Vault |
| Vercel | Project Environment Variables (encrypted) |
| Self-hosted | HashiCorp Vault, sealed-secrets |
| Docker | Docker Swarm secrets, Kubernetes Secrets |

**Cách tích hợp:** Secret được mount vào container như env variable lúc start.

---

## Slide 20 — Khóa 1 setup: `env.ts` hoàn chỉnh

### File `/packages/config/src/env.ts`

```typescript
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Future courses — optional ở C1
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  WEB_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = (() => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
```

---

## Slide 21 — `.env.example` cuối cùng cho Khóa 1

```env
# ============================================
# AI LMS — Environment Variables Template
# Copy: cp .env.example .env  → điền giá trị
# ============================================

# === Required ===
NODE_ENV=development
PORT=3000

# === Optional (có default trong code) ===
LOG_LEVEL=info

# === Khóa 3 — Database ===
# DATABASE_URL=postgres://lms:secret@localhost:5432/lms_dev

# === Khóa 6 — Redis ===
# REDIS_URL=redis://localhost:6379

# === Khóa 5 — AI ===
# ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx

# === Khóa 4 — Frontend CORS ===
# WEB_ORIGIN=http://localhost:3001
```

> 💡 Comment out những thứ Khóa 1 chưa cần — dev không bị confuse

---

## Slide 22 — Module structure cuối cùng

### `/packages/config/`

```
packages/config/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts        ← export *
    ├── env.ts          ← env validation (video này)
    ├── concurrency.ts  ← pMap, retry (Video 11)
    └── streams.ts      ← streamCopy, streamHash (Video 12)
```

**`src/index.ts`:**

```typescript
export * from "./env";
export * from "./concurrency";
export * from "./streams";
```

**Sử dụng ở `apps/api`:**

```typescript
import { env, pMap, retry, streamCopy } from "@lms/config";
```

---

## Slide 23 — Best practices tổng kết

### 7 nguyên tắc vàng

**1. Tuyệt đối không hardcode secret** — luôn qua env

**2. `.env` KHÔNG commit, `.env.example` COMMIT**

**3. Validate env ngay khi khởi động** — fail-fast

**4. Mọi cast về đúng type qua Zod** — `z.coerce.number()`, `z.coerce.boolean()`

**5. Default value cho optional config** — giảm friction onboarding

**6. Production dùng secret manager** — không dùng `.env`

**7. Document mỗi env variable** — comment trong `.env.example`

---

## Slide 24 — Anti-patterns cần tránh

```typescript
// ❌ 1. Đọc process.env rải rác
function handler() {
  const port = process.env.PORT;  // không type, không default
}

// ❌ 2. Validate ở giữa request handler
function handler() {
  if (!process.env.API_KEY) throw new Error("missing");  // trễ
}

// ❌ 3. Cast bằng tay
const port = Number(process.env.PORT);  // NaN nếu sai

// ❌ 4. Default trong code rải rác
const port = process.env.PORT ?? "3000";
// (chỗ khác)
const port2 = process.env.PORT ?? "8080";  // 2 default khác nhau!

// ❌ 5. Throw raw Error
if (!process.env.X) throw new Error("X is required");
// (không log structured, không exit code)
```

> ✅ Tất cả giải quyết bằng 1 module `env.ts` ở trên

---

## Slide 25 — Bài tập thực hành

### 🎯 Code trong `packages/config/src/`

**Bài 1:** Tạo `env.ts` hoàn chỉnh

- Theo Slide 20
- Tạo `.env.example` theo Slide 21
- Test fail-fast: trigger từng lỗi (PORT=abc, ANTHROPIC_API_KEY=short)

**Bài 2:** Conditional validation

- ANTHROPIC_API_KEY required ở production, optional ở dev
- DATABASE_URL required ở production và test, optional ở dev

**Bài 3:** Test env trong Vitest

- Setup `vitest.setup.ts` mock env
- Viết test cho `env.ts`: invalid PORT → process exit

**Bài 4:** Helper `getRequired<T>(key)`

```typescript
// Throw đẹp nếu env không có
const dbUrl = getRequired("DATABASE_URL");
```

---

## Slide 26 — Tổng kết Video 13 + Section 3

### Bạn vừa hoàn thành Section 3 — Node.js Foundations 🎉

**4 video Section 3:**

- ✅ Video 10: Event Loop
- ✅ Video 11: Async/Await và Concurrency
- ✅ Video 12: Streams và File System
- ✅ Video 13: Biến môi trường và Configs

**Package `@lms/config` của bạn giờ có:**

- `env` — validated environment variables
- `pMap` — concurrency-limited mapping
- `retry` — exponential backoff retry
- `streamCopy`, `streamHash` — file utilities
- `isProduction`, `isDevelopment`, `isTest`

> 🚀 **Tiếp theo: Section 4 — Backend Skeleton (NestJS)**

---

<!-- _class: lead -->

# Tiếp theo: Video 14

## Khởi Tạo API Server

Giới thiệu NestJS, khái niệm Module/Controller/Service, tạo `apps/api` với `nest-cli`, viết `main.ts`, `HealthModule` và chạy `GET /health` thành công.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 14 🚀

> *"Config in env. Secrets in vault. Code in git.*
> *Never mix them up."*
