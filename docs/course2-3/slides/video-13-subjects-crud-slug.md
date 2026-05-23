---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 13: Subjects CRUD + Slug + Assign cho Tutor'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Subjects CRUD
# + Slug + Assign

### Khóa 2-3 — Video 13

**Môn học master data — CRUD + tutor declare**

> Master data đơn giản nhưng cần đúng từ ngày đầu

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Bảng `subjects` + endpoint CRUD admin
- ✅ Bảng `tutor_subjects` (N:N) + endpoint declare
- ✅ Auto-generate **slug** từ name (slugify VN)
- ✅ Public endpoint **list subjects** (Student xem khi book)
- ✅ Xử lý **delete subject** đang được tutor / course dùng (soft delete)
- ✅ Seed dữ liệu mẫu (Math, Physics, Chemistry, ...)

> 🎯 Cuối video: 12 subject mẫu sẵn, Tutor declare được, Student filter được

---

## Slide 3 — Schema subjects

```ts
type Subject = {
  id: string;                        // uuid
  name: string;                      // "Toán học"
  slug: string;                      // "toan-hoc" — UNIQUE
  description: string | null;
  iconUrl: string | null;
  position: number;                  // sort order trong list
  isActive: boolean;                 // soft toggle
  createdAt: Date;
  updatedAt: Date;
};

// N:N
type TutorSubject = {
  tutorId: string;                   // PK composite
  subjectId: string;
  createdAt: Date;
};
```

> 💡 Subject ít thay đổi → master data chuẩn. Position cho phép Hanah re-order.

---

## Slide 4 — Slugify cho tiếng Việt

```ts
// common/utils/slugify.ts
const VI_MAP: Record<string, string> = {
  'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
  'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
  'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
  'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
  'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
  'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
  'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
  'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
  'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
  'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
  'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
  'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
  'đ': 'd',
};

export function slugify(s: string): string {
  return s.toLowerCase().split('').map(c => VI_MAP[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// slugify("Toán Học") → "toan-hoc"
```

---

## Slide 5 — Generate unique slug

```ts
// modules/taxonomy/subjects/subjects.service.ts
async generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 1;
  while (await this.repo.existsBySlug(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}
```

**Ví dụ:**

```
name: "Toán học"     → slug: "toan-hoc"
name: "Toán Học"     → slug: "toan-hoc-1"   (đã có "toan-hoc")
name: "Toán-học"     → slug: "toan-hoc-2"
```

---

## Slide 6 — Admin CRUD endpoints

```ts
@Controller({ path: 'admin/subjects', version: '1' })
@AdminOnly()
export class AdminSubjectsController {
  constructor(private subjects: SubjectsService) {}

  @Get()
  list(@ZodQuery(ListSubjectsQuery) q) { return this.subjects.adminList(q); }

  @Post()
  create(@ZodBody(CreateSubjectDto) body) { return this.subjects.create(body); }

  @Patch(':id')
  update(@Param('id') id, @ZodBody(UpdateSubjectDto) body) {
    return this.subjects.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id) { return this.subjects.softDelete(id); }

  @Post(':id/reorder')
  reorder(@Param('id') id, @ZodBody(ReorderDto) body) {
    return this.subjects.reorder(id, body.position);
  }
}
```

---

## Slide 7 — DTO + slug auto

```ts
// dto/create-subject.dto.ts
export const CreateSubjectDto = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  position: z.number().int().min(0).default(0),
  // KHÔNG nhận slug — tự sinh từ name
});

// Service
async create(input: CreateSubjectInput) {
  const slug = await this.generateUniqueSlug(input.name);
  return this.repo.insert({ ...input, slug });
}
```

> 💡 Nếu cho phép custom slug → thêm field `slug` optional, fallback generate.

---

## Slide 8 — Public list endpoint

```ts
@Public()
@Get('subjects')
list() {
  return this.subjects.listActive();
}

// Service
async listActive() {
  return this.prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, slug: true, iconUrl: true },
  });
}
```

> 💡 Không paginate — subjects ≤ 30 mục, FE render dropdown / chip list.

---

## Slide 9 — Tutor declare subjects

### `PATCH /v1/tutor-profile` (đã ở V11) — refresh

