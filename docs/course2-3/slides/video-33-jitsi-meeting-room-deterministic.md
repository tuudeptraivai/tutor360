---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 33: Jitsi Meeting Room Deterministic'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Jitsi Meeting Room
# Deterministic

### Khóa 2-3 — Video 33

**Room name · Security · Role-aware redirect**

> Jitsi public — free, không API, không lock-in

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Sinh **meetingRoomName** deterministic & secure
- ✅ Build **URL Jitsi** với config security
- ✅ Endpoint **`GET /v1/sessions/:id/join`** redirect role-aware
- ✅ Hiểu **prejoin off, lobby on, room password** options
- ✅ Trade-off public Jitsi vs JaaS (branded domain)
- ✅ Test scenario: student vào sớm, tutor chưa join

> 🎯 Cuối video: Click "Join" → redirect Jitsi mở camera

---

## Slide 3 — Vì sao deterministic?

### Đơn giản, không cần lưu URL

```ts
const meetingRoomName = `tutor365-${bookingId}`;
const meetingUrl = `https://meet.jit.si/${meetingRoomName}`;
```

**Pros:**
- ✅ Không cần API tạo room (Jitsi public không có API)
- ✅ Không cần lưu URL — derive từ bookingId
- ✅ Replay-able — biết bookingId là biết URL
- ✅ Cross-team — log có bookingId là đủ debug

**Cons:**
- ⚠️ Predictable URL — ai biết bookingId sẽ vào được
- ⚠️ Mitigation: password room + lobby + bookingId là UUID

---

## Slide 4 — Security qua hash, không qua URL

### Không trust URL alone

```
URL: https://meet.jit.si/tutor365-uuid-abc

Bảo vệ:
1. Room password (config qua URL param)
2. Lobby — host approve người vào
3. Authentication — chỉ user logged-in của Tutor365 redirect được
4. Time gate — chỉ cho join trong khoảng [startAt - 15p, startAt + duration + 15p]
```

---

## Slide 5 — Build Jitsi URL với config

### URL params Jitsi External API support

```ts
function buildJitsiUrl(roomName: string, opts: {
  password?: string;
  displayName?: string;
  email?: string;
  startWithVideo?: boolean;
  startWithAudio?: boolean;
}) {
  const url = new URL(`https://meet.jit.si/${roomName}`);

  // Config hash params Jitsi
  const hashConfig: string[] = [
    `config.prejoinPageEnabled=false`,   // skip prejoin UI
    `config.enableWelcomePage=false`,
    `config.startWithAudioMuted=true`,    // mute by default
  ];

  if (opts.password) hashConfig.push(`config.lobby.password=${opts.password}`);

  // User info via interface config
  const interfaceConfig = [
    `interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME=Tutor365`,
    `interfaceConfig.SHOW_BRAND_WATERMARK=false`,
  ];

  url.hash = `#${[...hashConfig, ...interfaceConfig].join('&')}`;
  return url.toString();
}
```

---

## Slide 6 — Endpoint `/v1/sessions/:id/join`

```ts
@Auth('tutor', 'student', 'admin')
@Get('sessions/:id/join')
async join(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
  @Res() res: Response,
) {
  const booking = await this.bookings.findById(id);
  if (!booking) throw new NotFoundException();

  // Authz
  const allowed = u.role === 'admin'
    || booking.studentId === u.sub
    || booking.tutorId === u.sub;
  if (!allowed) throw new ForbiddenException();

  // Time gate
  const now = Date.now();
  const startMs = booking.startAt.getTime();
  const endMs = startMs + booking.durationHr * 3600_000;
  if (now < startMs - 15 * 60_000) {
    throw new BadRequestException('Còn quá sớm — join được sau 15 phút trước giờ học');
  }
  if (now > endMs + 15 * 60_000) {
    throw new BadRequestException('Buổi học đã kết thúc');
  }

  if (!booking.meetingRoomName) {
    throw new BadRequestException('Tutor chưa confirm buổi học');
  }

  // Build URL
  const user = await this.usersService.findById(u.sub);
  const url = buildJitsiUrl(booking.meetingRoomName, {
    displayName: user.fullName,
    email: user.email,
  });

  return res.redirect(url);
}
```

---

## Slide 7 — Time gate flexibility

### Configurable cho dev

```ts
// pricing_rules / app config
const JOIN_BEFORE_START_MINUTES = 15;   // default 15
const JOIN_AFTER_END_MINUTES = 15;      // default 15

