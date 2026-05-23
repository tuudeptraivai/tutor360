---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 39: VNPay Create Order + Sign Request'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# VNPay Create Order
# + Sign Request

### Khóa 2-3 — Video 39

**Build URL · Encode · Sign · Redirect**

> 1 byte sai = hash sai = VNPay reject

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement đầy đủ `VnpayService.buildPayUrl`
- ✅ Encode parameters đúng RFC 3986 (`%20` → `+`)
- ✅ Sign HMAC-SHA512
- ✅ Tích hợp vào flow buy course / book session
- ✅ Test với card test → verify VNPay accept
- ✅ Handle edge: amount, currency, expire date

> 🎯 Cuối video: Click "Pay" → redirect VNPay → nhập card → pay success

---

## Slide 3 — Tham số bắt buộc VNPay

| Param | Required | Ví dụ |
|-------|----------|-------|
| `vnp_Version` | ✅ | `2.1.0` |
| `vnp_Command` | ✅ | `pay` |
| `vnp_TmnCode` | ✅ | `DEMO123A` |
| `vnp_Amount` | ✅ | `33000000` (330k × 100) |
| `vnp_CurrCode` | ✅ | `VND` |
| `vnp_TxnRef` | ✅ unique | `b-uuid-123` |
| `vnp_OrderInfo` | ✅ | `Tutor365 order o-uuid` |
| `vnp_OrderType` | ✅ | `other`, `topup`, ... |
| `vnp_Locale` | ✅ | `vn` hoặc `en` |
| `vnp_ReturnUrl` | ✅ | `https://...` |
| `vnp_IpAddr` | ✅ | `127.0.0.1` |
| `vnp_CreateDate` | ✅ | `20260525160000` |
| `vnp_ExpireDate` | optional | same format |
| `vnp_BankCode` | optional | `NCB`, `VNPAYQR`, ... |

---

## Slide 4 — Encoding tricky

### VNPay sample dùng `application/x-www-form-urlencoded`

```ts
function encodeForVnpay(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')           // space → +
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}
```

**Ví dụ:**

```ts
encodeForVnpay('Tutor365 order o-uuid')
// → "Tutor365+order+o-uuid"
```

> 💡 Sample code VNPay JS dùng `qs.stringify({ encode: true })` — tương đương.

---

## Slide 5 — buildPayUrl complete

```ts
@Injectable()
export class VnpayService {
  buildPayUrl(order: Order, opts: { clientIp: string; bankCode?: string }): string {
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Amount: String(order.totalVnd * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: order.vnpTxnRef,
      vnp_OrderInfo: `Tutor365 ${order.type} ${order.refId}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: env.VNPAY_RETURN_URL,
      vnp_IpAddr: opts.clientIp,
      vnp_CreateDate: this.formatDate(new Date()),
      vnp_ExpireDate: this.formatDate(order.expiresAt),
    };
    if (opts.bankCode) params.vnp_BankCode = opts.bankCode;

    // Sort + encode + join
    const sortedKeys = Object.keys(params).sort();
    const query = sortedKeys
      .map(k => `${k}=${this.encode(params[k])}`)
      .join('&');

    // Sign
    const hash = createHmac('sha512', env.VNPAY_HASH_SECRET)
      .update(query)
      .digest('hex');

    return `${env.VNPAY_PAYMENT_URL}?${query}&vnp_SecureHash=${hash}`;
  }

  private encode(v: string): string {
    return encodeURIComponent(v)
      .replace(/%20/g, '+')
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }

  private formatDate(d: Date): string {
    const zoned = utcToZonedTime(d, 'Asia/Ho_Chi_Minh');
    return format(zoned, 'yyyyMMddHHmmss');
  }
}
```

---

## Slide 6 — Tích hợp với buy course flow

```ts
// modules/orders/orders.service.ts
async createCourseOrder(studentId: string, course: Course, clientIp: string) {
  const pricing = this.calculateCoursePrice(course.priceVnd);

  const order = await this.prisma.order.create({
    data: {
      studentId, type: 'course', refId: course.id,
      ...pricing,
      status: 'pending',
      vnpTxnRef: `c-${course.id}-${Date.now()}`,
      expiresAt: addMinutes(new Date(), 30),
    },
  });

  const vnpayUrl = this.vnpay.buildPayUrl(order, { clientIp });
  return { order, vnpayUrl };
}
```

**Controller:**

```ts
@Auth('student')
@Post('courses/:id/buy')
async buy(
  @Param('id') courseId,
  @CurrentUser('sub') studentId,
  @Req() req: Request,
) {
  const course = await this.coursesService.findById(courseId);
  // ... check already enrolled, free, etc.

  const result = await this.ordersService.createCourseOrder(studentId, course, req.ip);
  return { vnpayUrl: result.vnpayUrl, orderId: result.order.id };
}
```

---

## Slide 7 — Get clientIp đúng cách

### Behind proxy / load balancer

```ts
// main.ts
app.set('trust proxy', 1);   // trust 1 hop reverse proxy

