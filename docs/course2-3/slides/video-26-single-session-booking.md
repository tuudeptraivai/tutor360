---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 26: Single Session Booking'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Single Session
# Booking

### Khóa 2-3 — Video 26

**Student book buổi 1.5-2h · Order pending · Pay**

> 1 đơn giản trước — combo phức tạp sau

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `session_bookings` cho single
- ✅ Endpoint **`POST /v1/bookings`** type=single
- ✅ Pricing: **200.000 VND/giờ** (pricing_rules)
- ✅ Validate **startAt** future + giờ làm việc (8-22h)
- ✅ Tạo order pending → return VNPay URL
- ✅ After paid → status=pending_assign (chờ Hanah)
- ✅ Cancel order → reset booking

> 🎯 Cuối video: Student book 1 buổi → pay (stub) → status pending_assign

---

## Slide 3 — Schema `session_bookings`

```ts
type SessionBooking = {
  id: string;
  studentId: string;
  tutorId: string | null;                // null khi pending_assign
  packageId: string;                     // FK session_packages (single, combo)
  subjectId: string;
  levelId: string;
  startAt: Date;
  durationHr: number;                    // 1.5 - 2.0
  status: BookingStatus;                 // see V28
  meetingRoomName: string | null;        // Jitsi room name (V33)
  cancelledReason: string | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  completedAt: Date | null;
  createdByAdminId: string | null;
  parentBookingId: string | null;        // combo child references parent
  recurrenceRule: string | null;         // RRULE cho combo
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

---

## Slide 4 — Bảng `session_packages`

```ts
type SessionPackage = {
  id: string;
  type: 'single' | 'combo';
  hourlyRateVnd: number;                 // 200000 cho single, 150000 combo
  sessionDurationHr: number;             // mặc định 1.5
  weeklyFrequency: number | null;        // combo: 3 buổi/tuần
  numWeeksOptions: number[];             // combo: [4, 8] tương ứng 1-2 tháng
  isActive: boolean;
};
```

**Seed:**

```ts
await prisma.sessionPackage.create({
  data: { type: 'single', hourlyRateVnd: 200_000, sessionDurationHr: 1.5, isActive: true },
});
await prisma.sessionPackage.create({
  data: {
    type: 'combo', hourlyRateVnd: 150_000, sessionDurationHr: 1.5,
    weeklyFrequency: 3, numWeeksOptions: [4, 8], isActive: true,
  },
});
```

---

## Slide 5 — Single booking DTO

```ts
export const CreateSingleBookingDto = z.object({
  type: z.literal('single'),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  startAt: z.coerce.date(),
  durationHr: z.number().min(1.5).max(2.0),
  note: z.string().max(500).optional(),
}).refine(d => d.startAt.getTime() > Date.now() + 60 * 60_000, {
  message: 'startAt phải sau ít nhất 1 giờ',
  path: ['startAt'],
});
```

**Constraint:**

- ≥ 1.5h và ≤ 2h
- startAt > now + 1h (để Hanah có thời gian assign)
- subject + level phải hợp lệ

---

## Slide 6 — Endpoint POST /v1/bookings

```ts
@Auth('student')
@Post('bookings')
async create(
  @CurrentUser('sub') studentId: string,
  @ZodBody(CreateBookingDto) body,
) {
  if (body.type === 'single') {
    return this.bookings.createSingle(studentId, body);
  }
  if (body.type === 'combo') {
    return this.bookings.createCombo(studentId, body);
  }
}

