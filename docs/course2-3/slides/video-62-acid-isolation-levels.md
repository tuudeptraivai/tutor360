---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 62: ACID + Isolation Levels'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# ACID + Isolation
# Levels

### Khóa 2-3 — Video 62

**READ COMMITTED · SERIALIZABLE · Retry**

> Concurrency safety = bug-free production

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **ACID** properties
- ✅ 4 isolation levels SQL standard
- ✅ Phenomena: dirty read, non-repeatable, phantom
- ✅ Default PG = READ COMMITTED
- ✅ Khi nào upgrade SERIALIZABLE
- ✅ Retry logic cho serialization failure
- ✅ Apply Prisma `$transaction`

> 🎯 Cuối video: pick đúng isolation cho mỗi flow Tutor365

---

## Slide 3 — ACID

| | Meaning | Tutor365 example |
|--|---------|------------------|
| **A**tomicity | All or nothing | order + payment + enrollment in 1 tx |
| **C**onsistency | Constraints valid | EXCLUDE no double-book |
| **I**solation | Concurrent tx don't interfere | 2 admin assign cùng booking |
| **D**urability | Committed = persisted | After commit, crash safe |

---

## Slide 4 — 4 isolation levels

| Level | Dirty Read | Non-repeatable | Phantom | Serialization |
|-------|------------|----------------|---------|---------------|
| READ UNCOMMITTED | ⚠️ Possible | ⚠️ | ⚠️ | ⚠️ |
| **READ COMMITTED** (PG default) | ✅ Prevented | ⚠️ Possible | ⚠️ | ⚠️ |
| REPEATABLE READ (PG = snapshot) | ✅ | ✅ Prevented | ⚠️ | ⚠️ |
| **SERIALIZABLE** | ✅ | ✅ | ✅ | ✅ |

> 💡 PG: READ UNCOMMITTED actually = READ COMMITTED. REPEATABLE READ = snapshot isolation.

---

## Slide 5 — Read phenomena examples

```
Dirty read (READ UNCOMMITTED only):
  TxA: UPDATE balance = 100 (not committed)
  TxB: SELECT balance → reads 100 (dirty!)
  TxA: ROLLBACK
  → TxB read uncommitted change

Non-repeatable read:
  TxA: SELECT balance → 50
  TxB: UPDATE balance = 100, COMMIT
  TxA: SELECT balance → 100 (changed!)
  → Same query, different result

Phantom read:
  TxA: SELECT * FROM orders WHERE total > 100 → 5 rows
  TxB: INSERT new order total = 200, COMMIT
  TxA: SELECT * ... WHERE total > 100 → 6 rows (phantom!)
```

---

## Slide 6 — Default READ COMMITTED

```sql
BEGIN;
SELECT * FROM orders WHERE id = 'x';
-- can see committed changes from other txs
SELECT * FROM orders WHERE id = 'x';   -- may differ!
COMMIT;
```

**Tutor365 default ok cho hầu hết flows:**

- Read-only queries
- Simple updates (single row)
- Idempotent operations

---

## Slide 7 — When to upgrade isolation

### Need SERIALIZABLE / REPEATABLE READ

```
Scenario: Apply commission % rule update

TxA: SELECT commission_percent → 20
TxB: UPDATE commission_percent = 25, COMMIT
TxA: based on 20, compute payout
TxA: COMMIT (uses stale value!)

→ Want REPEATABLE READ to lock value within tx
```

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- ... tx uses snapshot
COMMIT;
```

---

## Slide 8 — SERIALIZABLE in Prisma

```ts
await prisma.$transaction(
  async (tx) => {
    // ... operations
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000,
    timeout: 10000,
  },
);
```

**Caveat:** Serializable failures (P2034) need retry.

---

## Slide 9 — Serialization failure retry

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e.code === 'P2034' && attempt < maxAttempts) {
        // Serialization failure — backoff and retry
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Max retries reached');
}

// Usage
await withRetry(async () => {
  return prisma.$transaction(/* ... */, {
    isolationLevel: 'Serializable',
  });
});
```

---

## Slide 10 — Tutor365 transaction examples

### V21 markPaid

```ts
async markPaid(orderId, meta) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Read order
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order.status === 'paid') return order;   // idempotent

    // 2. Update order
    await tx.order.update({
      where: { id: orderId, status: 'pending' },   // optimistic check
      data: { status: 'paid', paidAt: new Date() },
    });

    // 3. Create payment
    await tx.payment.create({ /* ... */ });

    // 4. Create enrollment (or update booking)
    if (order.type === 'course') {
      await tx.courseEnrollment.create({ /* ... */ });
    }
  });
  // READ COMMITTED default — OK vì check status='pending'
}
```

---

## Slide 11 — Optimistic concurrency

### Use `where: { status: 'pending' }` trong UPDATE

```ts
// TxA: SELECT status → 'pending', want update to 'paid'
// TxB: SELECT status → 'pending', also wants update

// Without optimistic check:
update where { id }   // both succeed, status overwrites

// With optimistic check:
update where { id, status: 'pending' }
// TxA wins → status = 'paid'
// TxB updateMany count = 0 (no row matched 'pending')
// TxB knows it lost → handle gracefully
```

```ts
const { count } = await prisma.order.updateMany({
  where: { id, status: 'pending' },
  data: { status: 'paid' },
});
if (count === 0) {
  // Lost race — retry or skip
}
```

