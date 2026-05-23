---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 22: Lesson Progress Tracking'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Lesson Progress
# Tracking

### Khóa 2-3 — Video 22

**watchedSec · completedAt · Composite PK**

> Tiến độ học = bản chất của LMS

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `lesson_progress` với composite PK
- ✅ Endpoint **POST `/v1/lessons/:id/progress`** report tiến độ
- ✅ Tính **progressPercent** ở course level
- ✅ Auto detect **completedAt** khi watch ≥ 90% lesson
- ✅ List **last watched** cho Student dashboard
- ✅ Throttle write frequency tránh spam DB

> 🎯 Cuối video: Student xem video → progress tự update, dashboard hiển thị %

---

## Slide 3 — Schema `lesson_progress`

```ts
type LessonProgress = {
  enrollmentId: string;                  // FK to course_enrollments
  lessonId: string;                      // FK to lessons
  watchedSec: number;                    // tổng giây đã xem
  completedAt: Date | null;
  lastWatchedAt: Date;
  // PK COMPOSITE (enrollmentId, lessonId)
};
```

**Vì sao composite PK?**

- ✅ Tự dedupe — 1 enrollment + 1 lesson chỉ có 1 row
- ✅ Query nhanh: join 2 trục
- ✅ Không cần id riêng

---

## Slide 4 — Report progress endpoint

### `POST /v1/lessons/:id/progress`

```ts
@Auth('student')
@Post('lessons/:id/progress')
async report(
  @Param('id') lessonId: string,
  @CurrentUser('sub') studentId: string,
  @ZodBody(ProgressDto) body,
) {
  return this.progress.report(studentId, lessonId, body);
}

export const ProgressDto = z.object({
  watchedSec: z.number().int().min(0),
  // Optional cho lesson text: mark complete bằng button
  manualComplete: z.boolean().optional(),
});
```

> 💡 FE gửi watchedSec cumulative — không gửi delta (tránh race).

---

## Slide 5 — Service.report

```ts
async report(studentId: string, lessonId: string, input: ProgressInput) {
  const lesson = await this.prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { chapter: { include: { course: true } } },
  });
  if (!lesson) throw new NotFoundException();

  const enrollment = await this.prisma.courseEnrollment.findUnique({
    where: {
      courseId_studentId: { courseId: lesson.chapter.courseId, studentId },
    },
  });
  if (!enrollment) throw new ForbiddenException('Chưa enroll khoá này');

  // Validate watchedSec không lớn hơn duration (FE bug check)
  const maxSec = lesson.durationSec ?? 0;
  const cappedWatched = maxSec > 0 ? Math.min(input.watchedSec, maxSec) : input.watchedSec;

  // Auto complete: ≥90% lesson
  const isComplete = input.manualComplete
    || (maxSec > 0 && cappedWatched >= maxSec * 0.9);

  // Upsert
  const progress = await this.prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: {
      enrollmentId: enrollment.id,
      lessonId,
      watchedSec: cappedWatched,
      lastWatchedAt: new Date(),
      completedAt: isComplete ? new Date() : null,
    },
    update: {
      watchedSec: { set: cappedWatched },     // monotonic only
      lastWatchedAt: new Date(),
      completedAt: isComplete ? new Date() : undefined,
    },
  });

  // Recalc enrollment progress
  await this.recalcEnrollmentProgress(enrollment.id);

  return progress;
}
```

---

## Slide 6 — Recalc course progress

```ts
private async recalcEnrollmentProgress(enrollmentId: string) {
  const enrollment = await this.prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: {
        include: { chapters: { include: { lessons: true } } },
      },
    },
  });
  if (!enrollment) return;

  const allLessonIds = enrollment.course.chapters.flatMap(c => c.lessons.map(l => l.id));
  if (allLessonIds.length === 0) return;

  const completedCount = await this.prisma.lessonProgress.count({
    where: {
      enrollmentId,
      lessonId: { in: allLessonIds },
      completedAt: { not: null },
    },
  });

  const percent = Math.floor((completedCount / allLessonIds.length) * 100);
  const courseCompleted = percent === 100;

  await this.prisma.courseEnrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPercent: percent,
      completedAt: courseCompleted ? (enrollment.completedAt ?? new Date()) : null,
    },
  });
}
```

---

## Slide 7 — Throttle: chỉ update mỗi 10s

### Vấn đề: FE gửi mỗi giây → spam DB

```ts
// FE side throttle
let lastSent = 0;
videoEl.addEventListener('timeupdate', () => {
  if (Date.now() - lastSent < 10_000) return;
  lastSent = Date.now();
  fetch(`/v1/lessons/${lessonId}/progress`, {
    method: 'POST',
    body: JSON.stringify({ watchedSec: Math.floor(videoEl.currentTime) }),
  });
});
```

