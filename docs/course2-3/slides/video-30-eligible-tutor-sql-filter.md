---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 30: Eligible-Tutor SQL Filter'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Eligible-Tutor
# SQL Filter

### Khóa 2-3 — Video 30

**4 conditions · Subquery · Index strategy**

> SQL phức tạp = bộ não của Hanah dashboard

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Định nghĩa **4 conditions** eligible
- ✅ Viết SQL filter đầy đủ
- ✅ Endpoint **`GET /v1/admin/bookings/:id/eligible-tutors`**
- ✅ Tránh **double-book** với tsrange overlap
- ✅ Index hỗ trợ query (preview Section 20)
- ✅ Test với dữ liệu seed

> 🎯 Cuối video: Hanah xem 1 booking → thấy danh sách 5-10 Tutor đủ điều kiện

---

## Slide 3 — 4 conditions

Một Tutor X đủ điều kiện cho booking B nếu:

1. **Approved** — `tutor_profile.approve_status = 'approved'` và `user.status = 'active'`
2. **Rảnh khung giờ** — có `tutor_availability` slot bao trùm `[B.startAt, B.startAt + B.durationHr]`
3. **Không double-book** — không có booking khác status `assigned/confirmed/in_progress` overlap thời gian
4. **Đúng chuyên môn** — declared `subject` của booking VÀ declared `level` của booking

---

## Slide 4 — SQL đầy đủ (PostgreSQL)

```sql
SELECT DISTINCT t.user_id, u.full_name, t.bio
FROM tutor_profiles t
JOIN users u ON u.id = t.user_id
WHERE t.approve_status = 'approved'
  AND u.status = 'active'
  -- 1) Rảnh khung giờ
  AND EXISTS (
    SELECT 1 FROM tutor_availability a
    WHERE a.tutor_id = t.user_id
      AND a.is_active = true
      AND a.day_of_week = EXTRACT(DOW FROM $1::timestamptz)
      AND a.start_time <= ($1::timestamptz)::time
      AND a.end_time   >= (($1::timestamptz) + $2 * INTERVAL '1 hour')::time
      AND a.valid_from <= $1
      AND (a.valid_to IS NULL OR a.valid_to >= $1)
  )
  -- 2) Không double-book
  AND NOT EXISTS (
    SELECT 1 FROM session_bookings b
    WHERE b.tutor_id = t.user_id
      AND b.status IN ('assigned', 'confirmed', 'in_progress')
      AND tsrange(b.start_at, b.start_at + b.duration_hr * INTERVAL '1 hour', '[]')
          && tsrange($1::timestamptz, ($1::timestamptz) + $2 * INTERVAL '1 hour', '[]')
  )
  -- 3) Có chuyên môn (course OR declared subject)
  AND (
    EXISTS (SELECT 1 FROM courses c
            WHERE c.tutor_id = t.user_id
              AND c.subject_id = $3
              AND c.status = 'published')
    OR
    EXISTS (SELECT 1 FROM tutor_subjects ts
            WHERE ts.tutor_id = t.user_id
              AND ts.subject_id = $3)
  )
  -- 4) Đúng level
  AND EXISTS (
    SELECT 1 FROM tutor_levels tl
    WHERE tl.tutor_id = t.user_id
      AND tl.level_id = $4
  );
```

---

## Slide 5 — Tsrange overlap operator

### `&&` = "any overlap"

```sql
tsrange('2026-05-25 09:00', '2026-05-25 11:00', '[]')
  && tsrange('2026-05-25 10:30', '2026-05-25 12:30', '[]')
-- TRUE (overlap 10:30-11:00)

tsrange('2026-05-25 09:00', '2026-05-25 11:00', '[]')
  && tsrange('2026-05-25 11:00', '2026-05-25 13:00', '[]')
-- TRUE (cùng touch tại 11:00 vì '[]' inclusive)

tsrange('2026-05-25 09:00', '2026-05-25 11:00', '[)')   -- exclusive end
  && tsrange('2026-05-25 11:00', '2026-05-25 13:00', '[)')
-- FALSE
```

> 💡 Tutor365 chọn `[]` inclusive — tránh sát giờ liền nhau.

---

## Slide 6 — Implement trong Prisma