```ts
async updateOwn(tutorId: string, input: UpdateTutorProfileInput) {
  // ...
  if (input.subjectIds) {
    // Validate tất cả subjectId tồn tại + active
    const existing = await this.prisma.subject.findMany({
      where: { id: { in: input.subjectIds }, isActive: true },
      select: { id: true },
    });
    if (existing.length !== input.subjectIds.length) {
      throw new BadRequestException('Một số subjectId không hợp lệ');
    }

    await this.prisma.tutorSubject.deleteMany({ where: { tutorId } });
    await this.prisma.tutorSubject.createMany({
      data: input.subjectIds.map(subjectId => ({ tutorId, subjectId })),
    });
  }
}
```

---

## Slide 10 — Delete subject: soft vs hard

### Hard delete nguy hiểm

```sql
DELETE FROM subjects WHERE id = 's-math';
-- ❌ Cascade xoá tutor_subjects, courses, ...?
-- → Mất data lịch sử
-- → Tutor "tôi đã dạy Toán" biến mất
```

**Pattern: soft delete = set `isActive=false`**

```ts
async softDelete(id: string) {
  await this.prisma.subject.update({
    where: { id },
    data: { isActive: false },
  });
}
```

**Behavior:**

- ✅ Tutor đã declare subject này vẫn giữ row
- ✅ Course đã thuộc subject này vẫn link được
- ❌ Public list không hiện subject này
- ❌ Hanah list filter `isActive=false` để xem subject ẩn

---

## Slide 11 — Reorder position

### Hanah kéo thả thứ tự

```ts
async reorder(id: string, newPosition: number) {
  await this.prisma.$transaction(async (tx) => {
    const subject = await tx.subject.findUnique({ where: { id } });
    if (!subject) throw new NotFoundException();

    if (newPosition < subject.position) {
      // Move lên → shift các subject từ newPosition đến cũ - 1 xuống 1
      await tx.subject.updateMany({
        where: {
          position: { gte: newPosition, lt: subject.position },
          id: { not: id },
        },
        data: { position: { increment: 1 } },
      });
    } else if (newPosition > subject.position) {
      // Move xuống → shift các subject từ cũ + 1 đến newPosition lên 1
      await tx.subject.updateMany({
        where: {
          position: { gt: subject.position, lte: newPosition },
          id: { not: id },
        },
        data: { position: { decrement: 1 } },
      });
    }

    await tx.subject.update({ where: { id }, data: { position: newPosition } });
  });
}
```

---

## Slide 12 — Seed dữ liệu mẫu

```ts
// prisma/seed.ts (preview Section 19)
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
  { name: 'Giáo dục công dân', position: 9 },
  { name: 'IELTS', position: 10 },
  { name: 'SAT', position: 11 },
];

for (const s of SUBJECTS) {
  await prisma.subject.upsert({
    where: { slug: slugify(s.name) },
    update: {},
    create: { ...s, slug: slugify(s.name) },
  });
}
```

---

## Slide 13 — Test curl

```bash
# Public list
curl /v1/subjects
# [ { id, name: "Toán học", slug: "toan-hoc", iconUrl }, ... ]

# Admin tạo
curl -X POST /v1/admin/subjects \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"name":"Lập trình"}'
# { id, slug: "lap-trinh", ... }

# Admin update
curl -X PATCH /v1/admin/subjects/<id> \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"description":"Khoá học lập trình từ cơ bản"}'

# Admin soft delete
curl -X DELETE /v1/admin/subjects/<id> -H "Authorization: Bearer $ADMIN"

# Public list không thấy subject vừa delete
curl /v1/subjects

# Tutor declare subjects
curl -X PATCH /v1/tutor-profile \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"subjectIds":["<math-id>","<physics-id>"]}'
```

---

## Slide 14 — Count tutor/course mỗi subject

### Admin dashboard: subject nào hot

```ts
async adminListWithStats() {
  const rows = await this.prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: {
      _count: {
        select: {
          tutorSubjects: true,
          courses: { where: { status: 'published' } },
        },
      },
    },
  });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    tutorCount: r._count.tutorSubjects,
    courseCount: r._count.courses,
  }));
}
```

**Output:**

```json
[
  { "name": "Toán học", "tutorCount": 15, "courseCount": 8 },
  { "name": "Vật lý", "tutorCount": 7, "courseCount": 4 }
]
```

---

## Slide 15 — Filter course by subject (preview Section 5)

### Public storefront

