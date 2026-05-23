---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 7: Login + bcrypt + JWT Access Token'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Login
# + JWT Access Token

### Khóa 2-3 — Video 7

**bcrypt.compare · `@nestjs/jwt` · TTL 15 phút**

> Access token ngắn hạn = security trade-off đáng giá

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **`POST /v1/auth/login`** đầy đủ
- ✅ Compare password bằng **bcrypt.compare** constant-time
- ✅ Setup **`@nestjs/jwt`** với secret từ env
- ✅ Sign **access token** TTL 15 phút
- ✅ Return shape **`{ accessToken, refreshToken, user }`**
- ✅ Implement **`@CurrentUser()` decorator** lấy user từ JWT
- ✅ Test endpoint protected bằng curl

> 🎯 Cuối video: login → nhận token → dùng token gọi `/v1/me`

---

## Slide 3 — Vì sao JWT thay session cookie?

### Trade-off

| Cookie session | JWT |
|----------------|-----|
| State ở server (Redis) | State trong token |
| Logout = xoá Redis key | Logout = client xoá token |
| CSRF protection cần thiết | Bearer header → không CSRF |
| Khó cho mobile app | Mobile app dễ store |
| Scale ngang phải share Redis | Stateless — bất kỳ server verify |

**Quyết định Tutor365:**

- ✅ **JWT access token** (15 phút TTL) — stateless
- ✅ **JWT refresh token** (30 ngày) — lưu hash ở DB (whitelist) → revoke được

---

## Slide 4 — JWT cấu trúc

```
header.payload.signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9      ← header (base64url JSON)
.eyJzdWIiOiJ1LTEyMyIsInJvbGUiOiJzdHVkZW50IiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDA5MDB9   ← payload
.HMAC_SHA256(header.payload, JWT_SECRET)   ← signature
```

**Payload chuẩn:**

```ts
{
  sub: 'u-uuid-123',       // subject = userId
  role: 'tutor',
  iat: 1700000000,         // issued at
  exp: 1700000900,         // expire (15 phút sau)
}
```

> 💡 **Đừng nhét personal data vào payload** — JWT base64, không phải mã hoá.

---

## Slide 5 — Setup `@nestjs/jwt`

```bash
pnpm --filter @tutor365/api add @nestjs/jwt
```

**Module:**

```ts
// modules/auth/auth.module.ts
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../config/env';

@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: env.JWT_ACCESS_TTL }, // "15m"
    }),
  ],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
```

> 💡 Secret tối thiểu 32 ký tự ngẫu nhiên. Dev: `openssl rand -hex 32`.

---

## Slide 6 — AuthService.login

```ts
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private users: UserRepository,
    private jwt: JwtService,
  ) {}

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await this.users.findByEmail(input.email);
    // Generic error — không leak email tồn tại
    const GENERIC_ERR = new UnauthorizedException('Email hoặc mật khẩu không đúng');

    if (!user) throw GENERIC_ERR;
    if (user.status !== 'active') {
      throw new UnauthorizedException('Tài khoản chưa được kích hoạt');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw GENERIC_ERR;

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
    });

    const refreshToken = await this.issueRefreshToken(user.id);  // Section 8

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }
}
```

---

## Slide 7 — LoginDto schema

```ts
// modules/auth/dto/login.dto.ts
import { z } from 'zod';

export const LoginDto = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginDto>;
```

> 💡 Không validate `min(8)` ở login — vì user cũ có thể có password ngắn lịch sử. Validate ở **signup** đủ rồi.

---

## Slide 8 — `toPublicUser` mapper

```ts
// modules/auth/auth.mapper.ts
import type { User } from '@prisma/client';

export type PublicUser = {
  id: string;
  email: string;
  role: 'admin' | 'tutor' | 'student';
  fullName: string;
  emailVerifiedAt: Date | null;
};

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    fullName: u.fullName,
    emailVerifiedAt: u.emailVerifiedAt,
  };
}
```

**Lưu ý:** TUYỆT ĐỐI không trả `passwordHash`, `id` token, audit fields.

---

## Slide 9 — Controller endpoint

