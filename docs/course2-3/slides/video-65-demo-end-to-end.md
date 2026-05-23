---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 65: Demo End-to-End'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Demo End-to-End
# 🎉

### Khóa 2-3 — Video 65 (Cuối)

**Student → Mua course → Book combo → Tutor dạy → Payout**

> 65 video → 1 demo chứng minh tất cả hoạt động

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Run full demo từ start
- ✅ Trace data flow qua mọi module
- ✅ Verify business invariants
- ✅ Celebrate completion 🎉
- ✅ Roadmap forward (C4, C5, C6, ...)

> 🎯 Cuối video: bạn confidence ship Tutor365 backend

---

## Slide 3 — Demo flow

```
1. Reset DB + seed master data + Hanah
2. Tutor signup + verify email + cập nhật profile + Hanah approve
3. Tutor declare availability + tạo course + Hanah approve course
4. Student signup + login
5. Student mua course (VNPay sandbox)
6. Student xem lesson + report progress
7. Student book combo live (4 tuần × 3 buổi)
8. Hanah filter eligible tutor + assign
9. Tutor accept → Jitsi URL generated
10. Đến giờ học: Student + Tutor join Jitsi
11. Cron mark in_progress → completed
12. Student review course
13. End of month: cron generate payout cho Tutor
14. Hanah finalize + mark paid
```

---

## Slide 4 — Step 1: Reset + Seed

```bash
docker-compose up -d postgres mailpit minio
pnpm db:reset                  # drop + migrate + seed
pnpm --filter @tutor365/api dev

# Verify health
curl http://localhost:3000/health
# { status: 'ok', db: 'up' }

# Open Swagger
open http://localhost:3000/api/docs
```

---

## Slide 5 — Step 2: Tutor signup + approve

```bash
# Signup
curl -X POST /v1/auth/signup \
  -d '{"email":"newtutor@x.com","password":"Pass1234","fullName":"New Tutor","role":"tutor"}'

# Verify email (check MailPit)
open http://localhost:8025
# Copy verify link → curl /v1/auth/verify?token=...

# Login
TUTOR=$(curl -X POST /v1/auth/login \
  -d '{"email":"newtutor@x.com","password":"Pass1234"}' | jq -r .accessToken)

# Update profile
curl -X PATCH /v1/tutor-profile \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"bio":"5 năm dạy toán THPT","subjectIds":["math-id"],"levelIds":["lop-10-id"]}'

# Hanah approve
ADMIN=$(curl -X POST /v1/auth/login \
  -d '{"email":"hanah@tutor365.vn","password":"Hanah@123"}' | jq -r .accessToken)

curl -X POST /v1/admin/tutors/<tutor-id>/approve \
  -H "Authorization: Bearer $ADMIN"
```

---

## Slide 6 — Step 3: Availability + Course

```bash
# Tutor khai báo lịch rảnh
curl -X POST /v1/me/availability/bulk \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"slots":[
    {"dayOfWeek":1,"startTime":"19:00","endTime":"22:00"},
    {"dayOfWeek":3,"startTime":"19:00","endTime":"22:00"},
    {"dayOfWeek":5,"startTime":"19:00","endTime":"22:00"}
  ]}'

# Tutor tạo course
COURSE=$(curl -X POST /v1/courses \
  -H "Authorization: Bearer $TUTOR" \
  -d '{
    "title":"Toán Lớp 10 - Đại số cơ bản",
    "subjectId":"...",
    "levelId":"...",
    "priceVnd":499000
  }' | jq -r .id)

# Add chapter + lesson (truncated — see V17)
curl -X POST /v1/courses/$COURSE/chapters -d '{"title":"Chương 1"}'
# ... upload lesson content

# Submit
curl -X POST /v1/courses/$COURSE/submit -H "Authorization: Bearer $TUTOR"

# Hanah approve
curl -X POST /v1/admin/courses/$COURSE/approve -H "Authorization: Bearer $ADMIN"
```

---

## Slide 7 — Step 4-5: Student mua course

```bash
# Student signup + login
curl -X POST /v1/auth/signup -d '{"email":"hong@x.com",...,"role":"student"}'
# verify email
STUDENT=$(curl -X POST /v1/auth/login -d '...' | jq -r .accessToken)

# Browse course
curl '/v1/courses?subjectSlug=toan-hoc&levelSlug=lop-10'

# Buy course
BUY=$(curl -X POST /v1/courses/$COURSE/buy \
  -H "Authorization: Bearer $STUDENT")
VNPAY=$(echo $BUY | jq -r .vnpayUrl)

# Open VNPay sandbox in browser
open "$VNPAY"
# Enter test card 9704198526191432198 / NGUYEN VAN A / 07/15 / OTP 123456

# VNPay xử lý
# → IPN gọi backend
# → markPaid → tạo enrollment

# Verify
curl /v1/me/enrollments -H "Authorization: Bearer $STUDENT"
# [{ course: { title: "Toán Lớp 10..." }, enrolledAt: now }]
```

---

## Slide 8 — Step 6: Xem lesson + progress

