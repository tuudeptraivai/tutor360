---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 46: Hanah Payout Dashboard + Mark Paid'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Hanah Payout Dashboard
# + Mark Paid

### Khóa 2-3 — Video 46

**List · Finalize · Mark paid · Bank ref**

> Hanah ấn nút "Paid" sau khi chuyển khoản thủ công

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Endpoint list payouts cho Hanah dashboard
- ✅ **Finalize** payout (lock từ tính lại)
- ✅ **Mark paid** với bank reference
- ✅ Bulk mark paid (nhiều tutor cùng lúc)
- ✅ Export CSV cho upload bank
- ✅ Status workflow: draft → finalized → paid

> 🎯 Cuối video: Hanah xong workflow payout monthly

---

## Slide 3 — Status transitions

```
draft                 ← Cron tạo, có thể recalc
  │ Hanah review + finalize
  ▼
finalized             ← Snapshot, không recalc
  │ Hanah ấn "Mark Paid" sau khi chuyển khoản
  ▼
paid                  ← Terminal
```

**Rules:**

- `draft` → có thể `finalized` hoặc xoá (nếu sai)
- `finalized` → chỉ về `paid`
- `paid` → terminal

---

## Slide 4 — List payouts endpoint

```ts
@AdminOnly()
@Get('admin/payouts')
async list(@ZodQuery(ListPayoutsQuery) q) {
  const where: any = {};
  if (q.year) where.periodYear = q.year;
  if (q.month) where.periodMonth = q.month;
  if (q.status !== 'all') where.status = q.status;
  if (q.tutorId) where.tutorId = q.tutorId;

  const [items, summary] = await Promise.all([
    this.prisma.tutorPayout.findMany({
      where,
      include: { tutor: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { netPayoutVnd: 'desc' }],
      take: q.limit,
    }),
    this.prisma.tutorPayout.aggregate({
      where, _sum: { netPayoutVnd: true }, _count: true,
    }),
  ]);

  return {
    items,
    summary: {
      count: summary._count,
      totalNet: summary._sum.netPayoutVnd ?? 0,
    },
  };
}

const ListPayoutsQuery = z.object({
  year: z.coerce.number().int().min(2024).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: z.enum(['draft', 'finalized', 'paid', 'all']).default('all'),
  tutorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
```

---

## Slide 5 — Finalize endpoint

```ts
@AdminOnly()
@Post('admin/payouts/:id/finalize')
async finalize(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
) {
  return this.payouts.finalize(id, adminId);
}

// Service
async finalize(id: string, adminId: string) {
  const payout = await this.findById(id);
  if (payout.status === 'finalized' || payout.status === 'paid') return payout;
  if (payout.status !== 'draft') throw new BadRequestException();

  await this.prisma.$transaction([
    this.prisma.tutorPayout.update({
      where: { id, status: 'draft' },
      data: { status: 'finalized', finalizedAt: new Date() },
    }),
    this.prisma.auditLog.create({
      data: { actorUserId: adminId, action: 'payout.finalize', entityId: id },
    }),
  ]);

  // Send email summary
  await this.mailer.sendPayoutEmail(payout).catch(() => {});
}
```

---

## Slide 6 — Mark paid endpoint

```ts
@AdminOnly()
@Post('admin/payouts/:id/mark-paid')
async markPaid(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(MarkPaidDto) body,
) {
  return this.payouts.markPaid(id, adminId, body);
}

const MarkPaidDto = z.object({
  bankRef: z.string().min(3).max(100),         // mã chuyển khoản
  paidAt: z.coerce.date().optional(),           // default now
  note: z.string().max(500).optional(),
});

// Service
async markPaid(id, adminId, input) {
  const payout = await this.findById(id);
  if (payout.status === 'paid') return payout;
  if (payout.status !== 'finalized') {
    throw new BadRequestException('Payout phải finalized trước');
  }

  await this.prisma.$transaction([
    this.prisma.tutorPayout.update({
      where: { id, status: 'finalized' },
      data: {
        status: 'paid',
        paidAt: input.paidAt ?? new Date(),
        paidByAdminId: adminId,
        bankRef: input.bankRef,
      },
    }),
    this.prisma.auditLog.create({
      data: {
        actorUserId: adminId,
        action: 'payout.mark_paid',
        entityId: id,
        metadata: { bankRef: input.bankRef, note: input.note },
      },
    }),
  ]);

  await this.mailer.sendPayoutPaid(id).catch(() => {});
}
```

---

## Slide 7 — Bulk operations

### Finalize/Mark paid nhiều cùng lúc

```ts
@AdminOnly()
@Post('admin/payouts/bulk-finalize')
async bulkFinalize(
  @ZodBody(BulkFinalizeDto) body,
  @CurrentUser('sub') adminId,
) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of body.ids) {
    try {
      await this.finalize(id, adminId);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
  }
  return results;
}

const BulkFinalizeDto = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
```

