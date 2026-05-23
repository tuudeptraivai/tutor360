---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 1: Kiến Trúc Backend Tutor365 — Module Map'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Kiến Trúc Backend
# Tutor365

### Khóa 2-3 — Video 1

**NestJS API + PostgreSQL Production-Grade**

> Từ skeleton C1 đến một backend đầy đủ marketplace + live tutoring + payment

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **Tutor365 là gì** — 2 sản phẩm trên 1 platform
- ✅ Nắm **module map** backend — 14 module domain chính
- ✅ Phân biệt 6 khái niệm dễ nhầm: **Course, Lesson, Enrollment, Booking, Session, Meeting**
- ✅ Hiểu **vì sao gộp C2 + C3** thành 1 khoá học
- ✅ Biết **lộ trình 22 section / 65 video** sẽ đi qua những gì
- ✅ Định vị **stack mới** (Prisma, PostgreSQL, Jitsi, VNPay) so với C1

> 🎯 Cuối video: bạn vẽ được sơ đồ kiến trúc Tutor365 trên giấy

---

## Slide 3 — Tutor365 là gì?

### Nền tảng học trực tuyến **2-trong-1**

🛒 **Marketplace khoá học (self-paced)**

- Tutor upload video / pptx / pdf / text → đặt giá VND → submit
- Hanah (Admin) approve/reject → published
- Student mua → enroll → học theo tốc độ riêng → review

🎥 **Live tutoring 1:1 (Jitsi Meet)**

- Tutor khai báo lịch rảnh
- Student đăng ký slot (single 200k/giờ hoặc combo 150k/giờ)
- Hanah filter tutor đủ điều kiện → assign
- Đúng giờ click "Join" → mở Jitsi room → Q&A trực tiếp

---

## Slide 4 — Vì sao gộp Course 2 + Course 3?

### Lịch sử thiết kế khoá học

**C2 cũ:** "NestJS Backend với in-memory store"
**C3 cũ:** "PostgreSQL độc lập, sau đó migrate sang Prisma"

> ⚠️ Vấn đề: in-memory phase ở C2 cũ **lặp công sức** khi qua C3.
> Học viên build xong repo in-memory rồi xoá đi viết lại = wasted effort.

**Quyết định:** gộp → **C2-3 Tutor365** đi thẳng Prisma + PostgreSQL từ Section 5 trở đi.

✅ Section 1-4: NestJS foundations + Auth + Users + Taxonomy (vẫn dùng in-memory ngắn)
✅ Section 5+: Prisma + Postgres làm storage thật từ đầu
✅ Section 19: migrate code Section 1-4 sang Prisma — chỉ thay repository impl

---

## Slide 5 — Module map tổng thể (14 module domain)

```
apps/api/src/modules/
├── auth/              ← signup, login, JWT, refresh, role guard
├── users/             ← Admin CRUD user 3 role
├── tutors/            ← tutor_profile + approval workflow
├── students/          ← student_profile + avatar
├── taxonomy/          ← subjects, levels, qualifications
├── courses/           ← marketplace: course + chapter + lesson
├── enrollments/       ← Student mua course + lesson_progress
├── availabilities/    ← Tutor khai báo lịch rảnh
├── bookings/          ← Session booking (single + combo)
├── assignments/       ← Hanah pick Tutor (eligible filter)
├── meetings/          ← Jitsi room name + attendance
├── calendar/          ← iCal feed + /sessions list
├── payments/          ← VNPay sign + IPN webhook
└── payouts/           ← Tutor commission + monthly aggregate
```

Cộng thêm `common/`, `prisma/`, `config/`, `notifications/`.

---

## Slide 6 — Glossary: 6 khái niệm dễ nhầm

| Term | Định nghĩa | Bảng DB |
|------|------------|---------|
| **Course** | Khoá self-paced của Tutor (video/pptx/pdf) — mua 1 lần học mãi | `courses` |
| **Lesson** | 1 bài giảng bên trong Course | `lessons` |
| **Enrollment** | Record Student đã mua + đang học 1 Course | `course_enrollments` |
| **Booking** | Yêu cầu live tutoring (single hoặc parent của combo) | `session_bookings` |
| **Session** | 1 buổi học cụ thể (single: 1 row, combo: N row con) | `session_bookings` |
| **Meeting** | Jitsi room URL — chỉ tồn tại sau khi Tutor accept | field `meetingRoomName` |

