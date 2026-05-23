---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 24: Tutor Availability Slot'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Tutor Availability
# Slot

### Khóa 2-3 — Video 24

**Recurring weekly · Timezone · Valid range**

> Lịch rảnh = cửa của Tutor cho Student book

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Schema `tutor_availability` với recurring weekly
- ✅ Endpoint Tutor **CRUD slot**
- ✅ Validate **overlap** giữa slot của cùng tutor
- ✅ Handle **timezone** (Tutor ở Hà Nội, Student ở Tokyo)
- ✅ `validFrom` / `validTo` cho slot có hạn (ví dụ kỳ thi)
- ✅ Bulk create cho week template

> 🎯 Cuối video: Tutor khai báo lịch rảnh Mon 9-12 và Wed 14-17

---

## Slide 3 — Schema `tutor_availability`

```ts
type TutorAvailability = {
  id: string;
  tutorId: string;                       // FK
  dayOfWeek: number;                     // 0=Sunday, 6=Saturday
  startTime: string;                     // HH:mm "09:00"
  endTime: string;                       // HH:mm "12:00"
  timezone: string;                      // IANA "Asia/Ho_Chi_Minh"
  validFrom: Date;                       // ngày bắt đầu áp dụng
  validTo: Date | null;                  // null = vô thời hạn
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Index: (tutorId, dayOfWeek, startTime)
```

---

## Slide 4 — Vì sao recurring weekly thay vì exact dates?

### Trade-off design

**Option A: Specific datetime (`startAt`, `endAt`)**

```ts
{ tutorId, startAt: '2026-05-25T09:00:00Z', endAt: '...12:00:00Z' }
```

- ❌ Tutor phải khai báo từng tuần
- ❌ N slot cho 1 tháng nhiều

**Option B: Recurring weekly (Tutor365 chọn)**

```ts
{ tutorId, dayOfWeek: 1, startTime: '09:00', endTime: '12:00', timezone, validFrom, validTo }
```

- ✅ 1 record dùng nhiều tuần
- ✅ Update template = update 1 row
- ⚠️ Cần expand sang specific datetime khi check availability

---

## Slide 5 — Endpoint Tutor CRUD

```ts
@Auth('tutor')
@Post('me/availability')
async create(
  @CurrentUser('sub') tutorId: string,
  @ZodBody(CreateAvailabilityDto) body,
) {
  return this.availability.create(tutorId, body);
}

export const CreateAvailabilityDto = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),    // "09:00"
  endTime: z.string().regex(/^\d{2}:\d{2}$/),      // "12:00"
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  validFrom: z.coerce.date().default(new Date()),
  validTo: z.coerce.date().nullable().optional(),
}).refine(d => d.startTime < d.endTime, {
  message: 'startTime phải < endTime',
  path: ['endTime'],
});
```

---

## Slide 6 — Service.create + validate overlap

```ts
async create(tutorId, input) {
  // Tutor approved check
  await this.tutorsService.ensureApproved(tutorId);

  // Validate duration tối thiểu 1.5h
  const startMin = toMinutes(input.startTime);
  const endMin = toMinutes(input.endTime);
  if (endMin - startMin < 90) {
    throw new BadRequestException('Slot tối thiểu 1.5 giờ');
  }

  // Check overlap với slot khác của cùng tutor cùng dayOfWeek
  const overlap = await this.findOverlap(tutorId, input);
  if (overlap) {
    throw new ConflictException('Slot bị chồng lấp với slot khác');
  }

  return this.prisma.tutorAvailability.create({
    data: { tutorId, ...input, isActive: true },
  });
}

private async findOverlap(tutorId, input) {
  const existing = await this.prisma.tutorAvailability.findMany({
    where: {
      tutorId,
      dayOfWeek: input.dayOfWeek,
      isActive: true,
      // Time range overlap check trong app code
    },
  });
  return existing.find(e =>
    !(input.endTime <= e.startTime || input.startTime >= e.endTime)
  );
}
```

---

## Slide 7 — Helper: toMinutes

```ts
// utils/time.ts
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// "09:00" → 540
// "12:30" → 750
```

> 💡 Đơn giản hoá compare. Validate format ở Zod regex.

---

## Slide 8 — List own availability

```ts
@Auth('tutor')
@Get('me/availability')
async listMine(@CurrentUser('sub') tutorId: string) {
  return this.prisma.tutorAvailability.findMany({
    where: { tutorId, isActive: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}
```

**Response:**

```json
[
  { "dayOfWeek": 1, "startTime": "09:00", "endTime": "12:00", "timezone": "Asia/Ho_Chi_Minh" },
  { "dayOfWeek": 3, "startTime": "14:00", "endTime": "17:00", "timezone": "Asia/Ho_Chi_Minh" }
]
```

---

## Slide 9 — Update availability

