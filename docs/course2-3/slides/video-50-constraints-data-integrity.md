---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 50: Constraints + Data Integrity'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Constraints
# + Data Integrity

### Khóa 2-3 — Video 50

**NOT NULL · CHECK · UNIQUE · EXCLUDE**

> Database = last line of defense

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **DB-level constraint vs app-level validation**
- ✅ Apply NOT NULL, DEFAULT, CHECK
- ✅ UNIQUE + composite unique
- ✅ FK với DEFERRABLE for circular ref
- ✅ EXCLUDE constraint cho **no double-book**
- ✅ When to use trigger

> 🎯 Cuối video: DB từ chối tự nhiên bad data, không cần app check

---

## Slide 3 — Vì sao constraint ở DB, không app?

### Multi-source writers

```
App version 1: validate "price > 0"
App version 2 (forgot): không validate
Script ETL: insert raw data
psql trực tiếp: human error

→ Bad data slip qua app
→ Constraint DB level bảo vệ TẤT CẢ writers
```

**Defense in depth:**

1. Zod schema (FE + BE) — UX feedback nhanh
2. Service validation — business rule
3. **DB constraint** — last line, không bypass được

---

## Slide 4 — NOT NULL + DEFAULT

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verify',
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Best practices:**

- ✅ Mọi semantic-required field → NOT NULL
- ✅ Default cho timestamps + status
- ✅ Default cho boolean flag
- ⚠️ Optional field như `description` cho nullable

---

## Slide 5 — CHECK constraint

### Enforce business rules

```sql
ALTER TABLE users
  ADD CONSTRAINT chk_role CHECK (role IN ('admin', 'tutor', 'student'));

ALTER TABLE users
  ADD CONSTRAINT chk_status CHECK (status IN ('pending_verify', 'active', 'blocked'));

ALTER TABLE courses
  ADD CONSTRAINT chk_price CHECK (price_vnd >= 0 AND price_vnd <= 50_000_000);

ALTER TABLE session_bookings
  ADD CONSTRAINT chk_duration CHECK (duration_hr >= 1.5 AND duration_hr <= 2.0);

ALTER TABLE course_reviews
  ADD CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5);

ALTER TABLE tutor_availability
  ADD CONSTRAINT chk_dow CHECK (day_of_week BETWEEN 0 AND 6);
```

---

## Slide 6 — CHECK với expression

```sql
-- Email format
ALTER TABLE users
  ADD CONSTRAINT chk_email CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$');

-- Phone format (basic)
ALTER TABLE users
  ADD CONSTRAINT chk_phone CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{9,14}$');

-- Slug only lowercase + digits + hyphen
ALTER TABLE courses
  ADD CONSTRAINT chk_slug CHECK (slug ~ '^[a-z0-9-]+$');

-- Time format
ALTER TABLE tutor_availability
  ADD CONSTRAINT chk_time_format CHECK (
    start_time ~ '^[0-9]{2}:[0-9]{2}$' AND
    end_time ~ '^[0-9]{2}:[0-9]{2}$' AND
    start_time < end_time
  );

-- Combo: numMonths in [1, 2]
ALTER TABLE session_bookings
  ADD CONSTRAINT chk_combo_months CHECK (
    recurrence_rule IS NULL OR
    EXTRACT('numMonths' FROM ...) IN (1, 2)
  );
```

---

## Slide 7 — UNIQUE constraint

### Single column

```sql
ALTER TABLE users
  ADD CONSTRAINT uq_email UNIQUE (email);

ALTER TABLE subjects
  ADD CONSTRAINT uq_subject_slug UNIQUE (slug);

ALTER TABLE orders
  ADD CONSTRAINT uq_vnp_txn_ref UNIQUE (vnp_txn_ref);
```

### Composite

```sql
ALTER TABLE course_enrollments
  ADD CONSTRAINT uq_enrollment UNIQUE (course_id, student_id);

ALTER TABLE course_reviews
  ADD CONSTRAINT uq_review UNIQUE (course_id, student_id);

ALTER TABLE tutor_payouts
  ADD CONSTRAINT uq_payout UNIQUE (tutor_id, period_year, period_month);
```

