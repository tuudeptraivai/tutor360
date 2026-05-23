---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 15: Qualifications CRUD + Certificate Upload'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Qualifications CRUD
# + Certificate Upload

### Khóa 2-3 — Video 15

**Bằng cấp · Chứng chỉ · Upload PDF**

> Hanah duyệt Tutor dựa vào bằng cấp được verify

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `qualifications` + N:N `tutor_qualifications` với `certificateUrl`
- ✅ CRUD admin master data
- ✅ Tutor upload **PDF certificate** lên MinIO
- ✅ Hanah review certificate qua presigned URL
- ✅ Gating: tutor không đủ qualification → không approve được
- ✅ Seed 20 qualification mẫu VN

> 🎯 Cuối video: Tutor upload bằng tốt nghiệp → Hanah xem → approve

---

## Slide 3 — Schema `qualifications`

```ts
type Qualification = {
  id: string;
  name: string;                            // "Cử nhân Sư phạm", "IELTS 8.0"
  slug: string;
  description: string | null;
  category: 'degree' | 'certificate' | 'experience';
  isActive: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

// N:N với extra field
type TutorQualification = {
  id: string;
  tutorId: string;
  qualificationId: string;
  certificateKey: string | null;            // S3 key tới file PDF
  verifiedAt: Date | null;                  // Hanah đánh dấu đã verify
  verifiedByAdminId: string | null;
  note: string | null;
  createdAt: Date;
};
```

---

## Slide 4 — Seed qualifications mẫu

```ts
const QUALIFICATIONS = [
  // Degrees
  { category: 'degree', name: 'Cử nhân Sư phạm', position: 0 },
  { category: 'degree', name: 'Cử nhân Khoa học', position: 1 },
  { category: 'degree', name: 'Thạc sĩ Sư phạm', position: 2 },
  { category: 'degree', name: 'Thạc sĩ Khoa học', position: 3 },
  { category: 'degree', name: 'Tiến sĩ', position: 4 },

  // Certificates - tiếng Anh
  { category: 'certificate', name: 'IELTS 7.0+', position: 10 },
  { category: 'certificate', name: 'IELTS 8.0+', position: 11 },
  { category: 'certificate', name: 'TOEFL iBT 100+', position: 12 },
  { category: 'certificate', name: 'TESOL', position: 13 },
  { category: 'certificate', name: 'CELTA', position: 14 },

  // Certificates - khác
  { category: 'certificate', name: 'Chứng chỉ Bồi dưỡng Nghiệp vụ Sư phạm', position: 20 },

  // Experience
  { category: 'experience', name: '1-3 năm dạy', position: 30 },
  { category: 'experience', name: '3-5 năm dạy', position: 31 },
  { category: 'experience', name: '5+ năm dạy', position: 32 },
];
```

---

## Slide 5 — Tutor declare qualification với certificate

```ts
// dto/declare-qualification.dto.ts
export const DeclareQualificationDto = z.object({
  qualificationId: z.string().uuid(),
  certificateKey: z.string().optional(),     // optional (cho experience không cần cert)
  note: z.string().max(500).optional(),
});

// Endpoint
@Auth('tutor')
@Post('me/qualifications')
add(
  @CurrentUser('sub') tutorId: string,
  @ZodBody(DeclareQualificationDto) body,
) {
  return this.tutors.addQualification(tutorId, body);
}

@Auth('tutor')
@Delete('me/qualifications/:id')
remove(@CurrentUser('sub') tutorId, @Param('id') id) {
  return this.tutors.removeQualification(tutorId, id);
}
```

---

## Slide 6 — Upload certificate PDF: 2 bước

### Step 1 — upload file, lấy key

```ts
@Auth('tutor')
@Post('me/qualifications/upload-certificate')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
async uploadCertificate(
  @CurrentUser('sub') tutorId: string,
  @UploadedFile() file: Express.Multer.File,
) {
  if (file.mimetype !== 'application/pdf') {
    throw new BadRequestException('Chỉ chấp nhận PDF');
  }
  // Magic bytes PDF: %PDF
  if (file.buffer.subarray(0, 4).toString() !== '%PDF') {
    throw new BadRequestException('File không phải PDF hợp lệ');
  }

  const key = `certificates/${tutorId}/${randomUUID()}.pdf`;
  await this.storage.put({ key, body: file.buffer, contentType: 'application/pdf' });

  return { key };
}
```

### Step 2 — declare với key

```ts
POST /v1/me/qualifications
{ qualificationId, certificateKey: "<key from step 1>" }
```

---

## Slide 7 — Service.addQualification

```ts
async addQualification(tutorId: string, input: DeclareQualificationInput) {
  const qual = await this.prisma.qualification.findUnique({
    where: { id: input.qualificationId, isActive: true } as any,
  });
  if (!qual) throw new BadRequestException('Qualification không hợp lệ');

  // Anti-dup: 1 tutor không declare cùng qualification 2 lần
  const dup = await this.prisma.tutorQualification.findFirst({
    where: { tutorId, qualificationId: input.qualificationId },
  });
  if (dup) throw new ConflictException('Đã khai báo qualification này');

  // Validate certificate key nếu có
  if (input.certificateKey) {
    await this.storage.headObject(input.certificateKey);  // throw nếu không tồn tại
  }

  return this.prisma.tutorQualification.create({
    data: {
      tutorId,
      qualificationId: input.qualificationId,
      certificateKey: input.certificateKey ?? null,
      note: input.note ?? null,
    },
  });
}
```

