---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 14: Levels CRUD + Assign cho Tutor'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Levels CRUD
# + Assign cho Tutor

### Khóa 2-3 — Video 14

**Lớp 1-12 · IELTS Band · SAT Score**

> Subject là gì × Level là trình độ — không trộn lẫn

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **vì sao tách Subject vs Level**
- ✅ Schema `levels` + N:N `tutor_levels`
- ✅ Filter trong eligible-tutor query (Section 10) — preview
- ✅ Pattern **CRUD copy từ Subjects** — biết tách module nào không
- ✅ Seed 17 level VN + quốc tế
- ✅ Tutor declare levels + Student filter

> 🎯 Cuối video: 17 level sẵn sàng cho course catalog

---

## Slide 3 — Subject vs Level: khác biệt

### Cẩn thận không nhầm

| | Subject | Level |
|--|---------|-------|
| Là gì | Môn học (Toán, Lý, ...) | Trình độ (Lớp 10, IELTS 7.0, SAT 1400) |
| Tutor declare | "Tôi dạy Toán + Lý" | "Tôi dạy Lớp 10-12" |
| Course thuộc | 1 subject | 1 level (hoặc range) |
| Booking filter | `subjectId` | `levelId` |
| Số lượng | ~12 | ~17 |

> 💡 **Quan trọng:** Một Tutor có thể dạy Toán cho cả Lớp 6 và Lớp 12. Subject × Level là combination, không phải hierarchy.

---

## Slide 4 — Schema `levels`

```ts
type Level = {
  id: string;
  name: string;                       // "Lớp 10", "IELTS 6.5-7.0"
  slug: string;                       // "lop-10", "ielts-6-5-7-0"
  group: 'school' | 'ielts' | 'sat' | 'toefl' | 'other';
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// N:N
type TutorLevel = {
  tutorId: string;
  levelId: string;
};
```

> 💡 `group` cho phép FE filter "chỉ hiện Level học phổ thông" hoặc "chỉ IELTS".

---

## Slide 5 — Seed dữ liệu

```ts
const LEVELS = [
  // Phổ thông
  { group: 'school', name: 'Lớp 1', position: 0 },
  { group: 'school', name: 'Lớp 2', position: 1 },
  // ... Lớp 3 ... Lớp 12
  { group: 'school', name: 'Lớp 12', position: 11 },

  // IELTS
  { group: 'ielts', name: 'IELTS 4.0-5.0', position: 100 },
  { group: 'ielts', name: 'IELTS 5.0-6.0', position: 101 },
  { group: 'ielts', name: 'IELTS 6.0-7.0', position: 102 },
  { group: 'ielts', name: 'IELTS 7.0+', position: 103 },

  // SAT
  { group: 'sat', name: 'SAT 1200-1400', position: 200 },
  { group: 'sat', name: 'SAT 1400+', position: 201 },
];

for (const l of LEVELS) {
  await prisma.level.upsert({
    where: { slug: slugify(l.name) },
    update: {},
    create: { ...l, slug: slugify(l.name) },
  });
}
```

---

## Slide 6 — Endpoint mapping

Giống Subjects (slide 6 của V13):

| Method | Path | Role |
|--------|------|------|
| GET | `/v1/levels` | public |
| GET | `/v1/levels?group=ielts` | public |
| POST | `/v1/admin/levels` | admin |
| PATCH | `/v1/admin/levels/:id` | admin |
| DELETE | `/v1/admin/levels/:id` | admin |
| POST | `/v1/admin/levels/:id/reorder` | admin |

---

## Slide 7 — DTO levels có thêm `group`

```ts
export const CreateLevelDto = z.object({
  name: z.string().trim().min(2).max(60),
  group: z.enum(['school', 'ielts', 'sat', 'toefl', 'other']),
  position: z.number().int().min(0).default(0),
});

export const ListLevelsQuery = z.object({
  group: z.enum(['school', 'ielts', 'sat', 'toefl', 'other', 'all']).default('all'),
});
```

---

## Slide 8 — Public list filter theo group

```ts
@Public()
@Get('levels')
list(@ZodQuery(ListLevelsQuery) q) {
  return this.levels.listActive(q.group);
}

// Service
async listActive(group: string) {
  const where: any = { isActive: true };
  if (group !== 'all') where.group = group;
  return this.prisma.level.findMany({
    where,
    orderBy: { position: 'asc' },
    select: { id: true, name: true, slug: true, group: true },
  });
}
```