```ts
@Auth('tutor')
@Patch('me/availability/:id')
async update(
  @Param('id') id: string,
  @CurrentUser('sub') tutorId: string,
  @ZodBody(UpdateAvailabilityDto) body,
) {
  return this.availability.update(id, tutorId, body);
}

async update(id, tutorId, input) {
  const existing = await this.prisma.tutorAvailability.findFirst({
    where: { id, tutorId },
  });
  if (!existing) throw new NotFoundException();

  // Validate overlap với slot khác (loại trừ chính nó)
  const merged = { ...existing, ...input };
  const overlap = await this.prisma.tutorAvailability.findFirst({
    where: {
      tutorId, dayOfWeek: merged.dayOfWeek, isActive: true, id: { not: id },
    },
  });
  // ... overlap check tương tự create

  return this.prisma.tutorAvailability.update({ where: { id }, data: input });
}
```

---

## Slide 10 — Delete (soft) availability

```ts
@Auth('tutor')
@Delete('me/availability/:id')
async delete(@Param('id') id, @CurrentUser('sub') tutorId) {
  // Check không có booking confirmed sử dụng slot này
  // → Skip, vì slot recurring không link trực tiếp booking
  // → Future booking sẽ không khớp với slot inactive

  await this.prisma.tutorAvailability.update({
    where: { id, tutorId } as any,
    data: { isActive: false },
  });
  return { ok: true };
}
```

> 💡 Soft delete để audit. Khôi phục lại = set `isActive=true`.

---

## Slide 11 — Bulk create week template

### Tutor một lần khai báo cả tuần

```ts
@Auth('tutor')
@Post('me/availability/bulk')
async bulkCreate(
  @CurrentUser('sub') tutorId: string,
  @ZodBody(BulkCreateDto) body,
) {
  return this.availability.bulkCreate(tutorId, body.slots);
}

const BulkCreateDto = z.object({
  slots: z.array(CreateAvailabilityDto).min(1).max(50),
});

// Service
async bulkCreate(tutorId, slots) {
  // Validate intra-batch không overlap
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (slots[i].dayOfWeek === slots[j].dayOfWeek
          && !(slots[i].endTime <= slots[j].startTime || slots[i].startTime >= slots[j].endTime)) {
        throw new BadRequestException(`Slot ${i} và ${j} chồng lấp`);
      }
    }
  }

  // Validate với existing
  for (const s of slots) {
    const overlap = await this.findOverlap(tutorId, s);
    if (overlap) throw new ConflictException(`Slot day=${s.dayOfWeek} chồng lấp`);
  }

  return this.prisma.tutorAvailability.createMany({
    data: slots.map(s => ({ tutorId, ...s, isActive: true })),
  });
}
```

---

## Slide 12 — Timezone handling

### Tutor ở Hà Nội (`Asia/Ho_Chi_Minh`), Student ở Tokyo (`Asia/Tokyo`)

```
Tutor slot: dayOfWeek=1 (Mon), 09:00 - 12:00 Asia/Ho_Chi_Minh
                 → 11:00 - 14:00 Asia/Tokyo

Student book: Mon 11:00 Asia/Tokyo
  ↓ convert
  → Mon 09:00 Asia/Ho_Chi_Minh → khớp slot
```

**Lưu DB:** giờ + timezone của Tutor.
**Compare:** convert Student input về Tutor timezone trước khi check.

```ts
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

function studentTimeInTutorTz(studentTimeUtc: Date, tutorTz: string): { dayOfWeek: number; time: string } {
  const zoned = utcToZonedTime(studentTimeUtc, tutorTz);
  return {
    dayOfWeek: zoned.getDay(),
    time: format(zoned, 'HH:mm'),
  };
}
```

---

## Slide 13 — validFrom / validTo

### Slot có hạn

```
Tutor khai báo: "Tôi rảnh thứ 7 sáng cho kỳ thi IELTS từ 1/6 đến 30/6"
  → validFrom = 2026-06-01
  → validTo   = 2026-06-30
```

**Check khi book:**

```ts
async isSlotValid(tutorId, dayOfWeek, time, atDate) {
  return this.prisma.tutorAvailability.findFirst({
    where: {
      tutorId, dayOfWeek, isActive: true,
      startTime: { lte: time },
      endTime: { gte: time },
      validFrom: { lte: atDate },
      OR: [
        { validTo: null },
        { validTo: { gte: atDate } },
      ],
    },
  });
}
```

---

## Slide 14 — Tutor availability summary (public)

### Student xem trước khi book

```ts
@Public()
@Get('tutors/:id/availability')
async publicList(@Param('id') tutorId: string) {
  // Chỉ trả tutor approved
  await this.tutorsService.ensureApproved(tutorId);

  return this.prisma.tutorAvailability.findMany({
    where: { tutorId, isActive: true },
    select: { dayOfWeek: true, startTime: true, endTime: true, timezone: true, validFrom: true, validTo: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}
```

