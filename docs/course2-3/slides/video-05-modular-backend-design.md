---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 5: Modular Backend Design + Folder Convention'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Modular Backend Design
# + Folder Convention

### Khóa 2-3 — Video 5

**Tổ chức 14 module Tutor365 không rối**

> Architecture không phải về tool, mà về cách chia ranh giới

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **module boundary** — cái gì thuộc về cái gì
- ✅ Folder convention: **feature-based** không phải layer-based
- ✅ Pattern **Controller → Service → Repository → Mapper**
- ✅ **DI token** cho repository (interface-based)
- ✅ **Shared kernel** vs **feature module** vs **infrastructure**
- ✅ Cách **export** chỉ những gì cần — tránh circular import
- ✅ Naming convention thực tế cho Tutor365

> 🎯 Cuối video: scaffold 14 module rỗng đúng convention, sẵn sàng fill code

---

## Slide 3 — Feature-based vs Layer-based

### ❌ Layer-based (xấu cho domain phức tạp)

```
src/
├── controllers/
│   ├── auth.controller.ts
│   ├── courses.controller.ts
│   └── ... (14 file)
├── services/
│   ├── auth.service.ts
│   └── ... (14 file)
└── repositories/
    └── ... (14 file)
```

→ Sửa 1 feature phải nhảy 3 folder.

### ✅ Feature-based (Tutor365 chọn)

```
src/modules/
├── auth/        (controller + service + repo + dto trong cùng folder)
├── courses/
├── bookings/
└── ... (14 folder)
```

→ 1 module = 1 folder, copy/paste/delete dễ.

---

## Slide 4 — Cấu trúc 1 module chuẩn

```
modules/courses/
├── courses.module.ts              ← @Module() khai báo
├── courses.controller.ts          ← HTTP layer (@Controller)
├── courses.service.ts             ← Business logic
├── courses.repository.ts          ← Interface
├── courses.mapper.ts              ← Domain → DTO
├── courses.constants.ts           ← DI token, enum const
├── courses.test.ts                ← Integration test
│
├── dto/
│   ├── create-course.dto.ts
│   ├── update-course.dto.ts
│   ├── list-courses.query.ts
│   └── public-course.dto.ts
│
└── repositories/
    ├── in-memory.repository.ts    ← Section 1-4
    └── prisma.repository.ts       ← Section 19 thêm
```

---

## Slide 5 — DI Token cho Repository

### Tách interface khỏi implementation

```ts
// courses.constants.ts
export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');

// courses.repository.ts (interface)
import type { Course } from '@tutor365/types';
export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  insert(input: CreateCourseInput): Promise<Course>;
  // ...
}

// repositories/prisma.repository.ts
@Injectable()
export class PrismaCourseRepository implements CourseRepository {
  constructor(private prisma: PrismaService) {}
  async findById(id: string) {
    return this.prisma.course.findUnique({ where: { id } });
  }
}

// courses.module.ts
@Module({
  providers: [
    CoursesService,
    { provide: COURSE_REPOSITORY, useClass: PrismaCourseRepository },
  ],
})
export class CoursesModule {}
```

---

## Slide 6 — Service inject repository qua token

```ts
// courses.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { COURSE_REPOSITORY } from './courses.constants';
import type { CourseRepository } from './courses.repository';

@Injectable()
export class CoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY)
    private readonly repo: CourseRepository,
  ) {}

  async findById(id: string) {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundException('Course không tồn tại');
    return c;
  }
}
```

> 💡 Service depend **interface**, không depend **class** cụ thể → swap impl không sửa service.

---

## Slide 7 — Module hierarchy: 3 lớp

```
┌──────────────────────────────────────┐
│ SHARED (common/) — global utility    │
│  - pipes, guards, filters            │
│  - decorators (@Public, @Roles)      │
│  - logger config                     │
└──────────────────────────────────────┘
                ↑ depended by
┌──────────────────────────────────────┐
│ INFRASTRUCTURE                       │
│  - prisma/ (DB client)               │
│  - mail/ (SMTP)                      │
│  - storage/ (S3 / MinIO)             │
│  - vnpay/ (payment SDK wrapper)      │
└──────────────────────────────────────┘
                ↑ depended by
┌──────────────────────────────────────┐
│ FEATURE MODULES (14 modules)         │
│  - auth, courses, bookings, ...      │
└──────────────────────────────────────┘
```

