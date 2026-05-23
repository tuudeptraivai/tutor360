---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 2: Hiểu Kiến Trúc Toàn Diện Của LMS'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Hiểu Kiến Trúc
# Toàn Diện Của LMS

### Khóa 1 — Video 2

**Từ bức tranh lớn → định vị Khóa 1**

> Bạn không thể xây nhà nếu không hiểu bản thiết kế tổng thể

---

## Slide 2 — Mục tiêu video này

Sau 15 phút, bạn sẽ:

- ✅ Vẽ được **sơ đồ kiến trúc cấp cao** của AI LMS
- ✅ Hiểu **6 tầng** của hệ thống làm gì
- ✅ Biết **vì sao** mỗi tầng tồn tại — không phải over-engineering
- ✅ Theo dõi **luồng dữ liệu** khi học sinh làm 1 bài quiz
- ✅ **Định vị Khóa 1** trong toàn bộ kiến trúc

> 🎯 Cuối video: bạn vẽ lại sơ đồ này bằng tay, không nhìn slide

---

## Slide 3 — Vì sao phải hiểu kiến trúc TRƯỚC khi code?

### 3 lý do quan trọng

**1. Tránh refactor đau đớn**
Quyết định kiến trúc sai ở tuần 1 → đập đi xây lại ở tuần 8

**2. Hiểu vì sao có Khóa 2, 3, 4...**
Khi biết bức tranh, bạn hiểu mỗi khóa lấp vào ô nào

**3. Phỏng vấn senior cần tư duy hệ thống**
"Em đã build LMS này thế nào?" → trả lời bằng kiến trúc, không phải code

> 💡 *"Weeks of coding can save you hours of planning"* — câu nói ngược lại

---

## Slide 4 — Sơ đồ kiến trúc cấp cao

```
┌─────────────────────────────────────────────┐
│  🌐  FRONTEND  (Next.js + React)            │
│      Dashboard • Course UI • Quiz UI        │
└─────────────────────────────────────────────┘
                      ↕ HTTPS / JSON
┌─────────────────────────────────────────────┐
│  ⚙️   BACKEND API  (NestJS)                  │
│      Auth • Course • Quiz • Analytics       │
└─────────────────────────────────────────────┘
        ↕              ↕             ↕
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ 🗄️ DATABASE  │ │ ⚡ CACHE │ │ 🤖 AI LAYER  │
│  PostgreSQL  │ │  Redis   │ │  Claude API  │
└──────────────┘ └──────────┘ └──────────────┘
                      ↕
              ┌─────────────────┐
              │ 📬 QUEUE WORKER │
              │     BullMQ      │
              └─────────────────┘
```

---

## Slide 5 — Tầng 1: Frontend (Khóa 4)

### 🌐 Next.js + React + TanStack Query

**Trách nhiệm:**

- Render UI cho học sinh và giáo viên
- Gọi API backend, hiển thị dữ liệu
- Quản lý state phía client (cache, optimistic update)
- Form validation, routing, navigation

**Không làm:**

- ❌ Truy cập database trực tiếp
- ❌ Gọi Claude API trực tiếp (lộ API key)
- ❌ Xử lý business logic phức tạp

> 📌 **Khóa 4** mới build phần này. Khóa 1: chưa có frontend.

---

## Slide 6 — Tầng 2: Backend API (Khóa 1 + 2 + 3 + 5)

### ⚙️ NestJS — Trái tim của hệ thống

**Trách nhiệm:**

- Expose REST API cho frontend
- Business logic (đăng ký khóa học, chấm quiz...)
- Authentication & authorization
- Validate input bằng Zod
- Orchestrate: gọi DB, Redis, Claude, Queue

**Đây là phần Khóa 1 xây nền móng:**

- ✅ HTTP server (NestJS bootstrap)
- ✅ Middleware (request ID, logging)
- ✅ Error handling (`AppException`, filter)
- ✅ Validation pipeline (Zod)

---

## Slide 7 — Tầng 3: Database (Khóa 3)

### 🗄️ PostgreSQL + Prisma ORM

**Lưu gì?**

| Bảng | Nội dung |
|------|----------|
| `users` | Tài khoản học sinh, giáo viên, admin |
| `courses` | Khóa học (title, slug, level, tags) |
| `lessons` | Bài giảng thuộc khóa học |
| `quizzes` | Quiz và câu hỏi |
| `quiz_results` | Điểm số học sinh |
| `enrollments` | Học sinh nào học khóa nào |
| `progress` | Tiến độ chi tiết |

> 📌 **Khóa 3** mới đụng database thật. Khóa 1: in-memory store.

---

## Slide 8 — Tầng 4: Cache Layer (Khóa 6)

### ⚡ Redis — Tăng tốc + giảm chi phí

**Dùng để cache:**

- 🤖 **AI summaries** — sinh 1 lần, đọc nghìn lần
- 📊 **Recommendations** — heavy compute, cache 1h
- 🎫 **Session data** — JWT blacklist, refresh token
- 🚦 **Rate limiting** — đếm request per user

**Vì sao quan trọng?**

