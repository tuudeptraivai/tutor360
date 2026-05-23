---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 17: Chapters + Lessons CRUD'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Chapters + Lessons
# CRUD

### Khóa 2-3 — Video 17

**Nested resource · Position · Lesson types**

> Course structure = backbone của trải nghiệm học

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `course_chapters` + `lessons`
- ✅ CRUD chapter nested trong course
- ✅ CRUD lesson nested trong chapter
- ✅ **4 lesson types**: video, pptx, pdf, text
- ✅ **Position ordering** + reorder atomic
- ✅ **isFreePreview** flag cho lesson trial
- ✅ Bulk endpoint cho FE drag-drop reorder

> 🎯 Cuối video: 1 course có 3 chapter × 5 lesson, có thể re-order

---

## Slide 3 — Schema chapter + lesson

```ts
type CourseChapter = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;                    // 0, 1, 2, ... unique (courseId, position)
  createdAt: Date;
  updatedAt: Date;
};

type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  type: 'video' | 'pptx' | 'pdf' | 'text';
  contentKey: string | null;           // S3 key for video/pptx/pdf
  textContent: string | null;          // markdown for type=text
  durationSec: number | null;          // video duration
  position: number;                    // unique (chapterId, position)
  isFreePreview: boolean;              // student chưa enroll vẫn xem được
  createdAt: Date;
  updatedAt: Date;
};
```

---

## Slide 4 — Nested endpoint structure

```
POST   /v1/courses/:courseId/chapters
PATCH  /v1/courses/:courseId/chapters/:chapterId
DELETE /v1/courses/:courseId/chapters/:chapterId
POST   /v1/courses/:courseId/chapters/:chapterId/reorder

POST   /v1/chapters/:chapterId/lessons
PATCH  /v1/lessons/:lessonId
DELETE /v1/lessons/:lessonId
POST   /v1/lessons/:lessonId/reorder
POST   /v1/lessons/:lessonId/content    ← upload video/pptx/pdf
```

> 💡 Lesson đặt độc lập (`/lessons/:id`) sau khi tạo dưới chapter — không cần lặp courseId trong URL.

---

## Slide 5 — Tạo chapter

```ts
@Auth('tutor', 'admin')
@Post('courses/:courseId/chapters')
async create(
  @Param('courseId') courseId: string,
  @CurrentUser() u,
  @ZodBody(CreateChapterDto) body,
) {
  return this.chapters.create(courseId, body, u);
}

export const CreateChapterDto = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(1000).optional(),
});

// Service
async create(courseId, input, user) {
  await this.coursesService.ensureOwnership(courseId, user);

  const maxPos = await this.prisma.courseChapter.aggregate({
    where: { courseId },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? -1) + 1;

  return this.prisma.courseChapter.create({
    data: { ...input, courseId, position },
  });
}
```

---

## Slide 6 — Tạo lesson

```ts
@Auth('tutor', 'admin')
@Post('chapters/:chapterId/lessons')
async createLesson(
  @Param('chapterId') chapterId: string,
  @CurrentUser() u,
  @ZodBody(CreateLessonDto) body,
) {
  return this.lessons.create(chapterId, body, u);
}

export const CreateLessonDto = z.object({
  title: z.string().trim().min(3).max(120),
  type: z.enum(['video', 'pptx', 'pdf', 'text']),
  textContent: z.string().max(50_000).optional(),
  isFreePreview: z.boolean().default(false),
});

// Service
async create(chapterId, input, user) {
  const chapter = await this.prisma.courseChapter.findUnique({
    where: { id: chapterId },
    include: { course: true },
  });
  if (!chapter) throw new NotFoundException();
  await this.coursesService.ensureOwnership(chapter.courseId, user);

  // text lesson: textContent required
  if (input.type === 'text' && !input.textContent) {
    throw new BadRequestException('Lesson text yêu cầu textContent');
  }

  const maxPos = await this.prisma.lesson.aggregate({
    where: { chapterId },
    _max: { position: true },
  });
  return this.prisma.lesson.create({
    data: {
      ...input,
      chapterId,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });
}
```

---

## Slide 7 — Upload lesson content (video/pptx/pdf)

