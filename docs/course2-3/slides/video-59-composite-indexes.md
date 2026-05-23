---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 59: Composite Indexes'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Composite Indexes
# (tutor_id, start_at)

### Khóa 2-3 — Video 59

**Multi-column index · Column order · Cover query**

> 1 composite > 2 single trong nhiều case

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **prefix rule** của composite index
- ✅ Pick column order đúng
- ✅ Cover query với INCLUDE (PG 11+)
- ✅ Composite index cho 5 query critical Tutor365
- ✅ Đo before/after với EXPLAIN ANALYZE

> 🎯 Cuối video: 5 query critical < 10ms với index đúng

---

## Slide 3 — Prefix rule

```sql
CREATE INDEX idx_a_b_c ON t (a, b, c);

-- Helpful for:
WHERE a = X                       -- ✅ leftmost
WHERE a = X AND b = Y             -- ✅
WHERE a = X AND b = Y AND c = Z   -- ✅
WHERE a = X AND c = Z             -- ⚠️ partial (skip b)
WHERE b = Y                       -- ❌ no leftmost
WHERE c = Z                       -- ❌ no leftmost
```

**Rule:** Leftmost prefix matters. Pick column order theo query pattern.

---

## Slide 4 — Booking by tutor query

```sql
-- Critical query (V35 calendar feed)
SELECT * FROM session_bookings
WHERE tutor_id = $1
  AND start_at BETWEEN $2 AND $3
ORDER BY start_at ASC;

-- Best index
CREATE INDEX idx_booking_tutor_startAt
  ON session_bookings (tutor_id, start_at);
```

**Why this order?**

- `tutor_id` = equality filter → leftmost
- `start_at` = range filter + ORDER BY → second
- Index seek `tutor_id = X` → range scan `start_at`

---

## Slide 5 — INCLUDE columns (PG 11+)

### Cover query without heap fetch

```sql
CREATE INDEX idx_booking_tutor_startAt_inc
  ON session_bookings (tutor_id, start_at)
  INCLUDE (status, duration_hr, meeting_room_name);

-- Query
SELECT tutor_id, start_at, status, duration_hr, meeting_room_name
FROM session_bookings
WHERE tutor_id = $1 AND start_at > $2;

-- → Index-only scan (no heap fetch)
-- → Super fast
```

**Trade-off:**

- ✅ Faster reads
- ⚠️ Index larger
- ⚠️ Cập nhật INCLUDE columns → write cost

> 💡 Tutor365 dùng cho hot read queries.

---

## Slide 6 — Booking by student

```sql
SELECT * FROM session_bookings
WHERE student_id = $1
  AND start_at > NOW()
ORDER BY start_at ASC;

CREATE INDEX idx_booking_student_startAt
  ON session_bookings (student_id, start_at);
```

> 💡 Tutor365 dùng 2 indexes riêng (student vs tutor) — different query patterns.

---

## Slide 7 — Course filter

```sql
-- V19 storefront query
SELECT * FROM courses
WHERE status = 'published'
  AND subject_id = $1
ORDER BY published_at DESC;

-- Best index
CREATE INDEX idx_courses_subject_status_pubat
  ON courses (subject_id, status, published_at DESC)
  WHERE status = 'published';   -- partial
```

> 💡 Partial + composite + DESC for ORDER BY = perfect for this query.

---

## Slide 8 — Eligible-tutor SQL (V30)

```sql
-- Used in eligible filter
WHERE EXISTS (
  SELECT 1 FROM tutor_subjects ts
  WHERE ts.tutor_id = t.user_id AND ts.subject_id = $1
)

-- Index needed
CREATE INDEX idx_tutor_subjects_subject_tutor
  ON tutor_subjects (subject_id, tutor_id);

-- Same approach for tutor_levels
CREATE INDEX idx_tutor_levels_level_tutor
  ON tutor_levels (level_id, tutor_id);
```

**Why subject_id first?**

- Query filters by `subject_id = $1` constant
- `tutor_id` is the join key matched against
- Composite covers EXISTS subquery in 1 index seek

---

## Slide 9 — Reverse composite issue

