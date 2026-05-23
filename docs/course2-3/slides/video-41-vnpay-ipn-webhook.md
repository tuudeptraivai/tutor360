---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 41: VNPay IPN Webhook'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# VNPay IPN Webhook
# Source of Truth

### Khóa 2-3 — Video 41

**Server-to-server · Idempotent · markPaid**

> 1 endpoint quyết định ai trả tiền — và nhận hàng

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement endpoint **`GET /v1/payments/vnpay/ipn`**
- ✅ Verify hash strict
- ✅ Idempotent markPaid (gọi N lần OK)
- ✅ Tạo enrollment / update booking sau paid
- ✅ Trả response đúng format VNPay yêu cầu
- ✅ Test với retry IPN simulation

> 🎯 Cuối video: Pay sandbox real → IPN gọi → enrollment tạo

---

## Slide 3 — IPN format response VNPay yêu cầu

### VNPay docs Section 6

VNPay gọi IPN qua GET request. Server phải trả JSON với format:

```json
{
  "RspCode": "00",
  "Message": "Confirm Success"
}
```

| RspCode | Meaning |
|---------|---------|
| `00` | Success — VNPay không retry |
| `01` | Order not found |
| `02` | Order already confirmed |
| `04` | Invalid amount |
| `97` | Invalid signature |
| `99` | Unknown error |

> ⚠️ VNPay sẽ retry IPN nếu code != 00 và != 02. Idempotency rất quan trọng.

---

## Slide 4 — IPN endpoint

```ts
@Public()
@Get('payments/vnpay/ipn')
async vnpayIpn(@Query() query: Record<string, string>, @Req() req: Request) {
  return this.paymentsService.handleIpn(query, req.ip);
}
```

> 💡 Path quan trọng — phải match với `VNPAY_IPN_URL` đã đăng ký.

---

## Slide 5 — handleIpn full

```ts
async handleIpn(query: Record<string, string>, ip: string) {
  // 1. Log raw payload
  await this.prisma.auditLog.create({
    data: {
      action: 'vnpay.ipn.received',
      metadata: { ...query, ip, ts: new Date() },
    },
  });

  // 2. Verify hash
  if (!this.vnpay.verifyHash(query)) {
    return { RspCode: '97', Message: 'Invalid signature' };
  }

  // 3. Lookup order
  const txnRef = query.vnp_TxnRef;
  const order = await this.prisma.order.findFirst({
    where: { vnpTxnRef: txnRef },
  });
  if (!order) {
    return { RspCode: '01', Message: 'Order not found' };
  }

  // 4. Verify amount
  const receivedAmount = parseInt(query.vnp_Amount) / 100;
  if (receivedAmount !== order.totalVnd) {
    return { RspCode: '04', Message: 'Invalid amount' };
  }

  // 5. Idempotent check
  if (order.status === 'paid' || order.status === 'failed') {
    return { RspCode: '02', Message: 'Order already confirmed' };
  }

  // 6. Update order + side effects
  const success = query.vnp_ResponseCode === '00';
  if (success) {
    await this.ordersService.markPaid(order.id, {
      vnpTransactionNo: query.vnp_TransactionNo,
      vnpResponseCode: query.vnp_ResponseCode,
      bankCode: query.vnp_BankCode,
      payDate: this.parseDate(query.vnp_PayDate),
      rawPayload: query,
    });
  } else {
    await this.ordersService.markFailed(order.id, {
      reason: query.vnp_ResponseCode,
      rawPayload: query,
    });
  }

  return { RspCode: '00', Message: 'Confirm Success' };
}
```

---

## Slide 6 — markPaid với idempotency

```ts
// modules/orders/orders.service.ts
async markPaid(orderId: string, meta: PaymentMeta) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Lock + read order
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    if (order.status === 'paid') return order;       // idempotent return

    // 2. Update order
    await tx.order.update({
      where: { id: orderId, status: 'pending' },     // optimistic check
      data: { status: 'paid', paidAt: new Date() },
    });

    // 3. Create payment record
    await tx.payment.create({
      data: {
        orderId,
        vnpTransactionNo: meta.vnpTransactionNo,
        vnpResponseCode: meta.vnpResponseCode,
        amount: order.totalVnd,
        bankCode: meta.bankCode,
        payDate: meta.payDate,
        rawIpnPayload: meta.rawPayload as any,
        ipnReceivedAt: new Date(),
      },
    });

    // 4. Side effects by type
    if (order.type === 'course') {
      await tx.courseEnrollment.create({
        data: {
          courseId: order.refId,
          studentId: order.studentId,
          orderId,
          pricePaidVnd: order.totalVnd,
        },
      });
    } else if (order.type === 'session_single') {
      await tx.sessionBooking.update({
        where: { id: order.refId },
        data: { status: 'pending_assign' },
      });
    } else if (order.type === 'session_combo') {
      await tx.sessionBooking.update({
        where: { id: order.refId },
        data: { status: 'pending_assign' },
      });
      await tx.sessionBooking.updateMany({
        where: { parentBookingId: order.refId },
        data: { status: 'pending_assign' },
      });
    }

    // 5. Audit
    await tx.auditLog.create({
      data: {
        actorUserId: order.studentId,
        action: 'order.paid',
        entityType: 'order',
        entityId: order.id,
        metadata: { vnpTransactionNo: meta.vnpTransactionNo },
      },
    });

    return tx.order.findUnique({ where: { id: orderId } });
  });
}
```

