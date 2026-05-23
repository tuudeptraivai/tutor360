---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 55: CTE + Window Functions'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# CTE + Window
# Functions

### Khóa 2-3 — Video 55

**WITH · RANK · ROW_NUMBER · Running Total**

> SQL nâng cao = readable + tận dụng PG mạnh

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ CTE (Common Table Expression) với `WITH`
- ✅ Recursive CTE cho hierarchy
- ✅ Window function: RANK, ROW_NUMBER, DENSE_RANK
- ✅ Running total qua SUM() OVER
- ✅ Moving average với window
- ✅ LAG / LEAD cho compare row

> 🎯 Cuối video: viết complex query readable + maintainable

---

## Slide 3 — CTE basics

### Cấu trúc

```sql
WITH cte_name AS (
  SELECT ...
)
SELECT * FROM cte_name;
```

**Lợi ích:**

- ✅ Readable cho query phức tạp
- ✅ Reusable trong query (multiple JOIN cùng CTE)
- ✅ Tách logic step-by-step

---

## Slide 4 — CTE example: course với stats

```sql
WITH course_stats AS (
  SELECT
    course_id,
    AVG(rating) AS avg_rating,
    COUNT(*) AS review_count
  FROM course_reviews
  WHERE is_hidden = false
  GROUP BY course_id
),
course_enrollment_count AS (
  SELECT course_id, COUNT(*) AS enrollment_count
  FROM course_enrollments
  GROUP BY course_id
)
SELECT
  c.id, c.title,
  COALESCE(s.avg_rating, 0) AS avg_rating,
  COALESCE(s.review_count, 0) AS review_count,
  COALESCE(e.enrollment_count, 0) AS enrollment_count
FROM courses c
LEFT JOIN course_stats s ON s.course_id = c.id
LEFT JOIN course_enrollment_count e ON e.course_id = c.id
WHERE c.status = 'published'
ORDER BY enrollment_count DESC;
```

---

## Slide 5 — CTE chained (sequential)

```sql
WITH
  paid_orders_last_30d AS (
    SELECT * FROM orders
    WHERE status = 'paid' AND paid_at > NOW() - INTERVAL '30 days'
  ),
  revenue_by_type AS (
    SELECT type, SUM(total_vnd) AS revenue, COUNT(*) AS count
    FROM paid_orders_last_30d
    GROUP BY type
  )
SELECT
  type,
  revenue,
  count,
  ROUND(revenue * 100.0 / SUM(revenue) OVER (), 2) AS percent_of_total
FROM revenue_by_type
ORDER BY revenue DESC;
```

---

## Slide 6 — Recursive CTE

### Hierarchy traversal

```sql
-- Combo: parent + all children
WITH RECURSIVE booking_tree AS (
  -- Base: start with parent
  SELECT id, parent_booking_id, start_at, status, 0 AS depth
  FROM session_bookings
  WHERE id = $1

  UNION ALL

  -- Recursive: find children
  SELECT b.id, b.parent_booking_id, b.start_at, b.status, t.depth + 1
  FROM session_bookings b
  JOIN booking_tree t ON b.parent_booking_id = t.id
)
SELECT * FROM booking_tree ORDER BY start_at;
```

> 💡 Hiếm dùng — Tutor365 combo chỉ 1 cấp.

---

## Slide 7 — Window function: RANK

```sql
-- Top tutor by avg rating
SELECT
  tutor_id, full_name, avg_rating,
  RANK() OVER (ORDER BY avg_rating DESC) AS rank,
  ROW_NUMBER() OVER (ORDER BY avg_rating DESC) AS row_num,
  DENSE_RANK() OVER (ORDER BY avg_rating DESC) AS dense_rank
FROM (
  SELECT
    c.tutor_id,
    u.full_name,
    AVG(r.rating) AS avg_rating
  FROM courses c
  JOIN course_reviews r ON r.course_id = c.id
  JOIN users u ON u.id = c.tutor_id
  WHERE r.is_hidden = false
  GROUP BY c.tutor_id, u.full_name
  HAVING COUNT(r.id) >= 5
) sub;
```

**Differences:**

