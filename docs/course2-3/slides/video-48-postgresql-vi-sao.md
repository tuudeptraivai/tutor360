---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 48: Vì Sao PostgreSQL Cho Tutor365'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Vì Sao PostgreSQL
# Cho Tutor365?

### Khóa 2-3 — Video 48

**JSONB · tsrange · Partial index · Exclusion constraint**

> Tutor365 chọn PG không phải vì popular — vì feature hợp use case

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **trade-off SQL vs NoSQL** cho Tutor365
- ✅ 5 feature PG quan trọng cho dự án
- ✅ Phân biệt **PG vs MySQL** cho transaction-heavy app
- ✅ Setup PG 16 + extension cần dùng
- ✅ Connection pool best practices
- ✅ Backup + restore basics

> 🎯 Cuối video: bạn có PG 16 chạy local + biết vì sao mỗi feature

---

## Slide 3 — SQL vs NoSQL cho Tutor365

| Aspect | SQL (PG) | NoSQL (Mongo) |
|--------|----------|---------------|
| Schema | Strict | Flexible |
| Transactions | ACID | Eventual |
| Joins | Native | App-level |
| Aggregation | SQL | Aggregation pipeline |
| Constraint enforce | DB-level | App-level |
| Multi-table consistency | Strong | Weak |

**Tutor365 use case:**

- Money flow: cần ACID
- Booking + tutor + availability: nhiều join
- Constraint: no double-book, no duplicate enrollment
- Aggregate: payout calculation

→ **PostgreSQL** strict ACID match perfect.

---

## Slide 4 — Vì sao PG thay MySQL?

### Features Tutor365 dùng

| Feature | PG | MySQL |
|---------|-----|------|
| JSONB | ✅ Indexed, queryable | ⚠️ JSON loose typing |
| `tsrange` (time range) | ✅ Native | ❌ |
| Partial index | ✅ | ❌ |
| Exclusion constraint | ✅ (key cho no double-book!) | ❌ |
| Window functions | ✅ Full | ⚠️ Partial (8.0+) |
| CTE recursion | ✅ | ⚠️ Partial |
| Materialized view | ✅ | ❌ |
| Concurrent index build | ✅ | ❌ |
| Native UUID | ✅ | ⚠️ TEXT/BINARY |

> 💡 PG = featureful, dependable, free.

---

## Slide 5 — JSONB use case

### Tutor365 dùng đâu?

```sql
-- audit_logs metadata
{
  metadata: {
    reason: 'Spam khoá học',
    prevStatus: 'active',
    ip: '203.0.113.1',
  }
}

-- payments raw IPN payload
{
  rawIpnPayload: {
    vnp_TmnCode: '...',
    vnp_Amount: '...',
    ...
  }
}

-- pricing_rules
{
  value: '[1, 2]'   // numMonths options
}
```

**Query trên JSONB:**

```sql
SELECT * FROM audit_logs WHERE metadata->>'reason' LIKE '%Spam%';

CREATE INDEX idx_audit_metadata_gin ON audit_logs USING gin (metadata);
```

---

## Slide 6 — tsrange — Time range type

### Tutor365: booking overlap detection

```sql
-- Booking range type
SELECT tsrange('2026-05-25 09:00', '2026-05-25 11:00', '[]');

-- Operators
&&    -- overlap
@>    -- contains
<@    -- contained by
=     -- equal

-- Use case (V30 eligible filter)
SELECT * FROM session_bookings b
WHERE tsrange(b.start_at, b.start_at + b.duration_hr * INTERVAL '1 hour', '[]')
   && tsrange(:bookStart, :bookStart + :durationHr * INTERVAL '1 hour', '[]');
```

> 💡 Không có ở MySQL — phải tự code overlap logic ở app level.

---

## Slide 7 — Partial index

### Index chỉ subset row

```sql
-- Tutor365: chỉ cần index course đã published
CREATE INDEX idx_courses_subject_status
  ON courses (subject_id)
  WHERE status = 'published';

-- Index nhỏ hơn → query nhanh hơn cho "list published"
SELECT * FROM courses
WHERE subject_id = ? AND status = 'published';
-- → Planner dùng partial index, skip draft/rejected/archived
```

