---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 61: Partial + Expression Index'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Partial + Expression
# Index

### Khóa 2-3 — Video 61

**WHERE-filtered · Functional · Smaller + faster**

> Index 80% small set thay vì full table

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Apply **partial index** với WHERE clause
- ✅ Apply **expression index** trên function
- ✅ Apply **trigram index** với pg_trgm
- ✅ Apply **GIN JSONB index** cho audit logs
- ✅ Combine techniques cho 10x speedup
- ✅ When NOT to use

> 🎯 Cuối video: 5 advanced indexes tăng tốc queries Tutor365

---

## Slide 3 — Partial index

### Index subset

```sql
-- Full table: 1M courses, 100k published
CREATE INDEX idx_courses_subject_status
  ON courses (subject_id, status);
-- Index 1M rows

-- Partial: only published
CREATE INDEX idx_courses_subject_published
  ON courses (subject_id)
  WHERE status = 'published';
-- Index 100k rows → 10x smaller, 10x faster build, 5x faster scan
```

**Use case Tutor365:**

```sql
-- Most queries: WHERE status='published'
-- → 90% queries use partial index

-- Other queries: WHERE status='draft' (rare admin)
-- → Seq scan acceptable
```

---

## Slide 4 — Partial index for active subset

```sql
-- Bookings: usually filter by active statuses
CREATE INDEX idx_booking_active_status
  ON session_bookings (start_at)
  WHERE status IN ('pending_assign', 'assigned', 'confirmed', 'in_progress');

-- Refresh tokens: usually filter by active
CREATE INDEX idx_refresh_active
  ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL AND rotated_at IS NULL;

-- Orders: usually filter pending
CREATE INDEX idx_orders_pending
  ON orders (created_at)
  WHERE status = 'pending';
```

> 💡 Partial khi WHERE selectivity cao (<20% rows).

---

## Slide 5 — Expression index (functional)

### Index on function result

```sql
-- Case-insensitive email lookup
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- Query
SELECT * FROM users WHERE LOWER(email) = LOWER('TU@x.com');
-- ✅ Use functional index

-- Year extracted
CREATE INDEX idx_orders_year ON orders (EXTRACT(YEAR FROM created_at));
SELECT * FROM orders WHERE EXTRACT(YEAR FROM created_at) = 2026;
```

---

## Slide 6 — Trigram index (pg_trgm)

### Fuzzy search

```sql
-- Setup
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index
CREATE INDEX idx_courses_title_trgm
  ON courses USING gin (title gin_trgm_ops);

-- Query (similarity)
SELECT * FROM courses WHERE title % 'Toán nâng cao';

-- With threshold
SET pg_trgm.similarity_threshold = 0.3;

-- ILIKE also uses trgm index
SELECT * FROM courses WHERE title ILIKE '%toán%';
```

**Use case:** Search course title, tutor name.

---

## Slide 7 — GIN JSONB index

### Index inside JSONB

```sql
-- Audit logs metadata
CREATE INDEX idx_audit_metadata_gin ON audit_logs USING gin (metadata);

-- Query
SELECT * FROM audit_logs WHERE metadata @> '{"action": "block"}';
SELECT * FROM audit_logs WHERE metadata ? 'reason';
SELECT * FROM audit_logs WHERE metadata #>> '{role}' = 'admin';
```

**Operators GIN supports:**

- `@>` contains
- `<@` contained by
- `?` key exists
- `?&` all keys exist
- `?|` any key exists

---

## Slide 8 — GIN array

```sql
-- If courses has tags TEXT[]
CREATE INDEX idx_courses_tags ON courses USING gin (tags);

SELECT * FROM courses WHERE tags && ARRAY['beginner', 'video'];
-- ✅ Use GIN
```

---

## Slide 9 — Combine: partial + expression

```sql
-- Lowercase email lookup ONLY for active users
CREATE INDEX idx_active_users_email_lower
  ON users (LOWER(email))
  WHERE status = 'active';

SELECT * FROM users
WHERE LOWER(email) = LOWER('tu@x.com')
  AND status = 'active';
-- ✅ Use combined index
```

---

## Slide 10 — Tutor365 advanced indexes

```sql
-- 1. Published course search
CREATE INDEX idx_courses_subject_pub_pubat
  ON courses (subject_id, published_at DESC)
  WHERE status = 'published';

-- 2. Title trigram search
CREATE INDEX idx_courses_title_trgm
  ON courses USING gin (title gin_trgm_ops)
  WHERE status = 'published';

-- 3. Active refresh tokens
CREATE INDEX idx_refresh_active_user
  ON refresh_tokens (user_id, created_at DESC)
  WHERE revoked_at IS NULL AND rotated_at IS NULL;

-- 4. Pending orders sorted by expiry
CREATE INDEX idx_orders_pending_expires
  ON orders (expires_at)
  WHERE status = 'pending';

-- 5. Email case-insensitive
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- 6. Audit metadata
CREATE INDEX idx_audit_metadata_gin ON audit_logs USING gin (metadata);

-- 7. Confirmed bookings near future
CREATE INDEX idx_booking_confirmed_startAt
  ON session_bookings (start_at)
  WHERE status = 'confirmed' AND start_at BETWEEN NOW() AND NOW() + INTERVAL '7 days';
```

---

## Slide 11 — Test partial works

