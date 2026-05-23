---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 42: Order State Machine + Expire Job'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Order State Machine
# + Expire Job

### Khóa 2-3 — Video 42

**pending → paid | failed | expired**

> Order quá 30 phút chưa pay = cancel để giải phóng booking

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Vẽ order state machine 4 trạng thái
- ✅ Implement `OrderTransitionService` centralized
- ✅ Cron expire pending orders > 30 phút
- ✅ Side effect khi expired: cancel booking
- ✅ Manual cancel (user cố ý) endpoint
- ✅ Re-trigger pay cho order pending

> 🎯 Cuối video: Order pending 30p → auto expired + booking cancel

---

## Slide 3 — State machine order

```
            pending
           /   |   \
          /    |    \
     IPN=00   IPN!=00  Cron 30p
        ↓     ↓        ↓
      paid  failed  expired

Terminal: paid, failed, expired
Idempotent return luôn cho gọi lại
```

**Rules:**

- `paid` → KHÔNG về pending hay khác
- `failed` → có thể tạo order mới (không reuse order cũ)
- `expired` → user phải tạo order mới

---

## Slide 4 — TRANSITIONS table

```ts
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'failed', 'expired'],
  paid: [],
  failed: [],
  expired: [],
};

function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
```

---

## Slide 5 — Cron expire job

```ts
@Injectable()
export class OrderExpireCron {
  private running = false;

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePending() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const orders = await this.prisma.order.findMany({
        where: {
          status: 'pending',
          expiresAt: { lt: now },
        },
        select: { id: true, type: true, refId: true },
      });

      for (const o of orders) {
        await this.expireOrder(o);
      }

      if (orders.length > 0) {
        this.logger.log(`Expired ${orders.length} orders`);
      }
    } finally {
      this.running = false;
    }
  }
}
```

---

## Slide 6 — expireOrder logic

```ts
async expireOrder(o: { id: string; type: string; refId: string }) {
  await this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: o.id } });
    if (!order || order.status !== 'pending') return;     // race-safe

    await tx.order.update({
      where: { id: o.id, status: 'pending' },
      data: { status: 'expired' },
    });

    // Side effect: cancel booking related
    if (o.type === 'session_single' || o.type === 'session_combo') {
      await tx.sessionBooking.update({
        where: { id: o.refId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: '[SYSTEM]: Order expired (no payment)',
        },
      });
      // Combo: cancel children
      await tx.sessionBooking.updateMany({
        where: { parentBookingId: o.refId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: '[SYSTEM]: Order expired',
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: 'order.expired',
        entityType: 'order',
        entityId: o.id,
      },
    });
  });
}
```

> 💡 Course type → không cancel gì (course không reserve slot).

---

## Slide 7 — Manual cancel order endpoint

### User chủ động cancel pending

```ts
@Auth('student')
@Post('me/orders/:id/cancel')
async cancel(
  @Param('id') id: string,
  @CurrentUser('sub') studentId: string,
) {
  return this.orders.cancelPending(id, studentId);
}

async cancelPending(orderId: string, studentId: string) {
  return this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, studentId } });
    if (!order) throw new NotFoundException();
    if (order.status !== 'pending') {
      throw new BadRequestException(`Không cancel được từ status=${order.status}`);
    }

    // Mark failed (treat manual cancel = failed)
    await tx.order.update({
      where: { id: orderId, status: 'pending' },
      data: { status: 'failed' },
    });

    // Side effect: cancel booking if session
    if (order.type !== 'course') {
      await tx.sessionBooking.update({
        where: { id: order.refId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: '[USER]: Cancelled order before payment',
        },
      });
    }

    await tx.auditLog.create({
      data: { actorUserId: studentId, action: 'order.cancel_by_user', entityId: orderId },
    });
  });
}
```

---

## Slide 8 — Resume pay URL (V39 refine)

### Order vẫn pending → reuse URL

