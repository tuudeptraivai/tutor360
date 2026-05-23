---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 63: EXCLUDE Constraint Chống Double-Booking'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# EXCLUDE Constraint
# Chống Double-Booking

### Khóa 2-3 — Video 63

**tsrange · GiST · DB enforced**

> 1 constraint = 0 race condition

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **EXCLUDE constraint** mechanics
- ✅ Tạo constraint cho Tutor365 chống Tutor double-book
- ✅ Test concurrent insert overlap → DB reject
- ✅ Combine với booking_range generated column
- ✅ Handle P2002 / EXCLUDE error trong app
- ✅ Same pattern for Student double-book

> 🎯 Cuối video: 1000 concurrent assigns → 0 double-book

---

## Slide 3 — Recap problem

### V30 eligibility check không đủ

```ts
async assign(bookingId, tutorId) {
  // 1. Check eligibility (read)
  const eligible = await this.eligibleTutors(...);
  if (!eligible.includes(tutorId)) throw;

  // 2. Window between check + write
  // ANOTHER Hanah could assign cùng tutor cùng giờ

  // 3. Update
  await prisma.sessionBooking.update({ tutorId, status: 'assigned' });
}
```

**Race condition window** — 2 admin assign cùng tutor cùng giờ.

**EXCLUDE constraint:** DB ngăn ngay tại commit.

---

## Slide 4 — EXCLUDE constraint syntax

```sql
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

**Reads:** "No 2 rows can have `tutor_id =` and overlapping range".

**Yêu cầu extensions:**

```sql
CREATE EXTENSION btree_gist;
```

---

## Slide 5 — Why GiST?

```
EXCLUDE constraint indexed by GiST.

GiST supports:
  - Equality (=)
  - Range overlap (&&)
  - Geospatial
  - ...

B-tree only supports equality + range.
btree_gist extension adds B-tree compat (for =).
```

---

## Slide 6 — Generated column for range

```sql
ALTER TABLE session_bookings
  ADD COLUMN booking_range tsrange
  GENERATED ALWAYS AS (
    tsrange(start_at, start_at + (duration_hr || ' hours')::interval, '[]')
  ) STORED;
```

**Refine constraint:**

```sql
ALTER TABLE session_bookings
  ADD CONSTRAINT no_tutor_overlap
  EXCLUDE USING gist (tutor_id WITH =, booking_range WITH &&)
  WHERE (
    tutor_id IS NOT NULL AND
    status IN ('assigned', 'confirmed', 'in_progress')
  );
```

> 💡 Generated column auto-compute → constraint check fast.

---

## Slide 7 — Test constraint

```sql
-- Insert booking 1
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b1', 't1', '2026-05-25 09:00', 1.5, 'assigned', ...);
-- OK

-- Insert booking 2 — same tutor + overlapping time
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b2', 't1', '2026-05-25 10:00', 1.5, 'assigned', ...);
-- ERROR: conflicting key value violates exclusion constraint "no_tutor_overlap"
-- DETAIL: Key (tutor_id, booking_range)=(t1, ["...09:00", "...10:30"]) conflicts with...

-- Different tutor: OK
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b3', 't2', '2026-05-25 09:00', 1.5, 'assigned', ...);
-- OK

-- Cancelled status: OK (WHERE filter)
INSERT INTO session_bookings (id, tutor_id, start_at, duration_hr, status, ...)
VALUES ('b4', 't1', '2026-05-25 10:00', 1.5, 'cancelled', ...);
-- OK (not in 'assigned/confirmed/in_progress')
```

---

## Slide 8 — Handle in app

```ts
async assign(bookingId, tutorId, adminId) {
  try {
    await this.prisma.$transaction(async (tx) => {
      // ... eligibility check
      await tx.sessionBooking.update({
        where: { id: bookingId },
        data: { tutorId, status: 'assigned' },
      });
    });
  } catch (e) {
    if (e.code === 'P2010' && e.message.includes('no_tutor_overlap')) {
      throw new ConflictException(
        'Tutor đã có booking khác trùng giờ. Vui lòng chọn Tutor khác.'
      );
    }
    throw e;
  }
}
```

---

## Slide 9 — Status transition trigger

### Khi confirm booking → check constraint

```
Booking đang 'pending_assign' (constraint skip vì WHERE)
Hanah assign → status='assigned' → constraint ACTIVE for this row
  → DB checks overlap với other 'assigned' bookings of this tutor
  → Reject if overlap
