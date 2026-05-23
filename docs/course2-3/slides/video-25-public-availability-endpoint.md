---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 25: Public Availability Endpoint'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Public Availability
# Endpoint

### Khóa 2-3 — Video 25

**Expand · Conflict-aware · FE Calendar**

> Tutor mở cửa — Student nhìn được những giờ còn trống

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Endpoint **`GET /v1/tutors/:id/availability/slots`**
- ✅ Expand recurring slot → specific datetime
- ✅ Loại trừ slot đã có booking (`assigned`, `confirmed`)
- ✅ Filter range `from..to` (FE calendar week view)
- ✅ Timezone convert cho FE
- ✅ Endpoint **`GET /v1/availability/search`** đa Tutor

> 🎯 Cuối video: FE render calendar tutor với slot trống chính xác

---

## Slide 3 — Expand recurring → specific datetime

### Code refactor từ V24

```ts
async expandAvailability(tutorId: string, from: Date, to: Date): Promise<SlotInstance[]> {
  const recurringSlots = await this.prisma.tutorAvailability.findMany({
    where: {
      tutorId,
      isActive: true,
      validFrom: { lte: to },
      OR: [{ validTo: null }, { validTo: { gte: from } }],
    },
  });

  const instances: SlotInstance[] = [];
  for (let d = startOfDay(from); d <= endOfDay(to); d = addDays(d, 1)) {
    const dow = d.getDay();
    for (const slot of recurringSlots) {
      if (slot.dayOfWeek !== dow) continue;
      if (slot.validFrom > d || (slot.validTo && slot.validTo < d)) continue;

      const startAt = setTime(d, slot.startTime);
      const endAt = setTime(d, slot.endTime);
      instances.push({ slotId: slot.id, startAt, endAt, timezone: slot.timezone });
    }
  }
  return instances;
}
```

---

## Slide 4 — Loại trừ slot đã book

### Conflict-aware

```ts
async availableSlots(tutorId, from, to) {
  const all = await this.expandAvailability(tutorId, from, to);

  // Lấy booking confirmed/assigned/in_progress trong range
  const bookings = await this.prisma.sessionBooking.findMany({
    where: {
      tutorId,
      status: { in: ['assigned', 'confirmed', 'in_progress'] },
      startAt: { gte: from, lte: to },
    },
    select: { startAt: true, durationHr: true },
  });

  // Filter slot không overlap booking
  return all.filter(slot => !this.hasOverlap(slot, bookings));
}

private hasOverlap(slot: SlotInstance, bookings: any[]) {
  return bookings.some(b => {
    const bEnd = new Date(b.startAt.getTime() + b.durationHr * 3600_000);
    return !(slot.endAt <= b.startAt || slot.startAt >= bEnd);
  });
}
```

---

## Slide 5 — Public endpoint signature

```ts
@Public()
@Get('tutors/:id/availability/slots')
async slots(
  @Param('id') tutorId: string,
  @ZodQuery(SlotsQuery) q,
) {
  return this.availability.publicSlots(tutorId, q);
}

export const SlotsQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  tz: z.string().default('Asia/Ho_Chi_Minh'),     // FE timezone
  minDurationHr: z.coerce.number().min(0.5).default(1.5),
}).refine(d => d.to > d.from, { message: 'to phải > from', path: ['to'] })
  .refine(d => (d.to.getTime() - d.from.getTime()) <= 60 * 86400 * 1000,
    { message: 'Range tối đa 60 ngày' });
```

---

## Slide 6 — Service.publicSlots full

```ts
async publicSlots(tutorId, q) {
  await this.tutorsService.ensureApproved(tutorId);

  const all = await this.availableSlots(tutorId, q.from, q.to);

  // Filter min duration
  const minMs = q.minDurationHr * 3600_000;
  const filtered = all.filter(s => (s.endAt.getTime() - s.startAt.getTime()) >= minMs);

  // Convert sang timezone của FE
  return filtered.map(s => ({
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    // FE render dựa trên timezone q.tz — backend không format
  }));
}
```

---

## Slide 7 — Sub-slot: chia khung lớn thành buổi

### Tutor slot Mon 9-12 → Student book buổi 1.5h

