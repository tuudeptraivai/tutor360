---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 6: Signup + Email Verification'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Signup
# + Email Verification

### Khóa 2-3 — Video 6

**Bcrypt · Token TTL · MailPit · Verify endpoint**

> Mọi auth flow đẹp đều bắt đầu từ một signup đáng tin

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **`POST /v1/auth/signup`** đầy đủ
- ✅ Hash password bằng **bcrypt** (cost factor đúng)
- ✅ Sinh **verify token** với TTL 24h, single-use
- ✅ Gửi email verify qua **MailPit** (SMTP dev)
- ✅ Implement **`GET /v1/auth/verify?token=...`**
- ✅ Phân biệt **user pending vs verified vs active**
- ✅ Trả về **không bao giờ leak** thông tin email tồn tại

> 🎯 Cuối video: signup 3 role (admin/tutor/student) chạy, verify chạy

---

## Slide 3 — User model (preview)

### Bảng `users` (sẽ tạo migration ở Section 19)

```ts
type User = {
  id: string;                            // uuid
  email: string;                         // unique
  passwordHash: string;                  // bcrypt
  role: 'admin' | 'tutor' | 'student';
  status: 'pending_verify' | 'active' | 'blocked';
  fullName: string;
  phone: string | null;
  country: string;                       // ISO 3166-1
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```

**Trạng thái:**

- `pending_verify` — vừa signup, chưa click verify link
- `active` — đã verify, login được
- `blocked` — Hanah cấm

---

## Slide 4 — Signup flow tổng quan

```
1. POST /v1/auth/signup
   { email, password, fullName, role: 'tutor' | 'student' }

2. Validate body (Zod)
   - email format, password ≥ 8 char + 1 chữ + 1 số
   - role chỉ tutor|student (admin tạo bằng seed)

3. Check email duplicate (uniqueness)
   - exists → trả message generic (KHÔNG leak)

4. bcrypt.hash(password, 12)
5. Insert user (status='pending_verify')
6. Generate verify token (random 32 bytes)
   - lưu hash của token vào DB (không lưu raw)
   - TTL 24h
7. Send email "Verify your account" qua MailPit
   - link: /v1/auth/verify?token=<raw>

8. Response 201 (KHÔNG có id user trong body)
   { ok: true, message: "Check email để verify" }
```

---

## Slide 5 — Schema signup với Zod

```ts
// modules/auth/dto/signup.dto.ts
import { z } from 'zod';

export const SignupDto = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string()
    .min(8, 'Tối thiểu 8 ký tự')
    .regex(/[a-zA-Z]/, 'Phải có ít nhất 1 chữ cái')
    .regex(/[0-9]/, 'Phải có ít nhất 1 số'),
  fullName: z.string().trim().min(2).max(80),
  role: z.enum(['tutor', 'student']),    // admin tạo bằng seed
  phone: z.string().regex(/^\+?[0-9]{9,14}$/).optional(),
  country: z.string().length(2).default('VN'),
});
export type SignupInput = z.infer<typeof SignupDto>;
```

> 💡 `.toLowerCase().trim()` — chuẩn hoá email trước khi check duplicate.

---

## Slide 6 — bcrypt: cost factor đúng

### Cost = work factor (số vòng hash)

```ts
import * as bcrypt from 'bcrypt';

const passwordHash = await bcrypt.hash(password, 12);
//                                              ^^ cost factor
```

| Cost | Thời gian hash | Đủ an toàn? |
|------|----------------|------------|
| 4 | ~1ms | ❌ (default lib, quá yếu) |
| 8 | ~50ms | ⚠️ năm 2018 OK |
| **10** | ~250ms | ⚠️ baseline 2020 |
| **12** | ~750ms | ✅ **Tutor365 chọn** |
| 14 | ~3s | ✅ very secure, hơi chậm |

> 💡 **Trade-off:** Cost cao → signup chậm + tốn CPU server. Cost 12 vẫn cho server ~1.3 req/s/core → đủ cho MVP.

---

## Slide 7 — bcrypt.compare khi login (preview)

```ts
const ok = await bcrypt.compare(plainPassword, user.passwordHash);
```

**Lưu ý:**

- ✅ **timing-safe** — bcrypt.compare constant time, không leak qua timing attack
- ✅ Không tự code `if (hash === input)` — vì `===` không constant time
- ❌ Đừng dùng `crypto.createHash('sha256')` cho password — quá nhanh, brute force dễ
- ❌ Đừng dùng md5 / sha1 — đã broken

---

## Slide 8 — Verify token: thiết kế

### Yêu cầu

- **Random**: không đoán được (32 bytes from crypto)
- **TTL**: hết hạn sau 24h
- **Single-use**: dùng 1 lần, sau đó vô hiệu
- **Lưu HASH**, không lưu raw token (nếu DB leak, attacker không dùng được)

### Schema bảng `email_verify_tokens`

