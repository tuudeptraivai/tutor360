---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 14: Khởi Tạo API Server'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Khởi Tạo
# API Server

### Khóa 1 — Video 14

**NestJS — Backend framework cho production**

> Cuối video: gõ `curl http://localhost:3000/health` trả về JSON

---

## Slide 2 — Mục tiêu video này

Sau 28 phút, bạn sẽ:

- ✅ Hiểu **NestJS là gì** và vì sao chọn framework này
- ✅ Nắm 4 khái niệm cốt lõi: **Module, Controller, Service, Provider**
- ✅ Tạo **`apps/api`** với `nest-cli`
- ✅ Viết **`main.ts`**, **`app.module.ts`**, **`HealthModule`**
- ✅ Chạy `pnpm dev` và gọi **`GET /health`** thành công
- ✅ Setup script để dev nhanh + hot reload

> 🎯 Cuối video: API server chạy, có endpoint health trả JSON

---

## Slide 3 — NestJS là gì?

### "Angular cho backend"

> **NestJS** = backend framework Node.js, có structure mạnh và dependency injection

**Kiến trúc:**

- Modular — chia code thành modules nhỏ
- DI container — tự inject dependency
- Decorator-based — dùng `@Module`, `@Controller`, `@Injectable`
- Hỗ trợ cả Express và Fastify adapter

**3 layer chính:**

```
Request → Controller → Service → Repository → DB
              ↑           ↑          ↑
           HTTP layer  Business   Data access
```

---

## Slide 4 — Vì sao chọn NestJS cho LMS?

### So với Express, Fastify, Hono

| Tiêu chí | Express | Fastify | Hono | NestJS |
|---------|---------|---------|------|--------|
| Performance | OK | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Structure | ❌ Phải tự build | ⚠️ Manual | ⚠️ Manual | ✅ Built-in |
| DI | ❌ | ❌ | ❌ | ✅ |
| TypeScript first | ⚠️ | ⚠️ | ✅ | ✅ |
| Learning curve | Dễ | Trung bình | Dễ | Trung bình-Khó |
| Ecosystem | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| Scale to large team | ⚠️ | ⚠️ | ⚠️ | ✅ |

> 🎯 **Lý do chọn NestJS:** Khóa học target **fullstack senior portfolio** — structure rõ ràng, dễ scale, recruiter quen tên

---

## Slide 5 — Cài đặt NestJS

### Bước 1: Cài CLI global (optional)

```bash
pnpm add -g @nestjs/cli
nest --version   # 10.x.x
```

### Bước 2: Tạo `apps/api` bằng nest-cli

```bash
# Trong root project ai-lms
cd apps
nest new api --package-manager pnpm --strict
```

Trả lời prompts:
- Package manager: **pnpm**
- Strict mode: **Yes**

Cấu trúc sinh ra:
```
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   └── app.service.ts
├── nest-cli.json
├── package.json
└── tsconfig.json
```

---

## Slide 6 — Đổi `package.json` cho hợp monorepo

### `/apps/api/package.json`

```json
{
  "name": "@lms/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@lms/types": "workspace:*",
    "@lms/config": "workspace:*",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  }
}
```

> 💡 Quan trọng: thêm `@lms/types` và `@lms/config` với `workspace:*`

---

## Slide 7 — Cấu hình `tsconfig.json`

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

**Bắt buộc cho NestJS:**

- ✅ `experimentalDecorators: true` — cho `@Controller`, `@Injectable`...
- ✅ `emitDecoratorMetadata: true` — cho DI biết type
- ✅ `module: CommonJS` — NestJS chưa fully ESM (sẽ đổi tương lai)

---

## Slide 8 — 4 khái niệm cốt lõi của NestJS

### Hiểu 4 thứ này = hiểu NestJS