**Rule:** Feature module có thể import infrastructure + shared. Infrastructure không import feature.

---

## Slide 8 — Tránh circular import

### Vấn đề

```
auth.service.ts  →  users.service.ts
users.service.ts →  auth.service.ts   ← ❌ circular
```

**Cách 1: Tách event**

```ts
// auth.service.ts
@Injectable()
class AuthService {
  constructor(private eventBus: EventEmitter2) {}
  signup(input) {
    // ...
    this.eventBus.emit('user.created', user);
  }
}

// users module listen 'user.created' để send welcome email
```

**Cách 2: Inject UsersService.findByEmail trực tiếp (1 chiều)**

```ts
// auth.service.ts
constructor(private usersService: UsersService) {}
// users.service.ts KHÔNG import auth
```

---

## Slide 9 — Mapper: Domain → DTO

### Domain object có nhiều field nội bộ

```ts
// courses.mapper.ts
import type { Course } from '@prisma/client';
import type { PublicCourseDto, CourseListItemDto } from '@tutor365/types';

export function toPublicCourse(c: Course): PublicCourseDto {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description ?? null,
    price: c.price,
    status: c.status,
    tutorId: c.tutorId,
    createdAt: c.createdAt,
    publishedAt: c.publishedAt,
  };
}

export function toListItem(c: Course): CourseListItemDto {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    price: c.price,
    coverImageUrl: c.coverImageUrl,
  };
}
```

> 💡 Mapper = ranh giới giữa **domain** và **transport**. Đổi shape API → chỉ sửa mapper.

---

## Slide 10 — Exporting module: barrel index

### File `index.ts` của module

```ts
// modules/courses/index.ts
export { CoursesModule } from './courses.module';
export { CoursesService } from './courses.service';
export { COURSE_REPOSITORY } from './courses.constants';
export type { CourseRepository } from './courses.repository';
export * from './dto/create-course.dto';
```

**Khác module import:**

```ts
// modules/enrollments/enrollments.service.ts
import { CoursesService } from '../courses';  // OK
import { COURSE_REPOSITORY } from '../courses';  // OK
```

> ⚠️ **Không export internal**: in-memory repo, helper riêng, mapper nội bộ.

---

## Slide 11 — `exports` của @Module

### Service muốn được module khác inject → phải export

```ts
@Module({
  providers: [
    CoursesService,
    { provide: COURSE_REPOSITORY, useClass: PrismaCourseRepository },
  ],
  exports: [
    CoursesService,    // ← module khác inject được
    COURSE_REPOSITORY, // ← module khác inject repo trực tiếp được
  ],
  controllers: [CoursesController],
})
export class CoursesModule {}
```

**Bookings module dùng:**

```ts
@Module({
  imports: [CoursesModule],  // import CoursesModule
  providers: [BookingsService],
})
export class BookingsModule {}

// bookings.service.ts
constructor(private coursesService: CoursesService) {}  // inject OK
```

---

## Slide 12 — Naming convention thực tế

| Loại | Pattern | Ví dụ |
|------|---------|-------|
| File | kebab-case | `create-course.dto.ts` |
| Folder | kebab-case | `tutor-availability/` |
| Class | PascalCase | `CoursesService`, `JwtAuthGuard` |
| Interface | PascalCase | `CourseRepository` (không prefix `I`) |
| Type | PascalCase | `CreateCourseInput` |
| Constant DI token | SCREAMING_SNAKE | `COURSE_REPOSITORY` |
| Function | camelCase | `toPublicCourse()` |
| Variable | camelCase | `const tutorId = ...` |
| Enum value | PascalCase | `CourseStatus.Draft` |
| Test file | `.test.ts` cạnh source | `courses.service.test.ts` |

---

## Slide 13 — Folder convention 14 module Tutor365