// Use case:
// - Tutor join sớm prepare → 15p before
// - Student late join sau khi tutor đã trong room → 15p after end
```

---

## Slide 8 — JSON response vs redirect

### 2 patterns

**Option A — Redirect (Tutor365 dùng):**

```ts
res.redirect(jitsiUrl);
// → Browser auto navigate
// → FE chỉ cần `<a href="/v1/sessions/:id/join">Join</a>`
```

**Option B — Trả JSON URL:**

```ts
return { jitsiUrl, displayName };
// → FE xử lý: window.open(url) hoặc embed iframe
```

> 💡 Tutor365 Section 12 dùng A (redirect) cho `/join` đơn giản. V34 dùng iframe embed → FE call `/join-info` lấy JSON.

---

## Slide 9 — Endpoint join-info (JSON cho iframe)

```ts
@Auth('tutor', 'student')
@Get('sessions/:id/join-info')
async joinInfo(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  // Same authz + time gate as /join
  const booking = await this.bookings.findById(id);
  // ... checks

  const user = await this.usersService.findById(u.sub);
  return {
    roomName: booking.meetingRoomName,
    jitsiDomain: 'meet.jit.si',
    user: {
      displayName: user.fullName,
      email: user.email,
    },
    config: {
      prejoinPageEnabled: false,
      startWithAudioMuted: true,
      startWithVideoMuted: false,
    },
    role: u.role,           // student / tutor
    isTutor: u.sub === booking.tutorId,
    startAt: booking.startAt,
    endAt: new Date(booking.startAt.getTime() + booking.durationHr * 3600_000),
  };
}
```

> 💡 V34 — FE dùng response này để khởi tạo `JitsiMeetExternalAPI`.

---

## Slide 10 — Role hint cho iframe

### Tutor là moderator, Student là participant

Public Jitsi không có authentication — không phân biệt được moderator/participant ở server side. Cách workaround:

```ts
// FE side
if (joinInfo.isTutor) {
  // Tutor join trước → tự động thành moderator của Jitsi
  // Hiển thị UI: "Bạn là chủ phòng"
}
```

**Trade-off:** Jitsi public không enforce role server-side. Nâng cấp lên JaaS (Section 13/khoá 8) hoặc self-host với JWT có moderator claim → enforced.

---

## Slide 11 — Endpoint redirect with audit

```ts
async join(id, u, res) {
  // ... authz + time gate

  // Log who joined (for audit; attendance từ FE event ở V34)
  await this.auditLog.record({
    actorUserId: u.sub,
    action: 'session.join_redirect',
    entityType: 'booking',
    entityId: id,
    metadata: { role: u.role, ts: new Date() },
  });

  res.redirect(url);
}
```

> 💡 Phân biệt rõ:
> - `session.join_redirect` — user click join → BE phát URL
> - `session.attendance` (V34) — iframe event `videoConferenceJoined` thật

---

## Slide 12 — Test scenario

```bash
TUTOR=$(curl -X POST /v1/auth/login -d '...' | jq -r .accessToken)
STUDENT=$(curl -X POST /v1/auth/login -d '...' | jq -r .accessToken)

# Booking confirmed, startAt = +1h

# Student join sớm 30 phút trước
curl -I /v1/sessions/$BID/join -H "Authorization: Bearer $STUDENT"
# 400 — Còn quá sớm

# Đợi đến trong 15p before startAt
# Join lại
curl -I /v1/sessions/$BID/join -H "Authorization: Bearer $STUDENT"
# 302 Found — Location: https://meet.jit.si/tutor365-<id>#config...

# Tutor join
curl -I /v1/sessions/$BID/join -H "Authorization: Bearer $TUTOR"
# 302

# User khác xin join
curl -I /v1/sessions/$BID/join -H "Authorization: Bearer $OTHER"
# 403

# Sau endAt + 15p
curl /v1/sessions/$BID/join -H "Authorization: Bearer $STUDENT"
# 400 — Đã kết thúc
```

---

## Slide 13 — JaaS option (preview)

### Khi cần branded domain + JWT auth

```
Public meet.jit.si:
  https://meet.jit.si/tutor365-abc
  ❌ Brand "Jitsi"
  ❌ Không có server-side auth

