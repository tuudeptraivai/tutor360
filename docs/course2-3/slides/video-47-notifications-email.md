---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 47: Notifications + Email Send'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Notifications
# + Email Send

### Khóa 2-3 — Video 47

**Notification table · Templates · Nodemailer**

> Email = bridge ngoài app — phải reliable

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `notifications` (in-app + email log)
- ✅ Centralize **NotificationService**
- ✅ Template system với placeholders
- ✅ Send email qua Nodemailer (SMTP)
- ✅ Endpoint **`GET /v1/me/notifications`** in-app
- ✅ Mark read
- ✅ Preview: C6 chuyển sang BullMQ queue

> 🎯 Cuối video: Mọi event quan trọng → notification + email tự gửi

---

## Slide 3 — Schema `notifications`

```ts
type Notification = {
  id: string;
  userId: string;
  type: NotificationType;                // 'course.approved', 'booking.assigned', ...
  title: string;
  body: string;
  metadata: object;                      // JSON cho FE link đến entity
  emailStatus: 'pending' | 'sent' | 'failed' | 'skipped';
  emailSentAt: Date | null;
  emailError: string | null;
  readAt: Date | null;
  createdAt: Date;
};

// Index
// (userId, readAt) — list unread
// (userId, createdAt DESC) — list paginated
```

---

## Slide 4 — Notification types

```ts
export const NOTIFICATION_TYPES = [
  // Auth
  'auth.signup_welcome',
  'auth.email_verified',
  'auth.password_changed',
  
  // Course
  'course.submitted',
  'course.approved',
  'course.rejected',
  
  // Enrollment
  'enrollment.created',
  
  // Booking
  'booking.assigned',
  'booking.confirmed',
  'booking.cancelled',
  'booking.completed',
  'booking.no_show',
  'booking.reminder_24h',
  'booking.reminder_1h',
  
  // Payment
  'order.paid',
  'order.expired',
  
  // Payout
  'payout.finalized',
  'payout.paid',
  
  // Admin
  'admin.tutor_pending_approval',
  'admin.course_pending_approval',
  'admin.booking_pending_assign',
] as const;
```

---

## Slide 5 — NotificationService

```ts
@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private mailer: MailService,
    private logger: Logger,
  ) {}

  async send(opts: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, any>;
    sendEmail?: boolean;        // default true
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        metadata: opts.metadata ?? {},
        emailStatus: opts.sendEmail === false ? 'skipped' : 'pending',
      },
    });

    if (opts.sendEmail !== false) {
      // Fire-and-forget — không block
      this.deliverEmail(notification.id).catch((e) => {
        this.logger.error(`Email delivery failed: ${e.message}`);
      });
    }

    return notification;
  }

  private async deliverEmail(notificationId: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: true },
    });
    if (!n || n.emailStatus !== 'pending') return;

    try {
      await this.mailer.send(n.user.email, n.title, this.renderHtml(n));
      await this.prisma.notification.update({
        where: { id: n.id },
        data: { emailStatus: 'sent', emailSentAt: new Date() },
      });
    } catch (e) {
      await this.prisma.notification.update({
        where: { id: n.id },
        data: { emailStatus: 'failed', emailError: e.message },
      });
    }
  }
}
```

---

## Slide 6 — Apply ở các event

### Pattern: gọi notify trong service

```ts
// auth.service.ts
async verifyEmail(token) {
  // ... mark active
  await this.notifications.send({
    userId: user.id,
    type: 'auth.email_verified',
    title: 'Email đã được xác thực',
    body: 'Tài khoản đã active, hãy bắt đầu khám phá Tutor365.',
  });
}

// orders.service.ts
async markPaid(orderId, meta) {
  // ... existing
  await this.notifications.send({
    userId: order.studentId,
    type: 'order.paid',
    title: 'Thanh toán thành công',
    body: `Order #${order.id} đã được xác nhận thanh toán.`,
    metadata: { orderId: order.id, courseId: order.refId },
  });
}

// payouts.service.ts
async markPaid(id, ...) {
  // ...
  await this.notifications.send({
    userId: payout.tutorId,
    type: 'payout.paid',
    title: `Thanh toán tháng ${payout.periodMonth}/${payout.periodYear}`,
    body: `Số tiền ${formatVnd(payout.netPayoutVnd)} đã được chuyển. Bank ref: ${payout.bankRef}`,
  });
}
```

---

## Slide 7 — Template system

### File-based templates

```
mail/templates/
├── booking-assigned.html
├── booking-confirmed.html
├── booking-no-show.html
├── course-approved.html
├── course-rejected.html
├── order-paid.html
├── payout-paid.html
└── ...
```

```ts
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';