**Khác MySQL:** MySQL không có partial index → index full table → tốn space + slow.

---

## Slide 8 — Exclusion constraint

### Tutor365: chống double-book Tutor

```sql
-- session_bookings có constraint:
ALTER TABLE session_bookings
  ADD CONSTRAINT no_tutor_double_book
  EXCLUDE USING gist (
    tutor_id WITH =,
    tsrange(start_at, start_at + duration_hr * INTERVAL '1 hour', '[]') WITH &&
  )
  WHERE (tutor_id IS NOT NULL AND status IN ('assigned', 'confirmed', 'in_progress'));
```

**Effect:** DB rejects INSERT nếu Tutor đã có booking overlap.

> 💡 Đây là **feature SIGNATURE** của PG cho Tutor365. Section 21 deep dive.

---

## Slide 9 — Window functions

### Tutor365: ranking Tutor theo rating

```sql
SELECT
  tutor_id, full_name,
  AVG(rating) as avg_rating,
  RANK() OVER (ORDER BY AVG(rating) DESC) as rank
FROM course_reviews r
JOIN courses c ON c.id = r.course_id
JOIN users u ON u.id = c.tutor_id
WHERE r.is_hidden = false
GROUP BY tutor_id, full_name
ORDER BY rank;
```

**Other use cases:**

- Running total revenue per month
- Top course per subject
- Tutor session count percentile

→ Section 18 detail.

---

## Slide 10 — Materialized view

### Tutor365: cache stats

```sql
-- Refresh every hour
CREATE MATERIALIZED VIEW tutor_stats AS
SELECT
  c.tutor_id,
  COUNT(DISTINCT c.id) as course_count,
  AVG(r.rating) as avg_rating,
  COUNT(DISTINCT r.id) as review_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') as session_completed
FROM users u
LEFT JOIN courses c ON c.tutor_id = u.id AND c.status = 'published'
LEFT JOIN course_reviews r ON r.course_id = c.id AND r.is_hidden = false
LEFT JOIN session_bookings b ON b.tutor_id = u.id
WHERE u.role = 'tutor'
GROUP BY c.tutor_id;

-- Refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY tutor_stats;
```

> 💡 Section 20 detail. MVP có thể skip — Tutor365 dùng app-level cache đủ.

---

## Slide 11 — Setup PG 16 với Docker

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: tutor365
      POSTGRES_PASSWORD: tutor365
      POSTGRES_DB: tutor365
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tutor365"]
      interval: 5s

volumes:
  pg_data:
```

```bash
docker-compose up -d postgres
psql postgresql://tutor365:tutor365@localhost:5432/tutor365 -c "SELECT version()"
# PostgreSQL 16.x
```

---

## Slide 12 — Extensions cần dùng

```sql
-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigram search (V19 fuzzy search course title)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Btree-gist (for EXCLUDE constraint with tsrange + equality)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Audit triggers (optional)
-- CREATE EXTENSION IF NOT EXISTS pgaudit;
```

> 💡 Tutor365 dùng `uuid-ossp` + `pg_trgm` + `btree_gist` (cho exclusion).

---

## Slide 13 — Connection pool

### Prisma connection pool default

```env
DATABASE_URL=postgresql://user:pw@host:5432/db?connection_limit=10&pool_timeout=10
```

| Parameter | Effect | Tutor365 |
|-----------|--------|----------|
| `connection_limit` | Max concurrent connections | 10 (dev), 30 (prod) |
| `pool_timeout` | Wait queue timeout (s) | 10 |
| `connect_timeout` | TCP connect timeout | 10 |

**PG side:**

```conf
# postgresql.conf
max_connections = 100      # default
shared_buffers = 256MB     # 25% RAM dev
```

> 💡 Connection pool too high → PG OOM. Too low → request queue.

---

## Slide 14 — pgAdmin / DBeaver

### GUI để khám phá

- **pgAdmin** — official, web-based
- **DBeaver** — multi-DB, free
- **TablePlus** — paid, fast

```bash
# pgAdmin docker
docker run --name pgadmin -d -p 5050:80 \
  -e PGADMIN_DEFAULT_EMAIL=admin@x.com \
  -e PGADMIN_DEFAULT_PASSWORD=admin \
  dpage/pgadmin4