- `RANK`: 1, 2, 2, 4 (skip 3)
- `DENSE_RANK`: 1, 2, 2, 3
- `ROW_NUMBER`: 1, 2, 3, 4 (always unique)

---

## Slide 8 — PARTITION BY

```sql
-- Top course per subject
SELECT *
FROM (
  SELECT
    c.subject_id,
    c.id, c.title,
    COUNT(e.id) AS enrollments,
    ROW_NUMBER() OVER (
      PARTITION BY c.subject_id
      ORDER BY COUNT(e.id) DESC
    ) AS rank_in_subject
  FROM courses c
  LEFT JOIN course_enrollments e ON e.course_id = c.id
  WHERE c.status = 'published'
  GROUP BY c.subject_id, c.id, c.title
) ranked
WHERE rank_in_subject <= 3
ORDER BY subject_id, rank_in_subject;
```

**Output:** Top 3 course / subject.

---

## Slide 9 — Running total

```sql
-- Running revenue by month
SELECT
  DATE_TRUNC('month', paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS month,
  SUM(total_vnd) AS month_revenue,
  SUM(SUM(total_vnd)) OVER (
    ORDER BY DATE_TRUNC('month', paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
  ) AS running_total
FROM orders
WHERE status = 'paid'
GROUP BY month
ORDER BY month;
```

**Output:**

```
2026-01 | 10M | 10M
2026-02 | 15M | 25M
2026-03 | 18M | 43M
2026-04 | 22M | 65M
```

---

## Slide 10 — Moving average

```sql
-- 7-day moving average enrollments
WITH daily AS (
  SELECT
    DATE_TRUNC('day', enrolled_at) AS day,
    COUNT(*) AS count
  FROM course_enrollments
  WHERE enrolled_at > NOW() - INTERVAL '60 days'
  GROUP BY day
)
SELECT
  day,
  count,
  AVG(count) OVER (
    ORDER BY day
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS moving_avg_7d
FROM daily
ORDER BY day;
```

---

## Slide 11 — LAG / LEAD

### Compare with previous/next row

```sql
-- Month-over-month growth
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', paid_at) AS month,
    SUM(total_vnd) AS revenue
  FROM orders WHERE status = 'paid'
  GROUP BY month
)
SELECT
  month,
  revenue,
  LAG(revenue) OVER (ORDER BY month) AS prev_revenue,
  revenue - LAG(revenue) OVER (ORDER BY month) AS diff,
  ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
    / LAG(revenue) OVER (ORDER BY month), 2) AS growth_pct
FROM monthly
ORDER BY month;
```

---

## Slide 12 — Tutor365 use case: top 3 course / subject

```sql
WITH course_stats AS (
  SELECT
    c.id, c.title, c.subject_id, c.price_vnd,
    COUNT(e.id) AS enrollments,
    AVG(r.rating) AS avg_rating
  FROM courses c
  LEFT JOIN course_enrollments e ON e.course_id = c.id
  LEFT JOIN course_reviews r ON r.course_id = c.id AND r.is_hidden = false
  WHERE c.status = 'published'
  GROUP BY c.id, c.title, c.subject_id, c.price_vnd
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY subject_id
      ORDER BY enrollments DESC, avg_rating DESC NULLS LAST
    ) AS rn
  FROM course_stats
)
SELECT r.*, s.name AS subject_name
FROM ranked r
JOIN subjects s ON s.id = r.subject_id
WHERE rn <= 3
ORDER BY subject_id, rn;
```

---

## Slide 13 — NTILE: percentile bucket

```sql
-- Divide tutors into 4 quartile by revenue
WITH tutor_revenue AS (
  SELECT
    c.tutor_id,
    SUM(e.price_paid_vnd) AS revenue
  FROM courses c
  LEFT JOIN course_enrollments e ON e.course_id = c.id
  WHERE c.status = 'published'
  GROUP BY c.tutor_id
)
SELECT
  tutor_id, revenue,
  NTILE(4) OVER (ORDER BY revenue DESC) AS quartile
FROM tutor_revenue;
```

**Output:** Each tutor get quartile 1-4 (1 = top 25%).

---