```ts
@Auth('student')
@Get('me/orders/:id/payment-url')
async getPaymentUrl(
  @Param('id') id, @CurrentUser('sub') sid, @Req() req,
) {
  const order = await this.prisma.order.findFirst({
    where: { id, studentId: sid, status: 'pending' },
  });
  if (!order) throw new NotFoundException('Order không pending');
  if (order.expiresAt < new Date()) {
    throw new BadRequestException('Order đã hết hạn');
  }

  return { vnpayUrl: this.vnpay.buildPayUrl(order, { clientIp: req.ip }) };
}
```

> 💡 Url đã có sẵn trong response /buy nhưng FE không lưu — endpoint này resume.

---

## Slide 9 — List pending orders cho user

```ts
@Auth('student')
@Get('me/orders')
async listMyOrders(
  @CurrentUser('sub') studentId: string,
  @ZodQuery(ListOrdersQuery) q,
) {
  const where: any = { studentId };
  if (q.status !== 'all') where.status = q.status;

  return this.prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q.limit,
    select: {
      id: true, type: true, refId: true,
      totalVnd: true, status: true,
      createdAt: true, paidAt: true, expiresAt: true,
    },
  });
}
```

---

## Slide 10 — Endpoint resume order với enrich detail

```ts
// Trả thêm course/booking info
async listMyOrdersDetailed(studentId, q) {
  const orders = await this.listMyOrders(studentId, q);

  return Promise.all(orders.map(async (o) => {
    let target: any = null;
    if (o.type === 'course') {
      target = await this.prisma.course.findUnique({
        where: { id: o.refId },
        select: { id: true, title: true, slug: true, coverImageKey: true },
      });
    } else if (o.type.startsWith('session_')) {
      target = await this.prisma.sessionBooking.findUnique({
        where: { id: o.refId },
        select: { id: true, startAt: true, durationHr: true, subjectId: true },
      });
    }
    return { ...o, target };
  }));
}
```

---

## Slide 11 — Notification cho expired order

```ts
async expireOrder(o) {
  await this.prisma.$transaction(/* ... */);

  // Side effect ngoài transaction
  const order = await this.prisma.order.findUnique({
    where: { id: o.id }, include: { student: true },
  });

  // Email student (best-effort)
  await this.mailer.sendOrderExpired(order).catch(() => {});
}
```

**Email content:**

```
Xin chào,
Đơn hàng #o-uuid của bạn đã hết hạn vì chưa thanh toán trong 30 phút.
[Nếu là session booking]: Buổi học đã được hủy.
Vui lòng tạo đơn mới nếu vẫn muốn mua.
```

---

## Slide 12 — Test cron manually

```ts
@AdminOnly()
@Post('admin/cron/expire-orders')
async manualExpire() {
  await this.orderExpireCron.expirePending();
  return { ok: true };
}
```

```bash
# Setup: order pending có expiresAt = -1 phút (đã quá)
curl -X POST /v1/admin/cron/expire-orders -H "Authorization: Bearer $ADMIN"

# Verify
curl /v1/me/orders -H "Authorization: Bearer $STUDENT"
# [{ status: 'expired', ... }]

# Session booking cancelled
curl /v1/me/bookings
# [{ status: 'cancelled', cancelledReason: '[SYSTEM]: Order expired' }]
```

---

## Slide 13 — Edge cases

| Case | Behavior |
|------|----------|
| Order pending vừa expire vừa IPN paid arrive cùng lúc | Optimistic lock `status: 'pending'` → 1 thắng |
| Order expired sau khi pay (race) | IPN check status=pending → fail update → return error → user contact support |
| Cron chạy chồng | `running` flag skip |
| Manual cancel + cron expire same time | DB lock — 1 thắng |
| Course order expired | Không cancel gì (không reserve slot) |
| Combo order expired | Parent + N children cancel |
| Order TTL configurable | `ORDER_EXPIRY_MINUTES` trong pricing_rules |

---

## Slide 14 — Anti-patterns

