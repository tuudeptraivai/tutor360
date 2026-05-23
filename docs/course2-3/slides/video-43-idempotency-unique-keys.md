---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 43: Idempotency Keys + Unique Constraints'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Idempotency Keys
# + Unique Constraints

### Khóa 2-3 — Video 43

**`Idempotency-Key` header · Composite unique · Replay safe**

> Một request, một effect — bất kể bao lần retry

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **idempotency** = cùng request, cùng kết quả
- ✅ Bảng `idempotency_keys` với raw + response cached
- ✅ Implement **`Idempotency-Key`** header pattern
- ✅ Apply cho **POST /buy**, **POST /bookings**, **POST /transfer**
- ✅ Unique constraints để tự dedupe (`vnpTxnRef`, `(course_id, student_id)`)
- ✅ Khi nào cần Idempotency-Key vs Unique constraint

> 🎯 Cuối video: Pattern an toàn cho 4 endpoint quan trọng

---

## Slide 3 — Vì sao cần idempotency?

### Network không tin cậy

```
Client: POST /buy → fire request
       ↓ network timeout giữa chừng (Client không biết server đã nhận chưa)
Client: retry POST /buy

Có 2 outcome:
1. Server đã nhận lần 1 → tạo order → retry tạo duplicate order
2. Server chưa nhận lần 1 → retry là lần đầu

Cần: server có cách distinguish.
```

---

## Slide 4 — 2 chiến lược

### A. Idempotency-Key header (pattern Stripe, GitHub)

```http
POST /v1/buy
Idempotency-Key: client-uuid-abc-123
Body: { courseId: "c-1" }
```

Server lưu `(idempotencyKey, response)` → retry trả response cũ.

### B. Unique constraints (DB-level dedupe)

```ts
@@unique([courseId, studentId])      // course_enrollments
@@unique([vnpTransactionNo])         // payments
```

Retry insert → DB throw P2002 → handle gracefully.

> 💡 Tutor365 dùng **kết hợp**: Idempotency-Key cho HTTP layer + UNIQUE cho DB layer.

---

## Slide 5 — Bảng `idempotency_keys`

```ts
type IdempotencyKey = {
  id: string;
  key: string;                          // UNIQUE — value của header
  userId: string | null;
  endpoint: string;                     // 'POST /v1/courses/:id/buy'
  requestHash: string;                  // sha256 của body
  responseStatus: number;               // 200, 201, etc.
  responseBody: object;                 // JSON cached
  createdAt: Date;
  expiresAt: Date;                      // +24h
  // INDEX (key)
};
```

> 💡 Lưu **cả request hash** — nếu cùng key nhưng body khác → reject (FE bug).

---

## Slide 6 — Middleware/Interceptor implement

```ts
// common/interceptors/idempotency.interceptor.ts
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'];

    if (!key) return next.handle();    // optional header

    const endpoint = `${req.method} ${req.route?.path}`;
    const reqHash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      if (existing.endpoint !== endpoint || existing.requestHash !== reqHash) {
        throw new ConflictException('Idempotency key reuse với request khác');
      }
      const res = ctx.switchToHttp().getResponse();
      res.status(existing.responseStatus);
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        const res = ctx.switchToHttp().getResponse();
        await this.prisma.idempotencyKey.create({
          data: {
            key, userId: req.user?.sub, endpoint, requestHash: reqHash,
            responseStatus: res.statusCode,
            responseBody: responseBody as any,
            expiresAt: addHours(new Date(), 24),
          },
        });
      }),
    );
  }
}
```

---

## Slide 7 — Apply interceptor

```ts
@UseInterceptors(IdempotencyInterceptor)
@Auth('student')
@Post('courses/:id/buy')
async buy(...) { /* ... */ }
```

**Hoặc global cho POST:**

```ts
// app.module.ts
{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }
```

> 💡 Tutor365 dùng per-endpoint cho rõ — chỉ POST quan trọng cần.

---

## Slide 8 — Test scenario

