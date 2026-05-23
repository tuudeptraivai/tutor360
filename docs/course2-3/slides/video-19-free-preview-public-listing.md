---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 19: Free Preview + Public Listing'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Free Preview
# + Public Listing

### Khóa 2-3 — Video 19

**Trial lesson · Cursor pagination · Filter advanced**

> Storefront mở: ai cũng vào, nhưng chỉ buyer mới có chìa khoá

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **free preview** đầy đủ cho lesson
- ✅ Public list với **cursor pagination** (FE infinite scroll)
- ✅ Filter combo: subject + level + price range + tutor rating
- ✅ Highlight **best-seller / top-rated** badge
- ✅ Endpoint **`GET /v1/courses/featured`** cho homepage
- ✅ SEO-friendly URL với slug ở mọi tầng

> 🎯 Cuối video: Storefront hoàn chỉnh — Student tìm khoá, xem preview, decide mua

---

## Slide 3 — Free preview policy

### Rule

Mỗi course có thể có **0-3 lesson** đánh dấu `isFreePreview=true`. Student chưa enroll xem được.

```ts
async serveLessonContent(lessonId: string, userId?: string) {
  const lesson = await this.prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { chapter: { include: { course: true } } },
  });
  if (!lesson) throw new NotFoundException();
  const course = lesson.chapter.course;
  if (course.status !== 'published') throw new NotFoundException();

  // Free preview luôn ok
  if (lesson.isFreePreview) {
    return this.signLessonUrl(lesson);
  }

  // Yêu cầu auth
  if (!userId) throw new UnauthorizedException();

  // Tutor own → cho xem
  if (course.tutorId === userId) return this.signLessonUrl(lesson);

  // Enrolled student → cho xem
  const enrolled = await this.enrollmentsService.isEnrolled(userId, course.id);
  if (!enrolled) throw new ForbiddenException();

  return this.signLessonUrl(lesson);
}
```

---

## Slide 4 — Sign lesson URL

```ts
private async signLessonUrl(lesson: Lesson) {
  if (lesson.type === 'text') {
    return { type: 'text', content: lesson.textContent };
  }
  if (!lesson.contentKey) {
    throw new BadRequestException('Lesson chưa có content');
  }
  return {
    type: lesson.type,
    contentUrl: await this.storage.presignedUrl(lesson.contentKey, 3600),
    durationSec: lesson.durationSec,
  };
}
```

> 💡 TTL 1h — đủ cho 1 lesson dài. Nếu video > 1h, FE re-fetch URL khi sắp expire.

---

## Slide 5 — Detail endpoint trả lesson list với flag

```ts
async findPublishedBySlug(slug: string, userId?: string) {
  const course = await this.prisma.course.findFirst({
    where: { slug, status: 'published' },
    include: {
      chapters: {
        include: { lessons: true },
        orderBy: { position: 'asc' },
      },
      // ... subject, level, tutor
    },
  });
  if (!course) return null;

  const enrolled = userId
    ? await this.enrollmentsService.isEnrolled(userId, course.id)
    : false;

  // Map lessons với flag accessible
  course.chapters = course.chapters.map(ch => ({
    ...ch,
    lessons: ch.lessons.map(l => ({
      id: l.id,
      title: l.title,
      type: l.type,
      durationSec: l.durationSec,
      isFreePreview: l.isFreePreview,
      isAccessible: l.isFreePreview || enrolled,    // FE biết khoá / mở
    })),
  }));

  return { ...course, enrolled };
}
```

---

## Slide 6 — Cursor pagination

### Vì sao FE infinite scroll cần cursor?

```
Offset:
  /v1/courses?page=1&pageSize=20 → 20 course
  /v1/courses?page=2&pageSize=20 → 20 course

❌ Vấn đề: giữa 2 request có course mới publish
   → Page 2 có 2 course từng nằm Page 1 (duplicate)
```

**Cursor:** dựa vào ID của row cuối

```
/v1/courses?cursor=null → 20 course, lastId="c-100"
/v1/courses?cursor=c-100 → 20 course tiếp theo, KHÔNG duplicate
```

---

## Slide 7 — Implement cursor pagination

```ts
export const ListCoursesQuery = z.object({
  cursor: z.string().uuid().optional(),    // last seen course id
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // ... existing filters
});

async publicListCursor(q: ListCoursesQueryInput) {
  const where = this.buildWhere(q);

  const items = await this.prisma.course.findMany({
    where,
    orderBy: { id: 'asc' },                  // stable order
    take: q.limit + 1,                       // lấy thừa 1 để check next
    ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
  });

  const hasNext = items.length > q.limit;
  const itemsToReturn = hasNext ? items.slice(0, q.limit) : items;

  return {
    items: itemsToReturn.map(toCourseCard),
    nextCursor: hasNext ? itemsToReturn[itemsToReturn.length - 1].id : null,
  };
}
```

