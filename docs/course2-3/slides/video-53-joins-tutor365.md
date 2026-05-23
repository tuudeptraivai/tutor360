---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 53: JOINs trên Tutor365 Schema'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# JOINs
# trên Tutor365 Schema

### Khóa 2-3 — Video 53

**INNER · LEFT · RIGHT · FULL**

> JOIN sai = data sai. Hiểu rõ = power tool.

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Phân biệt 4 loại JOIN
- ✅ JOIN nhiều bảng cho query phức tạp
- ✅ Self-JOIN cho combo parent-child
- ✅ LATERAL JOIN cho mỗi row sub-query
- ✅ JOIN trên N:N junction table
- ✅ Anti-patterns JOIN

> 🎯 Cuối video: viết 8 query phức tạp với JOIN chính xác

---

## Slide 3 — INNER JOIN (default)

### Chỉ giữ rows match cả 2 phía

```sql
-- Course + tutor info
SELECT c.title, u.full_name AS tutor_name
FROM courses c
INNER JOIN users u ON u.id = c.tutor_id;
```

```
courses          users
| id | tutor_id |    | id | full_name |
| c1 | u1       |    | u1 | Tutor 1   |
| c2 | u2       |    | u2 | Tutor 2   |
| c3 | u99 (del)|    | u99 không tồn  |

Result:
| title | tutor_name |
| c1    | Tutor 1    |
| c2    | Tutor 2    |
            (c3 dropped vì u99 không tồn)
```

---

## Slide 4 — LEFT JOIN

### Giữ all rows trái, NULL nếu không match phải

```sql
-- All tutors, even if no course
SELECT u.id, u.full_name, COUNT(c.id) AS course_count
FROM users u
LEFT JOIN courses c ON c.tutor_id = u.id AND c.status = 'published'
WHERE u.role = 'tutor'
GROUP BY u.id, u.full_name
ORDER BY course_count DESC;
```

**Result:** Tutor không có course vẫn xuất hiện với `course_count = 0`.

> 💡 LEFT JOIN giữ row của bảng "ưu tiên" — phổ biến hơn RIGHT JOIN.

---

## Slide 5 — RIGHT JOIN

### Inverse LEFT JOIN

```sql
-- Same as LEFT JOIN với bảng đảo
SELECT c.title, u.full_name
FROM courses c
RIGHT JOIN users u ON u.id = c.tutor_id
WHERE u.role = 'tutor';
```

> 💡 Ít dùng — đa số rewrite thành LEFT cho readable.

---

## Slide 6 — FULL OUTER JOIN

### Giữ all rows cả 2 phía

```sql
SELECT u.full_name AS tutor, c.title AS course
FROM users u
FULL OUTER JOIN courses c ON c.tutor_id = u.id;
```

**Hiếm dùng** trong CRUD app. Hữu ích cho data reconciliation.

---

## Slide 7 — JOIN nhiều bảng

```sql
-- Booking detail với student, tutor, subject, level, package
SELECT
  b.id, b.start_at, b.duration_hr, b.status,
  s.full_name AS student_name, s.email AS student_email,
  t.full_name AS tutor_name,
  subj.name AS subject_name,
  lv.name AS level_name,
  p.type AS package_type, p.hourly_rate_vnd
FROM session_bookings b
JOIN users s ON s.id = b.student_id
LEFT JOIN users t ON t.id = b.tutor_id
JOIN subjects subj ON subj.id = b.subject_id
JOIN levels lv ON lv.id = b.level_id
JOIN session_packages p ON p.id = b.package_id
WHERE b.id = $1;
```

**Patterns:**

- ✅ INNER cho FK NOT NULL
- ✅ LEFT cho FK nullable (b.tutor_id)
- ✅ Alias rõ ràng (s = student, t = tutor)

---

## Slide 8 — N:N qua junction

```sql
-- Subjects của Tutor X
SELECT s.id, s.name, s.slug
FROM subjects s
JOIN tutor_subjects ts ON ts.subject_id = s.id
WHERE ts.tutor_id = $1
ORDER BY s.position;

-- Tutors dạy subject Y
SELECT u.id, u.full_name, t.bio
FROM users u
JOIN tutor_profiles t ON t.user_id = u.id
JOIN tutor_subjects ts ON ts.tutor_id = u.id
WHERE ts.subject_id = $1
  AND t.approve_status = 'approved'
  AND u.status = 'active';
```