```ts
@Auth('tutor', 'admin')
@Post('lessons/:id/content')
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 500 * 1024 * 1024 },     // 500MB cho video
}))
async uploadContent(
  @Param('id') id: string,
  @CurrentUser() u,
  @UploadedFile() file: Express.Multer.File,
) {
  const lesson = await this.findById(id);
  await this.ensureOwnershipViaLesson(lesson, u);

  // Validate MIME theo type
  const mimeMap = {
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    pdf: ['application/pdf'],
  };
  if (lesson.type === 'text') {
    throw new BadRequestException('Lesson type=text không nhận file');
  }
  if (!mimeMap[lesson.type].includes(file.mimetype)) {
    throw new BadRequestException(`MIME không đúng cho type=${lesson.type}`);
  }

  const ext = file.mimetype.split('/').pop();
  const key = `lessons/${lesson.chapterId}/${id}/${randomUUID()}.${ext}`;
  await this.storage.put({ key, body: file.buffer, contentType: file.mimetype });

  // Cleanup old
  if (lesson.contentKey) {
    await this.storage.delete(lesson.contentKey).catch(() => {});
  }

  return this.prisma.lesson.update({
    where: { id },
    data: { contentKey: key },
  });
}
```

---

## Slide 8 — Video duration extraction

### Tự lấy duration từ video

```ts
import ffprobe from 'ffprobe-static';
import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);

async getVideoDuration(buffer: Buffer): Promise<number> {
  // Save to temp file
  const tmp = `/tmp/${randomUUID()}.mp4`;
  await fs.writeFile(tmp, buffer);
  try {
    const { stdout } = await exec(ffprobe.path, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      tmp,
    ]);
    return Math.floor(parseFloat(stdout));
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

// Apply trong uploadContent
if (lesson.type === 'video') {
  const durationSec = await this.getVideoDuration(file.buffer);
  await this.prisma.lesson.update({ where: { id }, data: { durationSec } });
}
```

---

## Slide 9 — Reorder chapter

### Atomic position swap

```ts
@Post('courses/:courseId/chapters/:chapterId/reorder')
async reorder(
  @Param('chapterId') chapterId: string,
  @ZodBody(ReorderDto) body,
  @CurrentUser() u,
) {
  return this.chapters.reorder(chapterId, body.position, u);
}

// Service (giống V13 reorder subjects)
async reorder(chapterId: string, newPosition: number, user) {
  const chapter = await this.prisma.courseChapter.findUnique({ where: { id: chapterId }, include: { course: true } });
  if (!chapter) throw new NotFoundException();
  await this.coursesService.ensureOwnership(chapter.courseId, user);

  await this.prisma.$transaction(async (tx) => {
    if (newPosition < chapter.position) {
      await tx.courseChapter.updateMany({
        where: {
          courseId: chapter.courseId,
          position: { gte: newPosition, lt: chapter.position },
          id: { not: chapterId },
        },
        data: { position: { increment: 1 } },
      });
    } else if (newPosition > chapter.position) {
      await tx.courseChapter.updateMany({
        where: {
          courseId: chapter.courseId,
          position: { gt: chapter.position, lte: newPosition },
          id: { not: chapterId },
        },
        data: { position: { decrement: 1 } },
      });
    }
    await tx.courseChapter.update({ where: { id: chapterId }, data: { position: newPosition } });
  });
}
```

---

## Slide 10 — Bulk reorder (FE drag-drop)

### Một call gửi nguyên thứ tự mới

```ts
@Post('courses/:courseId/chapters/bulk-reorder')
async bulkReorder(
  @Param('courseId') courseId: string,
  @ZodBody(BulkReorderDto) body,
  @CurrentUser() u,
) {
  await this.coursesService.ensureOwnership(courseId, u);
  return this.chapters.bulkReorder(courseId, body.ids);
}

export const BulkReorderDto = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// Service
async bulkReorder(courseId: string, ids: string[]) {
  // Validate tất cả id thuộc course
  const existing = await this.prisma.courseChapter.findMany({
    where: { courseId, id: { in: ids } },
    select: { id: true },
  });
  if (existing.length !== ids.length) {
    throw new BadRequestException('Một số chapter không thuộc course');
  }

  // Update từng cái — wrap transaction
  await this.prisma.$transaction(
    ids.map((id, idx) => this.prisma.courseChapter.update({
      where: { id }, data: { position: idx },
    })),
  );
}
```