```bash
KEY="client-uuid-abc-123"

# 1. POST với key
RES1=$(curl -X POST /v1/courses/$CID/buy \
  -H "Idempotency-Key: $KEY" \
  -H "Authorization: Bearer $STUDENT" \
  -d '{}')
echo $RES1
# { orderId: 'o-1', vnpayUrl: '...' }

# 2. Network timeout — client retry with same key
RES2=$(curl -X POST /v1/courses/$CID/buy \
  -H "Idempotency-Key: $KEY" \
  -d '{}')
echo $RES2
# { orderId: 'o-1', vnpayUrl: '...' }   ← Same response, KHÔNG tạo order mới

# 3. Cùng key nhưng body khác
curl -X POST /v1/courses/$CID/buy \
  -H "Idempotency-Key: $KEY" \
  -d '{"different":"body"}'
# 409 — Idempotency key reuse

# Verify: chỉ 1 order trong DB
psql -c "SELECT COUNT(*) FROM orders WHERE student_id = '$SID' AND ref_id = '$CID'"
# 1
```

---

## Slide 9 — Unique constraints layer

### Pattern enforced ở DB

```prisma
// schema.prisma
model CourseEnrollment {
  id          String   @id @default(uuid())
  courseId    String
  studentId   String
  // ...
  @@unique([courseId, studentId])
}

model Payment {
  id                  String   @id @default(uuid())
  orderId             String
  vnpTransactionNo    String   @unique
  // ...
}

model Order {
  id          String   @id @default(uuid())
  vnpTxnRef   String   @unique
  // ...
}
```

---

## Slide 10 — Handle P2002 gracefully

```ts
async markPaid(orderId, meta) {
  try {
    return await this.prisma.$transaction(/* ... */);
  } catch (e) {
    if (e.code === 'P2002') {
      const target = e.meta?.target as string[];
      if (target?.includes('vnpTransactionNo')) {
        // Duplicate IPN retry — silently return
        this.logger.warn(`Duplicate IPN ${meta.vnpTransactionNo}`);
        return this.prisma.order.findUnique({ where: { id: orderId } });
      }
      if (target?.includes('courseId') && target?.includes('studentId')) {
        // Course enrollment đã tồn tại — race condition giữa 2 IPN
        return this.prisma.order.findUnique({ where: { id: orderId } });
      }
    }
    throw e;
  }
}
```

---

## Slide 11 — Khi nào dùng Idempotency-Key vs Unique?

| Scenario | Idempotency-Key | Unique constraint |
|----------|-----------------|-------------------|
| Trả response cached | ✅ | ❌ |
| Dedupe ở DB | ⚠️ | ✅ |
| User retry trong vài giây | ✅ | ⚠️ (cần handle P2002) |
| Webhook retry (VNPay IPN) | ❌ (VNPay không gửi key) | ✅ |
| Cùng request, body khác | ✅ phát hiện | ❌ không phân biệt |
| Long-term dedupe (years) | ❌ (expires 24h) | ✅ vĩnh viễn |

**Best practice:** Dùng **cả 2** layer.

---

## Slide 12 — Cleanup expired keys

```ts
@Cron('0 3 * * *')   // 3am daily
async cleanupExpiredKeys() {
  const { count } = await this.prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  this.logger.log(`Cleaned ${count} expired idempotency keys`);
}
```

> 💡 24h TTL đủ cho client retry. Sau đó user thường đã thấy result và bỏ qua.

---

## Slide 13 — Apply cho endpoints quan trọng

### Tutor365 list

```ts
// 1. Buy course / book session — tạo order
@UseInterceptors(IdempotencyInterceptor)
@Post('courses/:id/buy')

// 2. Tạo session booking
@UseInterceptors(IdempotencyInterceptor)
@Post('bookings')

// 3. Tutor accept (race condition)
@UseInterceptors(IdempotencyInterceptor)
@Post('bookings/:id/accept')

// 4. Admin assign tutor
@UseInterceptors(IdempotencyInterceptor)
@Post('admin/bookings/:id/assign')

// 5. Payout confirm
@UseInterceptors(IdempotencyInterceptor)
@Post('admin/payouts/:id/confirm')
```

> 💡 GET không cần (đã idempotent natively). PATCH/DELETE tuỳ — usually không.

---

## Slide 14 — Composite unique cho dedupe semantic

```prisma
// 1 student × 1 course = 1 enrollment
model CourseEnrollment {
  @@unique([courseId, studentId])
}

// 1 student × 1 course = 1 review
model CourseReview {
  @@unique([courseId, studentId])
}

// 1 student × 1 tutor × 1 session = 1 attendance
model SessionAttendance {
  @@id([bookingId, userId])
}

// 1 user có 1 tutor profile / student profile (1:1)
model TutorProfile {
  userId  String @id     // PK = FK, đảm bảo 1:1
}
```