**Hoặc backend throttle:**

```ts
@Throttle({ default: { limit: 12, ttl: 60_000 } })   // 12/phút/student/lesson
@Post('lessons/:id/progress')
async report(...) {}
```

> 💡 Cộng cả 2 — defensive depth.

---

## Slide 8 — Monotonic watchedSec

### Không cho giảm

```ts
// Khi update: watched cũ = 100s, FE gửi 80s → giữ 100s
update: {
  watchedSec: { set: Math.max(currentWatchedSec, cappedWatched) },
}
```

**Hoặc transaction read-modify-write:**

```ts
await this.prisma.$transaction(async (tx) => {
  const existing = await tx.lessonProgress.findUnique({ where: { ... } });
  const newSec = Math.max(existing?.watchedSec ?? 0, cappedWatched);
  await tx.lessonProgress.upsert({
    where: { ... },
    create: { ..., watchedSec: newSec },
    update: { watchedSec: newSec, lastWatchedAt: new Date() },
  });
});
```

> 💡 Pattern monotonic: progress chỉ tiến không lùi.

---

## Slide 9 — Endpoint: Get progress cho course

```ts
@Auth('student')
@Get('enrollments/:id/progress')
async progress(
  @Param('id') enrollmentId: string,
  @CurrentUser('sub') studentId: string,
) {
  const enr = await this.prisma.courseEnrollment.findFirst({
    where: { id: enrollmentId, studentId },
  });
  if (!enr) throw new NotFoundException();

  const progressMap = await this.prisma.lessonProgress.findMany({
    where: { enrollmentId },
    select: { lessonId: true, watchedSec: true, completedAt: true },
  });

  return {
    enrollment: {
      progressPercent: enr.progressPercent,
      completedAt: enr.completedAt,
      enrolledAt: enr.enrolledAt,
    },
    lessons: progressMap,
  };
}
```

---

## Slide 10 — Last watched dashboard

### "Continue learning" trên homepage Student

```ts
@Auth('student')
@Get('me/continue-learning')
async continueLearning(@CurrentUser('sub') studentId: string) {
  // Tìm enrollment chưa completed, sort by lastWatchedAt
  const rows = await this.prisma.lessonProgress.findMany({
    where: {
      enrollment: { studentId, completedAt: null },
      completedAt: null,                  // lesson chưa xong
    },
    orderBy: { lastWatchedAt: 'desc' },
    take: 5,
    include: {
      enrollment: {
        include: {
          course: { include: { tutor: { select: { id: true, fullName: true } } } },
        },
      },
      lesson: { include: { chapter: true } },
    },
  });

  return rows.map(r => ({
    courseId: r.enrollment.course.id,
    courseTitle: r.enrollment.course.title,
    courseSlug: r.enrollment.course.slug,
    progressPercent: r.enrollment.progressPercent,
    nextLesson: {
      id: r.lessonId,
      title: r.lesson.title,
      watchedSec: r.watchedSec,
      durationSec: r.lesson.durationSec,
    },
    lastWatchedAt: r.lastWatchedAt,
  }));
}
```

---

## Slide 11 — Streak (advanced)

### Đếm số ngày liên tiếp Student học

```ts
async calculateStreak(studentId: string): Promise<number> {
  const days = await this.prisma.$queryRaw<{ day: Date }[]>`
    SELECT DISTINCT DATE_TRUNC('day', lp.last_watched_at) as day
    FROM lesson_progress lp
    JOIN course_enrollments e ON e.id = lp.enrollment_id
    WHERE e.student_id = ${studentId}
    ORDER BY day DESC
    LIMIT 60
  `;

  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (const d of days) {
    const diff = (cursor.getTime() - d.day.getTime()) / 86400_000;
    if (Math.abs(diff) < 1) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
```

> 💡 Tính trên-the-fly. Cache nếu cần. C6 dùng Redis.

---

## Slide 12 — Reset progress (optional)

```ts
@Auth('student')
@Delete('enrollments/:id/progress')
async reset(
  @Param('id') enrollmentId: string,
  @CurrentUser('sub') studentId: string,
) {
  const enr = await this.prisma.courseEnrollment.findFirst({
    where: { id: enrollmentId, studentId },
  });
  if (!enr) throw new NotFoundException();

  await this.prisma.$transaction([
    this.prisma.lessonProgress.deleteMany({ where: { enrollmentId } }),
    this.prisma.courseEnrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent: 0, completedAt: null },
    }),
  ]);
}
```

> 💡 Use case: Student muốn xem lại course từ đầu.

---

## Slide 13 — Mark lesson complete manually (text lesson)

### Text lesson không có duration → manual

```ts
// FE button "Đánh dấu hoàn thành"
fetch('/v1/lessons/text-lesson-id/progress', {
  method: 'POST',
  body: JSON.stringify({ watchedSec: 0, manualComplete: true }),
});
```

