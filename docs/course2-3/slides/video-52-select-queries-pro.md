---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 52: Professional SELECT Queries'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Professional
# SELECT Queries

### Khóa 2-3 — Video 52

**Filter · Sort · Alias · Subquery**

> SELECT đúng = giảm 80% data trả về

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Filter với **WHERE** + boolean logic
- ✅ Sort với **ORDER BY** + multi-column
- ✅ **LIMIT / OFFSET** cho pagination
- ✅ **DISTINCT** giúp dedupe
- ✅ Subquery vs JOIN
- ✅ **EXISTS** / **NOT EXISTS** patterns
- ✅ Apply lên Tutor365 schema

> 🎯 Cuối video: viết 10 query thực dụng cho Tutor365

---

## Slide 3 — Query 1: Public course listing

```sql
SELECT
  c.id, c.slug, c.title, c.price_vnd,
  s.name AS subject_name,
  l.name AS level_name,
  u.full_name AS tutor_name
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN levels l ON l.id = c.level_id
JOIN users u ON u.id = c.tutor_id
WHERE c.status = 'published'
  AND s.is_active = true
ORDER BY c.published_at DESC
LIMIT 20;
```

**Best practices:**

- ✅ SELECT cụ thể (không `*`) → bandwidth giảm
- ✅ Table alias ngắn (c, s, l, u) → query readable
- ✅ LIMIT để cap response size

---

## Slide 4 — Query 2: User's enrollment list

```sql
SELECT
  e.id,
  e.enrolled_at,
  e.progress_percent,
  c.slug, c.title, c.cover_image_key,
  u.full_name AS tutor_name
FROM course_enrollments e
JOIN courses c ON c.id = e.course_id
JOIN users u ON u.id = c.tutor_id
WHERE e.student_id = $1
ORDER BY e.enrolled_at DESC;
```

**Pattern:** Display fields user cần thấy, không expose internal.

---

## Slide 5 — Query 3: Pending bookings urgency

```sql
SELECT
  b.id, b.start_at, b.duration_hr,
  EXTRACT(EPOCH FROM (b.start_at - NOW())) / 3600 AS hours_until_start,
  s.full_name AS student_name,
  subj.name AS subject_name,
  lv.name AS level_name
FROM session_bookings b
JOIN users s ON s.id = b.student_id
JOIN subjects subj ON subj.id = b.subject_id
JOIN levels lv ON lv.id = b.level_id
WHERE b.status = 'pending_assign'
  AND b.parent_booking_id IS NULL    -- single + parent combo
ORDER BY b.start_at ASC
LIMIT 50;
```

> 💡 `EXTRACT EPOCH` → hours until start cho urgency.

---

## Slide 6 — Subquery: tutor with course

```sql
-- Tutor có course published
SELECT u.id, u.full_name
FROM users u
WHERE u.role = 'tutor'
  AND u.id IN (
    SELECT DISTINCT tutor_id FROM courses WHERE status = 'published'
  );
```

**EXISTS alternative (often faster):**

```sql
SELECT u.id, u.full_name
FROM users u
WHERE u.role = 'tutor'
  AND EXISTS (
    SELECT 1 FROM courses c WHERE c.tutor_id = u.id AND c.status = 'published'
  );
```

> 💡 EXISTS dừng sớm khi find 1 row. IN có thể compute full list.

---

## Slide 7 — NOT EXISTS

```sql
-- Tutor approved mà chưa có course
SELECT u.id, u.full_name
FROM users u
JOIN tutor_profiles t ON t.user_id = u.id
WHERE t.approve_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM courses c WHERE c.tutor_id = u.id
  );

-- Course chưa có review nào
SELECT c.id, c.title
FROM courses c
WHERE c.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM course_reviews r
    WHERE r.course_id = c.id AND r.is_hidden = false
  );
```

---

## Slide 8 — DISTINCT

```sql
-- Subjects của Tutor X
SELECT DISTINCT s.name, s.slug
FROM subjects s
JOIN tutor_subjects ts ON ts.subject_id = s.id
WHERE ts.tutor_id = $1
ORDER BY s.name;

-- DISTINCT ON — first row per group
SELECT DISTINCT ON (course_id) course_id, rating, comment, created_at
FROM course_reviews
WHERE is_hidden = false
ORDER BY course_id, created_at DESC;
-- → Mỗi course chỉ trả review mới nhất
```

