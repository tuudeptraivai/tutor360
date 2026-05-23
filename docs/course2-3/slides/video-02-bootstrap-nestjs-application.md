---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 2: Bootstrap NestJS Application'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Bootstrap
# NestJS Application

### Khóa 2-3 — Video 2

**CORS · Helmet · Versioning · Graceful Shutdown**

> Setup `apps/api` cho Tutor365 đúng chuẩn production từ ngày đầu

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **lifecycle khởi tạo** một NestJS app production
- ✅ Cấu hình **CORS** với env-whitelist (không `*`)
- ✅ Bật **helmet** cho HTTP security headers
- ✅ Setup **URI versioning** (`/v1/courses` thay `/courses`)
- ✅ Implement **graceful shutdown** đúng cách (SIGTERM)
- ✅ Apply **global Zod pipe** + **global exception filter**
- ✅ Đăng ký **logger pino** với requestId qua `nestjs-cls`

> 🎯 Cuối video: `pnpm dev` lên server lành mạnh, log JSON đẹp

---

## Slide 3 — Một NestJS app production khác gì hello-world?

### Hello-world vs Production

```ts
// Hello-world — không an toàn
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
```

**Thiếu:**

- ❌ Không bật CORS → frontend C4 không gọi được
- ❌ Không helmet → headers default leak version, không CSP
- ❌ Không global pipe → mỗi controller phải khai báo
- ❌ Không graceful shutdown → kill -9 mất request đang xử lý
- ❌ Không structured log → grep production khó

Khoá này build **production-ready** từ V02.

---

## Slide 4 — File `apps/api/src/main.ts` đầy đủ

```ts
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

---

## Slide 5 — CORS: Vì sao KHÔNG được `origin: '*'`

### CORS với credentials không tương thích `*`

```ts
// ❌ XẤU
app.enableCors({ origin: '*', credentials: true });
// → Browser TỪ CHỐI vì spec: credentials cần origin cụ thể

// ✅ TỐT
app.enableCors({
  origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
  credentials: true,
});
```

**`.env`:**

```
CORS_ORIGINS=http://localhost:5173,https://tutor365.vn,https://admin.tutor365.vn
```

> 💡 **Whitelist từ env**: dev/staging/prod có domain khác nhau, không hardcode

---

## Slide 6 — Helmet: HTTP security headers tự động

### Helmet thêm 12 header bảo vệ

```ts
import helmet from 'helmet';
app.use(helmet());
```

**Headers helmet bật mặc định:**

| Header | Tác dụng |
|--------|----------|
| `Content-Security-Policy` | Chặn XSS injection script |
| `Strict-Transport-Security` | Force HTTPS |
| `X-Frame-Options: DENY` | Chống clickjacking iframe |
| `X-Content-Type-Options` | Chặn MIME-sniff |
| `Referrer-Policy` | Không leak URL referrer |
| `X-Download-Options` | IE block download exec |

> ⚠️ Khi nhúng Jitsi iframe → cần whitelist `meet.jit.si` trong CSP. Sẽ làm ở Section 11.

---

## Slide 7 — URI Versioning: Vì sao `/v1/...`?

### Versioning từ ngày đầu tránh breaking change

```ts
import { VersioningType } from '@nestjs/common';
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

**Endpoint thực tế:**

```
GET  /v1/courses
POST /v1/auth/login
GET  /v1/sessions/:id/join
```

**Khi có breaking change → release v2 song song v1:**

```ts
@Controller({ path: 'courses', version: ['1', '2'] })
// hoặc
@Version('2')
@Get(':id')
findOneV2() { /* schema mới */ }
```

> 💡 Mobile app phiên bản cũ vẫn dùng `/v1`, web mới dùng `/v2` — không force upgrade

---

## Slide 8 — Graceful Shutdown: Bài học production

### Vì sao `kill -9` xấu?

```
Client gửi POST /orders → server xử lý 200ms
Lúc 100ms: deployment new version → kill -9 old container
→ DB connection chưa close
→ VNPay HTTP request chưa hoàn tất
→ Order ở trạng thái LƠ LỬNG: payment đã trừ, order chưa update
```

**`enableShutdownHooks` lắng nghe SIGTERM:**

