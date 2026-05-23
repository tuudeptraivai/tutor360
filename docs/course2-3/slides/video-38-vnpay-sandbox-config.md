---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 38: VNPay Sandbox Config'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# VNPay
# Sandbox Config

### Khóa 2-3 — Video 38

**TMN code · Hash secret · Return + IPN URL**

> Setup đúng config = tránh 80% bug payment

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Đăng ký **VNPay Sandbox** merchant account
- ✅ Cấu hình **TMN code** + **hash secret**
- ✅ Setup **return URL** và **IPN URL**
- ✅ Whitelist IP VNPay (production)
- ✅ Test ATM card sandbox
- ✅ Cấu hình env vars trong Tutor365

> 🎯 Cuối video: bạn có sandbox credentials sẵn sàng test thanh toán thật

---

## Slide 3 — VNPay là gì?

### Cổng thanh toán Việt Nam

- Gateway phổ biến nhất VN cho e-commerce
- Sandbox miễn phí cho dev
- Hỗ trợ: ATM nội địa, Visa/Master, QR code, Internet Banking
- Ký request bằng **SHA-512** với secret key
- **IPN (Instant Payment Notification) webhook** — server-to-server

---

## Slide 4 — Đăng ký Sandbox

### Step 1: Register merchant account

```
1. Truy cập https://sandbox.vnpayment.vn
2. Đăng ký account merchant test
3. Sau khi verify email → vào dashboard
4. Lấy credentials:
   - vnp_TmnCode  (Merchant Code, e.g. "DEMO123A")
   - vnp_HashSecret (Secret key 32-64 chars)
```

> 💡 Sandbox đầy đủ feature như production. Chỉ khác: tiền không thực + thẻ test.

---

## Slide 5 — Cấu hình env vars

```env
# apps/api/.env
VNPAY_TMN_CODE=DEMO123A
VNPAY_HASH_SECRET=ABCDEF123456...
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/v1/payments/vnpay/ipn

# Production sau này (giữ format giống)
# VNPAY_PAYMENT_URL=https://pay.vnpay.vn/vpcpay.html
# VNPAY_TMN_CODE=YOUR_PROD_CODE
# VNPAY_HASH_SECRET=YOUR_PROD_SECRET
```

**Validate ở env.ts (Zod):**

```ts
const Env = z.object({
  // ...
  VNPAY_TMN_CODE: z.string().min(4),
  VNPAY_HASH_SECRET: z.string().min(16),
  VNPAY_PAYMENT_URL: z.string().url(),
  VNPAY_RETURN_URL: z.string().url(),
  VNPAY_IPN_URL: z.string().url(),
});
```

---

## Slide 6 — Return URL vs IPN URL

### Khác nhau quan trọng

| | Return URL | IPN URL |
|--|-----------|---------|
| Ai gọi | User browser | VNPay server-to-server |
| Khi nào | Sau khi pay (redirect browser) | Sau khi pay (background) |
| Đáng tin | ❌ User có thể fake | ✅ Trust nguồn |
| Retry | Không (user navigate) | Có (VNPay retry nếu fail) |
| Mục đích | Hiển thị kết quả UI | **Cập nhật order status** |

> 💡 **Rule:** IPN là **source of truth**. Return URL chỉ để hiển thị UI.

---

## Slide 7 — Flow tổng thể

```
Student click "Pay"
  ↓
Backend: tạo order pending + sign request
  ↓
Backend: response redirect URL → FE redirect Student
  ↓
Student vào VNPay → nhập thẻ → confirm OTP
  ↓
VNPay xử lý
  ↓
   ├── Gửi IPN tới Backend (server-to-server)
   │    → Backend verify hash → markPaid → tạo enrollment
   │
   └── Redirect Student → Return URL (user browser)
        → Backend verify hash → return UI status
```

---

## Slide 8 — IPN URL public accessibility

### Production cần public domain

```
Dev:  http://localhost:3000/v1/payments/vnpay/ipn   ← VNPay không gọi được
Prod: https://api.tutor365.vn/v1/payments/vnpay/ipn
```

**Cho dev:** Dùng **ngrok** expose local server

```bash
ngrok http 3000
# https://abc-123.ngrok.app → http://localhost:3000

# Update .env tạm
VNPAY_IPN_URL=https://abc-123.ngrok.app/v1/payments/vnpay/ipn
```

---

## Slide 9 — Whitelist IP (production)

### VNPay khuyến nghị

