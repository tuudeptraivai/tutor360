---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 8: Refresh Token Rotation + Revoke'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Refresh Token
# Rotation + Revoke

### Khóa 2-3 — Video 8

**Whitelist DB · Rotation · Replay detection**

> Access token cứ 15 phút phải làm gì đó — đây là cái đó

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **vì sao cần refresh token** (không chỉ access)
- ✅ Implement **`POST /v1/auth/refresh`**
- ✅ **Rotation pattern** — mỗi lần refresh sinh refresh token mới
- ✅ Lưu **whitelist** refresh token (DB) — revoke được
- ✅ Phát hiện **replay attack** (token cũ dùng lại)
- ✅ Implement **`POST /v1/auth/logout`** — revoke tất cả
- ✅ Test scenario: stolen refresh token

> 🎯 Cuối video: full auth lifecycle access + refresh + logout

---

## Slide 3 — Vì sao có refresh token?

### Không thể tăng TTL access token

**Scenario:**
- Access TTL 15 phút → user phải re-login mỗi 15 phút? ❌
- Tăng TTL 7 ngày → leak token sống 7 ngày? ❌

**Giải pháp:**
- ✅ Access token **15 phút** — short-lived
- ✅ Refresh token **30 ngày** — long-lived
- ✅ Mỗi 15 phút client gọi `/v1/auth/refresh` với refresh token → server trả access token mới
- ✅ Refresh token **lưu DB** — revoke được tức thì
- ✅ User cảm giác login 1 lần dùng 30 ngày

---

## Slide 4 — Refresh token: JWT hay opaque?

### 2 lựa chọn

| Option | Pros | Cons |
|--------|------|------|
| **JWT refresh** | Stateless verify | Khó revoke (cần blacklist) |
| **Opaque (random)** | Lookup DB trực tiếp, dễ revoke | Mỗi refresh = 1 DB query |

**Tutor365 chọn:**

> ✅ **Opaque refresh token** lưu HASH vào DB (whitelist).
> Mỗi refresh = lookup DB → atomicity, revocability rõ ràng.

---

## Slide 5 — Bảng `refresh_tokens`

```ts
type RefreshToken = {
  id: string;                  // uuid
  userId: string;
  tokenHash: string;           // sha256 của raw token
  expiresAt: Date;             // 30 ngày
  rotatedAt: Date | null;      // null = active, set khi rotate
  revokedAt: Date | null;      // set khi logout / phát hiện replay
  replacedBy: string | null;   // id của token mới (rotation chain)
  createdAt: Date;
  // metadata
  userAgent: string | null;
  ip: string | null;
};

// Index
// (tokenHash) UNIQUE
// (userId, revokedAt)  cho list active sessions
```

---

## Slide 6 — Issue refresh token

```ts
// auth.service.ts
async issueRefreshToken(userId: string, meta: { ua?: string; ip?: string }) {
  const raw = randomBytes(48).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');

  await this.refreshTokens.create({
    userId,
    tokenHash: hash,
    expiresAt: addDays(new Date(), 30),
    userAgent: meta.ua,
    ip: meta.ip,
  });

  return raw;
}
```

**Login response (Video 7) bổ sung:**

```ts
return {
  accessToken: await this.signAccess(user),
  refreshToken: await this.issueRefreshToken(user.id, { ua, ip }),
  user: toPublicUser(user),
};
```

---

## Slide 7 — Refresh endpoint

### `POST /v1/auth/refresh`

```ts
// Controller
@Public()
@Post('refresh')
refresh(@ZodBody(RefreshDto) body, @Req() req) {
  return this.auth.refresh(body.refreshToken, {
    ua: req.headers['user-agent'],
    ip: req.ip,
  });
}

// DTO
export const RefreshDto = z.object({
  refreshToken: z.string().min(20),
});
```

**Service (skeleton):**

