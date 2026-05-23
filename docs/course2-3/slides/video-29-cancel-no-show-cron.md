---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 29: Cancel + No-Show Detection (Cron)'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cancel + No-Show
# Detection (Cron)

### Khóa 2-3 — Video 29

**Cron reconciliation · Idempotent · No webhook**

> Public Jitsi không có webhook — ta phải tự reconcile

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Setup `@nestjs/schedule` + cron job
- ✅ Implement **`BookingReconcileCron`** chạy 5 phút/lần
- ✅ Logic detect **no_show** (sau startAt + 15p chưa join)
- ✅ Logic auto **completed** (sau startAt + duration + có attendance)
- ✅ Logic auto **in_progress** (đã có attendance)
- ✅ Idempotent — chạy lại không đổi gì
- ✅ Cancel flow đầy đủ với reason

> 🎯 Cuối video: booking auto-transition đúng mà không cần Jitsi webhook

---

## Slide 3 — Vì sao cần cron?

### Public Jitsi không bắn webhook

```
✅ Zoom S2S    → webhook meeting.started, meeting.ended
✅ BBB         → webhook meeting events
❌ meet.jit.si → KHÔNG có webhook
```

**Tutor365 chọn Jitsi vì:**
- Free
- Không cần API key/auth
- Cấu hình nhanh

**Trade-off:** Phải dùng:
1. Client iframe External API event (FE post `/attendances`) — V34
2. **Cron reconciliation** — slide này

---

## Slide 4 — Setup @nestjs/schedule

```bash
pnpm --filter @tutor365/api add @nestjs/schedule
```

```ts
// app.module.ts
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ...
  ],
})
export class AppModule {}
```

```ts
// modules/bookings/booking-reconcile.cron.ts
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BookingReconcileCron {
  private readonly logger = new Logger('BookingCron');

  @Cron('*/5 * * * *')   // every 5 minutes
  async reconcile() {
    this.logger.log('Reconcile start');
    await this.advanceToInProgress();
    await this.advanceToCompleted();
    await this.detectNoShow();
    this.logger.log('Reconcile done');
  }
}
```

---

## Slide 5 — advanceToInProgress

### confirmed → in_progress nếu có attendance

```ts
async advanceToInProgress() {
  const cutoffMs = 60_000;       // grace 1 phút sau startAt
  const rows = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM session_bookings b
    WHERE b.status = 'confirmed'
      AND b.start_at <= NOW()
      AND EXISTS (
        SELECT 1 FROM session_attendances a
        WHERE a.booking_id = b.id
      )
  `;

  for (const r of rows) {
    await this.transition.transitionTo({
      bookingId: r.id,
      to: 'in_progress',
      actorUserId: 'system',
      actorRole: 'system',
    });
    this.logger.log(`Booking ${r.id} → in_progress`);
  }
}
```

> 💡 Attendance row được tạo bởi Jitsi iframe event `videoConferenceJoined` (V34).

---

## Slide 6 — advanceToCompleted

### in_progress → completed sau duration

```ts
async advanceToCompleted() {
  const rows = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM session_bookings b
    WHERE b.status = 'in_progress'
      AND b.start_at + (b.duration_hr * INTERVAL '1 hour') < NOW()
  `;

  for (const r of rows) {
    await this.transition.transitionTo({
      bookingId: r.id,
      to: 'completed',
      actorUserId: 'system',
      actorRole: 'system',
    });
    this.logger.log(`Booking ${r.id} → completed`);
  }
}
```

> 💡 `startAt + durationHr * INTERVAL '1 hour'` = thời điểm kết thúc.

---

## Slide 7 — detectNoShow

### confirmed → no_show nếu sau 15p không ai join

```ts
async detectNoShow() {
  const rows = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM session_bookings b
    WHERE b.status = 'confirmed'
      AND b.start_at + INTERVAL '15 minutes' < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM session_attendances a
        WHERE a.booking_id = b.id
      )
  `;

  for (const r of rows) {
    await this.transition.transitionTo({
      bookingId: r.id,
      to: 'no_show',
      actorUserId: 'system',
      actorRole: 'system',
    });
    this.logger.log(`Booking ${r.id} → no_show`);
    // Notify both: student + tutor
    await this.mailer.sendNoShowNotification(r.id).catch(() => {});
  }
}
```

---

## Slide 8 — Idempotency

### Cron có thể chạy chồng nếu phiên trước chưa xong

```ts
@Cron('*/5 * * * *')
async reconcile() {
  if (this.running) {
    this.logger.warn('Previous reconcile still running, skipping');
    return;
  }
  this.running = true;
  try {
    // ...
  } finally {
    this.running = false;
  }
}
```

> 💡 Cách 2: distributed lock với Redis (C6). MVP in-memory đủ.

**Idempotent qua state check:**
- `transitionTo` đã check `canTransition` → không double trigger
- Run 2 lần → lần 2 không có row match query → no-op

---

## Slide 9 — Cancel flow đầy đủ

### Student / Tutor / Hanah đều cancel được

```ts
// Schema CancelDto chung
const CancelDto = z.object({
  reason: z.string().trim().min(5).max(500),
});

