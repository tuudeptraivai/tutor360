---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 37: iCal Feed RFC 5545'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# iCal Feed
# RFC 5545

### Khóa 2-3 — Video 37

**ical-generator · VEVENT · Subscribe Google/Apple**

> User add 1 URL → calendar tự sync mãi mãi

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **RFC 5545 iCal format**
- ✅ Endpoint **`/v1/users/:userId/sessions.ics`** trả text/calendar
- ✅ Generate VEVENT từ booking
- ✅ Embed Jitsi URL vào `LOCATION` + `DESCRIPTION`
- ✅ Token authentication trong URL (calendar subscribe không gửi header)
- ✅ RRULE cho combo parent

> 🎯 Cuối video: User subscribe URL → Google Calendar tự update khi có booking mới

---

## Slide 3 — Vì sao iCal subscribable URL?

### So sánh với download .ics 1 lần

| | Download file | Subscribe URL |
|--|---------------|---------------|
| User action | Tải file → import | Add URL 1 lần |
| Cập nhật | Manual re-download | Auto re-fetch (mỗi 1h-24h) |
| Booking mới | User không thấy | Hiện tự động |
| Cancel | User không biết | Tự xoá khỏi calendar |

**Tutor365 chọn:** Subscribe URL (tốt hơn UX dài hạn).

---

## Slide 4 — Auth qua token trong URL

### Calendar subscribe không gửi Bearer header

```
Google/Apple Calendar HTTP GET sessions.ics
  → KHÔNG có Authorization header
  → Server không biết ai sub

Solution: Token trong URL
  https://api.tutor365.vn/v1/users/u-1/sessions.ics?token=<calendar-token>
```

**Token đặc biệt:**
- Long-lived (1 năm), không như access token 15p
- Lưu DB whitelist, revoke được
- Read-only — chỉ access calendar feed

---

## Slide 5 — Schema `calendar_tokens`

```ts
type CalendarToken = {
  id: string;
  userId: string;
  tokenHash: string;                     // sha256(raw)
  createdAt: Date;
  expiresAt: Date;                       // +1 year
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};
```

> 💡 Lưu hash, không lưu raw. Tương tự refresh token V08.

---

## Slide 6 — Endpoint generate token

```ts
@Auth('student', 'tutor', 'admin')
@Post('me/calendar-token')
async createCalendarToken(@CurrentUser('sub') userId: string) {
  // Optional: invalidate token cũ
  await this.prisma.calendarToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');

  await this.prisma.calendarToken.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: addYears(new Date(), 1),
    },
  });

  return {
    icsUrl: `${process.env.APP_URL}/v1/users/${userId}/sessions.ics?token=${raw}`,
    webcalUrl: `webcal://api.tutor365.vn/v1/users/${userId}/sessions.ics?token=${raw}`,
  };
}
```

> 💡 Mỗi user 1 active token. Re-generate = revoke cũ.

---

## Slide 7 — Endpoint iCal feed

```ts
import ical, { ICalCalendarMethod } from 'ical-generator';