```ts
async refresh(raw: string, meta: { ua?; ip? }) {
  const hash = createHash('sha256').update(raw).digest('hex');
  const record = await this.refreshTokens.findActive(hash);
  if (!record) {
    // có thể là replay — sẽ xử lý slide 10
    throw new UnauthorizedException('Refresh token không hợp lệ');
  }
  // ... rotate
}
```

---

## Slide 8 — `findActive` query

```ts
async findActive(hash: string) {
  return this.prisma.refreshToken.findFirst({
    where: {
      tokenHash: hash,
      revokedAt: null,
      rotatedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}
```

**Lưu ý:**

- `rotatedAt = null` → chưa bị rotate (chưa xài để refresh lần nào)
- `revokedAt = null` → chưa bị revoke
- `expiresAt > now` → còn hạn

> 💡 Composite index `(tokenHash, revokedAt)` cho query này. Sẽ design ở Section 20.

---

## Slide 9 — Rotation: sinh refresh token mới mỗi lần

```ts
async refresh(raw: string, meta) {
  const hash = createHash('sha256').update(raw).digest('hex');

  // 1. Tìm token còn active
  const old = await this.refreshTokens.findActive(hash);
  if (!old) {
    // Có thể là REPLAY — token đã rotate trước đó (xem slide 10)
    await this.handleSuspectedReplay(hash);
    throw new UnauthorizedException();
  }

  // 2. Sinh refresh token mới
  const rawNew = randomBytes(48).toString('base64url');
  const hashNew = createHash('sha256').update(rawNew).digest('hex');

  // 3. Mark old as rotated, link với new
  const newRecord = await this.prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: { userId: old.userId, tokenHash: hashNew, expiresAt: addDays(new Date(), 30) },
    });
    await tx.refreshToken.update({
      where: { id: old.id },
      data: { rotatedAt: new Date(), replacedBy: created.id },
    });
    return created;
  });

  // 4. Sign access token mới
  const user = await this.users.findById(old.userId);
  return {
    accessToken: await this.signAccess(user),
    refreshToken: rawNew,
  };
}
```

---

## Slide 10 — Replay attack detection

### Token đã rotate dùng lại = compromise

```
Attacker steal refresh token X từ user
User dùng X → rotate → X marked rotated, có Y mới
Attacker dùng X → ❌ X không active nữa
   ↓
SERVER PHÁT HIỆN: X được dùng SAU rotation
   ↓
Logic: chuỗi token này bị compromise
   → REVOKE TẤT CẢ refresh tokens của user này
   → User phải login lại
```

```ts
async handleSuspectedReplay(hash: string) {
  // Tìm record (kể cả đã rotate)
  const recently = await this.refreshTokens.findByHashEvenRotated(hash);
  if (recently) {
    // Replay! Revoke toàn bộ chuỗi của user này
    await this.refreshTokens.revokeAllForUser(recently.userId);
    this.logger.warn(`Replay detected for user ${recently.userId}`);
  }
}
```

---

## Slide 11 — Revoke all tokens

```ts
async revokeAllForUser(userId: string) {
  await this.prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
```

**Effect:**

- Tất cả device của user mất phiên login
- Buộc login lại từ đầu
- Audit log để Hanah biết

> 💡 **Trade-off:** Nếu user thực sự là người dùng và token bị steal → người dùng phải login lại từ tất cả thiết bị. Đây là **cost** đáng giá để chặn attacker.

---

## Slide 12 — Logout endpoint

### `POST /v1/auth/logout`

```ts
// Yêu cầu access token + refresh token
export const LogoutDto = z.object({
  refreshToken: z.string().min(20),
});

@Post('logout')
async logout(@ZodBody(LogoutDto) body, @CurrentUser() jwt: JwtPayload) {
  await this.auth.logout(jwt.sub, body.refreshToken);
  return { ok: true };
}

// Service
async logout(userId: string, raw: string) {
  const hash = createHash('sha256').update(raw).digest('hex');
  await this.prisma.refreshToken.updateMany({
    where: { userId, tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // Access token vẫn valid đến exp — không revoke được. Trade-off stateless.
}
```