// Student
@Auth('student')
@Post('bookings/:id/cancel')
async studentCancel(@Param('id') id, @CurrentUser('sub') sid, @ZodBody(CancelDto) body) {
  const b = await this.prisma.sessionBooking.findFirst({ where: { id, studentId: sid } });
  if (!b) throw new NotFoundException();
  return this.transition.transitionTo({
    bookingId: id, to: 'cancelled',
    actorUserId: sid, actorRole: 'student',
    metadata: { reason: body.reason },
  });
}

// Tutor (assigned)
@Auth('tutor')
@Post('bookings/:id/cancel-by-tutor')
async tutorCancel(@Param('id') id, @CurrentUser('sub') tid, @ZodBody(CancelDto) body) {
  const b = await this.prisma.sessionBooking.findFirst({ where: { id, tutorId: tid } });
  if (!b) throw new NotFoundException();
  // Tutor cancel sau confirmed → notify Hanah + Student
  return this.transition.transitionTo({
    bookingId: id, to: 'cancelled',
    actorUserId: tid, actorRole: 'tutor',
    metadata: { reason: body.reason },
  });
}

// Admin (any)
@AdminOnly()
@Post('admin/bookings/:id/cancel')
async adminCancel(@Param('id') id, @CurrentUser('sub') aid, @ZodBody(CancelDto) body) {
  return this.transition.transitionTo({
    bookingId: id, to: 'cancelled',
    actorUserId: aid, actorRole: 'admin',
    metadata: { reason: body.reason },
  });
}
```

---

## Slide 10 — Cancel rule khác nhau theo role

### Có nên hạn chế khi quá gần startAt?

```ts
// Trade-off: hiện tại Tutor365 cho phép cancel mọi lúc, không refund

// Tutor365 KHÔNG implement:
// if (booking.startAt - now < 24h) → "Yêu cầu xác nhận tutor"
// → Tốn complexity, business chưa cần

// Đơn giản:
// - Cancel = mất tiền (Q6 no refund)
// - Cancel late = tutor có quyền report (notification cho Hanah)
```

---

## Slide 11 — Notify cancel side

```ts
async transitionTo(opts) {
  const result = await this.prisma.$transaction(/* ... */);

  // Side effect: notify based on actor
  if (opts.to === 'cancelled') {
    const booking = await this.prisma.sessionBooking.findUnique({
      where: { id: opts.bookingId },
      include: { student: true, tutor: true },
    });
    if (opts.actorRole === 'student') {
      await this.mailer.sendCancelledByStudentToTutor(booking).catch(() => {});
    } else if (opts.actorRole === 'tutor') {
      await this.mailer.sendCancelledByTutorToStudent(booking).catch(() => {});
      await this.mailer.sendCancelledByTutorToAdmin(booking).catch(() => {});
    }
  }

  return result;
}
```

---

## Slide 12 — Stats Hanah dashboard

### % no_show / cancel để monitor

```ts
@AdminOnly()
@Get('admin/bookings/stats')
async stats() {
  const last30Days = subDays(new Date(), 30);
  const all = await this.prisma.sessionBooking.count({
    where: { createdAt: { gte: last30Days } },
  });
  const completed = await this.prisma.sessionBooking.count({
    where: { createdAt: { gte: last30Days }, status: 'completed' },
  });
  const cancelled = await this.prisma.sessionBooking.count({
    where: { createdAt: { gte: last30Days }, status: 'cancelled' },
  });
  const noShow = await this.prisma.sessionBooking.count({
    where: { createdAt: { gte: last30Days }, status: 'no_show' },
  });

  return {
    last30Days: all,
    completedRate: Math.round((completed / all) * 100),
    cancelledRate: Math.round((cancelled / all) * 100),
    noShowRate: Math.round((noShow / all) * 100),
  };
}
```

---

## Slide 13 — Manual override (admin tools)

### Force transition cho edge case

```ts
@AdminOnly()
@Post('admin/bookings/:id/force-transition')
async forceTransition(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(ForceDto) body,
) {
  // Bypass canTransition table — only admin
  await this.prisma.sessionBooking.update({
    where: { id }, data: { status: body.to },
  });
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'booking.force_transition',
    entityId: id,
    metadata: { to: body.to, reason: body.reason },
  });
}
```

> ⚠️ Dùng cẩn thận. Audit log có severity=high.

---

## Slide 14 — Test cron behavior

```bash
# Setup: booking confirmed, startAt = now - 20 phút, không attendance