```
Slot: Mon 09:00 - 12:00 (3 giờ)

Student có thể book:
  - 9:00 - 10:30 (1.5h)
  - 9:00 - 11:00 (2h)
  - 9:30 - 11:00 (1.5h)
  - 10:00 - 12:00 (2h)
```

**Endpoint trả slot khung 3h** — FE chia sub-slot khi user pick start time.

Hoặc backend chia:

```ts
function chunkSlot(start, end, step = 30, durationHr = 1.5) {
  const chunks = [];
  for (let cursor = start; cursor.getTime() + durationHr * 3600_000 <= end.getTime(); cursor = addMinutes(cursor, step)) {
    chunks.push({ startAt: cursor, endAt: addHours(cursor, durationHr) });
  }
  return chunks;
}
```

---

## Slide 8 — Search across Tutors

### "Tôi muốn book Mon 9h, tutor Toán Lớp 10 nào rảnh?"

```ts
@Public()
@Get('availability/search')
async search(@ZodQuery(SearchAvailabilityQuery) q) {
  return this.availability.searchTutors(q);
}

const SearchAvailabilityQuery = z.object({
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  startAt: z.coerce.date(),
  durationHr: z.number().min(1).max(4),
});

async searchTutors(q) {
  const endAt = new Date(q.startAt.getTime() + q.durationHr * 3600_000);

  // Tutor đủ chuyên môn
  const tutors = await this.prisma.tutorProfile.findMany({
    where: {
      approveStatus: 'approved',
      subjects: { some: { subjectId: q.subjectId } },
      levels: { some: { levelId: q.levelId } },
    },
    select: { userId: true },
  });

  // Filter tutor rảnh khung này + không bị double-book
  const result = [];
  for (const t of tutors) {
    if (await this.isFreeAt(t.userId, q.startAt, endAt)) {
      result.push(t.userId);
    }
  }
  return { tutorIds: result };
}
```

---

## Slide 9 — `isFreeAt` helper

```ts
async isFreeAt(tutorId: string, startAt: Date, endAt: Date): Promise<boolean> {
  // 1. Có slot recurring khớp?
  const dow = startAt.getDay();
  const startHHmm = format(startAt, 'HH:mm');
  const endHHmm = format(endAt, 'HH:mm');

  const slot = await this.prisma.tutorAvailability.findFirst({
    where: {
      tutorId,
      dayOfWeek: dow,
      isActive: true,
      startTime: { lte: startHHmm },
      endTime: { gte: endHHmm },
      validFrom: { lte: startAt },
      OR: [{ validTo: null }, { validTo: { gte: startAt } }],
    },
  });
  if (!slot) return false;

  // 2. Không bị double-book
  const conflict = await this.prisma.sessionBooking.findFirst({
    where: {
      tutorId,
      status: { in: ['assigned', 'confirmed', 'in_progress'] },
      startAt: { lt: endAt },
      // need raw query for compute endAt of booking
    },
  });
  return !conflict;
}
```

---

## Slide 10 — Eligible filter SQL (preview V30)

```sql
-- Section 10 sẽ implement đầy đủ
SELECT DISTINCT t.user_id
FROM tutor_profiles t
JOIN users u ON u.id = t.user_id
WHERE t.approve_status = 'approved'
  AND u.status = 'active'
  AND EXISTS (
    SELECT 1 FROM tutor_availability a
    WHERE a.tutor_id = t.user_id
      AND a.is_active = true
      AND a.day_of_week = EXTRACT(DOW FROM :startAt)
      AND a.start_time <= (:startAt)::time
      AND a.end_time   >= ((:startAt) + :durationHr * INTERVAL '1 hour')::time
      AND a.valid_from <= :startAt
      AND (a.valid_to IS NULL OR a.valid_to >= :startAt)
  )
  AND NOT EXISTS (
    SELECT 1 FROM session_bookings b
    WHERE b.tutor_id = t.user_id
      AND b.status IN ('assigned','confirmed','in_progress')
      AND tsrange(b.start_at, b.start_at + b.duration_hr * INTERVAL '1 hour')
          && tsrange(:startAt, :startAt + :durationHr * INTERVAL '1 hour')
  )
```

---

## Slide 11 — Cache slots cho FE

### FE calendar week view → call lại 7 ngày

```ts
// HTTP cache header
@Get('tutors/:id/availability/slots')
@Header('Cache-Control', 'public, max-age=60')
async slots(...) {}
```