```sql
-- Test
EXPLAIN ANALYZE
SELECT * FROM courses
WHERE subject_id = 'x' AND status = 'published';

-- With partial idx_courses_subject_pub_pubat:
Index Scan using idx_courses_subject_pub_pubat
  Index Cond: subject_id = 'x'
  Heap Fetches: 50
  Execution Time: 0.5 ms

-- Without partial:
Bitmap Heap Scan on courses
  Recheck Cond: subject_id = 'x'
  Filter: status = 'published'
  Rows Removed by Filter: 200
  Execution Time: 5 ms
```

---

## Slide 12 — When NOT to use partial

```sql
-- ❌ When predicate not in query
CREATE INDEX ... WHERE status = 'published';
SELECT * WHERE subject_id = 'x';   -- forget status filter
-- → Planner CAN'T use partial (must match predicate)

-- ❌ When predicate too narrow
WHERE status = 'super_rare' (5 rows)
-- → seq scan probably faster
```

**Rule:** Predicate must match queries. Cover the common case.

---

## Slide 13 — Index size comparison

```sql
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Typical:**

```
idx_audit_metadata_gin           | 256 MB | 1500 scans
idx_courses_title_trgm           | 128 MB | 3200 scans  
idx_booking_tutor_startAt        | 64 MB  | 50000 scans
idx_courses_subject_pub_pubat    | 32 MB  | 80000 scans  (partial — smaller)
```

---

## Slide 14 — VACUUM + REINDEX

```sql
-- Index bloat over time (after many updates)
VACUUM ANALYZE;
-- Updates statistics

REINDEX INDEX idx_xxx;          -- rebuild 1 index
REINDEX TABLE courses;          -- rebuild all indexes of table
REINDEX CONCURRENTLY ...;       -- non-blocking
```

> 💡 Heavy write workload → schedule REINDEX nightly.

---

## Slide 15 — Anti-patterns

```sql
-- ❌ Partial covering too much
CREATE INDEX ... WHERE status IS NOT NULL;
-- → 99% rows match → not partial benefit

-- ❌ Partial predicate not deterministic
CREATE INDEX ... WHERE created_at > NOW();
-- → "NOW" changes → planner confused

-- ❌ Expression too complex
CREATE INDEX ON courses ((title || '-' || subject_id));
-- → Rarely match query

-- ❌ GIN on column rarely queried
-- → Storage waste

-- ❌ Forget UPDATE invalidates index
UPDATE courses SET status = 'archived' WHERE ...
-- Partial index removes those rows
-- → Bigger cost than full
```

---

## Slide 16 — Bài tập thực hành

### 🎯 Advanced indexes

**Bài 1:** Apply 7 indexes (slide 10).

**Bài 2:** Test trigram: search "Toan" matches "Toán nâng cao", "Toán Lớp 10".

**Bài 3:** GIN JSONB query audit logs by action.

**Bài 4:** Test partial: query với/không có predicate → planner pick correctly.

**Bài 5:** Measure index size before/after partial.

**Bài 6:** Bonus: REINDEX concurrently → no downtime rebuild.

---

## Slide 17 — Real-world tuning

### Tutor365 deployment timeline

```
Month 1: Launch — 1k users, no perf issue
Month 3: 10k users — bookings query slow
  → Add composite indexes
Month 6: 50k users — search slow
  → Add trigram index
Month 12: 500k users — audit log scan
  → Add GIN metadata index
```

> 💡 Add index incremental dựa trên real data + monitoring.

---

## Slide 18 — Materialized view as advanced cache

```sql
-- Recap V48 — for very expensive aggregate
CREATE MATERIALIZED VIEW course_stats AS
SELECT
  c.id AS course_id,
  COUNT(e.id) AS enrollment_count,
  AVG(r.rating)::numeric(3,2) AS avg_rating,
  COUNT(r.id) AS review_count
FROM courses c
LEFT JOIN course_enrollments e ON e.course_id = c.id
LEFT JOIN course_reviews r ON r.course_id = c.id AND r.is_hidden = false
WHERE c.status = 'published'
GROUP BY c.id;

CREATE UNIQUE INDEX ON course_stats (course_id);

-- Refresh every 1 hour
REFRESH MATERIALIZED VIEW CONCURRENTLY course_stats;
```

> 💡 Tutor365 MVP có thể skip — query trực tiếp đủ. Khi user > 100k cân nhắc.

---

## Slide 19 — Section 20 hoàn tất

### Indexing layer ready

✅ V59 — Composite indexes
✅ V60 — EXPLAIN ANALYZE
✅ V61 — Partial + expression + GIN

**Section 21 — Transactions + Concurrency** (2 video):

- V62: ACID + isolation levels
- V63: EXCLUDE constraint chống double-booking

> 🚀 Sang Section 21 — concurrency safety.

---

## Slide 20 — Tổng kết Video 61

### Bạn vừa học

- ✅ Partial index — WHERE-filtered subset
- ✅ Expression index — function result
- ✅ Trigram index — fuzzy search
- ✅ GIN JSONB — index inside JSON
- ✅ GIN array
- ✅ Combine partial + expression
- ✅ 7 advanced Tutor365 indexes
- ✅ Index size monitoring
- ✅ VACUUM + REINDEX maintenance
- ✅ Materialized view as cache

> 💪 Advanced indexes = scale Tutor365 từ 1k đến 1M users

---

<!-- _class: lead -->

# Tiếp theo: Video 62

## ACID + Isolation Levels

READ COMMITTED vs SERIALIZABLE — pick right level cho mỗi flow.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 62 🚀

> *"Index for the queries you have, not the ones you might."*