```
┌──────────────────────────────────┐
│  📦 MODULE                       │  ← gom nhóm code liên quan
│  ┌────────────────────────────┐ │
│  │  🎯 CONTROLLER             │ │  ← nhận HTTP request
│  │  - @Get, @Post, @Put...    │ │
│  └──────────┬─────────────────┘ │
│             │ inject              │
│  ┌──────────▼─────────────────┐ │
│  │  ⚙️  SERVICE / PROVIDER    │ │  ← business logic
│  │  - @Injectable             │ │
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

---

## Slide 9 — Module: Đơn vị tổ chức

### Mỗi feature = 1 module

```typescript
// /apps/api/src/modules/health/health.module.ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],  // optional — chia sẻ cho module khác
})
export class HealthModule {}
```

**4 thuộc tính chính:**

- `controllers` — Controllers thuộc module này
- `providers` — Service/Provider có thể inject
- `imports` — Module khác cần dùng
- `exports` — Provider chia sẻ ra ngoài

---

## Slide 10 — Controller: Nhận HTTP request

### Decorator-based routing

```typescript
// /apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}
  //               ↑ DI tự inject HealthService

  @Get()                          // GET /health
  check() {
    return this.health.getStatus();
  }

  @Get("ping")                    // GET /health/ping
  ping() {
    return { pong: true };
  }
}
```

> 💡 `@Controller("health")` → tất cả method có prefix `/health`

---

## Slide 11 — Service / Provider: Business logic

### Logic tách khỏi HTTP layer

```typescript
// /apps/api/src/modules/health/health.service.ts
import { Injectable } from "@nestjs/common";

export interface HealthResponse {
  status: "ok";
  uptime: number;
  version: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return {
      status: "ok",
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    };
  }
}
```

**`@Injectable()`** = "tôi có thể được inject vào nơi khác"

---

## Slide 12 — Dependency Injection: Tự động hoá

### Không cần `new` thủ công

**❌ Không có DI — code thủ công:**

```typescript
const service = new HealthService();
const controller = new HealthController(service);
// Tự build dependency tree → mệt + lặp
```

**✅ Với NestJS DI:**

```typescript
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
// NestJS tự:
// 1. Tạo HealthService instance (singleton)
// 2. Inject vào HealthController constructor
// 3. Wire mọi thứ tự động
```

> 🎯 **Lợi ích:** Test dễ (swap mock), refactor dễ, scale tốt

---

## Slide 13 — App Module: Root module

### Module gốc tổng hợp mọi thứ

```typescript
// /apps/api/src/app.module.ts
import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    HealthModule,
    // CoursesModule (Video 15)
    // sẽ thêm nữa ở Video 16, 17
  ],
})
export class AppModule {}
```

**Pattern monorepo:**

- 1 `AppModule` ở root
- Mỗi feature có module riêng (Health, Courses, Users, ...)
- AppModule import tất cả feature modules

---

## Slide 14 — Bootstrap: File `main.ts`

### Entry point của app

```typescript
// /apps/api/src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "@lms/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown — đợi current request xong khi nhận SIGINT
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  console.log(`🚀 API running on http://localhost:${env.PORT}`);
}

bootstrap();
```

**`NestFactory.create()`** sẽ:

1. Resolve toàn bộ dependency tree
2. Instantiate tất cả controllers, services
3. Setup Express adapter
4. Trả về app instance

---

## Slide 15 — Cấu trúc thư mục `apps/api/`

### Pattern recommended

```
apps/api/
├── src/
│   ├── main.ts                  ← bootstrap
│   ├── app.module.ts            ← root module
│   ├── modules/
│   │   ├── health/
│   │   │   ├── health.controller.ts
│   │   │   ├── health.service.ts
│   │   │   ├── health.module.ts
│   │   │   └── health.controller.test.ts
│   │   └── courses/             ← (Video 15)
│   │       ├── courses.controller.ts
│   │       ├── courses.service.ts
│   │       └── courses.module.ts
│   └── common/                  ← shared infra (Video 16-17)
│       ├── middleware/
│       ├── interceptors/
│       ├── filters/
│       ├── pipes/
│       └── errors/
├── nest-cli.json
├── tsconfig.json
└── package.json
```

---

## Slide 16 — `nest-cli.json`: Cấu hình CLI

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.json"
  }
}
```