```ts
// ❌ Cron mỗi 30 phút (=TTL)
// → Race: order expired sau IPN paid arrive 35 phút
// → Nên 1 phút granularity

// ❌ Expire mà không check status
update where { id } { status: 'expired' }
// → Override paid order!
// → where { status: 'pending' }

// ❌ Quên cancel booking
// → Tutor vẫn assigned, booking hiện trong calendar Tutor

// ❌ Send email blocking trong cron
// → Cron chậm, lock running flag lâu

// ❌ Throw 500 trong cron
// → Job tiếp theo skip mất

// ❌ State terminal vẫn cho update
update order { status: 'pending' } where { status: 'paid' }
// → corruption
```

---

## Slide 15 — Statistics endpoint

```ts
@AdminOnly()
@Get('admin/orders/stats')
async stats() {
  const last30Days = subDays(new Date(), 30);
  const where = { createdAt: { gte: last30Days } };

  const [total, byStatus, revenue] = await Promise.all([
    this.prisma.order.count({ where }),
    this.prisma.order.groupBy({ by: ['status'], where, _count: true }),
    this.prisma.order.aggregate({
      where: { ...where, status: 'paid' },
      _sum: { totalVnd: true },
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map(b => [b.status, b._count])),
    revenue30d: revenue._sum.totalVnd ?? 0,
    paymentSuccessRate: byStatus.find(b => b.status === 'paid')?._count / total,
  };
}
```

---

## Slide 16 — Bài tập thực hành

### 🎯 Order lifecycle

**Bài 1:** Define ORDER_TRANSITIONS table + helper.

**Bài 2:** Implement cron expire 1 phút granularity.

**Bài 3:** Test scenario:
- Tạo order pending với expiresAt = -10 phút
- Trigger cron manual
- Verify status=expired + booking cancelled

**Bài 4:** Test idempotent: chạy cron 2 lần liên tiếp → expired vẫn 1 lần.

**Bài 5:** Implement manual cancel order.

**Bài 6:** Test race: IPN paid + cron expire cùng lúc → 1 thắng, 1 fail graceful.

**Bài 7:** Email gửi khi expire (best-effort).

---

## Slide 17 — Edge: order resume sau expired

### User mở email cũ → click pay URL

```
Order expired
User click URL VNPay từ email
VNPay redirect Return → server check → status=expired
  → UI: "Đơn hàng đã hết hạn. Vui lòng tạo đơn mới."
  + Link đến course/booking
```

> 💡 Không cho phép re-active expired order. Tạo mới đơn giản hơn.

---

## Slide 18 — Configurable TTL

```ts
// pricing_rules table
async getOrderTTL(): Promise<number> {
  const rule = await this.prisma.pricingRule.findUnique({
    where: { key: 'ORDER_EXPIRY_MINUTES' },
  });
  return parseInt(rule?.value ?? '30');
}

// Apply khi tạo order
const ttlMin = await this.getOrderTTL();
const order = await this.prisma.order.create({
  data: {
    // ...
    expiresAt: addMinutes(new Date(), ttlMin),
  },
});
```

> 💡 Hanah có thể config sang 60 phút nếu user complain.

---

## Slide 19 — Tổng kết Video 42

### Bạn vừa học

- ✅ Order state machine 4 states với rules clear
- ✅ Cron expire mỗi 1 phút
- ✅ Idempotent qua `running` flag + status check
- ✅ Side effect: cancel booking khi expired session order
- ✅ Manual cancel endpoint cho user
- ✅ Resume pay URL nếu vẫn pending + chưa hết hạn
- ✅ Email notification cho expired
- ✅ Stats endpoint cho Hanah
- ✅ Configurable TTL qua pricing_rules

> 💪 Order lifecycle clean = không có order ghost

---

<!-- _class: lead -->

# Tiếp theo: Video 43

## Idempotency Keys + Unique Constraints

Phòng tránh double-charge, double-enroll. Idempotency-Key header pattern.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 43 🚀

> *"Time is a side effect. Cron is its janitor."*