---

## Slide 9 — Self-JOIN: combo parent-child

```sql
-- Parent + children
SELECT
  p.id AS parent_id,
  p.start_at AS first_session,
  p.recurrence_rule,
  COUNT(c.id) AS children_count
FROM session_bookings p
LEFT JOIN session_bookings c ON c.parent_booking_id = p.id
WHERE p.recurrence_rule IS NOT NULL
  AND p.student_id = $1
GROUP BY p.id, p.start_at, p.recurrence_rule;
```

**Use case:** Render combo summary.

---

## Slide 10 — LATERAL JOIN

### Subquery có thể tham chiếu outer

```sql
-- Top 3 latest review per course
SELECT c.id, c.title, r.rating, r.comment, r.created_at
FROM courses c
CROSS JOIN LATERAL (
  SELECT rating, comment, created_at
  FROM course_reviews
  WHERE course_id = c.id AND is_hidden = false
  ORDER BY created_at DESC
  LIMIT 3
) r
WHERE c.status = 'published';
```

> 💡 LATERAL = "per-row subquery". Khác CROSS JOIN thường (không tham chiếu được).

---

## Slide 11 — JOIN với aggregate

```sql
-- Course list with avg rating + review count
SELECT
  c.id, c.title,
  COALESCE(stats.avg_rating, 0) AS avg_rating,
  COALESCE(stats.review_count, 0) AS review_count
FROM courses c
LEFT JOIN (
  SELECT
    course_id,
    AVG(rating) AS avg_rating,
    COUNT(*) AS review_count
  FROM course_reviews
  WHERE is_hidden = false
  GROUP BY course_id
) stats ON stats.course_id = c.id
WHERE c.status = 'published'
ORDER BY avg_rating DESC NULLS LAST
LIMIT 20;
```

---

## Slide 12 — Trigger JOIN vs CTE

```sql
-- CTE refactor
WITH course_stats AS (
  SELECT course_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
  FROM course_reviews
  WHERE is_hidden = false
  GROUP BY course_id
)
SELECT
  c.id, c.title,
  COALESCE(s.avg_rating, 0) AS avg_rating,
  COALESCE(s.review_count, 0) AS review_count
FROM courses c
LEFT JOIN course_stats s ON s.course_id = c.id
WHERE c.status = 'published';
```

**CTE benefit:**

- ✅ Readable cho query phức tạp
- ✅ Reusable (multiple JOIN cùng CTE)

> 💡 V55 deep CTE.

---

## Slide 13 — Tutor full profile query

```sql
-- 1 query trả tutor profile + relations
SELECT
  u.id, u.full_name, u.email,
  t.bio, t.approve_status,
  array_agg(DISTINCT s.name) AS subjects,
  array_agg(DISTINCT l.name) AS levels,
  array_agg(DISTINCT q.name) AS qualifications,
  (SELECT AVG(rating) FROM course_reviews r WHERE r.course_id IN (
    SELECT id FROM courses WHERE tutor_id = u.id
  ) AND r.is_hidden = false) AS avg_rating
FROM users u
JOIN tutor_profiles t ON t.user_id = u.id
LEFT JOIN tutor_subjects ts ON ts.tutor_id = u.id
LEFT JOIN subjects s ON s.id = ts.subject_id
LEFT JOIN tutor_levels tl ON tl.tutor_id = u.id
LEFT JOIN levels l ON l.id = tl.level_id
LEFT JOIN tutor_qualifications tq ON tq.tutor_id = u.id AND tq.verified_at IS NOT NULL
LEFT JOIN qualifications q ON q.id = tq.qualification_id
WHERE u.id = $1
GROUP BY u.id, t.user_id;
```

> 💡 1 query thay 5 query. `array_agg` cho N:N relations.

---

## Slide 14 — Anti-patterns

