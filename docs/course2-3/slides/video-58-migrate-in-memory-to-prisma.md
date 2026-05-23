---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 58: Migrate In-Memory → Prisma'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Migrate In-Memory
# → Prisma

### Khóa 2-3 — Video 58

**Swap repository impl · No controller change**

> Repository pattern's payoff moment

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu lý do **tại sao** pattern repository chia
- ✅ Refactor `InMemoryRepository` → `PrismaRepository`
- ✅ Swap 1 dòng trong module
- ✅ Verify integration test pass without controller change
- ✅ Migrate progressively module-by-module
- ✅ Test integration với real DB

> 🎯 Cuối video: 14 module dùng Prisma, controllers/services không đổi

---

## Slide 3 — Repository pattern recap

```ts
// courses.repository.ts (interface)
export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  insert(input: ...): Promise<Course>;
  // ...
}

// 2 implementations
class InMemoryCourseRepository implements CourseRepository {}
class PrismaCourseRepository implements CourseRepository {}
```

**Service depends interface, không depend class cụ thể.**

→ Swap impl = 1 dòng trong `@Module providers`.

---

## Slide 4 — PrismaCourseRepository

```ts
// modules/courses/repositories/prisma.repository.ts
@Injectable()
export class PrismaCourseRepository implements CourseRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<Course | null> {
    return this.prisma.course.findUnique({
      where: { id },
      include: { subject: true, level: true, tutor: true },
    });
  }

  async insert(input: CreateCourseInput & { tutorId: string }): Promise<Course> {
    return this.prisma.course.create({
      data: input,
      include: { subject: true, level: true, tutor: true },
    });
  }

  async findMany(filter: CourseFilter): Promise<{ items: Course[]; total: number }> {
    const where = this.buildWhere(filter);
    const orderBy = this.buildOrderBy(filter.sort);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where, orderBy,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: { subject: true, level: true, tutor: true },
      }),
      this.prisma.course.count({ where }),
    ]);
    return { items, total };
  }

  // ... existsBySlug, update, softDelete
}
```

---

## Slide 5 — Swap module provider

```ts
// modules/courses/courses.module.ts

// Before
@Module({
  providers: [
    CoursesService,
    { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
  ],
})

// After
@Module({
  providers: [
    CoursesService,
    { provide: COURSE_REPOSITORY, useClass: PrismaCourseRepository },
  ],
})
```

**1 line change.** Controllers + services không đổi.

---

## Slide 6 — Migration plan per module

### Order matters

```
1. taxonomy (subjects, levels, qualifications)
2. users + tutor_profiles + student_profiles
3. courses + chapters + lessons
4. enrollments + lesson_progress + reviews
5. availability + bookings + attendances
6. orders + payments
7. payouts + notifications
```

> 💡 Migration ordered by dependency. Module sau depend module trước.

---

## Slide 7 — Verify integration tests

### Test với real DB

```ts
// modules/courses/courses.test.ts
describe('CoursesController (e2e with Prisma)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    // Clean DB before each test
    await prisma.course.deleteMany();
  });

  it('GET /courses returns empty', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/courses')
      .expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('POST /courses creates course', async () => {
    // ... seed prerequisite (tutor, subject, level)
    const res = await request(app.getHttpServer())
      .post('/v1/courses')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ title: 'New Course', /* ... */ })
      .expect(201);
    expect(res.body.id).toBeDefined();

    // Verify in DB
    const inDb = await prisma.course.findUnique({ where: { id: res.body.id } });
    expect(inDb).toBeDefined();
  });
});
```

---

## Slide 8 — Differences to handle

### In-memory vs DB

| Aspect | In-memory | Prisma |
|--------|-----------|--------|
| ID generation | `crypto.randomUUID()` | `@default(uuid())` DB |
| Auto-increment timestamps | Manual `new Date()` | `@default(now())`, `@updatedAt` |
| Cascade delete | Manual delete | `onDelete: Cascade` |
| Concurrent access | Single-process | Multi-process safe |
| Unique constraints | App-level Map | DB UNIQUE |
| Transactions | None | `$transaction` |

> 💡 Refactor opportunity: dùng DB auto-features thay manual.

---

## Slide 9 — Refactor cleanup

### After migration

```ts
// Before (in-memory)
async insert(input) {
  const course: Course = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    version: 1,
  };
  this.store.set(course.id, course);
  return course;
}

// After (Prisma)
async insert(input: CreateCourseInput & { tutorId: string }) {
  return this.prisma.course.create({
    data: { ...input },   // id, createdAt, updatedAt auto by DB
  });
}
```

→ Code ngắn hơn, leverages DB.

---

## Slide 10 — Test data isolation

### Each test fresh DB

```ts
// Option 1: Test transaction rollback (fastest)
beforeEach(async () => {
  await prisma.$executeRawUnsafe('BEGIN');
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('ROLLBACK');
});

// Option 2: Truncate tables
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE courses, users, subjects RESTART IDENTITY CASCADE'
  );
});

// Option 3: Per-test DB (slowest but isolated)
// Use container-per-test pattern
```

> 💡 Tutor365 chọn option 2 — simple + fast enough.

---

