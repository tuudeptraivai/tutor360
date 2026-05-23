---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 20: Course Approval Workflow'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Course Approval
# Workflow

### Khóa 2-3 — Video 20

**State machine · Hanah review · Audit log**

> Bằng đặt ranh giới: course chưa duyệt ≠ course đã bán

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement state machine 5 trạng thái course
- ✅ Tutor **submit** course → pending_approval
- ✅ Hanah **list pending** + **approve/reject**
- ✅ Tutor sửa rồi resubmit sau khi reject
- ✅ Audit log mọi transition
- ✅ Email notify Tutor
- ✅ Validate course content trước khi submit (≥1 chapter, ≥1 lesson)

> 🎯 Cuối video: course từ draft → published qua Hanah

---

## Slide 3 — State machine course (recap)

```
draft
  │
  │ Tutor submit (require ≥1 chapter + ≥1 lesson + cover)
  ▼
pending_approval
  │
  ├── Hanah approve ──▶ published (publishedAt = now)
  │                       │
  │                       └── Tutor archive ──▶ archived
  │
  └── Hanah reject ──▶ rejected
                        │
                        │ Tutor sửa + submit lại
                        ▼
                     pending_approval
```

**Invariants:**

- ✅ `published` → chỉ về `archived`
- ❌ `archived` → KHÔNG về `published`
- ✅ `rejected` → có thể về `pending_approval`

---

## Slide 4 — Tutor submit endpoint

```ts
@Auth('tutor', 'admin')
@Post('courses/:id/submit')
async submit(
  @Param('id') id: string,
  @CurrentUser() u: JwtPayload,
) {
  return this.courses.submit(id, u);
}

// Service
async submit(courseId: string, user: JwtPayload) {
  const course = await this.findById(courseId);
  if (user.role !== 'admin' && course.tutorId !== user.sub) {
    throw new ForbiddenException();
  }
  if (!['draft', 'rejected'].includes(course.status)) {
    throw new BadRequestException(`Không submit được từ status=${course.status}`);
  }

  // Tutor approved check
  const profile = await this.tutorsService.findByUserId(course.tutorId);
  if (profile.approveStatus !== 'approved') {
    throw new ForbiddenException('Hồ sơ Tutor chưa được duyệt');
  }

  // Content validation
  await this.ensureSubmittable(courseId);

  return this.prisma.$transaction([
    this.prisma.course.update({
      where: { id: courseId, version: course.version },
      data: { status: 'pending_approval', rejectedReason: null, version: { increment: 1 } },
    }),
    this.prisma.auditLog.create({
      data: { actorUserId: user.sub, action: 'course.submit', entityType: 'course', entityId: courseId },
    }),
  ]);
}
```

---

## Slide 5 — ensureSubmittable validation

```ts
async ensureSubmittable(courseId: string) {
  const course = await this.prisma.course.findUnique({
    where: { id: courseId },
    include: {
      chapters: { include: { lessons: true } },
    },
  });
  if (!course) throw new NotFoundException();

  const errors: string[] = [];

  if (!course.coverImageKey) errors.push('Thiếu cover image');
  if (!course.shortDescription) errors.push('Thiếu mô tả ngắn');
  if (!course.description || course.description.length < 200) {
    errors.push('Mô tả chi tiết phải ≥ 200 ký tự');
  }
  if (course.chapters.length === 0) errors.push('Chưa có chapter nào');

  const emptyChapters = course.chapters.filter(c => c.lessons.length === 0);
  if (emptyChapters.length > 0) {
    errors.push(`Chapter rỗng: ${emptyChapters.map(c => c.title).join(', ')}`);
  }

  const hasContent = course.chapters.some(c =>
    c.lessons.some(l => l.contentKey || l.textContent),
  );
  if (!hasContent) errors.push('Chưa có lesson nào có nội dung');

  if (errors.length > 0) {
    throw new BadRequestException({ code: 'NOT_SUBMITTABLE', details: errors });
  }
}
```

---

## Slide 6 — Hanah list pending

### `GET /v1/admin/courses?status=pending_approval`

