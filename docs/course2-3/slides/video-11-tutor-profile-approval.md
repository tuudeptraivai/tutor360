---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 11: Tutor Profile + Approval Workflow'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Tutor Profile
# + Approval Workflow

### Khóa 2-3 — Video 11

**Bio · Qualifications · Subjects · Hanah duyệt**

> Một tutor không được duyệt = không thể dạy

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **state machine** approval của tutor profile
- ✅ Bảng `tutor_profiles` + 3 bảng quan hệ (subjects, levels, qualifications)
- ✅ Implement **`PATCH /v1/tutor-profile`** Tutor tự update
- ✅ Implement **`POST /v1/admin/tutors/:id/approve|reject|suspend`**
- ✅ List **pending tutors** cho Hanah dashboard
- ✅ Side effect: approve → enable course publish
- ✅ Email notify Tutor sau decision

> 🎯 Cuối video: Tutor signup → declare profile → Hanah approve → bắt đầu dạy được

---

## Slide 3 — State machine approval

```
pending_admin_approve     ← Tutor signup xong
  ├──▶ approved           (Hanah duyệt, Tutor bắt đầu dạy)
  ├──▶ rejected           (Hanah từ chối, Tutor sửa hồ sơ → pending lại)
  └──▶ suspended          (Hanah ban tạm thời sau khi đã approved)

approved ──▶ suspended    (ban tạm)
suspended ──▶ approved    (reinstate)
rejected ──▶ pending_admin_approve  (Tutor cập nhật profile xong)
```

> 💡 Status `pending_admin_approve` ≠ user `pending_verify`.
> User verify email xong vẫn cần Hanah approve tutor profile riêng.

---

## Slide 4 — Bảng `tutor_profiles`

```ts
type TutorProfile = {
  userId: string;                          // PK = FK to users
  bio: string | null;                      // tự giới thiệu
  approveStatus:
    | 'pending_admin_approve'
    | 'approved'
    | 'rejected'
    | 'suspended';
  rejectReason: string | null;
  hourlyRateOverride: number | null;       // null = dùng pricing_rules default
  approvedAt: Date | null;
  approvedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Bảng quan hệ N:N
type TutorSubject = { tutorId; subjectId; }     // PK composite
type TutorLevel = { tutorId; levelId; }          // PK composite
type TutorQualification = { tutorId; qualificationId; certificateUrl; }
```

---

## Slide 5 — Auto-create profile khi signup tutor

```ts
// auth.service.ts signup() bổ sung
async signup(input: SignupInput) {
  // ... create user
  if (input.role === 'tutor') {
    await this.prisma.tutorProfile.create({
      data: {
        userId: user.id,
        approveStatus: 'pending_admin_approve',
      },
    });
  }
  if (input.role === 'student') {
    await this.prisma.studentProfile.create({
      data: { userId: user.id },
    });
  }
}
```

> 💡 Tutor signup → user.status='pending_verify' VÀ tutorProfile.approveStatus='pending_admin_approve'.

---

## Slide 6 — Tutor cập nhật profile

### `PATCH /v1/tutor-profile`

```ts
@Auth('tutor')
@Patch('tutor-profile')
async updateMine(
  @CurrentUser('sub') tutorId: string,
  @ZodBody(UpdateTutorProfileDto) body,
) {
  return this.tutors.updateOwn(tutorId, body);
}

// DTO
export const UpdateTutorProfileDto = z.object({
  bio: z.string().min(20).max(2000).optional(),
  subjectIds: z.array(z.string().uuid()).max(10).optional(),
  levelIds: z.array(z.string().uuid()).max(10).optional(),
  qualifications: z.array(z.object({
    qualificationId: z.string().uuid(),
    certificateUrl: z.string().url().optional(),
  })).max(20).optional(),
});
```

---

## Slide 7 — Service.updateOwn