```

> 💡 Optional — `psql` CLI đủ cho course. GUI nice cho exploration.

---

## Slide 15 — Backup + restore

```bash
# Dump
pg_dump -U tutor365 -h localhost tutor365 > backup.sql
# Or with compression
pg_dump -Fc -U tutor365 tutor365 > backup.dump

# Restore
psql -U tutor365 tutor365 < backup.sql
# Or
pg_restore -U tutor365 -d tutor365 backup.dump

# Production: daily dump + S3 upload
# (C8 deployment khoá riêng)
```

---

## Slide 16 — PG monitoring

### Quick metrics

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Slow queries (running > 1s)
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > INTERVAL '1 second';

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;   -- never used
```

---

## Slide 17 — Vì sao not Mongo/DynamoDB?

```
Tutor365 ≠ social network or analytics
Tutor365 = transaction system with money flow

Mongo good for:
  - High write throughput documents (logs, events)
  - Flexible schema (early product iteration)
  
Mongo weakness for Tutor365:
  - Money flow needs multi-doc ACID (Mongo limited)
  - Joins across collections needed (booking ↔ tutor ↔ availability)
  - Exclusion constraint impossible (no double-book)

DynamoDB good for:
  - Single-table design, predictable access pattern
  - Massive scale (millions QPS)

DynamoDB weakness for Tutor365:
  - Complex queries (eligible-tutor filter SQL) khó
  - Aggregate (payout monthly) cần scan
  - No transactions across partitions easily
```

---

## Slide 18 — Section 17 starting

### Bắt đầu nửa thứ 2 của khoá

Sections 17-22 đào sâu DB layer:

✅ V48 — Vì sao PostgreSQL (đây)
✅ V49 — Tables + ERD 19 bảng walkthrough
✅ V50 — Constraints + data integrity
✅ V51 — Keys + indexes basics
✅ Section 18 — SQL Mastery (4 video)
✅ Section 19 — Prisma (3 video)
✅ Section 20 — Indexing optimization (3 video)
✅ Section 21 — Transactions concurrency (2 video)
✅ Section 22 — Final (2 video)

---

## Slide 19 — Bài tập thực hành

### 🎯 Setup PG

**Bài 1:** Setup PG 16 Docker + verify version.

**Bài 2:** Cài 3 extensions (uuid-ossp, pg_trgm, btree_gist).

**Bài 3:** Connect bằng psql + run `SELECT 1`.

**Bài 4:** Run query `SELECT now() AT TIME ZONE 'Asia/Ho_Chi_Minh'`.

**Bài 5:** Test JSONB:
```sql
CREATE TABLE test_json (id SERIAL PRIMARY KEY, data JSONB);
INSERT INTO test_json (data) VALUES ('{"a":1,"b":[1,2]}');
SELECT data->'b' FROM test_json;
```

**Bài 6:** Test tsrange overlap:
```sql
SELECT tsrange('2026-05-25 09:00', '2026-05-25 11:00') &&
       tsrange('2026-05-25 10:00', '2026-05-25 12:00');
-- TRUE
```

---

## Slide 20 — Tổng kết Video 48

### Bạn vừa học

- ✅ SQL vs NoSQL trade-off cho Tutor365
- ✅ 5 feature PG: JSONB, tsrange, partial index, exclusion, window functions
- ✅ Materialized view cho cache
- ✅ Setup PG 16 Docker
- ✅ 3 extensions cần dùng
- ✅ Connection pool Prisma
- ✅ Backup + restore basics
- ✅ Monitoring queries

> 💪 Hiểu vì sao PG = chọn đúng tool cho job

---

<!-- _class: lead -->

# Tiếp theo: Video 49

## Tables + Relationships — ERD 19 Bảng

Walkthrough 19 bảng domain chính của Tutor365 + cardinality.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 49 🚀

> *"The right tool turns hard problems into one-liners."*