```ts
@AdminOnly()
@Get('admin/courses')
async adminList(@ZodQuery(AdminListCoursesQuery) q) {
  return this.courses.adminList(q);
}

const AdminListCoursesQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'pending_approval', 'published', 'rejected', 'archived', 'all']).default('all'),
  tutorId: z.string().uuid().optional(),
  q: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'pending_first']).default('newest'),
});

// Service
async adminList(q) {
  const where: any = {};
  if (q.status !== 'all') where.status = q.status;
  if (q.tutorId) where.tutorId = q.tutorId;
  if (q.q) where.title = { contains: q.q, mode: 'insensitive' };

  // pending_first sort: ưu tiên pending_approval
  const orderBy = q.sort === 'pending_first'
    ? [{ status: 'asc' as const }, { updatedAt: 'asc' as const }]
    : { updatedAt: q.sort === 'oldest' ? 'asc' as const : 'desc' as const };

  // ... return items + total
}
```

---

## Slide 7 — Hanah approve endpoint

```ts
@AdminOnly()
@Post('admin/courses/:id/approve')
async approve(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
) {
  return this.courses.approve(id, adminId);
}

// Service
async approve(courseId: string, adminId: string) {
  const course = await this.findById(courseId);
  if (course.status === 'published') return course;     // idempotent

  if (course.status !== 'pending_approval') {
    throw new BadRequestException(`Không approve được từ status=${course.status}`);
  }

  const updated = await this.prisma.$transaction(async (tx) => {
    const u = await tx.course.update({
      where: { id: courseId, version: course.version },
      data: {
        status: 'published',
        publishedAt: new Date(),
        rejectedReason: null,
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: { actorUserId: adminId, action: 'course.approve', entityType: 'course', entityId: courseId },
    });
    return u;
  });

  await this.mailer.sendCourseApprovedEmail(course.tutorId, course.title);
  return updated;
}
```

---

## Slide 8 — Hanah reject endpoint

```ts
@AdminOnly()
@Post('admin/courses/:id/reject')
async reject(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(RejectDto) body,
) {
  return this.courses.reject(id, adminId, body.reason);
}

const RejectDto = z.object({
  reason: z.string().trim().min(10).max(1000),
});

// Service
async reject(courseId: string, adminId: string, reason: string) {
  const course = await this.findById(courseId);
  if (course.status !== 'pending_approval') {
    throw new BadRequestException(`Không reject được từ status=${course.status}`);
  }

  await this.prisma.$transaction([
    this.prisma.course.update({
      where: { id: courseId, version: course.version },
      data: {
        status: 'rejected',
        rejectedReason: reason,
        version: { increment: 1 },
      },
    }),
    this.prisma.auditLog.create({
      data: {
        actorUserId: adminId,
        action: 'course.reject',
        entityType: 'course',
        entityId: courseId,
        metadata: { reason },
      },
    }),
  ]);

  await this.mailer.sendCourseRejectedEmail(course.tutorId, course.title, reason);
}
```

---

## Slide 9 — Resubmit cycle

### Tutor sửa course rejected

```bash
# Course đang status=rejected, rejectedReason="Mô tả quá ngắn"

# Tutor update description
curl -X PATCH /v1/courses/$ID \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"description":"Mô tả chi tiết dài hơn 200 ký tự..."}'

# Tutor submit lại
curl -X POST /v1/courses/$ID/submit \
  -H "Authorization: Bearer $TUTOR"

# Verify
curl /v1/me/courses/$ID -H "Authorization: Bearer $TUTOR"
# status: "pending_approval", rejectedReason: null
```

---

## Slide 10 — Archive course

### Tutor stop bán

```ts
@Auth('tutor', 'admin')
@Post('courses/:id/archive')
async archive(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
  return this.courses.archive(id, u);
}

// Service
async archive(courseId: string, user: JwtPayload) {
  const course = await this.findById(courseId);
  if (user.role !== 'admin' && course.tutorId !== user.sub) {
    throw new ForbiddenException();
  }
  if (course.status === 'archived') return course;

  // Chỉ từ published / draft / rejected archive được
  if (!['draft', 'rejected', 'published'].includes(course.status)) {
    throw new BadRequestException(`Không archive được từ status=${course.status}`);
  }

  await this.prisma.course.update({
    where: { id: courseId },
    data: { status: 'archived' },
  });

  await this.auditLog.record({
    actorUserId: user.sub, action: 'course.archive', entityId: courseId,
  });
}
```

