---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 21: Enrollment khi VNPay Paid'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Enrollment
# khi VNPay Paid

### Khóa 2-3 — Video 21

**Order → Pay → IPN → Enrollment**

> Money in → entitlement out. Đơn giản nhưng phải đúng.

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `course_enrollments` + business rule
- ✅ Implement **`POST /v1/courses/:id/buy`** tạo order
- ✅ Stub VNPay (Section 13 sẽ làm thật)
- ✅ IPN callback → tạo enrollment (idempotent)
- ✅ Endpoint **`GET /v1/me/enrollments`**
- ✅ Verify enrollment cho lesson access
- ✅ Email enrollment confirmation

> 🎯 Cuối video: Student mua course → có enrollment → xem được mọi lesson

---

## Slide 3 — Schema `course_enrollments`

```ts
type CourseEnrollment = {
  id: string;
  courseId: string;
  studentId: string;
  orderId: string;                       // FK to orders (Section 13)
  pricePaidVnd: number;                  // snapshot giá lúc enroll
  enrolledAt: Date;
  progressPercent: number;               // 0-100, updated by V22
  completedAt: Date | null;
  // Constraint
  // UNIQUE (courseId, studentId)        — không enroll 2 lần
};
```

> 💡 `pricePaidVnd` snapshot — Tutor đổi giá sau này không ảnh hưởng record cũ.

---

## Slide 4 — Order shell (preview Section 13)

```ts
type Order = {
  id: string;
  studentId: string;
  type: 'course' | 'session_single' | 'session_combo';
  refId: string;                         // courseId hoặc bookingId
  subtotal: number;
  taxAmount: number;
  feeAmount: number;
  totalVnd: number;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  vnpTxnRef: string;                     // UNIQUE
  createdAt: Date;
  paidAt: Date | null;
  expiresAt: Date;                       // 30 phút
};
```

---

## Slide 5 — Buy course endpoint

### `POST /v1/courses/:id/buy`

```ts
@Auth('student')
@Post('courses/:id/buy')
async buy(
  @Param('id') courseId: string,
  @CurrentUser('sub') studentId: string,
) {
  return this.purchases.buyCourse(studentId, courseId);
}

// Service
async buyCourse(studentId: string, courseId: string) {
  const course = await this.coursesService.findById(courseId);
  if (course.status !== 'published') {
    throw new BadRequestException('Course không khả dụng');
  }

  // Đã enroll? trả info luôn
  const existing = await this.prisma.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  if (existing) {
    throw new ConflictException('Bạn đã enroll khoá này');
  }

  // Free course → enroll trực tiếp (không qua VNPay)
  if (course.priceVnd === 0) {
    return this.directEnroll(studentId, courseId, course);
  }

  // Tạo order pending → return VNPay URL
  return this.ordersService.createCourseOrder(studentId, course);
}
```

---

## Slide 6 — directEnroll cho free course

```ts
async directEnroll(studentId, courseId, course) {
  // Tạo order $0 + paid ngay
  const order = await this.prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        studentId,
        type: 'course',
        refId: courseId,
        subtotal: 0, taxAmount: 0, feeAmount: 0, totalVnd: 0,
        status: 'paid',
        paidAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        vnpTxnRef: `free-${randomUUID()}`,
      },
    });
    const enr = await tx.courseEnrollment.create({
      data: {
        courseId,
        studentId,
        orderId: o.id,
        pricePaidVnd: 0,
      },
    });
    return { order: o, enrollment: enr };
  });

  return { type: 'enrolled', enrollment: order.enrollment };
}
```

---

## Slide 7 — Order Paid → tạo Enrollment

### Section 13 sẽ wire VNPay thật. Đây là phần xử lý sau khi paid.

```ts
// modules/orders/orders.service.ts
async markPaid(orderId: string, paymentMeta: PaymentMeta) {
  const order = await this.prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundException();
  if (order.status === 'paid') return order;     // idempotent

  await this.prisma.$transaction(async (tx) => {
    // 1. Update order
    await tx.order.update({
      where: { id: orderId, status: 'pending' },
      data: { status: 'paid', paidAt: new Date() },
    });

    // 2. Side effect tuỳ type
    if (order.type === 'course') {
      await tx.courseEnrollment.create({
        data: {
          courseId: order.refId,
          studentId: order.studentId,
          orderId: order.id,
          pricePaidVnd: order.totalVnd,
        },
      });
    } else if (order.type === 'session_single') {
      await tx.sessionBooking.update({
        where: { id: order.refId },
        data: { status: 'pending_assign' },
      });
    }
    // ... session_combo

    // 3. Audit + notification
    await tx.auditLog.create({
      data: {
        actorUserId: order.studentId,
        action: 'order.paid',
        entityType: 'order',
        entityId: order.id,
        metadata: paymentMeta as any,
      },
    });
  });

  // Email (fire-and-forget hoặc queue)
  this.mailer.sendOrderConfirmation(order).catch(() => {});
}
```

