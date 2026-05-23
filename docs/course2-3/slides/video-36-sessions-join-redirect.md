---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 36: Sessions Join Redirect Refine'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Sessions Join Redirect
# (Refine)

### Khóa 2-3 — Video 36

**Detailed authz · Auto-mark · Multi-device**

> 1 endpoint nhỏ, nhiều bẫy

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Refine endpoint `/sessions/:id/join` với 6 check
- ✅ Auto-create attendance row khi user click join
- ✅ Multi-device: cùng user mở 2 device → only 1 attendance
- ✅ Pre-join page: server return JSON, FE render UI
- ✅ Audit detailed metadata (device, IP, user-agent)
- ✅ Failure modes graceful

> 🎯 Cuối video: Click join → JSON với URL Jitsi + đã ghi attendance

---

## Slide 3 — Updated endpoint signature

```ts
@Auth('tutor', 'student', 'admin')
@Get('sessions/:id/join')
async join(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
  @Req() req: Request,
  @Query('mode') mode?: 'redirect' | 'json',
) {
  return this.bookings.handleJoin(id, u, req, mode ?? 'json');
}
```

**Pattern:**

- `mode=redirect` → `302 Found Location: jitsiUrl`
- `mode=json` → `200 { jitsiUrl, roomName, displayName, ... }`

> 💡 FE C4 dùng `json` mode để nhúng iframe.

---

## Slide 4 — Service.handleJoin

```ts
async handleJoin(id: string, u: JwtPayload, req: Request, mode: 'redirect' | 'json') {
  const booking = await this.findById(id);
  if (!booking) throw new NotFoundException();

  // 1. Authz
  this.ensureCanJoin(booking, u);

  // 2. Status check
  if (!['confirmed', 'in_progress'].includes(booking.status)) {
    throw new BadRequestException(`Booking đang ở status ${booking.status}, không thể join`);
  }

  // 3. Time gate
  this.ensureWithinJoinWindow(booking);

  // 4. Auto-mark attendance (idempotent)
  if (u.role !== 'admin') {
    await this.attendancesService.recordJoin(id, u.sub);
  }

  // 5. Audit
  await this.auditLog.record({
    actorUserId: u.sub,
    action: 'session.join',
    entityType: 'booking',
    entityId: id,
    metadata: {
      role: u.role,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 200),
      mode,
    },
  });

  // 6. Build URL
  const user = await this.usersService.findById(u.sub);
  const jitsiUrl = buildJitsiUrl(booking.meetingRoomName!, {
    displayName: user.fullName,
    email: user.email,
  });

  if (mode === 'redirect') {
    return { type: 'redirect', url: jitsiUrl };
  }
  return {
    type: 'json',
    roomName: booking.meetingRoomName,
    jitsiDomain: 'meet.jit.si',
    jitsiUrl,
    user: { displayName: user.fullName, email: user.email },
    role: u.role,
    isTutor: u.sub === booking.tutorId,
    startAt: booking.startAt,
    endAt: new Date(booking.startAt.getTime() + booking.durationHr * 3600_000),
  };
}
```

---

## Slide 5 — Controller layer dispatch redirect

```ts
@Get('sessions/:id/join')
async join(@Param('id') id, @CurrentUser() u, @Req() req, @Res() res, @Query('mode') mode) {
  const result = await this.bookings.handleJoin(id, u, req, mode ?? 'json');
  if (result.type === 'redirect') {
    return res.redirect(result.url);
  }
  return res.json(result);
}
```

> 💡 Service trả type discriminator, controller dispatch.

---

## Slide 6 — ensureCanJoin

```ts
private ensureCanJoin(booking: SessionBooking, u: JwtPayload) {
  if (u.role === 'admin') return;
  if (booking.studentId === u.sub) return;
  if (booking.tutorId === u.sub) return;
  throw new ForbiddenException('Bạn không liên quan đến buổi học này');
}
```

---

## Slide 7 — ensureWithinJoinWindow

```ts
private ensureWithinJoinWindow(booking: SessionBooking) {
  const now = Date.now();
  const start = booking.startAt.getTime();
  const end = start + booking.durationHr * 3600_000;

  const BEFORE_MS = 15 * 60_000;       // 15 phút sớm
  const AFTER_MS = 15 * 60_000;        // 15 phút sau

  if (now < start - BEFORE_MS) {
    const minutesUntil = Math.ceil((start - BEFORE_MS - now) / 60_000);
    throw new BadRequestException({
      code: 'TOO_EARLY',
      message: `Còn ${minutesUntil} phút nữa mới join được`,
    });
  }
  if (now > end + AFTER_MS) {
    throw new BadRequestException({
      code: 'TOO_LATE',
      message: 'Buổi học đã kết thúc',
    });
  }
}
```