```ts
// modules/auth/auth.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ZodBody } from '../../common/decorators/zod-body.decorator';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@ZodBody(LoginDto) body: LoginInput) {
    return this.auth.login(body);
  }
}
```

**Test:**

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tu@x.com","password":"Pass1234"}'
# { accessToken, refreshToken, user: { id, email, role, ... } }
```

---

## Slide 10 — JwtAuthGuard đầy đủ

```ts
// common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization ?? '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = payload;  // { sub, role, iat, exp }
      return true;
    } catch (e) {
      if (e.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token đã hết hạn');
      }
      throw new UnauthorizedException('Token không hợp lệ');
    }
  }
}
```

---

## Slide 11 — Register guard globally

```ts
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```

**Tác dụng:**

- ✅ Mọi endpoint default protected
- ✅ Muốn public → add `@Public()` decorator
- ✅ Quên public 1 endpoint → fail-safe (401 thay vì leak)

> 💡 Pattern **secure by default** — quan trọng cho startup.

---

## Slide 12 — `@CurrentUser()` decorator

### Lấy user từ request gọn

```ts
// common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return data ? req.user?.[data] : req.user;
  },
);
```

**Dùng trong controller:**

```ts
@Get('me')
me(@CurrentUser() user: JwtPayload) {
  return this.usersService.findById(user.sub);
}

@Post('courses')
@Roles('tutor')
create(@ZodBody(CreateCourseDto) body, @CurrentUser('sub') tutorId: string) {
  return this.coursesService.create(body, tutorId);
}
```

---

## Slide 13 — JwtPayload type

```ts
// modules/auth/auth.types.ts
export type JwtPayload = {
  sub: string;                            // userId
  role: 'admin' | 'tutor' | 'student';
  iat: number;
  exp: number;
};

// augment Express Request
declare module 'express' {
  interface Request {
    user?: JwtPayload;
    id?: string;
  }
}
```

> 💡 Type-safe `req.user` — IDE autocomplete `user.sub`, `user.role`.

---

## Slide 14 — Endpoint `/v1/me`

```ts
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private users: UsersService) {}

  @Get()
  me(@CurrentUser() jwt: JwtPayload) {
    return this.users.findById(jwt.sub);
  }
}
```

**Test:**

```bash
TOKEN="<access-token-from-login>"

curl http://localhost:3000/v1/me -H "Authorization: Bearer $TOKEN"
# { id, email, role, fullName, ... }

curl http://localhost:3000/v1/me
# 401 Unauthorized — missing bearer

curl http://localhost:3000/v1/me -H "Authorization: Bearer xxx"
# 401 Unauthorized — token không hợp lệ
```

---

## Slide 15 — Vì sao TTL 15 phút?

### Trade-off

| TTL | UX | Security |
|-----|----|--------|
| 1 phút | ❌ user phải refresh liên tục | ✅ leak rất nhỏ |
| **15 phút** | ✅ smooth refresh background | ✅ leak ≤ 15p |
| 1 giờ | ✅ OK | ⚠️ leak 1h |
| 24 giờ | ✅✅ tốt | ❌ leak 1 ngày, attacker dùng được |
| Không expire | ✅✅✅ | ❌❌ no recovery |

**Pattern Tutor365:**

- Access token: 15 phút
- Refresh token: 30 ngày (xoay vòng — Section 8)

> 💡 Nếu phát hiện compromise → revoke refresh → user phải login lại trong tối đa 15 phút.

---

## Slide 16 — Login lock sau N lần fail

### Chống brute-force

```ts
async login(input: LoginInput) {
  const failKey = `login:fail:${input.email}`;
  const fails = await this.cache.get<number>(failKey) ?? 0;
  if (fails >= 5) {
    throw new HttpException(
      'Tài khoản tạm khoá. Thử lại sau 15 phút.',
      429,
    );
  }

  const user = await this.users.findByEmail(input.email);
  const ok = user && await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    await this.cache.set(failKey, fails + 1, 15 * 60_000);
    throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
  }

  await this.cache.del(failKey);    // reset
  // ... sign token
}
```

> 💡 Khoá học hiện tại dùng cache in-memory. C6 sẽ chuyển qua Redis.

---

## Slide 17 — Throttler cho login endpoint

```ts
// auth.controller.ts
import { Throttle } from '@nestjs/throttler';

