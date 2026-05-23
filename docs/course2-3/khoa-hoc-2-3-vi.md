# KHÓA HỌC 2-3 — Xây Dựng Backend + Database cho Tutor365

## NestJS API + PostgreSQL Production-Grade (Jitsi cho live meeting)

---

## TỔNG QUAN KHÓA HỌC

### Vị trí trong lộ trình 8 khoá

Khóa **2-3** là kết quả **gộp** Course 2 (Backend NestJS) và Course 3 (PostgreSQL) trong syllabus gốc — vì in-memory phase ở C2 cũ tạo công sức lặp khi sang C3. Hợp nhất → dạy thẳng Prisma + PostgreSQL từ đầu Section 5 trở đi.

| Khoá | Tên | Status |
|------|-----|--------|
| C1 | Bootstrapping AI LMS | Done |
| **C2-3** | **Building Tutor365 Backend + Database** | **THIS** |
| C4 | Student Dashboard (React + FullCalendar UI) | Next |
| C5 | AI Learning Features | Sau |
| C6 | Scaling (Redis + BullMQ + Chat real-time) | Sau |
| C7 | Testing & Engineering Quality | Sau |
| C8 | Deploying | Sau |

### Product được build: **Tutor365**

Tutor365 là nền tảng **2-trong-1**:

1. **Marketplace khoá học** — Tutor đăng course (video/pptx/pdf), Hanah duyệt, Student mua giá VND, học self-paced
2. **Live tutoring 1:1 qua Jitsi Meet** — Student đăng ký slot, Hanah filter Tutor đủ chuyên môn + rảnh, assign Tutor; Tutor accept → server sinh Jitsi room URL deterministic, hiển thị trên calendar 2 phía; đúng giờ click join. **Không record buổi live** — course đã có video bán riêng, live chỉ là Q&A cầm tay chỉ việc.

**Giá live tutoring:**
- Single: **200.000 VND/giờ** (buổi 1.5-2h)
- Combo: **150.000 VND/giờ**, 3 buổi/tuần, kéo dài 1 hoặc 2 tháng do Student chọn

**Payment:** VNPay (sandbox + production), không refund.

---

### Mục tiêu Khoá 2-3

Build **toàn bộ backend + database production-grade** cho Tutor365, gồm:

- **Auth thật:** signup + email verify + login + JWT + refresh token + role guard (Admin/Tutor/Student)
- **Course marketplace:** Tutor upload course, chapter + lesson, approval workflow Hanah, Student enrollment + lesson progress
- **Live tutoring:** Tutor availability, Student booking single/combo, Hanah assign Tutor với eligible-filter, Jitsi Meet integration (iframe External API + attendance tracking + cron reconciliation), calendar feed iCal
- **Payment VNPay:** ký SHA-512, redirect, return URL, **IPN webhook idempotent**, order state machine
- **Tutor payouts:** monthly aggregate, commission 20% configurable
- **PostgreSQL production-grade:** ~20 bảng, FK + index + constraint, Prisma migrations, transactions, EXPLAIN ANALYZE
- **API documentation:** Swagger UI tại `/api/docs`, OpenAPI 3 auto-gen

### Kết quả cuối khoá (Final Output)

- ✅ NestJS API service với ~55 endpoint REST
- ✅ PostgreSQL 16 schema 19 bảng domain, FK valid, có lý do cho mọi index
- ✅ Prisma migrations chạy clean + seeders (Hanah admin + 5 Tutor demo + 10 course mẫu)
- ✅ Jitsi Meet integration: server sinh room URL deterministic khi Tutor accept, frontend nhúng iframe + External API track attendance
- ✅ Cron reconciliation chuyển booking status (`in_progress / completed / no_show`) không cần webhook
- ✅ Calendar iCal feed (`/sessions.ics`) — học viên subscribe Google/Apple Calendar
- ✅ VNPay sandbox flow end-to-end: order → pay → IPN → paid
- ✅ Hanah dashboard endpoint: list booking pending + suggest Tutor đủ điều kiện
- ✅ Combo booking đúng RRULE — N child sessions auto-create
- ✅ Tutor payout monthly aggregate đúng formula
- ✅ Test coverage ≥ 70% service
- ✅ `pnpm verify` exit 0 — lint + typecheck + test + build
- ✅ Git tag `course-2-3-complete`