```
VNPay sandbox IP ranges:
  - 113.160.92.0/24
  - 27.118.16.0/24

Production IP ranges:
  - Lấy từ VNPay support khi go-live
```

**Middleware filter (production):**

```ts
@Injectable()
export class VnpayIpFilterMiddleware implements NestMiddleware {
  private allowed = ['113.160.92.0/24', '27.118.16.0/24'];

  use(req: Request, res: Response, next: () => void) {
    const ip = req.ip!;
    if (!this.isAllowed(ip)) {
      return res.status(403).json({ ok: false });
    }
    next();
  }
}
```

> 💡 IPN endpoint là **public** không có Bearer → IP whitelist + hash verify là 2 layer security.

---

## Slide 10 — Test thẻ sandbox VNPay

### Card test cho từng case

```
ATM nội địa Test SUCCESS:
  Tên: NGUYEN VAN A
  Số thẻ: 9704198526191432198
  Ngày phát hành: 07/15
  OTP: 123456

ATM nội địa Test FAIL:
  Số thẻ: 9704195798459170488
  → Returns code 24 (declined)

Visa/Master SUCCESS:
  Số thẻ: 4111111111111111
  Tên: NGUYEN VAN A
  Hết hạn: 12/30
  CVV: 123
```

> 💡 List đầy đủ trong VNPay docs: `https://sandbox.vnpayment.vn/apis/docs/`.

---

## Slide 11 — VnpayService skeleton

```ts
// modules/payments/vnpay/vnpay.service.ts
import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { env } from '../../../config/env';

@Injectable()
export class VnpayService {
  buildPayUrl(order: Order, opts: { clientIp: string }): string {
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Amount: String(order.totalVnd * 100),    // VNPay tính bằng đơn vị nhỏ
      vnp_CurrCode: 'VND',
      vnp_TxnRef: order.vnpTxnRef,
      vnp_OrderInfo: `Tutor365 order ${order.id}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: env.VNPAY_RETURN_URL,
      vnp_IpAddr: opts.clientIp,
      vnp_CreateDate: this.formatDate(new Date()),
      vnp_ExpireDate: this.formatDate(order.expiresAt),
    };

    return this.sign(params);
  }

  // ... V39 chi tiết
}
```

---

## Slide 12 — Sign request với SHA-512

### Algorithm

```ts
sign(params: Record<string, string>): string {
  // 1. Sort key alphabetically
  const sorted = Object.keys(params).sort();

  // 2. Build query string
  const query = sorted
    .map(k => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');

  // 3. HMAC-SHA512 với hash secret
  const hash = createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(query)
    .digest('hex');

  // 4. Append vnp_SecureHash
  return `${env.VNPAY_PAYMENT_URL}?${query}&vnp_SecureHash=${hash}`;
}
```

> 💡 VNPay docs lưu ý cụ thể về encoding `%20 → +`. V39 chi tiết.

---

## Slide 13 — formatDate VNPay

```ts
formatDate(d: Date): string {
  // VNPay format: yyyyMMddHHmmss in GMT+7
  const zoned = utcToZonedTime(d, 'Asia/Ho_Chi_Minh');
  return format(zoned, 'yyyyMMddHHmmss');
}

// formatDate(new Date('2026-05-25T09:00:00Z'))
// → "20260525160000" (UTC 9h = VN 16h)
```

> ⚠️ Sai timezone → VNPay reject. Phải `Asia/Ho_Chi_Minh`.

---

## Slide 14 — Verify hash từ VNPay

### Khi VNPay callback (Return + IPN)

```ts
verifyHash(params: Record<string, string>): boolean {
  const receivedHash = params.vnp_SecureHash;
  if (!receivedHash) return false;

  // Loại bỏ hash khỏi params trước khi compute
  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = params;

  const sorted = Object.keys(rest).sort();
  const query = sorted
    .map(k => `${k}=${encodeURIComponent(rest[k]).replace(/%20/g, '+')}`)
    .join('&');

  const expected = createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(query)
    .digest('hex');

  // Constant-time compare
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(receivedHash, 'hex'),
  );
}
```

> 💡 Dùng `timingSafeEqual` (Node built-in) — chống timing attack.

---

## Slide 15 — Test build pay URL

```ts
// Unit test
it('builds correct pay URL', () => {
  const order: Order = {
    id: 'o-uuid',
    totalVnd: 330_000,
    vnpTxnRef: 'b-uuid-123',
    expiresAt: new Date('2026-05-25T10:00:00+07:00'),
  };
  const url = vnpay.buildPayUrl(order, { clientIp: '127.0.0.1' });

  expect(url).toContain('vnp_TmnCode=DEMO123A');
  expect(url).toContain('vnp_Amount=33000000');     // 330k × 100
  expect(url).toContain('vnp_TxnRef=b-uuid-123');
  expect(url).toContain('vnp_SecureHash=');         // hash present
});