> 💡 Quy ước: **Booking** = ý định, **Session** = buổi có giờ, **Meeting** = URL Jitsi

---

## Slide 7 — Sơ đồ luồng marketplace khoá học

```
Tutor                Hanah (Admin)        Student
  │                       │                  │
  ├─ create course ──┐    │                  │
  │  (status=draft)  │    │                  │
  ├─ add chapters    │    │                  │
  ├─ add lessons     │    │                  │
  ├─ upload video    │    │                  │
  ├─ submit ─────────┼──→ pending_approval  │
  │                  │    │                  │
  │                  │    ├─ approve ─→ published
  │                  │    │                  │
  │                  │    │       ←──── browse course
  │                  │    │       ←──── pay VNPay (order pending)
  │                  │    │       ←──── IPN paid → enrollment created
  │                  │    │       ←──── watch lessons (progress %)
  │                  │    │       ←──── leave review
```

---

## Slide 8 — Sơ đồ luồng live tutoring 1:1

```
Tutor                       Hanah                  Student
  │                           │                       │
  ├─ declare availability     │                       │
  │  (Mon 9-12, Wed 14-17)    │                       │
  │                           │     ←─── book single/combo
  │                           │          (pay VNPay)
  │                           │                       │
  │                           ├─ see pending_assign  │
  │                           ├─ filter eligible
  │                           │   (rảnh + chuyên môn)│
  │                           ├─ pick Tutor X
  │                           │                       │
  ├─ accept ←─────────────────┤                       │
  │   server sinh             │                       │
  │   tutor365-<id> Jitsi URL │                       │
  │                           │                       │
  ├─ shown on calendar both sides
  │                           │                       │
  ├─ click Join ──────────────┼───────── click Join ──┤
  │   ↓                       │           ↓           │
  │   iframe External API → POST /attendances
  │                           │                       │
  ├─ cron 5' chuyển status: assigned → in_progress → completed
```

---

## Slide 9 — Stack mới so với Khóa 1

| Layer | Khóa 1 (kế thừa) | C2-3 (thêm mới) |
|-------|------------------|------------------|
| Framework | NestJS 10 | (giữ) + Swagger module |
| Validation | Zod 3 | (giữ) — thêm Pipe nâng cao |
| Logger | `nestjs-pino` | (giữ) + `nestjs-cls` request context |
| ORM | — | **Prisma 5** |
| Database | — | **PostgreSQL 16** |
| Auth | — | **JWT access + refresh, bcrypt, RBAC** |
| Rate limit | — | `@nestjs/throttler` in-memory |
| Security | — | `helmet` + CORS env-whitelist |
| API docs | — | `@nestjs/swagger` (OpenAPI 3) |
| Video conf | — | **Jitsi Meet** (public `meet.jit.si`) |
| Payment | — | **VNPay** (SHA-512 ký) |
| Calendar | — | `ical-generator` (RFC 5545) |
| File upload | — | Multer + S3-compat (MinIO dev) |

---

## Slide 10 — Vì sao Jitsi Meet thay Zoom?

### Quyết định kiến trúc Q&A khoá

❌ **Zoom S2S:** miễn phí có giới hạn, JWT integration phức tạp, vendor lock-in
❌ **BigBlueButton:** self-host nặng, không phù hợp giai đoạn MVP
❌ **Daily.co / Whereby:** trả phí theo room

✅ **Jitsi Meet (`meet.jit.si`):**

- **Free** — không cần account, không cần API key
- **Open source** — sau này tự host được (`jitsi-meet-electron`, JaaS)
- **iframe External API** — listen event `videoConferenceJoined` từ FE
- **Deterministic URL** — `https://meet.jit.si/tutor365-<bookingId>`
- **Không record** — live chỉ là Q&A, không cần lưu video

> 💡 Trade-off: không có server-side webhook → ta dùng **client event + cron reconciliation**

---

## Slide 11 — Vì sao VNPay thay Stripe?

### Thị trường Việt Nam yêu cầu

❌ **Stripe:** không hoạt động tại VN cho merchant local
❌ **PayPal:** phí cao, UX không quen với user VN
❌ **MoMo / ZaloPay:** chỉ cover mobile, nhiều user dùng banking card

✅ **VNPay:**

- Gateway phổ biến nhất VN cho thanh toán online
- Sandbox miễn phí cho dev
- IPN webhook idempotent đúng chuẩn
- Hỗ trợ ATM nội địa + Visa/Master + QR
- Ký SHA-512 với `vnp_HashSecret` — verify được payload

