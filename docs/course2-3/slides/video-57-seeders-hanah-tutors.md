---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 57: Seeders'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Seeders
# Hanah + Tutors + Courses

### Khóa 2-3 — Video 57

**Idempotent · Realistic data · Faker**

> Demo realistic = bán được idea cho stakeholder

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Setup seeder Prisma
- ✅ Seed master data (subjects, levels, qualifications, packages)
- ✅ Seed Hanah admin account
- ✅ Seed 5 tutor demo + courses + chapters + lessons
- ✅ Seed 10 student demo + enrollments
- ✅ Idempotent (re-seed không duplicate)
- ✅ Realistic với Faker.js

> 🎯 Cuối video: `pnpm db:seed` ra 100+ row sẵn sàng demo

---

## Slide 3 — Setup seed script

```json
// package.json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

```bash
pnpm --filter @tutor365/api add -D tsx @faker-js/faker
pnpm --filter @tutor365/api exec prisma db seed
```

---

## Slide 4 — Seed file structure

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { seedTaxonomy } from './seeds/taxonomy';
import { seedUsers } from './seeds/users';
import { seedCourses } from './seeds/courses';
import { seedBookings } from './seeds/bookings';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding...');
  await seedTaxonomy(prisma);
  await seedUsers(prisma);
  await seedCourses(prisma);
  await seedBookings(prisma);
  console.log('✅ Done');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

---

## Slide 5 — Seed master taxonomy

```ts
// prisma/seeds/taxonomy.ts
import { slugify } from '../utils/slugify';

const SUBJECTS = [
  { name: 'Toán học', position: 0 },
  { name: 'Vật lý', position: 1 },
  { name: 'Hoá học', position: 2 },
  { name: 'Sinh học', position: 3 },
  { name: 'Văn học', position: 4 },
  { name: 'Lịch sử', position: 5 },
  { name: 'Địa lý', position: 6 },
  { name: 'Tiếng Anh', position: 7 },
  { name: 'Tin học', position: 8 },
  { name: 'IELTS', position: 9 },
  { name: 'SAT', position: 10 },
];

const LEVELS = [
  { group: 'school', name: 'Lớp 10', position: 9 },
  { group: 'school', name: 'Lớp 11', position: 10 },
  { group: 'school', name: 'Lớp 12', position: 11 },
  { group: 'ielts', name: 'IELTS 6.5+', position: 102 },
];

export async function seedTaxonomy(prisma: PrismaClient) {
  for (const s of SUBJECTS) {
    await prisma.subject.upsert({
      where: { slug: slugify(s.name) },
      create: { ...s, slug: slugify(s.name) },
      update: {},
    });
  }
  for (const l of LEVELS) {
    await prisma.level.upsert({
      where: { slug: slugify(l.name) },
      create: { ...l, slug: slugify(l.name) },
      update: {},
    });
  }

  // ... qualifications + session_packages similar
}
```

---

## Slide 6 — Seed Hanah admin

```ts
// prisma/seeds/users.ts
import * as bcrypt from 'bcrypt';

export async function seedUsers(prisma) {
  // Hanah admin
  await prisma.user.upsert({
    where: { email: 'hanah@tutor365.vn' },
    create: {
      email: 'hanah@tutor365.vn',
      passwordHash: await bcrypt.hash('Hanah@123', 12),
      role: 'admin',
      status: 'active',
      fullName: 'Hanah Admin',
      emailVerifiedAt: new Date(),
    },
    update: {},
  });
  console.log('   ✓ Hanah admin');
}
```

---

## Slide 7 — Seed 5 Tutor

```ts
const TUTORS = [
  { email: 'anh.tu@tutor365.vn',  fullName: 'Anh Tu',  subjects: ['toan-hoc', 'vat-ly'], levels: ['lop-10', 'lop-11', 'lop-12'] },
  { email: 'bao.pham@tutor365.vn', fullName: 'Bao Pham', subjects: ['toan-hoc'],         levels: ['lop-10'] },
  { email: 'cuong.le@tutor365.vn', fullName: 'Cuong Le', subjects: ['tieng-anh'],        levels: ['ielts-6-5+'] },
  { email: 'dung.tran@tutor365.vn', fullName: 'Dung Tran', subjects: ['hoa-hoc', 'sinh-hoc'], levels: ['lop-11', 'lop-12'] },
  { email: 'em.nguyen@tutor365.vn', fullName: 'Em Nguyen', subjects: ['tieng-anh'],      levels: ['lop-10', 'lop-11'] },
];

