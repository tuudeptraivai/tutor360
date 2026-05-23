# TASK — Course 2-3 (Tutor365 Backend + Database)

> Checklist task-level đồng bộ với `planK23.md`.
> Mỗi section ở dạng nhóm task — sẽ break thành sub-task chi tiết ở **Phase 2-5**.
> **Phase đang chạy:** Phase 1 (skeleton). Các section dưới đây **chưa execute**, chỉ là roadmap.

---

## PHASE 1 — Skeleton (current)

- [x] Xoá `docs/course2/` cũ
- [x] Tạo `docs/course2-3/`
- [x] `planK23.md` — TOC, stack, ERD 20 bảng, state machine, eligible-filter, pricing rules, glossary
- [x] `khoa-hoc-2-3-vi.md` — overview, mục tiêu, bảng 68 video
- [x] `task.md` — task skeleton (file này)

---

## PHASE 2 — Spec Section 1-2 (NestJS Foundations + Auth)

### Section 1 — NestJS Foundations
- [ ] V01 Module map tổng quan — diagram, 11 module Tutor365
- [ ] V02 Bootstrap `main.ts` — CORS, helmet, versioning `/api/v1`, graceful shutdown, env validation
- [ ] V03 Request lifecycle — middleware → guard → interceptor → pipe → controller → filter; debug guide
- [ ] V04 Zod validation pipeline — `@ZodBody`, `@ZodQuery`, `@ZodParam`; error format chuẩn
- [ ] V05 Folder convention + barrel exports + alias `@api/*`, `@tutor365/types`

### Section 2 — Auth + Roles
- [ ] V06 Signup endpoint + email verify token (TTL 24h) + mailpit
- [ ] V07 Login + bcrypt rounds + JWT access (15min) + payload shape
- [ ] V08 Refresh rotation + `refresh_tokens` whitelist + revoke on logout
- [ ] V09 Role guard `@Roles('admin','tutor','student')` + decorator + test cases

**AC Phase 2:** mỗi video có spec endpoint (path/method/body/response) + AC + test list.

---

## PHASE 3 — Spec Section 3-7 (Users, Taxonomy, Courses, Approval, Progress)

### Section 3 — Users & Profiles
- [ ] V10 Admin CRUD user (3 role) — list/filter/search/export Excel (export ở section sau hoặc inline)
- [ ] V11 Tutor profile + approval workflow `pending_admin_approve → approved`
- [ ] V12 Student profile + avatar upload MinIO

### Section 4 — Taxonomy
- [ ] V13 Subjects CRUD + slug uniqueness
- [ ] V14 Levels CRUD + assign Tutor levels
- [ ] V15 Qualifications CRUD + assign Tutor qualifications

### Section 5 — Course Marketplace
- [ ] V16 Courses CRUD (Tutor) + Course detail public
- [ ] V17 Chapter + Lesson nested CRUD
- [ ] V18 File upload Multer + MinIO S3
- [ ] V19 Public course listing với filter (subject/level/price)

### Section 6 — Course Approval
- [ ] V20 State machine `draft → pending_approval → published | rejected → archived`; Hanah approve endpoint + audit log

### Section 7 — Enrollment & Progress
- [ ] V21 Enrollment khi order paid (entitlement grant)
- [ ] V22 Lesson progress watchedSec composite PK
- [ ] V23 Course review unique constraint

**AC Phase 3:** ERD prisma schema partial cho 14 bảng đầu, endpoint contract đầy đủ.

---

## PHASE 4 — Spec Section 8-12 (Availability, Booking, Hanah Assign, Jitsi, Calendar)

### Section 8 — Tutor Availability
- [ ] V24 Declare slot (dayOfWeek, startTime, endTime, validFrom/To)
- [ ] V25 Public availability lookup

### Section 9 — Session Booking
- [ ] V26 Single session — Student tạo booking sau order paid
- [ ] V27 Combo RRULE — generate N child bookings (3/tuần × 1-2 tháng)
- [ ] V28 Booking state machine
- [ ] V29 Cancel + no_show detection

### Section 10 — Hanah Assign Flow
- [ ] V30 Eligible-tutor SQL — rảnh + chuyên môn + level + không double-book
- [ ] V31 Assign endpoint idempotent (PUT semantics)
- [ ] V32 Tutor accept/decline + reassign

### Section 11 — Live Meeting Integration (Jitsi)
- [ ] V33 Sinh `meetingRoomName` deterministic + URL pattern `https://meet.jit.si/tutor365-<bookingId>` + security config (room password, prejoin off, lobby)
- [ ] V34 Frontend nhúng iframe External API; listen `videoConferenceJoined/Left` → POST attendance; cron 5'/lần reconciliation `assigned → in_progress → completed | no_show`

