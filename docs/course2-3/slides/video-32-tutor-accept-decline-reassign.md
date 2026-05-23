---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 32: Tutor Accept/Decline + Reassign'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Tutor Accept / Decline
# + Reassign

### Khóa 2-3 — Video 32

**Confirm · Sinh Jitsi URL · Decline loop**

> Tutor accept = ký hợp đồng buổi học

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **`POST /v1/bookings/:id/accept`**
- ✅ Implement **`POST /v1/bookings/:id/decline`**
- ✅ Auto sinh **`meetingRoomName`** deterministic khi confirmed
- ✅ Combo: accept toàn bộ hay tách từng buổi?
- ✅ Notify Student khi tutor accept
- ✅ Test full reassign loop khi decline

> 🎯 Cuối video: Tutor accept → có Jitsi URL hiển thị cho cả 2 phía

---

## Slide 3 — Tutor list assigned bookings

```ts
@Auth('tutor')
@Get('me/bookings/assigned')
async listAssigned(@CurrentUser('sub') tutorId: string) {
  return this.prisma.sessionBooking.findMany({
    where: {
      tutorId,
      status: 'assigned',
      startAt: { gt: new Date() },
    },
    orderBy: { startAt: 'asc' },
    include: {
      student: { select: { id: true, fullName: true } },
      subject: true,
      level: true,
      package: true,
    },
  });
}
```

---

## Slide 4 — Accept endpoint

```ts
@Auth('tutor')
@Post('bookings/:id/accept')
async accept(
  @Param('id') id: string,
  @CurrentUser('sub') tutorId: string,
) {
  return this.bookings.tutorAccept(id, tutorId);
}

// Service
async tutorAccept(id: string, tutorId: string) {
  const booking = await this.prisma.sessionBooking.findFirst({
    where: { id, tutorId, status: 'assigned' },
  });
  if (!booking) throw new BadRequestException('Không có booking assigned cho bạn');

  // Sinh meetingRoomName deterministic
  const meetingRoomName = `tutor365-${booking.id}`;

  await this.transition.transitionTo({
    bookingId: id,
    to: 'confirmed',
    actorUserId: tutorId,
    actorRole: 'tutor',
  });

  // Set meetingRoomName (side effect ngoài transition)
  await this.prisma.sessionBooking.update({
    where: { id },
    data: { meetingRoomName },
  });

  // Combo: nếu là child của parent, chỉ confirm 1 child
  // Nếu parent của combo → confirm cả children luôn
  if (booking.recurrenceRule) {
    await this.confirmAllChildren(id, tutorId);
  }

  // Notify Student
  const student = await this.usersService.findById(booking.studentId);
  await this.mailer.sendBookingConfirmed(student.email, booking).catch(() => {});

  return this.findById(id);
}
```

---

## Slide 5 — confirmAllChildren cho combo

### Tutor accept parent = confirm all

```ts
private async confirmAllChildren(parentId: string, tutorId: string) {
  const children = await this.prisma.sessionBooking.findMany({
    where: { parentBookingId: parentId, status: 'assigned', tutorId },
  });

  for (const c of children) {
    await this.transition.transitionTo({
      bookingId: c.id,
      to: 'confirmed',
      actorUserId: tutorId,
      actorRole: 'tutor',
      metadata: { auto: true, parentId },
    });
    await this.prisma.sessionBooking.update({
      where: { id: c.id },
      data: { meetingRoomName: `tutor365-${c.id}` },
    });
  }
}
```

> 💡 Combo: 1 accept → confirm parent + N children. Mỗi buổi có Jitsi room riêng.

---

## Slide 6 — meetingRoomName: deterministic

### Public Jitsi public room ID

```ts
const meetingRoomName = `tutor365-${booking.id}`;
const meetingUrl = `https://meet.jit.si/${meetingRoomName}`;
// e.g. https://meet.jit.si/tutor365-b-uuid-abc123
```

**Vì sao deterministic?**

- ✅ Không cần lưu thêm field URL
- ✅ Replayable — biết bookingId là biết URL
- ✅ Tránh collision: prefix `tutor365-` + UUID đảm bảo unique
- ✅ Public Jitsi không cần create room API — đầu tiên ai join sẽ tạo room

---

## Slide 7 — Decline endpoint

```ts
@Auth('tutor')
@Post('bookings/:id/decline')
async decline(
  @Param('id') id: string,
  @CurrentUser('sub') tutorId: string,
  @ZodBody(DeclineDto) body,
) {
  return this.bookings.tutorDecline(id, tutorId, body.reason);
}

const DeclineDto = z.object({
  reason: z.string().trim().min(5).max(500),
});

