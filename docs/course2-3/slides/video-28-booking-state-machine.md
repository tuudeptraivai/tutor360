---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 28: Booking State Machine'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Booking
# State Machine

### Khóa 2-3 — Video 28

**7 states · Transition rules · Audit**

> 1 state machine clear = 100 bugs tránh được

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Vẽ đầy đủ state machine 7 states + transitions
- ✅ Implement **transition validator** centralized
- ✅ State transitions: created → pending_assign → assigned → confirmed → in_progress → completed
- ✅ Branch: cancelled, no_show
- ✅ Cron reconciliation cho in_progress/completed/no_show (V29)
- ✅ Audit log mỗi transition

> 🎯 Cuối video: invalid transition bị reject, mọi change có audit row

---

## Slide 3 — State machine đầy đủ

```
        created
           │ pay
           ▼
      pending_assign
           │ Hanah assign
           ▼
        assigned ─── Tutor decline ──▶ pending_assign (reassign)
           │ Tutor accept
           │ (server sinh meetingRoomName + URL Jitsi)
           ▼
        confirmed
           │
           ├── client iframe event videoConferenceJoined
           ▼
      in_progress (cron detect)
           │
           ├── duration over + attendance → completed
           └── no one joined within 15p → no_show
                                                  
At any "pre-completed" state:
   → cancelled (Student/Tutor/Hanah action, NO refund)
```

---

## Slide 4 — Enum trong code

```ts
export const BookingStatuses = [
  'created',
  'pending_assign',
  'assigned',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type BookingStatus = typeof BookingStatuses[number];
```

---

## Slide 5 — Transition table

```ts
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  created:         ['pending_assign', 'cancelled'],
  pending_assign:  ['assigned', 'cancelled'],
  assigned:        ['confirmed', 'pending_assign', 'cancelled'], // tutor decline → pending again
  confirmed:       ['in_progress', 'cancelled', 'no_show'],
  in_progress:     ['completed', 'cancelled'],
  completed:       [],
  cancelled:       [],
  no_show:         [],
};

function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

---

## Slide 6 — Centralized transitionTo

```ts
// modules/bookings/booking.transition.ts
@Injectable()
export class BookingTransitionService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async transitionTo(opts: {
    bookingId: string;
    to: BookingStatus;
    actorUserId: string;
    actorRole: 'student' | 'tutor' | 'admin' | 'system';
    metadata?: Record<string, any>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.sessionBooking.findUnique({
        where: { id: opts.bookingId },
      });
      if (!booking) throw new NotFoundException();

      if (!canTransition(booking.status, opts.to)) {
        throw new BadRequestException(
          `Không transition được từ ${booking.status} → ${opts.to}`,
        );
      }

      const additionalFields = this.computeSideEffects(opts.to);
      const updated = await tx.sessionBooking.update({
        where: { id: opts.bookingId },
        data: { status: opts.to, ...additionalFields },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: opts.actorUserId,
          action: `booking.transition.${opts.to}`,
          entityType: 'booking',
          entityId: opts.bookingId,
          metadata: {
            from: booking.status,
            to: opts.to,
            actorRole: opts.actorRole,
            ...opts.metadata,
          },
        },
      });

      return updated;
    });
  }
}
```

---

## Slide 7 — Side effects per state

```ts
private computeSideEffects(to: BookingStatus): Partial<SessionBooking> {
  switch (to) {
    case 'cancelled':
      return { cancelledAt: new Date() };
    case 'no_show':
      return { noShowAt: new Date() };
    case 'completed':
      return { completedAt: new Date() };
    default:
      return {};
  }
}
```

> 💡 Centralized — không phải nhét timestamp khắp nơi.

---

## Slide 8 — Endpoint: Student cancel

```ts
@Auth('student')
@Post('bookings/:id/cancel')
async studentCancel(
  @Param('id') id: string,
  @CurrentUser('sub') studentId: string,
  @ZodBody(CancelDto) body,
) {
  const booking = await this.prisma.sessionBooking.findFirst({
    where: { id, studentId },
  });
  if (!booking) throw new NotFoundException();

  return this.transition.transitionTo({
    bookingId: id,
    to: 'cancelled',
    actorUserId: studentId,
    actorRole: 'student',
    metadata: { reason: body.reason },
  });
}
```

---

## Slide 9 — Endpoint: Tutor accept/decline

```ts
@Auth('tutor')
@Post('bookings/:id/accept')
async tutorAccept(
  @Param('id') id: string,
  @CurrentUser('sub') tutorId: string,
) {
  const booking = await this.prisma.sessionBooking.findFirst({
    where: { id, tutorId, status: 'assigned' },
  });
  if (!booking) throw new BadRequestException('Không có booking assigned cho bạn');

  return this.transition.transitionTo({
    bookingId: id,
    to: 'confirmed',
    actorUserId: tutorId,
    actorRole: 'tutor',
  });
}