```ts
async eligibleTutors(opts: {
  startAt: Date;
  durationHr: number;
  subjectId: string;
  levelId: string;
}) {
  const result = await this.prisma.$queryRaw<EligibleTutor[]>`
    SELECT DISTINCT t.user_id, u.full_name, t.bio
    FROM tutor_profiles t
    JOIN users u ON u.id = t.user_id
    WHERE t.approve_status = 'approved'
      AND u.status = 'active'
      AND EXISTS (
        SELECT 1 FROM tutor_availability a
        WHERE a.tutor_id = t.user_id
          AND a.is_active = true
          AND a.day_of_week = EXTRACT(DOW FROM ${opts.startAt}::timestamptz)
          AND a.start_time <= (${opts.startAt}::timestamptz)::time
          AND a.end_time   >= ((${opts.startAt}::timestamptz) + ${opts.durationHr}::numeric * INTERVAL '1 hour')::time
          AND a.valid_from <= ${opts.startAt}
          AND (a.valid_to IS NULL OR a.valid_to >= ${opts.startAt})
      )
      AND NOT EXISTS (
        SELECT 1 FROM session_bookings b
        WHERE b.tutor_id = t.user_id
          AND b.status IN ('assigned', 'confirmed', 'in_progress')
          AND tsrange(b.start_at, b.start_at + b.duration_hr * INTERVAL '1 hour', '[]')
              && tsrange(${opts.startAt}, ${opts.startAt} + ${opts.durationHr}::numeric * INTERVAL '1 hour', '[]')
      )
      AND (
        EXISTS (SELECT 1 FROM courses c WHERE c.tutor_id = t.user_id AND c.subject_id = ${opts.subjectId} AND c.status = 'published')
        OR EXISTS (SELECT 1 FROM tutor_subjects ts WHERE ts.tutor_id = t.user_id AND ts.subject_id = ${opts.subjectId})
      )
      AND EXISTS (
        SELECT 1 FROM tutor_levels tl WHERE tl.tutor_id = t.user_id AND tl.level_id = ${opts.levelId}
      )
    ORDER BY u.full_name ASC
  `;
  return result;
}
```

---

## Slide 6b — DOW caveat — Postgres vs date-fns

| Tool | Sunday | Monday |
|------|--------|--------|
| Postgres `EXTRACT(DOW)` | 0 | 1 |
| JavaScript `Date.getDay()` | 0 | 1 |
| Date-fns | 0 | 1 |

→ Đồng nhất! Tutor365 dùng convention `0=Sunday`.

> ⚠️ Postgres `EXTRACT(ISODOW)` thì Monday=1, Sunday=7 — KHÔNG dùng.

---

## Slide 7 — Endpoint signature

```ts
@AdminOnly()
@Get('admin/bookings/:id/eligible-tutors')
async listEligible(@Param('id') id: string) {
  const booking = await this.prisma.sessionBooking.findUnique({
    where: { id },
    include: { package: true },
  });
  if (!booking) throw new NotFoundException();
  if (booking.status !== 'pending_assign') {
    throw new BadRequestException(`Booking đã ở status=${booking.status}`);
  }

  return this.assignments.eligibleTutors({
    startAt: booking.startAt,
    durationHr: booking.durationHr,
    subjectId: booking.subjectId,
    levelId: booking.levelId,
  });
}
```

---

## Slide 8 — Trả thêm signal cho Hanah

### Sort theo "best match"

```ts
async eligibleTutorsRanked(opts) {
  const tutors = await this.eligibleTutors(opts);

  // Augment với signal
  const enriched = await Promise.all(tutors.map(async (t) => {
    const [reviewStats, completedSessions, totalCourses] = await Promise.all([
      this.calcAvgRating(t.userId),
      this.prisma.sessionBooking.count({
        where: { tutorId: t.userId, status: 'completed' },
      }),
      this.prisma.course.count({
        where: { tutorId: t.userId, subjectId: opts.subjectId, status: 'published' },
      }),
    ]);
    return {
      ...t,
      avgRating: reviewStats.avg,
      reviewCount: reviewStats.count,
      completedSessions,
      coursesInSubject: totalCourses,
    };
  }));

  // Sort: rating cao → review nhiều → completed nhiều
  enriched.sort((a, b) => {
    if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
    if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
    return b.completedSessions - a.completedSessions;
  });

  return enriched;
}
```

---

## Slide 9 — calcAvgRating

```ts
async calcAvgRating(tutorId: string) {
  const reviews = await this.prisma.courseReview.findMany({
    where: {
      course: { tutorId },
      isHidden: false,
    },
    select: { rating: true },
  });
  if (reviews.length === 0) return { avg: 0, count: 0 };
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return {
    avg: Math.round((sum / reviews.length) * 10) / 10,
    count: reviews.length,
  };
}
```