---

## Slide 8 — Sort + cursor: phải order field stable

### Problem

```sql
ORDER BY createdAt DESC
```

Nếu 2 row cùng `createdAt` → order không stable → cursor có thể skip/repeat.

**Fix:** tie-break bằng id

```sql
ORDER BY createdAt DESC, id ASC
```

**Prisma:**

```ts
orderBy: [
  { createdAt: 'desc' },
  { id: 'asc' },
]
```

---

## Slide 9 — Featured courses endpoint

### Homepage hiển thị 3 nhóm

```ts
@Public()
@Get('courses/featured')
async featured() {
  const [bestSellers, topRated, newReleases] = await Promise.all([
    this.bestSellers(8),
    this.topRated(8),
    this.newReleases(8),
  ]);
  return { bestSellers, topRated, newReleases };
}

async bestSellers(limit: number) {
  return this.prisma.course.findMany({
    where: { status: 'published' },
    orderBy: { enrollments: { _count: 'desc' } },
    take: limit,
    include: { subject: true, level: true, tutor: { select: { id: true, fullName: true } } },
  });
}

async topRated(limit) {
  // Average rating descending, min 5 reviews
  return this.prisma.$queryRaw`
    SELECT c.*, AVG(r.rating)::numeric(3,2) as avg_rating, COUNT(r.id) as review_count
    FROM courses c
    LEFT JOIN course_reviews r ON r.course_id = c.id
    WHERE c.status = 'published'
    GROUP BY c.id
    HAVING COUNT(r.id) >= 5
    ORDER BY avg_rating DESC, review_count DESC
    LIMIT ${limit}
  `;
}

async newReleases(limit) {
  return this.prisma.course.findMany({
    where: { status: 'published' },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
}
```

---

## Slide 10 — Card badges

### FE hiển thị tag

```ts
// Mapper
function toCourseCardWithBadges(c: CourseAggregated) {
  const badges: string[] = [];
  if (c.enrollmentCount >= 100) badges.push('BEST_SELLER');
  if (c.avgRating && c.avgRating >= 4.5 && c.reviewCount >= 5) badges.push('TOP_RATED');
  if (Date.now() - c.publishedAt.getTime() < 14 * 86400 * 1000) badges.push('NEW');

  return {
    ...toCourseCard(c),
    badges,
    avgRating: c.avgRating,
    reviewCount: c.reviewCount,
    enrollmentCount: c.enrollmentCount,
  };
}
```

**FE render:**

```
[BEST_SELLER] [TOP_RATED]
Toán nâng cao Lớp 10
⭐ 4.7 (23 reviews) — 156 students
499,000 VND
```

---

## Slide 11 — Filter by tutor rating

```ts
const ListCoursesQuery = z.object({
  // ... existing
  minTutorRating: z.coerce.number().min(0).max(5).optional(),
});

// Filter
if (q.minTutorRating !== undefined) {
  where.tutor = {
    tutorProfile: {
      // calculated separately or stored on profile
      // → ở Section 20 add materialized column
    },
  };
}
```

> 💡 Section 20 dạy cách thêm cached column `avg_rating` trên `tutor_profiles` cập nhật bằng trigger / cron.

---

## Slide 12 — Search ILIKE với pg_trgm

### Search fuzzy "Toan Hoc" match "Toán Học"

```sql
-- Enable extension (Section 17)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_courses_title_trgm
  ON courses USING gin (title gin_trgm_ops);

CREATE INDEX idx_courses_desc_trgm
  ON courses USING gin (short_description gin_trgm_ops);
```

**Prisma raw query:**

```ts
async searchByTrigram(q: string, limit = 20) {
  return this.prisma.$queryRaw`
    SELECT *, similarity(title, ${q}) as sim
    FROM courses
    WHERE status = 'published'
      AND (title % ${q} OR short_description % ${q})
    ORDER BY sim DESC
    LIMIT ${limit}
  `;
}
```

> 💡 Operator `%` là pg_trgm similarity match. Section 20 detail.

---

## Slide 13 — SEO-friendly URL

### Frontend URL structure

```
/courses                              ← homepage
/subjects/toan-hoc                    ← subject landing page
/subjects/toan-hoc/levels/lop-10      ← subject + level filter
/courses/toan-nang-cao-lop-10         ← course detail
/tutors/anh-tu                        ← tutor profile
```

**Backend endpoint phục vụ:**

```ts
@Public()
@Get('subjects/:subjectSlug/courses')
async coursesBySubject(@Param('subjectSlug') slug, @ZodQuery(ListCoursesQuery) q) {
  return this.courses.publicList({ ...q, subjectSlug: slug });
}

@Public()
@Get('subjects/:subjectSlug/levels/:levelSlug/courses')
async coursesBySubjectLevel(@Param('subjectSlug') s, @Param('levelSlug') l, @ZodQuery(ListCoursesQuery) q) {
  return this.courses.publicList({ ...q, subjectSlug: s, levelSlug: l });
}
```