**FE call:**

```bash
curl /v1/levels?group=school   # 12 lớp
curl /v1/levels?group=ielts    # 4 band
curl /v1/levels                # tất cả 17
```

---

## Slide 9 — Tách module hay gộp `taxonomy/`?

### Quyết định kiến trúc V05

Gộp 3 entity (subjects + levels + qualifications) → 1 module `taxonomy/`

```
modules/taxonomy/
├── taxonomy.module.ts
├── subjects/
│   ├── subjects.controller.ts
│   ├── subjects.service.ts
│   └── ...
├── levels/
│   └── ...
└── qualifications/
    └── ...
```

**Pros:**

- ✅ 3 entity nhỏ — không cần 3 module riêng
- ✅ Chung pattern CRUD slug — dễ refactor về sau
- ✅ Tutor profile depend `taxonomy.*` 1 lần thay vì 3

---

## Slide 10 — Refactor: BaseCrudService

### 3 entity giống pattern → trừu tượng hoá

```ts
// taxonomy/base-crud.service.ts
abstract class BaseTaxonomyService<T extends { id: string; slug: string; name: string; position: number }> {
  abstract repo: TaxonomyRepository<T>;
  abstract entityName: string;

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

  async create(input: { name: string } & Omit<T, 'id' | 'slug'>) {
    const slug = await this.generateUniqueSlug(input.name);
    return this.repo.insert({ ...input, slug });
  }

  async softDelete(id: string) {
    return this.repo.update(id, { isActive: false } as any);
  }
}
```

> ⚠️ Trade-off: trừu tượng giúp DRY nhưng tăng độ phức tạp. Tutor365 chọn **copy code 3 lần** vì code không quá nhiều — đỡ cognitive overhead.

---

## Slide 11 — Tutor declare levels

### Trong `PATCH /v1/tutor-profile`

```ts
// (đã có ở V11) — extend
async updateOwn(tutorId, input) {
  // ...
  if (input.levelIds) {
    // Validate
    const existing = await this.prisma.level.findMany({
      where: { id: { in: input.levelIds }, isActive: true },
      select: { id: true },
    });
    if (existing.length !== input.levelIds.length) {
      throw new BadRequestException('Một số levelId không hợp lệ');
    }

    await this.prisma.tutorLevel.deleteMany({ where: { tutorId } });
    await this.prisma.tutorLevel.createMany({
      data: input.levelIds.map(levelId => ({ tutorId, levelId })),
    });
  }
}
```

---

## Slide 12 — Course thuộc 1 level

```ts
// schema Section 5
type Course = {
  id: string;
  tutorId: string;
  subjectId: string;             // FK
  levelId: string;               // FK — 1 level / course
  // ...
};
```

**Use case:**

- Course "Toán Lớp 10" → `subjectId=math, levelId=lop-10`
- Course "Toán Lớp 11" → khác course, không reuse

> 💡 Range level (Lớp 10-12) không support — Tutor phải tạo 3 course riêng.

---

## Slide 13 — Eligible-tutor filter (preview Section 10)

```sql
-- Tutor đã declare đúng level cho session booking
SELECT DISTINCT t.user_id
FROM tutor_profiles t
WHERE t.approve_status = 'approved'
  AND EXISTS (
    SELECT 1 FROM tutor_levels tl
    WHERE tl.tutor_id = t.user_id
      AND tl.level_id = :booking_level_id
  )
  AND EXISTS (
    SELECT 1 FROM tutor_subjects ts
    WHERE ts.tutor_id = t.user_id
      AND ts.subject_id = :booking_subject_id
  )
  -- ... rảnh + không double-book
```

> 💡 Subject + Level kết hợp → tutor đủ điều kiện theo cả 2 trục.

---

## Slide 14 — Test curl

```bash
# Public list filter
curl /v1/levels?group=school
# [ { name: "Lớp 1" }, ... { name: "Lớp 12" } ]

# Admin tạo level mới
curl -X POST /v1/admin/levels \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"name":"TOEFL 80-100","group":"toefl","position":300}'

# Tutor declare
curl -X PATCH /v1/tutor-profile \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"levelIds":["<lop-10-id>","<lop-11-id>","<lop-12-id>"]}'

# Verify
curl /v1/me -H "Authorization: Bearer $TUTOR"
# tutorProfile.levels: [Lớp 10, Lớp 11, Lớp 12]
```