```ts
type EmailVerifyToken = {
  id: string;
  userId: string;
  tokenHash: string;       // sha256(rawToken)
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};
```

---

## Slide 9 — Generate token

```ts
import { randomBytes, createHash } from 'crypto';

function generateVerifyToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  // base64url an toàn cho URL (không có +/=)
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}
```

**Lưu DB:**

```ts
await prisma.emailVerifyToken.create({
  data: {
    userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
});
```

**Send email với `raw`:**

```
https://tutor365.vn/verify?token=<raw>
```

---

## Slide 10 — AuthService.signup

```ts
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private users: UserRepository,
    @Inject(VERIFY_TOKEN_REPOSITORY) private tokens: VerifyTokenRepository,
    private mailer: MailService,
  ) {}

  async signup(input: SignupInput) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      // KHÔNG throw — trả message generic để không leak
      return { ok: true, message: 'Nếu email hợp lệ, chúng tôi đã gửi link verify' };
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.users.insert({
      ...input,
      passwordHash,
      status: 'pending_verify',
    });

    const { raw, hash } = generateVerifyToken();
    await this.tokens.create({
      userId: user.id,
      tokenHash: hash,
      expiresAt: addHours(new Date(), 24),
    });

    await this.mailer.sendVerifyEmail(user.email, user.fullName, raw);

    return { ok: true, message: 'Nếu email hợp lệ, chúng tôi đã gửi link verify' };
  }
}
```

---

## Slide 11 — MailService với Nodemailer + MailPit

### Setup `docker-compose.yml` MailPit

```yaml
services:
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
```

**MailService:**

```ts
// mail/mail.service.ts
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +process.env.SMTP_PORT,
    secure: false,
    // dev: không cần auth
  });

  async sendVerifyEmail(to: string, name: string, token: string) {
    const link = `${process.env.APP_URL}/verify?token=${token}`;
    await this.transporter.sendMail({
      from: 'noreply@tutor365.vn',
      to,
      subject: 'Xác thực tài khoản Tutor365',
      html: `<p>Xin chào ${name},</p><p>Click <a href="${link}">đây</a> để xác thực.</p>`,
    });
  }
}
```

---

## Slide 12 — Test gửi email với MailPit

```bash
docker-compose up -d mailpit

curl -X POST http://localhost:3000/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu@example.com",
    "password": "Password123",
    "fullName": "Tu Nguyen",
    "role": "student"
  }'

# Mở http://localhost:8025 (MailPit Web UI)
# → Thấy email với link verify
```

> 💡 **MailPit không gửi email thật** — chỉ capture để dev debug. Production thay bằng SES, SendGrid, Postmark.

---

## Slide 13 — Verify endpoint

### `GET /v1/auth/verify?token=...`

```ts
// modules/auth/auth.controller.ts
@Public()
@Get('verify')
async verify(@ZodQuery(VerifyQuery) { token }: VerifyQueryInput) {
  return this.authService.verify(token);
}

// dto/verify.query.ts
export const VerifyQuery = z.object({
  token: z.string().min(20),
});
```

**Service:**

```ts
async verify(rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const record = await this.tokens.findValid(tokenHash);
  if (!record) {
    throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
  }
  await this.users.update(record.userId, {
    status: 'active',
    emailVerifiedAt: new Date(),
  });
  await this.tokens.markUsed(record.id);
  return { ok: true, message: 'Xác thực thành công, hãy đăng nhập' };
}
```

---

## Slide 14 — `findValid` cho token

```ts
// TokenRepository
async findValid(tokenHash: string) {
  return this.prisma.emailVerifyToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,                       // chưa dùng
      expiresAt: { gt: new Date() },      // chưa hết hạn
    },
  });
}

async markUsed(id: string) {
  return this.prisma.emailVerifyToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}
```

> 💡 **Single-use**: `markUsed` set `usedAt`. Lần thứ 2 click cùng link → `findValid` trả null → throw 400.

---

## Slide 15 — Resend verify email

### Endpoint `POST /v1/auth/resend-verify`

```ts
async resendVerify(email: string) {
  const user = await this.users.findByEmail(email);
  // KHÔNG báo lỗi nếu không tồn tại
  if (!user || user.status !== 'pending_verify') {
    return { ok: true, message: 'Nếu email hợp lệ, chúng tôi đã gửi lại' };
  }

  // Vô hiệu token cũ (optional)
  await this.tokens.invalidateAllForUser(user.id);

  const { raw, hash } = generateVerifyToken();
  await this.tokens.create({
    userId: user.id,
    tokenHash: hash,
    expiresAt: addHours(new Date(), 24),
  });
  await this.mailer.sendVerifyEmail(user.email, user.fullName, raw);
  return { ok: true, message: 'Nếu email hợp lệ, chúng tôi đã gửi lại' };
}
```

> ⚠️ Rate-limit endpoint này: tối đa 3 lần / 10 phút / IP → tránh spam.

