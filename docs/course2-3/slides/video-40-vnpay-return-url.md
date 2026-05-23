---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 40: VNPay Return URL'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# VNPay Return URL
# Verify Hash + UI

### Khóa 2-3 — Video 40

**User browser callback · Status UI · KHÔNG update order**

> Return URL là cho user xem — IPN mới update DB

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement endpoint **`GET /v1/payments/vnpay/return`**
- ✅ Verify hash từ VNPay
- ✅ KHÔNG update order status ở đây (chỉ IPN)
- ✅ Trả JSON status cho FE hiển thị
- ✅ Hoặc redirect FE URL với query params
- ✅ Handle user fake URL

> 🎯 Cuối video: Pay xong → redirect về FE với status đúng

---

## Slide 3 — Vì sao Return URL KHÔNG update DB?

### Nguy hiểm

```
User click pay → VNPay → redirect Return URL với code=00
  ↓ user MITM/devtools tools fake code
  ↓
Server tin Return URL → markPaid → grant enrollment

→ FREE ENROLLMENT 😱
```

**Solution:**

- Return URL → chỉ **đọc** order status từ DB
- IPN URL (server-to-server) → **mới update** order
- Logic: nếu IPN chưa tới khi user redirect → DB vẫn `pending` → UI hiển thị "Đang xử lý"

---

## Slide 4 — Return URL endpoint

```ts
@Public()
@Get('payments/vnpay/return')
async vnpayReturn(@Query() query: Record<string, string>, @Res() res: Response) {
  // 1. Verify hash
  if (!this.vnpay.verifyHash(query)) {
    return res.redirect(`${env.FE_BASE_URL}/payment-result?status=invalid_hash`);
  }

  // 2. Lookup order
  const txnRef = query.vnp_TxnRef;
  const order = await this.prisma.order.findFirst({ where: { vnpTxnRef: txnRef } });
  if (!order) {
    return res.redirect(`${env.FE_BASE_URL}/payment-result?status=not_found`);
  }

  // 3. Read current status (DO NOT UPDATE)
  // Trạng thái có thể đã được IPN cập nhật trước hoặc chưa
  const statusForUi = this.toUiStatus(order, query.vnp_ResponseCode);

  // 4. Redirect FE với status
  const params = new URLSearchParams({
    status: statusForUi,
    orderId: order.id,
    vnpResponseCode: query.vnp_ResponseCode,
  });
  return res.redirect(`${env.FE_BASE_URL}/payment-result?${params}`);
}
```

---

## Slide 5 — toUiStatus mapping

```ts
private toUiStatus(order: Order, vnpResponseCode: string): string {
  // Trả UI status dựa cả DB và VNPay response

  if (order.status === 'paid') return 'success';
  if (order.status === 'expired') return 'expired';
  if (order.status === 'failed') return 'failed';

  // Order vẫn pending → IPN chưa tới (race)
  if (vnpResponseCode === '00') {
    return 'processing';     // VNPay báo success, đợi IPN confirm
  }
  if (vnpResponseCode === '24') {
    return 'cancelled';      // User cancel
  }
  return 'failed';
}
```

> 💡 Trả `processing` cho race condition — FE refresh sau vài giây.

---

## Slide 6 — FE poll order status

```tsx
// FE PaymentResultPage.tsx
useEffect(() => {
  if (urlParams.status === 'processing') {
    // Poll endpoint /me/orders/:id mỗi 2s, tối đa 30s
    const interval = setInterval(async () => {
      const order = await fetch(`/v1/me/orders/${orderId}`).then(r => r.json());
      if (order.status === 'paid') {
        clearInterval(interval);
        setStatus('success');
      } else if (order.status === 'failed' || order.status === 'expired') {
        clearInterval(interval);
        setStatus(order.status);
      }
    }, 2000);
    
    setTimeout(() => clearInterval(interval), 30_000);
    return () => clearInterval(interval);
  }
}, [urlParams]);
```

> 💡 Tutor365 backend chỉ trả status, FE handle polling.

---

## Slide 7 — Order status endpoint cho FE poll

```ts
@Auth('student')
@Get('me/orders/:id')
async getOrder(
  @Param('id') id: string,
  @CurrentUser('sub') studentId: string,
) {
  const order = await this.prisma.order.findFirst({
    where: { id, studentId },
  });
  if (!order) throw new NotFoundException();
  return {
    id: order.id,
    status: order.status,
    type: order.type,
    refId: order.refId,
    totalVnd: order.totalVnd,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
  };
}
```