⚠️ **Quan trọng:** IPN webhook là **source of truth**, return URL chỉ để hiển thị UI.

---

## Slide 12 — Lộ trình 22 section / 65 video

| Phần | Section | Trọng tâm |
|------|---------|-----------|
| **Foundations** | 1 | NestJS lifecycle + Zod pipe |
| **Auth & Users** | 2-4 | JWT + role + taxonomy |
| **Marketplace** | 5-7 | Course CRUD + approval + enrollment |
| **Live Tutoring** | 8-12 | Availability + booking + Jitsi + iCal |
| **Money** | 13-15 | VNPay + order + payout |
| **Misc** | 16 | Notifications |
| **Database Deep Dive** | 17-21 | PostgreSQL + SQL + Prisma + indexing + transaction |
| **Wrap-up** | 22 | API.md + ERD recap + demo E2E |

**Tổng:** 22 section × ~3 video = **65 video** (~ 25 giờ học)

---

## Slide 13 — Khoá học đặt mục tiêu gì?

### 5 deliverable cụ thể

✅ **NestJS API service** — ~55 endpoint REST với Swagger UI

✅ **PostgreSQL schema** — 20 bảng prod-grade, FK + index có lý do

✅ **Prisma migrations + seeders** — Hanah admin + 5 Tutor demo + 10 course mẫu

✅ **3rd-party integration** — Jitsi (iframe + cron) + VNPay (IPN idempotent)

✅ **Test coverage ≥ 70% service** — Vitest + Supertest

> 📦 Cuối khoá: Git tag `course-2-3-complete`

---

## Slide 14 — Bạn cần biết gì trước khi bắt đầu?

### Kiến thức tiên quyết

✅ **Phải có (đã học C1):**

- TypeScript strict + Node.js cơ bản
- NestJS skeleton (module, controller, service, DI)
- Zod validation runtime
- REST API design + HTTP methods

⭐ **Nên biết (tùy chọn):**

- Cơ bản SQL (SELECT, JOIN) — Section 18 sẽ ôn lại
- Concept ORM (Active Record vs Data Mapper)
- Tâm lý "thanh toán online" và webhook idempotency

❌ **KHÔNG cần biết trước:**

- Prisma, JWT, OAuth, Jitsi, VNPay, RRULE → dạy từ đầu

---

## Slide 15 — Tutor365 và iTutor365: Phân biệt

### Tham chiếu spec QC

File `(tuu)Tutor365-QC Test Case.xlsx` chứa **336 test case từ iTutor365** — sản phẩm tham khảo.

**Khác biệt Tutor365 (sẽ build) vs iTutor365 (tham khảo):**

| Tính năng | iTutor365 | Tutor365 (C2-3) |
|-----------|-----------|------------------|
| Role Parent (phụ huynh) | Có | ❌ Không (Q1 chốt) |
| Cart / Checkout | Có | ❌ Không (mua 1-1) |
| Refund flow | Có | ❌ Không (Q6 chốt) |
| Recording buổi live | Có | ❌ Không (live = Q&A) |
| Approve Tutor | Manual | Hanah duyệt |
| Combo session | Tự chọn nhiều tháng | Cố định 1 hoặc 2 tháng |

> 💡 Tutor365 = phiên bản **gọn hơn**, focus core flow.

---

## Slide 16 — Hanah là ai?

### Single admin account của hệ thống

**Hanah** = tên admin duy nhất của Tutor365 (single-tenant MVP).

Trách nhiệm của Hanah:

- 👁️ **Duyệt Tutor profile** — review qualification, bio, set `approveStatus=approved`
- 📚 **Duyệt khoá học** — Tutor submit → Hanah approve/reject
- 🎯 **Assign Tutor cho booking** — xem pending list → filter eligible → pick 1 Tutor
- 💰 **Confirm Tutor payout** — monthly aggregate → mark paid

**Không có Hanah:**

- Tutor không thể bắt đầu dạy
- Course không published
- Student không có Tutor sau khi book

> ⚠️ Hanah không phải role automatable — luôn là người thật. Bot không thay được.

---

## Slide 17 — Không có gì trong khoá này (out of scope)