---

## Slide 14 — Save view count

### Track popular courses

```ts
// detail handler
async findPublishedBySlug(slug, userId) {
  const course = await this.prisma.course.findFirst({ where: { slug } });
  if (!course) return null;

  // Increment view count async (không await)
  this.prisma.course.update({
    where: { id: course.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  return course;
}
```

> 💡 Increment trong DB blocking. Production dùng Redis counter, batch sync. Section 6/Khoá 6 sẽ làm.

---

## Slide 15 — Test curl storefront

```bash
# Featured
curl /v1/courses/featured
# { bestSellers: [...], topRated: [...], newReleases: [...] }

# Cursor pagination
curl '/v1/courses?limit=20'
# { items: [...], nextCursor: "c-uuid-20" }

curl '/v1/courses?cursor=c-uuid-20&limit=20'
# { items: [...], nextCursor: "c-uuid-40" }

# Combo filter
curl '/v1/courses?subjectSlug=toan-hoc&levelSlug=lop-10&minPrice=200000&maxPrice=500000&sort=price_asc'

# Search
curl '/v1/courses?q=nang%20cao'

# Subject landing page
curl /v1/subjects/toan-hoc/courses

# Detail với enrollment check
curl /v1/courses/toan-nang-cao-lop-10 -H "Authorization: Bearer $STUDENT"
# enrolled: false, lessons: [{isAccessible: true (free preview)}, ...]
```

---

## Slide 16 — Section 5 hoàn tất

### Course marketplace ready

✅ V16 — Course CRUD + slug + state machine + cover image
✅ V17 — Chapter + Lesson nested CRUD + reorder + types
✅ V18 — File upload stream + multipart + progress
✅ V19 — Free preview + cursor pagination + featured + search

**Section 6 — Course Approval Workflow** (1 video):

- Tutor submit → pending_approval
- Hanah approve/reject với state machine
- Audit log + notification

> 🚀 Sang Section 6 — gate cuối trước khi published.

---

## Slide 17 — Anti-patterns

```ts
// ❌ Trả enrolled=true cho mọi user
// → bypass paywall

// ❌ Cursor không stable order
ORDER BY createdAt   // hai row cùng createdAt → duplicate/skip
// → thêm , id

// ❌ View count increment đồng bộ trong request
UPDATE viewCount → query DB block 5-10ms
// → fire and forget (.catch)

// ❌ Featured query mỗi request không cache
// → Section 6 dạy cache, MVP có thể chấp nhận

// ❌ Filter `level=lop-10` mismatch với DB UUID
// → support cả slug và id

// ❌ Search ILIKE không index
// → full table scan O(N)
```

---

## Slide 18 — Bài tập thực hành

### 🎯 Storefront complete

**Bài 1:** Implement free preview endpoint với 4 case (free, owner, enrolled, none).

**Bài 2:** Cursor pagination cho `/v1/courses` + verify không duplicate khi insert mới giữa 2 request.

**Bài 3:** Featured endpoint với 3 nhóm + benchmark < 100ms.

**Bài 4:** Card badge logic (BEST_SELLER, TOP_RATED, NEW).

**Bài 5:** Search trigram: cài pg_trgm extension, index, test "Toan" match "Toán".

**Bài 6:** SEO endpoint `/v1/subjects/:slug/courses` + `/v1/subjects/:slug/levels/:slug/courses`.

**Bài 7:** Bonus: track viewCount fire-and-forget không block detail response.

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| Free preview lesson trong course archived | 404 (course không published) |
| Owner xem course chưa published | OK (tutor view) |
| Student enrolled rồi course bị archive | Còn quyền xem nguyên (entitlement không revoke) |
| Cursor invalid uuid | 400 |
| Filter `subjectSlug=invalid` | Empty result, không throw |
| Search `q=""` | Skip filter |
| Featured all empty | Trả `{bestSellers:[], topRated:[], newReleases:[]}` |

---

## Slide 20 — Tổng kết Video 19

### Bạn vừa học

- ✅ Free preview rule 4 case (free / owner / enrolled / none)
- ✅ Cursor pagination cho infinite scroll stable
- ✅ Tie-break order field cho cursor stable
- ✅ Featured endpoint 3 nhóm
- ✅ Card badges (BEST_SELLER, TOP_RATED, NEW)
- ✅ pg_trgm search fuzzy
- ✅ SEO-friendly URL structure
- ✅ View count fire-and-forget

> 💪 Storefront marketplace ready — Student tìm khoá mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 20

## Course Approval Workflow

State machine end-to-end: Tutor submit → Hanah review → approve/reject → publish.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 20 🚀

> *"A great storefront makes the right thing easy and the wrong thing hard."*
