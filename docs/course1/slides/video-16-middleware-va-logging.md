---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 16: Middleware và Logging'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Middleware
# và Logging

### Khóa 1 — Video 16

**Mỗi request phải để lại dấu vết**

> Không có log = không debug được production

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **middleware là gì** trong NestJS
- ✅ Viết **`RequestIdMiddleware`** — gán `x-request-id` cho mỗi request
- ✅ Cấu hình **`nestjs-pino`** cho structured JSON logging
- ✅ Viết **`LoggingInterceptor`** — log method, path, status, duration
- ✅ Phân biệt log level: **info, warn, error, fatal**
- ✅ Hiểu **vì sao request ID** giúp debug production

> 🎯 Cuối video: mỗi request có log JSON đầy đủ + trace ID

---

## Slide 3 — Vì sao cần logging?

### Tình huống production 2h sáng

**Không có log:**

```
User: "Em mua khóa học 5 phút trước không thấy unlock"
Bạn: "...ờ để em check..."
*spend 3 hours debug, không tìm được nguyên nhân*
```

**Có log structured:**

```bash
# Search log với user email
$ grep "alice@x.com" logs.json | jq

{
  "level": "error",
  "requestId": "req-abc-123",
  "userId": "u-1",
  "path": "/api/courses/c-1/enroll",
  "error": "Stripe webhook timeout",
  "stripeEventId": "evt_xyz"
}

# → Tìm ngay nguyên nhân trong 30 giây
```

---

## Slide 4 — 3 loại "thứ chạy giữa" trong NestJS

### Đừng nhầm lẫn

| Concept | Khi nào chạy | Ví dụ dùng |
|---------|-------------|------------|
| **Middleware** | Trước route handler | Request ID, body parser, CORS |
| **Guard** | Sau middleware, trước route | Auth, permission |
| **Interceptor** | Bao quanh route handler | Logging, caching, transform |
| **Pipe** | Trước param injection | Validation (Video 17) |
| **Filter** | Khi có exception | Error formatting (Video 17) |

**Thứ tự execution:**

```
Request → Middleware → Guard → Interceptor (before) → Pipe →
   Controller → Service → ... → Interceptor (after) → Response
                        ↓ exception
                     Filter
```

---

## Slide 5 — Middleware là gì?

### Function chạy giữa request và handler

```typescript
// Express-style middleware
function middleware(req, res, next) {
  // Trước handler
  console.log(req.method, req.url);

  next();  // ← gọi handler

  // Sau next() — KHÔNG dùng (response đã gửi)
}
```

**NestJS có 2 cách viết middleware:**

1. **Function middleware** — đơn giản, không có DI
2. **Class middleware** — có DI, có thể inject service

> 💡 Khóa 1 dùng class middleware (tốt hơn cho scale)

---

## Slide 6 — RequestIdMiddleware: Vì sao cần?

### Mọi request phải có ID duy nhất

**Use case:**

```
User report bug → đưa cho support 1 ID:
  "Mã lỗi: req-abc-123"

Support search log:
  $ grep "req-abc-123" logs.json
  → ra toàn bộ chuỗi log của request đó

  → Service A, B, C đều log với cùng requestId
  → Trace toàn bộ flow ngay lập tức
```

**Pattern industry:**

- AWS CloudFront/ALB tự thêm `x-request-id`
- Datadog, Sentry tự correlate bằng `x-trace-id`
- Microservices propagate request ID qua mọi service

---

## Slide 7 — Viết RequestIdMiddleware

### File `/apps/api/src/common/middleware/request-id.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

declare global {
  namespace Express {
    interface Request {
      id: string;   // augment type
    }
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Lấy từ header (cross-service trace) hoặc generate mới
    const id = (req.headers["x-request-id"] as string) ?? randomUUID();

    req.id = id;                        // attach vào request
    res.setHeader("x-request-id", id);  // echo lại cho client

    next();
  }
}
```

---

## Slide 8 — Đăng ký middleware

### `/apps/api/src/app.module.ts`

```typescript
import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";

