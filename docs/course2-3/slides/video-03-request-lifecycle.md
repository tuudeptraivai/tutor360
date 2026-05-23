---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 3: NestJS Request Lifecycle'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Request Lifecycle
# trong NestJS

### Khóa 2-3 — Video 3

**Middleware → Guard → Interceptor → Pipe → Controller → Filter**

> Biết chỗ nào nhúng cái gì = kỹ năng senior

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Vẽ được **sơ đồ lifecycle** request từ vào → ra
- ✅ Phân biệt **5 layer**: middleware, guard, interceptor, pipe, filter
- ✅ Biết **khi nào dùng cái nào** — không nhầm pipe với guard
- ✅ Implement **`RequestIdMiddleware`** + **`LoggingInterceptor`**
- ✅ Hiểu **execution order** — guard chạy trước hay pipe?
- ✅ Áp dụng vào **auth flow Tutor365** (preview)

> 🎯 Cuối video: bạn debug được "vì sao validate fail không thấy log"

---

## Slide 3 — Toàn cảnh: 1 request đi qua những đâu?

```
HTTP request đến
       ↓
┌─────────────────────────────────────────┐
│ 1. MIDDLEWARE (Express layer)            │
│    - helmet, cors, body-parser           │
│    - RequestIdMiddleware                 │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│ 2. GUARD                                 │
│    - JwtAuthGuard, RoleGuard             │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│ 3. INTERCEPTOR (before)                  │
│    - LoggingInterceptor.intercept()      │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│ 4. PIPE                                  │
│    - ZodValidationPipe → validate body   │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│ 5. CONTROLLER → SERVICE → REPOSITORY     │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│ 6. INTERCEPTOR (after)                   │
│    - log "request completed in 18ms"     │
└──────────────────┬──────────────────────┘
                   ↓
            HTTP response
            
   ⚠ Nếu ANY layer throw → FILTER catch
```

---

## Slide 4 — Middleware: Express layer

### Chạy trước cả NestJS DI container

```ts
// common/middleware/request-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    const id = (req.headers['x-request-id'] as string) ?? randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
```

**Đăng ký:**

```ts
// app.module.ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

> 💡 Middleware **không** có quyền truy cập DI provider tự do — chỉ inject qua `@Injectable`

---

## Slide 5 — Guard: Cho phép hay từ chối?

### Trả `true/false` (hoặc throw)

```ts
// common/guards/jwt-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization ?? '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    try {
      req.user = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

**Apply:**

```ts
@UseGuards(JwtAuthGuard)
@Controller('courses')
class CoursesController {}
```

---

## Slide 6 — Role Guard cho RBAC

### Decorator `@Roles` + Guard đọc metadata

```ts
// decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const Roles = (...roles: Array<'admin' | 'tutor' | 'student'>) =>
  SetMetadata('roles', roles);

// guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<string[]>('roles', ctx.getHandler());
    if (!required) return true;
    const user = ctx.switchToHttp().getRequest().user;
    return required.includes(user?.role);
  }
}
```

**Apply:**

```ts
@Roles('admin')
@Post('approve')
approveCourse() { /* chỉ Hanah gọi được */ }
```

---

## Slide 7 — Interceptor: Bao quanh handler

### Trước + sau, async với RxJS