// Discriminated union
export const CreateBookingDto = z.discriminatedUnion('type', [
  CreateSingleBookingDto,
  CreateComboBookingDto,    // V27
]);
```

---

## Slide 7 — Service.createSingle

```ts
async createSingle(studentId: string, input: CreateSingleBookingInput) {
  // 1. Validate subject + level exist
  const [subject, level] = await Promise.all([
    this.prisma.subject.findUnique({ where: { id: input.subjectId, isActive: true } as any }),
    this.prisma.level.findUnique({ where: { id: input.levelId, isActive: true } as any }),
  ]);
  if (!subject || !level) throw new BadRequestException('Subject/Level không hợp lệ');

  // 2. Validate working hours (8-22h GMT+7)
  this.validateWorkingHours(input.startAt, input.durationHr);

  // 3. Get pricing
  const singlePkg = await this.prisma.sessionPackage.findFirst({
    where: { type: 'single', isActive: true },
  });
  if (!singlePkg) throw new Error('Package single chưa configured');

  const subtotal = Math.floor(singlePkg.hourlyRateVnd * input.durationHr);
  const pricing = this.calculatePricing(subtotal);

  // 4. Transaction: create booking + order
  return this.prisma.$transaction(async (tx) => {
    const booking = await tx.sessionBooking.create({
      data: {
        studentId, packageId: singlePkg.id,
        subjectId: input.subjectId, levelId: input.levelId,
        startAt: input.startAt, durationHr: input.durationHr,
        status: 'created',
      },
    });
    const order = await tx.order.create({
      data: {
        studentId, type: 'session_single', refId: booking.id,
        ...pricing,
        status: 'pending',
        vnpTxnRef: `b-${booking.id}-${Date.now()}`,
        expiresAt: addMinutes(new Date(), 30),
      },
    });
    await tx.sessionBooking.update({
      where: { id: booking.id },
      data: { orderId: order.id },
    });
    return { booking, order, vnpayUrl: await this.vnpayService.buildPayUrl(order) };
  });
}
```

---

## Slide 8 — validateWorkingHours

```ts
private validateWorkingHours(startAt: Date, durationHr: number) {
  // Convert to Asia/Ho_Chi_Minh
  const zoned = utcToZonedTime(startAt, 'Asia/Ho_Chi_Minh');
  const hour = zoned.getHours() + zoned.getMinutes() / 60;
  const endHour = hour + durationHr;

  if (hour < 8 || endHour > 22) {
    throw new BadRequestException('Chỉ book được trong khung 8h-22h GMT+7');
  }
}
```

> 💡 Giới hạn business — Tutor không dạy ngoài giờ làm việc. Có thể configurable trong `pricing_rules`.

---

## Slide 9 — calculatePricing

```ts
private async calculatePricing(subtotal: number) {
  const rules = await this.getPricingRules();
  const taxAmount = Math.floor(subtotal * (rules.taxPercent / 100));
  const feeAmount = rules.feeFixedVnd;
  const totalVnd = subtotal + taxAmount + feeAmount;
  return { subtotal, taxAmount, feeAmount, totalVnd };
}

// pricing_rules table (Section 13)
const rules = {
  taxPercent: 10,
  feeFixedVnd: 0,
};
```

**Ví dụ:** 1.5h × 200k = 300k subtotal
- Tax 10% = 30k
- Fee = 0
- **Total = 330k VND**

---

## Slide 10 — After paid → pending_assign

### Section 21 markPaid bổ sung cho session

```ts
async markPaid(orderId, meta) {
  // ... existing course logic

  if (order.type === 'session_single') {
    await tx.sessionBooking.update({
      where: { id: order.refId },
      data: { status: 'pending_assign' },
    });
  }
  // Section 27 sẽ handle session_combo
}
```

**State transition:**

```
created → pending_assign  (sau IPN paid)
```

> 💡 V28 chi tiết state machine.

---

## Slide 11 — Student xem bookings

```ts
@Auth('student')
@Get('me/bookings')
async listMine(
  @CurrentUser('sub') studentId,
  @ZodQuery(ListBookingsQuery) q,
) {
  const where: any = { studentId, parentBookingId: null };  // chỉ parent / single
  if (q.status !== 'all') where.status = q.status;
  if (q.from) where.startAt = { gte: q.from };
  if (q.to) where.startAt = { ...(where.startAt ?? {}), lte: q.to };

  return this.prisma.sessionBooking.findMany({
    where,
    orderBy: { startAt: 'desc' },
    include: {
      tutor: { select: { id: true, fullName: true } },
      subject: true,
      level: true,
      package: true,
    },
  });
}
```

---

## Slide 12 — Student cancel before assigned

```ts
@Auth('student')
@Post('bookings/:id/cancel')
async cancel(
  @Param('id') id: string,
  @CurrentUser('sub') studentId: string,
  @ZodBody(CancelDto) body,
) {
  return this.bookings.cancelByStudent(id, studentId, body.reason);
}

async cancelByStudent(id, studentId, reason) {
  const booking = await this.prisma.sessionBooking.findFirst({
    where: { id, studentId },
  });
  if (!booking) throw new NotFoundException();

  // Cancellable status
  if (!['created', 'pending_assign', 'assigned'].includes(booking.status)) {
    throw new BadRequestException(`Không cancel được từ status=${booking.status}`);
  }

  await this.prisma.sessionBooking.update({
    where: { id }, data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledReason: `[STUDENT]: ${reason}`,
    },
  });

  // KHÔNG REFUND (Q6 chốt) — student mất tiền nếu đã pay
  await this.auditLog.record({
    actorUserId: studentId, action: 'booking.cancel',
    metadata: { reason, prevStatus: booking.status },
  });
}
```

---

## Slide 13 — No refund policy hiển thị rõ

```ts
@Post('bookings')
async create(...) {
  // Trước khi tạo order:
  return {
    ...result,
    refundPolicy: 'NO_REFUND',
    notice: 'Sau khi thanh toán, hủy buổi học sẽ KHÔNG được hoàn tiền (Tutor365 policy)',
  };
}
```

> 💡 Q6 chốt: không refund. FE phải hiển thị notice rõ trước khi user pay.

---

## Slide 14 — Concurrent booking same slot

### 2 Student book cùng startAt cho cùng Tutor (chưa assign)

```
T1: Student A book Mon 9-11 với Tutor TBD
T2: Student B book Mon 9-11 với Tutor TBD
   → Cả 2 tạo booking thành công vì Tutor chưa assigned
   → Hanah xem pending list thấy 2 row, assign Tutor khác nhau hoặc 1 cái