@Module({
  imports: [HealthModule, CoursesModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
    //                                    ^^^^^^^^^^
    //                                    áp dụng cho mọi route
  }
}
```

**Chỉ áp dụng cho 1 module:**

```typescript
consumer.apply(RequestIdMiddleware).forRoutes(CoursesController);
```

**Loại trừ route:**

```typescript
consumer
  .apply(RequestIdMiddleware)
  .exclude("health/ping")
  .forRoutes("*");
```

---

## Slide 9 — Test RequestId

### Client gửi → echo lại

```bash
# Không gửi header — server tự generate
curl -i http://localhost:3000/health

# Response headers:
# HTTP/1.1 200 OK
# x-request-id: 550e8400-e29b-41d4-a716-446655440000

# Client gửi sẵn (cross-service trace)
curl -i -H "x-request-id: my-trace-abc" http://localhost:3000/health

# Response headers:
# HTTP/1.1 200 OK
# x-request-id: my-trace-abc   ← echo lại y nguyên
```

> 💡 Frontend (Khóa 4) sẽ generate request ID + gửi qua mọi API call → trace toàn flow

---

## Slide 10 — Logging: 3 thế hệ

### Đời nào dùng đời nào

**Thế hệ 1: `console.log` thuần** ❌

```typescript
console.log("user logged in", userId, new Date());
```

→ Plain text, khó search, không có level, blocking I/O

**Thế hệ 2: Winston, Bunyan** ⚠️

```typescript
logger.info({ userId, action: "login" });
```

→ Structured nhưng setup phức tạp, slow

**Thế hệ 3: Pino** ✅ (Khóa 1 dùng)

```typescript
logger.info({ userId, action: "login" });
```

→ Structured JSON, **fastest Node logger** (5x faster than Winston)

---

## Slide 11 — Vì sao chọn `nestjs-pino`?

### So sánh top 3

| Tiêu chí | console | Winston | Pino |
|---------|---------|---------|------|
| Performance | OK | Chậm | ⚡ Rất nhanh |
| Structured | ❌ | ✅ | ✅ |
| JSON output | Manual | ✅ | ✅ |
| Pretty dev mode | ❌ | ✅ | ✅ (pino-pretty) |
| Transport (multi sink) | ❌ | ✅ | ✅ |
| Async logging | ❌ | ⚠️ | ✅ |
| Production-ready | ❌ | ✅ | ✅ |

**Pino "asynchronous"** = log không block event loop, ghi buffer định kỳ.

---

## Slide 12 — Cài và setup `nestjs-pino`

### Bước 1: Cài

```bash
pnpm --filter @lms/api add nestjs-pino pino
pnpm --filter @lms/api add -D pino-pretty
```

### Bước 2: Import vào AppModule

```typescript
import { LoggerModule } from "nestjs-pino";
import { env, isProduction } from "@lms/config";
import { randomUUID } from "node:crypto";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        genReqId: (req) => req.headers["x-request-id"] ?? randomUUID(),
        transport: isProduction
          ? undefined                              // JSON cho production
          : { target: "pino-pretty" },             // pretty cho dev
        autoLogging: true,                         // auto log mọi request
      },
    }),
    HealthModule,
    CoursesModule,
  ],
})
export class AppModule {}
```

---

## Slide 13 — Setup logger ở main.ts

### Override default logger

```typescript
// /apps/api/src/main.ts
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { env } from "@lms/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,    // buffer log đến khi Pino sẵn sàng
  });

  app.useLogger(app.get(Logger));   // ← dùng Pino
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}

bootstrap();
```

> 💡 `bufferLogs: true` quan trọng — không thì log lúc startup bị mất

---

## Slide 14 — Output log: Dev mode (pretty)

### Khi `NODE_ENV=development`

```bash
pnpm dev
```

```
[10:30:15] INFO (12345): Nest application successfully started
[10:30:18] INFO (12345): incoming request
    req: {
      "id": "550e8400-e29b-41d4",
      "method": "GET",
      "url": "/courses",
      "headers": { ... }
    }
[10:30:18] INFO (12345): request completed
    res: { "statusCode": 200 }
    responseTime: 12
