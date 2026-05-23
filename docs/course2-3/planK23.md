# PLAN K2-3 — Technical Spec Skeleton

## Course 2 & 3 (Gộp): NestJS Backend + PostgreSQL Database cho **Tutor365**

> Tài liệu này là **skeleton Phase 1** — chỉ chốt **scope, stack, ERD, state machine, glossary**.
> Spec chi tiết từng endpoint/function sẽ được bổ sung ở **Phase 2-5** sau khi user duyệt.
>
> **Lưu ý lịch sử:** Khoá 2 cũ (in-memory NestJS) đã bị thay thế. Khoá 3 cũ (PostgreSQL độc lập)
> được gộp vào đây. Hai khoá hợp nhất vì in-memory phase ở C2 cũ gây lặp khi sang C3.

---

## 1. VỊ TRÍ KHOÁ TRONG ROADMAP

| Khoá | Tên | Output | Status |
|------|-----|--------|--------|
| C1 | Bootstrapping AI LMS | Monorepo + NestJS skeleton + Claude Code workflow | Done |
| **C2-3** | **Building Tutor365 Backend + Database** | **NestJS API + PostgreSQL prod-grade** | **THIS** |
| C4 | Student Dashboard | React + TanStack Query + Calendar UI (FullCalendar) | Next |
| C5 | AI Learning Features | Claude API: AI summary, quiz gen | Sau |
| C6 | Scaling | Redis + BullMQ + real-time chat | Sau |
| C7 | Testing & Quality | Vitest + Playwright + E2E | Sau |
| C8 | Deployment | Docker + GitHub Actions + monitoring | Sau |

---

## 2. PRODUCT SCOPE — TUTOR365

**Tutor365** là nền tảng học trực tuyến **2 sản phẩm trên 1 platform**:

### 2.1 Marketplace khoá học (self-paced)
- **Tutor** upload khoá học: video, pptx, pdf, text → đặt giá VND → submit duyệt
- **Hanah (Admin)** approve/reject → published ra storefront
- **Student** mua khoá → enroll → học theo tốc độ riêng → review

### 2.2 Live tutoring 1:1 (Jitsi Meet)
- **Tutor** khai báo lịch rảnh (`tutor_availability`)
- **Student** đăng ký slot — chọn subject + level + thời gian:
  - **Single session**: 200.000 VND/giờ, 1.5-2h/buổi
  - **Combo**: 150.000 VND/giờ, 3 buổi/tuần, 1-2 tháng do Student chọn `numMonths ∈ {1,2}`
- **Hanah** filter Tutor đủ điều kiện (rảnh + đúng chuyên môn) → assign 1 Tutor cho session/combo
- **Tutor** accept → server sinh `meetingRoomName` deterministic → URL `https://meet.jit.si/tutor365-<bookingId>` → hiển thị trên calendar 2 phía
- Đúng giờ Student click "Join" → nhúng Jitsi iframe; iframe External API event `videoConferenceJoined` → POST attendance
- **Không record** — course đã có video bán riêng, live chỉ Q&A. Status `completed` do cron reconciliation đặt sau khi hết duration + có attendance

### 2.3 Payment (VNPay)
- VNPay Sandbox/Production qua ký SHA-512 `vnp_HashSecret`
- IPN webhook (`vnp_IpnUrl`) là **source of truth**, return URL chỉ UI
- **Không refund** (Q6 chốt) — cancel = mất tiền
- Tax + Fee + Commission% configurable trong `pricing_rules`
- Tutor payout hàng tháng = revenue × (1 - commission%)

---

## 3. STACK & CONVENTIONS

