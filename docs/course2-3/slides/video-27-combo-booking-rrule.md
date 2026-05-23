---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 27: Combo Booking với RRULE'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Combo Booking
# với RRULE

### Khóa 2-3 — Video 27

**3 buổi/tuần · 1-2 tháng · Parent + Children**

> Combo = subscription nhỏ cho live tutoring

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Combo rule: **3 buổi/tuần × {4, 8} tuần** = {12, 24} buổi
- ✅ Parent booking + N children với `parentBookingId`
- ✅ Tạo **RRULE iCalendar** cho schedule
- ✅ Validate **weeklyDays** array (e.g., [Mon, Wed, Fri])
- ✅ Pricing combo: 150k/giờ (rẻ hơn single 200k)
- ✅ Cancel combo = cancel tất cả children chưa diễn ra

> 🎯 Cuối video: combo 4 tuần × 3 buổi = 12 buổi auto-create

---

## Slide 3 — Combo rules

### Pricing rules (config)

```ts
const COMBO_RULES = {
  hourlyRateVnd: 150_000,
  sessionDurationHr: 1.5,        // mỗi buổi 1.5h
  weeklyFrequency: 3,             // 3 buổi / tuần
  numMonthsOptions: [1, 2],       // 1 hoặc 2 tháng
  // Tổng buổi: 3 × 4 tuần × 1 hoặc 2 tháng = 12 hoặc 24 buổi
};
```

**Ví dụ 1 tháng:**

- 3 buổi/tuần × 4 tuần = 12 buổi
- 12 × 1.5h = 18h
- 18h × 150k = **2.700.000 VND** + tax

---

## Slide 4 — Combo DTO

```ts
export const CreateComboBookingDto = z.object({
  type: z.literal('combo'),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  // Start date (Mon đầu tiên thường)
  startDate: z.coerce.date(),
  durationHr: z.number().min(1.5).max(2.0),
  // Số tháng
  numMonths: z.union([z.literal(1), z.literal(2)]),
  // 3 ngày trong tuần
  weeklyDays: z.array(z.number().int().min(0).max(6)).length(3),
  // Giờ học trong ngày (HH:mm)
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().max(500).optional(),
}).refine((d) => {
  // weeklyDays unique
  return new Set(d.weeklyDays).size === 3;
}, { message: 'weeklyDays phải có 3 ngày khác nhau' });
```

---

## Slide 5 — Generate child schedule

```ts
function generateComboSchedule(input: CreateComboBookingInput): Date[] {
  const numWeeks = input.numMonths * 4;
  const result: Date[] = [];
  const [h, m] = input.timeOfDay.split(':').map(Number);

  // Start from input.startDate, move tới ngày đầu tiên thuộc weeklyDays
  let cursor = new Date(input.startDate);
  cursor.setHours(0, 0, 0, 0);
  while (!input.weeklyDays.includes(cursor.getDay())) {
    cursor.setDate(cursor.getDate() + 1);
  }

  for (let week = 0; week < numWeeks; week++) {
    for (const dow of input.weeklyDays.sort()) {
      // Tính ngày trong tuần này
      const date = new Date(cursor);
      // Move tới dow
      while (date.getDay() !== dow) {
        date.setDate(date.getDate() + 1);
      }
      const slot = new Date(date);
      slot.setHours(h, m, 0, 0);
      result.push(slot);
    }
    // Move sang tuần kế
    cursor.setDate(cursor.getDate() + 7);
  }

  return result;
}
```

---

## Slide 6 — Build RRULE iCalendar

### RFC 5545 RRULE format

```
FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12
```

```ts
function buildRrule(input: CreateComboBookingInput): string {
  const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const days = input.weeklyDays.map(d => dayMap[d]).join(',');
  const count = input.numMonths * 4 * 3;
  return `FREQ=WEEKLY;BYDAY=${days};COUNT=${count}`;
}

// Example
buildRrule({ weeklyDays: [1, 3, 5], numMonths: 1 })
// → "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12"
```

> 💡 Lưu RRULE trong `parent.recurrenceRule` cho iCal export (V37) + replay khi cần regenerate.

---

## Slide 7 — Service.createCombo