```bash
# Browse course detail
curl /v1/courses/toan-lop-10-dai-so-co-ban -H "Authorization: Bearer $STUDENT"
# enrolled: true, chapters: [...], lessons accessible

# Get lesson content
curl /v1/lessons/<lesson-id>/content -H "Authorization: Bearer $STUDENT"
# { contentUrl: "https://minio.../...?signature=..." }

# Report progress (simulating watch)
curl -X POST /v1/lessons/<lesson-id>/progress \
  -H "Authorization: Bearer $STUDENT" \
  -d '{"watchedSec":300}'

curl -X POST /v1/lessons/<lesson-id>/progress -d '{"watchedSec":540}'   # 90%+ → auto complete

# Verify enrollment progress
curl /v1/enrollments/<enr-id>/progress -H "Authorization: Bearer $STUDENT"
# progressPercent: 33 (1/3 lesson done)
```

---

## Slide 9 — Step 7: Book combo

```bash
# Student book combo 1 tháng × 3 buổi/tuần
COMBO=$(curl -X POST /v1/bookings \
  -H "Authorization: Bearer $STUDENT" \
  -d '{
    "type":"combo",
    "subjectId":"math-id",
    "levelId":"lop-10-id",
    "startDate":"2026-06-01",
    "durationHr":1.5,
    "numMonths":1,
    "weeklyDays":[1,3,5],
    "timeOfDay":"19:00"
  }')

PARENT_ID=$(echo $COMBO | jq -r .parent.id)
ORDER=$(echo $COMBO | jq -r .order.id)

# Pay (VNPay sandbox)
# → IPN markPaid → parent + 12 children pending_assign

# Verify
curl /v1/me/bookings/$PARENT_ID/children -H "Authorization: Bearer $STUDENT"
# 12 children, status=pending_assign
```

---

## Slide 10 — Step 8: Hanah assign

```bash
# Hanah list pending
curl '/v1/admin/bookings/pending-assign' -H "Authorization: Bearer $ADMIN"
# [{ id: PARENT_ID, status: 'pending_assign', recurrenceRule: 'FREQ=WEEKLY;...' }]

# Eligible tutor filter (V30)
curl /v1/admin/bookings/$PARENT_ID/eligible-tutors -H "Authorization: Bearer $ADMIN"
# [{ userId: 'tutor-id', fullName: 'New Tutor', avgRating: ..., eligible }]

# Assign
curl -X POST /v1/admin/bookings/$PARENT_ID/assign \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"tutorId":"<tutor-id>"}'

# → Parent + 12 children all assigned
```

---

## Slide 11 — Step 9: Tutor accept

```bash
# Tutor xem assigned
curl /v1/me/bookings/assigned -H "Authorization: Bearer $TUTOR"
# [parent + 12 children]

# Accept parent → confirm all children
curl -X POST /v1/bookings/$PARENT_ID/accept -H "Authorization: Bearer $TUTOR"
# status: 'confirmed', meetingRoomName: 'tutor365-<id>'

# Verify children also confirmed
curl /v1/me/bookings/$PARENT_ID/children -H "Authorization: Bearer $STUDENT"
# All status: 'confirmed' với meetingRoomName each
```

---

## Slide 12 — Step 10-11: Live session

```bash
# Đến giờ học buổi đầu — Student + Tutor join
curl /v1/sessions/<child-id>/join -H "Authorization: Bearer $STUDENT"
# → Redirect to https://meet.jit.si/tutor365-<child-id>

# Attendance recorded (FE iframe event)
# Or manual:
curl -X POST /v1/sessions/<child-id>/attendances -H "Authorization: Bearer $STUDENT"
curl -X POST /v1/sessions/<child-id>/attendances -H "Authorization: Bearer $TUTOR"

# Cron 5p chuyển in_progress
curl -X POST /v1/admin/cron/booking-reconcile -H "Authorization: Bearer $ADMIN"

# Verify
curl /v1/me/bookings/<child-id>
# status: 'in_progress'

# Sau 1.5h duration + cron
# status: 'completed'
```

---

## Slide 13 — Step 12: Review

```bash
# Student review course (sau khi học xong vài lesson)
curl -X POST /v1/courses/$COURSE/reviews \
  -H "Authorization: Bearer $STUDENT" \
  -d '{"rating":5,"comment":"Khoá học chất lượng! Giảng viên giải thích rõ."}'

# Tutor reply
curl -X POST /v1/courses/$COURSE/reviews/<rev-id>/reply \
  -H "Authorization: Bearer $TUTOR" \
  -d '{"text":"Cảm ơn bạn đã chia sẻ!"}'

# Public xem review
curl /v1/courses/$COURSE/reviews
# [{ rating: 5, ..., tutorReply: "Cảm ơn..." }]
```

---

## Slide 14 — Step 13-14: Payout