**Dùng để:**

- `nest start --watch` biết source folder
- `nest build` biết tsconfig nào
- `nest g controller foo` biết generate vào đâu

---

## Slide 17 — Chạy lần đầu

### Bước 1: Cài dependencies

```bash
# Trong root project
pnpm install
```

### Bước 2: Tạo file `.env`

```bash
cp .env.example .env
# Mở .env, đảm bảo có:
# NODE_ENV=development
# PORT=3000
```

### Bước 3: Chạy dev

```bash
pnpm --filter @lms/api dev
```

### Output mong đợi
```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [InstanceLoader] AppModule dependencies initialized
[Nest] LOG [RoutesResolver] HealthController { /health }
[Nest] LOG [RouterExplorer] Mapped {/health, GET} route
🚀 API running on http://localhost:3000
```

---

## Slide 18 — Test endpoint với curl

### Gọi `GET /health`

```bash
curl http://localhost:3000/health
```

**Response:**

```json
{
  "status": "ok",
  "uptime": 12.345,
  "version": "0.1.0",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Test ping

```bash
curl http://localhost:3000/health/ping
# {"pong":true}
```

> 💡 **Tip:** Cài extension "REST Client" trong VSCode — tạo file `.http` test trực tiếp trong IDE

---

## Slide 19 — Test file `.http` trong VSCode

### File `/apps/api/requests.http`

```http
@baseUrl = http://localhost:3000

### Health check
GET {{baseUrl}}/health

### Ping
GET {{baseUrl}}/health/ping