for (const t of TUTORS) {
  const user = await prisma.user.upsert({
    where: { email: t.email },
    create: {
      email: t.email,
      passwordHash: await bcrypt.hash('Tutor@123', 12),
      role: 'tutor',
      status: 'active',
      fullName: t.fullName,
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  await prisma.tutorProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      bio: `${t.fullName} có 5 năm kinh nghiệm dạy ${t.subjects.join(', ')}.`,
      approveStatus: 'approved',
      approvedAt: new Date(),
    },
    update: {},
  });

  // Subjects
  for (const slug of t.subjects) {
    const subject = await prisma.subject.findUnique({ where: { slug } });
    await prisma.tutorSubject.upsert({
      where: { tutorId_subjectId: { tutorId: user.id, subjectId: subject!.id } },
      create: { tutorId: user.id, subjectId: subject!.id },
      update: {},
    });
  }
  // ... levels similar
}
```

---

## Slide 8 — Seed courses + chapters + lessons

```ts
const COURSES = [
  {
    tutorEmail: 'anh.tu@tutor365.vn',
    subjectSlug: 'toan-hoc',
    levelSlug: 'lop-10',
    title: 'Toán nâng cao Lớp 10',
    priceVnd: 499_000,
    chapters: [
      {
        title: 'Chương 1: Hàm số',
        lessons: [
          { title: 'Định nghĩa hàm số', type: 'video', isFreePreview: true },
          { title: 'Đồ thị hàm số bậc 1', type: 'video', isFreePreview: false },
          { title: 'Bài tập áp dụng', type: 'pdf', isFreePreview: false },
        ],
      },
      // ...
    ],
  },
  // ...
];

for (const c of COURSES) {
  const tutor = await prisma.user.findUnique({ where: { email: c.tutorEmail } });
  const subject = await prisma.subject.findUnique({ where: { slug: c.subjectSlug } });
  const level = await prisma.level.findUnique({ where: { slug: c.levelSlug } });

  const course = await prisma.course.upsert({
    where: { slug: slugify(c.title) },
    create: {
      tutorId: tutor!.id,
      subjectId: subject!.id,
      levelId: level!.id,
      title: c.title,
      slug: slugify(c.title),
      shortDescription: `Khoá học ${c.title} cho học sinh ${level!.name}.`,
      description: '...',
      priceVnd: c.priceVnd,
      status: 'published',
      publishedAt: new Date(),
    },
    update: {},
  });

  // Chapters
  for (let i = 0; i < c.chapters.length; i++) {
    const chapter = await prisma.courseChapter.upsert({
      where: { /* composite or unique */ },
      create: { courseId: course.id, title: c.chapters[i].title, position: i },
      update: {},
    });
    // Lessons
    for (let j = 0; j < c.chapters[i].lessons.length; j++) {
      const l = c.chapters[i].lessons[j];
      await prisma.lesson.create({
        data: {
          chapterId: chapter.id,
          title: l.title,
          type: l.type,
          isFreePreview: l.isFreePreview,
          position: j,
          textContent: l.type === 'text' ? 'Sample text content' : null,
        },
      });
    }
  }
}
```

---

## Slide 9 — Faker for realistic

```ts
import { faker } from '@faker-js/faker';
faker.setLocale('vi');     // Vietnamese names

// Generate 20 student
for (let i = 0; i < 20; i++) {
  const fullName = faker.person.fullName();
  await prisma.user.create({
    data: {
      email: faker.internet.email({ firstName: fullName.split(' ')[0] }),
      passwordHash: await bcrypt.hash('Student@123', 12),
      role: 'student',
      status: 'active',
      fullName,
      phone: faker.phone.number('+849########'),
      country: 'VN',
      emailVerifiedAt: new Date(),
    },
  });
}
```

---

## Slide 10 — Seed bookings + enrollments

```ts
// Random enrollment some students vào some courses
const students = await prisma.user.findMany({ where: { role: 'student' } });
const courses = await prisma.course.findMany({ where: { status: 'published' } });

for (const s of students) {
  // Each student enroll 2-5 random courses
  const count = faker.number.int({ min: 2, max: 5 });
  const picked = faker.helpers.arrayElements(courses, count);
  for (const c of picked) {
    // Create order paid
    const order = await prisma.order.create({
      data: {
        studentId: s.id,
        type: 'course',
        refId: c.id,
        subtotal: c.priceVnd,
        taxAmount: Math.floor(c.priceVnd * 0.1),
        feeAmount: 0,
        totalVnd: c.priceVnd + Math.floor(c.priceVnd * 0.1),
        status: 'paid',
        paidAt: faker.date.recent({ days: 60 }),
        vnpTxnRef: `seed-${c.id}-${s.id}`,
        expiresAt: new Date(),
      },
    });
    await prisma.courseEnrollment.create({
      data: {
        courseId: c.id,
        studentId: s.id,
        orderId: order.id,
        pricePaidVnd: c.priceVnd,
        enrolledAt: order.paidAt!,
      },
    });
  }
}
```

---

## Slide 11 — Random reviews

```ts
const enrollments = await prisma.courseEnrollment.findMany();
for (const e of enrollments) {
  if (faker.datatype.boolean({ probability: 0.4 })) {   // 40% review rate
    await prisma.courseReview.upsert({
      where: { courseId_studentId: { courseId: e.courseId, studentId: e.studentId } },
      create: {
        courseId: e.courseId,
        studentId: e.studentId,
        rating: faker.number.int({ min: 3, max: 5 }),    // skew positive
        comment: faker.lorem.sentences(2),
        createdAt: faker.date.between({ from: e.enrolledAt, to: new Date() }),
      },
      update: {},
    });
  }
}
```

---

## Slide 12 — Idempotent strategy

### Re-seed không duplicate

```ts
// Pattern 1: upsert
await prisma.user.upsert({
  where: { email },
  create: { ... },
  update: {},       // no update — keep existing
});