| Layer | Tech | Note |
|-------|------|------|
| Runtime | Node.js 20 LTS | C1 kế thừa |
| Language | TypeScript 5.4+ (strict) | C1 |
| Package manager | pnpm 9 workspaces | C1 |
| Backend framework | **NestJS 10** (Express adapter) | C1 + C2-3 |
| Validation | Zod 3 + `ZodValidationPipe` | C1 |
| ORM | **Prisma 5** | **C2-3** |
| Database | **PostgreSQL 16** | **C2-3** |
| Auth | JWT access + refresh, bcrypt, role guard | **C2-3** |
| Logger | `nestjs-pino` + `nestjs-cls` | C2-3 |
| Rate limit | `@nestjs/throttler` in-memory (Redis ở C6) | C2-3 |
| Security | `helmet` + CORS env-whitelist | C2-3 |
| API docs | `@nestjs/swagger` (OpenAPI 3) | C2-3 |
| **Video conferencing** | **Jitsi Meet** (public `meet.jit.si`, không cần API/auth) | **C2-3** |
| **Payment gateway** | **VNPay** (SHA-512 ký) | **C2-3** |
| Calendar feed | `ical-generator` (RFC 5545) | C2-3 |
| File upload | `@nestjs/platform-express` + Multer + S3-compat (MinIO ở dev) | C2-3 |
| Email | Nodemailer + SMTP env (mailpit ở dev) | C2-3 |
| Testing | Vitest + Supertest + `Test.createTestingModule` | C1 + C2-3 |

**Naming**: kebab-case file, PascalCase class, camelCase func, SCREAMING const, `*.test.ts` cạnh source.

**Aliases**: `@api/*` (apps/api/src), `@tutor365/types`, `@tutor365/config`.

---

## 4. GLOSSARY (CỰC QUAN TRỌNG — TRÁNH NHẦM 6 KHÁI NIỆM)

| Term | Định nghĩa | Bảng DB |
|------|-----------|---------|
| **Course** | Khoá học self-paced của Tutor (video/pptx/pdf) — bán 1 lần học mãi | `courses` |
| **Lesson** | 1 bài giảng bên trong Course (1 video / 1 pptx / 1 pdf) | `lessons` |
| **Enrollment** | 1 record Student đã mua + đang học 1 Course | `course_enrollments` |
| **Booking** | 1 yêu cầu live tutoring của Student (single hoặc parent của combo) | `session_bookings` |
| **Session** | 1 instance buổi học cụ thể (1 row cho single, N row con cho combo) | `session_bookings` (parentBookingId) |
| **Meeting** | Jitsi room URL — chỉ tồn tại sau khi Tutor accept (server sinh deterministic từ `bookingId`) | field `meetingRoomName` trong `session_bookings` |
| **Order** | 1 giao dịch thanh toán VNPay (mua course / book single / book combo) | `orders` |
| **Payment** | 1 attempt thanh toán cụ thể (1 order có thể N payment fail trước khi paid) | `payments` |
| **Payout** | Tiền Hanah trả Tutor hàng tháng (revenue − commission) | `tutor_payouts` |

> Người mới đọc dễ confuse **Booking ≠ Session ≠ Meeting**. Quy ước:
> - **Booking** = ý định (Student trả tiền, đăng ký lịch, có thể chưa có Tutor)
> - **Session** = buổi học cụ thể có ngày giờ (có thể nhiều Session thuộc 1 Booking nếu combo)
> - **Meeting** = Jitsi room URL (`https://meet.jit.si/tutor365-<bookingId>`) — chỉ generate khi Tutor accept

---

## 5. ERD (19 bảng domain chính — bỏ recording vì không có yêu cầu lưu)

```mermaid
erDiagram
  users ||--o| tutor_profiles : "1:1 nếu role=tutor"
  users ||--o| student_profiles : "1:1 nếu role=student"

  tutor_profiles ||--o{ tutor_subjects : has
  tutor_profiles ||--o{ tutor_levels : has
  tutor_profiles ||--o{ tutor_qualifications : has
  tutor_profiles ||--o{ tutor_availability : declares
  subjects ||--o{ tutor_subjects : ""
  levels ||--o{ tutor_levels : ""
  qualifications ||--o{ tutor_qualifications : ""

  tutor_profiles ||--o{ courses : authors
  subjects ||--o{ courses : ""
  levels ||--o{ courses : ""
  courses ||--o{ course_chapters : has
  course_chapters ||--o{ lessons : has

  students_view_ref : "students = users WHERE role='student'"
  users ||--o{ course_enrollments : enrolls
  courses ||--o{ course_enrollments : ""
  course_enrollments ||--o{ lesson_progress : tracks
  lessons ||--o{ lesson_progress : ""
  courses ||--o{ course_reviews : ""
  users ||--o{ course_reviews : writes

  users ||--o{ session_bookings : "books as student"
  tutor_profiles ||--o{ session_bookings : "assigned tutor"
  subjects ||--o{ session_bookings : ""
  levels ||--o{ session_bookings : ""
  session_packages ||--o{ session_bookings : "package def"
  session_bookings ||--o{ session_bookings : "combo parent → child"
  session_bookings ||--o{ session_attendances : ""
  session_bookings ||--o{ session_reviews : ""

  users ||--o{ orders : pays
  orders ||--o{ payments : "1..N attempts"

  tutor_profiles ||--o{ tutor_payouts : "monthly"
```

