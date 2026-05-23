---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 45: Commission Formula + Payout Record'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Commission Formula
# + Payout Record

### Khóa 2-3 — Video 45

**Snapshot · Configurable · Audit-safe**

> Công thức rõ ràng = Tutor tin tưởng platform

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **gross vs net** rõ ràng
- ✅ Configurable commission % qua **pricing_rules**
- ✅ Per-tutor override commission (advanced)
- ✅ Snapshot strategy — không bao giờ recalc cũ
- ✅ Different commission cho course vs session
- ✅ Email payout summary cho Tutor

> 🎯 Cuối video: Công thức end-to-end đúng cho 5 tutor mẫu

---

## Slide 3 — Công thức tổng

```
Gross Revenue = Course Revenue (enrolled this month)
              + Session Revenue (completed this month)

Commission = Gross × CommissionPercent
Net Payout = Gross - Commission

Example:
  Course Revenue: 5,000,000 VND  (10 enrollment × 500k average)
  Session Revenue: 8,000,000 VND (40 buổi × 200k average)
  Gross: 13,000,000 VND
  
  Commission 20%: 2,600,000 VND
  Net Payout: 10,400,000 VND
```

---

## Slide 4 — `pricing_rules` table

```ts
type PricingRule = {
  key: string;                      // 'PLATFORM_COMMISSION_PERCENT'
  value: string;
  description: string;
  updatedByAdminId: string;
  updatedAt: Date;
};

// Seed
const RULES = [
  { key: 'SINGLE_SESSION_HOURLY_VND', value: '200000' },
  { key: 'COMBO_SESSION_HOURLY_VND', value: '150000' },
  { key: 'PLATFORM_COMMISSION_PERCENT', value: '20' },
  { key: 'TAX_PERCENT', value: '10' },
  { key: 'FEE_FIXED_VND', value: '0' },
  { key: 'ORDER_EXPIRY_MINUTES', value: '30' },
  { key: 'REFUND_ALLOWED', value: 'false' },
  { key: 'NO_SHOW_THRESHOLD_MINUTES', value: '15' },
  { key: 'COMBO_MIN_WEEKLY_FREQUENCY', value: '3' },
  { key: 'COMBO_ALLOWED_MONTHS', value: '[1,2]' },
];
```

---

## Slide 5 — PricingRulesService

```ts
@Injectable()
export class PricingRulesService {
  private cache: Record<string, string> | null = null;
  private cacheAt = 0;

  async getRules(): Promise<PricingRulesConfig> {
    if (this.cache && Date.now() - this.cacheAt < 300_000) {
      return this.toConfig(this.cache);
    }
    const rows = await this.prisma.pricingRule.findMany();
    this.cache = Object.fromEntries(rows.map(r => [r.key, r.value]));
    this.cacheAt = Date.now();
    return this.toConfig(this.cache);
  }

  private toConfig(raw: Record<string, string>): PricingRulesConfig {
    return {
      singleSessionHourlyVnd: parseInt(raw.SINGLE_SESSION_HOURLY_VND),
      comboSessionHourlyVnd: parseInt(raw.COMBO_SESSION_HOURLY_VND),
      platformCommissionPercent: parseFloat(raw.PLATFORM_COMMISSION_PERCENT),
      taxPercent: parseFloat(raw.TAX_PERCENT),
      feeFixedVnd: parseInt(raw.FEE_FIXED_VND),
      orderExpiryMinutes: parseInt(raw.ORDER_EXPIRY_MINUTES),
      refundAllowed: raw.REFUND_ALLOWED === 'true',
      noShowThresholdMinutes: parseInt(raw.NO_SHOW_THRESHOLD_MINUTES),
      comboMinWeeklyFrequency: parseInt(raw.COMBO_MIN_WEEKLY_FREQUENCY),
      comboAllowedMonths: JSON.parse(raw.COMBO_ALLOWED_MONTHS),
    };
  }

  async updateRule(key: string, value: string, adminId: string) {
    await this.prisma.pricingRule.upsert({
      where: { key },
      create: { key, value, updatedByAdminId: adminId },
      update: { value, updatedByAdminId: adminId },
    });
    this.cache = null;   // invalidate
  }
}
```

---

## Slide 6 — Per-tutor override (advanced)

### Tutor đặc biệt có % khác

```ts
// schema: tutor_profiles.commissionOverridePercent: number | null

async getCommissionPercentForTutor(tutorId: string): Promise<number> {
  const profile = await this.prisma.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: { commissionOverridePercent: true },
  });
  if (profile?.commissionOverridePercent !== null) {
    return profile.commissionOverridePercent;
  }
  const rules = await this.pricingRules.getRules();
  return rules.platformCommissionPercent;
}
```

**Use case:**

- Tutor VIP: 15% commission thay 20%
- Tutor mới: 25% (cao hơn) trong tháng đầu

---

## Slide 7 — Different commission per type

### Course vs Session khác %

