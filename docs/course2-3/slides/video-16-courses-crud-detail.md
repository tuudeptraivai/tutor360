---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 16: Courses CRUD + Detail Public'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Courses CRUD
# + Detail Public

### Khóa 2-3 — Video 16

**Tutor tạo · Slug · Filter · Storefront**

> Marketplace core: course là sản phẩm bán

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `courses` 15 field chính
- ✅ Tutor CRUD course (chỉ own)
- ✅ Public list course với filter subject/level/price/q
- ✅ Public detail by slug (SEO friendly)
- ✅ Auto-generate slug + uniqueness
- ✅ State machine 5 trạng thái (preview V20)
- ✅ Search ILIKE + pagination cursor (FE infinite scroll)

> 🎯 Cuối video: Storefront 10 course mẫu render được

---

## Slide 3 — Schema `courses` đầy đủ

```ts
type Course = {
  id: string;
  tutorId: string;                         // FK
  subjectId: string;                       // FK
  levelId: string;                         // FK
  title: string;                           // "Toán nâng cao Lớp 10"
  slug: string;                            // "toan-nang-cao-lop-10"
  shortDescription: string | null;         // dùng cho card
  description: string | null;              // markdown — detail page
  coverImageKey: string | null;            // S3 key
  priceVnd: number;                        // 499000
  status: CourseStatus;                    // see slide 4
  durationMinutes: number | null;          // tổng thời lượng video
  language: string;                        // 'vi', 'en'
  publishedAt: Date | null;
  rejectedReason: string | null;
  version: number;                         // optimistic lock
  createdAt: Date;
  updatedAt: Date;
};
```

---

## Slide 4 — State machine course (preview V20)

```
draft                ← Tutor tạo
  → pending_approval (Tutor submit)
  → published        (Hanah approve)
  → rejected         (Hanah reject — Tutor sửa → pending_approval lại)
  → archived         (Tutor stop bán, không quay về published)

archived ─/─▶ published   ❌ rule: 1 chiều
published ─▶ archived     ✅
```

> 💡 Video 16-19 focus draft + published list. Approval ở V20.

---

## Slide 5 — Tutor tạo course

### `POST /v1/courses`

```ts
@Auth('tutor')
@Post()
async create(
  @CurrentUser('sub') tutorId: string,
  @ZodBody(CreateCourseDto) body,
) {
  // Check tutor approved
  const profile = await this.tutorsService.findByUserId(tutorId);
  if (profile.approveStatus !== 'approved') {
    throw new ForbiddenException('Hồ sơ Tutor chưa được duyệt');
  }
  return this.courses.create(tutorId, body);
}

// DTO
export const CreateCourseDto = z.object({
  title: z.string().trim().min(5).max(120),
  shortDescription: z.string().max(300).optional(),
  description: z.string().max(20_000).optional(),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  priceVnd: z.number().int().min(0).max(50_000_000),
  language: z.enum(['vi', 'en']).default('vi'),
});
```

---

## Slide 6 — Service.create

```ts
async create(tutorId: string, input: CreateCourseInput) {
  // Validate subject + level exists
  const [subject, level] = await Promise.all([
    this.prisma.subject.findUnique({ where: { id: input.subjectId, isActive: true } as any }),
    this.prisma.level.findUnique({ where: { id: input.levelId, isActive: true } as any }),
  ]);
  if (!subject) throw new BadRequestException('Subject không hợp lệ');
  if (!level) throw new BadRequestException('Level không hợp lệ');

  // Generate slug
  const slug = await this.generateUniqueSlug(input.title);

  return this.prisma.course.create({
    data: {
      ...input,
      tutorId,
      slug,
      status: 'draft',
      version: 1,
    },
  });
}
```

---

## Slide 7 — Update course (tutor own)

```ts
@Auth('tutor', 'admin')
@Patch(':id')
async update(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
  @ZodBody(UpdateCourseDto) body,
) {
  return this.courses.update(id, body, u);
}

// Service: check ownership
async update(id: string, input: UpdateCourseInput, user: JwtPayload) {
  const course = await this.findById(id);
  if (user.role !== 'admin' && course.tutorId !== user.sub) {
    throw new ForbiddenException();
  }

  // Update title → regenerate slug? KHÔNG — slug stable
  return this.prisma.course.update({
    where: { id, version: course.version },     // optimistic lock
    data: {
      ...input,
      version: { increment: 1 },
    },
  });
}
```

---

## Slide 8 — UpdateCourseDto: partial

```ts
export const UpdateCourseDto = CreateCourseDto.partial().extend({
  // status không cho user tự đổi — phải qua endpoint riêng (submit, archive)
});

// Nhưng cho phép tutor archive own course:
@Auth('tutor', 'admin')
@Post(':id/archive')
async archive(@Param('id') id, @CurrentUser() u) {
  return this.courses.archive(id, u);
}

async archive(id, user) {
  const course = await this.findById(id);
  if (user.role !== 'admin' && course.tutorId !== user.sub) {
    throw new ForbiddenException();
  }
  if (course.status === 'archived') return course;
  return this.prisma.course.update({
    where: { id },
    data: { status: 'archived' },
  });
}
```