## Slide 11 — DATABASE_URL for testing

```env
# .env.test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tutor365_test
```

```ts
// jest setup
process.env.DATABASE_URL = 'postgresql://...test';
beforeAll(async () => {
  // Apply migrations
  await execAsync('prisma migrate deploy');
});
```

> 💡 Separate test DB từ dev DB → tests không nuke dev data.

---

## Slide 12 — Progressive rollout

### Migrate 1 module / commit

```bash
# Commit 1: taxonomy module
git checkout -b migrate-taxonomy
# ... refactor + test
git commit -m "feat: migrate taxonomy module to Prisma"

# Commit 2: users
git checkout -b migrate-users
# ...

# Each PR small, reviewable
```

> 💡 Đỡ break diff. Roll back 1 module dễ.

---

## Slide 13 — Bench: in-memory vs Prisma

```bash
# In-memory
GET /v1/courses → 2-5ms

# Prisma → PostgreSQL
GET /v1/courses → 15-30ms (with index)
GET /v1/courses → 200-500ms (without index)
```

**Trade-off:**

- 10x slower than in-memory
- Persist data, scale horizontal, concurrent safe
- → Worth it cho production

---

## Slide 14 — Anti-patterns khi migrate

```ts
// ❌ Inject Prisma trực tiếp vào service
@Injectable()
class CoursesService {
  constructor(private prisma: PrismaService) {}   // ← skip repository
}
// → Lose abstraction, test khó

// ❌ Quên handle Prisma errors specifically
try { ... } catch (e) {
  throw new Error(e.message)   // ← generic
}
// → Catch P2002 (unique), P2025 (not found) → đúng HTTP code

// ❌ Mass migration 1 PR
// → Hard review, hard rollback

// ❌ Quên test integration với DB
// → "It works on my machine" with in-memory
```

---

## Slide 15 — Prisma error → HTTP code

```ts
import { Prisma } from '@prisma/client';

async create(input) {
  try {
    return await this.prisma.course.create({ data: input });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Slug đã tồn tại');
      }
      if (e.code === 'P2003') {
        throw new BadRequestException('FK violation');
      }
    }
    throw e;
  }
}

async findById(id: string) {
  const course = await this.prisma.course.findUnique({ where: { id } });
  if (!course) throw new NotFoundException();
  return course;
}
```

---

## Slide 16 — Section 19 hoàn tất

### Prisma layer ready

✅ V56 — Setup + schema
✅ V57 — Seeders
✅ V58 — Migrate in-memory

**Section 20 — Indexing + Optimization** (3 video):

- V59: Composite indexes
- V60: EXPLAIN ANALYZE
- V61: Partial + expression index

> 🚀 Sang Section 20 — tối ưu DB performance.

---

## Slide 17 — Bài tập thực hành

### 🎯 Migrate flow

**Bài 1:** Implement `PrismaCourseRepository`.

**Bài 2:** Swap provider trong CoursesModule.

**Bài 3:** Run integration test, verify pass.

**Bài 4:** Remove `InMemoryCourseRepository` (cleanup).

**Bài 5:** Repeat cho `users`, `bookings`, `orders`.

**Bài 6:** Setup test DB separate.

**Bài 7:** Handle Prisma error → proper HTTP code.

---

## Slide 18 — Verify production-ready

### Checklist after migration

- [ ] All 14 modules use Prisma repos
- [ ] Integration tests pass (real DB)
- [ ] Performance benchmark < 100ms p95
- [ ] No in-memory store left
- [ ] Migrations check in repo
- [ ] Seed runs idempotent
- [ ] Test data isolation working
- [ ] Prisma errors mapped to HTTP

---

## Slide 19 — Bonus: Prisma vs raw SQL

### Khi nào raw SQL?

```ts
// Prisma generated:
await prisma.course.findMany({ where: ..., orderBy: ... });

// Raw SQL khi:
// 1. Complex query Prisma không express được (V30 eligible-tutor)
await prisma.$queryRaw`SELECT ... FROM ... WHERE ...`;

// 2. Performance critical with EXPLAIN-tuned query
await prisma.$queryRaw`<optimized query>`;

// 3. Use PG-specific features (tsrange, EXCLUDE, etc.)
```

> 💡 Tutor365: 80% Prisma, 20% raw SQL (V30 + V31 eligible filter, recap stats).

---

## Slide 20 — Tổng kết Video 58

### Bạn vừa học

- ✅ Repository pattern's payoff: swap 1 line
- ✅ PrismaXxxRepository implementation
- ✅ Migration order: taxonomy → users → courses → ...
- ✅ Integration test với real DB
- ✅ Test isolation (truncate or transaction rollback)
- ✅ Separate test DB
- ✅ Refactor cleanup (DB auto-features)
- ✅ Progressive rollout per module
- ✅ Prisma error → HTTP code mapping
- ✅ Raw SQL khi Prisma không đủ

> 💪 Repository pattern thực sự giúp khi migrate

---

<!-- _class: lead -->

# Tiếp theo: Video 59

## Composite Indexes — (tutor_id, start_at)

Index nhiều cột cho booking lookup nhanh.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 59 🚀

> *"Repository pattern: a one-line gift on migration day."*
