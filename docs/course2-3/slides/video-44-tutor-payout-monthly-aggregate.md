---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 44: Tutor Payout — Monthly Aggregate'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Tutor Payout
# Monthly Aggregate

### Khóa 2-3 — Video 44

**Aggregate course + session revenue per month**

> Money in từ student → một phần thuộc về Tutor

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `tutor_payouts` design
- ✅ Cron monthly aggregate (chạy ngày 1 mỗi tháng)
- ✅ Logic: course revenue + session revenue → tutor payout
- ✅ Period closed: payout của tháng N không update sau ngày X tháng N+1
- ✅ Endpoint Tutor list payouts của mình
- ✅ Idempotent aggregate

> 🎯 Cuối video: Cron tự tính payout đầu tháng cho mọi Tutor

---

## Slide 3 — Schema `tutor_payouts`

```ts
type TutorPayout = {
  id: string;
  tutorId: string;
  periodYear: number;                    // 2026
  periodMonth: number;                   // 1-12

  courseRevenueVnd: number;              // tổng từ course đã enroll trong tháng
  sessionRevenueVnd: number;             // tổng từ session completed trong tháng
  grossAmountVnd: number;                // sum
  commissionPercent: number;             // 20 (snapshot khi tính)
  commissionAmountVnd: number;
  netPayoutVnd: number;                  // gross - commission

  status: 'draft' | 'finalized' | 'paid';
  finalizedAt: Date | null;
  paidAt: Date | null;
  paidByAdminId: string | null;
  bankRef: string | null;                // mã chuyển khoản

  createdAt: Date;
  updatedAt: Date;

  // UNIQUE (tutorId, periodYear, periodMonth)
};
```

---

## Slide 4 — Cron monthly

```ts
@Injectable()
export class PayoutCron {
  @Cron('0 1 1 * *')   // Ngày 1 mỗi tháng, 1h sáng
  async generatePayouts() {
    const lastMonth = subMonths(new Date(), 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    this.logger.log(`Generating payouts for ${year}-${month}`);

    // 1. List all approved tutors
    const tutors = await this.prisma.tutorProfile.findMany({
      where: { approveStatus: 'approved' },
      select: { userId: true },
    });

    // 2. Calculate per tutor
    for (const t of tutors) {
      await this.calculatePayout(t.userId, year, month);
    }
  }
}
```

> 💡 Cron chạy mỗi đầu tháng cho tháng trước. Idempotent qua UNIQUE constraint.

---

## Slide 5 — calculatePayout

```ts
async calculatePayout(tutorId: string, year: number, month: number) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);    // exclusive

  // 1. Course revenue: enrollments paid trong tháng
  const courseRevenue = await this.prisma.courseEnrollment.aggregate({
    where: {
      course: { tutorId },
      enrolledAt: { gte: periodStart, lt: periodEnd },
    },
    _sum: { pricePaidVnd: true },
  });

  // 2. Session revenue: completed trong tháng
  const sessionBookings = await this.prisma.sessionBooking.findMany({
    where: {
      tutorId,
      status: 'completed',
      completedAt: { gte: periodStart, lt: periodEnd },
    },
    include: { package: true, order: true },
  });

  const sessionRevenue = sessionBookings.reduce((sum, b) => {
    // Apportion combo parent order theo number of children
    return sum + this.apportionSessionRevenue(b);
  }, 0);

  // 3. Get commission %
  const rules = await this.getPricingRules();
  const commissionPercent = rules.platformCommissionPercent;   // 20

  const gross = (courseRevenue._sum.pricePaidVnd ?? 0) + sessionRevenue;
  const commissionAmount = Math.floor(gross * commissionPercent / 100);
  const netPayout = gross - commissionAmount;

  // 4. Upsert
  await this.prisma.tutorPayout.upsert({
    where: { tutorId_periodYear_periodMonth: { tutorId, periodYear: year, periodMonth: month } },
    create: {
      tutorId, periodYear: year, periodMonth: month,
      courseRevenueVnd: courseRevenue._sum.pricePaidVnd ?? 0,
      sessionRevenueVnd: sessionRevenue,
      grossAmountVnd: gross,
      commissionPercent,
      commissionAmountVnd: commissionAmount,
      netPayoutVnd: netPayout,
      status: 'draft',
    },
    update: {
      courseRevenueVnd: courseRevenue._sum.pricePaidVnd ?? 0,
      sessionRevenueVnd: sessionRevenue,
      grossAmountVnd: gross,
      commissionAmountVnd: commissionAmount,
      netPayoutVnd: netPayout,
    },
  });
}
```

---

## Slide 6 — apportionSessionRevenue

### Combo: total order chia đều N buổi