| Tính năng | Lý do | Khoá nào |
|-----------|-------|----------|
| Frontend React + FullCalendar | C2-3 chỉ backend | C4 |
| AI summary, AI quiz gen | Khoá AI riêng | C5 |
| OAuth Google/Facebook | Auth nâng cao | C5 |
| Redis cache + BullMQ queue | Scaling khoá riêng | C6 |
| Real-time chat WebSocket | Cùng với Redis | C6 |
| Playwright E2E | Test khoá riêng | C7 |
| Docker + CI/CD + deploy | DevOps khoá riêng | C8 |
| Refund | Quyết định business | — |
| Recording Jitsi | Live = Q&A, không cần | — |
| Cart marketplace | Mua 1 course / 1 click | — |

---

## Slide 18 — Môi trường phát triển

### Khoá học hỗ trợ macOS + Windows native

| OS | Node | Package | Shell |
|----|------|---------|-------|
| macOS | 20 LTS qua `nvm` | pnpm 9 | zsh / bash |
| Windows | 20 LTS qua `nvm-windows` | pnpm 9 | **PowerShell** |

> ⚠️ **KHÔNG dùng WSL/Linux** — học viên Windows dùng PowerShell trực tiếp.

**Required services (Docker Desktop):**

- 🐘 PostgreSQL 16
- 📧 MailPit (SMTP dev)
- 🗄️ MinIO (S3-compat cho upload file lesson)

**Required accounts:**

- VNPay Sandbox merchant — đăng ký free
- Jitsi: **không cần** — dùng public `meet.jit.si`

---

## Slide 19 — Cấu trúc một section điển hình

Mỗi section đi theo pattern lặp:

```
📖 Section N
├── Video 1: Khái niệm + use case Tutor365
├── Video 2-3: Implement step-by-step (controller → service → repo)
├── Bài tập: 2-3 task curl test endpoint
└── Verify: pnpm verify exit 0
```

**Ví dụ Section 2 (Auth, 4 video):**

- V06: Signup + email verification (mailpit)
- V07: Login + bcrypt + JWT access
- V08: Refresh token rotation + revoke
- V09: Role guard + `@Roles('admin', 'tutor')`

---

## Slide 20 — Cách học hiệu quả cho khoá này

### 5 nguyên tắc

1. **Đọc planK23.md trước** — biết destination trước khi code
2. **Code along** — đừng chỉ xem, gõ từng dòng vào IDE
3. **Test endpoint bằng curl + Postman** — verify hành vi, không tin demo
4. **Đọc SQL chạy thật** — bật `prisma:query` log để thấy query Prisma sinh
5. **Commit sau mỗi video** — Git history là proof của tiến bộ

> 💪 **Quan trọng nhất:** hiểu **vì sao** chọn pattern này, không chỉ **cách code**

---

## Slide 21 — Bạn sẽ tự tin làm gì sau khoá?

### Kỹ năng sau 65 video

- 🔧 Build NestJS API với 14 module domain phức tạp
- 🗃️ Thiết kế schema PostgreSQL 20+ bảng có index hợp lý
- 🔐 Implement JWT auth thật (access + refresh + role guard)
- 💸 Tích hợp payment gateway VN (VNPay) idempotent đúng chuẩn
- 🎥 Tích hợp video conferencing (Jitsi iframe API + cron sync)
- 📅 Generate iCal feed cho Google/Apple Calendar
- 🧪 Viết test integration + unit với Vitest + Supertest
- 📊 EXPLAIN ANALYZE + tune index → query nhanh

> 💼 Skill set tương đương **mid-level backend engineer** ở startup VN

---

## Slide 22 — Câu hỏi tự kiểm tra

Trả lời với chính mình:

1. ❓ Bạn đã hoàn thành **Khóa 1** (NestJS skeleton + Zod) chưa?
2. ❓ Máy bạn đã cài **Docker Desktop** để chạy Postgres + MailPit + MinIO?
3. ❓ Bạn sẵn sàng đăng ký **VNPay Sandbox** (free, 5 phút)?
4. ❓ Bạn cam kết **2-3 giờ/ngày trong 5 tuần** cho khoá này?
5. ❓ Bạn coi việc **đọc error PostgreSQL** là kỹ năng quan trọng?

> ✅ Nếu 5 "Yes" — sang Video 2 setup NestJS Tutor365.

---

<!-- _class: lead -->

# Tiếp theo: Video 2

## Bootstrap NestJS Application

CORS, helmet, versioning, graceful shutdown, global pipe, structured logger.
Setup `apps/api` cho Tutor365 đúng chuẩn production từ ngày đầu.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 2 🚀

> *"Architecture is about the important stuff.*
> *Whatever that is."*
> *— Ralph Johnson*