---

## Slide 7 — payments table

```ts
type Payment = {
  id: string;
  orderId: string;                       // FK
  vnpTransactionNo: string;              // UNIQUE — chống duplicate insert
  vnpResponseCode: string;
  amount: number;
  bankCode: string | null;
  payDate: Date | null;
  rawIpnPayload: object;                 // JSONB
  ipnReceivedAt: Date;
};
```

**Unique constraint `vnpTransactionNo`:**

- VNPay sinh số duy nhất cho mỗi transaction success
- Insert duplicate → unique violation → biết đây là retry IPN

---

## Slide 8 — Idempotency qua UNIQUE constraint

```ts
async markPaid(orderId, meta) {
  try {
    return await this.prisma.$transaction(/* ... slide 6 */);
  } catch (e) {
    if (e.code === 'P2002' && e.meta?.target?.includes('vnpTransactionNo')) {
      // Duplicate — retry IPN. Order đã có payment record này.
      this.logger.warn(`Duplicate IPN for transactionNo ${meta.vnpTransactionNo}`);
      return await this.prisma.order.findUnique({ where: { id: orderId } });
    }
    throw e;
  }
}
```

> 💡 **2 layer idempotency:**
> 1. Check `order.status === 'paid'` đầu transaction
> 2. UNIQUE constraint `vnpTransactionNo`

---

## Slide 9 — markFailed

```ts
async markFailed(orderId: string, meta: { reason: string; rawPayload: any }) {
  return this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();
    if (order.status !== 'pending') return order;     // idempotent

    await tx.order.update({
      where: { id: orderId, status: 'pending' },
      data: { status: 'failed' },
    });

    await tx.payment.create({
      data: {
        orderId,
        vnpTransactionNo: meta.rawPayload.vnp_TransactionNo ?? `failed-${Date.now()}`,
        vnpResponseCode: meta.rawPayload.vnp_ResponseCode,
        amount: 0,
        rawIpnPayload: meta.rawPayload,
        ipnReceivedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'order.failed',
        entityId: orderId,
        metadata: { reason: meta.reason },
      },
    });
  });
}
```

---

## Slide 10 — Test IPN với ngrok

```bash
# 1. Run ngrok
ngrok http 3000
# https://abc-123.ngrok.app

# 2. Update .env
VNPAY_IPN_URL=https://abc-123.ngrok.app/v1/payments/vnpay/ipn

# 3. Restart api
pnpm --filter @tutor365/api dev

# 4. Pay 1 order với card sandbox
# (Slide 39 instructions)

# 5. Watch logs
# → IPN nhận query
# → Verify hash OK
# → markPaid → enrollment created
# → Return { RspCode: '00' }

# 6. Verify trong VNPay sandbox dashboard
# → Transaction trong list
# → Status = success

# 7. Verify DB
curl /v1/me/enrollments -H "Authorization: Bearer $STUDENT"
# [{ course: ..., enrolledAt: now }]
```

---

## Slide 11 — Test IPN retry

### VNPay retry nếu fail

```bash
# Simulate: server xuống lúc IPN bắn → VNPay retry sau 5 phút

# Restart server
# VNPay re-send IPN với cùng params

# Endpoint xử lý:
# - Verify hash OK
# - Order đã paid → return RspCode=02
# - Không tạo duplicate enrollment

# Verify
psql -c "SELECT COUNT(*) FROM course_enrollments WHERE course_id='...' AND student_id='...'"
# 1 (không phải 2)
```

---

## Slide 12 — Detail logs

```ts
async handleIpn(query, ip) {
  const startedAt = Date.now();
  let result: any;
  try {
    result = await this._handleIpn(query, ip);
  } catch (e) {
    this.logger.error('IPN error', { txnRef: query.vnp_TxnRef, error: e.message });
    result = { RspCode: '99', Message: 'Unknown error' };
  }

  this.logger.log({
    msg: 'IPN processed',
    txnRef: query.vnp_TxnRef,
    responseCode: query.vnp_ResponseCode,
    durationMs: Date.now() - startedAt,
    rspCode: result.RspCode,
    ip,
  });
  return result;
}
```

---

## Slide 13 — IPN security checklist