```ts
private apportionSessionRevenue(booking: SessionBookingWithOrder): number {
  if (!booking.order) return 0;

  // Single: booking value = order total
  if (!booking.parentBookingId && !booking.recurrenceRule) {
    return booking.order.subtotal;     // không tính tax/fee (đó là phần platform)
  }

  // Combo child: chia đều order total cho N children
  if (booking.parentBookingId) {
    // Find sibling count
    // ... lấy parent order, chia subtotal / numChildren
    const parent = await this.prisma.sessionBooking.findUnique({
      where: { id: booking.parentBookingId },
      include: { order: true, _count: { select: { children: true } } },
    });
    if (!parent || !parent.order) return 0;
    return Math.floor(parent.order.subtotal / parent._count.children);
  }

  return 0;
}
```

> 💡 Subtotal (không phải total) — tax và fee thuộc về platform/state, không phải tutor.

---

## Slide 7 — Endpoint Tutor view own payouts

```ts
@Auth('tutor')
@Get('me/payouts')
async myPayouts(@CurrentUser('sub') tutorId: string) {
  return this.prisma.tutorPayout.findMany({
    where: { tutorId },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
  });
}
```

**Response:**

```json
[
  {
    "periodYear": 2026, "periodMonth": 4,
    "courseRevenueVnd": 5_000_000,
    "sessionRevenueVnd": 8_000_000,
    "grossAmountVnd": 13_000_000,
    "commissionPercent": 20,
    "commissionAmountVnd": 2_600_000,
    "netPayoutVnd": 10_400_000,
    "status": "paid",
    "paidAt": "2026-05-05T10:00:00Z"
  }
]
```

---

## Slide 8 — Payout breakdown endpoint

### Detail từng course / session contribute

```ts
@Auth('tutor')
@Get('me/payouts/:id/breakdown')
async breakdown(
  @Param('id') id: string,
  @CurrentUser('sub') tutorId: string,
) {
  const payout = await this.prisma.tutorPayout.findFirst({
    where: { id, tutorId },
  });
  if (!payout) throw new NotFoundException();

  const periodStart = new Date(payout.periodYear, payout.periodMonth - 1, 1);
  const periodEnd = new Date(payout.periodYear, payout.periodMonth, 1);

  const enrollments = await this.prisma.courseEnrollment.findMany({
    where: {
      course: { tutorId },
      enrolledAt: { gte: periodStart, lt: periodEnd },
    },
    include: { course: { select: { title: true } } },
  });

  const sessions = await this.prisma.sessionBooking.findMany({
    where: {
      tutorId,
      status: 'completed',
      completedAt: { gte: periodStart, lt: periodEnd },
    },
    select: { id: true, startAt: true, durationHr: true, order: true },
  });

  return { payout, enrollments, sessions };
}
```

---

## Slide 9 — Recalculate option

### Sau khi adjust data (cancel refund, etc.)

```ts
@AdminOnly()
@Post('admin/payouts/:id/recalculate')
async recalculate(@Param('id') id: string) {
  const payout = await this.findById(id);
  if (payout.status !== 'draft') {
    throw new BadRequestException('Chỉ recalc được draft');
  }
  return this.calculatePayout(payout.tutorId, payout.periodYear, payout.periodMonth);
}
```

> 💡 Status `finalized` → không recalc nữa.

---

## Slide 10 — Audit chain

```
2026-05-01 01:00:00 — payout.draft_generated (cron)
                       gross: 13M, commission: 2.6M, net: 10.4M
2026-05-03 10:30:00 — payout.recalculate (admin Hanah)
                       reason: 'Adjust 1 enrollment refund'
                       new net: 10M
2026-05-05 09:00:00 — payout.finalize (admin Hanah)
2026-05-05 10:00:00 — payout.marked_paid (admin Hanah)
                       bankRef: 'TX-12345'
```

---

## Slide 11 — Test scenario

```bash
# Seed:
# - Tutor A có 3 enrollment trong tháng 4 (tổng 5M)
# - Tutor A có 5 session completed tháng 4 (mỗi cái 300k = 1.5M)

# Run cron (manual trigger)
curl -X POST /v1/admin/cron/generate-payouts -H "Authorization: Bearer $ADMIN"

# Verify
psql -c "SELECT * FROM tutor_payouts WHERE tutor_id = 'A' AND period_year = 2026 AND period_month = 4"
# courseRevenue: 5M, sessionRevenue: 1.5M, gross: 6.5M
# commission 20%: 1.3M
# net: 5.2M

# Tutor view
curl /v1/me/payouts -H "Authorization: Bearer $TUTOR_A"
# [{ periodYear: 2026, periodMonth: 4, netPayoutVnd: 5_200_000 }]

# Re-run cron
curl -X POST /v1/admin/cron/generate-payouts
# → Upsert, no duplicate

# Verify
psql -c "SELECT COUNT(*) FROM tutor_payouts WHERE tutor_id = 'A'"
# 1
```

---

## Slide 12 — Anti-patterns