```ts
async updateOwn(tutorId: string, input: UpdateTutorProfileInput) {
  const profile = await this.findByUserId(tutorId);

  // Nếu đang rejected → cập nhật tự đưa về pending_admin_approve để Hanah review lại
  const newStatus = profile.approveStatus === 'rejected'
    ? 'pending_admin_approve'
    : profile.approveStatus;

  await this.prisma.$transaction(async (tx) => {
    await tx.tutorProfile.update({
      where: { userId: tutorId },
      data: {
        ...(input.bio !== undefined && { bio: input.bio }),
        approveStatus: newStatus,
        rejectReason: newStatus === 'pending_admin_approve' ? null : profile.rejectReason,
      },
    });

    if (input.subjectIds) {
      await tx.tutorSubject.deleteMany({ where: { tutorId } });
      await tx.tutorSubject.createMany({
        data: input.subjectIds.map((subjectId) => ({ tutorId, subjectId })),
      });
    }
    if (input.levelIds) {
      await tx.tutorLevel.deleteMany({ where: { tutorId } });
      await tx.tutorLevel.createMany({
        data: input.levelIds.map((levelId) => ({ tutorId, levelId })),
      });
    }
    // ... qualifications similar
  });
}
```

---

## Slide 8 — Hanah list pending tutors

### `GET /v1/admin/tutors?status=pending_admin_approve`

```ts
@AdminOnly()
@Get('admin/tutors')
list(@ZodQuery(ListTutorsQuery) q) {
  return this.tutors.adminList(q);
}

// query
const ListTutorsQuery = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().max(100).default(20),
  status: z.enum(['pending_admin_approve', 'approved', 'rejected', 'suspended', 'all']).default('all'),
  subjectId: z.string().uuid().optional(),
  q: z.string().optional(),    // search by name
  sort: z.enum(['newest', 'oldest']).default('newest'),
});
```

---

## Slide 9 — Approve endpoint

```ts
@AdminOnly()
@Post('admin/tutors/:id/approve')
async approve(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
  return this.tutors.approve(id, adminId);
}

// Service
async approve(tutorId: string, adminId: string) {
  const profile = await this.findByUserId(tutorId);
  if (profile.approveStatus === 'approved') {
    return profile;     // idempotent
  }
  if (!['pending_admin_approve', 'rejected', 'suspended'].includes(profile.approveStatus)) {
    throw new BadRequestException('Trạng thái không hợp lệ');
  }

  const updated = await this.prisma.tutorProfile.update({
    where: { userId: tutorId },
    data: {
      approveStatus: 'approved',
      approvedAt: new Date(),
      approvedByAdminId: adminId,
      rejectReason: null,
    },
  });

  await this.auditLog.record({
    actorUserId: adminId,
    action: 'tutor.approve',
    entityId: tutorId,
  });

  await this.mailer.sendTutorApprovedEmail(profile.userId);
  return toPublicTutorProfile(updated);
}
```

---

## Slide 10 — Reject endpoint

```ts
@AdminOnly()
@Post('admin/tutors/:id/reject')
async reject(
  @Param('id') id: string,
  @CurrentUser('sub') adminId: string,
  @ZodBody(RejectDto) body,
) {
  return this.tutors.reject(id, adminId, body.reason);
}

export const RejectDto = z.object({
  reason: z.string().trim().min(10).max(1000),
});

// Service
async reject(tutorId: string, adminId: string, reason: string) {
  await this.prisma.tutorProfile.update({
    where: { userId: tutorId },
    data: {
      approveStatus: 'rejected',
      rejectReason: reason,
    },
  });
  await this.auditLog.record({ actorUserId: adminId, action: 'tutor.reject', metadata: { reason } });
  await this.mailer.sendTutorRejectedEmail(tutorId, reason);
}
```

---

## Slide 11 — Suspend / unsuspend

### Tạm khoá Tutor đã approved