> 💡 V25 sẽ detail public availability với conflict-aware (đã bị book chưa).

---

## Slide 15 — Test curl

```bash
TUTOR=$(curl -X POST /v1/auth/login -d '...' | jq -r .accessToken)

# Single slot
curl -X POST /v1/me/availability \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"dayOfWeek":1,"startTime":"09:00","endTime":"12:00"}'

# Overlap fail
curl -X POST /v1/me/availability \
  -d '{"dayOfWeek":1,"startTime":"11:00","endTime":"14:00"}'
# 409 Conflict

# Bulk
curl -X POST /v1/me/availability/bulk \
  -d '{"slots":[
    {"dayOfWeek":3,"startTime":"14:00","endTime":"17:00"},
    {"dayOfWeek":5,"startTime":"08:00","endTime":"11:00"}
  ]}'

# List
curl /v1/me/availability -H "Authorization: Bearer $TUTOR"

# Public
curl /v1/tutors/$TUTOR_ID/availability

# Delete
curl -X DELETE /v1/me/availability/$SLOT_ID -H "Authorization: Bearer $TUTOR"
```

---

## Slide 16 — Anti-patterns

```ts
// ❌ Lưu startTime dạng Date object
{ startTime: new Date() }   // ngày không có ý nghĩa, chỉ HH:mm cần

// ❌ Không validate format HH:mm
{ startTime: "9:00" }  // hoặc "25:99"
// → regex strict /^\d{2}:\d{2}$/

// ❌ Cho phép overlap
// → Tutor declare 9-12 và 11-14 → confused, hard to assign

// ❌ Quên timezone
// → Khi book cross-zone sẽ off N giờ

// ❌ Hard delete
// → Mất audit, không khôi phục được

// ❌ Trả availability của tutor pending/rejected
// → Student book Tutor chưa duyệt
```

---

## Slide 17 — Edge cases

| Case | Behavior |
|------|----------|
| Slot 00:00 - 23:59 | OK |
| Slot bridge qua ngày (22:00 - 02:00) | Không support — chia thành 2 slot |
| dayOfWeek = 7 | DTO validate max 6 |
| validTo < validFrom | Validate ở DTO refine |
| Tutor rejected khai báo slot | Allow (lưu trữ), nhưng public/book không thấy |
| Bulk có duplicate intra-batch | Reject với error rõ index |

---

## Slide 18 — Bài tập thực hành

### 🎯 Availability CRUD

**Bài 1:** Migration `tutor_availability`.

**Bài 2:** Implement create + list + update + delete với overlap check.

**Bài 3:** Bulk create với intra-batch validate.

**Bài 4:** Test scenario slide 15.

**Bài 5:** Bonus: implement `GET /v1/tutors/:id/availability/expand?from=...&to=...` trả specific datetime cho range.

**Bài 6:** Bonus: timezone test — Tutor ở `Asia/Ho_Chi_Minh`, query với `Asia/Tokyo` time → kết quả khớp.

---

## Slide 19 — Expand recurring → specific datetime

### Helper cho V25 public availability

```ts
async expandSlots(tutorId: string, from: Date, to: Date) {
  const slots = await this.prisma.tutorAvailability.findMany({
    where: { tutorId, isActive: true },
  });

  const result: { startAt: Date; endAt: Date }[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    for (const slot of slots) {
      if (slot.dayOfWeek !== dow) continue;
      if (slot.validFrom > d || (slot.validTo && slot.validTo < d)) continue;

      const [sh, sm] = slot.startTime.split(':').map(Number);
      const [eh, em] = slot.endTime.split(':').map(Number);
      const startAt = new Date(d); startAt.setHours(sh, sm, 0, 0);
      const endAt = new Date(d); endAt.setHours(eh, em, 0, 0);
      result.push({ startAt, endAt });
    }
  }
  return result;
}
```

---

## Slide 20 — Tổng kết Video 24

### Bạn vừa học

- ✅ Schema `tutor_availability` recurring weekly + timezone
- ✅ DTO HH:mm validate + duration min 1.5h
- ✅ Overlap detection trong cùng tutor + dayOfWeek
- ✅ Bulk create cho week template
- ✅ Soft delete via `isActive`
- ✅ Timezone awareness (Tutor / Student khác zone)
- ✅ `validFrom` / `validTo` cho slot có hạn
- ✅ Expand recurring → specific datetime
- ✅ Public availability cho Student (approved only)

> 💪 Availability đúng = cánh cửa của live tutoring

---

<!-- _class: lead -->

# Tiếp theo: Video 25

## Public Availability Endpoint

Student xem availability của Tutor — kèm conflict-aware (đã bị book chưa).

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 25 🚀

> *"Schedules are agreements with time."*