// Service
async tutorDecline(id: string, tutorId: string, reason: string) {
  const booking = await this.prisma.sessionBooking.findFirst({
    where: { id, tutorId, status: 'assigned' },
  });
  if (!booking) throw new BadRequestException();

  // Combo: decline = decline cả parent + children
  if (booking.recurrenceRule || booking.parentBookingId) {
    return this.declineCombo(booking, tutorId, reason);
  }

  await this.transition.transitionTo({
    bookingId: id,
    to: 'pending_assign',
    actorUserId: tutorId,
    actorRole: 'tutor',
    metadata: { reason, declinedTutorId: tutorId },
  });

  await this.prisma.sessionBooking.update({
    where: { id }, data: { tutorId: null },
  });

  // Notify Hanah
  await this.mailer.sendTutorDeclinedToAdmin(booking, reason).catch(() => {});
}
```

---

## Slide 8 — Combo decline

```ts
private async declineCombo(booking, tutorId, reason) {
  // Find parent id
  const parentId = booking.parentBookingId ?? booking.id;

  // Get parent + all children that this tutor is assigned
  const all = await this.prisma.sessionBooking.findMany({
    where: {
      OR: [{ id: parentId }, { parentBookingId: parentId }],
      tutorId,
      status: 'assigned',
    },
  });

  for (const b of all) {
    await this.transition.transitionTo({
      bookingId: b.id,
      to: 'pending_assign',
      actorUserId: tutorId,
      actorRole: 'tutor',
      metadata: { reason, declinedTutorId: tutorId, auto: b.id !== booking.id },
    });
  }

  await this.prisma.sessionBooking.updateMany({
    where: { id: { in: all.map(b => b.id) } },
    data: { tutorId: null },
  });
}
```

> 💡 Combo decline = atomic — không cho decline lẻ tẻ. Hanah phải reassign 1 Tutor mới cho cả combo.

---

## Slide 9 — Block list dropdown decline

### UX cho Tutor pick reason

```ts
// Frontend dropdown options
const DECLINE_REASONS = [
  'Tôi bận giờ này',
  'Học sinh không phù hợp môn tôi dạy',
  'Lý do cá nhân',
  'Khác (ghi rõ bên dưới)',
];
```

> 💡 Backend không strict reason — FE structured cho UX, BE accept free text.

---

## Slide 10 — Endpoint xem meeting URL

### Sau confirm

```ts
@Auth('tutor', 'student', 'admin')
@Get('bookings/:id/meeting')
async getMeeting(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  const booking = await this.prisma.sessionBooking.findUnique({
    where: { id },
    include: { student: true, tutor: true },
  });
  if (!booking) throw new NotFoundException();

  // Authz: chỉ student liên quan, tutor assigned, hoặc admin
  const allowed = u.role === 'admin'
    || booking.studentId === u.sub
    || booking.tutorId === u.sub;
  if (!allowed) throw new ForbiddenException();

  if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
    throw new BadRequestException('Booking chưa confirmed');
  }

  return {
    roomName: booking.meetingRoomName,
    jitsiUrl: `https://meet.jit.si/${booking.meetingRoomName}`,
    startAt: booking.startAt,
    endAt: new Date(booking.startAt.getTime() + booking.durationHr * 3600_000),
  };
}
```

---

## Slide 11 — Email confirmed template

```html
<!-- booking-confirmed-to-student.html -->
<p>Xin chào {{studentName}},</p>
<p>{{tutorName}} đã confirm buổi học của bạn:</p>
<ul>
  <li>Thời gian: {{startAtFormatted}}</li>
  <li>Môn: {{subjectName}} - {{levelName}}</li>
  <li>Link Jitsi: <a href="{{jitsiUrl}}">{{jitsiUrl}}</a></li>
</ul>
<p>Đúng giờ vào link để bắt đầu học!</p>
```

---

## Slide 12 — Test E2E

```bash
# Setup: booking assigned cho Tutor X

# Tutor list assigned
curl /v1/me/bookings/assigned -H "Authorization: Bearer $TUTOR"
# [{ id: 'b-1', status: 'assigned', student: { fullName }, startAt }]

# Tutor accept
curl -X POST /v1/bookings/b-1/accept -H "Authorization: Bearer $TUTOR"
# { status: 'confirmed', meetingRoomName: 'tutor365-b-1' }

# Student xem meeting URL
curl /v1/bookings/b-1/meeting -H "Authorization: Bearer $STUDENT"
# { jitsiUrl: 'https://meet.jit.si/tutor365-b-1', ... }

# Tutor try decline sau confirm → 400 (đã confirmed)
curl -X POST /v1/bookings/b-1/decline -d '{"reason":"..."}'
# 400 — Không decline được từ status=confirmed

# Test reassign loop:
# 1. Tutor decline ở status=assigned
curl -X POST /v1/bookings/b-2/decline \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"reason":"Bận"}'

# 2. Booking về pending_assign
curl /v1/admin/bookings/pending-assign -H "Authorization: Bearer $ADMIN"
# [{ id: 'b-2', status: 'pending_assign', tutorId: null }]

# 3. Hanah reassign Tutor khác
curl -X POST /v1/admin/bookings/b-2/assign -d '{"tutorId":"u-bao"}'