```ts
// interceptors/logging.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${req.method} ${req.url} ${Date.now() - start}ms`),
        error: (e) => this.logger.error(`${req.method} ${req.url} FAIL ${e.message}`),
      }),
    );
  }
}
```

**Khác middleware:** interceptor có quyền **biến đổi response** sau khi controller trả.

---

## Slide 8 — Pipe: Validate + Transform input

### Chuyên trị input

```ts
// pipes/zod-validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
```

**Apply:**

```ts
@Post()
create(@Body(new ZodValidationPipe(CreateCourseDto)) body: CreateCourseInput) {}
```

> 💡 Pipe có thể **transform** giá trị: `'1' → 1` qua `z.coerce.number()`

---

## Slide 9 — Filter: Catch exception → JSON format

### Chạy CUỐI cùng nếu bất kỳ layer throw

```ts
// filters/global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    res.status(status).json({
      ok: false,
      error: this.serialize(exception),
      requestId: req.id,
      path: req.url,
    });
  }
}
```

**Đặc tả:** Filter **bắt** mọi exception → response thống nhất.

> 💡 Khoá 1 đã làm — V03 chỉ refresh + tích hợp `nestjs-cls`

---

## Slide 10 — Execution order: Câu hỏi đánh đố senior

### Thứ tự THỰC SỰ

```
1. Middleware                  (req chưa vào NestJS)
2. Guard                       (auth check)
3. Interceptor.before          (RxJS upstream)
4. Pipe                        (validate body/query/param)
5. Controller handler          (business)
6. Service / Repository
7. Interceptor.after           (RxJS downstream tap)
8. Filter (nếu throw bất kỳ chỗ nào trên)
```

**Câu hỏi mẹo:**

> ❓ Nếu body sai schema → log "request received" có chạy không?

✅ **Có** — interceptor chạy TRƯỚC pipe. Pipe throw → filter catch → vẫn có log "request fail".

---

## Slide 11 — Sai lầm phổ biến: nhầm pipe với guard

### Ví dụ thực tế

```ts
// ❌ Dùng pipe để check auth
@Injectable()
export class AuthCheckPipe implements PipeTransform {
  transform(value: any) {
    if (!value.token) throw new UnauthorizedException();
    return value;
  }
}
// → Pipe không có quyền nhìn header, không nên check auth
```

```ts
// ✅ Dùng guard cho auth, pipe cho validate
@UseGuards(JwtAuthGuard)
@Post()
create(@Body() body: CreateCourseInput) {}
// → Guard kiểm tra header authorization
// → Pipe validate body schema
```

**Nguyên tắc:**

| Mục đích | Layer đúng |
|----------|------------|
| Auth | Guard |
| Validate input | Pipe |
| Log request | Interceptor |
| Set requestId | Middleware |
| Format response error | Filter |

---

## Slide 12 — Apply globally vs per-route

### 4 cách áp dụng

```ts
// 1. Per-handler
@UseGuards(JwtAuthGuard)
@Post()
create() {}

// 2. Per-controller
@UseGuards(JwtAuthGuard)
@Controller('courses')
class CoursesController {}

// 3. Per-module (global trong module này)
{ provide: APP_GUARD, useClass: JwtAuthGuard }

// 4. Global (main.ts)
app.useGlobalGuards(new JwtAuthGuard(...));
```

**Trade-off APP_GUARD vs useGlobalGuards:**

- `APP_GUARD` → DI inject được dependency
- `useGlobalGuards` → instance new, tự tay inject

> 💡 Tutor365 dùng **APP_GUARD** cho JWT guard vì cần inject JwtService

---

## Slide 13 — `@Public()`: Cho phép một endpoint bỏ qua global guard

### Pattern phổ biến

```ts
// decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// guards/jwt-auth.guard.ts (sửa)
canActivate(ctx) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    ctx.getHandler(),
    ctx.getClass(),
  ]);
  if (isPublic) return true;
  // ... verify token
}
```

**Sử dụng:**

```ts
@Public()
@Post('login')
login() {}  // bypass JWT guard
```

---

## Slide 14 — Lifecycle áp dụng vào login flow Tutor365

### Trace 1 request `POST /v1/auth/login`

```
1. Middleware RequestIdMiddleware       → req.id = "abc"
2. Guard JwtAuthGuard                    → @Public → skip
3. Guard RolesGuard                      → không có @Roles → skip
4. Interceptor LoggingInterceptor        → log "POST /v1/auth/login"
5. Pipe ZodValidationPipe(LoginDto)      → { email, password }
6. AuthController.login(body)
7. AuthService.login(body)
   → UsersRepo.findByEmail
   → bcrypt.compare
   → JwtService.signAsync(access + refresh)
8. Response { accessToken, refreshToken }
9. Interceptor logs "POST /v1/auth/login 200 in 35ms"
```

---

## Slide 15 — Khi login fail: trace với filter

```
1. Middleware ✓
2. Guard ✓ (public)
3. Interceptor.before ✓
4. Pipe ✓
5. AuthService.login
   → bcrypt.compare → false
   → throw UnauthorizedException('Invalid credentials')
6. Interceptor.after KHÔNG chạy (vì throw)
7. GlobalExceptionFilter.catch
   → status 401
   → JSON { ok: false, error: { code: 'HTTP_ERROR', message: '...' }, requestId: 'abc' }
