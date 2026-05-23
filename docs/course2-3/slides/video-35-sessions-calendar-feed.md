---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 35: Calendar Feed GET /sessions'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Calendar Feed
# GET /sessions

### Khóa 2-3 — Video 35

**Filter · Range · FE Calendar render**

> FullCalendar cần data format đặc biệt — server đáp ứng

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Endpoint **`GET /v1/sessions?from..to`** filter
- ✅ Role-aware: student xem own, tutor xem assigned, admin xem all
- ✅ Format response cho **FullCalendar** + custom UI
- ✅ Pagination cursor (large range)
- ✅ Color code theo status
- ✅ Multi-user view (admin xem nhiều tutor)

> 🎯 Cuối video: FE C4 render calendar 1 tháng booking

---

## Slide 3 — Query DTO

```ts
export const ListSessionsQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  status: z.enum([
    'all', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show',
    'pending_assign', 'assigned',
  ]).default('all'),
  // Admin only filter
  userId: z.string().uuid().optional(),     // filter by student or tutor
  tutorId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  // Pagination
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).refine(d => d.to > d.from, { path: ['to'] })
  .refine(d => (d.to.getTime() - d.from.getTime()) <= 92 * 86400_000,
    { message: 'Range tối đa 3 tháng' });
```

---

## Slide 4 — Endpoint

```ts
@Auth('student', 'tutor', 'admin')
@Get('sessions')
async list(
  @ZodQuery(ListSessionsQuery) q,
  @CurrentUser() u: JwtPayload,
) {
  return this.calendar.list(q, u);
}
```

---

## Slide 5 — Service.list

```ts
async list(q: ListSessionsQueryInput, user: JwtPayload) {
  const where: Prisma.SessionBookingWhereInput = {
    startAt: { gte: q.from, lte: q.to },
  };
  if (q.status !== 'all') where.status = q.status;

  // Role-based scoping
  if (user.role === 'student') {
    where.studentId = user.sub;
  } else if (user.role === 'tutor') {
    where.tutorId = user.sub;
  } else if (user.role === 'admin') {
    // Admin: filter optional
    if (q.studentId) where.studentId = q.studentId;
    if (q.tutorId) where.tutorId = q.tutorId;
    if (q.userId) {
      where.OR = [{ studentId: q.userId }, { tutorId: q.userId }];
    }
  }

  if (q.subjectId) where.subjectId = q.subjectId;

  const items = await this.prisma.sessionBooking.findMany({
    where,
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    take: q.limit + 1,
    ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    include: {
      student: { select: { id: true, fullName: true } },
      tutor: { select: { id: true, fullName: true } },
      subject: true, level: true, package: true,
    },
  });

  const hasNext = items.length > q.limit;
  const toReturn = hasNext ? items.slice(0, q.limit) : items;
  return {
    items: toReturn.map(toSessionDto),
    nextCursor: hasNext ? toReturn.at(-1)!.id : null,
  };
}
```

---

## Slide 6 — toSessionDto: format cho FE

```ts
function toSessionDto(b: SessionBookingWithRelations) {
  return {
    id: b.id,
    title: `${b.subject.name} - ${b.level.name}`,
    start: b.startAt.toISOString(),
    end: new Date(b.startAt.getTime() + b.durationHr * 3600_000).toISOString(),
    status: b.status,
    color: getStatusColor(b.status),
    extendedProps: {
      studentId: b.studentId,
      studentName: b.student?.fullName,
      tutorId: b.tutorId,
      tutorName: b.tutor?.fullName,
      subjectId: b.subjectId,
      levelId: b.levelId,
      durationHr: b.durationHr,
      meetingRoomName: b.meetingRoomName,
      packageType: b.package?.type,
    },
  };
}

function getStatusColor(status: string): string {
  return ({
    pending_assign: '#ffa500',
    assigned: '#ffd700',
    confirmed: '#4CAF50',
    in_progress: '#2196F3',
    completed: '#9E9E9E',
    cancelled: '#f44336',
    no_show: '#9C27B0',
  })[status] ?? '#000';
}
```

> 💡 Format này tương thích FullCalendar.

---

## Slide 7 — Endpoint riêng cho calendar view

### Trả gọn cho UI

```ts
@Auth('student', 'tutor')
@Get('me/calendar')
async myCalendar(
  @CurrentUser('sub') uid: string,
  @CurrentUser('role') role: string,
  @ZodQuery(ListSessionsQuery) q,
) {
  // Shortcut: scope tự động theo role
  return this.calendar.list(q, { sub: uid, role: role as any });
}
```

---

## Slide 8 — Performance: index cho query

```sql
-- (Section 20 detail)
CREATE INDEX idx_booking_student_startAt
  ON session_bookings (student_id, start_at);

CREATE INDEX idx_booking_tutor_startAt
  ON session_bookings (tutor_id, start_at);

CREATE INDEX idx_booking_startAt_status
  ON session_bookings (start_at, status);
```

**Query 1 tháng cho 1 student:** ~1ms với index.

---

## Slide 9 — Combo expand: parent vs children

### Calendar nên hiển thị child hay parent?

```
Combo parent: id=p1, recurrenceRule="..."
Children: c1, c2, ..., c12 (mỗi child = 1 buổi)

Calendar render:
  ✅ Children individually — mỗi buổi 1 event
  ❌ Parent với RRULE — FullCalendar không tự expand recurring
```

**Filter trong calendar list:**

```ts
// Bỏ parent combo (recurrenceRule != null) — chỉ render children
where.recurrenceRule = null;
```

> 💡 Parent giữ ở DB cho audit/RRULE, FE chỉ render children làm event riêng.