---

## Slide 13 — Logout all devices

### `POST /v1/auth/logout-all`

```ts
@Post('logout-all')
async logoutAll(@CurrentUser() jwt: JwtPayload) {
  await this.refreshTokens.revokeAllForUser(jwt.sub);
  return { ok: true, message: 'Đã đăng xuất khỏi tất cả thiết bị' };
}
```

**Use case:**

- User mất điện thoại → logout-all để kill session ở thiết bị mất
- Password change → auto trigger logout-all
- Hanah block user → revoke all

---

## Slide 14 — Cron cleanup expired tokens

### Bảng `refresh_tokens` sẽ phình to

```ts
// modules/auth/auth.cleanup.cron.ts
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AuthCleanupCron {
  constructor(private prisma: PrismaService) {}

  @Cron('0 3 * * *')  // 3h sáng mỗi ngày
  async cleanup() {
    const cutoff = subDays(new Date(), 30);  // giữ 30 ngày cho audit
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },        // hết hạn
          { revokedAt: { lt: cutoff } },            // revoked > 30 ngày trước
        ],
      },
    });
    this.logger.log(`Cleaned ${count} expired refresh tokens`);
  }
}
```

---

## Slide 15 — List active sessions endpoint

### User xem các thiết bị đang login

```ts
@Get('sessions')
async listSessions(@CurrentUser() jwt: JwtPayload) {
  const rows = await this.prisma.refreshToken.findMany({
    where: { userId: jwt.sub, revokedAt: null, rotatedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, ip: true, createdAt: true },
  });
  return rows;
}

@Delete('sessions/:id')
async revokeSession(@Param('id') id: string, @CurrentUser() jwt) {
  await this.prisma.refreshToken.updateMany({
    where: { id, userId: jwt.sub },
    data: { revokedAt: new Date() },
  });
  return { ok: true };
}
```

---

## Slide 16 — Test scenario đầy đủ

```bash
# 1. Login
LOGIN=$(curl -s -X POST /v1/auth/login -d '...')
ACCESS=$(echo $LOGIN | jq -r .accessToken)
REFRESH=$(echo $LOGIN | jq -r .refreshToken)

# 2. Dùng access — OK
curl /v1/me -H "Authorization: Bearer $ACCESS"

# 3. Đợi 15 phút (hoặc set TTL=10s) → access hết hạn
curl /v1/me -H "Authorization: Bearer $ACCESS"
# 401

# 4. Refresh
REFRESH_RES=$(curl -X POST /v1/auth/refresh -d "{\"refreshToken\":\"$REFRESH\"}")
NEW_ACCESS=$(echo $REFRESH_RES | jq -r .accessToken)
NEW_REFRESH=$(echo $REFRESH_RES | jq -r .refreshToken)

# 5. Dùng access mới — OK
curl /v1/me -H "Authorization: Bearer $NEW_ACCESS"

# 6. Replay attack: dùng REFRESH cũ
curl -X POST /v1/auth/refresh -d "{\"refreshToken\":\"$REFRESH\"}"
# 401 — và TẤT CẢ refresh token của user bị revoke

# 7. Dùng NEW_REFRESH (vốn còn active)
curl -X POST /v1/auth/refresh -d "{\"refreshToken\":\"$NEW_REFRESH\"}"
# 401 — đã bị revoke do replay
```

---

## Slide 17 — Concurrent refresh: race condition

### 2 tab cùng refresh

```
Tab A: gọi /refresh với X → rotate X → trả Y
Tab B: gọi /refresh với X (chưa biết Y) → X đã rotate → 401 REPLAY DETECT
   ↓
TẤT CẢ TOKEN BỊ REVOKE!
```

**Vấn đề:** Race condition tab → false-positive replay.

**Giải pháp:**