```

> 💡 Vì sao `requestId` xuất hiện trong response error? Vì middleware set `req.id` rồi mới throw → filter đọc lại.

---

## Slide 16 — Order of guards: Multiple guards

### Khi có nhiều guard

```ts
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles('admin')
@Post('users/:id/ban')
banUser() {}
```

**Order:** chạy theo array — `JwtAuth` → `Roles` → `Throttler`.

**Bất kỳ guard nào return `false` hoặc throw → DỪNG.**

> 💡 Đặt **rẻ trước** (auth header check) → **đắt sau** (DB query throttle).

---

## Slide 17 — Một interceptor hữu ích: TransformInterceptor

### Wrap mọi response thành `{ ok, data }`

```ts
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { ok: true; data: T }> {
  intercept(ctx: ExecutionContext, next: CallHandler<T>) {
    return next.handle().pipe(map((data) => ({ ok: true, data })));
  }
}
```

**Trước:**

```json
{ "id": "...", "title": "..." }
```

**Sau (có TransformInterceptor):**

```json
{ "ok": true, "data": { "id": "...", "title": "..." } }
```

**Filter trả error cũng có `ok: false`:**

```json
{ "ok": false, "error": {...}, "requestId": "..." }
```

> 💡 Frontend C4 luôn check `ok` trước → predictable.

---

## Slide 18 — Khi nào KHÔNG dùng global pipe?

### Tránh validate nội bộ

```ts
// Service nội bộ
@Injectable()
class CoursesService {
  async create(input: CreateCourseInput) {
    // input đã validate ở pipe — KHÔNG validate lại ở đây
  }

  // Internal helper
  async _recalcStats(courseId: string) {
    // Internal call — không qua pipe
  }
}
```

**Nguyên tắc:** Pipe chỉ chạy ở **boundary** (controller). Service nội bộ assume input đã clean.

---

## Slide 19 — Debug lifecycle: bật log từng layer

### Khi không hiểu vì sao request fail

```ts
// Tạm thời thêm log từng layer
@Injectable()
class JwtAuthGuard {
  canActivate(ctx) {
    console.log('[guard] enter');
    // ...
    console.log('[guard] result', result);
    return result;
  }
}

@Injectable()
class ZodValidationPipe {
  transform(value) {
    console.log('[pipe] input', value);
    // ...
  }
}
```

**Thấy log dạng:**

```
[middleware] req.id set
[guard] enter
[guard] result true
[interceptor] before
[pipe] input { email: '...' }
[handler] login called
[interceptor] after 35ms
```

> 💡 Nếu thấy `[guard] enter` mà không thấy `[pipe]` → pipe chưa đến → guard reject.

---

## Slide 20 — Anti-pattern

```ts
// ❌ Validate body trong service
async create(input: any) {
  if (!input.title) throw new Error('title required');
  // → boilerplate, không reuse được ở GET, PATCH
}

// ❌ Throw plain Error
throw new Error('not found');
// → Filter catch → 500. Phải throw NotFoundException → 404.

// ❌ Try/catch trong controller
@Post()
async create(@Body() body) {
  try {
    return await this.service.create(body);
  } catch (e) {
    return { ok: false, error: e.message };  // ❌ bypass filter
  }
}

// ❌ Middleware đọc body trước pipe
// Express body-parser đã chạy → middleware đọc được req.body
// Nhưng đừng validate ở đây — pipe làm rồi
```

---

## Slide 21 — Bài tập thực hành

### 🎯 Build & verify

**Bài 1:** Implement `RequestIdMiddleware` + verify header `X-Request-Id` xuất hiện trong response.

**Bài 2:** Implement `LoggingInterceptor` log dạng:
```
POST /v1/courses 201 in 18ms (req=abc-123)
```

**Bài 3:** Tạo `@Public()` decorator + sửa JwtAuthGuard để bypass khi gặp.

**Bài 4:** Cố ý throw `new Error('boom')` trong service → verify filter catch trả 500 với `requestId`.

**Bài 5:** Thêm guard thứ 2 `IpWhitelistGuard` chỉ accept request từ `127.0.0.1` cho endpoint `/v1/admin/*`. Verify order: JWT → IpWhitelist.

---

## Slide 22 — Tổng kết Video 3

### Bạn vừa học

- ✅ Sơ đồ lifecycle 6 layer: Middleware → Guard → Interceptor → Pipe → Controller → Filter
- ✅ Phân biệt rõ "khi nào dùng cái nào"
- ✅ Implement RequestIdMiddleware, LoggingInterceptor, GlobalExceptionFilter
- ✅ Apply global vs per-route (APP_GUARD vs useGlobalGuards)
- ✅ Pattern `@Public()` bypass guard
- ✅ Debug lifecycle bằng log từng layer

> 💪 **Senior engineer = biết chỗ nào nhúng cái gì**

---

<!-- _class: lead -->

# Tiếp theo: Video 4

## Zod Validation Pipeline + Pipe Decorators

Implement đầy đủ ZodValidationPipe, kết hợp với metadata reflection, validate body / query / param khác nhau.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 4 🚀

> *"Make it work, make it right, make it fast — in that order."*
> *— Kent Beck*