```sql
-- Existing: PRIMARY KEY (tutor_id, subject_id)
-- Index on PK = (tutor_id, subject_id)

-- Query
WHERE ts.subject_id = $1   -- ← cần subject_id leftmost

-- → PK index không match → seq scan
-- → Phải tạo thêm idx (subject_id, tutor_id)
```

**Rule of thumb:** Composite PK covers (a, b) lookup, NOT (b, a) lookup.

---

## Slide 10 — Audit log query

```sql
-- "Show all actions for booking X"
SELECT * FROM audit_logs
WHERE entity_type = 'booking' AND entity_id = $1
ORDER BY created_at ASC;

CREATE INDEX idx_audit_entity
  ON audit_logs (entity_type, entity_id, created_at);
```

```sql
-- "Show all actions by Hanah last 7 days"
SELECT * FROM audit_logs
WHERE actor_user_id = $1
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

CREATE INDEX idx_audit_actor_created
  ON audit_logs (actor_user_id, created_at DESC);
```

---

## Slide 11 — Multi-tenant filter

```sql
-- Order list per student
SELECT * FROM orders
WHERE student_id = $1
  AND created_at > NOW() - INTERVAL '90 days'
ORDER BY created_at DESC;

CREATE INDEX idx_orders_student_created
  ON orders (student_id, created_at DESC);

-- Or with status
SELECT * FROM orders
WHERE student_id = $1 AND status = 'paid';

CREATE INDEX idx_orders_student_status
  ON orders (student_id, status);
```

> 💡 2 indexes phục vụ 2 query patterns khác nhau.

---

## Slide 12 — Index cardinality

### Pick column with high cardinality first?

```
Conventional wisdom: leftmost = high cardinality (more unique values)
Reality: depends on query pattern

If query: WHERE high_card = X
  → Index (high_card, low_card) good — seek narrow first

If query: WHERE low_card = X (always)
  → Index (low_card, high_card) — partial index probably better
```

**Tutor365 use case:**

```
Booking by tutor:
  tutor_id ~ 5-50 active tutors (medium card)
  start_at ~ unique per row (super high)

Index (tutor_id, start_at) — high card LATER but tutor_id always filtered
```

---

## Slide 13 — Compare 5 index strategy

```sql
-- Test query
SELECT * FROM session_bookings
WHERE tutor_id = 'tutor-123' AND start_at > NOW()
ORDER BY start_at;

-- Strategy 1: no index
EXPLAIN ANALYZE → 250ms (Seq Scan, 100k rows)

-- Strategy 2: single index on tutor_id
CREATE INDEX ON session_bookings (tutor_id);
EXPLAIN ANALYZE → 50ms (Index Scan + filter)

-- Strategy 3: single index on start_at
CREATE INDEX ON session_bookings (start_at);
EXPLAIN ANALYZE → 150ms (range scan + filter tutor_id)

-- Strategy 4: composite (tutor_id, start_at)
CREATE INDEX ON session_bookings (tutor_id, start_at);
EXPLAIN ANALYZE → 5ms (Index Scan exact match)

-- Strategy 5: composite + INCLUDE
CREATE INDEX ON session_bookings (tutor_id, start_at)
  INCLUDE (status, duration_hr);
EXPLAIN ANALYZE → 2ms (Index-Only Scan)
```

---

## Slide 14 — Don't over-index

```sql
-- ❌ Bad: too many indexes
CREATE INDEX ix1 ON bookings (tutor_id);
CREATE INDEX ix2 ON bookings (student_id);
CREATE INDEX ix3 ON bookings (subject_id);
CREATE INDEX ix4 ON bookings (level_id);
CREATE INDEX ix5 ON bookings (status);
CREATE INDEX ix6 ON bookings (start_at);
CREATE INDEX ix7 ON bookings (tutor_id, start_at);
CREATE INDEX ix8 ON bookings (student_id, start_at);
-- → 8 indexes, write 8x slower

-- ✅ Good: 3-4 strategic
CREATE INDEX idx_tutor_startAt ON bookings (tutor_id, start_at);
CREATE INDEX idx_student_startAt ON bookings (student_id, start_at);
CREATE INDEX idx_status_startAt ON bookings (status, start_at)
  WHERE status IN ('pending_assign', 'assigned', 'confirmed');
```