```sql
-- ❌ Cartesian product (forgot JOIN condition)
SELECT * FROM courses c, users u;
-- → c × u rows = millions

-- ❌ JOIN không index
JOIN session_bookings b ON b.start_at = ...
-- Without index on start_at → slow

-- ❌ Implicit JOIN
SELECT * FROM c, u WHERE c.tutor_id = u.id;
-- Works but less readable. Prefer explicit JOIN syntax

-- ❌ LEFT JOIN với WHERE phía phải làm INNER lại
LEFT JOIN courses c ON c.tutor_id = u.id
WHERE c.status = 'published'    -- ❌ excludes u without course
-- → Move filter into ON clause
LEFT JOIN courses c ON c.tutor_id = u.id AND c.status = 'published'
WHERE u.role = 'tutor'

-- ❌ Multiple JOIN aggregating gây "row explosion"
JOIN tutor_subjects + JOIN tutor_levels + JOIN courses
-- → rows multiply
-- → CTE or array_agg
```

---

## Slide 15 — Test JOIN với Tutor365 data

```bash
# Seed data
psql -c "INSERT INTO users ..."

# Run query
psql -c "
SELECT u.full_name, COUNT(c.id) AS course_count
FROM users u
LEFT JOIN courses c ON c.tutor_id = u.id
WHERE u.role = 'tutor'
GROUP BY u.id, u.full_name
ORDER BY course_count DESC
LIMIT 10;
"

# Expected:
# Anh Tu      | 5
# Bao Pham    | 3
# Cuong Le    | 0  ← Cuong là Tutor approved nhưng chưa có course
```

---

## Slide 16 — EXPLAIN cho JOIN

```sql
EXPLAIN ANALYZE
SELECT c.title, u.full_name
FROM courses c
JOIN users u ON u.id = c.tutor_id
WHERE c.status = 'published';
```

**Good:**

```
Hash Join
  Hash Cond: c.tutor_id = u.id
  →  Index Scan using idx_courses_status on courses
  →  Hash → Seq Scan on users
```

**Bad:**

```
Nested Loop  (slow if many rows)
  →  Seq Scan on courses
  →  Index Scan on users
```

> 💡 Nested Loop OK với small outer. Hash Join good cho large.

---

## Slide 17 — Bài tập thực hành

### 🎯 8 JOIN queries

**Bài 1:** All tutors + count published course (LEFT JOIN).

**Bài 2:** Bookings + student + tutor + subject info.

**Bài 3:** Course list với latest review + review count.

**Bài 4:** Tutor full profile với subjects/levels arrays.

**Bài 5:** Combo parent + children count.

**Bài 6:** Tutor đã có Tutor365 booking nhưng không published course.

**Bài 7:** Top 5 most active student (most enrollments).

**Bài 8:** Calendar feed: bookings + meeting URL build.

---

## Slide 18 — Performance tips

```sql
-- 1. Filter trước JOIN
-- ❌ JOIN + WHERE
SELECT * FROM huge_table h
JOIN other o ON h.id = o.id
WHERE h.status = 'active';

-- ✅ Subquery filter trước
SELECT * FROM (
  SELECT * FROM huge_table WHERE status = 'active'
) h
JOIN other o ON h.id = o.id;

-- (PG planner thường tự rewrite — nhưng explicit rõ hơn)

-- 2. Index FK joining
CREATE INDEX idx_b_t ON session_bookings (tutor_id);

-- 3. Limit early
WITH limited AS (
  SELECT id FROM courses WHERE status = 'published' LIMIT 20
)
SELECT * FROM limited l JOIN ...
```

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| JOIN trên NULL key | INNER skip, LEFT keep |
| Self-JOIN không alias | Error — must alias |
| Cartesian từ implicit JOIN | Massive result, slow |
| LEFT JOIN + WHERE column nullable | Filter ép thành INNER |
| Multiple LEFT JOIN aggregating | Row explosion → wrong COUNT |

---

## Slide 20 — Tổng kết Video 53

### Bạn vừa học

- ✅ INNER, LEFT, RIGHT, FULL distinction
- ✅ JOIN nhiều bảng với alias
- ✅ N:N junction (tutor_subjects)
- ✅ Self-JOIN (combo)
- ✅ LATERAL JOIN (per-row subquery)
- ✅ JOIN với aggregate subquery vs CTE
- ✅ `array_agg` cho N:N collapse
- ✅ EXPLAIN cho JOIN
- ✅ Anti-pattern: LEFT JOIN ép thành INNER

> 💪 JOIN đúng = power tool của SQL

---

<!-- _class: lead -->

# Tiếp theo: Video 54

## GROUP BY + Aggregations + HAVING

Revenue report, tutor stats — pattern aggregate trên Tutor365.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 54 🚀

> *"JOIN: bring data together. Don't over-join."*