### Thông tin Khoá

- **Tổng số video:** **65 video** (22 section)
- **Stack:** TypeScript, NestJS 10, Prisma 5, PostgreSQL 16, Zod, JWT, **Jitsi Meet** (iframe External API), VNPay
- **Repo:** nối tiếp C1 — mở rộng `apps/api`, không tạo repo mới
- **Trạng thái cuối:** Backend + DB full feature — chưa có Frontend (C4), AI (C5), Redis/Queue (C6)

---

## CẤU TRÚC KHOÁ HỌC

| Section | Tên | Số video |
|---------|-----|----------|
| 1 | NestJS Foundations | 5 |
| 2 | Auth + Roles | 4 |
| 3 | Users & Profiles | 3 |
| 4 | Taxonomy (Subjects/Levels/Qualifications) | 3 |
| 5 | Course Marketplace | 4 |
| 6 | Course Approval Workflow | 1 |
| 7 | Enrollment & Lesson Progress | 3 |
| 8 | Tutor Availability | 2 |
| 9 | Session Booking (single + combo) | 4 |
| 10 | Hanah Assign Flow | 3 |
| 11 | **Live Meeting Integration (Jitsi) + Attendance** | **2** |
| 12 | Calendar API + iCal Feed | 3 |
| 13 | VNPay Integration | 4 |
| 14 | Order State Machine + Idempotency | 2 |
| 15 | Tutor Payouts + Commission | 3 |
| 16 | Notifications | 1 |
| 17 | PostgreSQL Foundations | 4 |
| 18 | SQL Mastery | 4 |
| 19 | Prisma + Migrations + Seeders | 3 |
| 20 | Indexing + Query Optimization | 3 |
| 21 | Transactions + Concurrency | 2 |
| 22 | Final Review | 2 |
| **TOTAL** | | **65** |

---

## DANH SÁCH 65 VIDEO (chỉ tiêu đề — chi tiết viết ở Phase 2-5)

### SECTION 1 — NestJS Foundations (5 video)
- **V01** Kiến trúc Backend Tutor365 — Module map tổng quan
- **V02** Bootstrap NestJS application (CORS, helmet, versioning, graceful shutdown)
- **V03** Request lifecycle (middleware → guard → interceptor → pipe → controller → filter)
- **V04** Zod validation pipeline + Pipe decorators
- **V05** Modular backend design + folder convention

### SECTION 2 — Auth + Roles (4 video)
- **V06** Signup + email verification (mailpit + token TTL)
- **V07** Login + bcrypt + JWT access token
- **V08** Refresh token rotation + revoke
- **V09** Role guard (Admin/Tutor/Student) + decorator `@Roles`

### SECTION 3 — Users & Profiles (3 video)
- **V10** Admin CRUD user (3 role) + status block/unblock
- **V11** Tutor profile (bio, approveStatus, declared subjects/levels) + Tutor approval workflow
- **V12** Student profile (grade, guardian, timezone) + avatar upload

### SECTION 4 — Taxonomy (3 video)
- **V13** Subjects CRUD + slug + assign cho Tutor
- **V14** Levels CRUD + assign cho Tutor
- **V15** Qualifications CRUD + Tutor declare lúc onboarding

### SECTION 5 — Course Marketplace (4 video)
- **V16** Courses CRUD (Tutor) + Course detail public
- **V17** Course chapters + Lessons CRUD + lesson types (video/pptx/pdf/text)
- **V18** File upload lesson content (Multer + MinIO S3-compat)
- **V19** Free preview lesson + course listing public với filter

### SECTION 6 — Course Approval (1 video)
- **V20** Approval workflow: Tutor submit → pending_approval → Hanah approve/reject → published, state machine + audit log

### SECTION 7 — Enrollment & Progress (3 video)
- **V21** Enrollment khi VNPay paid (tạm stub, full ở Section 14)
- **V22** Lesson progress tracking (watchedSec, completedAt, composite PK)
- **V23** Course review (rating 1-5 + comment, unique student × course)

### SECTION 8 — Tutor Availability (2 video)
- **V24** Tutor declare availability slot (dayOfWeek, startTime, endTime, validFrom/To)
- **V25** Public endpoint Student xem availability của Tutor