```ts
async suspend(tutorId: string, adminId: string, reason: string) {
  const profile = await this.findByUserId(tutorId);
  if (profile.approveStatus !== 'approved') {
    throw new BadRequestException('Chỉ tutor đã approved mới suspend được');
  }

  await this.prisma.$transaction([
    // 1. Suspend profile
    this.prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: { approveStatus: 'suspended', rejectReason: reason },
    }),
    // 2. Cancel pending bookings của tutor này
    this.prisma.sessionBooking.updateMany({
      where: {
        tutorId,
        status: { in: ['assigned', 'confirmed'] },
        startAt: { gt: new Date() },
      },
      data: { status: 'cancelled' },
    }),
  ]);

  await this.auditLog.record({ actorUserId: adminId, action: 'tutor.suspend' });
  // Notify Tutor + affected Students
}
```

---

## Slide 12 — Course gate: chỉ approved tutor publish được

### Cross-module check

```ts
// modules/courses/courses.service.ts
async submitForApproval(courseId: string, tutorId: string) {
  const profile = await this.tutorProfilesService.findByUserId(tutorId);
  if (profile.approveStatus !== 'approved') {
    throw new ForbiddenException(
      'Hồ sơ Tutor chưa được duyệt — không thể submit course'
    );
  }
  // ... continue
}
```

> 💡 Quan trọng: gate này CHẶN tutor pending submit course trước khi profile approved.

---

## Slide 13 — Booking gate: chỉ approved tutor được assign

```ts
// modules/assignments/assignments.service.ts (preview Section 10)
async assign(bookingId: string, tutorId: string, adminId: string) {
  const profile = await this.tutorProfilesService.findByUserId(tutorId);
  if (profile.approveStatus !== 'approved') {
    throw new BadRequestException(
      'Chỉ tutor đã approved mới được assign'
    );
  }
  // ... check eligibility (Section 10)
}
```

**Pattern:** Gate centralized trong service tutor → reuse.

---

## Slide 14 — Tutor profile public endpoint

### `GET /v1/tutors/:id` — Student xem trước khi book

```ts
@Public()
@Get('tutors/:id')
async publicProfile(@Param('id') id: string) {
  const profile = await this.tutors.findApprovedByUserId(id);
  // ↑ chỉ trả nếu approved
  if (!profile) throw new NotFoundException();
  return toPublicTutorProfile(profile);
}
```

**Public shape ẩn field nội bộ:**

```ts
{
  id, fullName, bio, subjects, levels, qualifications,
  rating: 4.5, totalReviews: 23,
  // KHÔNG có: email, phone, approveStatus, approvedAt
}
```

---

## Slide 15 — Approval workflow timeline

```
T0: Tutor signup
    user.status = 'pending_verify'
    tutorProfile.approveStatus = 'pending_admin_approve'

T1: Tutor verify email
    user.status = 'active'
    tutorProfile.approveStatus = 'pending_admin_approve' (unchanged)

T2: Tutor cập nhật bio + chọn subject
    tutorProfile.bio set
    tutor_subjects rows created

T3: Hanah list pending → review Tutor X
    GET /v1/admin/tutors?status=pending_admin_approve

T4: Hanah approve
    tutorProfile.approveStatus = 'approved'
    audit log + email notify

T5: Tutor có thể submit course + Hanah assign booking
```

---

## Slide 16 — Test scenario

```bash
# 1. Tutor signup + verify
TUTOR=$(curl -s -X POST /v1/auth/signup -d '{"role":"tutor",...}' )
# ... verify email ...
TUTOR_TOKEN=$(curl -s -X POST /v1/auth/login ... | jq -r .accessToken)

# 2. Tutor cập nhật profile
curl -X PATCH /v1/tutor-profile \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d '{"bio":"5 năm dạy toán...","subjectIds":["s-math"],"levelIds":["l-grade-10"]}'

# 3. Tutor try submit course → 403
curl -X POST /v1/courses/c-1/submit \
  -H "Authorization: Bearer $TUTOR_TOKEN"
# 403 - Hồ sơ Tutor chưa được duyệt

# 4. Hanah approve
ADMIN_TOKEN=$(curl -s -X POST /v1/auth/login ... | jq -r .accessToken)
curl -X POST /v1/admin/tutors/<tutor-id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 5. Tutor submit course → 200
curl -X POST /v1/courses/c-1/submit \
  -H "Authorization: Bearer $TUTOR_TOKEN"
# 200
```