---

## Slide 12 — Pessimistic locking

### `SELECT FOR UPDATE`

```ts
await prisma.$transaction(async (tx) => {
  // Lock row
  const order = await tx.$queryRaw`
    SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE
  `;
  // ... process
});
```

**Use case:** Critical section where serializing essential.

**Trade-off:**

- ✅ No retry needed
- ⚠️ Block other tx (potential deadlock)

> 💡 Tutor365 mostly uses optimistic. Pessimistic for assign endpoint (slide 13).

---

## Slide 13 — Hanah assign with pessimistic lock

```ts
async assign(bookingId, tutorId, adminId) {
  return this.prisma.$transaction(async (tx) => {
    // Lock booking row
    const [booking] = await tx.$queryRaw<SessionBooking[]>`
      SELECT * FROM session_bookings WHERE id = ${bookingId} FOR UPDATE
    `;
    if (!booking) throw new NotFoundException();
    if (booking.status === 'assigned' && booking.tutor_id === tutorId) return booking;
    if (booking.status !== 'pending_assign') throw new BadRequestException();

    // ... eligibility check
    // ... update
    await tx.sessionBooking.update({
      where: { id: bookingId },
      data: { tutorId, status: 'assigned' },
    });
  });
}
```

**Effect:** 2 admin click assign cùng booking → 1 waits cho cái kia commit → no race.

---

## Slide 14 — Deadlock

### 2 tx wait each other

```
TxA: lock row 1, then wants row 2
TxB: lock row 2, then wants row 1
→ Deadlock!

PG detects → kills 1 tx with error
```

**Avoid:** Always lock in same order.

```ts
// Both txs: lock booking BEFORE order
SELECT FROM bookings FOR UPDATE;
SELECT FROM orders FOR UPDATE;
```

---

## Slide 15 — Prisma transaction options

```ts
await prisma.$transaction(
  async (tx) => { /* ... */ },
  {
    isolationLevel: 'ReadCommitted',     // 'Serializable', 'RepeatableRead'
    maxWait: 5000,                        // ms wait acquire pool
    timeout: 10000,                       // ms tx total timeout
  },
);
```

---

## Slide 16 — When to use Serializable

```
✅ Use Serializable:
- Money transfer between accounts (banking)
- Complex multi-row consistency
- Read-modify-write across multiple rows

✅ Use REPEATABLE READ:
- Long read tx (report) need consistent snapshot
- Computing aggregate across many rows

✅ Use READ COMMITTED (default):
- Single row CRUD
- Idempotent operations with optimistic check
- 95% of Tutor365 endpoints

❌ Don't use READ UNCOMMITTED (PG = same as RC anyway)
```

---

## Slide 17 — Anti-patterns

```ts
// ❌ Cross-tx logic without isolation
const order = await prisma.order.findUnique(...);
if (order.status === 'pending') {
  // sleep 100ms
  await prisma.order.update(...);   // status may have changed!
}
// → Wrap in transaction

// ❌ Long tx
await prisma.$transaction(async (tx) => {
  await tx.order.create(...);
  await sleep(60000);   // 1 min
  await tx.enrollment.create(...);
});
// → Holds locks 60s, kills concurrency

// ❌ Mix Prisma + raw SQL within transaction inconsistently
// → Use tx for both

// ❌ Forget retry on Serializable
// → Random P2034 errors in production
```

---

## Slide 18 — Bài tập thực hành

### 🎯 Concurrency tests

**Bài 1:** Implement markPaid với optimistic check.

**Bài 2:** Test race: 2 process call markPaid same order → only 1 succeeds.

**Bài 3:** Implement Hanah assign với SELECT FOR UPDATE.

**Bài 4:** Test 2 admin assign same booking → 1 waits.

**Bài 5:** Implement payout calculate với Serializable + retry.

**Bài 6:** Demonstrate deadlock + fix by lock order.

**Bài 7:** Bonus: Test serializable retry — simulate by parallel updates.

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| 2 concurrent INSERT cùng UNIQUE key | DB enforces — 1 P2002 |
| 100 concurrent same booking accept | EXCLUDE constraint rejects overlaps |
| Long-running tx with locks | Other tx wait or timeout |
| Connection pool exhausted | Pool timeout error |
| Deadlock auto-detected | PG kills 1 tx, retry-able |

---

## Slide 20 — Tổng kết Video 62

### Bạn vừa học

- ✅ ACID properties cho Tutor365
- ✅ 4 isolation levels SQL standard
- ✅ Read phenomena: dirty, non-repeatable, phantom
- ✅ PG default = READ COMMITTED
- ✅ When upgrade to REPEATABLE READ / SERIALIZABLE
- ✅ Optimistic concurrency (`updateMany where status=pending`)
- ✅ Pessimistic locking (`SELECT FOR UPDATE`)
- ✅ Serialization failure retry logic
- ✅ Deadlock + same lock order
- ✅ Prisma transaction options

> 💪 Concurrency safety = production-ready

---

<!-- _class: lead -->

# Tiếp theo: Video 63

## Prevent Double-Booking — EXCLUDE Constraint

PG signature feature: DB từ chối tự nhiên Tutor double-book.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 63 🚀

> *"Isolation is a knob. Turn it carefully."*