```

**Test:**

```sql
-- Two bookings created (both pending_assign — no overlap check)
INSERT INTO session_bookings (id, status, ...) VALUES
  ('b1', 'pending_assign', ...),
  ('b2', 'pending_assign', ...);
-- OK both

-- Assign first
UPDATE session_bookings SET tutor_id = 't1', status = 'assigned' WHERE id = 'b1';
-- OK

-- Assign second with same tutor + overlap
UPDATE session_bookings SET tutor_id = 't1', status = 'assigned' WHERE id = 'b2';
-- ERROR
```

---

## Slide 10 — Concurrent assign test

```bash
# Setup: 2 booking pending_assign cùng overlap range
# Run 2 concurrent assign cùng tutor

# Process A
curl -X POST /v1/admin/bookings/b1/assign -d '{"tutorId":"t1"}' &

# Process B (simultaneous)
curl -X POST /v1/admin/bookings/b2/assign -d '{"tutorId":"t1"}' &

wait

# Outcome:
# - 1 success (200)
# - 1 failure (409 — DB EXCLUDE rejected)
```

→ DB level prevents race.

---

## Slide 11 — Student double-book

### Same pattern khác direction

```sql
-- Prevent Student book 2 session overlap
ALTER TABLE session_bookings
  ADD CONSTRAINT no_student_overlap
  EXCLUDE USING gist (student_id WITH =, booking_range WITH &&)
  WHERE (
    status IN ('created', 'pending_assign', 'assigned', 'confirmed', 'in_progress')
  );
```

**Handle in app:**

```ts
async createBooking(input, studentId) {
  try {
    await prisma.sessionBooking.create(/* ... */);
  } catch (e) {
    if (e.message.includes('no_student_overlap')) {
      throw new ConflictException('Bạn đã có booking khác cùng giờ');
    }
    throw e;
  }
}
```

---

## Slide 12 — Migration cho EXCLUDE

```bash
prisma migrate dev --create-only --name add_no_double_book
```

```sql
-- prisma/migrations/.../migration.sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generated column
ALTER TABLE session_bookings
  ADD COLUMN booking_range tsrange
  GENERATED ALWAYS AS (
    tsrange(start_at, start_at + (duration_hr || ' hours')::interval, '[]')
  ) STORED;

-- Tutor exclusion
ALTER TABLE session_bookings
  ADD CONSTRAINT no_tutor_overlap
  EXCLUDE USING gist (tutor_id WITH =, booking_range WITH &&)
  WHERE (
    tutor_id IS NOT NULL AND
    status IN ('assigned', 'confirmed', 'in_progress')
  );

-- Student exclusion
ALTER TABLE session_bookings
  ADD CONSTRAINT no_student_overlap
  EXCLUDE USING gist (student_id WITH =, booking_range WITH &&)
  WHERE (
    status IN ('created', 'pending_assign', 'assigned', 'confirmed', 'in_progress')
  );
```

```bash
prisma migrate dev
```

---

## Slide 13 — Performance impact

```sql
EXPLAIN ANALYZE
INSERT INTO session_bookings (...) VALUES (...);

-- With EXCLUDE constraint:
Insert ...
  →  Bitmap Index Scan on idx_no_tutor_overlap_gist
  Execution Time: 2.5 ms