| Không cache | Có cache |
|-------------|----------|
| Mỗi request → Claude API ($$$) | 1 request → cache nghìn lần |
| Latency 2-5 giây | Latency < 50ms |
| Database overload | DB nhẹ tải |

> 📌 **Khóa 6** mới setup Redis. Khóa 1: chưa cần.

---

## Slide 9 — Tầng 5: Queue System (Khóa 6)

### 📬 BullMQ Workers — Xử lý nền

**Vì sao cần queue?**

Có những việc **KHÔNG được làm trong HTTP request**:

- ⏱️ Gửi email (chậm, có thể fail)
- 🤖 Generate AI summary (mất 10-30 giây)
- 📅 Scheduled jobs (gửi reminder lúc 8h sáng)
- 📊 Tính toán analytics báo cáo

**Pattern:**

```
HTTP request → push job vào queue → trả 200 ngay
                    ↓
            Worker xử lý nền
                    ↓
            User nhận kết quả qua email / notification
```

---

## Slide 10 — Tầng 6: AI Layer (Khóa 5)

### 🤖 Claude API — Bộ não của hệ thống

**Làm những gì?**

| Use case | Input | Output |
|----------|-------|--------|
| **Summarization** | PDF, transcript | Bullet points + key concepts |
| **Quiz generation** | Lesson content | 10 câu MCQ + đáp án |
| **Recommendation** | Student history | "Học tiếp X vì Y" |
| **AI Tutor** | Câu hỏi học sinh | Câu trả lời + ví dụ |

**Kỹ thuật quan trọng (Khóa 5):**

- Prompt engineering
- Streaming responses
- Token budget management
- Caching để giảm cost

---

## Slide 11 — Luồng dữ liệu: Học sinh làm quiz (1/3)

### Bước 1-3: User mở quiz

```
1. 👤 Student click "Làm quiz"
        ↓
2. 🌐 Frontend gửi GET /quizzes/:id
        ↓
3. ⚙️ Backend nhận request
        ↓ kiểm tra cache trước
4. ⚡ Redis: cache hit?
        ├─ HIT  → trả ngay (5ms)
        └─ MISS → query DB
                    ↓
5. 🗄️ PostgreSQL: SELECT quiz + questions
        ↓
6. ⚡ Backend lưu vào Redis (TTL 1h)
        ↓
7. 🌐 Frontend nhận quiz, render UI
```

---

## Slide 12 — Luồng dữ liệu: Học sinh làm quiz (2/3)

### Bước 4-6: User submit answers

```
1. 👤 Student chọn đáp án, click "Nộp bài"
        ↓
2. 🌐 Frontend POST /quizzes/:id/submit
        ↓
3. ⚙️ Backend:
        ├─ Validate input (Zod)
        ├─ Chấm điểm
        └─ Lưu vào quiz_results table
        ↓
4. 🗄️ PostgreSQL: INSERT result
        ↓
5. 📬 Push job "generate AI feedback" vào BullMQ
        ↓
6. 🌐 Trả response 200 + score ngay
```

> 💡 Học sinh thấy điểm trong < 200ms — feedback AI đến sau qua notification

---

## Slide 13 — Luồng dữ liệu: Học sinh làm quiz (3/3)

### Bước 7-9: Worker xử lý nền

```
1. 📬 BullMQ Worker pickup job
        ↓
2. 🤖 Gọi Claude API:
        "Học sinh sai câu 3, 7. Giải thích vì sao..."
        ↓ (10-15 giây)
3. 🤖 Claude trả về personalized feedback
        ↓
4. ⚡ Cache feedback vào Redis
        ↓
5. 🗄️ Update quiz_results.ai_feedback
        ↓
6. 📧 Push notification:
        "Feedback chi tiết đã sẵn sàng!"
        ↓
7. 👤 Student mở app → đọc feedback từ AI
```

---

## Slide 14 — Bài học rút ra từ luồng quiz

### 4 nguyên tắc kiến trúc

**1. Cache trước, query sau** → Redis là "first line of defense"

**2. HTTP request phải NHANH** → việc nặng → push vào queue

**3. AI là async, không sync** → không bao giờ block user UI chờ AI

**4. Database là source of truth** → cache có thể mất, DB không được mất

> 🎯 Đây là pattern bạn sẽ thấy ở **mọi production system** hiện đại

---

## Slide 15 — Định vị Khóa 1 trong kiến trúc

```
┌─────────────────────────────────────────────┐
│  🌐  FRONTEND                  ← Khóa 4    │
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────┐
│  ⚙️   BACKEND API              ← KHÓA 1 ✅ │
│      (Skeleton + foundation)                │
└─────────────────────────────────────────────┘
        ↕              ↕             ↕
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ 🗄️ DATABASE  │ │ ⚡ CACHE │ │ 🤖 AI LAYER  │
│   ← Khóa 3   │ │ ← Khóa 6 │ │  ← Khóa 5    │
└──────────────┘ └──────────┘ └──────────────┘
                      ↕
              ┌─────────────────┐
              │ 📬 QUEUE        │
              │   ← Khóa 6      │
              └─────────────────┘
```

---

## Slide 16 — Khóa 1 xây CHÍNH XÁC những gì?