```ts
app.enableShutdownHooks();
```

NestJS sẽ:

1. Stop accept request mới
2. Chờ request đang xử lý xong (timeout default 5s)
3. Gọi `OnModuleDestroy()` của mọi provider
4. Close DB pool, HTTP client, queue connection
5. Exit code 0

---

## Slide 9 — Implement OnModuleDestroy cho Prisma

```ts
// apps/api/src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

> 💡 **Test thử:** chạy `pnpm dev`, mở 1 request lâu (sleep 3s), gửi `kill -TERM <pid>` → server đợi xong mới shutdown.

---

## Slide 10 — Global Pipe: Validate mọi input

### Apply 1 lần, hiệu lực toàn app

```ts
// main.ts
app.useGlobalPipes(new ZodValidationPipe());
```

**Trước (mỗi controller phải khai báo):**

```ts
@Post()
create(@Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput) {}
```

**Sau (controller gọn):**

```ts
@Post()
create(@Body() body: CreateCourseInput) {}
// Pipe đọc metadata @ZodSchema(CreateCourseDto) → tự validate
```

> 💡 Implement ZodValidationPipe đầy đủ ở Video 4

---

## Slide 11 — Global Exception Filter

### Catch mọi lỗi → JSON format thống nhất

```ts
// common/filters/global-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    if (exception instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', details: exception.flatten() },
        requestId: req.id,
      });
    }
    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json({
        ok: false,
        error: { code: 'HTTP_ERROR', message: exception.message },
        requestId: req.id,
      });
    }
    this.logger.error(exception);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL' },
      requestId: req.id,
    });
  }
}
```

---

## Slide 12 — Logger: nestjs-pino structured JSON

### Vì sao không `console.log`?

```ts
// AppModule
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      },
    }),
  ],
})
export class AppModule {}
```

**Output dev (pretty):**

```
[12:34:56] INFO (api/1234): request completed
    req: { id: "abc-123", method: "GET", url: "/v1/courses" }
    res: { statusCode: 200 }
    responseTime: 18
```

---

## Slide 13 — nestjs-cls: Request context xuyên suốt

### Vấn đề: làm sao service biết requestId?

```ts
// Without cls
@Injectable()
class CoursesService {
  list() {
    this.logger.info('listing');  // ❌ không biết request nào
  }
}
```

**Giải pháp `nestjs-cls` (Continuation-Local Storage):**

```ts
import { ClsModule, ClsService } from 'nestjs-cls';

ClsModule.forRoot({
  middleware: { mount: true, generateId: true, idGenerator: () => randomUUID() },
});
```

**Service truy cập:**

```ts
constructor(private cls: ClsService) {}
list() {
  const reqId = this.cls.getId();
  this.logger.info({ reqId }, 'listing');
}
```

---

## Slide 14 — Health check endpoint

### Mỗi service cần `/health` cho load balancer

```ts
// apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let db = 'unknown';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db, ts: new Date().toISOString() };
  }
}
```

> 💡 `VERSION_NEUTRAL` → endpoint không có `/v1` prefix → load balancer luôn gọi `/health`

---

## Slide 15 — Cấu hình env variables

### `apps/api/.env.example`

```
NODE_ENV=development
PORT=3000

# CORS
CORS_ORIGINS=http://localhost:5173

# Logger
LOG_LEVEL=info

# Database (sẽ dùng từ Section 17)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tutor365

# JWT (sẽ dùng Section 2)
JWT_ACCESS_SECRET=change-me-in-production
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=change-me-too
JWT_REFRESH_TTL=30d

# SMTP dev (mailpit)
SMTP_HOST=localhost
SMTP_PORT=1025

# VNPay sandbox (Section 13)
VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_RETURN_URL=http://localhost:3000/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/v1/payments/vnpay/ipn
```

---

## Slide 16 — Validate env với Zod khi boot

### Crash sớm nếu env sai

```ts
// apps/api/src/config/env.ts
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default(''),
});

