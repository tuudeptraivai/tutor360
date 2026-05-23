---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 51: Keys + Indexes Basics'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Keys + Indexes
# Basics

### Khóa 2-3 — Video 51

**PK · FK · B-tree · GIN · GiST**

> Index = thư mục cho DB tìm data nhanh

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Phân biệt **PK, FK, Index**
- ✅ Hiểu **B-tree** (default index)
- ✅ Khi nào dùng **GIN** (JSONB, array)
- ✅ Khi nào dùng **GiST** (tsrange, geospatial)
- ✅ Composite index + column order
- ✅ Index không phải free — trade-off write cost

> 🎯 Cuối video: Bạn biết index nào cần thêm cho mỗi query Tutor365

---

## Slide 3 — PK, FK, Index khác nhau

| | PK | FK | Index |
|--|-----|-----|-------|
| Mục đích | Identity row | Reference parent | Tăng tốc query |
| Unique | ✅ | ❌ (default) | Optional |
| NOT NULL | ✅ | Tuỳ | Optional |
| Auto index | ✅ | ❌ — phải tạo riêng | — |
| Số lượng | 1 per table | Nhiều | Nhiều |

> 💡 PG tự tạo index cho PK. FK KHÔNG có index tự — bạn phải tạo!

---

## Slide 4 — B-tree (default)

### Suit cho equality + range query

```sql
CREATE INDEX idx_users_email ON users (email);
-- B-tree mặc định

-- Query benefit
SELECT * FROM users WHERE email = 'tu@x.com';     -- ✅ Use index
SELECT * FROM users WHERE email LIKE 'tu%';        -- ✅ Use index (prefix)
SELECT * FROM users WHERE email LIKE '%@x.com';    -- ❌ Suffix, full scan

-- Range
SELECT * FROM courses WHERE price_vnd BETWEEN 100_000 AND 500_000;  -- ✅
SELECT * FROM session_bookings WHERE start_at > NOW();              -- ✅
```

---

## Slide 5 — GIN (Generalized Inverted Index)

### Suit: composite value (array, JSONB, tsvector)

```sql
-- JSONB
CREATE INDEX idx_audit_metadata_gin ON audit_logs USING gin (metadata);

SELECT * FROM audit_logs
WHERE metadata @> '{"action": "block"}';
-- ✅ Use GIN

-- Array
CREATE INDEX idx_tags ON courses USING gin (tags);   -- if tags is TEXT[]

SELECT * FROM courses WHERE 'beginner' = ANY(tags);
-- ✅ Use GIN

-- Trigram (pg_trgm)
CREATE INDEX idx_courses_title_trgm
  ON courses USING gin (title gin_trgm_ops);

SELECT * FROM courses WHERE title % 'Toan';   -- fuzzy match
-- ✅ Use GIN trgm
```

---

## Slide 6 — GiST (Generalized Search Tree)

### Suit: range, geospatial

```sql
-- tsrange overlap
CREATE INDEX idx_booking_range_gist
  ON session_bookings USING gist (booking_range);

SELECT * FROM session_bookings
WHERE booking_range && tsrange('2026-05-25 09:00', '2026-05-25 11:00');
-- ✅ Use GiST

-- Composite with btree
CREATE EXTENSION btree_gist;

CREATE INDEX idx_booking_tutor_range
  ON session_bookings USING gist (tutor_id, booking_range);

SELECT * FROM session_bookings
WHERE tutor_id = 'x' AND booking_range && tsrange(...);
-- ✅ Composite gist
```

---

## Slide 7 — Composite index — column order

```sql
-- Index (tutor_id, start_at)
CREATE INDEX idx_booking_tutor_startAt ON session_bookings (tutor_id, start_at);

-- Helpful for:
SELECT * FROM session_bookings
WHERE tutor_id = 'x' AND start_at > NOW();  -- ✅ both columns
SELECT * FROM session_bookings WHERE tutor_id = 'x';  -- ✅ leftmost
SELECT * FROM session_bookings WHERE start_at > NOW();  -- ❌ no leftmost prefix
```

**Rule of thumb:**

- Leftmost column = equality filter most common
- Subsequent = range/sort
- Avoid index nhiều cột — chỉ index cột truy vấn thật sự

---

## Slide 8 — Index naming convention