```ts
async createCombo(studentId: string, input: CreateComboBookingInput) {
  // ... validate subject, level

  const comboPkg = await this.prisma.sessionPackage.findFirst({
    where: { type: 'combo', isActive: true },
  });

  const schedule = generateComboSchedule(input);
  const rrule = buildRrule(input);

  // Validate working hours cho mỗi instance
  for (const slot of schedule) {
    this.validateWorkingHours(slot, input.durationHr);
  }

  // Total pricing
  const totalHr = schedule.length * input.durationHr;
  const subtotal = Math.floor(comboPkg.hourlyRateVnd * totalHr);
  const pricing = this.calculatePricing(subtotal);

  return this.prisma.$transaction(async (tx) => {
    // 1. Parent booking
    const parent = await tx.sessionBooking.create({
      data: {
        studentId, packageId: comboPkg.id,
        subjectId: input.subjectId, levelId: input.levelId,
        startAt: schedule[0],
        durationHr: input.durationHr,
        status: 'created',
        recurrenceRule: rrule,
      },
    });

    // 2. N children
    await tx.sessionBooking.createMany({
      data: schedule.map(startAt => ({
        studentId, packageId: comboPkg.id,
        subjectId: input.subjectId, levelId: input.levelId,
        startAt, durationHr: input.durationHr,
        status: 'created',
        parentBookingId: parent.id,
      })),
    });

    // 3. Order cho parent
    const order = await tx.order.create({
      data: {
        studentId, type: 'session_combo', refId: parent.id,
        ...pricing, status: 'pending',
        vnpTxnRef: `c-${parent.id}-${Date.now()}`,
        expiresAt: addMinutes(new Date(), 30),
      },
    });
    await tx.sessionBooking.update({ where: { id: parent.id }, data: { orderId: order.id } });

    return { parent, childrenCount: schedule.length, order };
  });
}
```

---

## Slide 8 — Combo paid → all children pending_assign

```ts
// orders.service.ts markPaid
if (order.type === 'session_combo') {
  // Update parent + tất cả children → pending_assign
  await tx.sessionBooking.update({
    where: { id: order.refId },
    data: { status: 'pending_assign' },
  });
  await tx.sessionBooking.updateMany({
    where: { parentBookingId: order.refId },
    data: { status: 'pending_assign' },
  });
}
```

> 💡 Hanah assign **1 tutor cho toàn combo** — không assign từng buổi (Section 10 detail).

---

## Slide 9 — List combo: parent + children expanded

```ts
@Auth('student')
@Get('me/bookings/:id/children')
async listChildren(
  @Param('id') parentId: string,
  @CurrentUser('sub') studentId: string,
) {
  // Verify ownership
  const parent = await this.prisma.sessionBooking.findFirst({
    where: { id: parentId, studentId, recurrenceRule: { not: null } },
  });
  if (!parent) throw new NotFoundException();

  return this.prisma.sessionBooking.findMany({
    where: { parentBookingId: parentId },
    orderBy: { startAt: 'asc' },
    include: {
      tutor: { select: { id: true, fullName: true } },
    },
  });
}
```

---

## Slide 10 — Cancel combo: chỉ children future

```ts
async cancelCombo(parentId: string, studentId: string, reason: string) {
  const parent = await this.prisma.sessionBooking.findFirst({
    where: { id: parentId, studentId, recurrenceRule: { not: null } },
  });
  if (!parent) throw new NotFoundException();

  if (parent.status === 'cancelled') return parent;

  await this.prisma.$transaction(async (tx) => {
    // 1. Cancel parent
    await tx.sessionBooking.update({
      where: { id: parentId },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelledReason: `[STUDENT]: ${reason}` },
    });

    // 2. Cancel children chưa diễn ra
    await tx.sessionBooking.updateMany({
      where: {
        parentBookingId: parentId,
        startAt: { gt: new Date() },
        status: { in: ['created', 'pending_assign', 'assigned', 'confirmed'] },
      },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelledReason: `[STUDENT]: ${reason}` },
    });
  });

  // No refund. Children đã completed giữ nguyên.
  await this.auditLog.record({
    actorUserId: studentId, action: 'combo.cancel',
    entityId: parentId, metadata: { reason },
  });
}
```

---

## Slide 11 — Skip 1 buổi cụ thể

### Student xin nghỉ 1 buổi trong combo

```ts
@Auth('student')
@Post('bookings/:id/skip')
async skipOneSession(
  @Param('id') childId: string,
  @CurrentUser('sub') studentId: string,
  @ZodBody(SkipDto) body,
) {
  const child = await this.prisma.sessionBooking.findFirst({
    where: { id: childId, studentId, parentBookingId: { not: null } },
  });
  if (!child) throw new NotFoundException();
  if (child.startAt < new Date()) throw new BadRequestException('Đã quá thời gian');

  await this.prisma.sessionBooking.update({
    where: { id: childId },
    data: { status: 'cancelled', cancelledReason: `[STUDENT-SKIP]: ${body.reason}` },
  });

  // Tutor được rảnh slot này — không reschedule auto
  // Student có muốn make-up session → tạo single booking riêng
}
```

> 💡 Tutor365 không support reschedule combo session — student tạo single mới nếu cần bù.

---

## Slide 12 — Combo pricing example

```
Input:
  numMonths: 2
  weeklyDays: [1, 3, 5]   // Mon, Wed, Fri
  durationHr: 1.5

Schedule:
  4 weeks × 3 days = 12 sessions / month
  × 2 months = 24 sessions

Pricing:
  24 × 1.5h = 36 hours
  36 × 150_000 = 5_400_000 VND  subtotal
  + 10% tax = 540_000 VND
  + 0 fee
  = 5_940_000 VND total
```