> 💡 Cache 60s — đủ để giảm load, đủ tươi để Student book mượt. Section 6 thêm Redis nâng cao.

---

## Slide 12 — Test scenario

```bash
# Tutor đã khai báo Mon 9-12, Wed 14-17 (V24)

# Public xem slot range tuần
curl '/v1/tutors/$TID/availability/slots?from=2026-05-25&to=2026-05-31&minDurationHr=1.5'
# [
#   { startAt: "2026-05-25T09:00:00+07:00", endAt: "2026-05-25T12:00:00+07:00" },  ← Mon
#   { startAt: "2026-05-27T14:00:00+07:00", endAt: "2026-05-27T17:00:00+07:00" }   ← Wed
# ]

# Setup booking ở Mon 9-11 (giả lập)
# Now Mon 9-12 chia thành: 9-11 (booked), 11-12 (1h - không đủ minDuration)
# → response chỉ còn Wed 14-17
curl '/v1/tutors/$TID/availability/slots?from=2026-05-25&to=2026-05-31&minDurationHr=1.5'
# [{ startAt: "Wed 14:00", ... }]

# Search Tutor rảnh
curl '/v1/availability/search?subjectId=...&levelId=...&startAt=2026-05-25T09:00:00Z&durationHr=2'
# { tutorIds: ["t-1", "t-3"] }
```

---

## Slide 13 — Anti-patterns

```ts
// ❌ Expand cho range quá lớn
from=2024-01-01&to=2030-12-31   // → 2000 ngày × N slot = ngàn instance
// → enforce max 60 ngày

// ❌ Quên loại slot đã book
// → Student book trùng → conflict

// ❌ Quên check tutor approved
// → Show slot của Tutor pending

// ❌ Trả slot pure recurring không expand
// → FE phải tự expand → duplicate logic

// ❌ Cache aggressive
max-age=3600   // 1 giờ — Student book gì cũng thấy slot rảnh outdated
// → 60s phù hợp
```

---

## Slide 14 — Edge cases

| Case | Behavior |
|------|----------|
| from === to | Empty (range 0) |
| from > to | DTO refine reject |
| Range > 60 ngày | DTO refine reject |
| Tutor không slot nào | `[]` |
| Tutor có slot nhưng full booked | `[]` |
| Slot bridge ngày (22-02) | Không support — skip |
| Booking cancelled | Slot vẫn available (status != confirmed) |

---

## Slide 15 — Section 8 hoàn tất

### Tutor availability layer ready

✅ V24 — Tutor CRUD recurring slot + overlap + timezone
✅ V25 — Public expand + conflict-aware + search

**Section 9 — Session Booking** (4 video):

- V26: Single booking
- V27: Combo booking RRULE
- V28: Booking state machine
- V29: Cancel + no-show

> 🚀 Sang Section 9 — Student bắt đầu book session.

---

## Slide 16 — Bài tập thực hành

### 🎯 Public availability

**Bài 1:** Implement `expandAvailability` helper.

**Bài 2:** Implement endpoint `GET /v1/tutors/:id/availability/slots` với conflict-aware.

**Bài 3:** Test với 0 booking + 1 booking ở giữa slot → verify slot bị chia / loại bỏ.

**Bài 4:** Implement search across tutors `/v1/availability/search`.

**Bài 5:** Bonus: Implement chunk slot helper (slide 7) — chia slot 3h thành các sub-slot 1.5h từ mọi 30 phút.

**Bài 6:** Bonus: Add HTTP cache 60s + verify với `Cache-Control` header.

---

## Slide 17 — Tổng kết Video 25

### Bạn vừa học

- ✅ Expand recurring slot → specific datetime
- ✅ Loại trừ slot đã có booking
- ✅ `from..to` range validate (max 60 ngày)
- ✅ Min duration filter
- ✅ Sub-slot chunk cho FE picker
- ✅ Search Tutor rảnh trong khung cụ thể
- ✅ `isFreeAt` helper sẽ dùng ở Section 10
- ✅ HTTP cache 60s

> 💪 Public availability chính xác = niềm tin Student vào lịch hiển thị

---

<!-- _class: lead -->

# Tiếp theo: Video 26

## Single Session Booking

Student tạo single booking: subject, level, startAt, durationHr → order pending → pay → pending_assign.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 26 🚀

> *"Open hours, not just open doors."*