it('verifies hash from VNPay', () => {
  const params = {
    vnp_TmnCode: 'DEMO123A',
    vnp_Amount: '33000000',
    vnp_TxnRef: 'b-uuid-123',
    vnp_ResponseCode: '00',
    vnp_SecureHash: '<computed>',
  };
  expect(vnpay.verifyHash(params)).toBe(true);
});
```

---

## Slide 16 — Response code map

### Codes VNPay trả

| Code | Meaning | Tutor365 action |
|------|---------|------------------|
| `00` | Success | order → paid |
| `07` | Transaction nghi ngờ | order → failed, log alert |
| `09` | Thẻ chưa đăng ký InternetBanking | order → failed |
| `10` | Xác thực sai > 3 lần | order → failed |
| `11` | Hết hạn chờ thanh toán | order → expired |
| `12` | Thẻ bị khoá | order → failed |
| `13` | Sai OTP | order → failed |
| `24` | Khách huỷ giao dịch | order → failed |
| `51` | Tài khoản không đủ tiền | order → failed |
| `65` | Quá hạn mức giao dịch | order → failed |
| `75` | Bank đang bảo trì | order → failed (retry-able) |
| `99` | Lỗi khác | order → failed |

---

## Slide 17 — Anti-patterns

```ts
// ❌ Hardcode tmn/secret
const TMN_CODE = 'DEMO123A'   // ← .env

// ❌ Quên timezone
formatDate(new Date())   // dùng UTC → VNPay reject
// → utcToZonedTime('Asia/Ho_Chi_Minh')

// ❌ Compare hash bằng ===
hash === expected   // timing attack
// → timingSafeEqual

// ❌ Trả Return URL UI mà không verify hash
// → user fake URL với responseCode=00 → frontend tưởng paid

// ❌ Không log payload IPN
// → debug fail vô vọng

// ❌ Tin URL parameter trên Return
// → IPN mới là source of truth
```

---

## Slide 18 — Bài tập thực hành

### 🎯 Setup VNPay

**Bài 1:** Đăng ký Sandbox account, lấy TMN code + hash secret.

**Bài 2:** Setup env vars + validate qua Zod.

**Bài 3:** Cài `ngrok` (nếu dev local) hoặc deploy stage để có public URL cho IPN.

**Bài 4:** Implement `buildPayUrl` + `verifyHash`.

**Bài 5:** Unit test sign + verify với fixture sample từ VNPay docs.

**Bài 6:** Thử pay 1 order với card test → quan sát redirect URL.

**Bài 7:** Bonus: write test cho mọi response code (slide 16).

---

## Slide 19 — Reference VNPay docs

```
Docs chính: https://sandbox.vnpayment.vn/apis/docs/

Sections quan trọng:
  - Tạo URL thanh toán (Section 3)
  - Truyền vào tham số (vnp_*)
  - Tạo hash SHA-512
  - Format URL
  - Return URL handling (Section 5)
  - IPN URL handling (Section 6) — MOST IMPORTANT
  - Mã lỗi response (Annex)

Sample code: PHP, Java, .NET, Node.js
```

> 💡 KHÔNG tự đoán API — bám sát docs VNPay.

---

## Slide 20 — Tổng kết Video 38

### Bạn vừa học

- ✅ VNPay sandbox account setup
- ✅ Env vars: tmn, secret, payment URL, return, IPN
- ✅ Return URL vs IPN URL (IPN = source of truth)
- ✅ Ngrok cho dev local
- ✅ Sign request SHA-512 với encoding đúng
- ✅ Verify hash timing-safe
- ✅ Format date Asia/Ho_Chi_Minh
- ✅ Response code map 12 mã chính
- ✅ Test card sandbox

> 💪 Setup đúng = tránh 80% bug payment

---

<!-- _class: lead -->

# Tiếp theo: Video 39

## VNPay Create Order + Sign Request

Implement đầy đủ endpoint tạo order + sign → return redirect URL cho FE.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 39 🚀

> *"Read the docs. Trust nothing else."*