```ts
@Public()
@Get('courses')
list(@ZodQuery(ListCoursesQuery) q) {
  return this.courses.publicList(q);
}

// query
const ListCoursesQuery = z.object({
  subjectId: z.string().uuid().optional(),
  subjectSlug: z.string().optional(),       // alternative để FE friendly URL
  levelId: z.string().uuid().optional(),
  // ...
});
```

**FE URL:**

```
/courses?subjectSlug=toan-hoc&level=lop-10
```

> 💡 Slug dùng cho URL FE đẹp, ID dùng cho stable identity.

---

## Slide 16 — Anti-patterns

```ts
// ❌ Lưu slug bằng ngôn ngữ gốc
slug: "Toán học"   // → URL: /courses?subject=Toán%20học (ugly)

// ❌ Slug có chứa ký tự đặc biệt
slug: "math/grade-10"  // → URL conflict /courses/math/grade-10

// ❌ Hard delete subject
DELETE FROM subjects ...   // → cascade nhân quả

// ❌ Tutor pick subject text tự do
tutor_subject: { subjectName: "Toán" }   // → typo "Toan", "Tóan" loạn

// ❌ Subject duplicate name khác slug
{ name: "Toán Học", slug: "toan-hoc-2" }   // user confuse

// ❌ Not validate subjectIds tồn tại
await createMany({ data: [{subjectId: 'invalid-uuid'}] })  // FK error vague
```

---

## Slide 17 — Edge cases

| Case | Behavior |
|------|----------|
| Tạo subject trùng name | Slug auto thêm `-1`, `-2`, ... |
| Update name → có cập nhật slug? | ❌ Không — slug stable cho URL bookmark |
| Soft delete subject đang có 50 tutor declare | OK — tutor_subjects giữ nguyên |
| Reactive subject (set isActive=true) | OK, position giữ nguyên |
| Reorder ra ngoài range | Validate `0 <= position < count` |
| Tutor declare subjectId inactive | Reject ở `updateOwn` |

---

## Slide 18 — Performance: cache subjects

### Master data hiếm thay đổi → cache

```ts
@Injectable()
export class SubjectsService {
  private cache: Subject[] | null = null;
  private cacheAt = 0;
  private TTL = 5 * 60_000;  // 5 phút

  async listActive() {
    if (this.cache && Date.now() - this.cacheAt < this.TTL) {
      return this.cache;
    }
    this.cache = await this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });
    this.cacheAt = Date.now();
    return this.cache;
  }

  // Invalidate khi update
  async create(input) { /* ... */ this.cache = null; }
  async update(id, input) { /* ... */ this.cache = null; }
}
```

> 💡 C6 chuyển qua Redis cache. MVP in-memory đủ.

---

## Slide 19 — Bài tập thực hành

### 🎯 Subjects master data

**Bài 1:** Implement `slugify()` cho VN + test cases unit.

**Bài 2:** Seed 12 subject (slide 12).

**Bài 3:** Implement admin CRUD 5 endpoint + public list.

**Bài 4:** Test:
- Tạo "Toán học" + "Toán Học" → slug khác nhau (`toan-hoc`, `toan-hoc-1`)
- Soft delete + verify public list không có

**Bài 5:** Implement reorder position. Test scenario:
- 3 subject [A, B, C] với position [0, 1, 2]
- Move C → position 0 → A B C trở thành [1, 2, 0]
- Re-sort → C, A, B

**Bài 6:** Implement admin list với count tutor + course. Verify số đúng sau khi tutor declare.

---

## Slide 20 — Tổng kết Video 13

### Bạn vừa học

- ✅ Schema `subjects` + `tutor_subjects` N:N
- ✅ Slugify VN với 60+ mapping ký tự
- ✅ Generate unique slug auto `name → name-1 → name-2`
- ✅ Admin CRUD 5 endpoint + public list
- ✅ Soft delete = `isActive=false` giữ lịch sử
- ✅ Reorder position với transaction shift
- ✅ Cross-module: Tutor declare subject với validate
- ✅ Stats: count tutor + course per subject
- ✅ Cache in-memory 5 phút cho master data

> 💪 Master data đúng = nền tảng cho filter / search về sau

---

<!-- _class: lead -->

# Tiếp theo: Video 14

## Levels CRUD + Assign cho Tutor

Levels (Lớp 1 ... Lớp 12, IELTS Band, SAT Score). Pattern giống Subjects, focus khác biệt.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 14 🚀

> *"Master data is boring until it isn't."*