---

## Slide 8 — UNIQUE WHERE (partial unique)

### Unique chỉ với subset

```sql
-- 1 user × 1 active refresh token / device — không enforce
-- Nhưng vnp_TransactionNo unique chỉ khi NOT NULL
CREATE UNIQUE INDEX uq_payment_vnp_tx
  ON payments (vnp_transaction_no)
  WHERE vnp_transaction_no IS NOT NULL;

-- Course slug unique chỉ với non-archived
CREATE UNIQUE INDEX uq_course_slug_active
  ON courses (slug)
  WHERE status != 'archived';
```

---

## Slide 9 — Foreign Key

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY,
  tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  level_id UUID NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
  ...
);

-- Composite FK (rare)
ALTER TABLE tutor_subjects
  ADD FOREIGN KEY (tutor_id) REFERENCES tutor_profiles(user_id);
```

**Default ON DELETE = NO ACTION** (deferred check at end of transaction).

---

## Slide 10 — EXCLUDE constraint

### KEY feature cho Tutor365

```sql
-- Chống Tutor double-book
ALTER TABLE session_bookings
  ADD CONSTRAINT no_tutor_overlap
  EXCLUDE USING gist (
    tutor_id WITH =,
    tsrange(start_at, start_at + duration_hr * INTERVAL '1 hour', '[]') WITH &&
  )
  WHERE (
    tutor_id IS NOT NULL AND
    status IN ('assigned', 'confirmed', 'in_progress')
  );
```

**Đảm bảo:** DB từ chối INSERT/UPDATE nếu tạo overlap.

**Yêu cầu:**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

> 💡 Section 21 deep dive — pattern signature của PG.

---

## Slide 11 — Test EXCLUDE constraint

```sql
-- Setup
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b1', 'tutor-1', '2026-05-25 09:00', 1.5, 'assigned', ...);

-- Try insert overlapping
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b2', 'tutor-1', '2026-05-25 10:00', 1.5, 'assigned', ...);
-- ERROR: conflicting key value violates exclusion constraint "no_tutor_overlap"

-- Different tutor: OK
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b3', 'tutor-2', '2026-05-25 09:00', 1.5, 'assigned', ...);
-- OK

-- Cancelled: OK (filtered by WHERE)
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b4', 'tutor-1', '2026-05-25 10:00', 1.5, 'cancelled', ...);
-- OK
```

---

## Slide 12 — DEFERRABLE FK

### Circular reference

```sql
-- Hypothetical: parent_booking_id references session_bookings.id
-- but cũng có column "next_session_id"
ALTER TABLE session_bookings
  ADD COLUMN next_session_id UUID REFERENCES session_bookings(id)
  DEFERRABLE INITIALLY DEFERRED;

-- Allow circular ref trong transaction
BEGIN;
  INSERT INTO session_bookings (id, next_session_id) VALUES ('b1', 'b2');
  INSERT INTO session_bookings (id, next_session_id) VALUES ('b2', 'b1');
COMMIT;
-- OK because deferred check at commit
```

> 💡 Tutor365 không cần — chỉ self-ref đơn giản qua `parent_booking_id`.

---

## Slide 13 — Trigger cho audit timestamps

```sql
CREATE OR REPLACE FUNCTION trigger_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply
CREATE TRIGGER tg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_update_updated_at();

CREATE TRIGGER tg_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION trigger_update_updated_at();

-- ... cho mọi table có updated_at
```

> 💡 Prisma `@updatedAt` cũng làm same effect ở app layer. DB trigger là backup nếu raw SQL.

---

## Slide 14 — Generated column

### Tutor365 use case

```sql
-- Pre-compute booking range cho GiST index
ALTER TABLE session_bookings
  ADD COLUMN booking_range tsrange
  GENERATED ALWAYS AS (
    tsrange(start_at, start_at + duration_hr * INTERVAL '1 hour', '[]')
  ) STORED;

CREATE INDEX idx_booking_range_gist
  ON session_bookings USING gist (booking_range)
  WHERE status IN ('assigned', 'confirmed', 'in_progress');
