---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 31: Hanah Assign Endpoint'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Hanah Assign
# Endpoint

### Khóa 2-3 — Video 31

**Pick Tutor · Idempotent · Notify**

> Quyết định của Hanah biến booking thành 1 buổi học thật

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **`POST /v1/admin/bookings/:id/assign`**
- ✅ Verify Tutor đủ điều kiện trước khi assign
- ✅ Transaction: update booking + state transition
- ✅ Combo: assign 1 Tutor cho all children
- ✅ Email notify Tutor + Student
- ✅ Idempotency: gọi 2 lần không double effect

> 🎯 Cuối video: Hanah pick Tutor → booking thành `assigned` + Tutor có notification

---

## Slide 3 — Assign endpoint

```ts
@AdminOnly()
@Post('admin/bookings/:id/assign')
async assign(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(AssignDto) body,
) {
  return this.assignments.assign(id, body.tutorId, adminId);
}

export const AssignDto = z.object({
  tutorId: z.string().uuid(),
});
```

---

## Slide 4 — Service.assign

```ts
async assign(bookingId: string, tutorId: string, adminId: string) {
  const booking = await this.prisma.sessionBooking.findUnique({
    where: { id: bookingId },
    include: { package: true },
  });
  if (!booking) throw new NotFoundException();

  // Idempotent: đã assigned đúng tutor → trả luôn
  if (booking.status === 'assigned' && booking.tutorId === tutorId) {
    return booking;
  }

  if (booking.status !== 'pending_assign') {
    throw new BadRequestException(`Không assign được từ status=${booking.status}`);
  }

  // Verify tutor approved
  const profile = await this.prisma.tutorProfile.findUnique({ where: { userId: tutorId } });
  if (!profile || profile.approveStatus !== 'approved') {
    throw new BadRequestException('Tutor chưa approved');
  }

  // Verify tutor eligible (re-run filter — defense in depth)
  const eligible = await this.eligibleTutors({
    startAt: booking.startAt,
    durationHr: booking.durationHr,
    subjectId: booking.subjectId,
    levelId: booking.levelId,
  });
  if (!eligible.find(t => t.userId === tutorId)) {
    throw new BadRequestException('Tutor không đủ điều kiện cho booking này');
  }

  // For combo: verify với tất cả children
  if (booking.recurrenceRule) {
    await this.verifyEligibleForCombo(bookingId, tutorId);
  }

  return this.prisma.$transaction(async (tx) => {
    await tx.sessionBooking.update({
      where: { id: bookingId },
      data: { tutorId, status: 'assigned' },
    });

    // Combo: assign children
    if (booking.recurrenceRule) {
      await tx.sessionBooking.updateMany({
        where: { parentBookingId: bookingId, status: 'pending_assign' },
        data: { tutorId, status: 'assigned' },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: adminId,
        action: 'booking.assign',
        entityType: 'booking',
        entityId: bookingId,
        metadata: { tutorId, isCombo: !!booking.recurrenceRule },
      },
    });

    return tx.sessionBooking.findUnique({ where: { id: bookingId } });
  });
}
```

---

## Slide 5 — verifyEligibleForCombo

```ts
private async verifyEligibleForCombo(parentId: string, tutorId: string) {
  const children = await this.prisma.sessionBooking.findMany({
    where: { parentBookingId: parentId, status: 'pending_assign' },
    orderBy: { startAt: 'asc' },
  });

  for (const c of children) {
    const eligible = await this.eligibleTutors({
      startAt: c.startAt,
      durationHr: c.durationHr,
      subjectId: c.subjectId,
      levelId: c.levelId,
    });
    if (!eligible.find(t => t.userId === tutorId)) {
      throw new BadRequestException(
        `Tutor không rảnh buổi ${c.startAt.toISOString()} (id=${c.id})`,
      );
    }
  }
}
```

> 💡 Strict — combo buộc Tutor rảnh mọi buổi. Hanah phải pick đúng 1 Tutor cover toàn bộ.

---

## Slide 6 — Email notification

```ts
async assign(...) {
  const result = await this.prisma.$transaction(/* ... */);

  // Side effect ngoài transaction (best-effort)
  const booking = result;
  const tutor = await this.usersService.findById(tutorId);
  const student = await this.usersService.findById(booking.studentId);

  await Promise.all([
    this.mailer.sendAssignedToTutor(tutor.email, booking, student.fullName).catch(() => {}),
    this.mailer.sendAssignedToStudent(student.email, booking, tutor.fullName).catch(() => {}),
  ]);

  return result;
}
```

**Email Tutor:**

```
Xin chào Anh Tu,
Bạn vừa được Hanah assign 1 buổi học live:
- Học sinh: Hong Nguyen
- Môn: Toán học, Lớp 10
- Thời gian: Mon 25/05/2026, 09:30 - 11:00 (1.5h)
- Vui lòng confirm: <link>
```

---

## Slide 7 — Reassign khi Tutor decline

### Tutor decline → quay về pending_assign