@Injectable()
export class TemplateService {
  private cache = new Map<string, HandlebarsTemplateDelegate>();

  render(name: string, vars: Record<string, any>): string {
    let tpl = this.cache.get(name);
    if (!tpl) {
      const html = readFileSync(`mail/templates/${name}.html`, 'utf-8');
      tpl = Handlebars.compile(html);
      this.cache.set(name, tpl);
    }
    return tpl(vars);
  }
}
```

---

## Slide 8 — Endpoint list in-app

```ts
@Auth('student', 'tutor', 'admin')
@Get('me/notifications')
async listMine(
  @CurrentUser('sub') userId: string,
  @ZodQuery(ListNotifQuery) q,
) {
  const where: any = { userId };
  if (q.unreadOnly) where.readAt = null;

  return this.prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q.limit,
    skip: (q.page - 1) * q.limit,
  });
}

@Auth('student', 'tutor', 'admin')
@Post('me/notifications/:id/read')
async markRead(
  @Param('id') id,
  @CurrentUser('sub') userId,
) {
  await this.prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

@Auth('student', 'tutor', 'admin')
@Post('me/notifications/mark-all-read')
async markAllRead(@CurrentUser('sub') userId) {
  await this.prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
```

---

## Slide 9 — Unread count badge

```ts
@Auth('student', 'tutor', 'admin')
@Get('me/notifications/unread-count')
async unreadCount(@CurrentUser('sub') userId) {
  const count = await this.prisma.notification.count({
    where: { userId, readAt: null },
  });
  return { count };
}
```

> 💡 FE call mỗi 60s hoặc on focus tab → badge "5 thông báo mới".

---

## Slide 10 — Email retry cron

### Failed email → retry

```ts
@Cron('*/15 * * * *')   // mỗi 15 phút
async retryFailedEmails() {
  const failed = await this.prisma.notification.findMany({
    where: {
      emailStatus: 'failed',
      createdAt: { gte: subHours(new Date(), 24) },
    },
    take: 50,
  });

  for (const n of failed) {
    await this.deliverEmail(n.id).catch(() => {});
  }
}
```

> 💡 24h retry window. Sau đó give up.

---

## Slide 11 — Throttle: don't spam user

```ts
async send(opts) {
  // Anti-spam: nếu cùng user + type trong 5 phút → skip
  const recent = await this.prisma.notification.findFirst({
    where: {
      userId: opts.userId,
      type: opts.type,
      createdAt: { gte: subMinutes(new Date(), 5) },
    },
  });
  if (recent) {
    this.logger.log(`Throttled notification ${opts.type} for user ${opts.userId}`);
    return recent;
  }

  // ... continue create
}
```

> 💡 Tutor365 MVP: throttle 5 phút same-type. Production có thể batch/digest.

---

## Slide 12 — User notification preferences

### Tutor/Student tắt loại nào

```ts
type NotificationPreference = {
  userId: string;
  channelEmail: boolean;
  channelInApp: boolean;
  // Per-type opt-out
  disabledTypes: NotificationType[];
};
```

```ts
async send(opts) {
  const pref = await this.prisma.notificationPreference.findUnique({
    where: { userId: opts.userId },
  });

  // Skip nếu opt-out
  if (pref?.disabledTypes.includes(opts.type)) return;

  const sendEmail = opts.sendEmail !== false && (pref?.channelEmail ?? true);

  // ... create + deliver
}
```

> 💡 Tutor365 MVP: chỉ default `channelEmail=true`. Opt-out là enhancement.

---

## Slide 13 — Reminder booking 24h

### Cron remind trước buổi học

```ts
@Cron('0 9 * * *')   // 9h sáng mỗi ngày
async sendReminderTomorrow() {
  const tomorrow = addDays(new Date(), 1);
  const start = startOfDay(tomorrow);
  const end = endOfDay(tomorrow);

  const bookings = await this.prisma.sessionBooking.findMany({
    where: {
      status: 'confirmed',
      startAt: { gte: start, lte: end },
    },
    include: { student: true, tutor: true },
  });

  for (const b of bookings) {
    await this.notifications.send({
      userId: b.studentId,
      type: 'booking.reminder_24h',
      title: 'Nhắc nhở: buổi học ngày mai',
      body: `Bạn có buổi học với ${b.tutor?.fullName} lúc ${format(b.startAt, 'HH:mm dd/MM')}`,
      metadata: { bookingId: b.id },
    });
    await this.notifications.send({
      userId: b.tutorId!,
      type: 'booking.reminder_24h',
      title: 'Nhắc nhở: buổi dạy ngày mai',
      body: `Bạn có buổi dạy với ${b.student.fullName} lúc ${format(b.startAt, 'HH:mm dd/MM')}`,
    });
  }
}
```

---

## Slide 14 — Test scenario

```bash
# Trigger event
curl -X POST /v1/admin/courses/$CID/approve -H "Authorization: Bearer $ADMIN"

# Notification tạo + email gửi
curl /v1/me/notifications -H "Authorization: Bearer $TUTOR"
# [{ type: 'course.approved', title: 'Khoá học đã duyệt', emailStatus: 'sent' }]

# Verify MailPit
open http://localhost:8025
# Email present với template

# Unread count
curl /v1/me/notifications/unread-count
# { count: 1 }

# Mark read
curl -X POST /v1/me/notifications/$NID/read
curl /v1/me/notifications/unread-count
# { count: 0 }
```

---

## Slide 15 — C6 preview — Queue cho production

```ts
// Production C6 dùng BullMQ
@Injectable()
export class NotificationService {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async send(opts) {
    const n = await this.prisma.notification.create({ /* ... */ });
    await this.emailQueue.add('send-email', { notificationId: n.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    });
  }
}

// Worker
@Processor('email')
class EmailWorker {
  @Process('send-email')
  async process(job: Job) {
    await this.deliverEmail(job.data.notificationId);
  }
}
```

> 💡 MVP: in-process fire-and-forget. Production: queue + retry.

---

## Slide 16 — Section 16 hoàn tất

✅ V47 — Notifications + email

**Section 17 — PostgreSQL Foundations** (4 video):

- V48: Vì sao PostgreSQL
- V49: Tables + relationships (ERD)
- V50: Constraints + data integrity
- V51: Keys + indexes basics

> 🚀 Sang Section 17 — bắt đầu khoá 3 (PG layer của syllabus gốc, đã merge vào C2-3).

---

## Slide 17 — Anti-patterns

```ts
// ❌ Send email blocking trong service
await this.mailer.send(...)
// → API endpoint chậm vì SMTP lag

// ❌ Tạo notification trong $transaction service
// → Nếu mail fail → rollback transaction kéo theo
// → Notification phải ngoài transaction hoặc fire-and-forget

// ❌ Hardcode template HTML trong code
const html = `<p>Xin chào ${user.fullName}...</p>`;
// → Template system

// ❌ Spam user
// → 100 notification same type trong 1 phút
// → Throttle

// ❌ Trust template variables tự sanitize XSS
{{user.fullName}}   // OK với Handlebars (auto escape)
{{{user.fullName}}}  // ❌ raw HTML — XSS risk
```

---

## Slide 18 — Bài tập thực hành

### 🎯 Notification E2E

**Bài 1:** Migration `notifications`.

**Bài 2:** Implement `NotificationService.send` với fire-and-forget email.

**Bài 3:** Apply ở 5 event quan trọng (course approve, booking assigned, order paid, payout paid, signup welcome).

**Bài 4:** Implement endpoint list, unread count, mark read.

**Bài 5:** Implement retry cron failed emails.

**Bài 6:** Implement reminder 24h cron.

**Bài 7:** Bonus: notification preferences opt-out.

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| User bị block | Email vẫn gửi? Tutor365 skip nếu status=blocked |
| User chưa verify email | Allow gửi (welcome verify) |
| SMTP server down | retry cron 15p |
| Same type duplicate trong 5p | Throttle skip |
| Notification 1000 trong DB cho 1 user | Pagination, không issue |
| Email bounce | Mark failed, retry 3x rồi give up |

---

## Slide 20 — Tổng kết Video 47

### Bạn vừa học

- ✅ Schema `notifications` với emailStatus tracking
- ✅ Centralized NotificationService
- ✅ Fire-and-forget email pattern
- ✅ Template system với Handlebars
- ✅ Apply ở mọi event quan trọng
- ✅ Endpoint list + unread count + mark read
- ✅ Retry cron failed
- ✅ Throttle same-type 5 phút
- ✅ Reminder 24h cron
- ✅ Preview C6 BullMQ queue

> 💪 Notification reliable = bridge ngoài app cho user

---

<!-- _class: lead -->

# Tiếp theo: Video 48

## PostgreSQL Foundations — Vì sao PG?

JSONB, tsrange, partial index, exclusion constraint — features PG mạnh cho Tutor365.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 48 🚀

> *"Notifications close the loop between system events and human attention."*