---

## Slide 8 — Hanah review qualifications

### GET tutor profile detail trả qualifications + certificate URL

```ts
@AdminOnly()
@Get('admin/tutors/:id')
async detail(@Param('id') id: string) {
  const profile = await this.prisma.tutorProfile.findUnique({
    where: { userId: id },
    include: {
      qualifications: {
        include: { qualification: true },
      },
    },
  });
  if (!profile) throw new NotFoundException();

  // Resolve certificate URLs
  const quals = await Promise.all(profile.qualifications.map(async (tq) => ({
    id: tq.id,
    qualification: tq.qualification,
    note: tq.note,
    verifiedAt: tq.verifiedAt,
    certificateUrl: tq.certificateKey
      ? await this.storage.presignedUrl(tq.certificateKey, 3600)
      : null,
  })));

  return { ...toPublicTutorProfile(profile), qualifications: quals };
}
```

---

## Slide 9 — Hanah verify từng qualification

```ts
@AdminOnly()
@Post('admin/tutor-qualifications/:id/verify')
async verifyQual(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
) {
  return this.tutors.verifyQualification(id, adminId);
}

// Service
async verifyQualification(id: string, adminId: string) {
  await this.prisma.tutorQualification.update({
    where: { id },
    data: { verifiedAt: new Date(), verifiedByAdminId: adminId },
  });
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'tutor_qualification.verify',
    entityId: id,
  });
}
```

> 💡 Mỗi qualification verify riêng — Hanah có thể accept bằng tốt nghiệp, reject IELTS giả.

---

## Slide 10 — Approval gate: cần ít nhất 1 verified

### Refine approval check ở V11

```ts
async approve(tutorId, adminId) {
  // ... existing checks

  const verifiedCount = await this.prisma.tutorQualification.count({
    where: { tutorId, verifiedAt: { not: null } },
  });
  if (verifiedCount === 0) {
    throw new BadRequestException(
      'Tutor phải có ít nhất 1 qualification đã verified',
    );
  }

  // ... proceed approve
}
```

> 💡 Quy tắc business: ít nhất 1 bằng cấp hoặc kinh nghiệm verified mới được dạy.

---

## Slide 11 — Reject qualification

```ts
@AdminOnly()
@Post('admin/tutor-qualifications/:id/reject')
async rejectQual(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(RejectDto) body,
) {
  await this.prisma.tutorQualification.update({
    where: { id },
    data: { verifiedAt: null, note: `[REJECTED]: ${body.reason}` },
  });
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'tutor_qualification.reject',
    metadata: { reason: body.reason },
  });
}
```

**Notify tutor:** email với reason → Tutor upload lại certificate / xoá qualification.

---

## Slide 12 — Public hiển thị bằng cấp

### Storefront tutor profile

```ts
@Public()
@Get('tutors/:id')
async publicProfile(@Param('id') id: string) {
  const profile = await this.findApprovedByUserId(id);
  if (!profile) throw new NotFoundException();

  const quals = await this.prisma.tutorQualification.findMany({
    where: { tutorId: id, verifiedAt: { not: null } },   // chỉ verified
    include: { qualification: true },
    orderBy: { qualification: { position: 'asc' } },
  });

  return {
    ...toPublicTutorProfile(profile),
    qualifications: quals.map(q => q.qualification.name),
    // KHÔNG trả certificateUrl ra public — privacy
  };
}
```

> 💡 Public chỉ thấy **tên qualification verified**, không có URL chứng chỉ.

---

## Slide 13 — Test scenario

```bash
# 1. Tutor upload certificate PDF
UPLOAD=$(curl -X POST /v1/me/qualifications/upload-certificate \
  -H "Authorization: Bearer $TUTOR" \
  -F "file=@/path/diploma.pdf")
CERT_KEY=$(echo $UPLOAD | jq -r .key)

# 2. Tutor declare
curl -X POST /v1/me/qualifications \
  -H "Authorization: Bearer $TUTOR" \
  -d "{\"qualificationId\":\"<degree-id>\",\"certificateKey\":\"$CERT_KEY\"}"

# 3. Hanah xem
curl /v1/admin/tutors/<tutor-id> -H "Authorization: Bearer $ADMIN"
# qualifications: [{ ..., certificateUrl: "https://minio.../...?sig=..." }]

# 4. Hanah verify
curl -X POST /v1/admin/tutor-qualifications/<tq-id>/verify \
  -H "Authorization: Bearer $ADMIN"

# 5. Hanah approve tutor
curl -X POST /v1/admin/tutors/<tutor-id>/approve \
  -H "Authorization: Bearer $ADMIN"

# 6. Public xem (chỉ name, không URL)
curl /v1/tutors/<tutor-id>
# qualifications: ["Cử nhân Sư phạm", "IELTS 7.0+"]
```