### SECTION 9 — Session Booking (4 video)
- **V26** Single session booking — Student tạo (subject, level, startAt, durationHr)
- **V27** Combo booking — RRULE generate N child bookings (3 buổi/tuần × 1-2 tháng)
- **V28** Booking state machine — created → pending_assign → ... → completed
- **V29** Student cancel + no_show detection (cron-stub, full cron ở C6)

### SECTION 10 — Hanah Assign Flow (3 video)
- **V30** Eligible-tutor SQL filter (rảnh + chuyên môn + level + không double-book)
- **V31** Hanah assign endpoint — chọn 1 Tutor cho booking (idempotent)
- **V32** Tutor accept/decline + reassign nếu decline

### SECTION 11 — Live Meeting Integration (Jitsi) + Attendance (2 video)
- **V33** Sinh `meetingRoomName` deterministic (`tutor365-<bookingId>`) khi Tutor accept; URL pattern + security config (room password, prejoin off, lobby); endpoint `GET /sessions/:id/join` redirect role-aware
- **V34** Frontend nhúng Jitsi qua iframe External API → listen `videoConferenceJoined` / `videoConferenceLeft` → POST `/sessions/:id/attendances`; cron reconciliation 5 phút/lần chuyển status `assigned → in_progress → completed | no_show`

### SECTION 12 — Calendar API + iCal (3 video)
- **V35** `GET /sessions?from..to&userId` calendar feed — filter + pagination cho FE
- **V36** `GET /sessions/:id/join` redirect đến Jitsi URL + role check (chỉ student/tutor liên quan được join)
- **V37** `GET /users/:userId/sessions.ics` iCal feed (RFC 5545) subscribable Google/Apple Calendar — VEVENT với `LOCATION` = Jitsi URL

### SECTION 13 — VNPay Integration (4 video)
- **V38** VNPay sandbox — config TMN code, hash secret, return + IPN URL
- **V39** Tạo order + sign request SHA-512 + redirect user
- **V40** Return URL — verify hash, hiển thị UI status (UI ở C4, BE chỉ JSON)
- **V41** **IPN webhook** — verify hash, idempotent, update order + tạo payment + grant entitlement

### SECTION 14 — Order State Machine (2 video)
- **V42** Order state machine + expire job (30 phút)
- **V43** Idempotency keys + `vnpTransactionNo UQ` chống insert trùng

### SECTION 15 — Tutor Payouts (3 video)
- **V44** Monthly aggregate course revenue + session revenue per Tutor
- **V45** Commission formula + payout record
- **V46** Hanah dashboard payout list + mark paid (stub Banking API)

### SECTION 16 — Notifications (1 video)
- **V47** Notification table + email send qua Nodemailer (sync MVP, queue ở C6)

### SECTION 17 — PostgreSQL Foundations (4 video)
- **V48** Vì sao PostgreSQL cho Tutor365 — JSONB, tsrange, partial index, exclusion constraint
- **V49** Tables + relationships — ERD 19 bảng walkthrough
- **V50** Constraints + data integrity (NOT NULL, CHECK, UNIQUE, EXCLUDE)
- **V51** Keys + indexes basics (PK, FK, B-tree, GIN/GiST tổng quan)

### SECTION 18 — SQL Mastery (4 video)
- **V52** Professional SELECT queries (filter, sort, alias)
- **V53** JOINs (INNER/LEFT/RIGHT/FULL) — bài tập trên Tutor365 schema
- **V54** GROUP BY + aggregations + HAVING (Tutor revenue report)
- **V55** CTE + Window functions (ranking Tutor theo rating, running total revenue)

### SECTION 19 — Prisma + Migrations (3 video)
- **V56** Prisma setup + schema-from-ERD + `prisma migrate dev` workflow
- **V57** Seeders — Hanah admin + 5 Tutor demo + sample courses
- **V58** Migrate in-memory repo từ Section 1-12 sang Prisma — không sửa controller/service

### SECTION 20 — Indexing + Optimization (3 video)
- **V59** Composite indexes — `(tutor_id, start_at)` cho booking lookup
- **V60** EXPLAIN ANALYZE — đọc plan, phát hiện seq scan
- **V61** Partial index + expression index — `courses WHERE status='published'`