---

## Slide 9 — Public list với filter

### `GET /v1/courses`

```ts
@Public()
@Get()
list(@ZodQuery(ListCoursesQuery) q) {
  return this.courses.publicList(q);
}

// Query
export const ListCoursesQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),         // alternative pagination

  subjectId: z.string().uuid().optional(),
  subjectSlug: z.string().optional(),     // for friendly URL
  levelId: z.string().uuid().optional(),
  levelSlug: z.string().optional(),

  tutorId: z.string().uuid().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  language: z.enum(['vi', 'en']).optional(),
  q: z.string().trim().max(100).optional(),

  sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'popular'])
    .default('newest'),
});
```

---

## Slide 10 — publicList implementation

```ts
async publicList(q: ListCoursesQueryInput) {
  const where: Prisma.CourseWhereInput = {
    status: 'published',
  };
  if (q.subjectId) where.subjectId = q.subjectId;
  if (q.subjectSlug) where.subject = { slug: q.subjectSlug };
  if (q.levelId) where.levelId = q.levelId;
  if (q.levelSlug) where.level = { slug: q.levelSlug };
  if (q.tutorId) where.tutorId = q.tutorId;
  if (q.language) where.language = q.language;
  if (q.minPrice !== undefined) where.priceVnd = { gte: q.minPrice };
  if (q.maxPrice !== undefined) where.priceVnd = { ...(where.priceVnd as any), lte: q.maxPrice };
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { shortDescription: { contains: q.q, mode: 'insensitive' } },
    ];
  }

  const orderBy = this.toOrderBy(q.sort);
  const [items, total] = await this.prisma.$transaction([
    this.prisma.course.findMany({
      where, orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { subject: true, level: true, tutor: { select: { id: true, fullName: true } } },
    }),
    this.prisma.course.count({ where }),
  ]);
  return { items: items.map(toCourseCard), total, page: q.page, pageSize: q.pageSize };
}
```

---

## Slide 11 — Sort mapping

```ts
private toOrderBy(sort: string): Prisma.CourseOrderByWithRelationInput {
  const map = {
    newest: { createdAt: 'desc' as const },
    oldest: { createdAt: 'asc' as const },
    price_asc: { priceVnd: 'asc' as const },
    price_desc: { priceVnd: 'desc' as const },
    popular: {
      enrollments: { _count: 'desc' as const },   // sort by enrollment count
    },
  };
  return map[sort];
}
```

> 💡 `popular` sort = aggregate count enrollments. Section 20 tối ưu với materialized view.

---

## Slide 12 — Public detail by slug

### `GET /v1/courses/:slug`

```ts
@Public()
@Get(':slug')
async detail(@Param('slug') slug: string) {
  const course = await this.courses.findPublishedBySlug(slug);
  if (!course) throw new NotFoundException();
  return toCourseDetail(course);
}

// Service
async findPublishedBySlug(slug: string) {
  return this.prisma.course.findFirst({
    where: { slug, status: 'published' },
    include: {
      subject: true,
      level: true,
      tutor: { include: { tutorProfile: true } },
      chapters: {
        include: { lessons: true },
        orderBy: { position: 'asc' },
      },
      _count: { select: { enrollments: true, reviews: true } },
    },
  });
}
```

---

## Slide 13 — Cover image upload

### Cover image của course

```ts
@Auth('tutor', 'admin')
@Post(':id/cover-image')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
async uploadCover(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
  @UploadedFile() file: Express.Multer.File,
) {
  const course = await this.courses.findById(id);
  if (u.role !== 'admin' && course.tutorId !== u.sub) throw new ForbiddenException();

  // Validate magic bytes (V12 utility)
  const fmt = detectImageFormat(file.buffer);
  if (!fmt) throw new BadRequestException('File không phải ảnh hợp lệ');

  // Resize 1280x720 ratio 16:9
  const optimized = await sharp(file.buffer)
    .resize(1280, 720, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();

  const key = `course-covers/${id}/${randomUUID()}.webp`;
  await this.storage.put({ key, body: optimized, contentType: 'image/webp' });

  if (course.coverImageKey) {
    await this.storage.delete(course.coverImageKey).catch(() => {});
  }

  await this.prisma.course.update({
    where: { id },
    data: { coverImageKey: key },
  });

  return { coverUrl: await this.storage.presignedUrl(key, 3600) };
}
```

---

## Slide 14 — Tutor list own courses

```ts
@Auth('tutor')
@Get('me/courses')
async listMine(
  @CurrentUser('sub') tutorId: string,
  @ZodQuery(ListMyCoursesQuery) q,
) {
  return this.courses.listByTutor(tutorId, q);
}

// query
const ListMyCoursesQuery = z.object({
  status: z.enum(['draft', 'pending_approval', 'published', 'rejected', 'archived', 'all']).default('all'),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().max(100).default(20),
});

// Service
async listByTutor(tutorId, q) {
  const where = { tutorId };
  if (q.status !== 'all') where.status = q.status;
  return this.prisma.course.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    skip: (q.page - 1) * q.pageSize,
    take: q.pageSize,
  });
}
```