### Bảng phụ trợ (NGOÀI ERD chính)
- `pricing_rules` — config key-value (commission%, hourly rates, refund cutoff = 0)
- `notifications` — email/in-app log
- `audit_logs` — actor + action + entity (compliance)
- `refresh_tokens` — JWT refresh whitelist

### Danh sách 20 bảng + cột chính

| # | Table | Cột chính (preview, đầy đủ ở Phase 4) |
|---|-------|----------------------------------------|
| 1 | `users` | id, email UQ, passwordHash, role, status, fullName, phone, country, createdAt |
| 2 | `tutor_profiles` | userId PK, bio, approveStatus, hourlyRateOverride |
| 3 | `student_profiles` | userId PK, grade, guardianEmail, timezone |
| 4 | `subjects` | id, name, slug UQ |
| 5 | `levels` | id, name, slug UQ |
| 6 | `qualifications` | id, name |
| 7 | `tutor_subjects` | tutorId, subjectId — PK composite |
| 8 | `tutor_levels` | tutorId, levelId — PK composite |
| 9 | `tutor_qualifications` | tutorId, qualificationId — PK composite |
| 10 | `tutor_availability` | id, tutorId, dayOfWeek, startTime, endTime, timezone, validFrom, validTo |
| 11 | `courses` | id, tutorId, subjectId, levelId, title, slug UQ, price, status, version |
| 12 | `course_chapters` | id, courseId, title, position UQ(courseId, position) |
| 13 | `lessons` | id, chapterId, title, type, contentUrl, durationSec, position, isFreePreview |
| 14 | `course_enrollments` | id, courseId, studentId, orderId, enrolledAt, progressPercent, completedAt, UQ(courseId, studentId) |
| 15 | `lesson_progress` | enrollmentId, lessonId — PK composite, watchedSec, completedAt |
| 16 | `course_reviews` | id, courseId, studentId, rating 1-5, comment, UQ(courseId, studentId) |
| 17 | `session_packages` | id, type single\|combo, hourlyRate, sessionDurationHr, weeklyFrequency, numWeeks |
| 18 | `session_bookings` | id, studentId, tutorId nullable, packageId, subjectId, levelId, startAt, durationHr, recurrenceRule, status, meetingRoomName UQ, createdByAdminId, parentBookingId nullable |
| 19 | `session_attendances` | bookingId, userId — PK composite, joinedAt, leftAt (set bởi client iframe External API event) |
| 20 | `session_reviews` | bookingId, studentId — PK composite, rating, comment |
| 21 | `orders` | id, studentId, type, refId, subtotal, taxAmount, feeAmount, total, status, vnpTxnRef UQ, createdAt, paidAt, expiresAt |
| 22 | `payments` | id, orderId, vnpTransactionNo UQ, vnpResponseCode, amount, bankCode, payDate, rawIpnPayload, ipnReceivedAt |
| 23 | `tutor_payouts` | id, tutorId, periodMonth, courseRevenue, sessionRevenue, grossAmount, commissionPercent, commissionAmount, netPayout, status, paidAt |

---

## 6. STATE MACHINES

### 6.1 Course publish

