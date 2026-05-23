---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 54: GROUP BY + Aggregations'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# GROUP BY + Aggregations
# + HAVING

### Khóa 2-3 — Video 54

**Revenue report · Tutor stats**

> Tutor365 dashboard chạy bằng aggregate

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ GROUP BY single + multiple columns
- ✅ Aggregate functions: COUNT, SUM, AVG, MIN, MAX
- ✅ HAVING vs WHERE
- ✅ FILTER clause cho conditional aggregate
- ✅ Tutor revenue report query
- ✅ DATE_TRUNC cho time-series aggregate

> 🎯 Cuối video: 6 dashboard queries cho Hanah + Tutor

---

## Slide 3 — GROUP BY basics

```sql
-- Count tutors per status
SELECT approve_status, COUNT(*) AS count
FROM tutor_profiles
GROUP BY approve_status;
-- → approved: 25, pending: 3, rejected: 1
```

**Rule:** Every column in SELECT phải có trong GROUP BY hoặc là aggregate.

```sql
-- ❌ Error
SELECT id, approve_status, COUNT(*) FROM tutor_profiles GROUP BY approve_status;
-- "id must appear in GROUP BY or be used in aggregate"

-- ✅
SELECT approve_status, COUNT(*) FROM tutor_profiles GROUP BY approve_status;
```

---

## Slide 4 — Multiple group columns

```sql
-- Revenue by year + month
SELECT
  EXTRACT(YEAR FROM created_at) AS year,
  EXTRACT(MONTH FROM created_at) AS month,
  SUM(total_vnd) AS revenue
FROM orders
WHERE status = 'paid'
GROUP BY year, month
ORDER BY year DESC, month DESC;
```

---

## Slide 5 — HAVING vs WHERE

```sql
-- WHERE filter rows BEFORE grouping
-- HAVING filter groups AFTER aggregation

SELECT
  tutor_id, COUNT(*) AS course_count
FROM courses
WHERE status = 'published'         -- filter pre-aggregation
GROUP BY tutor_id
HAVING COUNT(*) >= 3;              -- filter post-aggregation
```

> 💡 Quy tắc: column thường ở WHERE, aggregate ở HAVING.

---

## Slide 6 — FILTER clause (conditional aggregate)

```sql
-- Tutor stats với multiple conditional
SELECT
  c.tutor_id,
  COUNT(*) AS total_courses,
  COUNT(*) FILTER (WHERE c.status = 'published') AS published_courses,
  COUNT(*) FILTER (WHERE c.status = 'draft') AS draft_courses,
  COUNT(*) FILTER (WHERE c.status = 'rejected') AS rejected_courses,
  AVG(c.price_vnd) FILTER (WHERE c.status = 'published') AS avg_published_price
FROM courses c
GROUP BY c.tutor_id;
```

**Without FILTER:** Cần multiple subquery / CASE WHEN. FILTER cleaner.

---

## Slide 7 — Tutor revenue report

```sql
-- Tutor session revenue tháng N
SELECT
  b.tutor_id,
  u.full_name AS tutor_name,
  COUNT(b.id) AS completed_sessions,
  SUM(o.subtotal) AS session_revenue,
  AVG(o.subtotal) AS avg_session_value
FROM session_bookings b
JOIN orders o ON o.id = b.order_id OR o.ref_id = b.parent_booking_id   -- combo case
JOIN users u ON u.id = b.tutor_id
WHERE b.status = 'completed'
  AND b.completed_at BETWEEN '2026-04-01' AND '2026-05-01'
  AND o.status = 'paid'
GROUP BY b.tutor_id, u.full_name
HAVING COUNT(b.id) >= 1
ORDER BY session_revenue DESC;
```

---

## Slide 8 — Course revenue

```sql
SELECT
  c.id, c.title,
  COUNT(e.id) AS enrollment_count,
  SUM(e.price_paid_vnd) AS revenue,
  AVG(e.price_paid_vnd) AS avg_price_paid,
  -- Latest enrollment date
  MAX(e.enrolled_at) AS last_enrollment
FROM courses c
LEFT JOIN course_enrollments e ON e.course_id = c.id
WHERE c.status = 'published'
GROUP BY c.id, c.title
ORDER BY revenue DESC NULLS LAST
LIMIT 20;
```

---

## Slide 9 — Booking stats Hanah dashboard

```sql
SELECT
  status,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE start_at > NOW()) AS upcoming,
  COUNT(*) FILTER (WHERE start_at <= NOW()) AS past
FROM session_bookings
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC;

-- Output:
-- completed     | 50 | 0  | 50
-- confirmed     | 8  | 8  | 0
-- pending_assign| 3  | 3  | 0
-- cancelled     | 2  | 1  | 1
-- no_show       | 1  | 0  | 1
```

---

## Slide 10 — DATE_TRUNC time-series

```sql
-- Enrollments per day last 30 days
SELECT
  DATE_TRUNC('day', enrolled_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
  COUNT(*) AS enrollments,
  SUM(price_paid_vnd) AS revenue
FROM course_enrollments
WHERE enrolled_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

**Output:**

```
2026-04-26 | 5 | 2_500_000
2026-04-27 | 8 | 3_900_000
2026-04-28 | 3 | 1_500_000
...
```

---

## Slide 11 — Cohort analysis

```sql
-- New tutor signups per month
SELECT
  DATE_TRUNC('month', u.created_at) AS month,
  COUNT(*) AS new_tutors,
  COUNT(*) FILTER (WHERE t.approve_status = 'approved') AS approved,
  AVG(EXTRACT(EPOCH FROM (t.approved_at - u.created_at)) / 86400) AS avg_days_to_approve