> 💡 Trả `code` + `message` → FE biết hiển thị error nào.

---

## Slide 8 — Multi-device same user

### Composite PK đảm bảo

```ts
async recordJoin(bookingId, userId) {
  return this.prisma.sessionAttendance.upsert({
    where: { bookingId_userId: { bookingId, userId } },
    create: { bookingId, userId, joinedAt: new Date() },
    update: { /* keep joinedAt, just touch */ },
  });
}
```

**Use case:**

- Student mở phone + laptop cùng vào → 1 attendance row
- joinedAt = thời gian đầu tiên (không update)

---

## Slide 9 — Pre-join page (advanced)

### FE flow tách thành 2 step

```
1. Click "Join" → GET /v1/sessions/:id/join?mode=json
   → Backend return JSON với jitsiUrl + user info
   
2. FE render pre-join UI:
   - "Bạn sẽ join với tên: Hong"
   - "Camera/Mic check"
   - Button "Vào phòng"
   
3. Click "Vào phòng" → mount JitsiMeetExternalAPI với joinInfo
```

> 💡 Pre-join UI cho phép user verify thông tin + test mic/cam trước khi vào.

---

## Slide 10 — Audit detail

```ts
{
  action: 'session.join',
  metadata: {
    role: 'student',
    ip: '203.0.113.1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    mode: 'json',
    bookingId: 'b-uuid',
    timestamp: '2026-05-25T09:00:30Z',
  }
}
```

**Use case:**

- Debug: "Student báo không join được" — xem audit có log không
- Anomaly: IP từ vùng khác → security alert
- Multi-device: 1 user có 3 row audit từ 3 IP khác — bình thường nếu home, suspicious nếu cross-country

---

## Slide 11 — Error response format

### Consistent JSON cho FE

```ts
// Filter (V02 GlobalExceptionFilter) refine
if (exception instanceof BadRequestException) {
  const resp = exception.getResponse();
  if (typeof resp === 'object' && 'code' in resp) {
    return res.status(400).json({
      ok: false,
      error: { code: resp.code, message: resp.message },
      requestId: req.id,
    });
  }
}
```

**FE handle:**

```tsx
const handleJoin = async () => {
  try {
    const data = await fetch('/v1/sessions/X/join?mode=json').then(r => r.json());
    if (!data.ok) {
      if (data.error.code === 'TOO_EARLY') {
        alert('Vui lòng quay lại lúc gần giờ học');
      } else {
        alert(data.error.message);
      }
      return;
    }
    // ... mount Jitsi
  } catch (e) {}
};
```

---

## Slide 12 — Endpoint test scenario

```bash
# 1. Booking confirmed startAt = now + 30 phút (too early)
curl '/v1/sessions/$BID/join?mode=json' -H "Authorization: Bearer $STUDENT"
# 400 — code: TOO_EARLY

# 2. Đợi đến 15p trước startAt
curl '/v1/sessions/$BID/join?mode=json' -H "Authorization: Bearer $STUDENT"
# 200 — { jitsiUrl, roomName, ... }

# Verify attendance row created
psql -c "SELECT * FROM session_attendances WHERE booking_id = '$BID'"
# 1 row: studentId joinedAt

# 3. Tutor cũng join
curl '/v1/sessions/$BID/join?mode=json' -H "Authorization: Bearer $TUTOR"
# 200

# 4. Attendance 2 rows giờ
psql -c "..."
# 2 rows: student + tutor

# 5. Student mở tab khác → re-call
curl '/v1/sessions/$BID/join?mode=json' -H "Authorization: Bearer $STUDENT"
# 200 — attendance idempotent, vẫn 2 rows

# 6. Random user
curl '/v1/sessions/$BID/join?mode=json' -H "Authorization: Bearer $RANDOM"
# 403 — Bạn không liên quan

# 7. Mode redirect
curl -I '/v1/sessions/$BID/join?mode=redirect' -H "Authorization: Bearer $STUDENT"
# 302 Found
# Location: https://meet.jit.si/tutor365-b-uuid#config...
```

---

## Slide 13 — Anti-patterns