// req.ip sẽ là original client IP, không phải LB IP
```

**Nếu deploy behind Nginx:**

```nginx
location / {
  proxy_pass http://backend;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Real-IP $remote_addr;
}
```

> 💡 VNPay log `vnp_IpAddr` — nếu sai IP, hash vẫn đúng nhưng VNPay có thể flag suspicious.

---

## Slide 8 — Test signature manually

### So với sample VNPay docs

```ts
// Reference từ docs VNPay
const params = {
  vnp_Version: '2.1.0',
  vnp_Command: 'pay',
  vnp_TmnCode: '2QXUI4J4',
  vnp_Amount: '10000000',
  vnp_CurrCode: 'VND',
  vnp_TxnRef: '23847',
  vnp_OrderInfo: 'Thanh toan don hang :23847',
  vnp_OrderType: 'other',
  vnp_Locale: 'vn',
  vnp_ReturnUrl: 'https://domain.vn/Home/PaymentReturn',
  vnp_IpAddr: '127.0.0.1',
  vnp_CreateDate: '20210801153333',
};
const hashSecret = 'RAOEXHYVSDDIIENYWSLDIIZTANXZFZJH';

// Expected hash từ docs:
// "9C6CEEA22B43A4...."

// Verify
const hash = createHmac('sha512', hashSecret).update(queryString).digest('hex');
expect(hash).toBe('9C6CEEA22B43A4...');
```

> 💡 Replicate fixture sample → confirm implementation chuẩn trước khi đi tiếp.

---

## Slide 9 — Logging cho debug

```ts
buildPayUrl(order, opts) {
  // ... build params

  const query = ...;
  const hash = ...;
  const url = `${env.VNPAY_PAYMENT_URL}?${query}&vnp_SecureHash=${hash}`;

  this.logger.log({
    msg: 'VNPay pay URL built',
    orderId: order.id,
    txnRef: order.vnpTxnRef,
    amount: order.totalVnd,
    params: { ...params, vnp_SecureHash: '[redacted]' },
  });

  return url;
}
```

> 💡 Log params (KHÔNG log secret) → debug khi VNPay reject.

---

## Slide 10 — Edge case: amount

### VNPay rules

- ✅ Min: 10,000 VND
- ✅ Max: 50,000,000 VND
- ✅ Phải là integer (không phẩy)
- ✅ Đơn vị nhỏ: nhân 100 trước khi truyền

```ts
// Order totalVnd = 330000 (330k)
vnp_Amount = String(330_000 * 100) = "33000000"

// VNPay nhận: 33,000,000 đơn vị nhỏ = 330,000 VND
```

> 💡 Sai `× 100` → giao dịch 33k thay 330k.

---

## Slide 11 — Edge case: date format

```ts
// VNPay yêu cầu giờ Việt Nam GMT+7
formatDate(new Date('2026-05-25T09:00:00Z'))
// UTC 9h = VN 16h
// → "20260525160000"

// Nếu dùng UTC:
new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
// "20260525090000"
// → VNPay reject vì sai zone
```

---

## Slide 12 — Endpoint resume order

### User abandon → quay lại pay

```ts
@Auth('student')
@Get('me/orders/:id/payment-url')
async getPaymentUrl(
  @Param('id') id: string,
  @CurrentUser('sub') studentId: string,
  @Req() req: Request,
) {
  const order = await this.prisma.order.findFirst({
    where: { id, studentId, status: 'pending' },
  });
  if (!order) throw new NotFoundException('Order không pending');

  if (order.expiresAt < new Date()) {
    throw new BadRequestException('Order đã hết hạn');
  }

  return { vnpayUrl: this.vnpay.buildPayUrl(order, { clientIp: req.ip }) };
}
```

**Use case:** Student đóng tab giữa flow → mở /me/orders, click "Tiếp tục" → URL pay khả dụng.

---

## Slide 13 — Test full flow

```bash
# 1. Buy course
BUY=$(curl -X POST /v1/courses/$CID/buy -H "Authorization: Bearer $STUDENT")
ORDER_ID=$(echo $BUY | jq -r .orderId)
VNPAY_URL=$(echo $BUY | jq -r .vnpayUrl)