```ts
// (V28 đã handle decline transition)
// Service refresh

@AdminOnly()
@Post('admin/bookings/:id/reassign')
async reassign(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(AssignDto) body,
) {
  const booking = await this.findById(id);

  // Reset trước nếu đang assigned/confirmed
  if (['assigned', 'confirmed'].includes(booking.status)) {
    await this.prisma.$transaction([
      this.prisma.sessionBooking.update({
        where: { id }, data: { status: 'pending_assign', tutorId: null },
      }),
      this.prisma.auditLog.create({
        data: { actorUserId: adminId, action: 'booking.reset_for_reassign', entityId: id },
      }),
    ]);
  }

  return this.assign(id, body.tutorId, adminId);
}
```

> 💡 Reassign = combo của reset + assign — 2 audit row riêng để truy vết.

---

## Slide 8 — List pending_assign cho Hanah

```ts
@AdminOnly()
@Get('admin/bookings/pending-assign')
async listPending(@ZodQuery(PendingQuery) q) {
  const where: any = { status: 'pending_assign', parentBookingId: null };
  if (q.subjectId) where.subjectId = q.subjectId;
  if (q.from) where.startAt = { gte: q.from };
  if (q.to) where.startAt = { ...(where.startAt ?? {}), lte: q.to };

  return this.prisma.sessionBooking.findMany({
    where,
    orderBy: { startAt: 'asc' },     // urgent first
    include: {
      student: { select: { id: true, fullName: true } },
      subject: true,
      level: true,
      package: true,
    },
    take: 100,
  });
}
```

> 💡 Sort by startAt ASC — booking gần nhất ở đầu cho Hanah ưu tiên.

---

## Slide 9 — Stats: pending age

### Dashboard alert nếu pending > 24h

```ts
@AdminOnly()
@Get('admin/bookings/pending-stats')
async pendingStats() {
  const pending = await this.prisma.sessionBooking.findMany({
    where: { status: 'pending_assign', parentBookingId: null },
    select: { id: true, startAt: true, createdAt: true },
  });

  const now = Date.now();
  const urgentCount = pending.filter(b => {
    const minutesUntilStart = (b.startAt.getTime() - now) / 60_000;
    return minutesUntilStart < 24 * 60;        // <24h to start
  }).length;

  const oldPendingCount = pending.filter(b => {
    const ageHours = (now - b.createdAt.getTime()) / 3_600_000;
    return ageHours > 24;                       // pending >24h
  }).length;

  return {
    totalPending: pending.length,
    urgent: urgentCount,
    overdue: oldPendingCount,
  };
}
```

---

## Slide 10 — Re-check eligibility at assign time

### Defense in depth

```ts
// Filter ở list (slide V30) cho UX
// Filter ở assign endpoint — strict re-check
```

**Vì sao re-check?**

- Tutor có thể vừa accept booking khác → giờ double-book
- Tutor profile bị suspend giữa khi list + lúc click assign
- Race condition 2 admin assign

> 💡 Read-modify-write pattern: list, pick, **re-validate trước commit**.

---

## Slide 11 — Audit history endpoint

```ts
@AdminOnly()
@Get('admin/bookings/:id/audit')
async auditHistory(@Param('id') id: string) {
  const logs = await this.prisma.auditLog.findMany({
    where: { entityType: 'booking', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, fullName: true, role: true } } },
  });
  return logs.map(l => ({
    id: l.id,
    at: l.createdAt,
    action: l.action,
    actor: l.actor ? { fullName: l.actor.fullName, role: l.actor.role } : null,
    metadata: l.metadata,
  }));
}
```

---

## Slide 12 — Test E2E

```bash
# Setup: booking pending_assign + Tutor eligible

# Hanah list eligible
curl /v1/admin/bookings/$BID/eligible-tutors -H "Authorization: Bearer $ADMIN"
# [{ userId, fullName, avgRating, ... }]

# Assign
curl -X POST /v1/admin/bookings/$BID/assign \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"tutorId":"u-anh-tu"}'
# 200 — { status: 'assigned', tutorId: 'u-anh-tu' }

# Idempotent — gọi lại OK
curl -X POST /v1/admin/bookings/$BID/assign -d '{"tutorId":"u-anh-tu"}'
# 200 — return same

# Assign Tutor khác → fail (đã assigned)
curl -X POST /v1/admin/bookings/$BID/assign -d '{"tutorId":"u-bao"}'
# 400

# Reassign
curl -X POST /v1/admin/bookings/$BID/reassign -d '{"tutorId":"u-bao"}'
# 200

# Audit
curl /v1/admin/bookings/$BID/audit -H "Authorization: Bearer $ADMIN"
# [{ action: 'assign', actor: Hanah, metadata: {tutorId: anh-tu} },
#  { action: 'reset_for_reassign', ... },
#  { action: 'assign', metadata: {tutorId: bao} }]

# Tutor confirm (V32)
curl -X POST /v1/bookings/$BID/accept -H "Authorization: Bearer $TUTOR_BAO"
```

---

## Slide 13 — Anti-patterns