@Auth('tutor')
@Post('bookings/:id/decline')
async tutorDecline(
  @Param('id') id: string,
  @CurrentUser('sub') tutorId: string,
  @ZodBody(DeclineDto) body,
) {
  const booking = await this.prisma.sessionBooking.findFirst({
    where: { id, tutorId, status: 'assigned' },
  });
  if (!booking) throw new BadRequestException();

  // Decline = đẩy về pending_assign + clear tutorId
  await this.transition.transitionTo({
    bookingId: id, to: 'pending_assign',
    actorUserId: tutorId, actorRole: 'tutor',
    metadata: { reason: body.reason, declinedTutorId: tutorId },
  });
  await this.prisma.sessionBooking.update({
    where: { id }, data: { tutorId: null },
  });
}
```

---

## Slide 10 — Confirmed → meetingRoomName sinh

### V33 detail. Preview side effect:

```ts
case 'confirmed':
  // Server sinh deterministic Jitsi room name
  return { meetingRoomName: `tutor365-${bookingId}` };
```

> 💡 Khi Tutor accept → BE auto-generate room name + URL `https://meet.jit.si/tutor365-<bookingId>`.

---

## Slide 11 — System transitions (cron)

### `in_progress`, `completed`, `no_show` do cron

```ts
// Cron 5 phút
@Cron('*/5 * * * *')
async reconcile() {
  const now = new Date();

  // 1. confirmed → in_progress
  // (chỉ khi có attendance — V34 detail)
  const startedBookings = await this.prisma.sessionBooking.findMany({
    where: {
      status: 'confirmed',
      startAt: { lte: now },
      attendances: { some: {} },
    },
  });
  for (const b of startedBookings) {
    await this.transition.transitionTo({
      bookingId: b.id, to: 'in_progress',
      actorUserId: 'system', actorRole: 'system',
    });
  }

  // 2. in_progress → completed (sau startAt + duration)
  const endedBookings = await this.prisma.$queryRaw<SessionBooking[]>`
    SELECT * FROM session_bookings
    WHERE status = 'in_progress'
      AND start_at + (duration_hr * INTERVAL '1 hour') < NOW()
  `;
  for (const b of endedBookings) {
    await this.transition.transitionTo({
      bookingId: b.id, to: 'completed',
      actorUserId: 'system', actorRole: 'system',
    });
  }

  // 3. confirmed → no_show (sau startAt + 15p không ai join)
  // V29 detail
}
```

---

## Slide 12 — Sentinel system user

### `actorUserId = 'system'`

```ts
// migrations seed
INSERT INTO users (id, email, role, status, full_name)
VALUES ('system', 'system@tutor365.internal', 'admin', 'active', 'Tutor365 System');
```

Audit log row với actor = system identify cron tự động khác Hanah thủ công.

---

## Slide 13 — Hanah cancel any state

```ts
@AdminOnly()
@Post('admin/bookings/:id/cancel')
async adminCancel(
  @Param('id') id,
  @CurrentUser('sub') adminId,
  @ZodBody(CancelDto) body,
) {
  return this.transition.transitionTo({
    bookingId: id, to: 'cancelled',
    actorUserId: adminId, actorRole: 'admin',
    metadata: { reason: body.reason },
  });
}
```

> 💡 Admin có thể cancel ở mọi state (trừ completed/cancelled/no_show vốn terminal).

---

## Slide 14 — Audit log query

### Hanah xem history 1 booking

```ts
@AdminOnly()
@Get('admin/bookings/:id/audit')
async auditHistory(@Param('id') id: string) {
  return this.prisma.auditLog.findMany({
    where: { entityType: 'booking', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, fullName: true, role: true } } },
  });
}
```

**Output:**