---

## Slide 14 — Cleanup orphan certificates

### Tutor xoá qualification → cleanup file

```ts
async removeQualification(tutorId: string, id: string) {
  const tq = await this.prisma.tutorQualification.findFirst({
    where: { id, tutorId },
  });
  if (!tq) throw new NotFoundException();

  await this.prisma.tutorQualification.delete({ where: { id } });

  // Cleanup S3
  if (tq.certificateKey) {
    try {
      await this.storage.delete(tq.certificateKey);
    } catch (e) {
      this.logger.warn(`Failed to delete certificate ${tq.certificateKey}: ${e.message}`);
    }
  }
}
```

> 💡 Best-effort cleanup — không throw nếu S3 fail (DB consistency quan trọng hơn).

---

## Slide 15 — Cron cleanup orphan S3 keys

### File upload nhưng chưa declare

```ts
// Tutor upload file → tạo S3 key
// Nhưng không declare → orphan, không có row tutor_qualifications tham chiếu
// Cron 1 ngày/lần cleanup

@Cron('0 4 * * *')
async cleanupOrphanCertificates() {
  const allKeys = await this.storage.listAllKeys('certificates/');
  const usedKeys = (await this.prisma.tutorQualification.findMany({
    where: { certificateKey: { not: null } },
    select: { certificateKey: true },
  })).map(r => r.certificateKey!);

  const orphans = allKeys.filter(k => !usedKeys.includes(k));
  const cutoffDays = 7;   // chỉ xoá file > 7 ngày

  for (const key of orphans) {
    const meta = await this.storage.headObject(key);
    if (Date.now() - meta.LastModified!.getTime() > cutoffDays * 86400 * 1000) {
      await this.storage.delete(key);
    }
  }
}
```

---

## Slide 16 — Section 4 hoàn tất

### Taxonomy master data ready

✅ V13 — Subjects (12 môn) + CRUD + slug + Tutor declare
✅ V14 — Levels (17 trình độ) + group filter
✅ V15 — Qualifications (20+) + certificate upload + Hanah verify

**Section 5 — Course Marketplace** (4 video) sẽ dùng:

- Tutor đã approved + đã có subject/level/qualification
- Build course → chapter → lesson → upload video/pdf

> 🚀 Sang Section 5 — feature core của Tutor365.

---

## Slide 17 — Anti-patterns

```ts
// ❌ Cho phép tutor verify mình
@Post('me/qualifications/:id/verify')   // → block

// ❌ Public expose certificateUrl
return { qualifications: tutorQuals.map(q => ({...q, url})) };
// → Bằng cấp leak public

// ❌ Trust certificateKey từ body
{ certificateKey: "../../system/secret" }   // path traversal
// → headObject() validate tồn tại trong bucket

// ❌ Không cleanup S3 khi remove
DELETE tutor_qualification → S3 file giữ mãi

// ❌ Approve tutor không verified qual nào
// → MVP gate ít nhất 1 verified
```

---

## Slide 18 — Edge cases

| Case | Behavior |
|------|----------|
| Upload PDF > 5MB | 413 |
| Upload file PDF giả (đổi tên .pdf, nội dung .exe) | Magic bytes catch |
| Declare cùng qualification 2 lần | 409 Conflict |
| Tutor xoá qualification đã verified | Allow, audit log |
| Hanah reject + Tutor declare lại | OK — verifiedAt = null lại |
| Certificate key trỏ file không tồn tại trong S3 | `headObject` throw |
| Public xem tutor → quals chưa verified | Không hiển thị |

---

## Slide 19 — Bài tập thực hành

### 🎯 Full qualification flow

**Bài 1:** Seed 20 qualification mẫu (slide 4).

**Bài 2:** Implement upload-certificate endpoint với PDF validate.

**Bài 3:** Implement declare + remove qualification.

**Bài 4:** Implement Hanah verify + reject.

**Bài 5:** Test E2E (slide 13).

**Bài 6:** Gate: tutor 0 verified qualification → Hanah approve trả 400.

**Bài 7:** Bonus: implement cron cleanup orphan certificates (slide 15) — verify file > 7 ngày được xoá.

---

## Slide 20 — Tổng kết Video 15

### Bạn vừa học

- ✅ Schema qualifications 3 category (degree, certificate, experience)
- ✅ N:N với extra field `certificateKey` + `verifiedAt`
- ✅ Upload PDF + magic bytes validate
- ✅ Hanah verify/reject từng qualification riêng
- ✅ Approval gate: ≥1 verified mới approve được tutor
- ✅ Public hiển thị name, KHÔNG URL
- ✅ Cleanup orphan S3 key bằng cron
- ✅ Pattern declare + upload 2 bước (key → declare)

> 💪 Verification flow chuẩn = trust layer của marketplace

---

<!-- _class: lead -->

# Tiếp theo: Video 16

## Courses CRUD + Detail Public

Tutor tạo course với title, slug, price, level, subject. Public storefront list + filter + detail.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 16 🚀

> *"Verification is not a feature; it's a contract with users."*