FROM users u
JOIN tutor_profiles t ON t.user_id = u.id
WHERE u.role = 'tutor'
GROUP BY month
ORDER BY month;
```

---

## Slide 12 — Top subjects revenue

```sql
SELECT
  s.id, s.name,
  COUNT(DISTINCT c.id) AS course_count,
  COUNT(e.id) AS enrollment_count,
  SUM(e.price_paid_vnd) AS revenue
FROM subjects s
LEFT JOIN courses c ON c.subject_id = s.id AND c.status = 'published'
LEFT JOIN course_enrollments e ON e.course_id = c.id
WHERE s.is_active = true
GROUP BY s.id, s.name
ORDER BY revenue DESC NULLS LAST;
```

---

## Slide 13 — STRING_AGG

```sql
-- Concat tutor's subjects into single string
SELECT
  t.user_id,
  STRING_AGG(s.name, ', ' ORDER BY s.name) AS subjects
FROM tutor_profiles t
LEFT JOIN tutor_subjects ts ON ts.tutor_id = t.user_id
LEFT JOIN subjects s ON s.id = ts.subject_id
GROUP BY t.user_id;

-- Output:
-- u1 | "Hoá học, Lý, Toán học"
-- u2 | "Tiếng Anh"
```

---

## Slide 14 — Distinct count

```sql
-- Total active students (have at least 1 enrollment)
SELECT COUNT(DISTINCT student_id) AS active_students
FROM course_enrollments;

-- Avg enrollments per active student
SELECT
  AVG(c) AS avg_per_student
FROM (
  SELECT student_id, COUNT(*) AS c
  FROM course_enrollments
  GROUP BY student_id
) sub;
```

---

## Slide 15 — Percentile aggregates

```sql
-- Course price distribution
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY price_vnd) AS median,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY price_vnd) AS p90,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY price_vnd) AS p99,
  AVG(price_vnd) AS mean
FROM courses
WHERE status = 'published';
```

**Use case:** Pricing strategy — see distribution không skewed bởi outlier.

---

## Slide 16 — ROLLUP + CUBE (advanced)

```sql
-- Subtotal per subject + grand total
SELECT
  COALESCE(s.name, 'TOTAL') AS subject,
  COUNT(c.id) AS course_count,
  SUM(e.price_paid_vnd) AS revenue
FROM courses c
LEFT JOIN subjects s ON s.id = c.subject_id
LEFT JOIN course_enrollments e ON e.course_id = c.id
WHERE c.status = 'published'
GROUP BY ROLLUP (s.name)
ORDER BY s.name NULLS LAST;
```

**ROLLUP:** thêm subtotal row + grand total.

> 💡 Hiếm dùng — Tutor365 thường tách query.

---

## Slide 17 — Anti-patterns

```sql
-- ❌ GROUP BY include nullable không thấy NULL group
GROUP BY tutor_id   -- → orphan course (tutor_id NULL) bị dropped
-- → COALESCE(tutor_id, 'NULL') hoặc filter

-- ❌ COUNT(*) vs COUNT(column)
COUNT(*)           -- count all rows
COUNT(tutor_id)    -- count rows where tutor_id NOT NULL
-- → mean different things!

-- ❌ Mix WHERE + HAVING wrong
WHERE COUNT(*) > 3   -- ❌ WHERE không support aggregate
-- → HAVING

-- ❌ HAVING với non-aggregate
HAVING tutor_id = 'x'   -- inefficient, dùng WHERE

-- ❌ Aggregate + non-aggregate column without GROUP BY
SELECT tutor_id, COUNT(*) FROM courses   -- missing GROUP BY

-- ❌ ORDER BY column không trong SELECT
ORDER BY some_calc_thing   -- → planner sometimes confused
```

---

## Slide 18 — Bài tập thực hành

### 🎯 6 dashboard queries

**Bài 1:** Tutor revenue tháng (course + session).

**Bài 2:** Top 10 course bán chạy (enrollment count desc).

**Bài 3:** Enrollment per day last 30 ngày (time series).

**Bài 4:** Booking status breakdown last month.

**Bài 5:** Avg rating per tutor (chỉ approved + có >=5 review).

**Bài 6:** New user signup per month last 6 tháng.

**Bài 7:** Subject revenue ranking.

**Bài 8:** Bonus: ROLLUP grand total revenue.

---

## Slide 19 — Performance

```sql
-- For aggregate queries:
-- 1. Index on GROUP BY columns
CREATE INDEX idx_orders_paid_at_status
  ON orders (status, created_at)
  WHERE status = 'paid';

-- 2. Materialized view if expensive
CREATE MATERIALIZED VIEW tutor_monthly_revenue AS
SELECT ...;
REFRESH MATERIALIZED VIEW CONCURRENTLY tutor_monthly_revenue;

-- 3. Pre-compute in app (V46 payout already does this)
```

---

## Slide 20 — Tổng kết Video 54

### Bạn vừa học

- ✅ GROUP BY single + multiple
- ✅ Aggregate: COUNT, SUM, AVG, MIN, MAX
- ✅ WHERE vs HAVING
- ✅ FILTER clause conditional aggregate
- ✅ DATE_TRUNC cho time-series
- ✅ STRING_AGG cho concat
- ✅ DISTINCT COUNT
- ✅ PERCENTILE_CONT distribution
- ✅ ROLLUP cho subtotal
- ✅ Tutor365 dashboard queries

> 💪 GROUP BY = công cụ reporting chính

---

<!-- _class: lead -->

# Tiếp theo: Video 55

## CTE + Window Functions

`WITH` cho readable + RANK, ROW_NUMBER, running total cho Tutor365.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 55 🚀

> *"Aggregations are the database's executive summary."*