```ts
// ❌ Assign mà không re-check eligibility
PATCH booking { tutorId, status: 'assigned' }
// → double-book có thể xảy ra trong window

// ❌ Combo assign khác tutor cho mỗi child
// → Combo mất ý nghĩa (Student book 1 Tutor)

// ❌ Audit log thiếu metadata
{ action: 'assign', metadata: null }
// → không biết assign ai

// ❌ Email send sync trong transaction
await transaction:
  update booking
  await sendEmail  // ← block lock

// ❌ Trả raw `Booking` không include relations
// → FE phải refetch tutor info

// ❌ Cho Hanah assign tutor inactive
// → Section 11 phát URL Jitsi cho tutor không tồn tại
```

---

## Slide 14 — Edge cases

| Case | Behavior |
|------|----------|
| Assign tutor pending_admin_approve | 400 |
| Assign tutor suspended | 400 |
| Booking đã ở status=assigned, Hanah click assign cùng tutor | Idempotent return 200 |
| Booking ở `confirmed` (Tutor đã accept) | 400 — phải reassign |
| Race: 2 admin assign cùng booking | Lần 2 fail (status đã != pending_assign) |
| Combo: 1 child rơi vào ngày Tutor không rảnh | Reject với rõ id child |
| Booking startAt = 5 phút sau khi assign | OK — Tutor confirm cũng kịp |

---

## Slide 15 — Bài tập thực hành

### 🎯 Assign full flow

**Bài 1:** Implement endpoint POST assign + re-check eligibility.

**Bài 2:** Implement reassign endpoint.

**Bài 3:** Implement listPending cho Hanah + stats.

**Bài 4:** Test idempotent (slide 12).

**Bài 5:** Test combo assign: verify all children cùng tutorId.

**Bài 6:** Test edge: Tutor rảnh 11/12 buổi combo → assign reject với detail.

**Bài 7:** Bonus: dashboard endpoint cho Hanah hiển thị 5 booking pending urgent + actions.

---

## Slide 16 — Email template

```html
<!-- assigned-to-tutor.html -->
<p>Xin chào {{tutorName}},</p>
<p>Hanah vừa giao bạn buổi học mới:</p>
<ul>
  <li>Học sinh: {{studentName}}</li>
  <li>Môn: {{subjectName}} - {{levelName}}</li>
  <li>Thời gian: {{startAtFormatted}}</li>
  <li>Thời lượng: {{durationHr}} giờ</li>
  {{#if isCombo}}<li>Combo: {{childrenCount}} buổi</li>{{/if}}
</ul>
<p>
  <a href="{{baseUrl}}/me/bookings/{{bookingId}}">Confirm/Decline</a>
</p>
<p><i>Vui lòng confirm trong vòng 24h.</i></p>
```

---

## Slide 17 — Tutor ack timeout (advanced)

### Pattern: Auto cancel nếu Tutor không confirm 24h

```ts
@Cron('0 */6 * * *')   // mỗi 6h
async autoCancelStaleAssigned() {
  const cutoff = subHours(new Date(), 24);
  const rows = await this.prisma.sessionBooking.findMany({
    where: {
      status: 'assigned',
      updatedAt: { lt: cutoff },
    },
  });
  for (const b of rows) {
    await this.transition.transitionTo({
      bookingId: b.id, to: 'pending_assign',
      actorUserId: 'system', actorRole: 'system',
      metadata: { reason: 'Tutor không confirm 24h, reset cho Hanah' },
    });
    await this.prisma.sessionBooking.update({
      where: { id: b.id }, data: { tutorId: null },
    });
  }
}
```

> 💡 Tutor365 MVP có thể skip — Hanah notice manual qua dashboard.

---

## Slide 18 — Stats dashboard endpoint

```ts
@AdminOnly()
@Get('admin/dashboard')
async dashboard() {
  return {
    bookings: await this.bookingsService.pendingStats(),
    courses: await this.coursesService.adminListStats(),
    tutors: await this.tutorsService.adminStats(),
    revenue: await this.payoutsService.revenueThisMonth(),
  };
}
```

**FE render:**

```
┌────────────────────────────────┐
│ Pending bookings: 5 (1 urgent) │
│ Pending courses: 2             │
│ Pending tutor profile: 3       │
│ Revenue tháng này: 45M VND     │
└────────────────────────────────┘
```

---

## Slide 19 — Tổng kết Video 31

### Bạn vừa học

- ✅ Endpoint assign + reassign
- ✅ Defense-in-depth re-check eligibility trước khi assign
- ✅ Idempotent (same tutor return luôn)
- ✅ Combo: assign 1 Tutor cho all children
- ✅ Transaction: update parent + children + audit
- ✅ Email notify Tutor + Student fire-and-forget
- ✅ List pending sort by startAt ASC
- ✅ Pending stats cho dashboard alert
- ✅ Audit history endpoint

> 💪 Assign chắc chắn = Hanah workflow mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 32

## Tutor Accept/Decline + Reassign

Tutor accept → confirmed + sinh Jitsi URL. Tutor decline → pending_assign + reassign.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 32 🚀

> *"Assigning is not picking — it's committing."*