---

## Slide 15 — Test idempotency layered

```bash
# Setup: course $CID, student $STUDENT

# 1. Buy → tạo order o-1
curl -X POST /v1/courses/$CID/buy -H "Idempotency-Key: K1" ...

# 2. Pay (sandbox)
# → IPN: tạo enrollment, payment

# 3. VNPay retry IPN với cùng vnpTransactionNo
# → P2002 catch → return order (no error)

# 4. Student "rebuy" cùng course (forget enrolled)
curl -X POST /v1/courses/$CID/buy
# → check existing enrollment → 409 "Bạn đã enroll"

# 5. Student tạo order, network timeout, retry với same key
curl -X POST /v1/courses/$CID/buy -H "Idempotency-Key: K2"   # lần đầu
curl -X POST /v1/courses/$CID/buy -H "Idempotency-Key: K2"   # retry
# Cả 2 trả cùng response

# 6. Student tạo order cho course khác với same key
curl -X POST /v1/courses/$CID2/buy -H "Idempotency-Key: K2"
# 409 — key reuse with different request
```

---

## Slide 16 — Anti-patterns

```ts
// ❌ Dùng Idempotency-Key cho query
GET /courses?...&idempotencyKey=...
// → GET đã idempotent, key là noise

// ❌ Lưu key không TTL
// → Table phình mãi

// ❌ Cache response chứa secret
{ accessToken: 'xyz' }
// → idem_keys table chứa token
// → Nên không cache sensitive

// ❌ Cùng key cho endpoint khác
POST /buy với K1
POST /book với K1
// → Reject với 409 — guard không cho

// ❌ Trust client always send key
// → optional — server skip nếu thiếu

// ❌ Quên handle P2002
throw e   // → user thấy 500
// → catch + return graceful
```

---

## Slide 17 — Section 14 hoàn tất

### Order layer complete

✅ V42 — Order state machine + cron expire
✅ V43 — Idempotency + unique constraints

**Section 15 — Tutor Payouts** (3 video):

- V44: Monthly aggregate revenue
- V45: Commission formula
- V46: Hanah payout dashboard

> 🚀 Sang Section 15 — money out cho Tutor.

---

## Slide 18 — Bài tập thực hành

### 🎯 Idempotency E2E

**Bài 1:** Migration `idempotency_keys` UNIQUE key.

**Bài 2:** Implement IdempotencyInterceptor.

**Bài 3:** Apply cho 4 endpoint quan trọng (slide 13).

**Bài 4:** Test full scenario (slide 15).

**Bài 5:** Implement cleanup cron expired keys.

**Bài 6:** Test composite unique: Insert 2 enrollment cùng (courseId, studentId) → P2002.

**Bài 7:** Handle P2002 gracefully trong markPaid.

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| Key string rỗng | Skip interceptor |
| Key quá dài (>1000 chars) | Reject với 400 |
| Key from different user | Allow (key namespace per user) |
| Concurrent same key | DB UNIQUE → 1 thắng, 1 fail → race-safe |
| Key expired sau response cached | Treat as new request |
| Body chứa timestamp khác | Same key + different hash → 409 |

---

## Slide 20 — Tổng kết Video 43

### Bạn vừa học

- ✅ Idempotency = 1 request, 1 effect bất kể retry
- ✅ Idempotency-Key header pattern Stripe/GitHub style
- ✅ Bảng idempotency_keys với cached response
- ✅ Interceptor implement
- ✅ Layered: header + unique constraint DB
- ✅ Handle P2002 gracefully
- ✅ Apply cho 4 endpoint critical
- ✅ Composite unique cho semantic dedupe
- ✅ Cleanup cron 24h TTL

> 💪 Idempotency chắc chắn = retry không gây harm

---

<!-- _class: lead -->

# Tiếp theo: Video 44

## Tutor Payout — Monthly Aggregate Revenue

Aggregate course + session revenue mỗi tháng cho Tutor. Bảng tutor_payouts.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 44 🚀

> *"Idempotency is the property that lets the network be honest about its failures."*