### Backend skeleton — không hơn không kém

✅ **Có trong Khóa 1:**

- HTTP server NestJS chạy `:3000`
- 3 endpoint: `GET /health`, `GET /courses`, `POST /courses`
- In-memory store (Map<id, Course>) — KHÔNG phải database thật
- Middleware (request ID, logging)
- Error handling (`AppException` hierarchy)
- Shared TypeScript packages (`@lms/types`, `@lms/config`)
- Validation pipeline (Zod + ZodValidationPipe)
- Developer tooling (ESLint, Prettier, Husky)

> 📦 Hết. Đơn giản, sạch, sẵn sàng cho 7 khóa sau cắm thêm tầng.

---

## Slide 17 — Vì sao bắt đầu bằng skeleton, không phải database?

### Triết lý "Walking Skeleton"

**Walking Skeleton** = end-to-end nhỏ nhất chạy được

> Server → endpoint → response → có log → có error handling

**Vì sao không build database trước?**

1. Database chưa cần khi chưa có business logic
2. Test API dễ hơn với in-memory (không cần migrate)
3. Tách concern: học HTTP layer trước, persistence sau
4. Sau này swap `InMemoryRepository` → `PrismaRepository` chỉ 1 dòng

> 💡 Đây là pattern **Repository Pattern** — sẽ làm ở Video 15

---

## Slide 18 — Pattern: Repository làm gì?

### Tách interface khỏi implementation

```typescript
// Khóa 1: InMemoryCourseRepository
class InMemoryCourseRepository implements CourseRepository {
  private store = new Map<string, Course>();
  // ...
}

// Khóa 3: PrismaCourseRepository
class PrismaCourseRepository implements CourseRepository {
  constructor(private prisma: PrismaClient) {}
  // ...
}
```

**Đổi từ in-memory sang Postgres chỉ cần:**

```typescript
{ provide: COURSE_REPOSITORY, useClass: PrismaCourseRepository }
//                                       ^^^^^^^^^^^^^^^^^^^^^
//                                       đổi mỗi class này
```

> 🎯 Đây là **Dependency Inversion Principle** trong thực tế

---

## Slide 19 — Mỗi tầng được thêm ở khóa nào?

### Roadmap đầy đủ

| Tầng | Khóa | Lý do thứ tự |
|------|------|--------------|
| Backend skeleton | **1** ✅ | Foundation cho mọi thứ |
| Authentication | **2** | Cần trước khi có user data |
| Database | **3** | Cần trước khi có frontend |
| Frontend | **4** | Cần backend + DB ổn định |
| AI integration | **5** | Cần auth + DB để cá nhân hóa |
| Cache + Queue | **6** | Optimize sau khi MVP chạy |
| Testing | **7** | Test stack đã hoàn chỉnh |
| Deployment | **8** | Đem sản phẩm ra production |

---

## Slide 20 — Bài tập: Vẽ lại sơ đồ

### 🎨 Lấy giấy bút ra (đừng dùng Figma!)

**Trong 5 phút, vẽ lại:**

1. 6 tầng của hệ thống
2. Mũi tên giữa các tầng
3. Ghi tên công nghệ mỗi tầng
4. Đánh dấu tầng nào ở Khóa 1

**Tự chấm:**

- ✅ Đúng 6 tầng → tốt
- ✅ Đúng hướng mũi tên → rất tốt
- ✅ Giải thích được vì sao có queue → xuất sắc

> 💡 *Vẽ tay giúp não nhớ gấp 3 lần xem slide*

---

## Slide 21 — Câu hỏi suy ngẫm

### Trước khi sang Video 3, tự trả lời:

1. ❓ Vì sao không gọi Claude API trực tiếp từ frontend?
2. ❓ Vì sao gửi email cần queue, không gửi luôn trong HTTP request?
3. ❓ Vì sao Redis cache lại AI summary chứ không cache `GET /health`?
4. ❓ Nếu Redis chết, hệ thống còn chạy được không? PostgreSQL chết thì sao?
5. ❓ Khóa 1 KHÔNG có database — vậy `POST /courses` lưu data ở đâu?

> 📝 Trả lời được 4/5 → bạn đã hiểu kiến trúc

---

## Slide 22 — Tổng kết Video 2

### Bạn vừa học được

- ✅ Sơ đồ kiến trúc 6 tầng của AI LMS
- ✅ Mỗi tầng làm gì, vì sao tồn tại
- ✅ Luồng dữ liệu khi học sinh làm quiz (cache → DB → queue → AI)
- ✅ Vị trí Khóa 1 trong toàn bộ bức tranh
- ✅ Triết lý "Walking Skeleton" và Repository Pattern

> 🎯 Bây giờ bạn biết đang xây cái gì — và nó nối vào đâu

---

<!-- _class: lead -->

# Tiếp theo: Video 3

## Lên Kế Hoạch Monorepo

So sánh monorepo vs polyrepo, cấu trúc thư mục `apps/` + `packages/`, giới thiệu pnpm workspaces và Turborepo.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 3 🚀

> *"Architecture is about the important stuff.*
> *Whatever that is."* — Ralph Johnson
