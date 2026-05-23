---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 56: Prisma Setup + Schema'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Prisma Setup
# + Schema-from-ERD

### Khóa 2-3 — Video 56

**Schema · Migrations · Client**

> Prisma = type-safe ORM cho Tutor365

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Setup Prisma 5 trong monorepo
- ✅ Define schema từ ERD 19 bảng
- ✅ `prisma migrate dev` workflow
- ✅ Generate client + import vào NestJS
- ✅ Quan hệ 1:1, 1:N, N:N trong Prisma
- ✅ Type inference + autocomplete

> 🎯 Cuối video: 23 model + initial migration applied

---

## Slide 3 — Setup Prisma

```bash
pnpm --filter @tutor365/api add prisma @prisma/client
pnpm --filter @tutor365/api exec prisma init
```

```
prisma/
├── schema.prisma     ← schema file
└── migrations/       ← auto-generated migrations
```

```ts
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## Slide 4 — User model

```prisma
model User {
  id              String   @id @default(uuid()) @db.Uuid
  email           String   @unique
  passwordHash    String
  role            String   // 'admin' | 'tutor' | 'student'
  status          String   @default("pending_verify")
  fullName        String
  phone           String?
  country         String   @default("VN")
  emailVerifiedAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tutorProfile    TutorProfile?
  studentProfile  StudentProfile?
  courses         Course[]
  enrollments     CourseEnrollment[]
  bookingsAsStudent SessionBooking[] @relation("BookingsAsStudent")
  bookingsAsTutor   SessionBooking[] @relation("BookingsAsTutor")
  orders          Order[]
  reviews         CourseReview[]
  notifications   Notification[]
  refreshTokens   RefreshToken[]

  @@map("users")
  @@index([email])
  @@index([role, status])
}
```

---

## Slide 5 — TutorProfile (1:1)

```prisma
model TutorProfile {
  userId             String   @id @db.Uuid
  bio                String?
  approveStatus      String   @default("pending_admin_approve")
  rejectReason       String?
  hourlyRateOverride Int?
  approvedAt         DateTime?
  approvedByAdminId  String?  @db.Uuid
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user           User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  subjects       TutorSubject[]
  levels         TutorLevel[]
  qualifications TutorQualification[]
  availability   TutorAvailability[]
  payouts        TutorPayout[]

  @@map("tutor_profiles")
  @@index([approveStatus])
}
```

> 💡 `userId @id` → PK = FK, enforce 1:1.

---

## Slide 6 — N:N junction

```prisma
model TutorSubject {
  tutorId   String @db.Uuid
  subjectId String @db.Uuid
  createdAt DateTime @default(now())

  tutor   TutorProfile @relation(fields: [tutorId], references: [userId], onDelete: Cascade)
  subject Subject      @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@id([tutorId, subjectId])
  @@map("tutor_subjects")
  @@index([subjectId, tutorId])
}

model Subject {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  slug        String   @unique
  description String?
  iconUrl     String?
  position    Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tutors  TutorSubject[]
  courses Course[]

  @@map("subjects")
}
```

---

## Slide 7 — Course model

```prisma
model Course {
  id               String   @id @default(uuid()) @db.Uuid
  tutorId          String   @db.Uuid
  subjectId        String   @db.Uuid
  levelId          String   @db.Uuid
  title            String
  slug             String   @unique
  shortDescription String?
  description      String?
  coverImageKey    String?
  priceVnd         Int
  status           String   @default("draft")
  durationMinutes  Int?
  language         String   @default("vi")
  publishedAt      DateTime?
  rejectedReason   String?
  version          Int      @default(1)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  tutor       User              @relation(fields: [tutorId], references: [id], onDelete: Restrict)
  subject     Subject           @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  level       Level             @relation(fields: [levelId], references: [id], onDelete: Restrict)
  chapters    CourseChapter[]
  enrollments CourseEnrollment[]
  reviews     CourseReview[]

  @@map("courses")
  @@index([status, publishedAt])
  @@index([tutorId])
  @@index([subjectId, status])
  @@index([levelId])
}
```

---

## Slide 8 — Session booking with self-ref

```prisma
model SessionBooking {
  id                String   @id @default(uuid()) @db.Uuid
  studentId         String   @db.Uuid
  tutorId           String?  @db.Uuid
  packageId         String   @db.Uuid
  subjectId         String   @db.Uuid
  levelId           String   @db.Uuid
  startAt           DateTime
  durationHr        Float
  status            String   @default("created")
  meetingRoomName   String?
  cancelledAt       DateTime?
  cancelledReason   String?
  completedAt       DateTime?
  parentBookingId   String?  @db.Uuid
  recurrenceRule    String?
  orderId           String?  @db.Uuid
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  student  User             @relation("BookingsAsStudent", fields: [studentId], references: [id])
  tutor    User?            @relation("BookingsAsTutor", fields: [tutorId], references: [id])
  package  SessionPackage   @relation(fields: [packageId], references: [id])
  parent   SessionBooking?  @relation("ComboChildren", fields: [parentBookingId], references: [id])
  children SessionBooking[] @relation("ComboChildren")
  attendances SessionAttendance[]

  @@map("session_bookings")
  @@index([studentId, startAt])
  @@index([tutorId, startAt])
  @@index([status, startAt])
}
```

---

## Slide 9 — Migration workflow

```bash
# 1. Edit schema.prisma
# 2. Generate migration
pnpm --filter @tutor365/api exec prisma migrate dev --name init

# Tạo file: prisma/migrations/20260525101500_init/migration.sql
# Apply lên DB

# 3. Generate client
pnpm --filter @tutor365/api exec prisma generate

