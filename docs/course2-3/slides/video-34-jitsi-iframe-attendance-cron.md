---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 34: Jitsi Iframe + Attendance + Cron'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Jitsi Iframe + Attendance
# + Cron Reconciliation

### Khóa 2-3 — Video 34

**External API · joinedEvent · No webhook**

> Webhook = không có → ta tự build bằng client event + cron

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **Jitsi External API events**
- ✅ FE nhúng iframe → listen `videoConferenceJoined` / `Left`
- ✅ POST endpoint **`/v1/sessions/:id/attendances`**
- ✅ Schema `session_attendances` với composite PK
- ✅ Cron reconciliation (V29 đã preview, đây chi tiết)
- ✅ Edge: connection drop, refresh tab
- ✅ Privacy: chỉ track participant của Tutor365, ignore guest

> 🎯 Cuối video: Student vào Jitsi → attendance row tạo → cron chuyển in_progress

---

## Slide 3 — Schema `session_attendances`

```ts
type SessionAttendance = {
  bookingId: string;                     // FK
  userId: string;                        // FK (student hoặc tutor)
  joinedAt: Date;
  leftAt: Date | null;
  // CONSTRAINT PRIMARY KEY (bookingId, userId)
};
```

> 💡 Composite PK: 1 booking × 1 user = 1 row. Multiple join/leave trong cùng buổi update row đó.

---

## Slide 4 — Jitsi External API setup (FE)

```html
<!-- index.html của FE C4 -->
<script src="https://meet.jit.si/external_api.js"></script>
```

```tsx
// MeetingPage.tsx
const apiRef = useRef<JitsiMeetExternalAPI | null>(null);

useEffect(() => {
  const joinInfo = await fetch(`/v1/sessions/${id}/join-info`).then(r => r.json());
  apiRef.current = new JitsiMeetExternalAPI('meet.jit.si', {
    roomName: joinInfo.roomName,
    parentNode: document.getElementById('jitsi-container'),
    width: '100%',
    height: 600,
    userInfo: {
      displayName: joinInfo.user.displayName,
      email: joinInfo.user.email,
    },
    configOverwrite: joinInfo.config,
  });

  apiRef.current.on('videoConferenceJoined', async () => {
    await fetch(`/v1/sessions/${id}/attendances`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  });

  apiRef.current.on('videoConferenceLeft', async () => {
    await fetch(`/v1/sessions/${id}/attendances/leave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  });

  return () => apiRef.current?.dispose();
}, []);
```

---

## Slide 5 — Backend endpoint POST attendance

```ts
@Auth('student', 'tutor')
@Post('sessions/:id/attendances')
async recordJoin(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  return this.attendances.recordJoin(id, u.sub);
}

// Service
async recordJoin(bookingId: string, userId: string) {
  // Verify user thuộc booking
  const booking = await this.prisma.sessionBooking.findFirst({
    where: {
      id: bookingId,
      OR: [{ studentId: userId }, { tutorId: userId }],
    },
  });
  if (!booking) throw new ForbiddenException();

  // Idempotent upsert
  return this.prisma.sessionAttendance.upsert({
    where: { bookingId_userId: { bookingId, userId } },
    create: { bookingId, userId, joinedAt: new Date() },
    update: { leftAt: null },     // re-join clear leftAt
  });
}
```

---

## Slide 6 — Endpoint POST leave

```ts
@Auth('student', 'tutor')
@Post('sessions/:id/attendances/leave')
async recordLeave(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  return this.attendances.recordLeave(id, u.sub);
}

async recordLeave(bookingId: string, userId: string) {
  return this.prisma.sessionAttendance.updateMany({
    where: { bookingId, userId },
    data: { leftAt: new Date() },
  });
}
```

> 💡 Updates **many** thay vì update single — graceful nếu không có row (user leave mà chưa từng join — bug FE).

---

## Slide 7 — Cron reconciliation chi tiết (refine V29)

```ts
@Cron('*/5 * * * *')
async reconcile() {
  if (this.running) return;
  this.running = true;
  try {
    await this.advanceToInProgress();
    await this.advanceToCompleted();
    await this.detectNoShow();
  } finally {
    this.running = false;
  }
}