export const env = Env.parse(process.env);
```

> 💡 **Fail-fast philosophy:** nếu thiếu `JWT_ACCESS_SECRET` → app crash ngay khi start, không chạy tiếp gây lỗi mơ hồ khi user signup.

---

## Slide 17 — AppModule: Gom mọi module lại

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoursesModule } from './modules/courses/courses.module';
// ... thêm module khi build dần

@Module({
  imports: [
    LoggerModule.forRoot({ /* ... */ }),
    ClsModule.forRoot({ middleware: { mount: true, generateId: true } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    CoursesModule,
  ],
})
export class AppModule {}
```

---

## Slide 18 — Bật chế độ swagger sớm

### Khoá 2-3 dùng `/api/docs` cho ~60 endpoint

```ts
// main.ts (thêm sau enableVersioning)
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

if (process.env.NODE_ENV !== 'production') {
  const config = new DocumentBuilder()
    .setTitle('Tutor365 API')
    .setDescription('Backend cho marketplace + live tutoring')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);
}
```

> 💡 Production tắt swagger — không expose schema endpoint. Dev/staging vẫn bật để test.

---

## Slide 19 — Verify: chạy thử và kiểm tra

```bash
pnpm --filter @tutor365/api dev
```

**Test endpoint:**

```bash
curl http://localhost:3000/health
# { "status": "ok", "db": "up", "ts": "..." }

curl http://localhost:3000/v1/courses
# [] hoặc lỗi 404 (chưa có module)

curl -H "Origin: http://malicious.com" http://localhost:3000/v1/courses -I
# Không có Access-Control-Allow-Origin → browser block
```

**Test graceful shutdown:**

```bash
pnpm dev &
PID=$!
sleep 2
kill -TERM $PID
# → log: "Shutting down ... Prisma disconnected ... bye"
```

---

## Slide 20 — Anti-patterns cần tránh

```ts
// ❌ enableCors trước module load
app.enableCors();
await app.init();  // init chạy module có middleware tự — conflict

// ❌ Listen trước khi setup hook
await app.listen(3000);
app.enableShutdownHooks();  // không hiệu lực

// ❌ Đọc env trực tiếp khắp nơi
process.env.JWT_SECRET  // ← không validate, dễ undefined

// ❌ Console.log thay cho logger
console.log('user logged in');
// → production log mất, không có requestId, không level

// ❌ Không có /health
// → Load balancer không biết container có sống không
// → traffic vẫn route đến container đã chết
```

---

## Slide 21 — Bài tập thực hành

### 🎯 Setup chuẩn

**Bài 1:** Tạo file `main.ts` đầy đủ như slide 4. Verify:

- `curl /health` trả `{ status, db, ts }`
- `curl -X OPTIONS /v1/courses -H "Origin: ..."` trả CORS đúng

**Bài 2:** Tạo file `config/env.ts` với Zod schema. Cố ý xoá `DATABASE_URL` trong `.env` → server fail-fast với message rõ.

**Bài 3:** Thêm `/health` trả thêm field `uptime: process.uptime()`.

**Bài 4:** Bật `pino-pretty` ở dev, JSON raw ở production. Test bằng:

```bash
NODE_ENV=production pnpm dev
# log dạng JSON 1 dòng
```

**Bài 5:** Test graceful shutdown bằng `kill -TERM` → đảm bảo Prisma disconnect.

---

## Slide 22 — Tổng kết Video 2

### Bạn vừa setup

- ✅ `main.ts` với 10 dòng cấu hình production-ready
- ✅ CORS env-whitelist (không `*` với credentials)
- ✅ Helmet 12 security headers tự động
- ✅ URI versioning `/v1/...`
- ✅ Graceful shutdown (SIGTERM → drain → exit)
- ✅ Global ZodPipe + GlobalExceptionFilter
- ✅ nestjs-pino + nestjs-cls cho requestId
- ✅ ThrottlerModule rate limit basic
- ✅ Swagger `/api/docs` (chỉ dev)
- ✅ Health check `/health`

> 💪 Skeleton này dùng đến hết khoá — không cần đụng lại

---

<!-- _class: lead -->

# Tiếp theo: Video 3

## Request Lifecycle

Đi qua từng bước request: middleware → guard → interceptor → pipe → controller → filter.
Biết chỗ nào nhúng cái gì là kỹ năng senior.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 3 🚀

> *"Production-readiness is not a feature. It's a mindset."*