---

## Slide 17 — Reject + resubmit cycle

```bash
# Hanah reject
curl -X POST /v1/admin/tutors/<id>/reject \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason":"Bio thiếu kinh nghiệm cụ thể"}'

# Tutor nhận email + xem profile
curl /v1/tutor-profile -H "Authorization: Bearer $TUTOR_TOKEN"
# { approveStatus: "rejected", rejectReason: "Bio thiếu..." }

# Tutor sửa bio
curl -X PATCH /v1/tutor-profile \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d '{"bio":"5 năm dạy toán THPT, thạc sĩ ĐH Quốc Gia..."}'
# → tự động chuyển approveStatus về pending_admin_approve

# Hanah review lại
curl '/v1/admin/tutors?status=pending_admin_approve' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Slide 18 — Validation business rule

### Bắt buộc khai báo subject + level trước approve

```ts
async approve(tutorId, adminId) {
  const profile = await this.findByUserIdWithRelations(tutorId);

  // Pre-condition
  if (!profile.bio || profile.bio.length < 20) {
    throw new BadRequestException('Tutor chưa khai báo bio');
  }
  if (profile.subjects.length === 0) {
    throw new BadRequestException('Tutor chưa khai báo môn dạy');
  }
  if (profile.levels.length === 0) {
    throw new BadRequestException('Tutor chưa khai báo level');
  }

  // ... proceed approve
}
```

> 💡 Hanah không thể approve tutor profile rỗng.

---

## Slide 19 — Anti-patterns

```ts
// ❌ Approve idempotent fail
if (status !== 'pending') throw new Error('không approve được');
// → admin click 2 lần = lỗi. Đúng: check status==='approved' → return luôn.

// ❌ Không gate ở service tutor
// → Tutor pending submit course OK → published không hợp lệ

// ❌ Suspend không cancel booking
// → Student book tutor → đến giờ tutor mất → 0 mechanism cancel

// ❌ Reject không reason
// → Tutor không biết phải sửa gì

// ❌ Tutor approve bằng tự update flag
PATCH /tutor-profile { approveStatus: 'approved' }  // → block field

// ❌ Trả approveStatus của tutor khác trong public endpoint
```

---

## Slide 20 — Bài tập thực hành

### 🎯 Tutor lifecycle E2E

**Bài 1:** Migration `tutor_profiles` + `tutor_subjects` + `tutor_levels` + `tutor_qualifications`.

**Bài 2:** Implement 6 endpoint:
- PATCH /v1/tutor-profile
- GET /v1/admin/tutors?status=...
- GET /v1/admin/tutors/:id
- POST /v1/admin/tutors/:id/approve|reject|suspend

**Bài 3:** Test full lifecycle (slide 16+17).

**Bài 4:** Test gate: tutor pending submit course → 403.

**Bài 5:** Test suspend → pending bookings cancel:
- Seed 1 booking confirmed của tutor
- Hanah suspend → query verify booking status='cancelled'

**Bài 6:** Bonus: thêm validation Hanah không approve nếu bio < 20 ký tự.

---

## Slide 21 — Tổng kết Video 11

### Bạn vừa học

- ✅ State machine tutor approval (4 trạng thái)
- ✅ Auto-create tutorProfile khi signup tutor
- ✅ Tutor update profile → tự reset về pending nếu đang rejected
- ✅ Hanah list filter, approve/reject/suspend endpoint
- ✅ Side effect: suspend → cancel future bookings
- ✅ Cross-module gate: chỉ approved tutor publish course / được assign
- ✅ Public tutor profile cho Student xem
- ✅ Audit + email notification mọi transition
- ✅ Validation Hanah không approve profile rỗng

> 💪 Approval workflow chuẩn = business gate chắc chắn

---

<!-- _class: lead -->

# Tiếp theo: Video 12

## Student Profile + Avatar Upload

Student profile (grade, guardian, timezone) + upload avatar lên MinIO (S3-compat).

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 12 🚀

> *"Workflows are state machines wearing a domain hat."*