```

**Lợi ích dev mode:**

- ✅ Màu sắc (level đỏ/vàng/xanh)
- ✅ Time đẹp, không phải epoch
- ✅ Indent JSON dễ đọc

---

## Slide 15 — Output log: Production (JSON)

### Khi `NODE_ENV=production`

```json
{"level":30,"time":1705320618000,"pid":12345,"req":{"id":"550e8400","method":"GET","url":"/courses"},"msg":"incoming request"}
{"level":30,"time":1705320618012,"pid":12345,"req":{"id":"550e8400"},"res":{"statusCode":200},"responseTime":12,"msg":"request completed"}
```

**Vì sao JSON?**

- ✅ Parse được bởi mọi tool: Datadog, Splunk, ELK, CloudWatch
- ✅ Search/filter dễ: `level >= 40 AND req.method = "POST"`
- ✅ Aggregate: count by status, p95 response time
- ✅ Alert: trigger nếu error rate > X

**Level numeric mapping:**

```
10 = trace, 20 = debug, 30 = info, 40 = warn, 50 = error, 60 = fatal
```

---

## Slide 16 — Log level: Khi nào dùng cái nào

### Cheat sheet

| Level | Khi nào | Ví dụ |
|-------|--------|-------|
| `trace` | Debug chi tiết nhất | Function call stack |
| `debug` | Debug normal | Variable values |
| `info` | Sự kiện thường | "User logged in" |
| `warn` | Bất thường nhưng OK | "Slow query 800ms" |
| `error` | Lỗi cần fix | "DB connection lost" |
| `fatal` | App không continue được | "Out of memory" |

**Production setting:** `LOG_LEVEL=info` — bỏ trace/debug

**Dev setting:** `LOG_LEVEL=debug` — thấy nhiều thông tin

> 💡 Đừng dùng error cho thứ không phải lỗi (vd: "user not found" trong search → info hoặc debug)

---

## Slide 17 — Interceptor: Logging mỗi request

### Vì sao cần thêm interceptor?

`nestjs-pino` đã auto-log request, nhưng cần thêm:

- ✅ Custom field: durationMs, userId (Khóa 2)
- ✅ Conditional log level (4xx → warn, 5xx → error)
- ✅ Custom format response time

### File `/apps/api/src/common/interceptors/logging.interceptor.ts`

```typescript
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(req, ctx.switchToHttp().getResponse(), start),
        error: () => this.log(req, ctx.switchToHttp().getResponse(), start, "error"),
      }),
    );
  }

  private log(req: Request, res: Response, start: number, level?: "error") {
    const status = res.statusCode;
    const lvl = level === "error" || status >= 500 ? "error"
              : status >= 400 ? "warn"
              : "info";

    this.logger[lvl]({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status,
      durationMs: Date.now() - start,
    });
  }
}
```

---

## Slide 18 — Đăng ký interceptor global

### Trong `main.ts` hoặc `AppModule`

**Cách 1: Global qua APP_INTERCEPTOR**

```typescript
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