---

## Slide 8 — Stub VNPay cho dev

### Section 13 sẽ implement đúng. MVP dev test bằng stub.

```ts
// modules/payments/vnpay-stub.controller.ts (dev only)
@Public()
@Post('dev/vnpay/simulate-paid')
async simulatePaid(@ZodBody(SimulateDto) body) {
  if (process.env.NODE_ENV === 'production') {
    throw new ForbiddenException();
  }
  await this.ordersService.markPaid(body.orderId, {
    bankCode: 'NCB',
    vnpTransactionNo: 'STUB-' + Date.now(),
    payDate: new Date(),
  });
  return { ok: true };
}
```

**Dùng:**

```bash
# 1. Student buy
curl -X POST /v1/courses/$ID/buy -H "Authorization: Bearer $STUDENT"
# { type: 'order', orderId, vnpayUrl: 'http://stub...' }

# 2. Simulate paid (stub)
curl -X POST /v1/dev/vnpay/simulate-paid -d '{"orderId":"..."}'

# 3. Verify enrollment
curl /v1/me/enrollments -H "Authorization: Bearer $STUDENT"
```

---

## Slide 9 — List enrollments endpoint

```ts
@Auth('student')
@Get('me/enrollments')
async listMine(@CurrentUser('sub') studentId: string) {
  return this.enrollments.listByStudent(studentId);
}

async listByStudent(studentId: string) {
  const rows = await this.prisma.courseEnrollment.findMany({
    where: { studentId },
    orderBy: { enrolledAt: 'desc' },
    include: {
      course: {
        include: { subject: true, level: true, tutor: { select: { id: true, fullName: true } } },
      },
    },
  });
  return rows.map(r => ({
    id: r.id,
    course: toCourseCard(r.course),
    enrolledAt: r.enrolledAt,
    progressPercent: r.progressPercent,
    completedAt: r.completedAt,
  }));
}
```

---

## Slide 10 — Verify enrollment cho lesson

```ts
// V17 lesson serve — refine
async isEnrolled(studentId: string, courseId: string): Promise<boolean> {
  const enr = await this.prisma.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  return !!enr;
}
```

> 💡 Composite unique index `(courseId, studentId)` → query O(log N).

---

## Slide 11 — Idempotency: IPN webhook bắn lặp

### Vấn đề thực tế của VNPay

```
IPN bắn lần 1 → markPaid → tạo enrollment
IPN bắn lần 2 (network retry) → markPaid lại
  → đã enroll → ❌ unique constraint violation
```

**Fix:**

```ts
async markPaid(orderId, meta) {
  const order = await this.findById(orderId);
  if (order.status === 'paid') return order;     // ← idempotent gate

  // Try create enrollment — handle unique conflict gracefully
  try {
    await this.prisma.$transaction(/* ... */);
  } catch (e) {
    if (e.code === 'P2002') {     // unique violation
      // Đã có enrollment — order đúng ra phải paid, fix data
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'paid', paidAt: new Date() },
      });
      return;
    }
    throw e;
  }
}
```

---

## Slide 12 — Order expire job

### Pending order > 30 phút → expire

```ts
@Injectable()
export class OrdersCleanupCron {
  @Cron(CronExpression.EVERY_MINUTE)
  async expirePending() {
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const { count } = await this.prisma.order.updateMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      data: { status: 'expired' },
    });
    if (count > 0) this.logger.log(`Expired ${count} orders`);
  }
}
```

> 💡 V42 detail. Đây chỉ stub để demo flow.

---

## Slide 13 — Email enrollment

```ts
async sendOrderConfirmation(order: Order) {
  const student = await this.usersService.findById(order.studentId);
  let detail = '';
  if (order.type === 'course') {
    const course = await this.coursesService.findById(order.refId);
    detail = `Bạn đã enroll khoá học "${course.title}".`;
  } else if (order.type === 'session_single') {
    detail = `Buổi học live của bạn đã được xác nhận thanh toán.`;
  }

  await this.send(student.email, 'Xác nhận thanh toán', `
    <p>Xin chào ${student.fullName},</p>
    <p>${detail}</p>
    <p>Mã giao dịch: ${order.vnpTxnRef}</p>
    <p>Tổng: ${formatVnd(order.totalVnd)}</p>
  `);
}
```

---

## Slide 14 — Test E2E (stub mode)