> 💡 Archived course: enrolled student vẫn xem được. Public list không hiện.

---

## Slide 11 — Email templates

```ts
// mail/templates/course-approved.html
<p>Xin chào {{tutorName}},</p>
<p>Khoá học "{{courseTitle}}" đã được Hanah phê duyệt và đang bán trên Tutor365.</p>
<p>Link: <a href="{{courseUrl}}">{{courseUrl}}</a></p>

// mail/templates/course-rejected.html
<p>Xin chào {{tutorName}},</p>
<p>Khoá học "{{courseTitle}}" cần điều chỉnh trước khi đăng bán.</p>
<p><strong>Lý do:</strong> {{reason}}</p>
<p>Vui lòng cập nhật và submit lại.</p>
```

**Mail service:**

```ts
async sendCourseApprovedEmail(tutorId: string, courseTitle: string) {
  const tutor = await this.usersService.findById(tutorId);
  const html = this.renderTemplate('course-approved', {
    tutorName: tutor.fullName,
    courseTitle,
    courseUrl: `${process.env.APP_URL}/me/courses`,
  });
  await this.send(tutor.email, 'Khoá học đã được duyệt', html);
}
```

---

## Slide 12 — Section 6 — Approval workflow validation

### Side-effect khi approve

```ts
async approve(courseId, adminId) {
  // ... existing approve

  // Side effects:
  // - publishedAt = now → query "new releases" hoạt động
  // - status → searchable trên public list
  // - email notify tutor
  // - audit log

  // KHÔNG side effect:
  // - Không tự ý publish nhiều course cùng lúc
  // - Không phát free certificate
  // - Không tăng counter tutor.publishedCourses (do query lazy)
}
```

---

## Slide 13 — Stats endpoint cho Hanah dashboard

```ts
@AdminOnly()
@Get('admin/courses/stats')
async stats() {
  const [total, pending, published, archived, rejected] = await Promise.all([
    this.prisma.course.count(),
    this.prisma.course.count({ where: { status: 'pending_approval' } }),
    this.prisma.course.count({ where: { status: 'published' } }),
    this.prisma.course.count({ where: { status: 'archived' } }),
    this.prisma.course.count({ where: { status: 'rejected' } }),
  ]);

  return {
    total,
    byStatus: { pending, published, archived, rejected },
    pendingAgeHours: await this.pendingAvgAge(),
  };
}

async pendingAvgAge() {
  const rows = await this.prisma.course.findMany({
    where: { status: 'pending_approval' },
    select: { updatedAt: true },
  });
  if (rows.length === 0) return 0;
  const ages = rows.map(r => Date.now() - r.updatedAt.getTime());
  return Math.floor(ages.reduce((a, b) => a + b, 0) / ages.length / 3600_000);
}
```

---

## Slide 14 — Concurrent approval: idempotent

### 2 admin tab approve cùng course

```
Tab A: POST /approve  → version=5 → update version=6, status=published
Tab B: POST /approve  → version=5 → fail unique version check
       → service xem status hiện tại = published → return course (idempotent)
```

```ts
async approve(courseId, adminId) {
  const course = await this.findById(courseId);
  if (course.status === 'published') return course;   // ← idempotent return

  // ... transaction update
}
```

> 💡 Idempotent endpoint = an toàn khi gọi lặp.

---

## Slide 15 — Cross-module: enrollment phải block khi archived

```ts
// modules/enrollments/enrollments.service.ts (preview V21)
async enroll(studentId: string, courseId: string, orderId: string) {
  const course = await this.coursesService.findById(courseId);
  if (course.status !== 'published') {
    throw new BadRequestException('Course không khả dụng');
  }
  // ... continue
}
```

> 💡 Snapshot at enroll time — student enroll xong rồi tutor archive → student vẫn xem được (entitlement đã có).

---

## Slide 16 — Test full lifecycle