```json
[
  { "action": "booking.transition.pending_assign", "actor": { "id": "system" }, "metadata": {"from": "created"} },
  { "action": "booking.transition.assigned", "actor": { "fullName": "Hanah" }, "metadata": {"tutorId": "..."} },
  { "action": "booking.transition.confirmed", "actor": { "fullName": "Tutor Anh" } },
  ...
]
```

---

## Slide 15 — Visualize state — kèm thời gian

```
Booking #b-123 history:

  2026-05-25 09:00:00  created           by Student Hong
                                          (paid order o-456)
  2026-05-25 09:00:05  pending_assign    by system
                                          (after IPN paid)
  2026-05-25 10:15:30  assigned          by Hanah
                                          (tutor: Anh Tu)
  2026-05-25 11:02:18  confirmed         by Tutor Anh Tu
                                          (room: tutor365-b-123)
  2026-05-26 19:00:42  in_progress       by system
                                          (attendance joined)
  2026-05-26 20:31:05  completed         by system
                                          (duration ended)
```

---

## Slide 16 — Test scenario invalid transition

```bash
# Booking đang status=created (vừa tạo, chưa pay)

# Try assign trực tiếp → reject
curl -X POST /v1/admin/bookings/$BID/assign -d '{"tutorId":"..."}'
# 400 — Không transition được từ created → assigned

# Pay first
curl -X POST /v1/dev/vnpay/simulate-paid -d '{"orderId":"..."}'
# → pending_assign

# Now assign OK
curl -X POST /v1/admin/bookings/$BID/assign -d '{"tutorId":"..."}'
# 200 — assigned

# Try double assign
curl -X POST /v1/admin/bookings/$BID/assign -d '{"tutorId":"..."}'
# 400 — Không transition được từ assigned → assigned

# Re-assign cần đẩy về pending_assign trước (Section 10)
```

---

## Slide 17 — Anti-patterns

```ts
// ❌ Update status trực tiếp
prisma.sessionBooking.update({ data: { status: 'confirmed' } })
// → bỏ qua audit, validation
// → DÙNG transitionTo()

// ❌ Validate transition trong service mỗi nơi
if (b.status !== 'pending_assign') throw ...
if (b.status !== 'assigned') throw ...
// → centralize trong canTransition()

// ❌ Audit log không reasoning
{ action: 'updated', metadata: null }
// → ghi rõ from + to + actorRole + reason

// ❌ Side effect rải rác (cancelledAt set ở 3 nơi)
// → computeSideEffects() centralize

// ❌ Cho phép completed → confirmed
// → state terminal
```

---

## Slide 18 — Bài tập thực hành

### 🎯 State machine

**Bài 1:** Định nghĩa TRANSITIONS table + `canTransition` helper + unit test 8×8 matrix.

**Bài 2:** Implement `BookingTransitionService.transitionTo`.

**Bài 3:** Migrate all endpoint sang dùng `transitionTo` (cancel, assign, accept, decline).

**Bài 4:** Test invalid transition trả 400 với message rõ.

**Bài 5:** Implement audit query endpoint cho Hanah.

**Bài 6:** Bonus: Mermaid diagram state machine — export ra `docs/booking-state.md`.

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| Race condition 2 admin assign cùng booking | Lần 2 fail vì status đã `assigned` không transition lại được |
| Tutor decline ở status=confirmed | 400 — chỉ decline được khi `assigned` |
| Student cancel ở `completed` | 400 — terminal |
| System gọi transitionTo với actor=system | Audit log có actor=system |
| Combo parent cancel — children xử lý? | V27 cascade children future |
| Re-assign sau Tutor decline | OK — đã về `pending_assign` |

---

## Slide 20 — Tổng kết Video 28

### Bạn vừa học

- ✅ 7 states + 9 transitions
- ✅ Centralized `transitionTo` validation
- ✅ Computed side effects per state
- ✅ Audit log mọi transition
- ✅ System actor cho cron
- ✅ Hanah cancel ở mọi state
- ✅ Audit history query
- ✅ Invalid transition trả 400 rõ ràng

> 💪 State machine clear = backend production-grade

---

<!-- _class: lead -->

# Tiếp theo: Video 29

## Cancel + No-Show Detection (Cron)

Cron 5 phút reconcile: sau startAt+15p không ai join → no_show. Student/Tutor cancel với reason.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 29 🚀

> *"States are promises. Transitions are payments."*