# 4. Use in code
import { PrismaClient } from '@prisma/client';
```

---

## Slide 10 — PrismaService trong NestJS

```ts
// modules/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger('Prisma');

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['error'],
    });

    this.$on('query' as any, (e: any) => {
      if (e.duration > 100) {
        this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

---

## Slide 11 — PrismaModule

```ts
// modules/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()                   // available everywhere
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

// app.module.ts
@Module({
  imports: [PrismaModule, /* ... */],
})
export class AppModule {}
```

---

## Slide 12 — Migration vs Push

### `migrate dev` vs `db push`

```bash
# migrate dev — production-grade
prisma migrate dev --name add_avatar
# → Creates SQL migration file
# → Applies to dev DB
# → Track history

# db push — prototyping only
prisma db push
# → Sync schema → DB directly (no migration file)
# → Lose history
# → KHÔNG dùng production
```

**Tutor365 dùng `migrate dev`** từ ngày đầu.

---

## Slide 13 — Migration cho production

```bash
# Dev: tạo migration
prisma migrate dev --name add_field

# Staging/Prod: apply (không edit schema)
prisma migrate deploy
# → Apply pending migrations
# → Không prompt, idempotent
```

> 💡 CI/CD pipeline: `prisma migrate deploy` trước khi start app.

---

## Slide 14 — Custom raw SQL trong migration

### Cho features Prisma không support (e.g., EXCLUDE)

```sql
-- prisma/migrations/20260525_add_exclude/migration.sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE session_bookings
  ADD COLUMN booking_range tsrange
  GENERATED ALWAYS AS (
    tsrange(start_at, start_at + (duration_hr || ' hours')::interval, '[]')
  ) STORED;

CREATE INDEX idx_booking_range_gist
  ON session_bookings USING gist (booking_range)
  WHERE status IN ('assigned', 'confirmed', 'in_progress');

ALTER TABLE session_bookings
  ADD CONSTRAINT no_tutor_overlap
  EXCLUDE USING gist (tutor_id WITH =, booking_range WITH &&)
  WHERE (tutor_id IS NOT NULL AND status IN ('assigned', 'confirmed', 'in_progress'));
```

```bash
prisma migrate dev --create-only --name add_exclude_constraint
# Edit file → add raw SQL
prisma migrate dev
```

---

## Slide 15 — Prisma Studio

### GUI explore DB

```bash
prisma studio
# → http://localhost:5555
# → Browse tables, edit data, run filters
```

> 💡 Đẹp hơn psql cho non-tech.

---

## Slide 16 — Bài tập thực hành

### 🎯 Schema + migrate

**Bài 1:** Setup Prisma trong monorepo.

**Bài 2:** Define schema 23 model (slide 4-8 reference + complete).

**Bài 3:** `prisma migrate dev --name init`.

**Bài 4:** Verify DB tables created: `psql -c "\dt"`.

**Bài 5:** Create PrismaService + PrismaModule.

**Bài 6:** Inject vào 1 module test query: `SELECT count(*)`.

**Bài 7:** Add EXCLUDE constraint via raw SQL migration.

**Bài 8:** Open Prisma Studio + browse.

---

## Slide 17 — Schema organize

### Multiple files (Prisma 5 support)

```
prisma/
├── schema.prisma         (main: generator + datasource)
├── auth.prisma
├── courses.prisma
├── bookings.prisma
├── payments.prisma
```

```ts
// schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}
```

> 💡 Tutor365 MVP có thể giữ 1 file 23 model — chia khi > 500 lines.

---

## Slide 18 — Anti-patterns

```prisma
// ❌ Default UUID lưu TEXT
id String @id @default(uuid())   // Prisma generates JS uuid
// ✅ Lưu UUID type
id String @id @default(uuid()) @db.Uuid

// ❌ Float cho money
priceVnd Float
// → Float precision error
// ✅ Int
priceVnd Int

// ❌ Missing @updatedAt
updatedAt DateTime
// → Không auto-update
// ✅
updatedAt DateTime @updatedAt

// ❌ @@map ngược
@@map("Users")   // ← table name should be plural snake_case
@@map("users")   // ✅

// ❌ Forgot @relation
courses Course[]   // không có FK → Prisma can't infer
// ✅
courses Course[] @relation(name: "TutorCourses")
```

---

## Slide 19 — Type safety bonus

```ts
import { Prisma } from '@prisma/client';

// Type for complex include
const courseWithRelations = Prisma.validator<Prisma.CourseDefaultArgs>()({
  include: {
    tutor: { select: { id: true, fullName: true } },
    subject: true,
    level: true,
    chapters: { include: { lessons: true } },
  },
});
type CourseWithRelations = Prisma.CourseGetPayload<typeof courseWithRelations>;

// Service
async function findCourse(id: string): Promise<CourseWithRelations | null> {
  return prisma.course.findUnique({ where: { id }, ...courseWithRelations });
}
```

---

## Slide 20 — Tổng kết Video 56

### Bạn vừa học

- ✅ Setup Prisma 5 monorepo
- ✅ Define 23 model với relations
- ✅ 1:1 qua PK = FK
- ✅ N:N junction với composite @@id
- ✅ Self-reference qua named relation
- ✅ `migrate dev` workflow
- ✅ Custom raw SQL migration (EXCLUDE constraint)
- ✅ PrismaService + Global PrismaModule
- ✅ Prisma Studio GUI
- ✅ Multi-file schema option
- ✅ Type-safe complex query

> 💪 Schema vững = code type-safe + DB consistent

---

<!-- _class: lead -->

# Tiếp theo: Video 57

## Seeders — Hanah Admin + Tutors + Sample Courses

Seed data realistic cho test + demo.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 57 🚀

> *"Prisma's superpower: schema is the source of truth."*