@Module({
  imports: [/* ... */],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

**Cách 2: Global qua main.ts**

```typescript
app.useGlobalInterceptors(app.get(LoggingInterceptor));
```

> 💡 Cách 1 ưu tiên vì có DI; cách 2 đơn giản

---

## Slide 19 — Output log với interceptor

### Khi request đến

```bash
curl http://localhost:3000/courses?page=1&pageSize=2
```

**Log output (dev pretty mode):**

```
[10:30:18] INFO: {
  "requestId": "550e8400-...",
  "method": "GET",
  "path": "/courses?page=1&pageSize=2",
  "status": 200,
  "durationMs": 12
}
```

**5xx error:**

```
[10:30:25] ERROR: {
  "requestId": "abc-...",
  "method": "POST",
  "path": "/courses",
  "status": 500,
  "durationMs": 234
}
```

**4xx → warn:**

```
[10:30:30] WARN: { "status": 404, ... }
```

---

## Slide 20 — Test LoggingInterceptor

### Unit test với fake timers

```typescript
import { describe, it, expect, vi } from "vitest";
import { LoggingInterceptor } from "./logging.interceptor";
import { of } from "rxjs";

describe("LoggingInterceptor", () => {
  it("logs successful request as info", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const interceptor = new LoggingInterceptor(logger as any);

    const req = { id: "req-1", method: "GET", originalUrl: "/test" };
    const res = { statusCode: 200 };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    };
    const next = { handle: () => of("ok") };

    await new Promise(r => {
      interceptor.intercept(ctx as any, next).subscribe(() => r(0));
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        method: "GET",
        status: 200,
      }),
    );
  });
});
```

---

## Slide 21 — Inject logger vào service

### Dùng logger trong business logic

```typescript
import { Injectable } from "@nestjs/common";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";

@Injectable()
export class CoursesService {
  constructor(
    @InjectPinoLogger(CoursesService.name)
    private readonly logger: PinoLogger,
    // ... other deps
  ) {}

  async create(input: CreateCourseInput) {
    this.logger.info({ slug: input.slug }, "Creating course");

    try {
      const result = await this.repo.insert(input);
      this.logger.info({ courseId: result.id }, "Course created");
      return result;
    } catch (err) {
      this.logger.error({ err, input }, "Failed to create course");
      throw err;
    }
  }
}
```

**Pattern:** object đầu, message sau (Pino convention)

---

## Slide 22 — Không log sensitive data

### 🚨 GDPR / Privacy

**❌ Tuyệt đối không log:**

```typescript
logger.info({
  password: "secret123",      // ⛔
  creditCard: "4111-1111",    // ⛔
  apiKey: "sk-ant-xxx",       // ⛔
  token: "Bearer eyJ...",     // ⛔
});
```

**✅ Pino redact built-in:**

```typescript
LoggerModule.forRoot({
  pinoHttp: {
    redact: {
      paths: [
        "req.headers.authorization",
        "req.body.password",
        "*.password",
        "*.creditCard",
      ],
      remove: true,
    },
  },
});
```

→ Log sẽ thay value bằng `[Redacted]` hoặc xóa hẳn

---

## Slide 23 — Log volume: Không log quá tay

### Trade-off: detail vs cost

**Vấn đề:**

- Log mỗi request = OK
- Log mỗi DB query = log size x10 → tốn ổ cứng, search chậm
- Log mỗi field access = log size x1000 → app chậm

**Quy tắc thực dụng:**

| Frequency | Level | Lưu |
|-----------|-------|----|
| Mỗi request (1 line) | info | ✅ |
| Mỗi error | error | ✅ |
| Mỗi DB transaction | debug | Chỉ dev |
| Performance metric | debug + sampling | Chỉ 1% production |

**Sampling:**

```typescript
if (Math.random() < 0.01) {       // 1% sampling
  logger.debug({ slowQuery: query, duration });
}
```

---

## Slide 24 — Structured logging: Best practices

### 8 nguyên tắc

**1. Message = identifier ngắn** — `"user created"`, không phải `"User Alice (id: 123) was created in database at 10:30..."`

**2. Context = object structured** — `{ userId, email }`

**3. Error log có stack** — `logger.error({ err })` (Pino tự handle)

**4. Mỗi log line phải có `requestId`**

**5. Unit time: ms** — không mix giữa s và ms

**6. Boolean: dùng `true/false`** — không `"yes"/"no"`

**7. Đừng log inside loop nóng** — sample 1%

**8. Document quy ước field name** — `userId` chứ không khi thì `user_id` lúc `uid`

---

## Slide 25 — Log aggregation: Production tools

### Đưa log đi đâu?

| Tool | Đặc điểm |
|------|---------|
| **Datadog Logs** | Best-in-class, đắt |
| **Sentry** | Errors only, không phải logs general |
| **Better Stack** (Logtail) | Affordable, đẹp |
| **Loki + Grafana** | Open source, self-hosted |
| **AWS CloudWatch** | Mặc định nếu dùng AWS |
| **ELK** (Elasticsearch + Kibana) | Powerful, vận hành phức tạp |

**Pattern phổ biến:**

```
App stdout (JSON) → Docker logs → Fluentd / Vector → Loki / Datadog
```

> 💡 Khóa 8 sẽ setup. Khóa 1 chỉ cần log ra stdout đúng JSON format.

---

## Slide 26 — Common pitfalls

### 4 sai lầm khi log

**❌ 1. String concatenation**

```typescript
logger.info(`User ${userId} logged in at ${date}`);  // ⛔
// Không search được, không filter được
// Fix: logger.info({ userId, date }, "User logged in");
```

**❌ 2. Log error mất stack**

```typescript
catch (err) {
  logger.error(err.message);  // ⛔ mất stack trace
}
// Fix: logger.error({ err }, "Operation failed");
```

**❌ 3. Log object có circular reference**

```typescript
const req = ...;
logger.info({ req });  // ⛔ circular → crash hoặc [Object]
// Fix: chỉ log field cần thiết
```

**❌ 4. Quên log lúc skip operation**

```typescript
if (cache.has(key)) return cache.get(key);  // ⛔ không log "cache hit"
// Fix: logger.debug({ key }, "Cache hit");
```

---

## Slide 27 — Bài tập thực hành

### 🎯 Build full logging stack

**Bài 1:** Implement RequestIdMiddleware

- Theo Slide 7
- Test: client gửi `x-request-id` → echo
- Test: client không gửi → generate UUID

**Bài 2:** Setup nestjs-pino + interceptor

- Dev mode: pretty
- Production mode: JSON
- Test: status 200 → info, 4xx → warn, 5xx → error

**Bài 3:** Log redaction

- Setup redact cho `password`, `authorization`, `apiKey`
- Test: gửi POST với password → log không có password

**Bài 4:** Inject logger vào CoursesService

- Log lúc create course
- Log lúc list (debug level — chỉ thấy ở dev)
- Log error rõ ràng

---

## Slide 28 — Tổng kết Video 16

### Bạn vừa học

- ✅ Middleware vs Guard vs Interceptor vs Pipe vs Filter
- ✅ `RequestIdMiddleware` — trace ID cross-service
- ✅ `nestjs-pino` — structured JSON logging fastest
- ✅ Dev pretty mode + production JSON mode
- ✅ Log level: info/warn/error/fatal — khi nào dùng
- ✅ `LoggingInterceptor` — log mỗi request với duration
- ✅ Redact sensitive data
- ✅ Best practices structured logging

> 💪 Production của bạn giờ debug được trong 30 giây

---

<!-- _class: lead -->

# Tiếp theo: Video 17

## Nền Tảng Xử Lý Lỗi

`AppException` hierarchy, `AllExceptionsFilter`, `ZodValidationPipe`, error response contract `{ ok, error, requestId }`, không leak stack trace.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 17 🚀

> *"If it's not logged, it didn't happen."*
> *— Every SRE ever*