**Service đã handle slide 5** — `manualComplete=true` → set `completedAt`.

---

## Slide 14 — Test progress flow

```bash
# Setup: Student đã enroll course có 5 lesson

# Watch lesson 1 — báo 30s
curl -X POST /v1/lessons/$L1/progress \
  -H "Authorization: Bearer $STUDENT" \
  -d '{"watchedSec":30}'

# Update lên 60s
curl -X POST /v1/lessons/$L1/progress \
  -H "Authorization: Bearer $STUDENT" \
  -d '{"watchedSec":60}'

# Try set 0 (FE bug) — server giữ 60
curl -X POST /v1/lessons/$L1/progress -d '{"watchedSec":0}'
curl /v1/enrollments/$ENR/progress
# lessons[0].watchedSec = 60 (monotonic)

# Lesson duration 90s → watch 85s → auto complete (≥90%)
curl -X POST /v1/lessons/$L1/progress -d '{"watchedSec":85}'

# Verify course progress
curl /v1/enrollments/$ENR/progress
# progressPercent: 20 (1/5 lesson done)

# Continue learning
curl /v1/me/continue-learning
# [{ courseTitle, progressPercent: 20, nextLesson: {id: L2, ...} }]
```

---

## Slide 15 — Anti-patterns

```ts
// ❌ Cho student set watchedSec lùi
update: { watchedSec: input.watchedSec }   // → trừ điểm cho thấy "đã xem"

// ❌ Tính course progress mỗi lần list course
findMany().map(c => { lessons = ...; completed = ... })
// → query phình theo số course
// → cache trong field `progressPercent` của enrollment

// ❌ Update progress mỗi giây không throttle
// → DB write spam

// ❌ Trust FE manual complete cho lesson video
// → student click button mà chưa xem
// → require watchedSec ≥ 90% trừ khi type=text

// ❌ Race condition khi 2 tab cùng xem
// → upsert + monotonic max → safe

// ❌ Quên cleanup khi delete enrollment
// → orphan lesson_progress
// → onDelete: Cascade
```

---

## Slide 16 — Performance considerations

### N+1 cho course progress

```ts
// ❌ Bad
const enrollments = await prisma.courseEnrollment.findMany({ where: { studentId } });
for (const e of enrollments) {
  e.progress = await calculateCoursePercent(e.id);   // N queries
}

// ✅ Good — đã cache trong field
const enrollments = await prisma.courseEnrollment.findMany({
  where: { studentId },
  select: { id, courseId, progressPercent, completedAt },
});
```

> 💡 Trade-off: write cost (recalc khi report) ↔ read cost (free).

---

## Slide 17 — Bài tập thực hành

### 🎯 Progress full

**Bài 1:** Migration `lesson_progress` với composite PK `(enrollmentId, lessonId)`.

**Bài 2:** Implement endpoint POST progress + monotonic max + auto-complete 90%.

**Bài 3:** Implement recalc `enrollment.progressPercent`.

**Bài 4:** Test scenario slide 14.

**Bài 5:** Implement `continue-learning` endpoint.

**Bài 6:** Test edge: report watchedSec > duration → cap.

**Bài 7:** Bonus: implement streak counter + endpoint `GET /v1/me/streak`.

---

## Slide 18 — Edge cases

| Case | Behavior |
|------|----------|
| Report progress cho lesson không thuộc course đã enroll | 403 |
| Lesson type=text báo watchedSec | OK, không auto complete (cần manual) |
| Course có 0 lesson | Không recalc (skip) |
| Concurrent report 2 tab | Upsert + max → safe |
| WatchedSec âm | DTO validate `.min(0)` → 400 |
| Delete enrollment (refund) | Cascade delete lesson_progress |

---

## Slide 19 — Section 7 chuẩn bị

✅ V21 — Enrollment khi paid
✅ V22 — Lesson progress

Còn V23 — Course Review để hoàn tất Section 7.

---

## Slide 20 — Tổng kết Video 22

### Bạn vừa học

- ✅ Schema composite PK `(enrollmentId, lessonId)`
- ✅ Report progress endpoint
- ✅ Cap watchedSec ≤ duration
- ✅ Auto complete ≥ 90%
- ✅ Manual complete cho text lesson
- ✅ Monotonic max — không lùi
- ✅ Recalc enrollment.progressPercent
- ✅ Throttle FE 10s + BE throttler
- ✅ Continue learning dashboard
- ✅ Streak counter (bonus)

> 💪 Progress đúng = LMS trust với học viên

---

<!-- _class: lead -->

# Tiếp theo: Video 23

## Course Review (Rating + Comment)

Student đánh giá 1-5 sao + comment, unique 1 review / student / course, average rating.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 23 🚀

> *"Progress is a story written in seconds and finished in commits."*