```ts
// ❌ Auto-mark attendance cho admin
// → Admin chỉ join để moderate, không tính attendance
// → Skip role=admin trong recordJoin

// ❌ Quên audit log
// → Không debug được "ai click join lúc nào"

// ❌ Time gate quá strict
BEFORE_MS = 0   // chỉ join đúng giờ
// → Student không kịp setup mic

// ❌ Time gate quá lỏng
BEFORE_MS = 24h
// → Student vào 1 ngày trước, làm hot room

// ❌ Trả lỗi text plain
throw new Error('quá sớm')   // → 500 thay vì 400 with code

// ❌ Concatenate IP/UA chưa truncate
{ userAgent: req.headers['user-agent'] }   // có thể 500+ bytes
// → slice(0, 200)
```

---

## Slide 14 — Edge cases

| Case | Behavior |
|------|----------|
| User click join 2 lần liên tiếp | Idempotent — same response |
| Booking đột nhiên cancelled giữa join | 400 (status check) |
| Tutor join sớm 15p, Student vẫn quá sớm | Tutor: 200, Student: 400 |
| Meeting đã kết thúc nhưng admin join để xem audit | 400 — Admin cũng tuân thủ time gate (hoặc bypass via separate endpoint) |
| Mode invalid `?mode=xyz` | Default 'json' |
| user-agent siêu dài (5000 chars) | Slice 200 |

---

## Slide 15 — Bài tập thực hành

### 🎯 Join endpoint refine

**Bài 1:** Refactor `handleJoin` với 6 step rõ ràng.

**Bài 2:** Implement `ensureCanJoin` + `ensureWithinJoinWindow`.

**Bài 3:** Test 7 case (slide 12).

**Bài 4:** Implement audit detailed với IP + user-agent.

**Bài 5:** Implement error code `TOO_EARLY` / `TOO_LATE` + FE handle.

**Bài 6:** Test multi-device idempotent: cùng user mở 3 tab → attendance vẫn 1 row.

**Bài 7:** Bonus: implement `GET /v1/sessions/:id/can-join` — return `{ ok, reason }` cho FE pre-check.

---

## Slide 16 — `can-join` precheck endpoint

```ts
@Auth('tutor', 'student', 'admin')
@Get('sessions/:id/can-join')
async canJoin(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  const booking = await this.findById(id);
  if (!booking) return { ok: false, reason: 'NOT_FOUND' };

  try {
    this.ensureCanJoin(booking, u);
    if (!['confirmed', 'in_progress'].includes(booking.status)) {
      return { ok: false, reason: 'WRONG_STATUS', status: booking.status };
    }
    this.ensureWithinJoinWindow(booking);
    return { ok: true };
  } catch (e) {
    if (e instanceof BadRequestException) {
      const r = e.getResponse() as any;
      return { ok: false, reason: r.code ?? 'UNKNOWN', message: r.message };
    }
    return { ok: false, reason: 'FORBIDDEN' };
  }
}
```

> 💡 FE hiển thị button "Join" enabled/disabled dựa vào endpoint này.

---

## Slide 17 — Tutor365 Admin xem buổi đang live

```ts
@AdminOnly()
@Get('admin/sessions/live')
async liveSessions() {
  return this.prisma.sessionBooking.findMany({
    where: { status: 'in_progress' },
    orderBy: { startAt: 'asc' },
    include: {
      student: { select: { id: true, fullName: true } },
      tutor: { select: { id: true, fullName: true } },
      attendances: { include: { user: { select: { fullName: true } } } },
    },
  });
}
```

**Use case:** Hanah xem ai đang học live ngay bây giờ.

---

## Slide 18 — Tổng kết Video 36

### Bạn vừa học

- ✅ Refactor handleJoin 6 step
- ✅ Mode redirect vs JSON
- ✅ Auto-mark attendance (skip admin)
- ✅ Time gate ±15 phút
- ✅ Idempotent multi-device
- ✅ Pre-join page pattern
- ✅ Error code TOO_EARLY/TOO_LATE
- ✅ Audit IP + user-agent
- ✅ `can-join` precheck endpoint
- ✅ Admin live sessions view

> 💪 Join endpoint chắc chắn = UX live mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 37

## iCal Feed (RFC 5545)

Generate `/users/:id/sessions.ics` subscribable Google/Apple Calendar.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 37 🚀

> *"Join is the smallest endpoint with the most user friction."*