1. Frontend serialize: chỉ 1 request refresh tại 1 thời điểm (mutex)
2. Backend grace window: token vừa rotate < 5s → cho phép 1 lần dùng lại (trả lại token mới đã sinh)

```ts
// auth.service.ts (grace window)
if (record.rotatedAt && Date.now() - record.rotatedAt.getTime() < 5000) {
  // Trong grace → trả lại token đã được replacedBy
  return this.reuseRotatedChild(record.replacedBy);
}
```

> 💡 Tutor365 chọn frontend mutex + grace 5s.

---

## Slide 18 — Audit + alert replay

```ts
async handleSuspectedReplay(hash: string) {
  const recently = await this.refreshTokens.findByHashEvenRotated(hash);
  if (!recently) return;

  await this.refreshTokens.revokeAllForUser(recently.userId);

  await this.auditLog.record({
    actorUserId: recently.userId,
    action: 'auth.refresh_replay_detected',
    metadata: { tokenId: recently.id, severity: 'high' },
  });

  await this.mailer.sendSecurityAlert(recently.userId, {
    subject: 'Phát hiện đăng nhập bất thường',
    body: 'Tài khoản đã được đăng xuất tự động. Hãy đổi mật khẩu nếu không phải bạn.',
  });
}
```

---

## Slide 19 — Anti-patterns

```ts
// ❌ Trả refresh token trong response body của EVERY request
// → leak refresh ra log, ra browser history
// → refresh chỉ trong response của /login, /refresh

// ❌ Lưu refresh token RAW vào DB
{ token: 'abc-123' }     // DB leak → attacker dùng luôn

// ❌ Không rotate
// → 1 refresh dùng mãi → attacker steal 1 lần = forever access

// ❌ Không TTL refresh
// → token sống mãi, không revoke được

// ❌ Cho phép refresh lấy refresh tự refresh tự refresh chain
// → forever access — phải set max chain length hoặc rotate count

// ❌ Trả 200 + null token khi refresh fail
// → confuse FE — phải 401 rõ ràng
```

---

## Slide 20 — Bài tập thực hành

### 🎯 Full auth lifecycle

**Bài 1:** Implement bảng `refresh_tokens` + repository.

**Bài 2:** Implement `POST /v1/auth/refresh` với rotation pattern.

**Bài 3:** Implement `POST /v1/auth/logout` + `logout-all`.

**Bài 4:** Test replay attack:
- Login → refresh → dùng refresh cũ → verify 401 + all tokens revoked.

**Bài 5:** Test concurrent refresh (2 tabs):
- Cùng gọi refresh với token X → quan sát 1 thành công, 1 fail.
- Implement grace 5s → cả 2 thành công.

**Bài 6:** Implement endpoint `GET /v1/auth/sessions` + `DELETE /v1/auth/sessions/:id`.

**Bài 7:** Cron cleanup expired tokens → verify số row giảm.

---

## Slide 21 — Tổng kết Video 8

### Bạn vừa học

- ✅ Vì sao cần refresh token (access ngắn + UX dài)
- ✅ Opaque token (random 48 bytes) thay JWT cho refresh
- ✅ Bảng `refresh_tokens` với hash + TTL + rotation chain
- ✅ Rotation pattern: refresh xong sinh token mới, mark cũ rotated
- ✅ Replay detection: token đã rotate dùng lại → revoke all
- ✅ Logout + logout-all + list sessions endpoint
- ✅ Cron cleanup expired
- ✅ Grace window 5s xử lý concurrent refresh
- ✅ Audit + security alert khi replay

> 💪 Refresh đúng = production-grade auth

---

<!-- _class: lead -->

# Tiếp theo: Video 9

## Role Guard + @Roles Decorator

3 role: Admin (Hanah), Tutor, Student. Decorator + guard, kết hợp với endpoint `/courses/approve` chỉ Hanah gọi được.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 9 🚀

> *"Rotation is non-negotiable. Replay detection is the alarm."*