```bash
# 1. Tutor tạo course
COURSE_ID=$(curl -X POST /v1/courses -H "Authorization: Bearer $TUTOR" -d '...' | jq -r .id)

# 2. Tutor submit (chưa có content) → 400
curl -X POST /v1/courses/$COURSE_ID/submit -H "Authorization: Bearer $TUTOR"
# 400 — { code: NOT_SUBMITTABLE, details: ["Thiếu cover image", ...] }

# 3. Tutor upload cover, add chapter, add lesson với content → submit lại
# ... (V17-V18)
curl -X POST /v1/courses/$COURSE_ID/submit -H "Authorization: Bearer $TUTOR"
# 200 — status: pending_approval

# 4. Hanah list pending
curl '/v1/admin/courses?status=pending_approval' -H "Authorization: Bearer $ADMIN"

# 5. Hanah reject
curl -X POST /v1/admin/courses/$COURSE_ID/reject \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"reason":"Cần thêm video preview"}'

# 6. Tutor xem reason + sửa + submit lại
curl /v1/me/courses/$COURSE_ID -H "Authorization: Bearer $TUTOR"
# rejectedReason: "Cần thêm video preview"

# 7. Hanah approve
curl -X POST /v1/admin/courses/$COURSE_ID/approve -H "Authorization: Bearer $ADMIN"
# 200 — publishedAt set

# 8. Public xem
curl /v1/courses/$COURSE_ID/.../  ← public sẽ thấy

# 9. Tutor archive
curl -X POST /v1/courses/$COURSE_ID/archive -H "Authorization: Bearer $TUTOR"
```

---

## Slide 17 — Anti-patterns

```ts
// ❌ Cho tutor tự đổi status
PATCH /courses/:id { status: 'published' }
// → block field status ở DTO

// ❌ Hanah approve mà không check status hiện tại
// → archived course bị "approve" → status loạn

// ❌ Reject không reason
// → Tutor mù mờ, không biết sửa gì

// ❌ Email send blocking
await mailer.send(...)   // → request lag 2-3s
// → fire-and-forget hoặc queue (C6)

// ❌ Không idempotent
double-click approve → version mismatch → 500
// → check status trước, return luôn nếu đã published

// ❌ Approve course mà chưa published
// → status=draft trực tiếp lên published bypass review
```

---

## Slide 18 — Edge cases

| Case | Behavior |
|------|----------|
| Submit course không chapter | 400 với details |
| Submit course có chapter rỗng | 400 |
| Submit course tutor profile rejected | 403 |
| Hanah approve published course | Idempotent return |
| Hanah reject draft course | 400 (chỉ reject pending) |
| Concurrent reject + approve | Race — winner is `version` lock holder |
| Archive published rồi unarchive | Không support — phải tạo course mới |

---

## Slide 19 — Bài tập thực hành

### 🎯 Approval workflow E2E

**Bài 1:** Implement `ensureSubmittable` với 5+ check.

**Bài 2:** Implement submit/approve/reject/archive endpoint.

**Bài 3:** Test full lifecycle (slide 16).

**Bài 4:** Test idempotency:
- Submit 2 lần → submit thứ 2 fail (đã pending)
- Approve 2 lần → idempotent OK

**Bài 5:** Audit log có 4 row tương ứng 4 transition.

**Bài 6:** Implement stats endpoint + verify số đúng.

**Bài 7:** Bonus: gửi mail rejected có template HTML render reason.

---

## Slide 20 — Tổng kết Video 20 + Section 6

### Bạn vừa học

- ✅ State machine 5 trạng thái course đầy đủ
- ✅ Tutor submit với ensureSubmittable 5+ check
- ✅ Hanah approve/reject + audit + email
- ✅ Idempotent approve (return luôn nếu đã published)
- ✅ Tutor archive
- ✅ Resubmit cycle (rejected → fix → pending)
- ✅ Concurrent safety qua version optimistic lock
- ✅ Cross-module: enroll chỉ với published

> 💪 Approval workflow chắc chắn = trust giữa Tutor / Student / Hanah

---

<!-- _class: lead -->

# Tiếp theo: Video 21

## Enrollment Khi VNPay Paid

Student trả tiền → IPN webhook → tạo enrollment. Stub VNPay cho test, full payment ở Section 13.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 21 🚀

> *"State machines turn vague workflows into provable systems."*