```
draft
  → pending_approval        (Tutor submit)
  → published               (Hanah approve)
  → rejected                (Hanah reject — Tutor sửa lại → pending_approval)
  → archived                (Tutor archive, không bán nữa)
```
**Rule:** `archived` không quay về `published`. `published` chỉ về `archived`.

### 6.2 Session booking

```
created                      (Student tạo booking, ĐÃ trả tiền order)
  → pending_assign           (chờ Hanah)
  → assigned                 (Hanah pick Tutor, Tutor chưa accept)
  → confirmed                (Tutor accept → server sinh meetingRoomName + URL Jitsi)
  → in_progress              (client iframe event `videoConferenceJoined` đầu tiên)
  → completed                (cron reconciliation: now > startAt + durationHr VÀ có attendance)
  → cancelled                (Student/Tutor/Hanah cancel — KHÔNG hoàn tiền)
  → no_show                  (cron: sau startAt + 15 phút không ai join)
```

**Lưu ý không có webhook:** Jitsi public không bắn webhook lifecycle. Status transition dựa vào:

1. **Client-side**: iframe Jitsi External API events `videoConferenceJoined` / `videoConferenceLeft` → frontend POST `/sessions/:id/attendances` → BE update `joinedAt`/`leftAt`
2. **Cron reconciliation** (5 phút/lần): so sánh `startAt`, `durationHr`, và `session_attendances` để chuyển `assigned → in_progress → completed | no_show`

**Combo:** parent booking ở status `assigned` (lock Tutor), N child bookings (1 row/buổi) độc lập state.

### 6.3 Order (VNPay)

```
pending                      (Student tạo order, redirect đến VNPay)
  → paid                     (IPN code=00 — irrevocable, idempotent)
  → failed                   (IPN code≠00)
  → expired                  (>30 phút chưa thanh toán)
```
**Idempotency:** IPN có thể bắn lặp — `payments.vnpTransactionNo UQ` chống insert trùng.

### 6.4 Tutor profile approval

```
pending_admin_approve        (signup xong)
  → approved                 (Hanah duyệt — bắt đầu dạy được)
  → rejected                 (Hanah reject — Tutor cập nhật → pending)
  → suspended                (Hanah ban tạm thời)
```

---

## 7. ELIGIBLE-TUTOR FILTER (Q7 lock)

Khi **Hanah xem booking pending_assign**, system suggest danh sách Tutor đủ điều kiện:

```sql
SELECT DISTINCT t.user_id, u.full_name, t.bio
FROM tutor_profiles t
JOIN users u ON u.id = t.user_id
WHERE t.approve_status = 'approved'
  AND u.status = 'active'
  -- 1) Rảnh khung giờ của booking
  AND EXISTS (
    SELECT 1 FROM tutor_availability a
    WHERE a.tutor_id = t.user_id
      AND a.day_of_week = EXTRACT(DOW FROM :booking_start_at)
      AND a.start_time <= (:booking_start_at)::time
      AND a.end_time   >= ((:booking_start_at) + (:duration_hr) * INTERVAL '1 hour')::time
      AND a.valid_from <= :booking_start_at
      AND (a.valid_to IS NULL OR a.valid_to >= :booking_start_at)
  )
  -- 2) Không bị double-book
  AND NOT EXISTS (
    SELECT 1 FROM session_bookings b
    WHERE b.tutor_id = t.user_id
      AND b.status IN ('assigned', 'confirmed', 'in_progress')
      AND tsrange(b.start_at, b.start_at + b.duration_hr * INTERVAL '1 hour')
          && tsrange(:booking_start_at, :booking_start_at + :duration_hr * INTERVAL '1 hour')
  )
  -- 3) Có chuyên môn: HOẶC dạy course môn này, HOẶC declared subject lúc onboarding
  AND (
    EXISTS (SELECT 1 FROM courses c
            WHERE c.tutor_id = t.user_id
              AND c.subject_id = :subject_id
              AND c.status = 'published')
    OR
    EXISTS (SELECT 1 FROM tutor_subjects ts
            WHERE ts.tutor_id = t.user_id
              AND ts.subject_id = :subject_id)
  )
  -- 4) Đúng level
  AND EXISTS (
    SELECT 1 FROM tutor_levels tl
    WHERE tl.tutor_id = t.user_id
      AND tl.level_id = :level_id
  );
```