```ts
// ❌ Tính trên enrollment.createdAt thay paidAt
// → enrollment "đang pending" cũng tính

// ❌ Quên filter status='paid' / 'completed'
// → cancelled, expired contribute

// ❌ Commission lưu giá trị tuyệt đối thay %
{ commissionAmountVnd: 2_600_000 }
// → Đổi rule sau khó back-calculate
// → lưu cả % và amount snapshot

// ❌ Aggregate cho tutor chưa approved
// → noise rows

// ❌ Period straddle timezone
new Date('2026-04-01')   // UTC, sai lệch 7h vs VN
// → utcToZonedTime('Asia/Ho_Chi_Minh')

// ❌ Tính tax/fee vào tutor revenue
// → Tutor365 giữ tax cho platform
```

---

## Slide 13 — Edge cases

| Case | Behavior |
|------|----------|
| Tutor không có enrollment/session tháng | Tạo payout = 0 hoặc skip? Tutor365 skip tạo row |
| Refund (Q6 no refund) | Không xảy ra |
| Course đổi giá giữa tháng | snapshot `pricePaidVnd` ở enrollment |
| Tutor cancel suspend giữa tháng | Vẫn aggregate session/course đã có trước suspend |
| Combo session 1 buổi 5/4 completed, 11 buổi 5/5 completed | 1 buổi vào tháng 4, 11 buổi vào tháng 5 |
| Concurrent cron generate (2 instance) | UNIQUE constraint → 1 thắng |

---

## Slide 14 — Bài tập thực hành

### 🎯 Payout aggregate

**Bài 1:** Migration `tutor_payouts` với UNIQUE (tutorId, periodYear, periodMonth).

**Bài 2:** Implement `calculatePayout` + cron generate.

**Bài 3:** Test với data seed: 5 enrollment + 10 session trong tháng → verify số đúng.

**Bài 4:** Implement endpoint Tutor list own payouts.

**Bài 5:** Implement breakdown endpoint.

**Bài 6:** Re-run cron 2 lần → 1 payout duy nhất (upsert).

**Bài 7:** Bonus: Implement endpoint admin recalculate.

---

## Slide 15 — Currency precision

### Math.floor vs Math.round

```ts
const commissionAmount = Math.floor(gross * commissionPercent / 100);
const netPayout = gross - commissionAmount;
```

> 💡 Math.floor → platform luôn lợi 0.99 VND nếu rounding. Acceptable cho VND không có decimal.

```ts
// VND amount = integer always
const tax = Math.floor(subtotal * 0.1);   // 10% tax
const fee = 0;
const total = subtotal + tax + fee;
```

---

## Slide 16 — Timezone handling

```ts
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

private getPeriodRange(year: number, month: number) {
  const startVn = new Date(year, month - 1, 1, 0, 0, 0);     // local
  const endVn = new Date(year, month, 1, 0, 0, 0);

  return {
    start: zonedTimeToUtc(startVn, 'Asia/Ho_Chi_Minh'),
    end: zonedTimeToUtc(endVn, 'Asia/Ho_Chi_Minh'),
  };
}
```

> 💡 DB lưu UTC, period là theo VN time. Convert đúng.

---

## Slide 17 — Money decimal precision

### Tutor365 dùng integer (đơn vị VND)

```ts
// Course price: 499_000 VND (integer)
// Session 1.5h × 200_000/h = 300_000 VND (integer)
// Tax 10% = 30_000 VND (Math.floor)
// Total = 330_000 VND
```

> 💡 Không dùng decimal/float — tránh round error. VND không có decimal, đơn giản.

---

## Slide 18 — Section 15 progress

✅ V44 — Monthly aggregate

Còn V45 (Commission formula chi tiết) + V46 (Hanah payout dashboard).

---

## Slide 19 — Recap quan trọng

### Pattern aggregate cho payout

1. **Schema:** UNIQUE (tutorId, periodYear, periodMonth)
2. **Cron:** chạy đầu tháng cho tháng trước
3. **Calculate:** course + session revenue → gross
4. **Snapshot:** commissionPercent lưu lại
5. **Upsert:** idempotent
6. **Status:** draft → finalized → paid (V46)
7. **Audit:** mỗi transition log

---

## Slide 20 — Tổng kết Video 44

### Bạn vừa học

- ✅ Schema `tutor_payouts`
- ✅ Cron monthly (ngày 1, 1h)
- ✅ Aggregate course revenue + session revenue
- ✅ Apportion combo: chia subtotal cho N children
- ✅ Snapshot commission %
- ✅ Upsert idempotent
- ✅ Period range theo Asia/Ho_Chi_Minh
- ✅ Endpoint Tutor list own payouts
- ✅ Breakdown detail endpoint
- ✅ Math.floor để precision integer

> 💪 Aggregate đúng = Tutor nhận tiền đúng

---

<!-- _class: lead -->

# Tiếp theo: Video 45

## Commission Formula + Payout Record

Chi tiết commission tính như nào, lưu snapshot, configurable từ pricing_rules.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 45 🚀

> *"Aggregations are reports, not transactions."*