---

## Slide 11 — Delete chapter: cascade lessons

```ts
async deleteChapter(chapterId: string, user) {
  const chapter = await this.prisma.courseChapter.findUnique({
    where: { id: chapterId },
    include: { course: true, lessons: true },
  });
  if (!chapter) throw new NotFoundException();
  await this.coursesService.ensureOwnership(chapter.courseId, user);

  await this.prisma.$transaction(async (tx) => {
    // 1. Xoá content files của lessons
    for (const l of chapter.lessons) {
      if (l.contentKey) await this.storage.delete(l.contentKey).catch(() => {});
    }
    // 2. Cascade delete lessons + chapter (Prisma onDelete: Cascade)
    await tx.courseChapter.delete({ where: { id: chapterId } });
    // 3. Re-pack position của các chapter còn lại
    await tx.$executeRawUnsafe(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
        FROM course_chapters WHERE course_id = $1
      )
      UPDATE course_chapters c SET position = o.new_pos
      FROM ordered o WHERE c.id = o.id
    `, chapter.courseId);
  });
}
```

---

## Slide 12 — isFreePreview: trial cho student chưa enroll

```ts
@Public()
@Get('lessons/:id/content')
async previewContent(@Param('id') id: string, @CurrentUser() u?: JwtPayload) {
  const lesson = await this.lessons.findById(id);
  if (!lesson) throw new NotFoundException();

  // 1. Free preview → public access
  if (lesson.isFreePreview) {
    return this.serveLesson(lesson);
  }

  // 2. Logged in + enrolled → access
  if (!u) throw new UnauthorizedException();
  const enrolled = await this.enrollmentsService.isEnrolled(u.sub, lesson.chapter.courseId);
  if (!enrolled) throw new ForbiddenException('Chưa enroll khoá này');

  return this.serveLesson(lesson);
}

private async serveLesson(lesson: Lesson) {
  if (lesson.type === 'text') return { type: 'text', content: lesson.textContent };
  return {
    type: lesson.type,
    contentUrl: await this.storage.presignedUrl(lesson.contentKey!, 3600),
    durationSec: lesson.durationSec,
  };
}
```

---

## Slide 13 — Validate chapter có lesson khi submit course

### Course approve gate (V20 sẽ check)

```ts
async ensureSubmittable(courseId: string) {
  const course = await this.prisma.course.findUnique({
    where: { id: courseId },
    include: { chapters: { include: { lessons: true } } },
  });
  if (!course) throw new NotFoundException();
  if (course.chapters.length === 0) {
    throw new BadRequestException('Course chưa có chapter');
  }
  const emptyChapters = course.chapters.filter(c => c.lessons.length === 0);
  if (emptyChapters.length > 0) {
    throw new BadRequestException(`Chapter ${emptyChapters.map(c => c.title).join(', ')} chưa có lesson`);
  }
}
```

---

## Slide 14 — Bulk reorder lessons

### Same pattern cho lesson trong chapter

```ts
@Post('chapters/:chapterId/lessons/bulk-reorder')
async bulkReorderLessons(
  @Param('chapterId') chapterId: string,
  @ZodBody(BulkReorderDto) body,
  @CurrentUser() u,
) {
  const chapter = await this.prisma.courseChapter.findUnique({
    where: { id: chapterId }, include: { course: true },
  });
  await this.coursesService.ensureOwnership(chapter.courseId, u);

  return this.lessons.bulkReorder(chapterId, body.ids);
}
```

> 💡 Move lesson cross-chapter = endpoint riêng (`POST /lessons/:id/move-to-chapter`) — không lẫn vào reorder.

---

## Slide 15 — Test scenario E2E

```bash
COURSE=$(curl -X POST /v1/courses -H "Authorization: Bearer $TUTOR" -d '...')
CID=$(echo $COURSE | jq -r .id)

# Add 3 chapter
for t in "Chương 1: Hàm số" "Chương 2: Phương trình" "Chương 3: Bất đẳng thức"; do
  curl -X POST /v1/courses/$CID/chapters \
    -H "Authorization: Bearer $TUTOR" \
    -d "{\"title\":\"$t\"}"
done

# List chapters of course
curl /v1/courses/$CID/chapters -H "Authorization: Bearer $TUTOR"