> 💡 Trả per-item result — không atomic. Nếu 1 lỗi, các cái khác vẫn xử lý.

---

## Slide 8 — Export CSV cho bank

### Hanah download để upload bank batch

```ts
@AdminOnly()
@Get('admin/payouts/export.csv')
async exportCsv(@ZodQuery(ExportQuery) q, @Res() res: Response) {
  const payouts = await this.prisma.tutorPayout.findMany({
    where: {
      periodYear: q.year,
      periodMonth: q.month,
      status: 'finalized',
    },
    include: { tutor: { select: { fullName: true, email: true } } },
  });

  const csv = this.buildCsv(payouts);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payouts-${q.year}-${q.month}.csv"`);
  res.send(csv);
}

private buildCsv(payouts: TutorPayout[]): string {
  const headers = ['TutorId', 'FullName', 'Email', 'PeriodYear', 'PeriodMonth', 'NetPayoutVnd'];
  const rows = payouts.map(p => [
    p.tutor.id, p.tutor.fullName, p.tutor.email,
    p.periodYear, p.periodMonth, p.netPayoutVnd,
  ]);
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}
```

---

## Slide 9 — Import bank transfer confirmation

### Sau khi bank confirm batch

```ts
@AdminOnly()
@Post('admin/payouts/bulk-mark-paid')
async bulkMarkPaid(
  @ZodBody(BulkMarkPaidDto) body,
  @CurrentUser('sub') adminId,
) {
  for (const entry of body.entries) {
    await this.markPaid(entry.payoutId, adminId, {
      bankRef: entry.bankRef,
      paidAt: entry.paidAt ?? new Date(),
    });
  }
  return { processed: body.entries.length };
}

const BulkMarkPaidDto = z.object({
  entries: z.array(z.object({
    payoutId: z.string().uuid(),
    bankRef: z.string().min(3),
    paidAt: z.coerce.date().optional(),
  })),
});
```

---

## Slide 10 — Statistics dashboard

```ts
@AdminOnly()
@Get('admin/payouts/dashboard')
async dashboard() {
  const now = new Date();
  const currentMonth = { periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 };
  const lastMonth = subMonths(now, 1);
  const lastMonthPeriod = { periodYear: lastMonth.getFullYear(), periodMonth: lastMonth.getMonth() + 1 };

  const [drafts, finalized, paidThisMonth, totalRevenue] = await Promise.all([
    this.prisma.tutorPayout.count({ where: { status: 'draft' } }),
    this.prisma.tutorPayout.count({ where: { status: 'finalized' } }),
    this.prisma.tutorPayout.aggregate({
      where: { ...lastMonthPeriod, status: 'paid' },
      _sum: { netPayoutVnd: true },
    }),
    this.prisma.tutorPayout.aggregate({
      where: lastMonthPeriod,
      _sum: { grossAmountVnd: true, commissionAmountVnd: true },
    }),
  ]);

  return {
    pendingActions: {
      draftCount: drafts,
      finalizedCount: finalized,    // chờ chuyển khoản
    },
    lastMonth: {
      paidTotal: paidThisMonth._sum.netPayoutVnd ?? 0,
      grossRevenue: totalRevenue._sum.grossAmountVnd ?? 0,
      platformEarning: totalRevenue._sum.commissionAmountVnd ?? 0,
    },
  };
}
```

---

## Slide 11 — Test full lifecycle

```bash
# Cron generated payout draft
curl /v1/admin/payouts?status=draft -H "Authorization: Bearer $ADMIN"

# Hanah review + finalize
curl -X POST /v1/admin/payouts/$PID/finalize -H "Authorization: Bearer $ADMIN"

# Export CSV
curl /v1/admin/payouts/export.csv?year=2026&month=4 \
  -H "Authorization: Bearer $ADMIN" \
  -o payouts-2026-04.csv

# Hanah upload CSV vào bank → bank chuyển khoản batch
# Sau khi bank confirm

# Mark paid 1
curl -X POST /v1/admin/payouts/$PID/mark-paid \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"bankRef":"VCB-TX-12345","paidAt":"2026-05-05T10:00:00Z"}'

# Hoặc bulk
curl -X POST /v1/admin/payouts/bulk-mark-paid \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"entries":[{"payoutId":"...","bankRef":"VCB-TX-12345"},...]}'

# Verify
curl /v1/me/payouts -H "Authorization: Bearer $TUTOR"
# [{ status: 'paid', paidAt: '...', bankRef: 'VCB-TX-12345' }]

# Audit
curl /v1/admin/audit-logs?entityType=tutor_payout&entityId=$PID
# [draft_generated, finalize, mark_paid]
```

---

## Slide 12 — Email Tutor paid

```html
<p>Xin chào {{tutorName}},</p>
<p>Bảng thanh toán tháng {{month}}/{{year}} đã được thanh toán:</p>
<ul>
  <li>Số tiền: {{netVnd}} VND</li>
  <li>Mã giao dịch: {{bankRef}}</li>
  <li>Ngày: {{paidAtFormatted}}</li>