### SECTION 21 — Transactions + Concurrency (2 video)
- **V62** ACID + isolation levels — READ COMMITTED vs SERIALIZABLE
- **V63** Prevent double-booking — EXCLUDE constraint `tsrange` + Tutor365 booking insert flow

### SECTION 22 — Final Review (2 video)
- **V64** API.md auto-gen từ Swagger + ERD recap + `pnpm verify`
- **V65** Demo end-to-end: Student mua course + book combo + Hanah assign + Tutor dạy (Jitsi) + payout

---

## GIÁ TRỊ KHOÁ HỌC

### Sau khi học xong, học viên có gì?

**1. Backend production-grade thật** — không phải toy app
- 60+ endpoint REST đầy đủ
- Auth thật + role guard + JWT refresh
- 3rd-party integration: **Jitsi Meet** (iframe External API) + **VNPay**
- Hệ thống state machine cho 4 domain (Course, Booking, Order, Tutor profile)

**2. PostgreSQL chuyên sâu**
- ERD 20+ bảng prod-grade
- Index thiết kế có lý do, EXPLAIN ANALYZE thuần thục
- ACID + isolation level + EXCLUDE constraint chống double-booking
- Prisma migrations + seeders workflow

**3. Domain skill quý ở thị trường VN**
- Tích hợp **VNPay** (gateway VN phổ biến nhất) — IPN idempotent đúng chuẩn
- Tích hợp **Jitsi Meet** + iframe External API events — pattern client-event-driven sync (giá trị tương đương Zoom S2S nhưng không tốn phí, không lock-in vendor)
- iCal feed — học viên subscribe lịch học bằng Google/Apple Calendar

**4. Portfolio mạnh**
- Project có money flow thật (mua course, book session, payout)
- Hai sản phẩm trên cùng platform — chứng tỏ khả năng modular design
- Approval workflow + audit log — chứng tỏ hiểu hệ thống business

---

## NHỮNG GÌ KHÔNG THUỘC KHOÁ 2-3

| Tính năng | Khoá nào |
|-----------|---------|
| ❌ Frontend React + Calendar UI (FullCalendar) | C4 |
| ❌ AI summary / AI quiz generation | C5 |
| ❌ OAuth Google/Facebook login | C5 hoặc auth khoá riêng |
| ❌ Redis cache, BullMQ queue, real-time chat | C6 |
| ❌ E2E test Playwright | C7 |
| ❌ Docker + CI/CD + production deploy | C8 |
| ❌ Parent role + Cart/Checkout marketplace style | Out of roadmap (Q1=A chốt) |
| ❌ Refund flow | Out of roadmap (Q6 chốt) |
| ❌ Recording buổi live | Không cần — course đã có video bán riêng, live chỉ Q&A |
| ❌ Zoom / BigBlueButton | Thay bằng Jitsi Meet (`meet.jit.si`) — free, không API/auth |
| ❌ Jitsi self-host / JaaS branded domain | C8 (deployment) |

---

## TÀI LIỆU LIÊN QUAN

- **Spec kỹ thuật chi tiết:** `planK23.md` — ERD, state machine, eligible-filter, pricing rules
- **Task breakdown:** `task.md` — checklist từng phase
- **Slide từng video:** `slides/` (chưa tạo, ở Phase 6)
- **Reference QC:** `../(tuu)Tutor365-QC Test Case.xlsx` — 336 test case iTutor365
- **Syllabus gốc:** `../Remote - Fullstack Engineer (Claude, NodeJS, React).pdf`

---

## YÊU CẦU MÔI TRƯỜNG

Khoá này hướng dẫn cho **macOS** và **Windows native** (PowerShell + nvm-windows). **Không dùng WSL/Linux.**

| OS | Node | Package manager | IDE |
|----|------|----------------|-----|
| macOS | Node 20 LTS qua `nvm` | pnpm 9 | VSCode |
| Windows | Node 20 LTS qua `nvm-windows` | pnpm 9 (PowerShell) | VSCode |

**Required dev services (Docker):**
- PostgreSQL 16
- MailPit (SMTP dev)
- MinIO (S3-compat, cho file upload)

**Required accounts:**
- VNPay Sandbox merchant
- **Jitsi không cần account** — dùng public `meet.jit.si` qua URL

---

**Status:** Phase 1 skeleton complete. Chờ duyệt vào Phase 2.