```
apps/api/src/
├── main.ts
├── app.module.ts
│
├── common/                ← shared kernel
│   ├── pipes/
│   ├── guards/
│   ├── filters/
│   ├── interceptors/
│   ├── decorators/
│   └── middleware/
│
├── config/                ← env, constants
│   ├── env.ts
│   └── pricing-rules.constants.ts
│
├── prisma/                ← infrastructure
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── mail/
├── storage/               ← S3-compat upload
│
└── modules/
    ├── auth/
    ├── users/
    ├── tutors/
    ├── students/
    ├── taxonomy/         ← subjects + levels + qualifications
    ├── courses/
    ├── enrollments/
    ├── availabilities/
    ├── bookings/
    ├── assignments/
    ├── meetings/         ← Jitsi
    ├── calendar/         ← iCal + sessions list
    ├── payments/         ← VNPay
    └── payouts/
```

---

## Slide 14 — Taxonomy: gộp hay tách?

### Quyết định kiến trúc

3 thực thể: `subjects`, `levels`, `qualifications`

**Option A — Tách 3 module:**
```
modules/subjects/
modules/levels/
modules/qualifications/
```
→ Mỗi module < 50 dòng, overkill.

**Option B — Gộp `taxonomy/`:**
```
modules/taxonomy/
├── subjects/
├── levels/
└── qualifications/
```
→ Logic gọn, 3 controller chia rõ.

> ✅ Tutor365 chọn **B** vì 3 entity chia sẻ pattern CRUD đơn giản.

---

## Slide 15 — Service không phải controller

### Đừng đặt HTTP logic trong service

```ts
// ❌ XẤU
@Injectable()
class CoursesService {
  async create(req: Request, res: Response) {
    const body = req.body;
    // ...
    res.status(201).json(course);
  }
}

// ✅ TỐT
@Injectable()
class CoursesService {
  async create(input: CreateCourseInput, currentUserId: string): Promise<Course> {
    // pure business — không biết HTTP
  }
}

@Controller('courses')
class CoursesController {
  @Post()
  async create(@ZodBody(CreateCourseDto) body, @CurrentUser() u) {
    return this.service.create(body, u.id);
  }
}
```

> 💡 Service unit test không cần spin Express.

---

## Slide 16 — Single Responsibility cho service

### Khi service > 300 dòng → tách

**Ví dụ:** `BookingsService` lớn dần

```ts
// Ban đầu — 1 service
@Injectable()
class BookingsService {
  createSingle() {}
  createCombo() {}
  cancel() {}
  filterEligibleTutors() {}   // ← 50 dòng SQL phức tạp
  assign() {}
  reassign() {}
  detectNoShow() {}            // ← cron logic
  reconcileStatus() {}         // ← cron logic
}
```

**Refactor:**

```ts
@Injectable() class BookingsCreateService {}      // create single/combo
@Injectable() class AssignmentsService {}         // eligible filter + assign
@Injectable() class BookingsReconcileService {}   // cron jobs
```

> 💡 **Quy tắc:** 1 service > 300 dòng → có thể chia.

---

## Slide 17 — Test file cạnh source

### Convention `.test.ts` cùng folder

```
modules/courses/
├── courses.service.ts
├── courses.service.test.ts        ← unit test cho service
├── courses.controller.test.ts     ← integration test
└── courses.mapper.test.ts
```

**Lợi ích:**

- Sửa source → nhìn ngay test bên cạnh → đỡ quên cập nhật
- Move/rename file → test đi theo
- Coverage tool tự match source ↔ test

**Anti-pattern:**

```
src/
test/                ← ❌ thư mục riêng
└── courses.spec.ts  ← ❌ xa source
```

---

## Slide 18 — Const file: tách config + token

```ts
// modules/courses/courses.constants.ts
export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');

export const COURSE_STATUSES = [
  'draft',
  'pending_approval',
  'published',
  'rejected',
  'archived',
] as const;
export type CourseStatus = typeof COURSE_STATUSES[number];

export const MAX_LESSONS_PER_CHAPTER = 50;
export const MAX_CHAPTERS_PER_COURSE = 30;
```

> 💡 Một nơi để tìm: hằng số, DI token, type union enum.

---