---

## Slide 10 — Stats summary endpoint

```ts
@Auth('student', 'tutor', 'admin')
@Get('sessions/stats')
async stats(@ZodQuery(StatsQuery) q, @CurrentUser() u) {
  const where = this.buildWhere(q, u);

  const [total, byStatus] = await Promise.all([
    this.prisma.sessionBooking.count({ where }),
    this.prisma.sessionBooking.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map(b => [b.status, b._count])),
  };
}
```

---

## Slide 11 — Admin: list booking theo tutor

```ts
@AdminOnly()
@Get('admin/tutors/:id/sessions')
async tutorSessions(
  @Param('id') tutorId: string,
  @ZodQuery(ListSessionsQuery) q,
) {
  return this.calendar.list(
    { ...q, tutorId },
    { sub: 'admin', role: 'admin' as any },
  );
}
```

> 💡 Hanah dashboard: 1 tutor → calendar hiển thị tất cả buổi của tutor đó.

---

## Slide 12 — Test scenario

```bash
# Student: xem booking 1 tháng
curl '/v1/sessions?from=2026-05-01&to=2026-05-31' \
  -H "Authorization: Bearer $STUDENT"
# { items: [{title, start, end, color, ...}], nextCursor }

# Tutor: xem schedule tuần này
curl '/v1/sessions?from=2026-05-25&to=2026-05-31&status=confirmed' \
  -H "Authorization: Bearer $TUTOR"

# Admin: xem all
curl '/v1/sessions?from=2026-05-25&to=2026-05-31' \
  -H "Authorization: Bearer $ADMIN"

# Admin: filter theo tutor
curl '/v1/sessions?from=2026-05-25&to=2026-05-31&tutorId=u-anh-tu' \
  -H "Authorization: Bearer $ADMIN"

# Stats
curl '/v1/sessions/stats?from=2026-05-01&to=2026-05-31&status=completed' \
  -H "Authorization: Bearer $TUTOR"
# { total: 24, byStatus: { completed: 24 } }
```

---

## Slide 13 — Anti-patterns

```ts
// ❌ Không scope theo role
// → Student gọi /sessions thấy booking của Student khác

// ❌ Trả combo parent + child overlap
// → FE render 2 event chồng nhau ngày startAt

// ❌ Range không giới hạn
from=2020-01-01&to=2030-12-31  // → 50k row trả về

// ❌ Trả booking đã cancelled mà không filter
// → Calendar full event hủy cũ

// ❌ Trả `meetingRoomName` cho booking ngoài quyền
// → Bypass authz join

// ❌ N+1 query lấy student/tutor name
// → include: { student: true, tutor: true }
```

---

## Slide 14 — Edge cases

| Case | Behavior |
|------|----------|
| Range > 3 tháng | DTO refine reject |
| 0 booking trong range | Empty items, nextCursor=null |
| from = to | Empty (range 0) |
| Booking startAt boundary (==from) | Include |
| Combo parent với recurrenceRule | Skip — chỉ children render |
| Student xem booking của Student khác qua admin endpoint | 403 (admin only path) |

---

## Slide 15 — Bài tập thực hành

### 🎯 Calendar endpoint

**Bài 1:** Implement endpoint `/sessions` với role-aware scoping.

**Bài 2:** Test với 3 role: student → own only, tutor → assigned only, admin → all.

**Bài 3:** Verify combo parent KHÔNG xuất hiện trong list (chỉ children).

**Bài 4:** Implement stats endpoint.

**Bài 5:** Test pagination cursor: tạo 200 booking, query 100 + cursor.

**Bài 6:** Test edge: range 91 ngày OK, 93 ngày → reject.

**Bài 7:** Bonus: implement endpoint `GET /admin/tutors/:id/sessions/heatmap` — count theo dayOfWeek + hour.

---

## Slide 16 — Section 12 + V35 done

Còn V36 (join redirect — refine) và V37 (iCal feed).

---

## Slide 17 — Date range visualization

```ts
// stats endpoint refine: trả series cho FE biểu đồ
async statsDaily(q: { from, to }, user) {
  const where = this.buildWhere(q, user);
  return this.prisma.$queryRaw<{ day: Date; count: number }[]>`
    SELECT DATE_TRUNC('day', start_at) as day, COUNT(*) as count
    FROM session_bookings
    WHERE start_at >= ${q.from}
      AND start_at <= ${q.to}
      AND ${this.userClause(user)}
    GROUP BY day
    ORDER BY day
  `;
}
```

---

## Slide 18 — Performance: large student/tutor calendar

### Limit 100/page + index

```ts
// Test: tutor có 200 booking trong 3 tháng
// Query với limit=100 + cursor → 2 page
// Index (tutor_id, start_at) → query ~5ms cho mỗi page
```

> 💡 Section 20 sẽ benchmark với EXPLAIN ANALYZE.

---

## Slide 19 — Tổng kết Video 35

### Bạn vừa học

- ✅ Endpoint `/sessions?from..to` với role-aware scoping
- ✅ Filter status + subject + user
- ✅ Format response cho FullCalendar (title, start, end, color, extendedProps)
- ✅ Color code theo status
- ✅ Combo: chỉ render children
- ✅ Stats endpoint groupBy status
- ✅ Cursor pagination cho large range
- ✅ Admin endpoint filter theo tutor

> 💪 Calendar feed chuẩn = FE render mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 36

## Sessions Join Redirect (Refine)

Hoàn thiện endpoint `/sessions/:id/join` với detailed authz + audit + redirect logic.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 36 🚀

> *"A calendar is a time machine for tomorrow."*