| Check | How |
|-------|-----|
| ✅ Hash valid | verifyHash() |
| ✅ Order tồn tại | findFirst vnpTxnRef |
| ✅ Amount match | parseInt(amount)/100 === order.totalVnd |
| ✅ Idempotent | check status + UNIQUE constraint |
| ✅ IP from VNPay | IP whitelist middleware (production) |
| ✅ Transaction safety | wrap trong `$transaction` |
| ✅ Log raw payload | audit_logs full query |
| ✅ Response chuẩn VNPay format | `{ RspCode, Message }` |

---

## Slide 14 — Edge cases

| Case | Behavior |
|------|----------|
| Hash invalid | RspCode=97 |
| Order không tồn tại | RspCode=01 |
| Amount mismatch | RspCode=04 |
| Order đã paid | RspCode=02 |
| Order đã expired | Vẫn xử lý nếu vnp_ResponseCode=00 (race) — markPaid OK |
| Response code 24 (user cancel) | markFailed |
| VNPay retry 5 lần | Mỗi lần idempotent return — vẫn paid 1 row |
| IPN trước Return | DB đã paid → Return hiển thị status=success |

---

## Slide 15 — Race: User pay 2 lần cùng order

```
Scenario: User click pay 2 tab, VNPay process 2 transaction success

Tab A: IPN với transactionNo X1 → markPaid → tạo payment X1
Tab B: IPN với transactionNo X2 → 
  → order.status đã 'paid'
  → return RspCode=02 ngay
  → KHÔNG insert payment X2
  → Money X2 KẸT bên VNPay
```

**Phòng tránh:**

- FE disable button "Pay" sau 1 click (debounce)
- BE: 1 user + 1 course có max 1 pending order tại 1 thời điểm

---

## Slide 16 — Anti-patterns

```ts
// ❌ Verify hash sau lookup order
// → Attacker brute-force vnp_TxnRef để probe order tồn tại

// ❌ Update DB ngoài transaction
update order; update payment; update enrollment;
// → DB inconsistent nếu fail giữa chừng

// ❌ Trả response không đúng format VNPay
return { status: 'ok' };   // ← VNPay không hiểu → retry forever

// ❌ Throw 500
throw new Error()   // VNPay infinite retry
// → catch + return RspCode=99

// ❌ Update enrollment trước update order
// → Nếu update order fail, enrollment lẻ tẻ

// ❌ Quên audit raw payload
// → Debug "vì sao order này paid" không có context
```

---

## Slide 17 — Bài tập thực hành

### 🎯 IPN E2E

**Bài 1:** Implement endpoint IPN với 5 check (slide 13).

**Bài 2:** Implement markPaid + markFailed idempotent.

**Bài 3:** Migration `payments` với UNIQUE vnpTransactionNo.

**Bài 4:** Test full flow với sandbox card → verify enrollment tạo.

**Bài 5:** Test idempotency: simulate IPN 3 lần cùng payload → 1 enrollment, không error.

**Bài 6:** Test fake IPN: hash invalid → RspCode=97 + audit log alert.

**Bài 7:** Bonus: implement dashboard Hanah xem IPN log + filter theo RspCode.

---

## Slide 18 — Section 13 hoàn tất

### VNPay layer ready

✅ V38 — Sandbox setup + env config
✅ V39 — Create order + sign request
✅ V40 — Return URL verify + UI
✅ V41 — IPN webhook idempotent

**Section 14 — Order State Machine** (2 video):

- V42: Order state machine + expire job
- V43: Idempotency keys + unique constraints

> 🚀 Sang Section 14 — chốt phần payment lifecycle.

---

## Slide 19 — Monitoring metrics

### Production track

```ts
// Counter
- vnpay.ipn.received.total       (label by RspCode)
- vnpay.ipn.duration             (histogram)
- vnpay.order.created.total      (label by type)
- vnpay.order.paid.total
- vnpay.order.failed.total
- vnpay.order.expired.total

// Alert
- IPN error rate > 1% → page on-call
- Payment success rate < 90% → check VNPay status
- Hash invalid count > 10/h → security alert
```

> 💡 C8 deployment khoá riêng sẽ wire Prometheus + Grafana.

---

## Slide 20 — Tổng kết Video 41

### Bạn vừa học

- ✅ IPN endpoint trả format chuẩn VNPay `{ RspCode, Message }`
- ✅ 5 check security trước khi process
- ✅ Idempotent qua 2 layer: status + UNIQUE constraint
- ✅ markPaid transaction: order + payment + enrollment/booking + audit
- ✅ markFailed mirror
- ✅ Test retry — không double effect
- ✅ Log raw payload cho debug
- ✅ Race condition khi user pay 2 tab

> 💪 IPN đúng = money flow tin cậy

---

<!-- _class: lead -->

# Tiếp theo: Video 42

## Order State Machine + Expire Job

State đầy đủ: pending → paid | failed | expired. Cron expire sau 30 phút.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 42 🚀

> *"IPN is the truth. Everything else is hope."*