# 4. Audit log thấy chain
curl /v1/admin/bookings/b-2/audit
# - assign (tutor X)
# - transition.pending_assign (decline reason)
# - assign (tutor Bao)
```

---

## Slide 13 — Tutor view own confirmed schedule

```ts
@Auth('tutor')
@Get('me/schedule')
async mySchedule(
  @CurrentUser('sub') tutorId: string,
  @ZodQuery(ScheduleQuery) q,
) {
  return this.prisma.sessionBooking.findMany({
    where: {
      tutorId,
      status: { in: ['confirmed', 'in_progress'] },
      startAt: { gte: q.from, lte: q.to },
    },
    orderBy: { startAt: 'asc' },
    include: {
      student: { select: { id: true, fullName: true } },
      subject: true, level: true,
    },
  });
}
```

> 💡 FE C4 dùng để render calendar Tutor.

---

## Slide 14 — Section 10 hoàn tất

### Assign flow ready

✅ V30 — Eligible-tutor SQL filter
✅ V31 — Hanah assign + reassign
✅ V32 — Tutor accept/decline + meeting URL

**Section 11 — Live Meeting Integration (Jitsi)** (2 video):

- V33: Sinh meetingRoomName + URL + role-aware redirect
- V34: Iframe External API + attendance + cron reconciliation

> 🚀 Sang Section 11 — feature signature của Tutor365.

---

## Slide 15 — Anti-patterns

```ts
// ❌ Accept không sinh meetingRoomName
update { status: 'confirmed' }
// → Student không biết URL Jitsi

// ❌ meetingRoomName lưu URL đầy đủ
{ meetingRoomName: 'https://meet.jit.si/...' }
// → Migrate sang Jitsi self-host (C8) phải sửa data

// ❌ Decline mà không clear tutorId
update { status: 'pending_assign' }
// tutorId còn → Hanah list pending vẫn thấy assigned

// ❌ Combo accept lẻ tẻ
// → Phá nguyên tắc 1 tutor / 1 combo

// ❌ Trả meeting URL cho user không liên quan
// → Spam Jitsi room — phá lobby
```

---

## Slide 16 — Edge cases

| Case | Behavior |
|------|----------|
| Tutor accept booking cancelled | 400 (status != assigned) |
| Combo parent accept nhưng 1 child Tutor đã có booking khác | Verify lúc assign — không nên xảy ra |
| 2 Tutor có cùng booking assigned (data corrupt) | findFirst tutorId match → an toàn |
| Decline sau quá startAt | Allow nhưng audit + alert |
| Tutor accept rồi xin nghỉ → dùng cancel endpoint | OK |
| Meeting URL request trước startAt 30 phút | Allow (Tutor prep) |

---

## Slide 17 — Bài tập thực hành

### 🎯 Tutor flow

**Bài 1:** Implement accept + decline endpoint.

**Bài 2:** Verify meetingRoomName deterministic format `tutor365-<bookingId>`.

**Bài 3:** Test combo accept: confirm parent + N children.

**Bài 4:** Test reassign loop: assign → decline → reassign → accept.

**Bài 5:** Implement getMeeting endpoint với authz check.

**Bài 6:** Test edge: Student không liên quan xin URL → 403.

**Bài 7:** Implement my schedule endpoint cho Tutor calendar view.

---

## Slide 18 — Race condition: accept + Hanah cancel cùng lúc

```
Hanah: cancel booking → status='cancelled'
Tutor: accept → query lúc đang status='assigned' (snapshot)
  → tx update where status='assigned' → 0 rows updated (đã cancelled)
  → Throw error / no-op
```

```ts
// Service
const updated = await this.prisma.sessionBooking.updateMany({
  where: { id, status: 'assigned' },
  data: { status: 'confirmed' },
});
if (updated.count === 0) {
  // Status đã đổi giữa chừng → re-fetch + raise error
  throw new ConflictException('Booking đã thay đổi trạng thái, refresh page');
}
```

> 💡 Optimistic update pattern an toàn cho concurrent.

---

## Slide 19 — Tổng kết Video 32

### Bạn vừa học

- ✅ Accept endpoint + transition assigned → confirmed
- ✅ Sinh meetingRoomName deterministic `tutor365-<id>`
- ✅ Combo: accept = confirm parent + all children
- ✅ Decline → pending_assign + clear tutorId + notify Hanah
- ✅ Combo decline atomic — kéo cả combo về pending
- ✅ Get meeting URL endpoint với role-based authz
- ✅ Optimistic update chống concurrent change
- ✅ Audit chain rõ ràng cho reassign cycle

> 💪 Tutor accept = ranh giới từ "kế hoạch" sang "buổi học thật"

---

<!-- _class: lead -->

# Tiếp theo: Video 33

## Jitsi Meeting Room Deterministic

Sinh roomName, security config (password, prejoin, lobby), endpoint GET /join redirect.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 33 🚀

> *"Confirmation seals the assignment."*
