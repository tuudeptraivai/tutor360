---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 23: Course Review (Rating + Comment)'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Course Review
# Rating + Comment

### Khóa 2-3 — Video 23

**1 review/student/course · Average · Moderation**

> Review chân thật = signal mạnh nhất của marketplace

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `course_reviews` với UNIQUE (courseId, studentId)
- ✅ Endpoint **`POST /v1/courses/:id/reviews`** + **PATCH** sửa review
- ✅ List review public theo course
- ✅ Tính **avgRating** + **reviewCount** cho course
- ✅ Constraint: chỉ Student đã enrolled mới review
- ✅ Moderation: Hanah có thể ẩn review
- ✅ Tutor reply review (1 reply / review)

> 🎯 Cuối video: course detail có rating + review list + Tutor reply

---

## Slide 3 — Schema `course_reviews`

```ts
type CourseReview = {
  id: string;
  courseId: string;
  studentId: string;
  rating: number;                        // 1-5
  comment: string | null;                // markdown
  isHidden: boolean;                     // Hanah moderation
  tutorReply: string | null;             // 1 reply / review
  tutorReplyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // CONSTRAINT UNIQUE (courseId, studentId)
};
```

---

## Slide 4 — Create review endpoint

```ts
@Auth('student')
@Post('courses/:id/reviews')
async create(
  @Param('id') courseId: string,
  @CurrentUser('sub') studentId: string,
  @ZodBody(CreateReviewDto) body,
) {
  return this.reviews.create(studentId, courseId, body);
}

export const CreateReviewDto = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(2000).optional(),
});

// Service
async create(studentId, courseId, input) {
  // Phải enrolled
  const enr = await this.prisma.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  if (!enr) throw new ForbiddenException('Bạn chưa enroll khoá này');

  // Đã review?
  const existing = await this.prisma.courseReview.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  if (existing) {
    throw new ConflictException('Bạn đã review khoá này. Dùng PATCH để sửa.');
  }

  return this.prisma.courseReview.create({
    data: { courseId, studentId, ...input, isHidden: false },
  });
}
```

---

## Slide 5 — Update review

```ts
@Auth('student')
@Patch('courses/:courseId/reviews/me')
async updateOwn(
  @Param('courseId') courseId: string,
  @CurrentUser('sub') studentId: string,
  @ZodBody(UpdateReviewDto) body,
) {
  return this.reviews.updateOwn(studentId, courseId, body);
}

const UpdateReviewDto = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(10).max(2000).nullable().optional(),
});

// Service
async updateOwn(studentId, courseId, input) {
  return this.prisma.courseReview.update({
    where: { courseId_studentId: { courseId, studentId } },
    data: input,
  });
}
```

> 💡 1 student có thể sửa review nhiều lần — `updatedAt` track latest.

---

## Slide 6 — Delete review

```ts
@Auth('student', 'admin')
@Delete('courses/:courseId/reviews/me')
async deleteOwn(
  @Param('courseId') courseId: string,
  @CurrentUser('sub') studentId: string,
) {
  await this.prisma.courseReview.delete({
    where: { courseId_studentId: { courseId, studentId } },
  });
  return { ok: true };
}
```

---

## Slide 7 — List public reviews

### `GET /v1/courses/:id/reviews`

```ts
@Public()
@Get('courses/:id/reviews')
async list(
  @Param('id') courseId: string,
  @ZodQuery(ListReviewsQuery) q,
) {
  return this.reviews.publicList(courseId, q);
}

const ListReviewsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['newest', 'oldest', 'rating_desc', 'rating_asc']).default('newest'),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});

async publicList(courseId, q) {
  const where: any = { courseId, isHidden: false };
  if (q.minRating) where.rating = { gte: q.minRating };
  const orderBy = ({
    newest: { createdAt: 'desc' as const },
    oldest: { createdAt: 'asc' as const },
    rating_desc: { rating: 'desc' as const },
    rating_asc: { rating: 'asc' as const },
  })[q.sort];

  const [items, total] = await this.prisma.$transaction([
    this.prisma.courseReview.findMany({
      where, orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { student: { select: { id: true, fullName: true } } },
    }),
    this.prisma.courseReview.count({ where }),
  ]);
  return { items: items.map(toPublicReview), total };
}
```

---