```

**Trade-off:**

- ⚠️ Insert/Update slightly slower (index lookup)
- ✅ Worth it: DB never has invalid state

---

## Slide 14 — Constraint vs trigger

### Why EXCLUDE not trigger?

```sql
-- Trigger alternative
CREATE TRIGGER chk_no_overlap
BEFORE INSERT ON session_bookings
FOR EACH ROW EXECUTE FUNCTION check_no_overlap();

CREATE FUNCTION check_no_overlap() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM session_bookings
    WHERE tutor_id = NEW.tutor_id
      AND status IN ('assigned', ...)
      AND tsrange(start_at, ...) && tsrange(NEW.start_at, ...)
  ) THEN
    RAISE EXCEPTION 'overlap';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Trade-off:**

| EXCLUDE | Trigger |
|---------|---------|
| Indexed (fast) | Sequential check (slow) |
| Built-in (clean) | Custom code |
| Atomic | Race window in IF EXIST + INSERT |

→ EXCLUDE much better.

---

## Slide 15 — Cancel + status change

### What when assigning → cancelled?

```
Booking b1 'assigned' for tutor t1 09-10:30
Hanah cancel b1: status='cancelled'
  → Constraint WHERE doesn't match → row exempt
  → Free up slot

Now another booking b2 09-11 can be assigned t1.
```

---

## Slide 16 — Anti-patterns

```sql
-- ❌ No WHERE clause
EXCLUDE USING gist (...)   -- without WHERE
-- → Applies to ALL rows including cancelled → block reuse slot

-- ❌ Generated column not STORED
GENERATED ALWAYS AS (...) -- VIRTUAL — recomputed every query
-- → STORED → materialize, fast

-- ❌ Forget btree_gist
-- → Error "data type uuid has no default operator class for access method gist"

-- ❌ Combine equality + range in B-tree
-- → Doesn't work — need GiST for range
```

---

## Slide 17 — Bài tập thực hành

### 🎯 EXCLUDE end-to-end

**Bài 1:** Migration add btree_gist + booking_range + 2 EXCLUDE constraints.

**Bài 2:** Test insert overlap → DB reject.

**Bài 3:** Test 2 concurrent assign (slide 10).

**Bài 4:** Verify cancelled booking releases slot.

**Bài 5:** Handle ConstraintError → ConflictException in service.

**Bài 6:** Measure EXPLAIN — verify GiST index used.

**Bài 7:** Bonus: same pattern for tutor_availability overlap.

---

## Slide 18 — Section 21 hoàn tất

### Concurrency safety ready

✅ V62 — ACID + isolation
✅ V63 — EXCLUDE constraint

**Section 22 — Final Review** (2 video):

- V64: API.md auto-gen + ERD recap
- V65: Demo E2E

> 🚀 Sang Section cuối — wrap-up + showcase.

---

## Slide 19 — Real-world battle test

```
Production scenario:
  - 100 admin Hanah operate Tutor365
  - 1000 bookings pending_assign
  - 50 tutors actively assigned
  - Race condition probability: high

Without EXCLUDE: bugs eventually
With EXCLUDE: 0 double-book guaranteed

Cost: 1 migration + 1 try/catch handler in code.
```

---

## Slide 20 — Tổng kết Video 63

### Bạn vừa học

- ✅ EXCLUDE constraint syntax + semantics
- ✅ GiST + btree_gist
- ✅ Generated column for range
- ✅ Tutor overlap + Student overlap constraints
- ✅ WHERE clause cho selective enforcement
- ✅ App-level error handling
- ✅ Compare with trigger alternative
- ✅ Migration via raw SQL
- ✅ Performance trade-off acceptable
- ✅ DB-level guarantee > app-level check

> 💪 EXCLUDE = PG signature feature, perfect for Tutor365 booking

---

<!-- _class: lead -->

# Tiếp theo: Video 64

## Final Review — API.md + ERD Recap

Generate API.md từ Swagger, ERD recap visualize, pnpm verify exit 0.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 64 🚀

> *"EXCLUDE: the database that says 'no' before code can."*