// Pattern 2: skip if exists
const existing = await prisma.user.findUnique({ where: { email } });
if (!existing) { await prisma.user.create({ ... }); }

// Pattern 3: deleteMany + create (clean slate)
await prisma.course.deleteMany();
// → DESTRUCTIVE — chỉ dev
```

---

## Slide 13 — Reset DB script

```json
// package.json
{
  "scripts": {
    "db:reset": "prisma migrate reset --force && prisma db seed",
    "db:seed": "prisma db seed"
  }
}
```

```bash
pnpm db:reset
# → Drop DB → migrate → seed
# → Clean slate cho dev
```

> ⚠️ **KHÔNG** chạy `db:reset` ở production.

---

## Slide 14 — Verify seed

```bash
psql tutor365 -c "SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM subjects) AS subjects,
  (SELECT COUNT(*) FROM courses) AS courses,
  (SELECT COUNT(*) FROM course_enrollments) AS enrollments,
  (SELECT COUNT(*) FROM course_reviews) AS reviews;
"

# users         | 26
# subjects      | 11
# courses       | 5
# enrollments   | ~50
# reviews       | ~20
```

---

## Slide 15 — Anti-patterns

```ts
// ❌ Hard-coded UUID — test trên 1 máy work, máy khác fail
const HANAH_ID = 'fixed-uuid-123';
prisma.user.create({ id: HANAH_ID, ... })
// → Email lookup làm gì

// ❌ Seed không idempotent → re-run duplicate
prisma.user.create(...)   // không upsert
// → Email UNIQUE → 2nd run fail

// ❌ Faker không locale
faker.person.fullName()   // → "John Smith" cho VN app

// ❌ Seed dependency thứ tự sai
seedCourses() before seedTutors()   // FK error

// ❌ Seed quá nhiều data làm slow dev startup
1_000_000 rows   // dev không cần
// → 50-200 row đủ realistic
```

---

## Slide 16 — Bài tập thực hành

### 🎯 Seed E2E

**Bài 1:** Setup `prisma seed` script.

**Bài 2:** Seed 11 subject + 4 level + 5 qualification.

**Bài 3:** Seed Hanah + 5 tutor + 20 student.

**Bài 4:** Seed 5 course với chapter + lesson.

**Bài 5:** Random enrollment + review qua Faker.

**Bài 6:** Run `pnpm db:reset` → verify clean.

**Bài 7:** Run seed twice → no duplicates (idempotent).

**Bài 8:** Bonus: seed session bookings (single + combo).

---

## Slide 17 — Production seeding

### Khác dev

```ts
// Production seed chỉ master data + Hanah admin
async function productionSeed() {
  await seedTaxonomy(prisma);
  // Skip user, course seeds — production có data thật

  // Hanah admin với secure random password lần đầu
  const hanahExists = await prisma.user.findUnique({
    where: { email: 'hanah@tutor365.vn' },
  });
  if (!hanahExists) {
    const tempPass = generateSecurePassword();
    await prisma.user.create({
      data: { /* ... */, passwordHash: await bcrypt.hash(tempPass, 12) },
    });
    console.log('⚠️  Hanah created with temp password:', tempPass);
    // Email to ops team
  }
}
```

---

## Slide 18 — Performance: bulk create

```ts
// ❌ Slow
for (const t of TUTORS) {
  await prisma.tutorSubject.create({ ... });
}
// → N round-trip queries

// ✅ Fast
await prisma.tutorSubject.createMany({
  data: TUTORS.flatMap(t => t.subjects.map(s => ({
    tutorId: t.id, subjectId: s.id,
  }))),
  skipDuplicates: true,
});
// → 1 query
```

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| Seed run khi DB chưa migrate | Throw FK error → migrate first |
| Seed sai password format | Faker generates email valid |
| Faker locale not loaded | Default English names |
| Composite PK upsert | Use `@@unique` and full where clause |
| Seed large data slow | bulk createMany + skipDuplicates |

---

## Slide 20 — Tổng kết Video 57

### Bạn vừa học

- ✅ Setup `prisma db seed` script
- ✅ Seed master data (taxonomy + packages)
- ✅ Seed Hanah admin idempotent
- ✅ Seed 5 tutor + profile + subjects/levels
- ✅ Seed courses + chapters + lessons
- ✅ Seed students với Faker realistic VN
- ✅ Random enrollments + reviews
- ✅ Idempotent pattern (upsert + skipDuplicates)
- ✅ Reset DB script for dev
- ✅ Production-aware seed

> 💪 Seed realistic = demo bán được, dev test mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 58

## Migrate In-Memory → Prisma

Refactor V01-V20 code dùng in-memory repo sang Prisma. Không sửa controller/service.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 58 🚀

> *"Good seeds make great demos."*