---

## Slide 16 — Không leak email tồn tại

### Vấn đề

```ts
// ❌ XẤU
if (existing) throw new ConflictException('Email đã được dùng');
// → Attacker probe biết email nào có trong hệ thống
```

**Tốt hơn:**

```ts
// ✅ TỐT
if (existing) return { ok: true, message: 'Check email...' };
// → Response giống nhau dù email có hay không
```

**Tương tự `resend-verify`** và **`forgot-password`** (Section sau).

> 💡 Pattern này gọi là **enumeration prevention** — chuẩn OWASP.

---

## Slide 17 — Audit log

### Log mọi action quan trọng

```ts
await this.auditLog.record({
  actorUserId: null,          // signup chưa có session
  action: 'user.signup',
  entityType: 'user',
  entityId: user.id,
  metadata: { email: user.email, role: user.role },
});
```

**Action cần log:**

- `user.signup`
- `user.verify_email`
- `user.login` (Section 7)
- `user.logout`
- `user.password_change`
- `user.blocked` (Hanah action)

> 💡 Bảng `audit_logs` sẽ design ở Section 17.

---

## Slide 18 — Test signup + verify end-to-end

```bash
# 1. Signup
curl -X POST http://localhost:3000/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@x.com","password":"Pass1234","fullName":"Tu","role":"student"}'
# { ok: true, message: "Check email..." }

# 2. Mở http://localhost:8025 → copy verify link

# 3. Verify
curl 'http://localhost:3000/v1/auth/verify?token=<copied-token>'
# { ok: true, message: "Xác thực thành công..." }

# 4. Verify lại — fail
curl 'http://localhost:3000/v1/auth/verify?token=<copied-token>'
# 400 — Token đã dùng

# 5. Signup lại same email
curl -X POST ... same body
# { ok: true, message: "Check email..." } ← KHÔNG leak duplicate
```

---

## Slide 19 — Edge cases

| Case | Hành vi đúng |
|------|--------------|
| Email viết hoa `TU@X.com` | Normalize lowercase → check dedup |
| Token TTL hết hạn (>24h) | 400 — invite resend |
| Token đã dùng | 400 — generic message |
| Verify cùng token 2 lần đồng thời | Race condition — DB unique `usedAt IS NOT NULL` cản |
| Email trùng nhưng case khác | Phải coi giống → DB index `LOWER(email)` |
| Password unicode | bcrypt OK, length tính bytes nên chú ý |

---

## Slide 20 — Anti-patterns

```ts
// ❌ Hash sai cost factor
bcrypt.hash(password, 4)   // quá yếu

// ❌ Lưu raw token vào DB
{ token: 'abc-123' }       // DB leak → attacker dùng được

// ❌ Compare bằng ===
if (input === stored) {}   // timing attack

// ❌ Throw lỗi cụ thể
'Email already used'       // leak enumeration
'User not verified'        // leak nhận diện

// ❌ Gửi email sync trong request handler
await mailer.send(...)     // 2-3s blocking
// → C6 sẽ chuyển qua queue (BullMQ)

// ❌ Verify token không TTL
// → Token sống mãi mãi, attacker tích trữ
```

---

## Slide 21 — Bài tập thực hành

### 🎯 End-to-end auth signup

**Bài 1:** Implement `POST /v1/auth/signup` đầy đủ với bcrypt cost 12, store user pending.

**Bài 2:** Implement `GET /v1/auth/verify?token=...` single-use + TTL 24h.

**Bài 3:** Setup MailPit Docker, verify email landing ở `http://localhost:8025`.

**Bài 4:** Test enumeration: signup 2 lần cùng email → response giống nhau.

**Bài 5:** Implement `POST /v1/auth/resend-verify` + rate-limit 3 lần / 10 phút (dùng `@nestjs/throttler`).

**Bài 6:** Cố ý sửa cost factor về `4` → so sánh thời gian hash bằng `console.time()` → quay lại 12.

---

## Slide 22 — Tổng kết Video 6

### Bạn vừa học

- ✅ User model 3 role + 3 status (pending/active/blocked)
- ✅ Bcrypt cost 12 cho password hash
- ✅ Generate verify token random 32 bytes
- ✅ Lưu HASH token, không lưu raw
- ✅ TTL 24h + single-use
- ✅ MailPit SMTP dev capture email
- ✅ Endpoint signup + verify + resend
- ✅ Enumeration prevention (generic message)
- ✅ Audit log mọi action quan trọng

> 💪 Signup an toàn = bước đầu của auth tin cậy

---

<!-- _class: lead -->

# Tiếp theo: Video 7

## Login + bcrypt + JWT Access Token

Compare bcrypt, sign JWT access token TTL 15m, return token + user profile, handle login fail không leak.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 7 🚀

> *"Don't leak. Don't trust. Don't crypto-roll-your-own."*