# Reorder: di chương 3 lên đầu
CH3_ID=...
curl -X POST /v1/courses/$CID/chapters/$CH3_ID/reorder \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"position":0}'

# Add lesson video
curl -X POST /v1/chapters/$CH1_ID/lessons \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"title":"Hàm số là gì","type":"video","isFreePreview":true}'

# Upload video
curl -X POST /v1/lessons/$L1/content \
  -H "Authorization: Bearer $TUTOR" \
  -F "file=@./lesson1.mp4"
```

---

## Slide 16 — Limits

```ts
export const LIMITS = {
  MAX_CHAPTERS_PER_COURSE: 30,
  MAX_LESSONS_PER_CHAPTER: 50,
  MAX_VIDEO_SIZE_MB: 500,
  MAX_PDF_SIZE_MB: 50,
  MAX_PPTX_SIZE_MB: 100,
  MAX_TEXT_CONTENT_LENGTH: 50_000,
} as const;
```

**Enforce ở create:**

```ts
async create(courseId, input, user) {
  const count = await this.prisma.courseChapter.count({ where: { courseId } });
  if (count >= LIMITS.MAX_CHAPTERS_PER_COURSE) {
    throw new BadRequestException(`Tối đa ${LIMITS.MAX_CHAPTERS_PER_COURSE} chapter/course`);
  }
  // ...
}
```

---

## Slide 17 — Anti-patterns

```ts
// ❌ Position duplicate
INSERT { position: 5 }, INSERT { position: 5 }   // → unique constraint fail

// ❌ Reorder không trong transaction
UPDATE a SET position = 5
UPDATE b SET position = 5   // → tạm thời conflict

// ❌ Delete chapter không re-pack position
[0, 1, 2, 3] → delete pos=2 → [0, 1, 3] (skip 2)
// → query order vẫn ok, nhưng insert mới phải biết max

// ❌ Trả contentUrl của lesson không free + chưa enroll
return { ...lesson, contentUrl }
// → leak content

// ❌ Tutor cross-edit course khác
PATCH /lessons/<id-of-other-tutor> { title: 'hacked' }
// → ensureOwnership phải qua chapter → course → tutorId
```

---

## Slide 18 — Bài tập thực hành

### 🎯 Course structure full

**Bài 1:** Migration `course_chapters` + `lessons` với unique `(courseId, position)` và `(chapterId, position)`.

**Bài 2:** CRUD chapter + lesson đầy đủ.

**Bài 3:** Bulk reorder cả chapter + lesson.

**Bài 4:** Upload video lesson + extract duration bằng ffprobe.

**Bài 5:** Test free preview:
- Tạo lesson isFreePreview=true → public xem được
- Tạo lesson isFreePreview=false + student chưa enroll → 403

**Bài 6:** Test delete chapter → S3 file lesson cleanup + position re-pack.

**Bài 7:** Implement `ensureSubmittable` check 0 chapter hoặc chapter rỗng.

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| Reorder position = current | No-op |
| Reorder position > count | Đặt cuối (clamp) |
| Move lesson cross-chapter | Endpoint riêng |
| Upload file đúng MIME nhưng nội dung sai | Magic bytes catch |
| Delete chapter có lesson với progress | Cascade — và lesson_progress cũng cascade |
| Bulk reorder thiếu 1 id | Validate id thuộc parent + match count |

---

## Slide 20 — Tổng kết Video 17

### Bạn vừa học

- ✅ Schema chapter + lesson với position unique
- ✅ Nested endpoint structure
- ✅ 4 lesson types (video/pptx/pdf/text)
- ✅ Upload content per type với MIME validate
- ✅ Video duration extraction qua ffprobe
- ✅ Reorder single + bulk (drag-drop FE)
- ✅ isFreePreview cho lesson trial
- ✅ Cascade delete + position re-pack
- ✅ Limits + ensureSubmittable validation

> 💪 Course structure chuẩn = trải nghiệm học mượt

---

<!-- _class: lead -->

# Tiếp theo: Video 18

## File Upload Lesson Content (Multer + MinIO)

Sâu hơn về upload large video, multipart, streaming, chunk upload, progress.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 18 🚀

> *"Structure first. Content second. Audience third."*