---

## Slide 8 — Return URL: cho FE handle thẳng

### Alternative: trả JSON thay redirect

```ts
@Public()
@Get('payments/vnpay/return')
async vnpayReturn(@Query() query: Record<string, string>) {
  if (!this.vnpay.verifyHash(query)) {
    return { ok: false, error: 'INVALID_HASH' };
  }

  const order = await this.prisma.order.findFirst({
    where: { vnpTxnRef: query.vnp_TxnRef },
  });
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

  return {
    ok: true,
    status: this.toUiStatus(order, query.vnp_ResponseCode),
    orderId: order.id,
    type: order.type,
    refId: order.refId,
  };
}
```

> 💡 Trade-off: redirect đẹp UX, JSON dễ tích hợp SPA. Tutor365 chọn redirect cho marketing landing pages.

---

## Slide 9 — Verify hash cho Return

```ts
verifyHash(params: Record<string, string>): boolean {
  const receivedHash = params.vnp_SecureHash;
  if (!receivedHash) return false;

  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = params;

  const sortedKeys = Object.keys(rest).sort();
  const query = sortedKeys
    .map(k => `${k}=${this.encode(rest[k])}`)
    .join('&');

  const expected = createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(query)
    .digest('hex');

  // Constant-time compare
  if (expected.length !== receivedHash.length) return false;
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(receivedHash, 'hex'),
  );
}
```

> 💡 Cùng verify được dùng cho Return + IPN — share logic.

---

## Slide 10 — Audit log return

```ts
async vnpayReturn(query, res) {
  await this.auditLog.record({
    actorUserId: null,    // anonymous
    action: 'vnpay.return',
    metadata: {
      txnRef: query.vnp_TxnRef,
      responseCode: query.vnp_ResponseCode,
      hashValid: this.vnpay.verifyHash(query),
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 200),
    },
  });
  // ...
}
```

**Use case:**

- Anomaly: 100 request return code=99 → VNPay outage
- User report "đã pay nhưng không enroll" → check audit có log return
- Suspicious: hash invalid → log alert ops

---

## Slide 11 — Test scenarios

```bash
# 1. Pay success — happy path
# User pay xong, VNPay redirect:
GET /v1/payments/vnpay/return?vnp_TxnRef=...&vnp_ResponseCode=00&vnp_SecureHash=<valid>

# Verify hash OK → 302 → /payment-result?status=success
# (Hoặc processing nếu IPN chưa tới)

# 2. User cancel
GET /v1/payments/vnpay/return?vnp_ResponseCode=24&...
# → status=cancelled

# 3. Hash invalid (fake URL)
curl '/v1/payments/vnpay/return?vnp_TxnRef=fake&vnp_ResponseCode=00&vnp_SecureHash=fakehash'
# → /payment-result?status=invalid_hash

# 4. Order không tồn tại
# → status=not_found

# 5. Order đã expired
# → status=expired
```

---

## Slide 12 — Anti-patterns

```ts
// ❌ Update order status trong Return
if (vnpResponseCode === '00') {
  await markPaid(orderId);   // ← BACKDOOR security
}
// → CHỈ IPN update

// ❌ Trả token / sensitive info trong Return URL params
res.redirect(`/result?accessToken=xxx`)
// → token leak ra browser history

// ❌ Quên verify hash
const orderId = query.vnp_TxnRef;   // trust client
// → ai cũng gọi được

// ❌ Throw 500 khi hash invalid
throw new Error('Invalid')   // → user thấy lỗi server
// → redirect / JSON với clear error code

// ❌ Lookup order bằng query.vnp_OrderId
// → vnp_TxnRef mới là unique key của bạn (FE chọn), không phải VNPay sinh
```

---

## Slide 13 — Edge cases

| Case | Behavior |
|------|----------|
| Hash invalid | Redirect với status=invalid_hash, audit log alert |
| Order not found | Redirect not_found |
| Order đã expired (>30p) | Redirect expired |
| Pay success nhưng IPN delay | Return: processing, FE poll |
| Pay success + IPN đã tới | Return: success, FE hiển thị enrollment ngay |
| User fake URL với valid hash từ order khác | TxnRef không match → not_found |
| User refresh Return URL nhiều lần | Idempotent — chỉ đọc |