@Public()                                  // verify token trong URL
@Get('users/:userId/sessions.ics')
@Header('Content-Type', 'text/calendar; charset=utf-8')
async ics(
  @Param('userId') userId: string,
  @Query('token') token: string,
  @Res() res: Response,
) {
  if (!token) throw new UnauthorizedException();
  const hash = createHash('sha256').update(token).digest('hex');

  const ct = await this.prisma.calendarToken.findFirst({
    where: { userId, tokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!ct) throw new UnauthorizedException();

  // Track usage
  await this.prisma.calendarToken.update({
    where: { id: ct.id }, data: { lastUsedAt: new Date() },
  });

  const cal = await this.calendar.buildIcal(userId);
  res.send(cal.toString());
}
```

---

## Slide 8 — buildIcal

```ts
async buildIcal(userId: string): Promise<ICalCalendar> {
  const cal = ical({
    name: 'Tutor365 Schedule',
    description: 'Lịch học live tutoring',
    timezone: 'Asia/Ho_Chi_Minh',
    prodId: { company: 'Tutor365', product: 'Schedule', language: 'VI' },
    method: ICalCalendarMethod.PUBLISH,
  });

  // Lấy booking 1 tháng trước + 6 tháng tới
  const from = subMonths(new Date(), 1);
  const to = addMonths(new Date(), 6);

  const user = await this.usersService.findById(userId);
  const where: any = {
    startAt: { gte: from, lte: to },
    status: { in: ['confirmed', 'in_progress', 'completed', 'no_show'] },
    parentBookingId: null,        // skip combo parent (chỉ children)
  };
  if (user.role === 'student') where.studentId = userId;
  else if (user.role === 'tutor') where.tutorId = userId;

  const bookings = await this.prisma.sessionBooking.findMany({
    where,
    include: {
      subject: true,
      level: true,
      tutor: { select: { fullName: true } },
      student: { select: { fullName: true } },
    },
    orderBy: { startAt: 'asc' },
  });

  for (const b of bookings) {
    this.addBookingToCal(cal, b);
  }

  return cal;
}
```

---

## Slide 9 — addBookingToCal

```ts
private addBookingToCal(cal: ICalCalendar, b: SessionBookingWithRelations) {
  const endAt = new Date(b.startAt.getTime() + b.durationHr * 3600_000);
  const jitsiUrl = b.meetingRoomName
    ? `https://meet.jit.si/${b.meetingRoomName}`
    : '';

  cal.createEvent({
    id: `tutor365-${b.id}@tutor365.vn`,    // UID unique
    start: b.startAt,
    end: endAt,
    summary: `${b.subject.name} - ${b.level.name}`,
    description: this.buildDescription(b, jitsiUrl),
    location: jitsiUrl,
    url: jitsiUrl,
    organizer: { name: 'Tutor365', email: 'noreply@tutor365.vn' },
    attendees: [
      { name: b.student?.fullName, status: 'ACCEPTED' as any },
      { name: b.tutor?.fullName,   status: 'ACCEPTED' as any },
    ],
    status: this.toIcalStatus(b.status),
  });
}

private buildDescription(b, jitsiUrl) {
  return [
    `Học sinh: ${b.student?.fullName}`,
    `Tutor: ${b.tutor?.fullName ?? 'Chưa assign'}`,
    `Môn: ${b.subject.name}, Lớp: ${b.level.name}`,
    `Thời lượng: ${b.durationHr}h`,
    '',
    `Link Jitsi: ${jitsiUrl}`,
    `Tutor365 booking #${b.id}`,
  ].join('\n');
}
```

---

## Slide 10 — Map status sang iCal status

```ts
private toIcalStatus(status: string): ICalEventStatus {
  return ({
    confirmed: ICalEventStatus.CONFIRMED,
    in_progress: ICalEventStatus.CONFIRMED,
    completed: ICalEventStatus.CONFIRMED,
    cancelled: ICalEventStatus.CANCELLED,
    no_show: ICalEventStatus.CANCELLED,
  })[status] ?? ICalEventStatus.TENTATIVE;
}
```

> 💡 `CANCELLED` events vẫn xuất hiện trong feed nhưng calendar app hiển thị strikethrough.

---

## Slide 11 — Test add vào Google Calendar

```bash
# 1. Tutor generate token
TOKEN_RES=$(curl -X POST /v1/me/calendar-token -H "Authorization: Bearer $TUTOR")
ICS_URL=$(echo $TOKEN_RES | jq -r .icsUrl)
echo $ICS_URL
# https://api.tutor365.vn/v1/users/u-xxx/sessions.ics?token=abc...

# 2. Verify endpoint trả text/calendar
curl $ICS_URL
# BEGIN:VCALENDAR
# VERSION:2.0
# PRODID:-//Tutor365//Schedule//VI
# BEGIN:VEVENT
# UID:tutor365-b-uuid@tutor365.vn
# DTSTART:20260525T020000Z
# ...
# END:VEVENT
# END:VCALENDAR

# 3. Add vào Google Calendar
# - Open calendar.google.com
# - Settings → Add calendar → From URL
# - Paste $ICS_URL
# - Google fetch + render events
```

---

## Slide 12 — Revoke token

### User bị compromise

```ts
@Auth('student', 'tutor', 'admin')
@Delete('me/calendar-token')
async revokeCalendarToken(@CurrentUser('sub') userId: string) {
  await this.prisma.calendarToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// User regenerate token mới
@Post('me/calendar-token')
async regenerate(...) {
  // ... revoke + create new
}
```

**Effect:** Google Calendar cố sync URL cũ → 401 → user phải re-subscribe URL mới.

---

## Slide 13 — Combo recurring RRULE

### Có nên dùng RRULE cho combo?

```ts
// Option A: Mỗi child = 1 VEVENT riêng (Tutor365 chọn)
// - Pros: Cancel child không ảnh hưởng child khác
// - Pros: Mỗi event có Jitsi URL riêng

// Option B: 1 VEVENT parent + RRULE
// - Pros: ICS file gọn
// - Cons: Cancel 1 buổi phức tạp (EXDATE)
// - Cons: Mỗi instance share 1 Jitsi URL (sai vì mỗi buổi room riêng)

// → Option A simpler, dùng cho Tutor365
```

---

## Slide 14 — Performance: cache iCal

### Calendar app fetch định kỳ

```ts
@Get('users/:userId/sessions.ics')
@Header('Cache-Control', 'private, max-age=300')   // 5 phút
async ics(...) {
  // Generate iCal mỗi 5 phút thay vì mỗi request
}
```

**Hoặc cache trong app:**

```ts
private cache = new Map<string, { content: string; at: number }>();

async buildIcal(userId) {
  const cached = this.cache.get(userId);
  if (cached && Date.now() - cached.at < 300_000) {
    return cached.content;
  }
  // ... generate
  this.cache.set(userId, { content: result, at: Date.now() });
  return result;
}
```

> 💡 C6 chuyển sang Redis cache. MVP in-memory đủ.

---

## Slide 15 — Anti-patterns

```ts
// ❌ Trả ICS cho user không phải own
GET /users/anyId/sessions.ics?token=...
// → server vẫn check token match userId

// ❌ Token không expire
// → user lost → URL vẫn dùng được mãi

// ❌ Lưu raw token vào DB
{ token: 'abc' }   // → DB leak → URL valid

// ❌ Quên Content-Type
res.send(content)   // → default text/html → calendar không parse

// ❌ Quên UID
createEvent({ /* no id */ })
// → mỗi fetch tạo event mới, không dedupe

// ❌ Embed access token (15p) vào URL
// → expire sau 15p, user phải re-subscribe

// ❌ Token revoked vẫn cho fetch
// → check revokedAt is null
```

---

## Slide 16 — Edge cases

| Case | Behavior |
|------|----------|
| Token expire | 401 |
| Token revoked | 401 |
| Token cho userA gọi `/users/userB/...` | 401 (token không match userId) |
| User không có booking | Empty calendar (valid format) |
| 100+ booking | All trong response (1 fetch) |
| Combo parent | Skip (parentBookingId=null filter) |
| Booking với Jitsi URL null | LOCATION rỗng — OK |

---

## Slide 17 — Bài tập thực hành

### 🎯 iCal feed E2E

**Bài 1:** Migration `calendar_tokens`.

**Bài 2:** Implement create/revoke token endpoint.

**Bài 3:** Implement `/v1/users/:userId/sessions.ics` với token validate.

**Bài 4:** Implement buildIcal với ical-generator.

**Bài 5:** Test add vào Google Calendar — verify event hiện đúng giờ + tz.

**Bài 6:** Test add vào Apple Calendar trên iPhone.

**Bài 7:** Bonus: cache iCal 5 phút.

---

## Slide 18 — Section 12 hoàn tất

### Calendar layer ready

✅ V35 — `/sessions` calendar feed JSON
✅ V36 — `/join` redirect refine
✅ V37 — `/sessions.ics` iCal RFC 5545

**Section 13 — VNPay Integration** (4 video):

- V38: VNPay sandbox config
- V39: Create order + sign
- V40: Return URL verify
- V41: IPN webhook idempotent

> 🚀 Sang Section 13 — money flow đầy đủ.

---

## Slide 19 — Real Apple Calendar test

```
Mac/iPhone:
1. Open Calendar app
2. File → New Calendar Subscription (Mac)
   or Settings → Calendar → Accounts → Add Other → Add Subscribed (iPhone)
3. Paste icsUrl với token
4. Set "Auto-refresh" → Every hour
5. Booking mới hiện sau ~1h

Test cancel: cancel booking trên Tutor365
  → 1h sau Apple Calendar re-fetch
  → event đổi sang CANCELLED (gạch ngang)
```

---

## Slide 20 — Tổng kết Video 37

### Bạn vừa học

- ✅ RFC 5545 iCal format basics
- ✅ Subscribable URL > download file
- ✅ Calendar token (long-lived) khác access token
- ✅ Token in URL (không thể dùng Bearer header)
- ✅ Endpoint `.ics` text/calendar response
- ✅ ical-generator: createEvent + UID + LOCATION + DESCRIPTION
- ✅ Map booking status → iCal STATUS
- ✅ Combo: mỗi child = 1 VEVENT riêng
- ✅ Cache iCal 5 phút
- ✅ Revoke + regenerate token

> 💪 iCal feed = bridge Tutor365 với apps lịch user dùng hàng ngày

---

<!-- _class: lead -->

# Tiếp theo: Video 38

## VNPay Sandbox Config

Setup VNPay sandbox: TMN code, hash secret, return + IPN URL.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 38 🚀

> *"Subscribe once, sync forever."*