---

## Slide 15 — Tutor365 essential composite indexes

```sql
-- Bookings
CREATE INDEX idx_booking_tutor_startAt ON session_bookings (tutor_id, start_at);
CREATE INDEX idx_booking_student_startAt ON session_bookings (student_id, start_at);
CREATE INDEX idx_booking_status_startAt ON session_bookings (status, start_at)
  WHERE status IN ('pending_assign', 'assigned', 'confirmed', 'in_progress');

-- Courses
CREATE INDEX idx_courses_subject_status_pubat
  ON courses (subject_id, status, published_at DESC)
  WHERE status = 'published';

CREATE INDEX idx_courses_tutor_status ON courses (tutor_id, status);

-- Enrollments
CREATE INDEX idx_enrollments_student_enrolledAt
  ON course_enrollments (student_id, enrolled_at DESC);

CREATE INDEX idx_enrollments_course
  ON course_enrollments (course_id);

-- Audit
CREATE INDEX idx_audit_entity_created
  ON audit_logs (entity_type, entity_id, created_at DESC);

-- Availability (V30)
CREATE INDEX idx_avail_tutor_dow
  ON tutor_availability (tutor_id, day_of_week, start_time)
  WHERE is_active = true;
```

---

## Slide 16 — Anti-patterns

```sql
-- ❌ Index with leftmost column rarely filtered
CREATE INDEX ON bookings (status, tutor_id);
-- Most queries filter tutor_id constantly, status rarely → reverse

-- ❌ Composite trên field high update
CREATE INDEX ON bookings (status, ...);
-- → Every transition rewrites index entry
-- → OK if read-heavy

-- ❌ Index column nullable nhiều
CREATE INDEX ON bookings (tutor_id);
-- tutor_id NULL khi pending_assign → sparse index
-- → Acceptable nếu query filter NOT NULL

-- ❌ Quá nhiều INCLUDE columns
INCLUDE (col1, col2, col3, col4, col5, col6)
-- → Index size lớn, write slow
```

---

## Slide 17 — Verify với EXPLAIN

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM session_bookings
WHERE tutor_id = $1 AND start_at > NOW();

-- Good output:
Index Scan using idx_booking_tutor_startAt on session_bookings
  Index Cond: (tutor_id = $1 AND start_at > now())
  Buffers: shared hit=5 read=0
  Execution Time: 0.5 ms

-- Bad output (missing index):
Seq Scan on session_bookings
  Filter: (tutor_id = $1 AND start_at > now())
  Rows Removed: 99000
  Buffers: shared hit=20000 read=5000
  Execution Time: 250 ms
```

---

## Slide 18 — Bài tập thực hành

### 🎯 Composite index

**Bài 1:** Create 7 indexes (slide 15).

**Bài 2:** EXPLAIN ANALYZE 5 query trước & sau index.

**Bài 3:** Test INCLUDE column → index-only scan.

**Bài 4:** Drop unused single-column index (replaced by composite).

**Bài 5:** Test prefix rule: query với leftmost prefix only → still use index.

**Bài 6:** Bonus: bench writes with/without indexes — đo overhead.

---

## Slide 19 — Stats DB

```sql
-- Total index size
SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_idx_size
FROM pg_stat_user_indexes;

-- Per index size
SELECT
  schemaname, tablename, indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  idx_scan
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
```

> 💡 Indexes > 10% of table size = consider review.

---

## Slide 20 — Tổng kết Video 59

### Bạn vừa học

- ✅ Prefix rule composite index
- ✅ Column order theo query pattern
- ✅ INCLUDE columns (cover query, PG 11+)
- ✅ Index cardinality reasoning
- ✅ 7 essential composite indexes Tutor365
- ✅ Don't over-index (write cost)
- ✅ Reverse composite need separate index
- ✅ Stats: total index size, per-index size

> 💪 Composite index = 10-50x speedup cho hot queries

---

<!-- _class: lead -->

# Tiếp theo: Video 60

## EXPLAIN ANALYZE — Đọc Plan

Đọc execution plan, phát hiện seq scan, fix.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 60 🚀

> *"The right index is worth a thousand caches."*
