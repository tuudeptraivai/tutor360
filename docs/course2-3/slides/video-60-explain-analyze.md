---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 60: EXPLAIN ANALYZE'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# EXPLAIN ANALYZE
# Đọc Plan

### Khóa 2-3 — Video 60

**Read execution plan · Detect seq scan · Fix**

> Plan đọc được = optimize tay được

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Phân biệt **EXPLAIN** vs **EXPLAIN ANALYZE**
- ✅ Đọc plan: Seq Scan, Index Scan, Bitmap, Hash Join, Nested Loop
- ✅ Hiểu **cost**, **rows estimate**, **actual time**
- ✅ Phát hiện slow operator
- ✅ Tools: pev, depesz, dalibo
- ✅ Common fix patterns

> 🎯 Cuối video: Bạn tự debug query slow trong dev

---

## Slide 3 — EXPLAIN vs EXPLAIN ANALYZE

```sql
-- EXPLAIN: only estimate
EXPLAIN SELECT * FROM courses;

-- EXPLAIN ANALYZE: actually run + measure
EXPLAIN ANALYZE SELECT * FROM courses;

-- EXPLAIN with options
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM courses WHERE status = 'published';
```

**Options:**

- `ANALYZE` — execute query, show actual time
- `BUFFERS` — I/O statistics
- `VERBOSE` — extra details
- `FORMAT JSON | TEXT` — output format

---

## Slide 4 — Anatomy of a plan

```
Hash Join  (cost=15.50..1234.56 rows=200 width=64) (actual time=0.5..23.4 rows=150 loops=1)
   Hash Cond: (c.tutor_id = u.id)
   →  Index Scan using idx_courses_subject on courses c
         Index Cond: (subject_id = '...')
         Filter: (status = 'published')
         (cost=0.42..123.45 rows=300 width=48) (actual time=0.1..2.3 rows=200 loops=1)
   →  Hash
         →  Seq Scan on users u
               (cost=0..5.00 rows=50 width=16) (actual time=0.01..0.05 rows=50 loops=1)

Planning Time: 0.2 ms
Execution Time: 23.5 ms
```

**Read top-down, execute bottom-up.**

---

## Slide 5 — Cost numbers

```
(cost=15.50..1234.56 rows=200 width=64)
       ^      ^         ^         ^
       startup total    estimated rows  bytes/row
```

- **Startup cost** — work before first row returned (sort, hash)
- **Total cost** — total estimated work
- **rows** — planner's row estimate
- **width** — avg bytes per row

**Cost = abstract units** (not seconds). Compare relatively.

---

## Slide 6 — Actual time

```
(actual time=0.5..23.4 rows=150 loops=1)
              ^      ^      ^        ^
              first  last   actual   times executed
```

- **0.5ms first row** — time to first row
- **23.4ms last row** — total time to last row
- **rows=150** — actual rows returned
- **loops=1** — outer node executed 1 time

**Nested loop:** inner runs N times = `loops × inner_time`.

---

## Slide 7 — Compare estimate vs actual

```
Index Scan ... (cost=... rows=300 ...) (actual ... rows=200000 ...)
                              ^^^                       ^^^^^^
                       estimate                  actual MUCH HIGHER
```

**Indicator:** Big mismatch → stats outdated → `ANALYZE` table.

```sql
ANALYZE session_bookings;
-- or just
VACUUM ANALYZE;
```

---

## Slide 8 — Common operators

| Operator | When |
|----------|------|
| **Seq Scan** | No index OR small table |
| **Index Scan** | Index used for lookup |
| **Index Only Scan** | All columns in index (no heap fetch) |
| **Bitmap Index Scan** | Index used + bitmap heap fetch |
| **Hash Join** | Larger sets, equality join |
| **Nested Loop** | Small outer, indexed inner |
| **Merge Join** | Both sets sorted on join key |
| **Sort** | ORDER BY without index |
| **Aggregate** | GROUP BY computation |
| **HashAggregate** | GROUP BY with hash |
| **WindowAgg** | Window functions |

---

## Slide 9 — Seq Scan detection

```sql
EXPLAIN ANALYZE SELECT * FROM session_bookings WHERE tutor_id = 'x';

-- Bad:
Seq Scan on session_bookings
  Filter: tutor_id = 'x'
  Rows Removed by Filter: 99999
  Execution Time: 250 ms

-- Fix: add index
CREATE INDEX idx_booking_tutor ON session_bookings (tutor_id);

-- Good:
Index Scan using idx_booking_tutor on session_bookings
  Index Cond: tutor_id = 'x'
  Execution Time: 0.5 ms
```

---

## Slide 10 — Nested Loop slowness

```
Nested Loop  (cost=... rows=10000 loops=1) (actual time=... rows=10000 loops=1)
  →  Seq Scan on a (10000 rows)
  →  Index Scan on b (loops=10000, time=0.1ms each)

Total: 10000 × 0.1ms = 1000ms = 1 second
```

**Issue:** Nested Loop OK với outer small. With large outer → bad.

**Fix options:**

- Add index on `b` to faster inner lookup
- Or planner should pick Hash Join → SET enable_nestloop = off (test)
- Update stats to give planner better cost estimate

---

## Slide 11 — BUFFERS option

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM courses WHERE status = 'published';

-- Output
Index Scan
  Buffers: shared hit=20 read=100
            ^^^^^^^^^^^^^^^^^^^^^^^
            cache hits + disk reads