async advanceToInProgress() {
  // confirmed + có attendance + đã qua startAt → in_progress
  const ids = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id FROM session_bookings b
    WHERE b.status = 'confirmed'
      AND b.start_at <= NOW()
      AND EXISTS (
        SELECT 1 FROM session_attendances a
        WHERE a.booking_id = b.id
      )
  `;
  for (const r of ids) {
    await this.transition.transitionTo({
      bookingId: r.id, to: 'in_progress',
      actorUserId: 'system', actorRole: 'system',
    });
  }
}

async advanceToCompleted() {
  const ids = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id FROM session_bookings b
    WHERE b.status = 'in_progress'
      AND b.start_at + (b.duration_hr * INTERVAL '1 hour') < NOW()
  `;
  for (const r of ids) {
    await this.transition.transitionTo({
      bookingId: r.id, to: 'completed',
      actorUserId: 'system', actorRole: 'system',
    });
  }
}

async detectNoShow() {
  const ids = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id FROM session_bookings b
    WHERE b.status = 'confirmed'
      AND b.start_at + INTERVAL '15 minutes' < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM session_attendances a WHERE a.booking_id = b.id
      )
  `;
  for (const r of ids) {
    await this.transition.transitionTo({
      bookingId: r.id, to: 'no_show',
      actorUserId: 'system', actorRole: 'system',
    });
  }
}
```

---

## Slide 8 — Attendance summary endpoint

### Hanah/Student xem ai đã join

```ts
@Auth('tutor', 'student', 'admin')
@Get('sessions/:id/attendances')
async list(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  const booking = await this.bookings.findById(id);
  const allowed = u.role === 'admin'
    || booking.studentId === u.sub
    || booking.tutorId === u.sub;
  if (!allowed) throw new ForbiddenException();

  return this.prisma.sessionAttendance.findMany({
    where: { bookingId: id },
    include: { user: { select: { id: true, fullName: true, role: true } } },
  });
}
```

**Output:**

```json
[
  { "user": { "fullName": "Anh Tu", "role": "tutor" }, "joinedAt": "...", "leftAt": null },
  { "user": { "fullName": "Hong",   "role": "student" }, "joinedAt": "...", "leftAt": "..." }
]
```

---

## Slide 9 — Privacy: chỉ track participant của Tutor365

### Jitsi public ai cũng vào được nếu có URL

```
Tutor + Student logged-in via Tutor365 → attendance recorded
Random user vào URL → join Jitsi room nhưng KHÔNG có attendance row

→ Cron chỉ thấy 0 attendance nếu Tutor + Student không vào
→ false positive no_show vẫn xảy ra (random guest đã trong room)
```

**Mitigation:**
- ✅ URL khó đoán (UUID + prefix)
- ✅ Time gate (`/join` redirect)
- ✅ FE only show "Join" button cho user logged-in
- 🔄 Self-host JWT auth (C8) — chặn random guest

---

## Slide 10 — Edge: connection drop

### User mất net → leave event không bắn?

```
1. User joined → row created
2. WiFi cut → Jitsi disconnect, External API event không gửi
3. User reconnect → join lại
4. Có 1 row attendance (composite PK upsert)
   - joinedAt = thời gian đầu tiên
   - leftAt = null (vì leave không bắn)
```

**Workaround:** Reload tab → mount lại JitsiMeetExternalAPI → `videoConferenceJoined` bắn lần nữa → upsert update.

**Cron tolerant:** không cần leftAt — chỉ cần joinedAt để chuyển in_progress.

---

## Slide 11 — Auth token cho FE call

### FE cần access token gọi /attendances

```tsx
// Bearer token có sẵn từ login state
fetch(`/v1/sessions/${id}/attendances`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

> 💡 Nếu token expire giữa buổi học → FE refresh trước khi gọi. Section 8 refresh rotation hỗ trợ.

---

## Slide 12 — Test scenario

```bash
# Setup: booking confirmed, startAt = now (đã qua)

# Student "join" — simulate via curl thay vì Jitsi event
curl -X POST /v1/sessions/$BID/attendances \
  -H "Authorization: Bearer $STUDENT"
# 200 — { joinedAt: now }

# Run cron
curl -X POST /v1/admin/cron/booking-reconcile -H "Authorization: Bearer $ADMIN"

# Verify status
curl /v1/me/bookings/$BID -H "Authorization: Bearer $STUDENT"
# status: 'in_progress'

# Đợi qua duration → run cron again
# (hoặc giả lập startAt cũ hơn)
curl -X POST /v1/admin/cron/booking-reconcile

# Verify completed
curl /v1/me/bookings/$BID
# status: 'completed'