```bash
# 1. Login student
STUDENT=$(curl -X POST /v1/auth/login -d '...' | jq -r .accessToken)

# 2. Buy course
BUY=$(curl -X POST /v1/courses/$COURSE_ID/buy -H "Authorization: Bearer $STUDENT")
ORDER_ID=$(echo $BUY | jq -r .orderId)

# 3. Verify order pending
curl /v1/me/orders/$ORDER_ID -H "Authorization: Bearer $STUDENT"
# status: pending

# 4. Simulate paid
curl -X POST /v1/dev/vnpay/simulate-paid -d "{\"orderId\":\"$ORDER_ID\"}"

# 5. Verify enrollment
curl /v1/me/enrollments -H "Authorization: Bearer $STUDENT"
# [{ course: {...}, enrolledAt: "..." }]

# 6. Access lesson (paid one — không free preview)
curl /v1/lessons/$LESSON_ID/content -H "Authorization: Bearer $STUDENT"
# { contentUrl: "https://minio.../..." }

# 7. Buy lại same course
curl -X POST /v1/courses/$COURSE_ID/buy -H "Authorization: Bearer $STUDENT"
# 409 Conflict — Bạn đã enroll
```

---

## Slide 15 — Tax + Fee preview

```ts
// modules/orders/pricing.ts
export function calculateCoursePrice(coursePriceVnd: number, rules: PricingRules) {
  const taxAmount = Math.floor(coursePriceVnd * rules.taxPercent / 100);
  const feeAmount = rules.feeFixedVnd;
  const totalVnd = coursePriceVnd + taxAmount + feeAmount;
  return {
    subtotal: coursePriceVnd,
    taxAmount,
    feeAmount,
    totalVnd,
  };
}
```

```ts
// Tạo order
const pricing = calculateCoursePrice(course.priceVnd, await this.getPricingRules());
const order = await this.prisma.order.create({
  data: {
    studentId, type: 'course', refId: courseId,
    ...pricing,
    status: 'pending',
    vnpTxnRef: `c-${courseId}-${Date.now()}`,
    expiresAt: addMinutes(new Date(), 30),
  },
});
```

> 💡 Pricing rules từ bảng `pricing_rules` (Section 13). MVP hardcode default.

---

## Slide 16 — Anti-patterns

```ts
// ❌ Tạo enrollment trước khi paid
buy → enroll luôn → wait paid
// → Student xem content nhưng chưa trả tiền

// ❌ Không check unique (courseId, studentId)
// → Enroll 2 lần, ghi đè progress

// ❌ IPN không idempotent
// → Duplicate enrollment khi VNPay retry

// ❌ pricePaidVnd không snapshot
// → Tutor đổi giá → record cũ "999k" mà giá hiện tại 499k

// ❌ Free course đi qua VNPay (totalVnd=0)
// → VNPay reject "Số tiền không hợp lệ"

// ❌ Quên audit log enrollment
// → Không track ai trả gì khi nào
```

---

## Slide 17 — Edge cases

| Case | Behavior |
|------|----------|
| Student buy course archived | 400 — không khả dụng |
| Order pending, student buy lại | Có thể trả URL VNPay của order cũ (resume) |
| Course free, student "buy" lại | 409 — đã enroll |
| IPN bắn 2 lần cho cùng order | Lần 2 idempotent skip |
| Order paid nhưng enrollment fail (DB issue) | Audit + alert ops |
| Course archived sau khi student enrolled | Student giữ access |

---

## Slide 18 — Bài tập thực hành

### 🎯 Buy → enroll flow

**Bài 1:** Migration `course_enrollments` với UNIQUE `(courseId, studentId)`.

**Bài 2:** Implement `POST /v1/courses/:id/buy` xử lý 3 case:
- Free course → direct enroll
- Paid course → tạo order pending
- Đã enroll → 409

**Bài 3:** Implement `markPaid` idempotent với try/catch unique violation.

**Bài 4:** Stub endpoint `POST /v1/dev/vnpay/simulate-paid`.

**Bài 5:** Test E2E (slide 14).

**Bài 6:** Test idempotent: gọi simulate-paid 2 lần → enrollment chỉ 1 row.

**Bài 7:** Bonus: implement endpoint resume order pending — `GET /v1/me/orders/:id/payment-url`.

---

## Slide 19 — Tổng kết Video 21

### Bạn vừa học

- ✅ Schema `course_enrollments` UNIQUE (courseId, studentId)
- ✅ Snapshot pricePaidVnd
- ✅ Buy course: 3 case (free, paid, duplicate)
- ✅ Order pending → markPaid → enrollment
- ✅ Idempotent IPN (gate status + try/catch unique)
- ✅ Stub VNPay endpoint cho dev
- ✅ List my enrollments
- ✅ Verify enrollment cho lesson access
- ✅ Email confirmation fire-and-forget

> 💪 Money → entitlement đúng = nửa cuộc đời backend marketplace

---

<!-- _class: lead -->

# Tiếp theo: Video 22

## Lesson Progress Tracking

Track watchedSec, completedAt, composite PK (enrollmentId, lessonId), progress % cho course.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 22 🚀

> *"Entitlement is a promise the database keeps."*