```

- `hit` — pages from PG cache (fast)
- `read` — pages from disk (slow)

**High `read`:** Cold cache or data > shared_buffers.

---

## Slide 12 — JSON format for tools

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT ...;
```

**Visualize:**

- https://explain.dalibo.com/
- https://explain.depesz.com/
- https://tatiyants.com/pev/

→ Paste JSON, get visualization.

---

## Slide 13 — Stat collection

```sql
-- Auto-stats by autovacuum
SHOW autovacuum;   -- on

-- Manually ANALYZE
ANALYZE courses;          -- entire table
ANALYZE courses (status);  -- specific column

-- Re-analyze after huge insert
INSERT INTO courses VALUES ... (1M rows);
ANALYZE courses;
```

> 💡 Stats outdated → planner picks wrong plan.

---

## Slide 14 — Tutor365 query debug session

```sql
-- Slow query
EXPLAIN ANALYZE
SELECT * FROM session_bookings b
JOIN users s ON s.id = b.student_id
JOIN users t ON t.id = b.tutor_id
WHERE b.status = 'confirmed' AND b.start_at > NOW();

-- Plan:
Hash Join  (actual time=15.2..123.4 rows=500 loops=1)
  →  Seq Scan on session_bookings b
       Filter: status = 'confirmed' AND start_at > NOW()
       Rows Removed: 50000
       Actual time=12.3..56.7
  →  Hash → Seq Scan on users

-- Diagnosis: seq scan on bookings (no useful index)
-- Fix:
CREATE INDEX idx_booking_status_startAt
  ON session_bookings (status, start_at)
  WHERE status IN ('confirmed', 'in_progress');

-- Re-run EXPLAIN
Hash Join  (actual time=2.5..23.4 rows=500 loops=1)
  →  Index Scan using idx_booking_status_startAt on b
       Index Cond: status = 'confirmed' AND start_at > NOW()
       Actual time=0.5..6.7
```

→ 5x speedup.

---

## Slide 15 — Tools comparison

| Tool | Use |
|------|-----|
| `psql \timing on` | Time each query |
| `EXPLAIN` | Estimate only |
| `EXPLAIN ANALYZE` | Estimate + actual |
| `EXPLAIN ANALYZE BUFFERS` | + I/O stats |
| `auto_explain` extension | Log slow queries automatically |
| pg_stat_statements | Aggregate query stats |
| pgBadger | Log analyzer |

---

## Slide 16 — auto_explain log slow query

```sql
-- postgresql.conf
shared_preload_libraries = 'auto_explain'
auto_explain.log_min_duration = '500ms'   -- log queries > 500ms
auto_explain.log_analyze = on
auto_explain.log_buffers = on
```

```bash
# Restart PG
# Slow queries appear in PG log với full plan
tail -f /var/log/postgresql/*.log
```

> 💡 Tutor365 production should enable. Dev can use directly.

---

## Slide 17 — pg_stat_statements

```sql
-- Enable
CREATE EXTENSION pg_stat_statements;

-- Top 10 slowest queries
SELECT
  substring(query, 1, 100) AS query,
  calls,
  total_exec_time,
  mean_exec_time,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

→ Identify aggregate slowest, not just one-off.

---

## Slide 18 — Anti-patterns trong query

```sql
-- ❌ Function on indexed column → bypass index
WHERE LOWER(email) = 'x@y.com'   -- nếu index (email) → not used
-- Fix: functional index LOWER(email) hoặc store lower copy

-- ❌ OR with mixed columns → seq scan
WHERE a = 1 OR b = 2
-- → 2 indexes can't combine well
-- Fix: UNION

-- ❌ Implicit cast → bypass index
WHERE id = 123   -- if id is UUID, planner casts → slow
-- Fix: WHERE id = '...'::uuid

-- ❌ LIKE '%X%' → seq scan
-- Fix: pg_trgm
```

---

## Slide 19 — Bài tập thực hành

### 🎯 EXPLAIN debug

**Bài 1:** Run EXPLAIN ANALYZE 5 queries trong Tutor365.

**Bài 2:** Identify queries với Seq Scan + fix với index.

**Bài 3:** Test với BUFFERS — check shared hit ratio.

**Bài 4:** Compare estimate vs actual rows; ANALYZE table nếu skewed.

**Bài 5:** Enable auto_explain + observe slow query log.

**Bài 6:** Visualize plan with explain.dalibo.com.

**Bài 7:** Bonus: pg_stat_statements top 10 slow queries.

---

## Slide 20 — Tổng kết Video 60

### Bạn vừa học

- ✅ EXPLAIN vs EXPLAIN ANALYZE
- ✅ Cost, rows estimate, actual time đọc
- ✅ Operators: Seq, Index, Bitmap, Hash, Nested Loop
- ✅ Detect Seq Scan → add index
- ✅ Nested Loop slowness pattern
- ✅ BUFFERS hit vs read
- ✅ JSON format + visualize tools
- ✅ Auto_explain log slow queries
- ✅ pg_stat_statements aggregate
- ✅ Function-on-column bypass

> 💪 Plan đọc được = optimize có target

---

<!-- _class: lead -->

# Tiếp theo: Video 61

## Partial + Expression Index

`WHERE status='published'` index + functional `LOWER(email)`.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 61 🚀

> *"Read the plan. Trust it less than you think."*