> 💡 `DISTINCT ON` là PG-specific, không có trong standard SQL.

---

## Slide 9 — CASE expression

```sql
-- Map status → label
SELECT
  b.id,
  CASE b.status
    WHEN 'created' THEN 'Đang chờ thanh toán'
    WHEN 'pending_assign' THEN 'Đang chờ Hanah assign'
    WHEN 'assigned' THEN 'Đang chờ Tutor confirm'
    WHEN 'confirmed' THEN 'Đã xác nhận'
    WHEN 'in_progress' THEN 'Đang diễn ra'
    WHEN 'completed' THEN 'Đã hoàn thành'
    WHEN 'cancelled' THEN 'Đã hủy'
    WHEN 'no_show' THEN 'Không tham gia'
  END AS status_label,
  b.start_at
FROM session_bookings b
WHERE b.student_id = $1;
```

---

## Slide 10 — COALESCE + NULLIF

```sql
-- COALESCE: first non-null
SELECT
  u.id,
  COALESCE(u.phone, 'N/A') AS phone_display,
  COALESCE(t.hourly_rate_override, 200000) AS effective_rate
FROM users u
LEFT JOIN tutor_profiles t ON t.user_id = u.id;

-- NULLIF: convert specific value → null
SELECT
  NULLIF(description, '') AS desc_or_null,
  COALESCE(NULLIF(description, ''), 'No description') AS display
FROM courses;
```

---

## Slide 11 — Date/time functions

```sql
-- Now in VN time
SELECT NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh';

-- Format
SELECT TO_CHAR(start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
FROM session_bookings;

-- Truncate
SELECT DATE_TRUNC('day', created_at) AS day FROM orders;
SELECT DATE_TRUNC('month', created_at) AS month FROM orders;

-- Arithmetic
SELECT start_at + (duration_hr * INTERVAL '1 hour') AS end_at
FROM session_bookings;

SELECT NOW() - INTERVAL '7 days';   -- 7 days ago
```

---

## Slide 12 — String functions

```sql
-- LIKE, ILIKE
SELECT * FROM users WHERE email ILIKE 'tu@%';

-- Concatenation
SELECT first_name || ' ' || last_name AS full_name FROM users;

-- Trim
SELECT TRIM(BOTH ' ' FROM full_name);
SELECT LOWER(email);

-- Replace
SELECT REPLACE(title, 'Toán', 'Math') FROM courses;

-- Substring
SELECT SUBSTRING(bio FROM 1 FOR 100) AS preview FROM tutor_profiles;

-- pg_trgm similarity (V19)
SELECT similarity(title, 'Toán nâng cao') FROM courses;
SELECT * FROM courses WHERE title % 'Toán';   -- threshold default 0.3
```

---

## Slide 13 — Pagination cursor (V19 refine)

```sql
-- Offset (page-based)
SELECT * FROM courses
WHERE status = 'published'
ORDER BY published_at DESC, id ASC
LIMIT 20 OFFSET 40;
-- ⚠️ OFFSET 40 → server scan + skip 40 → chậm khi offset lớn

-- Cursor-based
SELECT * FROM courses
WHERE status = 'published'
  AND (published_at, id) < ($cursor_pub_at, $cursor_id)
ORDER BY published_at DESC, id ASC
LIMIT 20;
-- ✅ Use index, không scan trước
```

> 💡 Tutor365 dùng cursor cho infinite scroll FE.

---

## Slide 14 — UNION / UNION ALL

```sql
-- Combine notifications + audit_logs for user activity stream
SELECT 'notification' AS source, title, created_at FROM notifications WHERE user_id = $1
UNION ALL
SELECT 'audit_log' AS source, action AS title, created_at FROM audit_logs WHERE actor_user_id = $1
ORDER BY created_at DESC
LIMIT 50;
```

**UNION vs UNION ALL:**

- `UNION` — dedupe rows (slower)
- `UNION ALL` — keep duplicates (faster)