```

**Lợi ích:**

- ✅ Auto-compute mỗi INSERT/UPDATE
- ✅ Indexable
- ✅ Query đơn giản hơn

---

## Slide 15 — Sequence không dùng cho PK

### Vì sao UUID > SERIAL?

```sql
-- ❌ id SERIAL
-- → predictable: 1, 2, 3, ...
-- → user1 có order 1, user2 có order 2 → guess được scale

-- ✅ id UUID
-- → unguessable
-- → distributed-safe
-- → 122 bit entropy
```

**Tutor365 dùng UUID v4 cho tất cả PK.**

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- Hoặc Prisma: @id @default(uuid())
```

---

## Slide 16 — Domain types (advanced)

```sql
-- Custom type
CREATE DOMAIN positive_money AS INTEGER CHECK (VALUE >= 0);

CREATE TABLE courses (
  ...
  price_vnd positive_money NOT NULL,
);

-- Type-safe trong code (Prisma sẽ map INTEGER → number)
```

> 💡 Optional. Tutor365 dùng CHECK plain — đủ.

---

## Slide 17 — Validate ở 3 layer

```
Layer 1: Zod schema (FE + BE pipe)
  z.number().int().min(0)
  → Reject sớm với UX message

Layer 2: Service logic
  if (course.status === 'archived') throw ForbiddenException
  → Business rule

Layer 3: DB constraint
  CHECK (price >= 0)
  → Last defense
```

**Defense in depth:**

- App bypass / bug → DB catch
- DB constraint sai → app catch
- 3 layer = redundant by design

---

## Slide 18 — Anti-patterns

```sql
-- ❌ Constraint chỉ ở app
service.ts: if (price < 0) throw;
-- → Forget once → bad data

-- ❌ CHECK trên field thường update
ADD CONSTRAINT chk_started CHECK (status != 'started' OR started_at IS NOT NULL)
-- → Khó migrate, performance penalty

-- ❌ UNIQUE trên TEXT length > 256
UNIQUE (description)   -- TEXT 2000 char
-- → Index size huge

-- ❌ Quên NOT NULL cho FK
tutor_id UUID REFERENCES users(id)   -- nullable?
-- → unless required null business, NOT NULL

-- ❌ Multi-tenant chung table không discriminator
-- → user A xem được data của user B nếu app bug
-- → tenant_id NOT NULL + RLS (advanced)
```

---

## Slide 19 — Bài tập thực hành

### 🎯 Constraints

**Bài 1:** Apply NOT NULL + DEFAULT cho mọi table Tutor365.

**Bài 2:** CHECK constraints:
- users.role IN admin/tutor/student
- courses.price >= 0
- session_bookings.duration_hr 1.5-2.0
- course_reviews.rating 1-5

**Bài 3:** UNIQUE composite cho 5 N:N tables.

**Bài 4:** Setup EXCLUDE constraint chống Tutor double-book.

**Bài 5:** Test EXCLUDE: insert overlap → error.

**Bài 6:** Apply trigger auto-update `updated_at`.

**Bài 7:** Generated column cho `booking_range`.

---

## Slide 20 — Tổng kết Video 50

### Bạn vừa học

- ✅ Constraint = last line defense (DB layer)
- ✅ NOT NULL + DEFAULT
- ✅ CHECK với expression complex
- ✅ UNIQUE single + composite + partial (WHERE)
- ✅ FK với ON DELETE options
- ✅ EXCLUDE constraint (PG signature feature)
- ✅ DEFERRABLE FK cho circular
- ✅ Trigger auto-update timestamps
- ✅ Generated column cho tsrange
- ✅ UUID > SERIAL
- ✅ Defense in depth: Zod → Service → DB

> 💪 DB constraint chuẩn = bad data không slip qua

---

<!-- _class: lead -->

# Tiếp theo: Video 51

## Keys + Indexes Basics

PK, FK, B-tree, GIN, GiST — basics trước Section 20 deep dive.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 51 🚀

> *"Don't trust the app. The database always must."*