Index hỗ trợ (sẽ thiết kế ở Section 21):
- `tutor_availability(tutor_id, day_of_week, start_time)`
- `session_bookings(tutor_id, start_at)` + `tsrange` GiST nếu cần
- `tutor_subjects(subject_id, tutor_id)`
- `tutor_levels(level_id, tutor_id)`
- `courses(subject_id, status, tutor_id) WHERE status='published'` partial

---

## 8. PRICING RULES (config table `pricing_rules`)

| Key | Default | Mô tả |
|-----|---------|-------|
| `SINGLE_SESSION_HOURLY_VND` | 200000 | Giá single session/giờ |
| `COMBO_SESSION_HOURLY_VND` | 150000 | Giá combo/giờ |
| `COMBO_MIN_WEEKLY_FREQUENCY` | 3 | Combo phải tối thiểu 3 buổi/tuần |
| `COMBO_MIN_DURATION_HR` | 1.5 | Buổi tối thiểu 1.5h |
| `COMBO_MAX_DURATION_HR` | 2.0 | Buổi tối đa 2h |
| `COMBO_ALLOWED_MONTHS` | `[1,2]` | Combo dài 1 hoặc 2 tháng |
| `PLATFORM_COMMISSION_PERCENT` | 20 | % commission Tutor365 trừ Tutor payout |
| `TAX_PERCENT` | 10 | VAT |
| `FEE_FIXED_VND` | 0 | Phí xử lý cố định (mở rộng tương lai) |
| `REFUND_ALLOWED` | `false` | **Q6 chốt: không refund** |
| `ORDER_EXPIRY_MINUTES` | 30 | Order chưa pay sau 30' → expired |
| `NO_SHOW_THRESHOLD_MINUTES` | 15 | Sau 15' không ai vào meeting → no_show |

---

## 9. OUTLINE 22 SECTION × 65 VIDEO (chi tiết tiêu đề ở `khoa-hoc-2-3-vi.md`)

| # | Section | Videos |
|---|---------|--------|
| 1 | NestJS Foundations (bootstrap, lifecycle, validation, modular) | 5 |
| 2 | Auth + Roles (signup, login, JWT, refresh, role guard) | 4 |
| 3 | Users & Profiles (Admin/Tutor/Student CRUD) | 3 |
| 4 | Taxonomy (Subjects + Levels + Qualifications) | 3 |
| 5 | Course Marketplace (CRUD, chapters, lessons, upload pptx/video) | 4 |
| 6 | Course Approval Workflow | 1 |
| 7 | Enrollment & Lesson Progress | 3 |
| 8 | Tutor Availability | 2 |
| 9 | Session Booking (single + combo + RRULE) | 4 |
| 10 | Hanah Assign Flow (eligible-tutor filter + assign + reassign) | 3 |
| 11 | **Live Meeting Integration (Jitsi) + Attendance Tracking** | **2** |
| 12 | Calendar API + iCal Feed | 3 |
| 13 | VNPay Integration (sign, redirect, return URL, IPN webhook) | 4 |
| 14 | Order State Machine + Idempotency | 2 |
| 15 | Tutor Payouts + Commission | 3 |
| 16 | Notifications | 1 |
| 17 | PostgreSQL Foundations (tables, FK, constraints, indexes) | 4 |
| 18 | SQL Mastery (SELECT, JOIN, GROUP BY, CTE, Window) | 4 |
| 19 | Prisma Setup + Migrations + Seeders | 3 |
| 20 | Indexing + Query Optimization (EXPLAIN ANALYZE) | 3 |
| 21 | Transactions + Concurrency (prevent double-booking) | 2 |
| 22 | Final Review + API.md + ERD recap | 2 |
| **TOTAL** | | **65** |

---

## 10. DELIVERABLES CHECKLIST (cuối khoá)