> 💡 Section 20 cache avgRating ở `tutor_profiles` column với trigger / materialized view.

---

## Slide 10 — Response shape

```json
[
  {
    "userId": "u-anh-tu",
    "fullName": "Anh Tu",
    "bio": "5 năm dạy toán THPT...",
    "avgRating": 4.8,
    "reviewCount": 23,
    "completedSessions": 47,
    "coursesInSubject": 2
  },
  {
    "userId": "u-bao",
    "fullName": "Bao Pham",
    "bio": "Cử nhân Sư phạm...",
    "avgRating": 4.5,
    "reviewCount": 12,
    "completedSessions": 18,
    "coursesInSubject": 0
  }
]
```

---

## Slide 11 — Index strategy (preview Section 20)

```sql
-- tutor_availability lookup
CREATE INDEX idx_avail_tutor_dow_time
  ON tutor_availability (tutor_id, day_of_week, start_time)
  WHERE is_active = true;

-- Booking double-book check
CREATE INDEX idx_booking_tutor_start
  ON session_bookings (tutor_id, start_at)
  WHERE status IN ('assigned', 'confirmed', 'in_progress');

-- Or GiST cho tsrange
CREATE INDEX idx_booking_tsrange_gist
  ON session_bookings USING gist (
    tsrange(start_at, start_at + duration_hr * INTERVAL '1 hour', '[]')
  )
  WHERE status IN ('assigned', 'confirmed', 'in_progress');

-- Tutor subjects
CREATE INDEX idx_tutor_subjects ON tutor_subjects (subject_id, tutor_id);

-- Tutor levels
CREATE INDEX idx_tutor_levels ON tutor_levels (level_id, tutor_id);

-- Courses subject filter
CREATE INDEX idx_courses_subject_status
  ON courses (subject_id, tutor_id)
  WHERE status = 'published';
```

---

## Slide 12 — Test với seed

```bash
# Seed: 5 tutor approved
# - Anh Tu: subject Math, level [Lop-10, Lop-11], rảnh Mon 9-12
# - Bao:    subject Math, level [Lop-9, Lop-10], rảnh Mon 14-17
# - Cuong:  subject English, level [Lop-10]  ← không match Math
# - Duong:  pending_admin_approve              ← không qualify
# - Em:     subject Math, level [Lop-10], rảnh Mon 9-12, đã có booking Mon 10-11 confirmed

# Booking pending_assign:
# - subject Math, level Lop-10
# - startAt Mon 09:30, duration 1.5h

curl '/v1/admin/bookings/$BID/eligible-tutors' -H "Authorization: Bearer $ADMIN"

# Expected:
# - Anh Tu (rảnh, đúng môn, level)
# - Bao (đúng môn, level, NHƯNG rảnh 14-17 không match 9:30) → fail availability
# - Cuong → fail subject
# - Duong → fail approve
# - Em → fail double-book (overlap 10-11)

# Result: chỉ Anh Tu
```

---

## Slide 13 — Performance: thực thi `EXPLAIN ANALYZE`

```sql
EXPLAIN ANALYZE
SELECT DISTINCT t.user_id, ...
FROM tutor_profiles t
JOIN users u ON u.id = t.user_id
WHERE ...
```

**Tốt:**

```
Index Scan using idx_tutor_profiles_status ...
  → Filter availability EXISTS
  → Filter NOT EXISTS booking (uses idx_booking_tsrange_gist)
  → Filter subject EXISTS
  → Filter level EXISTS
Execution Time: 8.3 ms
```

**Xấu (thiếu index):**

```
Seq Scan on tutor_profiles ...
  → Seq Scan on session_bookings ...
Execution Time: 1200 ms
```

> 💡 Section 20 sẽ deep dive — V30 chỉ cần biết query đúng.

---

## Slide 14 — Edge cases

| Case | Behavior |
|------|----------|
| 0 eligible tutor | Empty array, FE hiển thị "Không có tutor phù hợp" |
| Tutor có course Math published nhưng không declared subject Math | Vẫn qualify (OR condition) |
| Tutor declared subject nhưng chưa có course | Qualify |
| Booking startAt = Saturday, tutor rảnh Mon-Fri | Empty result (day_of_week không match) |
| Tutor availability validTo qua | Lọc bỏ |
| Cross-zone tutor — Asia/Tokyo declare 9-12 JP | Convert ở app code trước query (V25) |