JaaS (8x8 free tier):
  https://8x8.vc/tutor365-tenant/abc
  ✅ Brand
  ✅ JWT auth + moderator claim
  ✅ Webhook events server-side
  💰 Free tier 25 participants
```

**Tutor365:**
- ✅ MVP: public meet.jit.si (đủ)
- 🔄 Production C8: nâng cấp JaaS hoặc self-host

---

## Slide 14 — Self-host Jitsi (khoá riêng)

```yaml
# docker-compose-jitsi.yml
services:
  jitsi-web:
    image: jitsi/web
    ports: ["8443:443"]
  jitsi-prosody:
    image: jitsi/prosody
  jitsi-jicofo:
    image: jitsi/jicofo
  jitsi-jvb:
    image: jitsi/jvb
```

- Self-host yêu cầu STUN/TURN server cho NAT traversal
- TLS cert (Let's Encrypt)
- 2-4GB RAM cho prod
- Tutor365 MVP **không làm** — khoá 8 chi tiết

---

## Slide 15 — Anti-patterns

```ts
// ❌ Trust URL không check time
res.redirect(url)   // anytime
// → Student vào trước 1 ngày, làm bot spam

// ❌ Trả URL public cho user không liên quan
// → Ai có booking ID là vào được

// ❌ meetingRoomName không có prefix
roomName = bookingId
// → Conflict với room name khác (e.g., trùng tên cá nhân)

// ❌ Lưu URL trong DB
{ jitsiUrl: 'https://...' }
// → Đổi domain (self-host) phải migrate

// ❌ Show config thông qua query param plain
?password=123456
// → password đọc được trong history

// ❌ Không track attendance
// → Cron không biết ai vào, false positive no_show
```

---

## Slide 16 — Edge cases

| Case | Behavior |
|------|----------|
| Join sau 15p endAt | 400 |
| Join trước 15p startAt | 400 |
| Booking cancelled | 400 |
| Booking confirmed nhưng meetingRoomName null | 400 (chưa accept) |
| User là Hanah | Allow join (audit + moderate) |
| Bot scan endpoint khác bookingId | 404 hoặc 403 |
| Browser block redirect | FE fallback hiển thị URL copy-paste |

---

## Slide 17 — Bài tập thực hành

### 🎯 Join flow

**Bài 1:** Implement `buildJitsiUrl` helper.

**Bài 2:** Implement endpoint `/join` redirect với 3 check (authz, time, status).

**Bài 3:** Implement `/join-info` JSON cho FE iframe.

**Bài 4:** Test scenario slide 12.

**Bài 5:** Implement audit log `session.join_redirect`.

**Bài 6:** Test với 2 user khác nhau cùng booking → mỗi user log riêng.

**Bài 7:** Bonus: implement helper convert format (`bookingId → roomName`, ngược lại).

---

## Slide 18 — Helper convert

```ts
// utils/jitsi.ts
export function bookingIdToRoomName(bookingId: string): string {
  return `tutor365-${bookingId}`;
}

export function roomNameToBookingId(roomName: string): string | null {
  if (!roomName.startsWith('tutor365-')) return null;
  return roomName.slice('tutor365-'.length);
}
```

> 💡 V34 attendance event chứa roomName — server reverse-lookup bookingId.

---

## Slide 19 — Tổng kết Video 33

### Bạn vừa học

- ✅ Deterministic roomName `tutor365-<bookingId>`
- ✅ Build Jitsi URL với hash config (prejoin off, mute on)
- ✅ Endpoint /join redirect với 3 check
- ✅ Endpoint /join-info JSON cho iframe FE
- ✅ Time gate `[startAt - 15p, endAt + 15p]`
- ✅ Role hint cho FE moderator UX
- ✅ Trade-off public Jitsi vs JaaS vs self-host
- ✅ Audit log join_redirect

> 💪 Join flow chắc chắn = trải nghiệm Live tutoring mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 34

## Jitsi iframe + Attendance + Cron Reconciliation

Nhúng iframe Jitsi, listen `videoConferenceJoined`/`Left`, POST attendance, cron đổi status.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 34 🚀

> *"Determinism is the simplest security."*