| # | Item | AC |
|---|------|----|
| 1 | Auth thật (signup + email verify + JWT + refresh + role guard) | 3 role login passable |
| 2 | Course marketplace (4 endpoint nhóm) | Approval workflow chạy đúng state machine |
| 3 | Live session booking (single + combo) | Combo tạo N child bookings đúng RRULE |
| 4 | Hanah assign flow | Eligible filter SQL chạy đúng + idempotent assign |
| 5 | Jitsi meeting integration | Server sinh `meetingRoomName` deterministic + iframe External API track attendance + cron reconciliation `in_progress/completed/no_show` |
| 6 | Calendar feed | `.ics` subscribable bằng Google Calendar/Apple Calendar |
| 7 | VNPay integration | Sandbox: order pending → paid via IPN, idempotent |
| 8 | Tutor payouts | Monthly aggregate đúng formula (revenue − commission) |
| 9 | PostgreSQL prod-grade schema | ≥20 bảng, FK valid, index có lý do |
| 10 | Prisma migrations | `prisma migrate dev` + `seed` chạy clean |
| 11 | SQL mastery exercises | 5 truy vấn analytics đúng kết quả |
| 12 | Transaction tests | Race condition double-book bị từ chối |
| 13 | OpenAPI/Swagger | `/api/docs` render ~60 endpoint |
| 14 | Test coverage ≥ 70% service | Vitest report |
| 15 | `pnpm verify` exit 0 | lint + typecheck + test + build |
| 16 | Git tag `course-2-3-complete` | Pushed |

---

## 11. RA KHỎI SCOPE (không làm ở C2-3)

| Tính năng | Khoá tiếp |
|-----------|-----------|
| Frontend React + Calendar UI | C4 |
| AI summary, AI quiz gen | C5 |
| Redis cache, BullMQ queue, real-time chat | C6 |
| E2E test Playwright | C7 |
| Docker + CI/CD + deploy | C8 |
| Parent role + Cart/Checkout marketplace iTutor365-style | Out of roadmap |
| Refund flow | Out of roadmap (Q6 chốt) |
| OAuth Google/Facebook login | C5 (auth khoá riêng) |
| Recording buổi live | Không cần — course đã có video bán riêng, live tutoring chỉ là Q&A cầm tay |
| Zoom / BigBlueButton | Thay bằng Jitsi public (`meet.jit.si`) — free, không API/auth |
| Jitsi self-host / JaaS (branded domain + JWT) | C8 (deployment khoá riêng) |

---

## 12. MÔI TRƯỜNG

| OS | Node | Package manager | IDE |
|----|------|----------------|-----|
| macOS | Node 20 LTS qua `nvm` | pnpm 9 | VSCode |
| Windows | Node 20 LTS qua `nvm-windows` | pnpm 9 (PowerShell) | VSCode |

**Không dùng WSL/Linux** — Windows học viên dùng PowerShell trực tiếp.

**Required services (dev):**
- PostgreSQL 16 — local hoặc Docker (sẽ dạy ở Section 17)
- MailPit (SMTP dev) — Docker
- MinIO (S3-compat) — Docker, cho file upload
- VNPay Sandbox account

**Không cần account ngoài** cho Jitsi — dùng public `meet.jit.si` qua URL.

---

## 13. REFERENCES

- `khoa-hoc-2-3-vi.md` — overview tiếng Việt + bảng 68 video
- `task.md` — checklist từng phase
- `../course1/planK1.md` — backend skeleton kế thừa
- `../(tuu)Tutor365-QC Test Case.xlsx` — spec QC gốc iTutor365 (336 TC tham khảo)
- `../Remote - Fullstack Engineer (Claude, NodeJS, React).pdf` — syllabus roadmap 8 khoá
- VNPay docs: <https://sandbox.vnpayment.vn/apis/docs/> (dùng link bạn cung cấp, KHÔNG tự đoán)
- Jitsi IFrame API: <https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe>
- Jitsi External API events: <https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-events>
- JaaS (Jitsi as a Service, optional free tier): <https://jaas.8x8.vc>
- iCal RFC 5545: <https://datatracker.ietf.org/doc/html/rfc5545>

---

**Status:** Phase 1 skeleton complete. Chờ user duyệt để vào Phase 2 (viết chi tiết Section 1-2).