## Slide 8 — Average rating + histogram

```ts
async getStats(courseId: string) {
  const where = { courseId, isHidden: false };

  const [count, avg, histogram] = await Promise.all([
    this.prisma.courseReview.count({ where }),
    this.prisma.courseReview.aggregate({ where, _avg: { rating: true } }),
    this.prisma.courseReview.groupBy({
      by: ['rating'],
      where,
      _count: true,
    }),
  ]);

  const dist: Record<number, number> = {1:0,2:0,3:0,4:0,5:0};
  for (const h of histogram) dist[h.rating] = h._count;

  return {
    count,
    avgRating: avg._avg.rating ? Math.round(avg._avg.rating * 10) / 10 : 0,
    distribution: dist,
  };
}
```

**Response:**

```json
{
  "count": 23,
  "avgRating": 4.7,
  "distribution": { "5": 18, "4": 4, "3": 1, "2": 0, "1": 0 }
}
```

---

## Slide 9 — Course detail include stats

```ts
// V19 detail — refine
async findPublishedBySlug(slug: string, userId?: string) {
  // ... existing logic
  const stats = await this.reviews.getStats(course.id);
  return {
    ...toCourseDetail(course),
    rating: stats,
  };
}
```

---

## Slide 10 — Tutor reply

```ts
@Auth('tutor', 'admin')
@Post('courses/:courseId/reviews/:reviewId/reply')
async reply(
  @Param('courseId') courseId: string,
  @Param('reviewId') reviewId: string,
  @CurrentUser() u: JwtPayload,
  @ZodBody(ReplyDto) body,
) {
  return this.reviews.reply(reviewId, courseId, u, body.text);
}

const ReplyDto = z.object({
  text: z.string().trim().min(5).max(1000),
});

// Service
async reply(reviewId, courseId, user, text) {
  const review = await this.prisma.courseReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new NotFoundException();

  const course = await this.coursesService.findById(courseId);
  if (user.role !== 'admin' && course.tutorId !== user.sub) {
    throw new ForbiddenException();
  }

  return this.prisma.courseReview.update({
    where: { id: reviewId },
    data: {
      tutorReply: text,
      tutorReplyAt: new Date(),
    },
  });
}
```

---

## Slide 11 — Hanah moderation

```ts
@AdminOnly()
@Post('admin/reviews/:id/hide')
async hide(@Param('id') id: string, @CurrentUser('sub') adminId: string, @ZodBody(HideDto) body) {
  await this.prisma.courseReview.update({
    where: { id },
    data: { isHidden: true },
  });
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'review.hide',
    entityId: id,
    metadata: { reason: body.reason },
  });
}

@AdminOnly()
@Post('admin/reviews/:id/unhide')
async unhide(@Param('id') id, @CurrentUser('sub') adminId) {
  await this.prisma.courseReview.update({
    where: { id }, data: { isHidden: false },
  });
}
```

> 💡 Pattern: dùng cho review spam, abusive language, fake.

---

## Slide 12 — Filter "verified purchase"

### Mỗi review = enrolled (đã pay) → tự verified

```ts
// Mọi review trong DB đều verified (do constraint enroll check)
// FE hiển thị badge ✓
```

> 💡 Tutor365 không cần flag "verified" — model business đã enforce.

---

## Slide 13 — Sentiment trend (advanced)

### Track avgRating qua thời gian

```ts
async ratingTrend(courseId: string, days: number = 90) {
  return this.prisma.$queryRaw`
    SELECT DATE_TRUNC('week', created_at) as week,
           AVG(rating)::numeric(3,2) as avg_rating,
           COUNT(*) as review_count
    FROM course_reviews
    WHERE course_id = ${courseId}
      AND is_hidden = false
      AND created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY week
    ORDER BY week
  `;
}
```

**Output:**

```json
[
  { "week": "2026-04-29", "avgRating": 4.5, "reviewCount": 3 },
  { "week": "2026-05-06", "avgRating": 4.8, "reviewCount": 5 }
]
```

---

## Slide 14 — Test E2E