```ts
// Refine pricing_rules
COURSE_COMMISSION_PERCENT: '15'
SESSION_COMMISSION_PERCENT: '20'

// calculatePayout
async calculatePayout(tutorId, year, month) {
  const courseRevenue = ...;
  const sessionRevenue = ...;

  const rules = await this.pricingRules.getRules();
  const courseCommissionPct = rules.courseCommissionPercent;
  const sessionCommissionPct = rules.sessionCommissionPercent;

  const courseCommission = Math.floor(courseRevenue * courseCommissionPct / 100);
  const sessionCommission = Math.floor(sessionRevenue * sessionCommissionPct / 100);

  const gross = courseRevenue + sessionRevenue;
  const totalCommission = courseCommission + sessionCommission;
  const net = gross - totalCommission;

  // Save with breakdown
  await this.prisma.tutorPayout.upsert({
    // ...
    courseCommissionVnd: courseCommission,
    sessionCommissionVnd: sessionCommission,
  });
}
```

> 💡 Tutor365 MVP: 1 % thống nhất 20%. Add per-type khi business cần.

---

## Slide 8 — Snapshot semantics

### Lưu giá trị tại thời điểm finalize

```ts
{
  periodYear: 2026, periodMonth: 4,
  courseRevenueVnd: 5_000_000,
  sessionRevenueVnd: 8_000_000,
  grossAmountVnd: 13_000_000,
  commissionPercent: 20,                  // ← snapshot lúc tính
  commissionAmountVnd: 2_600_000,
  netPayoutVnd: 10_400_000,
}
```

**Nếu Hanah đổi commission % sang 25%:**

- ✅ Payouts cũ KHÔNG đổi
- ✅ Payout của tháng sau dùng 25%

**Mainstream Q&A:**

> "Đổi commission có ảnh hưởng tháng đã paid?"
> ❌ Không — snapshot bảo vệ.

---

## Slide 9 — Email payout summary

```ts
async sendPayoutEmail(payout: TutorPayout) {
  const tutor = await this.usersService.findById(payout.tutorId);
  const html = `
    <h2>Bảng thanh toán tháng ${payout.periodMonth}/${payout.periodYear}</h2>
    <table>
      <tr><td>Doanh thu khoá học</td><td>${vnd(payout.courseRevenueVnd)}</td></tr>
      <tr><td>Doanh thu live tutoring</td><td>${vnd(payout.sessionRevenueVnd)}</td></tr>
      <tr><td>Tổng doanh thu</td><td>${vnd(payout.grossAmountVnd)}</td></tr>
      <tr><td>Hoa hồng Tutor365 (${payout.commissionPercent}%)</td><td>-${vnd(payout.commissionAmountVnd)}</td></tr>
      <tr><td><strong>Số tiền nhận</strong></td><td><strong>${vnd(payout.netPayoutVnd)}</strong></td></tr>
    </table>
    <p>Trạng thái: ${payout.status}</p>
  `;
  await this.mailer.send(tutor.email, 'Bảng thanh toán Tutor365', html);
}

function vnd(n: number): string {
  return n.toLocaleString('vi-VN') + ' VND';
}
```

---

## Slide 10 — Test scenarios

```bash
# Tutor A:
# - 3 course enrolled tháng 4 với pricePaid 500k, 700k, 1_000_000 = 2_200_000
# - 5 session completed: tổng 1_500_000
# Gross = 3_700_000
# Commission 20% = 740_000
# Net = 2_960_000

curl -X POST /v1/admin/cron/generate-payouts -H "Authorization: Bearer $ADMIN"

curl /v1/me/payouts -H "Authorization: Bearer $TUTOR_A"
# [{ periodMonth: 4, gross: 3700000, commission: 740000, net: 2960000 }]

# Change commission rule
curl -X PATCH /v1/admin/pricing-rules \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"key":"PLATFORM_COMMISSION_PERCENT","value":"25"}'

# Re-run cron — payout cũ không đổi (status=draft thì upsert update, status=finalized thì skip)
curl -X POST /v1/admin/cron/generate-payouts

# Verify
curl /v1/me/payouts -H "Authorization: Bearer $TUTOR_A"
# Same: 740000, 2960000 (snapshot)
```

---

## Slide 11 — Endpoint pricing rules admin

```ts
@AdminOnly()
@Get('admin/pricing-rules')
async listRules() {
  return this.prisma.pricingRule.findMany({ orderBy: { key: 'asc' } });
}

@AdminOnly()
@Patch('admin/pricing-rules')
async updateRule(
  @CurrentUser('sub') adminId: string,
  @ZodBody(UpdateRuleDto) body,
) {
  await this.pricingRules.updateRule(body.key, body.value, adminId);
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'pricing_rule.update',
    metadata: { key: body.key, newValue: body.value },
  });
  return { ok: true };
}

const UpdateRuleDto = z.object({
  key: z.string().min(3),
  value: z.string(),
});
```

---

## Slide 12 — Anti-patterns