### Section 12 — Calendar API + iCal
- [ ] V35 `GET /sessions?from..to&userId` filter + pagination
- [ ] V36 `GET /sessions/:id/join` redirect Jitsi URL + role check (chỉ student/tutor liên quan)
- [ ] V37 `GET /users/:userId/sessions.ics` RFC 5545 — VEVENT với `LOCATION` = Jitsi URL

**AC Phase 4:** Jitsi iframe attendance bắn về BE đúng, cron reconciliation chuyển status đúng, iCal subscribe được bằng Apple Calendar.

---

## PHASE 5 — Spec Section 14-23 (VNPay, Payouts, PostgreSQL, Prisma, SQL, Final)

### Section 13 — VNPay Integration
- [ ] V38 Sandbox setup + env (TMN code, hash secret, return/IPN URL)
- [ ] V39 Sign request SHA-512 + build redirect URL
- [ ] V40 Return URL endpoint — verify hash + JSON response
- [ ] V41 **IPN webhook** — verify hash, idempotent insert payment, grant entitlement (enrollment / booking activate)

### Section 14 — Order State Machine
- [ ] V42 State machine + expire cron job stub (30 phút)
- [ ] V43 Idempotency via `vnpTransactionNo UQ`

### Section 15 — Tutor Payouts
- [ ] V44 Monthly aggregate query
- [ ] V45 Commission formula + payout record
- [ ] V46 Mark paid endpoint (bank API stub)

### Section 16 — Notifications
- [ ] V47 Notification table + email send (sync MVP)

### Section 17 — PostgreSQL Foundations
- [ ] V48 Vì sao PostgreSQL — tsrange, JSONB, EXCLUDE
- [ ] V49 ERD walkthrough 19 bảng
- [ ] V50 Constraints (NOT NULL, CHECK, UNIQUE, EXCLUDE)
- [ ] V51 Keys + indexes basics

### Section 18 — SQL Mastery
- [ ] V52 SELECT chuyên nghiệp
- [ ] V53 JOINs trên Tutor365
- [ ] V54 GROUP BY + HAVING (Tutor revenue report)
- [ ] V55 CTE + Window (ranking)

### Section 19 — Prisma + Migrations
- [ ] V56 Schema-from-ERD + `migrate dev`
- [ ] V57 Seeders (Hanah admin + 5 Tutor + courses)
- [ ] V58 Migrate in-memory repo → Prisma (Repository interface giữ nguyên)

### Section 20 — Indexing + Optimization
- [ ] V59 Composite index `(tutor_id, start_at)`
- [ ] V60 EXPLAIN ANALYZE workflow
- [ ] V61 Partial + expression index

### Section 21 — Transactions + Concurrency
- [ ] V62 Isolation levels (READ COMMITTED vs SERIALIZABLE)
- [ ] V63 EXCLUDE constraint chống double-booking

### Section 22 — Final Review
- [ ] V64 API.md auto-gen + ERD recap + `pnpm verify`
- [ ] V65 Demo end-to-end (Student mua course + book combo + Hanah assign + Tutor dạy Jitsi + payout)

**AC Phase 5:** Toàn bộ spec đủ để vào Phase 6 (slides).

---

## PHASE 6 — Slides Marp (65 video)

- [ ] Tạo `slides/theme-tutor365.css` (kế thừa `theme-lms.css` C2 cũ nếu phù hợp)
- [ ] Tạo 65 file `video-XX-tieu-de-vi.md` — mỗi file: outline + code snippet + AC
- [ ] Render PDF/HTML preview (Marp CLI) cho 2-3 video sample → user duyệt style
- [ ] Render full 65 deck

---

## PHASE 7 — Cleanup + Tag

- [ ] Audit cross-link: tất cả ref `../course2/` đã đổi sang `../course2-3/`
- [ ] Cập nhật C1 `planK1.md` nếu có ref C2 cũ
- [ ] Tag Git `course-2-3-skeleton-complete` (nếu user dùng git)

---

## DELIVERABLES CHECKLIST CUỐI KHOÁ (đồng bộ planK23 §10)

- [ ] Auth thật chạy (signup + verify + JWT + refresh + role)
- [ ] Course marketplace + approval workflow
- [ ] Live session single + combo + RRULE
- [ ] Hanah assign flow + eligible-filter
- [ ] Jitsi meeting integration: room URL deterministic + iframe External API attendance + cron reconciliation status
- [ ] iCal feed `.ics` subscribe được
- [ ] VNPay sandbox end-to-end + IPN idempotent
- [ ] Tutor monthly payouts đúng formula
- [ ] PostgreSQL schema 19 bảng + index có lý do
- [ ] Prisma migrate + seed clean
- [ ] 5 SQL mastery exercise đúng
- [ ] Transaction test double-book bị từ chối
- [ ] OpenAPI/Swagger `/api/docs` ~55 endpoint
- [ ] Test coverage service ≥70%
- [ ] `pnpm verify` exit 0
- [ ] Git tag `course-2-3-complete`

---

**Current status:** Phase 1 hoàn tất. Chờ user duyệt vào Phase 2.