**So với single tương đương:** 24 × 1.5h × 200k = 7.200.000 VND
→ Combo tiết kiệm **1.260.000 VND** (~17%)

---

## Slide 13 — Test E2E

```bash
curl -X POST /v1/bookings \
  -H "Authorization: Bearer $STUDENT" \
  -d '{
    "type": "combo",
    "subjectId": "<>",
    "levelId": "<>",
    "startDate": "2026-06-01",
    "durationHr": 1.5,
    "numMonths": 1,
    "weeklyDays": [1, 3, 5],
    "timeOfDay": "19:00"
  }'

# Response
# {
#   parent: { id: "p1", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12" },
#   childrenCount: 12,
#   order: { totalVnd: 1_980_000 + 198_000 tax = 2_178_000 }
# }

# List children
curl /v1/me/bookings/p1/children -H "Authorization: Bearer $STUDENT"
# 12 child với startAt khác nhau

# Pay (stub)
curl -X POST /v1/dev/vnpay/simulate-paid -d '{"orderId":"..."}'

# All children → pending_assign
curl /v1/me/bookings/p1/children
# 12 children, status=pending_assign
```

---

## Slide 14 — RRULE → iCal feed (V37 preview)

```ts
// V37 — calendar feed
import ical from 'ical-generator';

const cal = ical({ name: 'Tutor365 Schedule' });

// Combo expand RRULE
const parent = await prisma.sessionBooking.findUnique({ where: { id: parentId } });
cal.createEvent({
  start: parent.startAt,
  end: addHours(parent.startAt, parent.durationHr),
  summary: 'Live tutoring',
  repeating: parent.recurrenceRule!,    // RRULE
  location: parent.meetingRoomName ? jitsiUrl : null,
});
```

> 💡 Apple Calendar / Google Calendar support RRULE → tự expand client-side.

---

## Slide 15 — Anti-patterns

```ts
// ❌ Tạo combo không transaction
// Network fail giữa chừng → parent có, children không

// ❌ Cancel combo cancel cả children đã completed
// → Mất lịch sử

// ❌ Pricing duration*frequency mỗi nơi tính lại
// → Sai số → student-server mismatch

// ❌ Weekly days [1, 1, 3]
// → DTO refine unique check

// ❌ numMonths = 3
// → DTO union literal [1, 2] only

// ❌ Combo timeOfDay khác cho mỗi buổi
// → Combo simple: 1 timeOfDay áp dụng cho all buổi
```

---

## Slide 16 — Edge cases

| Case | Behavior |
|------|----------|
| startDate là Wed nhưng weeklyDays=[Mon,Tue,Fri] | Schedule bắt đầu từ Fri tuần đó |
| weeklyDays=[1, 3, 5] và startDate là Sun | Mon tuần sau là buổi 1 |
| timeOfDay 22:30 + duration 1.5h = 24:00 | validateWorkingHours reject |
| Tổng 24 buổi nhưng vài buổi rơi vào lễ | Schedule không skip — manual cancel sau |
| Cancel combo sau 5 buổi | 19 children future → cancel, 5 completed giữ |
| Combo paid xong cancel | Mất tiền, không refund |

---

## Slide 17 — Bài tập thực hành

### 🎯 Combo booking

**Bài 1:** Seed `session_packages` combo.

**Bài 2:** Implement `generateComboSchedule` + unit test với [Mon, Wed, Fri] × 4 tuần = 12 dates.

**Bài 3:** Implement `buildRrule` → verify chuỗi RRULE đúng.

**Bài 4:** Implement createCombo endpoint với transaction parent + N children + order.

**Bài 5:** Test E2E (slide 13).

**Bài 6:** Implement skipOneSession.

**Bài 7:** Implement cancelCombo cascade children future.

---

## Slide 18 — Tổng kết Video 27

### Bạn vừa học

- ✅ Combo rule: 3/tuần × {1,2} tháng = {12, 24} buổi
- ✅ DTO discriminated union với numMonths literal
- ✅ Generate schedule cho N child bookings
- ✅ Build RRULE iCal compliant
- ✅ Parent + children via `parentBookingId`
- ✅ Combo pricing 150k vs single 200k
- ✅ Transaction tạo parent + N + order
- ✅ Cancel cascade chỉ future children
- ✅ Skip 1 buổi với reason

> 💪 Combo = nghệ thuật subscription cho live tutoring

---

<!-- _class: lead -->

# Tiếp theo: Video 28

## Booking State Machine đầy đủ

7 state: created → pending_assign → assigned → confirmed → in_progress → completed | cancelled | no_show.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 28 🚀

> *"Recurrence is a contract with the future."*