</ul>
<p>Vui lòng kiểm tra tài khoản ngân hàng.</p>
```

---

## Slide 13 — Section 15 hoàn tất

### Payout layer ready

✅ V44 — Monthly aggregate
✅ V45 — Commission formula + snapshot
✅ V46 — Hanah dashboard + mark paid

**Section 16 — Notifications** (1 video):

- V47: Notification table + email send via Nodemailer

> 🚀 Sang Section 16 — pull together notification.

---

## Slide 14 — Anti-patterns

```ts
// ❌ Mark paid không bankRef
{ status: 'paid' }   // → audit không có gì để verify

// ❌ Cho mark paid không qua finalized
update { status: 'paid' } where status: 'draft'
// → skip safety gate

// ❌ Export full DB không filter
SELECT * FROM tutor_payouts   // → mb file lớn

// ❌ Bulk operation throw nếu 1 fail
// → các cái khác mất
// → catch per-item

// ❌ Quên send email khi paid
// → Tutor không biết tiền đã về

// ❌ Hardcode bank format
'VCB-TX'   // → mỗi bank format khác
// → bankRef free text
```

---

## Slide 15 — Edge cases

| Case | Behavior |
|------|----------|
| Mark paid với bankRef trùng | Audit log OK, không enforce unique (multiple payout có thể cùng batch ref) |
| Finalize payout 0 VND | Allow nhưng email skip |
| Hanah quên mark paid 3 tháng liền | Cron alert (advanced) |
| Tutor xem khi draft | Allow xem, nhưng note "Chưa finalize" |
| Bulk có 1 ID không tồn tại | Skip, return error trong response |
| Mark paid 2 lần same id | Idempotent return |

---

## Slide 16 — Bài tập thực hành

### 🎯 Payout dashboard E2E

**Bài 1:** Implement list + filter endpoint.

**Bài 2:** Implement finalize + mark-paid với state guard.

**Bài 3:** Test workflow draft → finalized → paid.

**Bài 4:** Implement bulk-finalize + bulk-mark-paid.

**Bài 5:** Implement export CSV.

**Bài 6:** Implement dashboard endpoint.

**Bài 7:** Bonus: alert email cho admin nếu có draft > 7 ngày chưa finalize.

---

## Slide 17 — Cron alert (advanced)

```ts
@Cron('0 9 * * *')   // 9am mỗi ngày
async alertOverduePayouts() {
  const cutoff = subDays(new Date(), 7);
  const drafts = await this.prisma.tutorPayout.count({
    where: { status: 'draft', createdAt: { lt: cutoff } },
  });
  const finalized = await this.prisma.tutorPayout.count({
    where: { status: 'finalized', finalizedAt: { lt: cutoff } },
  });

  if (drafts > 0 || finalized > 0) {
    await this.mailer.sendAdminAlert({
      subject: 'Payout overdue',
      body: `${drafts} draft + ${finalized} finalized payouts chưa hoàn tất quá 7 ngày`,
    });
  }
}
```

---

## Slide 18 — Edge: cycle payout pre-finalize

### Nếu cần recalc

```ts
// Sequence:
// 1. Hanah ấn "Recalc" → calculatePayout chỉ run khi status=draft
// 2. Nếu finalized rồi → reject

// Refine
async recalculate(id, adminId) {
  const payout = await this.findById(id);
  if (payout.status !== 'draft') {
    throw new BadRequestException('Chỉ recalc draft');
  }
  return this.calculatePayout(payout.tutorId, payout.periodYear, payout.periodMonth);
}
```

---

## Slide 19 — Reverse paid (refund)?

### Tutor365 không support

```
Hanah mark paid → ngân hàng đã chuyển
→ Reverse cần unwind bank transaction (manual)
→ Tutor365 chỉ allow forward direction
```

> 💡 Nếu cần edit: tạo row payout adjustment riêng (negative amount) trong tháng kế.

---

## Slide 20 — Tổng kết Video 46

### Bạn vừa học

- ✅ Status workflow draft → finalized → paid
- ✅ Finalize lock recalc
- ✅ Mark paid với bankRef + audit
- ✅ Bulk operations per-item result
- ✅ Export CSV cho bank upload
- ✅ Bulk mark paid khi bank confirm
- ✅ Dashboard endpoint stats
- ✅ Alert cron overdue payouts
- ✅ Anti-pattern: no reverse paid

> 💪 Hanah workflow trơn = Tutor nhận tiền đúng hạn

---

<!-- _class: lead -->

# Tiếp theo: Video 47

## Notifications + Email Send

Notification table, email template, send qua Nodemailer (sync MVP, queue ở C6).

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 47 🚀

> *"Pay your tutors. They will pay you back with quality."*