# Attendance list
curl /v1/sessions/$BID/attendances -H "Authorization: Bearer $ADMIN"
# [{ user: Student, joinedAt }, ... ]
```

---

## Slide 13 — Anti-patterns

```ts
// ❌ Trust FE attendance data (joinedAt)
@Post('/attendances')
record(@Body() body) {
  prisma.create({ joinedAt: body.joinedAt })   // ← client manipulate
}
// → BE set joinedAt = now()

// ❌ Insert duplicate row
prisma.create   // mỗi tab open insert 1 row
// → composite PK upsert

// ❌ Allow attendance từ user khác booking
// → check booking ownership

// ❌ Cron không tolerant với 0 attendance
// → Status no_show đúng

// ❌ FE không cleanup api.dispose()
// → memory leak component

// ❌ Public attendance list
// → Privacy: chỉ allow tutor/student/admin
```

---

## Slide 14 — Heartbeat (advanced)

### Track session length chính xác

```tsx
// FE mỗi 60s post heartbeat
useEffect(() => {
  if (!api) return;
  const intervalId = setInterval(() => {
    fetch(`/v1/sessions/${id}/attendances/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }, 60_000);
  return () => clearInterval(intervalId);
}, [api]);
```

```ts
// BE
async heartbeat(bookingId, userId) {
  await this.prisma.sessionAttendance.update({
    where: { bookingId_userId: { bookingId, userId } },
    data: { lastSeenAt: new Date() },
  });
}

// Cron: detect drop nếu lastSeenAt > 5 phút
```

> 💡 Tutor365 MVP không heartbeat — chỉ join/leave. Heartbeat là enhancement cho payout precision.

---

## Slide 15 — Section 11 hoàn tất

### Live meeting layer ready

✅ V33 — Deterministic roomName + join endpoint
✅ V34 — Iframe + attendance + cron reconciliation

**Section 12 — Calendar API + iCal Feed** (3 video):

- V35: Calendar feed `GET /sessions?from..to`
- V36: Join redirect endpoint (refine)
- V37: iCal feed RFC 5545 cho Google/Apple Calendar

> 🚀 Sang Section 12 — bridge backend với calendar app.

---

## Slide 16 — Bài tập thực hành

### 🎯 Attendance + cron

**Bài 1:** Migration `session_attendances` composite PK.

**Bài 2:** Implement POST `/attendances` + POST `/attendances/leave`.

**Bài 3:** Verify upsert idempotent: gọi 3 lần POST → vẫn 1 row.

**Bài 4:** Implement cron reconcile chi tiết.

**Bài 5:** Test E2E (slide 12):
- Tutor + Student join → status in_progress
- Đợi duration → completed
- Booking khác không ai join 15p → no_show

**Bài 6:** Implement attendance summary endpoint.

**Bài 7:** Bonus: heartbeat endpoint (slide 14) + UI elapsed time.

---

## Slide 17 — Audit log + privacy

```ts
async recordJoin(bookingId, userId) {
  // Verify ownership
  // ...
  const result = await this.prisma.sessionAttendance.upsert(/* ... */);

  // Audit
  await this.auditLog.record({
    actorUserId: userId,
    action: 'attendance.join',
    entityType: 'booking',
    entityId: bookingId,
    metadata: { isFirstJoin: !result.leftAt },
  });

  return result;
}
```

---

## Slide 18 — Anti-pattern: FE iframe security

```tsx
// ❌ Trust query string từ Jitsi
window.addEventListener('message', (e) => {
  if (e.data.type === 'videoConferenceJoined') {
    fetch('/attendances')   // ← attacker postMessage fake event
  }
});

// ✅ Dùng JitsiMeetExternalAPI chính thức
api.on('videoConferenceJoined', () => {
  // verified event từ Jitsi origin
});
```

---

## Slide 19 — Tổng kết Video 34

### Bạn vừa học

- ✅ Schema `session_attendances` composite PK
- ✅ FE External API `videoConferenceJoined` + `Left`
- ✅ Backend endpoint POST attendance idempotent
- ✅ Cron 3 functions: advanceInProgress, advanceCompleted, detectNoShow
- ✅ Edge: connection drop tolerant
- ✅ Privacy: chỉ track Tutor365 user
- ✅ Audit log
- ✅ Heartbeat option (advanced)

> 💪 Attendance + cron = thay thế webhook Jitsi không có

---

<!-- _class: lead -->

# Tiếp theo: Video 35

## Calendar Feed `GET /sessions`

Filter + pagination + range cho FE calendar render.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 35 🚀

> *"Client events plus periodic check = a webhook that doesn't exist."*