```sql
-- Pattern
idx_<table>_<columns>

-- Examples
idx_users_email
idx_users_full_name_trgm
idx_courses_subject_status
idx_courses_tutor_published     -- partial idx
idx_booking_tutor_startAt
idx_booking_range_gist

-- For unique constraint
uq_<table>_<columns>
uq_users_email
uq_payments_vnp_tx
```

---

## Slide 9 — Tutor365 essential indexes

```sql
-- 1. Auth lookup
CREATE INDEX idx_users_email ON users (email);   -- (already from UNIQUE)
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);

-- 2. Courses public listing
CREATE INDEX idx_courses_status_pubat
  ON courses (status, published_at DESC)
  WHERE status = 'published';

CREATE INDEX idx_courses_subject_pubat
  ON courses (subject_id, published_at DESC)
  WHERE status = 'published';

-- 3. Tutor profile lookup
CREATE INDEX idx_tutor_profiles_status ON tutor_profiles (approve_status);

-- 4. Bookings calendar query
CREATE INDEX idx_booking_student_startAt ON session_bookings (student_id, start_at);
CREATE INDEX idx_booking_tutor_startAt ON session_bookings (tutor_id, start_at);

-- 5. Availability lookup
CREATE INDEX idx_avail_tutor_dow
  ON tutor_availability (tutor_id, day_of_week, start_time)
  WHERE is_active = true;

-- 6. Eligible-tutor filter joins
CREATE INDEX idx_tutor_subjects_subject_tutor ON tutor_subjects (subject_id, tutor_id);
CREATE INDEX idx_tutor_levels_level_tutor ON tutor_levels (level_id, tutor_id);

-- 7. Search trigram
CREATE INDEX idx_courses_title_trgm ON courses USING gin (title gin_trgm_ops);
```

---

## Slide 10 — Index không free

### Cost trade-off

| Aspect | Index có | Không index |
|--------|----------|-------------|
| SELECT speed | ✅ Fast | ⚠️ Slow (full scan) |
| INSERT/UPDATE/DELETE speed | ⚠️ Slower | ✅ Faster |
| Storage | ⚠️ Extra space | ✅ Smaller |
| VACUUM cost | ⚠️ Maintain | ✅ Cheap |

**Rule:**

- ✅ Index column nằm trong WHERE / JOIN / ORDER BY thường xuyên
- ❌ KHÔNG index column ít query
- ❌ KHÔNG index field cập nhật rất thường xuyên (e.g., view_count)

---

## Slide 11 — Multi-column index vs multiple single

```sql
-- A. Multi-column
CREATE INDEX idx_a_b ON t (a, b);

-- B. Two single
CREATE INDEX idx_a ON t (a);
CREATE INDEX idx_b ON t (b);

-- Trade-off
-- Query: WHERE a=X AND b=Y
-- A: 1 index scan, fast
-- B: bitmap AND of 2 indexes — slower

-- Query: WHERE a=X (no b)
-- A: ✅ leftmost prefix
-- B: ✅ idx_a

-- Query: WHERE b=Y (no a)
-- A: ❌ no leftmost
-- B: ✅ idx_b
```

> 💡 Pick based on query pattern. PG planner choose best automatically.

---

## Slide 12 — Index-only scan

### Visibility map magic

```sql
-- All columns needed are in index → no heap fetch
CREATE INDEX idx_users_email_role ON users (email, role);

SELECT email, role FROM users WHERE email = 'x@y.com';
-- ✅ Index-only scan (faster)
```

**EXPLAIN ANALYZE:**

```
Index Only Scan using idx_users_email_role on users
  Heap Fetches: 0   ← Đẹp
```

> 💡 Wide composite index có thể đáp ứng query mà không cần heap → fast.

---

## Slide 13 — Functional index

### Index trên expression

```sql
-- Lowercase email lookup
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

SELECT * FROM users WHERE LOWER(email) = LOWER('TU@x.com');
-- ✅ Use index
```

```sql
-- Year extracted
CREATE INDEX idx_orders_year ON orders (EXTRACT(YEAR FROM created_at));
SELECT * FROM orders WHERE EXTRACT(YEAR FROM created_at) = 2026;
```

---

## Slide 14 — Partial index

### Index subset