---

## Slide 15 — Group level UI hint

### FE C4 render chip group

```
Subject:  [Toán] [Lý] [Hoá] [Văn] ...

Level:
  Phổ thông: [Lớp 1] [Lớp 2] ... [Lớp 12]
  IELTS:    [4.0-5.0] [5.0-6.0] [6.0-7.0] [7.0+]
  SAT:      [1200-1400] [1400+]
```

**API response cho UI:**

```ts
async listActiveGrouped() {
  const all = await this.listActive('all');
  return all.reduce((acc, l) => {
    (acc[l.group] ??= []).push(l);
    return acc;
  }, {} as Record<string, Level[]>);
}
```

---

## Slide 16 — Phân biệt với "Lớp" của Course

### Đừng nhầm 2 khái niệm "lớp"

| | Level | Course |
|--|-------|--------|
| Là gì | Trình độ Lớp 10 | Khoá "Toán nâng cao Lớp 10" |
| Thuộc | Master data | Tutor tạo |
| Số lượng | 17 | Có thể 100s |
| Field | `level.name = 'Lớp 10'` | `course.title = 'Toán nâng cao Lớp 10'` |

> 💡 "Lớp" trong tiếng Việt vừa nghĩa Grade vừa nghĩa Class. Tutor365 dùng:
> - **Level** = Grade
> - Không có khái niệm "Class" như offline (không có "Lớp 10A1")

---

## Slide 17 — Anti-patterns

```ts
// ❌ Trộn subject với level vào 1 bảng
{ name: "Toán Lớp 10" }   // → mất khả năng query subject riêng

// ❌ Course có level range
{ levelIds: ["lop-10", "lop-11"] }
// → Tutor365 chọn 1 level / course cho đơn giản

// ❌ Tutor declare level bằng text tự do
{ levels: ["Lớp 10, 11", "Cấp 3"] }   // không search được

// ❌ Hard delete level dùng bởi course
DELETE FROM levels WHERE id = ...   // FK violation hoặc cascade

// ❌ Position duplicate
[{ name: "Lớp 10", position: 5 }, { name: "Lớp 11", position: 5 }]
// → order không stable
```

---

## Slide 18 — Edge cases

| Case | Behavior |
|------|----------|
| Tutor declare 0 level | ❌ Hanah không approve được (V11 validation) |
| Tutor declare 17 level | OK — không giới hạn |
| Level inactive nhưng course đang dùng | Course vẫn link, public list không hiện |
| Reorder level cross-group | OK — position độc lập group |
| 2 level cùng `name = "Lớp 10"` | Slug khác (`lop-10`, `lop-10-1`) — Hanah merge thủ công |

---

## Slide 19 — Bài tập thực hành

### 🎯 Levels từ A-Z

**Bài 1:** Seed 17 level (slide 5) qua Prisma seeder.

**Bài 2:** Implement admin CRUD + public list filter `?group=`.

**Bài 3:** Implement `listActiveGrouped()` trả object theo group.

**Bài 4:** Test Tutor declare 5 level → verify `tutor_levels` rows.

**Bài 5:** Cố ý declare `levelId="invalid"` → BadRequest.

**Bài 6:** Bonus: implement `GET /v1/admin/levels?withCounts=true` trả số tutor + course mỗi level.

---

## Slide 20 — Tổng kết Video 14

### Bạn vừa học

- ✅ Phân biệt Subject vs Level rõ ràng
- ✅ Schema `levels` với `group` cho UI filter
- ✅ Seed 17 level VN + quốc tế
- ✅ Endpoint CRUD pattern giống Subjects
- ✅ Module `taxonomy/` gộp 3 entity nhỏ
- ✅ Trade-off: copy code vs abstract base service
- ✅ Tutor declare levels validate FK
- ✅ Course thuộc 1 level (không range)
- ✅ Eligible filter dùng level (preview Section 10)

> 💪 Subject × Level chính xác = filter / search chính xác

---

<!-- _class: lead -->

# Tiếp theo: Video 15

## Qualifications CRUD + Tutor Declare

Bằng cấp / chứng chỉ Tutor (Cử nhân, Thạc sĩ, IELTS 8.0, ...). Pattern giống Subjects + upload certificate.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 15 🚀

> *"Schema is destiny. Choose it carefully."*