---

## Slide 15 — Mapper: toCourseCard vs toCourseDetail

```ts
// Card cho list (gọn)
export function toCourseCard(c: CourseWithRelations) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    shortDescription: c.shortDescription,
    coverImageUrl: c.coverImageKey
      ? presignedUrl(c.coverImageKey, 3600)
      : null,
    priceVnd: c.priceVnd,
    language: c.language,
    subject: { id: c.subject.id, name: c.subject.name, slug: c.subject.slug },
    level: { id: c.level.id, name: c.level.name },
    tutor: { id: c.tutor.id, fullName: c.tutor.fullName },
  };
}

// Detail cho trang chi tiết (đầy đủ)
export function toCourseDetail(c) {
  return {
    ...toCourseCard(c),
    description: c.description,
    durationMinutes: c.durationMinutes,
    publishedAt: c.publishedAt,
    chapters: c.chapters.map(toChapterDetail),    // có lessons
    enrollmentCount: c._count.enrollments,
    reviewCount: c._count.reviews,
  };
}
```

---

## Slide 16 — Test curl

```bash
# Tutor tạo
curl -X POST /v1/courses \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"title":"Toán nâng cao Lớp 10","subjectId":"<>","levelId":"<>","priceVnd":499000}'
# { id, slug: "toan-nang-cao-lop-10", status: "draft", ... }

# Tutor list own
curl /v1/me/courses?status=draft -H "Authorization: Bearer $TUTOR"

# Public list — chưa thấy vì draft
curl /v1/courses

# (Sau V20 approve) Public list
curl /v1/courses?subjectSlug=toan-hoc
curl /v1/courses?levelSlug=lop-10&maxPrice=500000
curl '/v1/courses?q=nang%20cao&sort=price_asc'

# Public detail
curl /v1/courses/toan-nang-cao-lop-10
```

---

## Slide 17 — Anti-patterns

```ts
// ❌ Tutor xem course của tutor khác qua slug
// → ownership check ở findById/update/delete

// ❌ Public list trả course draft
where.status: { in: ['draft', 'published'] }   // ❌

// ❌ Đổi slug mỗi lần update title
// → URL bookmark chết
// → Tutor sửa typo trong title → SEO mất

// ❌ Không validate subject/level exists
data: { subjectId: 'arbitrary' }   // FK error vague

// ❌ Trả course detail kèm passwordHash của tutor
include: { tutor: true }   // → leak password
// → tutor: { select: { id: true, fullName: true } }

// ❌ Sort popular bằng nested count mỗi query
// → query O(N) — Section 20 tối ưu
```

---

## Slide 18 — Edge cases

| Case | Behavior |
|------|----------|
| Title duplicate | Slug auto `name-1` |
| Tutor không approved tạo course | 403 |
| Course có 0 lesson submit approval | V17 — block ở submit |
| `minPrice=600000&maxPrice=300000` | Empty result (logic conflict, không throw) |
| Cover upload fail giữa chừng | Course không update key, file orphan → cron cleanup |
| Concurrent update | Optimistic lock version mismatch → 409 |

---

## Slide 19 — Bài tập thực hành

### 🎯 Course CRUD foundation

**Bài 1:** Implement schema + migration `courses`.

**Bài 2:** Implement 6 endpoint Tutor:
- POST /v1/courses
- GET /v1/me/courses
- GET /v1/courses/:id
- PATCH /v1/courses/:id
- POST /v1/courses/:id/cover-image
- POST /v1/courses/:id/archive

**Bài 3:** Implement public:
- GET /v1/courses (list + filter + sort)
- GET /v1/courses/:slug (detail)

**Bài 4:** Test filter:
- `?subjectSlug=toan-hoc&levelSlug=lop-10`
- `?minPrice=100000&maxPrice=500000`
- `?q=nâng cao&sort=price_asc`

**Bài 5:** Verify draft course KHÔNG hiện ở public list.

---

## Slide 20 — Tổng kết Video 16

### Bạn vừa học

- ✅ Schema `courses` 15 field
- ✅ State machine 5 trạng thái
- ✅ Tutor CRUD với ownership check
- ✅ Slug auto từ title, stable không đổi khi update
- ✅ Optimistic lock với `version`
- ✅ Public list 10 filter + 5 sort
- ✅ Public detail by slug (SEO)
- ✅ Cover image upload + resize 16:9 webp
- ✅ Tutor list own courses theo status
- ✅ Mapper card vs detail

> 💪 Course CRUD chuẩn = mặt tiền marketplace

---

<!-- _class: lead -->

# Tiếp theo: Video 17

## Course Chapters + Lessons CRUD

Chapter trong course, lesson trong chapter, types video/pptx/pdf/text, position ordering.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 17 🚀

> *"A course without lessons is a promise without delivery."*