### Custom header
GET {{baseUrl}}/health
x-request-id: test-123
```

**Cách dùng:**

- Cài extension `humao.rest-client`
- Click "Send Request" trên dòng GET
- Response hiển thị ngay trong IDE

> 🎯 Còn tiện hơn Postman, không cần app riêng

---

## Slide 20 — Unit test Controller (Vitest + NestJS)

### File `/apps/api/src/modules/health/health.controller.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("returns ok status", () => {
    const result = controller.check();
    expect(result.status).toBe("ok");
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

---

## Slide 21 — Hot reload với `nest start --watch`

### Live reload khi đổi code

**Khi bạn sửa file → NestJS tự:**

1. Detect file change
2. Compile lại
3. Restart server
4. Connection HTTP cũ bị disconnect → reconnect mới

```bash
pnpm --filter @lms/api dev
# [10:30:01] File change detected. Starting incremental compilation...
# [10:30:01] Found 0 errors. Watching for file changes.
# [Nest] LOG ...
```

**Hot reload < 1s** cho project nhỏ → workflow rất mượt

> 💡 Nếu cần debug — chạy `nest start --debug --watch` để bật Node inspector

---

## Slide 22 — Inject `@lms/config` env vào NestJS

### Dùng `env` từ package shared

```typescript
// /apps/api/src/main.ts
import { env, isProduction } from "@lms/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: !isProduction,  // dev: pretty, prod: structured
  });

  // CORS chỉ khi có WEB_ORIGIN (sẽ set ở Khóa 4)
  if (env.WEB_ORIGIN) {
    app.enableCors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    });
  }

  await app.listen(env.PORT);
}

bootstrap();
```

> 💡 `env` đã được validate fail-fast ở Video 13 → nếu thiếu env → app không start

---

## Slide 23 — Graceful shutdown

### Nhận SIGINT/SIGTERM và cleanup đúng cách

```typescript
import { NestFactory } from "@nestjs/core";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Bật shutdown hooks
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}
```

**Khi user Ctrl+C (SIGINT) hoặc Docker stop (SIGTERM):**

```
1. Nhận signal
2. Đóng HTTP server (không nhận request mới)
3. Đợi current requests hoàn tất (timeout default 30s)
4. Gọi onModuleDestroy() của mọi service
5. Đóng DB connection, Redis connection
6. Process exit
```

> 💡 Production cần — nếu không request có thể bị cut giữa chừng

---

## Slide 24 — Tích hợp `nestjs-pino` logger

### Sẽ làm đầy đủ ở Video 16

**Cài (preview):**

```bash
pnpm --filter @lms/api add nestjs-pino pino-pretty
```

**Sử dụng:**

```typescript
import { LoggerModule } from "nestjs-pino";
import { env, isProduction } from "@lms/config";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        transport: isProduction ? undefined : { target: "pino-pretty" },
      },
    }),
    HealthModule,
  ],
})
export class AppModule {}
```

**Trong main.ts:**

```typescript
app.useLogger(app.get(Logger));
```

---

## Slide 25 — So với Express trần: NestJS lợi gì?

### Cùng endpoint `GET /health`

**Express thuần — 1 file:**

```typescript
import express from "express";
const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.listen(3000);
```

→ 5 dòng. Đơn giản nhưng không có structure.

**NestJS — 4 file (HealthModule):**

→ 30+ dòng. Phức tạp hơn nhưng:

- ✅ Test dễ (mock service)
- ✅ Scale dễ (10 module song song hoạt động)
- ✅ DI tự động
- ✅ Middleware/Interceptor/Filter rõ ràng

> 💡 Trade-off: phức tạp ban đầu → đơn giản về sau khi project lớn

---

## Slide 26 — Common pitfalls khi mới học NestJS

### 3 lỗi phổ biến

**❌ 1. Quên `@Injectable()` cho service**

```typescript
class HealthService { /* ... */ }  // ⛔ NestJS không inject được
// Fix: thêm @Injectable() trên class
```

**❌ 2. Quên list service vào `providers`**

```typescript
@Module({
  controllers: [HealthController],
  // providers: [HealthService] ← QUÊN!
})
// Lỗi runtime: "Nest can't resolve dependencies of HealthController"
```

**❌ 3. Circular dependency giữa modules**

```typescript
// HealthModule imports UsersModule
// UsersModule imports HealthModule
// → Nest báo lỗi circular dep
// Fix: dùng forwardRef() hoặc tách module thứ 3
```

---

## Slide 27 — Bài tập thực hành

### 🎯 Build từng bước

**Bài 1:** Setup hoàn chỉnh

- Tạo `apps/api` theo Slide 5-7
- Tạo `HealthModule` đầy đủ
- Chạy `pnpm dev` thành công
- Gõ `curl localhost:3000/health` thấy JSON

**Bài 2:** Thêm endpoint mới

- `GET /health/uptime` — chỉ trả uptime
- `GET /health/version` — chỉ trả version
- Refactor `HealthService` để có method riêng cho từng cái

**Bài 3:** Viết unit test

- Test `HealthService.getStatus()` trả đủ field
- Test `HealthController.check()` gọi service đúng

**Bài 4:** Thử graceful shutdown

- Chạy `pnpm dev`, Ctrl+C
- Quan sát log shutdown sequence

---

## Slide 28 — Tổng kết Video 14

### Bạn vừa học

- ✅ NestJS là gì, vì sao chọn cho LMS
- ✅ 4 khái niệm: Module, Controller, Service, Provider
- ✅ Dependency Injection cơ bản
- ✅ Tạo `apps/api` với nest-cli
- ✅ Viết `HealthModule` đầy đủ
- ✅ `main.ts` bootstrap + graceful shutdown
- ✅ Hot reload với `nest start --watch`
- ✅ Test với `Test.createTestingModule`

> 💪 API server đầu tiên của bạn đang chạy!

---

<!-- _class: lead -->

# Tiếp theo: Video 15

## Cơ Bản về REST API

REST principles, HTTP methods, status codes, viết `CoursesController` với `GET /courses` và `POST /courses`, pagination, Repository pattern.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 15 🚀

> *"Make it work, make it clean, make it scale."*