```sql
-- Only active courses
CREATE INDEX idx_courses_subject_active
  ON courses (subject_id)
  WHERE status = 'published';

-- Pending bookings only
CREATE INDEX idx_bookings_pending_assign
  ON session_bookings (created_at DESC)
  WHERE status = 'pending_assign';

-- Active refresh tokens
CREATE INDEX idx_refresh_active
  ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL AND expires_at > NOW();
```

**Lợi ích:**

- ✅ Index nhỏ hơn (chỉ subset)
- ✅ Update cost thấp hơn
- ✅ Planner pick when query match WHERE

---

## Slide 15 — EXPLAIN ANALYZE

### Verify query dùng index

```sql
EXPLAIN ANALYZE
SELECT * FROM courses
WHERE subject_id = 'math' AND status = 'published'
ORDER BY published_at DESC
LIMIT 20;
```

**Output good:**

```
Index Scan using idx_courses_subject_pubat on courses
  Index Cond: (subject_id = 'math')
  Filter: status = 'published'
  Rows: 20, Execution Time: 0.5 ms
```

**Output bad:**

```
Seq Scan on courses
  Filter: ...
  Rows Removed by Filter: 10000
  Execution Time: 320 ms
```

→ Section 20 deep dive.

---

## Slide 16 — Anti-patterns

```sql
-- ❌ Index every column
CREATE INDEX ON t (a);
CREATE INDEX ON t (b);
CREATE INDEX ON t (c);
... (10 indexes)
-- → Slow writes, big storage

-- ❌ Wrong order composite
WHERE tutor_id = X ORDER BY start_at
INDEX (start_at, tutor_id)   -- ← wrong order

-- ❌ Function on column kills index
WHERE LOWER(email) = '...'
INDEX (email)                 -- ❌ won't use
INDEX (LOWER(email))          -- ✅ functional

-- ❌ Forget index on FK
tutor_id UUID REFERENCES users(id)
-- → JOIN query slow
-- → CREATE INDEX idx_courses_tutor ON courses (tutor_id);

-- ❌ Index nullable column heavily
WHERE phone = '+84...'
-- → Most rows have phone = NULL → index sparse
```

---

## Slide 17 — Bài tập thực hành

### 🎯 Index design

**Bài 1:** List 5 query slowest trong Tutor365 (qua EXPLAIN ANALYZE).

**Bài 2:** Tạo essential indexes (slide 9).

**Bài 3:** Test với EXPLAIN ANALYZE trước + sau add index.

**Bài 4:** Implement partial index cho `pending_assign` booking → đo size + speed.

**Bài 5:** GIN index cho audit_logs metadata → test JSONB query.

**Bài 6:** Composite index `(tutor_id, start_at)` cho booking → verify leftmost prefix logic.

**Bài 7:** Bonus: Functional index `LOWER(email)` → so sánh full scan vs index scan.

---

## Slide 18 — Index drop unused

```sql
-- Check usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
  AND indexname NOT LIKE 'uq_%';

-- Drop unused
DROP INDEX idx_unused_index;
```

> 💡 Periodically review. Unused index = pure cost.

---

## Slide 19 — Section 17 hoàn tất

### PG Foundations done

✅ V48 — Vì sao PostgreSQL
✅ V49 — Tables + relationships ERD
✅ V50 — Constraints + data integrity
✅ V51 — Keys + indexes basics

**Section 18 — SQL Mastery** (4 video):

- V52: SELECT pro
- V53: JOINs
- V54: GROUP BY + aggregations
- V55: CTE + Window functions

> 🚀 Sang Section 18 — SQL deep dive với Tutor365 data.

---

## Slide 20 — Tổng kết Video 51

### Bạn vừa học

- ✅ PK, FK, Index khác nhau
- ✅ B-tree (default) cho equality + range
- ✅ GIN cho JSONB, array, trigram
- ✅ GiST cho tsrange, geospatial
- ✅ Composite index + column order
- ✅ Partial index, functional index
- ✅ Index-only scan magic
- ✅ Tutor365 essential indexes
- ✅ Trade-off: write cost vs read speed
- ✅ Anti-patterns + drop unused

> 💪 Index đúng = query nhanh + write OK

---

<!-- _class: lead -->

# Tiếp theo: Video 52

## Professional SELECT Queries

Filter, sort, alias, subquery — tối ưu SELECT trên Tutor365 schema.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 52 🚀

> *"Indexes turn O(N) into O(log N) — almost free if you do them right."*