---

## Slide 14 — Hard-coded test fixtures

```ts
// vnpay.service.test.ts
describe('VnpayService', () => {
  describe('verifyHash', () => {
    it('valid hash from VNPay docs', () => {
      const params = {
        vnp_TmnCode: '2QXUI4J4',
        vnp_Amount: '10000000',
        vnp_TxnRef: '23847',
        vnp_ResponseCode: '00',
        vnp_SecureHash: '...calculated...',
      };
      expect(service.verifyHash(params)).toBe(true);
    });

    it('rejects tampered hash', () => {
      const params = { /* ... */, vnp_SecureHash: 'wrong' };
      expect(service.verifyHash(params)).toBe(false);
    });

    it('rejects modified amount', () => {
      const params = { /* ..., vnp_Amount: '20000000' (changed), vnp_SecureHash: <original> */ };
      expect(service.verifyHash(params)).toBe(false);
    });
  });
});
```

---

## Slide 15 — Bài tập thực hành

### 🎯 Return URL handle

**Bài 1:** Implement endpoint Return với 5 case (slide 11).

**Bài 2:** Implement `verifyHash` shared cho Return + IPN.

**Bài 3:** Test với card sandbox real → verify FE redirect đúng.

**Bài 4:** Implement order status polling endpoint.

**Bài 5:** Test fake URL: change vnp_Amount mà giữ hash gốc → verifyHash trả false.

**Bài 6:** Audit log return có hashValid flag — query để monitor anomaly.

**Bài 7:** Bonus: implement Return version JSON cho SPA.

---

## Slide 16 — UI flow

```
1. /courses/$ID → click "Buy"
2. POST /buy → response { vnpayUrl } → window.location = vnpayUrl
3. User pays trên VNPay
4. VNPay redirects: /v1/payments/vnpay/return?...
5. Backend 302 → /payment-result?status=success
6. FE Page:
   - status=success → "Enroll thành công!" + link tới course
   - status=processing → "Đang xác nhận..." + spinner + poll
   - status=cancelled → "Bạn đã huỷ thanh toán"
   - status=failed → "Thanh toán thất bại, vui lòng thử lại"
```

---

## Slide 17 — Return URL không cần JWT

### Public endpoint với hash verification

```ts
@Public()
@Get('payments/vnpay/return')
```

**Vì sao public?**

- User vừa pay xong, JWT có thể expired
- VNPay redirect không gửi Bearer
- Hash verification + Order ownership (qua vnpTxnRef) là đủ

> 💡 Nhưng để xem order detail sau redirect → FE phải có JWT (login state). Polling `/me/orders/:id` cần JWT.

---

## Slide 18 — Edge: order paid trước khi Return về

### Order updates không atomic giữa IPN và Return

```
T0: User pay
T1: VNPay redirect to Return URL (async)
T2: VNPay calls IPN URL (parallel)
T3: IPN handler runs first → markPaid
T4: Return handler runs → reads order.status = 'paid' → redirect status=success
```

**Hoặc:**

```
T3: Return handler runs first → reads order.status = 'pending'
T4: Return redirect status=processing
T5: IPN markPaid
T6: FE poll → status=paid
```

Cả 2 case đều ok. Return KHÔNG block IPN.

---

## Slide 19 — Tổng kết Video 40

### Bạn vừa học

- ✅ Return URL = user-facing, KHÔNG update DB
- ✅ Verify hash với constant-time compare
- ✅ Lookup order qua vnp_TxnRef
- ✅ Trả status dựa cả DB và vnp_ResponseCode
- ✅ Status `processing` cho race IPN
- ✅ FE poll endpoint khi processing
- ✅ Redirect FE với query params hoặc JSON
- ✅ Audit log mọi return call
- ✅ Anti-pattern: KHÔNG markPaid ở Return
- ✅ Test fake URL với tampered amount

> 💪 Return URL an toàn = không ai trick được FREE enrollment

---

<!-- _class: lead -->

# Tiếp theo: Video 41

## VNPay IPN Webhook (Source of Truth)

Server-to-server callback. Verify hash. Idempotent markPaid. Tạo enrollment / booking.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 41 🚀

> *"Trust IPN. Doubt the Return."*