---

## Slide 15 — IS NULL vs = NULL

```sql
-- ❌ Wrong (NULL không equal anything, kể cả NULL)
WHERE phone = NULL;        -- always false

-- ✅ Right
WHERE phone IS NULL;
WHERE phone IS NOT NULL;

-- COALESCE workaround
WHERE COALESCE(phone, '') = '';

-- Distinct with NULL
SELECT * FROM users WHERE country IS DISTINCT FROM 'VN';
-- → Includes rows where country IS NULL
```

---

## Slide 16 — Aggregate basics (V54 detail)

```sql
-- COUNT
SELECT COUNT(*) FROM users WHERE role = 'tutor';
SELECT COUNT(DISTINCT subject_id) FROM courses WHERE status = 'published';

-- SUM, AVG
SELECT SUM(price_paid_vnd) AS revenue FROM course_enrollments
WHERE enrolled_at > NOW() - INTERVAL '30 days';

SELECT AVG(rating) FROM course_reviews WHERE course_id = $1;

-- MIN, MAX
SELECT MIN(price_vnd), MAX(price_vnd) FROM courses WHERE status = 'published';
```

---

## Slide 17 — Anti-patterns

```sql
-- ❌ SELECT *
SELECT * FROM courses;          -- 30 columns; we need 5
-- → Explicit columns

-- ❌ N+1 from app
for course in courses:
  reviews = SELECT * FROM course_reviews WHERE course_id = course.id   -- N queries
-- → Use JOIN or batch IN

-- ❌ WHERE column LIKE '%pattern%'
WHERE title LIKE '%nâng cao%'    -- ❌ no index use
-- → pg_trgm with title % 'nâng cao'

-- ❌ ORDER BY function(col)
ORDER BY LOWER(name)              -- ❌ no index
-- → store lower(name) generated column hoặc functional index

-- ❌ OFFSET cao
LIMIT 20 OFFSET 10000             -- → scan + skip 10000
-- → cursor pagination

-- ❌ Tin server timezone
WHERE DATE(created_at) = '2026-05-25'    -- timezone unclear
-- → AT TIME ZONE 'Asia/Ho_Chi_Minh'
```

---

## Slide 18 — Bài tập thực hành

### 🎯 10 query Tutor365

**Bài 1:** Top 10 course bán chạy (theo enrollment count tháng này).

**Bài 2:** Tutor có 0 booking trong tháng qua.

**Bài 3:** Student đăng ký nhiều khoá nhất (top 5).

**Bài 4:** Course không có review nào.

**Bài 5:** Booking sắp diễn ra trong 24h tới (cho cron reminder).

**Bài 6:** Order pending > 25 phút (chuẩn bị expire).

**Bài 7:** Subjects có nhiều tutor nhất.

**Bài 8:** Average rating per tutor (chỉ tutor approved).

**Bài 9:** Revenue per month last 12 months.

**Bài 10:** Search course bằng pg_trgm fuzzy.

---

## Slide 19 — EXPLAIN cho mỗi query

```sql
EXPLAIN ANALYZE
SELECT ... ;

-- Mong đợi:
-- - Index Scan (không Seq Scan)
-- - Execution Time < 100ms cho query nhỏ
-- - Rows returned ≈ Limit
```

---

## Slide 20 — Tổng kết Video 52

### Bạn vừa học

- ✅ SELECT specific column (không `*`)
- ✅ Table alias readable
- ✅ Subquery vs JOIN trade-off
- ✅ EXISTS / NOT EXISTS
- ✅ DISTINCT / DISTINCT ON
- ✅ CASE expression
- ✅ COALESCE + NULLIF
- ✅ Date/time functions + timezone
- ✅ String functions + pg_trgm
- ✅ Cursor pagination
- ✅ Aggregate basics

> 💪 SELECT pro = data đúng + nhanh + bandwidth thấp

---

<!-- _class: lead -->

# Tiếp theo: Video 53

## JOINs (INNER / LEFT / RIGHT / FULL)

Bài tập trên Tutor365 schema: tutor có course, student có booking, ...

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 53 🚀

> *"Good SQL is good filtering."*