```bash
# End of month — cron generate
curl -X POST /v1/admin/cron/generate-payouts -H "Authorization: Bearer $ADMIN"

# Hanah list payouts
curl '/v1/admin/payouts?status=draft' -H "Authorization: Bearer $ADMIN"
# [{
#   tutorId, periodYear: 2026, periodMonth: 4,
#   courseRevenue: 499000,           # 1 student bought course
#   sessionRevenue: 1800000,         # 4 buổi × 300k = 1.2M (only 4 sessions in current month period of testing)
#   gross: 2299000,
#   commissionPercent: 20,
#   net: 1839200,
#   status: 'draft'
# }]

# Finalize
curl -X POST /v1/admin/payouts/<id>/finalize -H "Authorization: Bearer $ADMIN"

# Mark paid (after bank transfer)
curl -X POST /v1/admin/payouts/<id>/mark-paid \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"bankRef":"VCB-TX-12345"}'

# Tutor xem
curl /v1/me/payouts -H "Authorization: Bearer $TUTOR"
# [{ status: 'paid', net: 1839200, bankRef: 'VCB-TX-12345' }]
```

---

## Slide 15 — iCal subscription bonus

```bash
# Tutor generate calendar token
TOK=$(curl -X POST /v1/me/calendar-token -H "Authorization: Bearer $TUTOR")
ICS=$(echo $TOK | jq -r .icsUrl)

# Subscribe trong Apple Calendar / Google Calendar
echo $ICS
# Paste URL vào calendar app → tự sync buổi học

# Verify ICS content
curl "$ICS"
# BEGIN:VCALENDAR
# ...
# BEGIN:VEVENT
# SUMMARY:Toán học - Lớp 10
# DTSTART:20260601T120000Z
# LOCATION:https://meet.jit.si/tutor365-...
# END:VEVENT
```

---

## Slide 16 — Verify everything

```bash
# Test coverage
pnpm test --coverage
# >= 70%

# Full verify
pnpm verify
# exit 0

# Git tag
git tag course-2-3-complete
git push origin course-2-3-complete

# Stats final
psql tutor365 -c "
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM courses) AS courses,
  (SELECT COUNT(*) FROM course_enrollments) AS enrollments,
  (SELECT COUNT(*) FROM session_bookings) AS bookings,
  (SELECT COUNT(*) FROM orders WHERE status='paid') AS paid_orders,
  (SELECT COUNT(*) FROM tutor_payouts) AS payouts
;
"
```

---

## Slide 17 — Tutor365 Roadmap forward

```
Khóa 4 — Frontend Student Dashboard (Next.js + TanStack Query + FullCalendar)
  → Render data từ backend C2-3 đã build
  
Khóa 5 — AI Learning Features (Claude API)
  → AI summary lesson, AI quiz gen, AI tutor 24/7
  
Khóa 6 — Scaling (Redis + BullMQ + WebSocket chat)
  → Cache hot queries, background jobs, real-time
  
Khóa 7 — Testing & Quality (Vitest deep + Playwright E2E)
  → Full coverage + UI tests
  
Khóa 8 — Deployment (Docker + GitHub Actions + monitoring)
  → Production ready, Sentry, Prometheus, AWS/Vercel
```

---

## Slide 18 — Skills bạn đã có

### Sau 65 video Tutor365

🎓 **Backend Engineering**

- NestJS 10 production-ready
- 14 module domain design
- RBAC + JWT auth refresh rotation
- File upload S3 multipart
- 3rd-party integration: Jitsi + VNPay

🗃️ **Database Engineering**

- PostgreSQL 16 features mạnh
- Prisma 5 ORM
- EXPLAIN ANALYZE + index tuning
- EXCLUDE constraint, tsrange, JSONB
- ACID + isolation levels

💼 **Production Skills**

- Idempotency patterns
- State machine
- Cron reconciliation
- Audit logging
- Test coverage 70%+

---

## Slide 19 — Lời cảm ơn

> Bạn đã đi qua 65 video, 22 section, ~1600 slides.
>
> Tutor365 backend giờ sẵn sàng production.
>
> Hành trình từ "newbie NestJS" đến "mid-level backend engineer".
>
> Skills mạnh — đủ cho startup VN cần.
>
> Hãy build cái gì đó mạnh hơn nữa.

🎉🎉🎉

---

## Slide 20 — Tổng kết Khoá 2-3

### Bạn vừa hoàn thành

- ✅ 22 section × 65 video
- ✅ 14 module domain
- ✅ 20+ DB tables
- ✅ 55+ REST endpoints
- ✅ 3 3rd-party: VNPay, Jitsi, MailPit
- ✅ Auth + RBAC + payment + live tutoring + payout
- ✅ Production patterns: idempotency, state machine, cron, audit
- ✅ Database mastery: PG features, indexing, concurrency
- ✅ Test coverage 70%+
- ✅ `pnpm verify` exit 0
- ✅ Git tag `course-2-3-complete`

> 💪💪💪 **Bạn đã trở thành mid-level backend engineer.**

---

<!-- _class: lead -->

# Tiếp theo: Khoá 4

## Frontend Student Dashboard

Next.js + TanStack Query + FullCalendar UI — consume backend C2-3.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# CẢM ƠN BẠN ĐÃ HỌC! 🎓

### Hành trình của bạn mới chỉ bắt đầu 🚀

> *"The expert in anything was once a beginner."*
> *— Helen Hayes*

**Tutor365 Backend — Course 2-3 Complete**
**🎉 65/65 videos done 🎉**