# Manual trigger cron để test
curl -X POST /v1/admin/cron/booking-reconcile -H "Authorization: Bearer $ADMIN"

# Verify
curl /v1/me/bookings/$BID -H "Authorization: Bearer $STUDENT"
# status: no_show

# Email gửi cả student + tutor (check MailPit)
```

**Trigger endpoint dev:**

```ts
@AdminOnly()
@Post('admin/cron/booking-reconcile')
async manualReconcile() {
  await this.cron.reconcile();
  return { ok: true };
}
```

---

## Slide 15 — Audit log cleanup (long-term)

### Audit table sẽ phình

```ts
@Cron('0 3 * * 0')   // Sun 3am
async cleanupOldAuditLogs() {
  const cutoff = subDays(new Date(), 365);   // 1 year retention
  const { count } = await this.prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      action: { in: ['booking.transition.in_progress', 'booking.transition.completed'] },
    },
  });
  this.logger.log(`Pruned ${count} old audit logs`);
}
```

> 💡 Compliance: giữ critical action (cancel, payout) lâu hơn → policy theo entity type.

---

## Slide 16 — Section 9 hoàn tất

### Booking layer ready

✅ V26 — Single booking
✅ V27 — Combo booking với RRULE
✅ V28 — State machine 7 states
✅ V29 — Cron reconciliation + cancel flow

**Section 10 — Hanah Assign Flow** (3 video):

- V30: Eligible-tutor SQL filter
- V31: Hanah assign endpoint
- V32: Tutor accept/decline + reassign

> 🚀 Sang Section 10 — bước assign Tutor cho booking.

---

## Slide 17 — Anti-patterns

```ts
// ❌ Detect no_show với grace = 0
// → Connect lag 2s → false positive no_show

// ❌ Cron không idempotent
// → 2 cron concurrent → race condition

// ❌ Cron không skip nếu running
// → Job chồng đè nhau

// ❌ Cancel mà không reason
// → Audit log trống nghĩa

// ❌ Hardcode no_show threshold 15p khắp nơi
// → Đặt trong pricing_rules: NO_SHOW_THRESHOLD_MINUTES

// ❌ Stop service mà có cron đang chạy
// → Truncate audit row → rollback transaction
// → enableShutdownHooks() đảm bảo
```

---

## Slide 18 — Edge cases

| Case | Behavior |
|------|----------|
| Student join lúc startAt + 14:59 (suýt no_show) | Cron tiếp theo 5p sau → đã có attendance → in_progress |
| Cron timing: startAt + 14p, chưa attendance | Đợi 1-5p nữa cho cron tiếp |
| Tutor join nhưng student không | OK — có attendance → in_progress; nhưng V34 logic tách 2 attendance riêng |
| Combo child cancel parent → cascade các child future | V27 đã handle |
| Reconcile + Tutor accept concurrent | Transition lock — Tutor accept wins (assigned → confirmed) |

---

## Slide 19 — Bài tập thực hành

### 🎯 Cron + cancel

**Bài 1:** Setup `@nestjs/schedule` + cron 5p.

**Bài 2:** Implement 3 advance functions + idempotent guard.

**Bài 3:** Implement cancel endpoint cho 3 role + reason validation.

**Bài 4:** Test no_show: setup booking confirmed quá 15p chưa attendance → run cron → verify `status=no_show`.

**Bài 5:** Test in_progress: post 1 attendance row → run cron → verify status.

**Bài 6:** Implement stats endpoint Hanah.

**Bài 7:** Bonus: Manual override force-transition cho admin.

---

## Slide 20 — Tổng kết Video 29

### Bạn vừa học

- ✅ Cron 5 phút reconcile pattern
- ✅ 3 functions: advanceInProgress, advanceCompleted, detectNoShow
- ✅ Idempotent via state guard
- ✅ Mutex `running` flag
- ✅ Cancel 3 role với reason
- ✅ Side effect: notify dựa actor
- ✅ Stats dashboard Hanah
- ✅ Manual override (force-transition)
- ✅ Audit cleanup pattern

> 💪 Reconciliation chuẩn = bù cho việc thiếu webhook

---

<!-- _class: lead -->

# Tiếp theo: Video 30

## Eligible-Tutor SQL Filter

Hanah xem booking pending → system suggest Tutor đủ điều kiện qua SQL phức tạp.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 30 🚀

> *"Periodic jobs are the heartbeat of distributed systems."*