```bash
# Student đã enroll course $CID

# Create review
curl -X POST /v1/courses/$CID/reviews \
  -H "Authorization: Bearer $STUDENT" \
  -d '{"rating":5,"comment":"Khoá học tuyệt vời! Giảng viên giải thích rõ ràng."}'

# Try create lại
curl -X POST /v1/courses/$CID/reviews -d '...'
# 409

# Update
curl -X PATCH /v1/courses/$CID/reviews/me \
  -d '{"rating":4,"comment":"Update sau khi học thêm vài bài."}'

# Public list
curl /v1/courses/$CID/reviews
# [{ rating: 4, comment, student: { fullName }, ... }]

# Stats
curl /v1/courses/$CID
# { ..., rating: { count: 1, avgRating: 4.0, distribution: {4:1} } }

# Tutor reply
curl -X POST /v1/courses/$CID/reviews/$REVIEW_ID/reply \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"text":"Cảm ơn bạn đã chia sẻ!"}'

# Hanah hide
curl -X POST /v1/admin/reviews/$REVIEW_ID/hide \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"reason":"Spam"}'

# Public list — không thấy review hidden
curl /v1/courses/$CID/reviews
```

---

## Slide 15 — Performance: cache stats

### Tính stats mỗi list course nặng

```ts
// modules/courses/courses.service.ts
async listWithStats(...) {
  // Cache stats trong course table — denormalize
  // Update mỗi khi review create/update/delete
  // ... 

  // Hoặc materialized view (Section 20)
}
```

> 💡 Tutor365 MVP: tính on-the-fly + index trên `(courseId, isHidden)`. Section 20 sẽ cache.

---

## Slide 16 — Anti-patterns

```ts
// ❌ Cho non-enrolled review
// → review giả, marketing inflate rating

// ❌ Cho rating ngoài 1-5
rating: 0   // hoặc 10
// → DTO validate strict

// ❌ Trả review hidden cho public
where: { courseId }   // thiếu isHidden=false

// ❌ Delete review + tự update avgRating cache stale
// → trigger recalc hoặc materialized view

// ❌ Tutor reply không own course
// → guard check ownership

// ❌ Soft constraint không UNIQUE
// → 1 student 5 review = inflate
```

---

## Slide 17 — Edge cases

| Case | Behavior |
|------|----------|
| Student review course đã archived | Allow nếu enrolled |
| Student review trước khi xem bất cứ lesson nào | Allow (no rule chặn) |
| Update review thay đổi rating → avgRating đúng | Tính on-the-fly luôn |
| Hidden review trong stats count | Loại trừ |
| Tutor reply review hidden | Allow (Tutor không biết hidden) |
| Course delete (archived → not really delete) | Review giữ, hidden từ public |

---

## Slide 18 — Bài tập thực hành

### 🎯 Review system

**Bài 1:** Migration `course_reviews` UNIQUE (courseId, studentId).

**Bài 2:** Implement create + update + delete review.

**Bài 3:** Implement public list với filter rating, sort.

**Bài 4:** Implement stats (count, avg, histogram).

**Bài 5:** Tutor reply + Hanah moderation hide/unhide.

**Bài 6:** Test E2E (slide 14).

**Bài 7:** Bonus: Implement `GET /v1/courses/:id/reviews/me` để Student xem review mình.

---

## Slide 19 — Section 7 hoàn tất

### Enrollment + Progress + Review

✅ V21 — Enrollment khi paid
✅ V22 — Lesson progress tracking
✅ V23 — Course review + rating + reply

**Section 8 — Tutor Availability** (2 video):

- V24: Tutor declare lịch rảnh
- V25: Public xem availability

> 🚀 Sang Section 8 — bước đầu của Live Tutoring.

---

## Slide 20 — Tổng kết Video 23

### Bạn vừa học

- ✅ Schema `course_reviews` UNIQUE (courseId, studentId)
- ✅ Constraint enrolled-only review
- ✅ Update/delete own review
- ✅ Public list với filter + sort
- ✅ Stats: count + avgRating + histogram
- ✅ Tutor reply 1 review
- ✅ Hanah moderation hide/unhide
- ✅ Rating trend qua thời gian (bonus)

> 💪 Review chuẩn = trust signal mạnh nhất marketplace

---

<!-- _class: lead -->

# Tiếp theo: Video 24

## Tutor Availability Slot

Tutor khai báo lịch rảnh: dayOfWeek, startTime, endTime, validFrom/To, timezone.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 24 🚀

> *"Reviews are the marketplace's immune system."*