## Slide 19 — Scaffold 14 module rỗng

### Script tạo cấu trúc nhanh

```bash
# tools/scaffold-module.sh
MODULE=$1
mkdir -p apps/api/src/modules/$MODULE/{dto,repositories}
touch apps/api/src/modules/$MODULE/$MODULE.module.ts
touch apps/api/src/modules/$MODULE/$MODULE.controller.ts
touch apps/api/src/modules/$MODULE/$MODULE.service.ts
touch apps/api/src/modules/$MODULE/$MODULE.repository.ts
touch apps/api/src/modules/$MODULE/$MODULE.constants.ts
touch apps/api/src/modules/$MODULE/index.ts
```

```bash
for m in auth users tutors students taxonomy courses enrollments \
         availabilities bookings assignments meetings calendar \
         payments payouts; do
  bash tools/scaffold-module.sh $m
done
```

→ Cấu trúc 14 module sẵn sàng fill code.

---

## Slide 20 — Anti-patterns

```ts
// ❌ God service (1000 dòng)
class TutorsService {
  approve() {}
  createCourse() {}
  bookSession() {}
  payout() {}
  // → tách thành 4-5 service
}

// ❌ Import service xuyên module không qua module
// auth.service.ts
import { UsersService } from '../users/users.service';  // ❌ không import UsersModule
// → DI fail vì chưa export UsersService

// ❌ Export internal helper
// courses/index.ts
export * from './courses.service';
export * from './repositories/in-memory.repository';  // ❌ leak impl

// ❌ Đặt DB query trong controller
@Controller()
class CoursesController {
  @Get()
  list() {
    return this.prisma.course.findMany();  // ❌ skip service
  }
}
```

---

## Slide 21 — Bài tập thực hành

### 🎯 Scaffold + sanity check

**Bài 1:** Tạo script `tools/scaffold-module.sh`, scaffold đủ 14 module.

**Bài 2:** Implement `CoursesModule` tối thiểu:
- DI token `COURSE_REPOSITORY`
- Interface `CourseRepository`
- InMemory impl
- Service `findById()` + `create()`
- Controller 2 endpoint
- Export qua `index.ts`

**Bài 3:** Thêm `EnrollmentsModule` inject `CoursesService`. Verify import qua module hierarchy chạy được.

**Bài 4:** Cố ý tạo circular import (CoursesService → EnrollmentsService → CoursesService) → quan sát NestJS báo lỗi. Fix bằng `forwardRef()` hoặc redesign.

**Bài 5:** Đo: `cloc apps/api/src/modules/<name>` — module nào > 300 dòng service → đề xuất tách.

---

## Slide 22 — Tổng kết Video 5

### Bạn vừa học

- ✅ Feature-based folder structure cho 14 module
- ✅ Pattern Controller → Service → Repository → Mapper
- ✅ DI token + interface cho repository (swap impl không sửa service)
- ✅ 3-tier hierarchy: Shared → Infrastructure → Feature
- ✅ Tránh circular import (event bus / 1-chiều dependency)
- ✅ Naming convention thực tế
- ✅ Test file cạnh source
- ✅ Scaffold script tự động

> 💪 Architecture clean = sửa code 6 tháng sau vẫn nhanh

---

## Slide 23 — Section 1 hoàn tất

### Bạn đã build xong nền tảng

✅ V01 — Kiến trúc Tutor365 tổng quan
✅ V02 — Bootstrap NestJS production-ready
✅ V03 — Request lifecycle 6 layer
✅ V04 — Zod validation pipeline
✅ V05 — Modular design + folder convention

**Section 2 — Auth + Roles** (4 video) sẽ dùng skeleton này để build:

- Signup + email verification
- Login + JWT access
- Refresh token rotation
- Role guard 3 vai (Admin/Tutor/Student)

> 🚀 Sang Section 2 — feature đầu tiên của Tutor365!

---

<!-- _class: lead -->

# Tiếp theo: Video 6

## Signup + Email Verification

User signup với bcrypt, generate verify token, send email qua MailPit, verify endpoint, expire token sau 24h.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 6 🚀

> *"Boundaries are where ideas become invariants."*