```ts
// ❌ Tính commission từ giá hiện tại của course
const course = await prisma.course.findUnique(...);
const commission = course.price * 0.2;
// → Khi enroll giá khác → commission sai
// → Dùng pricePaidVnd của enrollment

// ❌ Float commission %
{ commissionPercent: 19.5 }
// → 5_000_000 × 19.5 / 100 = 975_000 (round error nếu * floats)
// → Math.floor cuối cùng OK nhưng cẩn thận

// ❌ Lưu commission % chứ không amount
{ commissionPercent: 20 }   // mỗi lần đọc tính lại
// → Đổi rule → record cũ "thay đổi"
// → Lưu cả % và amount snapshot

// ❌ Apply tax vào tutor revenue
gross = subtotal + tax
// → tutor lấy phần tax (sai)
// → tutor revenue = subtotal chỉ

// ❌ Re-aggregate trên status='finalized'
// → snapshot bị overwrite
```

---

## Slide 13 — Defensive code: only recalc draft

```ts
async calculatePayout(tutorId, year, month) {
  const existing = await this.prisma.tutorPayout.findUnique({
    where: { tutorId_periodYear_periodMonth: { tutorId, periodYear: year, periodMonth: month } },
  });
  if (existing && existing.status !== 'draft') {
    this.logger.warn(`Skip recalc finalized payout ${existing.id}`);
    return existing;
  }
  // ... upsert
}
```

---

## Slide 14 — Bài tập thực hành

### 🎯 Commission + pricing

**Bài 1:** Migration `pricing_rules` + seed 10 rules.

**Bài 2:** Implement `PricingRulesService` với cache 5 phút.

**Bài 3:** Apply commission qua snapshot trong `calculatePayout`.

**Bài 4:** Test scenario slide 10.

**Bài 5:** Implement admin endpoint update rule + audit.

**Bài 6:** Bonus: per-tutor override commission (slide 6).

**Bài 7:** Bonus: send email payout summary.

---

## Slide 15 — Reporting cho Hanah

```ts
@AdminOnly()
@Get('admin/payouts/summary')
async summary(@ZodQuery(SummaryQuery) q) {
  const where: any = {};
  if (q.year) where.periodYear = q.year;
  if (q.month) where.periodMonth = q.month;

  const [totals, byTutor] = await Promise.all([
    this.prisma.tutorPayout.aggregate({
      where,
      _sum: { grossAmountVnd: true, commissionAmountVnd: true, netPayoutVnd: true },
      _count: true,
    }),
    this.prisma.tutorPayout.findMany({
      where,
      include: { tutor: { select: { id: true, fullName: true } } },
      orderBy: { netPayoutVnd: 'desc' },
      take: 20,
    }),
  ]);

  return {
    totals: {
      gross: totals._sum.grossAmountVnd ?? 0,
      commission: totals._sum.commissionAmountVnd ?? 0,
      net: totals._sum.netPayoutVnd ?? 0,
      tutorCount: totals._count,
    },
    topTutors: byTutor.map(p => ({
      tutorId: p.tutor.id,
      fullName: p.tutor.fullName,
      net: p.netPayoutVnd,
    })),
  };
}
```

---

## Slide 16 — Edge cases

| Case | Behavior |
|------|----------|
| Tutor 0 revenue tháng | Skip tạo payout row (Tutor365 chọn) |
| Commission override per tutor | Lưu snapshot %, không phải rule global |
| Pricing rule không tồn tại | Default value hardcode trong PricingRulesService |
| Refund (Q6 không có) | N/A |
| Tutor365 đổi tax % | Order cũ vẫn dùng pricing snapshot tại lúc tạo |
| Multi-currency | Tutor365 chỉ VND |

---

## Slide 17 — Real-world enhancement

### Production tutor365

- ✅ Tax invoice (hoá đơn VAT) — tax authority require
- ✅ Tax withholding cho payout > X VND
- ✅ Bank reconciliation file export
- ⚠️ Tutor365 MVP **không** làm — khoá riêng

---

## Slide 18 — Section 15 next

✅ V44 — Aggregate
✅ V45 — Commission formula

Còn V46 (Hanah dashboard mark paid) hoàn tất Section 15.

---

## Slide 19 — Cheat sheet

```
1. Aggregate enrollment + session of month
2. Snapshot commission % at time of calc
3. Math.floor cho commission amount (integer VND)
4. Upsert idempotent
5. Status terminal: paid không change được
6. Email Tutor sau finalize
```

---

## Slide 20 — Tổng kết Video 45

### Bạn vừa học

- ✅ Gross / Commission / Net công thức rõ
- ✅ pricing_rules table configurable
- ✅ Snapshot commission % vào payout row
- ✅ Per-tutor override (advanced)
- ✅ Different commission per type (course vs session)
- ✅ Email payout summary
- ✅ Reporting cho Hanah top tutors
- ✅ Defensive: chỉ recalc draft

> 💪 Snapshot semantics = audit-safe payouts

---

<!-- _class: lead -->

# Tiếp theo: Video 46

## Hanah Payout Dashboard + Mark Paid

List + filter payouts, finalize, mark paid với bank ref.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 46 🚀

> *"A formula written down is a promise to your tutors."*