---

## Slide 15 — Combo: filter cho parent

### Combo cần Tutor rảnh TẤT CẢ buổi

```ts
async eligibleTutorsForCombo(parentId: string) {
  const children = await this.prisma.sessionBooking.findMany({
    where: { parentBookingId: parentId },
    orderBy: { startAt: 'asc' },
  });

  // Tutor candidates từ buổi đầu tiên
  let candidates = await this.eligibleTutors({
    startAt: children[0].startAt,
    durationHr: children[0].durationHr,
    subjectId: children[0].subjectId,
    levelId: children[0].levelId,
  });

  // Intersect với từng buổi sau
  for (let i = 1; i < children.length; i++) {
    const e = await this.eligibleTutors({
      startAt: children[i].startAt,
      durationHr: children[i].durationHr,
      subjectId: children[i].subjectId,
      levelId: children[i].levelId,
    });
    const ids = new Set(e.map(t => t.userId));
    candidates = candidates.filter(c => ids.has(c.userId));
  }

  return candidates;
}
```

> 💡 Combo strict — 1 Tutor cho cả 12-24 buổi. Tutor không rảnh 1 buổi → loại.

---

## Slide 16 — Anti-patterns

```ts
-- ❌ Quên approve_status check
WHERE u.status = 'active'   -- thiếu approveStatus
-- → Tutor pending có thể bị assign

-- ❌ Quên tsrange overlap
WHERE b.start_at = $1   -- chỉ check cùng startAt
-- → Tutor đang dạy 9-11 mà booking mới 10-12 → assign double

-- ❌ Quên day_of_week
WHERE a.start_time <= $1::time
-- → Thứ 2 9h match cả thứ 7 9h

-- ❌ Cộng `start_at + duration_hr * INTERVAL '1 hour'` bằng tay
-- → duration 1.5 phải dùng numeric

-- ❌ SELECT * (lấy passwordHash)
SELECT u.* FROM users u   -- ← chọn field cụ thể

-- ❌ Không LIMIT
-- → 1000 tutor return all → FE choke
```

---

## Slide 17 — Bài tập thực hành

### 🎯 Eligible filter

**Bài 1:** Migrate Section 4 + seed 5 tutor (slide 12 scenario).

**Bài 2:** Implement `eligibleTutors` raw SQL query.

**Bài 3:** Implement `eligibleTutorsRanked` với 3 signal sort.

**Bài 4:** Test scenario slide 12 — verify chỉ Anh Tu match.

**Bài 5:** Implement endpoint admin/eligible-tutors.

**Bài 6:** Run `EXPLAIN ANALYZE` query — đo trước và sau khi add index.

**Bài 7:** Bonus: Implement combo eligible filter (slide 15).

---

## Slide 18 — Migration cho tsrange (preview)

```sql
-- Section 17 migration
ALTER TABLE session_bookings
  ADD COLUMN IF NOT EXISTS booking_range tsrange
  GENERATED ALWAYS AS (
    tsrange(start_at, start_at + duration_hr * INTERVAL '1 hour', '[]')
  ) STORED;

CREATE INDEX idx_booking_tsrange
  ON session_bookings USING gist (booking_range)
  WHERE status IN ('assigned', 'confirmed', 'in_progress');
```

**Query trở nên đơn giản:**

```sql
NOT EXISTS (
  SELECT 1 FROM session_bookings b
  WHERE b.tutor_id = t.user_id
    AND b.status IN ('assigned', 'confirmed', 'in_progress')
    AND b.booking_range && tsrange($1, $1 + $2 * INTERVAL '1 hour', '[]')
)
```

---

## Slide 19 — Tổng kết Video 30

### Bạn vừa học

- ✅ 4 conditions eligible
- ✅ SQL raw query với 4 EXISTS / NOT EXISTS
- ✅ Tsrange `&&` overlap operator
- ✅ Subject match: declared subject OR course published
- ✅ Index strategy (preview Section 20)
- ✅ Sort theo signal: rating, reviewCount, completedSessions
- ✅ Combo: intersect candidates qua mọi buổi
- ✅ EXPLAIN ANALYZE để verify performance

> 💪 SQL filter chính xác = trí tuệ của assign dashboard

---

<!-- _class: lead -->

# Tiếp theo: Video 31

## Hanah Assign Endpoint

Hanah chọn 1 Tutor cho booking. Idempotent. Notify Tutor.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 31 🚀

> *"SQL is the universal answer to 'who fits this?'"*