@Public()
@Throttle({ default: { limit: 5, ttl: 60_000 } })  // 5 lần / phút / IP
@Post('login')
login(@ZodBody(LoginDto) body) {
  return this.auth.login(body);
}
```

**Kết hợp:**

- Rate-limit IP (throttler) — chống bot quét
- Lock account (cache fail count) — chống brute-force 1 user

---

## Slide 18 — Block status

### User bị Hanah ban → không login

```ts
async login(input) {
  const user = await this.users.findByEmail(input.email);
  if (!user) throw GENERIC;

  if (user.status === 'blocked') {
    throw new ForbiddenException('Tài khoản đã bị khoá');
  }
  if (user.status === 'pending_verify') {
    throw new UnauthorizedException('Vui lòng xác thực email');
  }
  if (user.status !== 'active') throw GENERIC;

  // ... compare + sign
}
```

> ⚠️ Phân biệt: `blocked` (Hanah action — báo rõ cho user biết) vs `pending_verify` (nhắc verify) vs invalid credentials (generic).

---

## Slide 19 — Audit log login

```ts
async login(input) {
  // ...
  await this.auditLog.record({
    actorUserId: user.id,
    action: 'user.login',
    metadata: {
      email: user.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}
```

**Lưu thêm:**

- Login fail attempts (sai password) — để Hanah xem report
- IP address — phát hiện login lạ vùng
- User-Agent — phát hiện login từ bot

---

## Slide 20 — Anti-patterns

```ts
// ❌ Trả JWT với payload chứa data nhạy cảm
sign({ sub, email, phone, passwordHash })  // base64, đọc được

// ❌ Secret hardcode
JwtModule.register({ secret: 'mysecret' })  // ← env mới đúng

// ❌ Không phân biệt loại lỗi
'User not found'                  // ← leak enumeration
'Wrong password'                  // ← leak biết user tồn tại

// ❌ Compare bằng ===
hash === input                    // timing attack

// ❌ TTL access token quá dài
expiresIn: '7d'                   // → leak 7 ngày

// ❌ Lưu access token vào DB
// → mất ý nghĩa stateless, phình DB
```

---

## Slide 21 — Bài tập thực hành

### 🎯 End-to-end login

**Bài 1:** Implement `POST /v1/auth/login` đầy đủ. Verify token decode bằng <https://jwt.io>.

**Bài 2:** Implement `@CurrentUser()` + endpoint `GET /v1/me` trả profile.

**Bài 3:** Đăng ký global `JwtAuthGuard`. Verify mọi endpoint default 401, có `@Public()` thì pass.

**Bài 4:** Test lock account: gửi sai password 5 lần → lần 6 trả 429.

**Bài 5:** Test TTL: login → đợi 15 phút (hoặc set `JWT_ACCESS_TTL=10s` để test nhanh) → `/v1/me` trả 401 với message "Token đã hết hạn".

**Bài 6:** Block user (set status=blocked trong DB) → login trả 403 với message rõ.

---

## Slide 22 — Tổng kết Video 7

### Bạn vừa học

- ✅ JWT cấu trúc 3 phần (header.payload.signature)
- ✅ Setup `@nestjs/jwt` với secret env
- ✅ Sign access token TTL 15 phút
- ✅ `bcrypt.compare` constant-time
- ✅ Global `JwtAuthGuard` + `@Public()` opt-out
- ✅ `@CurrentUser()` decorator lấy payload
- ✅ Trade-off TTL ngắn vs UX
- ✅ Lock account + throttler chống brute-force
- ✅ Generic error message — enumeration prevention

> 💪 Login chuẩn = nửa đường đến auth production-ready

---

<!-- _class: lead -->

# Tiếp theo: Video 8

## Refresh Token Rotation + Revoke

Vì sao refresh token cần rotation? Implement `POST /v1/auth/refresh` + DB whitelist + revoke + replay attack detection.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 8 🚀

> *"Authentication is hard. Use the libraries. Hash with bcrypt."*