```

**Quan trọng:** Conflict chỉ check khi **assign** (Section 10), không phải lúc tạo booking.

---

## Slide 15 — Test E2E

```bash
# Student book single
BOOK=$(curl -X POST /v1/bookings \
  -H "Authorization: Bearer $STUDENT" \
  -d '{
    "type": "single",
    "subjectId": "<>",
    "levelId": "<>",
    "startAt": "2026-06-01T09:00:00+07:00",
    "durationHr": 1.5
  }')

BOOK_ID=$(echo $BOOK | jq -r .booking.id)
ORDER_ID=$(echo $BOOK | jq -r .order.id)
echo "VNPay URL: $(echo $BOOK | jq -r .vnpayUrl)"

# Verify booking created
curl /v1/me/bookings -H "Authorization: Bearer $STUDENT"
# [{ status: "created", startAt, ... }]

# Simulate paid (stub)
curl -X POST /v1/dev/vnpay/simulate-paid -d "{\"orderId\":\"$ORDER_ID\"}"

# Verify status
curl /v1/me/bookings -H "Authorization: Bearer $STUDENT"
# [{ status: "pending_assign" }]

# Hanah xem pending (V30)
curl '/v1/admin/bookings?status=pending_assign' -H "Authorization: Bearer $ADMIN"
```

---

## Slide 16 — Anti-patterns

```ts
// ❌ Trust client price
{ totalVnd: body.totalVnd }   // user gửi 1 VND
// → server tính lại từ package + duration

// ❌ Tạo booking + order outside transaction
booking.create()
// network fail
order.create() — không bao giờ chạy
// → booking orphan, không có order

// ❌ Tạo booking startAt quá khứ
'2020-01-01'
// → DTO refine future check

// ❌ Cho phép durationHr=0.5 (30 phút)
// → business rule: ≥ 1.5h

// ❌ Cancel sau khi confirmed cho refund
// → Q6: no refund
// → Cancel = mất tiền, hiển thị notice rõ trước pay

// ❌ Status = 'created' lúc IPN paid (chưa update pending_assign)
// → Hanah không thấy trong list pending
```

---

## Slide 17 — Edge cases

| Case | Behavior |
|------|----------|
| startAt < now + 1h | DTO refine reject |
| durationHr = 1.5 sharp | OK |
| Subject/Level inactive | 400 |
| 2 booking cùng slot | Cả 2 OK lúc tạo (chưa assign) |
| Order expire 30 phút chưa pay | Cron → expired (V42) |
| Student cancel sau khi pay | Allow, mất tiền |
| Student cancel sau confirmed (Tutor accepted) | Allow, mất tiền + notify Tutor |
| Cancel sau startAt (đã muộn) | Reject — quá thời gian |

---

## Slide 18 — Bài tập thực hành

### 🎯 Single booking flow

**Bài 1:** Migration `session_bookings` + `session_packages` + seed single package.

**Bài 2:** Implement endpoint POST với pricing calculation đúng.

**Bài 3:** Verify pricing: 1.5h × 200k + 10% tax = 330k.

**Bài 4:** Test scenario slide 15.

**Bài 5:** Implement cancel by student với gate status.

**Bài 6:** Test edge:
- startAt 30 phút sau → 400
- durationHr 1.0 → 400 (min 1.5)
- startAt giờ hành chính 23:00 → 400 (ngoài 8-22)

**Bài 7:** Bonus: implement `GET /v1/me/bookings/:id` chi tiết.

---

## Slide 19 — Tổng kết Video 26

### Bạn vừa học

- ✅ Schema `session_bookings` + `session_packages`
- ✅ Discriminated union DTO single | combo
- ✅ Validate working hours (8-22h GMT+7)
- ✅ Validate future startAt (≥ +1h)
- ✅ Pricing: hourlyRate × duration + tax + fee
- ✅ Transaction: booking + order + orderId link
- ✅ After paid → pending_assign
- ✅ Student cancel với gate status
- ✅ No refund policy hiển thị rõ
- ✅ Concurrent booking — assign mới conflict check

> 💪 Single booking xong = nền cho combo phức tạp hơn

---

<!-- _class: lead -->

# Tiếp theo: Video 27

## Combo Booking với RRULE

3 buổi/tuần × 1-2 tháng. Generate N child bookings từ parent + RRULE iCalendar.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 27 🚀

> *"One slot at a time. Then patterns."*