## Slide 14 — FIRST_VALUE / LAST_VALUE

```sql
-- Show top course title cho mỗi subject
SELECT DISTINCT
  c.subject_id,
  s.name AS subject_name,
  FIRST_VALUE(c.title) OVER (
    PARTITION BY c.subject_id
    ORDER BY enrollment_count DESC
  ) AS top_course
FROM (
  SELECT subject_id, id, title, COUNT(e.id) AS enrollment_count
  FROM courses c
  LEFT JOIN course_enrollments e ON e.course_id = c.id
  WHERE c.status = 'published'
  GROUP BY subject_id, id, title
) c
JOIN subjects s ON s.id = c.subject_id;
```

---

## Slide 15 — Anti-patterns

```sql
-- ❌ Nested subquery quá nhiều layer
SELECT * FROM (
  SELECT * FROM (
    SELECT * FROM ...
  )
)
-- → CTE chia step rõ ràng

-- ❌ Use both PARTITION BY và GROUP BY confused
-- → Window không thay GROUP BY, dùng riêng

-- ❌ ROW_NUMBER không ORDER BY → indeterministic
ROW_NUMBER() OVER ()   -- ❌
ROW_NUMBER() OVER (ORDER BY id)   -- ✅

-- ❌ Recursive CTE without LIMIT/STOP
-- → infinite loop

-- ❌ CTE for every simple subquery
-- → Overkill, prefer direct subquery khi đơn giản
```

---

## Slide 16 — Performance: CTE materialization

```sql
-- PG 12+: CTE inline by default (planner optimizes)
WITH cte AS NOT MATERIALIZED ( ... )
-- → can be optimized into main query

WITH cte AS MATERIALIZED ( ... )
-- → force materialize (compute once)
```

> 💡 Default NOT MATERIALIZED tốt hơn cho hầu hết case.

---

## Slide 17 — Bài tập thực hành

### 🎯 CTE + window

**Bài 1:** Top 3 course per subject (slide 12).

**Bài 2:** Running total revenue per month.

**Bài 3:** 7-day moving avg enrollments.

**Bài 4:** Month-over-month growth %.

**Bài 5:** Tutor quartile by revenue.

**Bài 6:** Rank tutor by avg rating với min 5 reviews.

**Bài 7:** First/last booking each tutor per month.

**Bài 8:** Bonus: Recursive CTE traverse combo booking children.

---

## Slide 18 — Section 18 hoàn tất

### SQL Mastery done

✅ V52 — Professional SELECT
✅ V53 — JOINs
✅ V54 — GROUP BY + Aggregations
✅ V55 — CTE + Window functions

**Section 19 — Prisma + Migrations** (3 video):

- V56: Prisma setup + schema-from-ERD
- V57: Seeders
- V58: Migrate in-memory → Prisma

> 🚀 Sang Section 19 — apply ORM.

---

## Slide 19 — Edge cases window

| Case | Behavior |
|------|----------|
| Empty result set | Window functions return no rows |
| ORDER BY ties trong RANK | Same rank, skip next |
| ORDER BY ties trong ROW_NUMBER | Implementation order (unstable) |
| Window across NULL | NULLs treated as smallest by default |
| LAG default value | `LAG(col, 1, default_val)` |

---

## Slide 20 — Tổng kết Video 55

### Bạn vừa học

- ✅ CTE với `WITH` cho readability
- ✅ CTE chained sequential
- ✅ Recursive CTE
- ✅ Window functions: RANK, ROW_NUMBER, DENSE_RANK
- ✅ PARTITION BY for sub-grouping
- ✅ Running total qua SUM OVER
- ✅ Moving average với ROWS BETWEEN
- ✅ LAG / LEAD comparison
- ✅ NTILE percentile
- ✅ FIRST_VALUE / LAST_VALUE
- ✅ Materialization options

> 💪 SQL nâng cao = code clean + powerful

---

<!-- _class: lead -->

# Tiếp theo: Video 56

## Prisma Setup + Schema-from-ERD

Define Prisma schema từ ERD đã có. `prisma migrate dev` workflow.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 56 🚀

> *"Window functions: SQL's quiet superpower."*