# 2. Mở browser, paste $VNPAY_URL
open "$VNPAY_URL"

# 3. Nhập card test:
#    9704198526191432198 / NGUYEN VAN A / 07/15 / OTP 123456

# 4. VNPay xử lý
#    → IPN gọi backend (V41)
#    → Redirect Return URL (V40)

# 5. Verify order paid
curl /v1/me/orders/$ORDER_ID -H "Authorization: Bearer $STUDENT"
# status: 'paid'

# 6. Verify enrollment
curl /v1/me/enrollments -H "Authorization: Bearer $STUDENT"
# [{ course: ... }]
```

---

## Slide 14 — Anti-patterns

```ts
// ❌ Forget × 100
vnp_Amount: order.totalVnd   // → 1/100 expected

// ❌ Sort sai (case-sensitive vs lowercase)
keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
// → "vnp_Amount" vs "vnp_amount" hash khác

// ❌ Sign before sort
// → mọi lần khác hash

// ❌ encodeURIComponent default (không thay %20 → +)
// → space encoded sai → hash sai

// ❌ Hard-code clientIp
vnp_IpAddr: '127.0.0.1'   // → suspicious
// → req.ip thật

// ❌ TxnRef trùng
vnp_TxnRef: 'fixed-string'   // ← VNPay reject duplicate
// → mỗi order unique
```

---

## Slide 15 — Bài tập thực hành

### 🎯 Build pay URL

**Bài 1:** Implement `VnpayService.buildPayUrl` đầy đủ.

**Bài 2:** Test với fixture VNPay docs — hash khớp expected.

**Bài 3:** Tích hợp vào endpoint `/courses/:id/buy` + `/bookings`.

**Bài 4:** Test full flow với card test sandbox.

**Bài 5:** Test edge: `totalVnd = 9000` (< 10k min) → VNPay reject — handle bằng validation.

**Bài 6:** Implement endpoint resume order.

**Bài 7:** Bonus: trả nhiều bank code option cho FE: `vnpayUrl?bankCode=NCB`, `?bankCode=VNPAYQR`, ...

---

## Slide 16 — VNPay locale `vn` vs `en`

```ts
// Locale ảnh hưởng UI VNPay
vnp_Locale: 'vn'   // → trang VNPay tiếng Việt
vnp_Locale: 'en'   // → tiếng Anh

// Tutor365: detect từ user.country hoặc accept-language header
```

---

## Slide 17 — Tax flow note

### Tax không qua VNPay

Tutor365 tính tax ở backend → totalVnd đã include tax. VNPay chỉ nhận con số cuối.

```
Student trả 330,000 VND total
  ├── 300,000 subtotal
  ├── 30,000 tax (10%)
  └── 0 fee

VNPay:
  vnp_Amount: 33000000 (= 330,000)
```

> 💡 VNPay không break down tax — chỉ thấy 1 số tổng. Backend lưu break-down cho payout (V44).

---

## Slide 18 — Concurrency: tạo 2 order cùng course

```ts
async buyCourse(studentId, courseId) {
  // Check existing pending order
  const existing = await this.prisma.order.findFirst({
    where: { studentId, type: 'course', refId: courseId, status: 'pending', expiresAt: { gt: new Date() } },
  });
  if (existing) {
    return { order: existing, vnpayUrl: this.vnpay.buildPayUrl(existing, opts) };
  }

  // Else create new
  // ...
}
```

> 💡 Resume vs create — UX mượt, không user thấy 2 order pending.

---

## Slide 19 — Tổng kết Video 39

### Bạn vừa học

- ✅ Build pay URL đầy đủ 14 params
- ✅ Encoding RFC 3986 với `+` cho space
- ✅ Sort keys alphabetical trước sign
- ✅ HMAC-SHA512 với hash secret
- ✅ Date format Asia/Ho_Chi_Minh
- ✅ Amount × 100
- ✅ TxnRef unique per order
- ✅ Tích hợp buy course + book session flow
- ✅ Resume order endpoint
- ✅ Log params (no secret) cho debug
- ✅ Test với card sandbox

> 💪 Sign đúng = VNPay accept

---

<!-- _class: lead -->

# Tiếp theo: Video 40

## VNPay Return URL — Verify Hash + UI Status

User redirect về sau pay. Verify hash + trả JSON status để FE hiển thị.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 40 🚀

> *"In payment, every byte counts."*
