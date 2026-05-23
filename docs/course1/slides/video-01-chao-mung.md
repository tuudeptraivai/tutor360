---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 1: Chào mừng đến với dự án AI LMS'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Chào mừng đến với
# Dự Án AI LMS

### Khóa 1 — Video 1

**TypeScript + Node.js Foundations**

> Hành trình xây dựng một AI-First Learning Management System cấp production

---

## Slide 2 — Bạn sẽ học được gì hôm nay?

Sau video này, bạn sẽ:

- ✅ Hiểu **dự án AI LMS là gì** và vì sao nó đáng làm
- ✅ Nắm **lộ trình 8 khóa học** — đi từ đâu đến đâu
- ✅ Xem **demo sản phẩm cuối** — đích đến của hành trình
- ✅ Biết **vì sao dự án này** phù hợp portfolio cấp cao
- ✅ Hiểu **cách học hiệu quả nhất** với chuỗi khóa học

> 🎯 **Mục tiêu:** Cuối video, bạn biết chính xác mình sắp xây gì và vì sao

---

## Slide 3 — AI-Powered LMS là gì?

### Một AI-First Learning Management System

Kết hợp tinh hoa từ 5 nền tảng hàng đầu:

| Nền tảng | Ý tưởng học được |
|----------|------------------|
| 🦉 **Duolingo** | Cá nhân hóa + gamification |
| 🎓 **Coursera** | Quản lý khóa học chuyên nghiệp |
| 📚 **Khan Academy** | Theo dõi tiến độ học tập |
| 📝 **Notion** | Tổ chức nội dung linh hoạt |
| 🤖 **Anthropic** | AI assistant thông minh |

---

## Slide 4 — Sản phẩm cuối làm được gì?

🤖 **AI tự động:**

- Tóm tắt bài giảng từ PDF / video transcript
- Sinh quiz tự động theo độ khó
- Gợi ý bài học tiếp theo cho từng học sinh
- AI tutor trả lời câu hỏi 24/7

📊 **Hệ thống học tập:**

- Quản lý khóa học, bài giảng, chapter
- Tracking tiến độ + streak học tập
- Email reminder, push notification
- Analytics realtime cho giáo viên

---

## Slide 5 — Ai sẽ dùng hệ thống này?

### 3 nhóm người dùng chính

**👨‍🎓 Học sinh (Students)**
Học online → làm quiz → theo dõi tiến độ → nhận nhắc nhở

**👩‍🏫 Giáo viên / Course Creators**
Upload bài → AI sinh quiz → xem analytics → quản lý kết quả

**🏢 EdTech Startups / Trường học**
White-label LMS → AI-assisted education → tự động hóa đánh giá

---

## Slide 6 — Demo sản phẩm cuối

### Thử nhìn qua trước khi bắt đầu

> 🎬 *[Video demo 60 giây — luồng học sinh từ login → vào khóa học → AI tóm tắt → làm quiz → nhận gợi ý]*

**Những gì bạn sẽ thấy:**

- Student dashboard với streak, progress
- Trang khóa học với AI summary của bài giảng
- AI quiz tự động sinh sau khi học xong
- Notification "Bạn có quiz cần hoàn thành"
- Teacher analytics dashboard

---

## Slide 7 — Lộ trình 8 khóa học

| # | Khóa | Trọng tâm |
|---|------|-----------|
| **1** | **Bootstrapping** | TypeScript + Node.js + NestJS skeleton |
| 2 | Authentication | JWT, OAuth Google, RBAC |
| 3 | Database Layer | PostgreSQL + Prisma + migrations |
| 4 | Student Dashboard | Next.js + TanStack Query + UI |
| 5 | AI Integration | Claude API, streaming, prompt engineering |
| 6 | Cache & Queue | Redis + BullMQ + background jobs |
| 7 | Testing | Vitest + integration + E2E |
| 8 | Production | Docker + CI/CD + monitoring + deploy |

---

## Slide 8 — Bạn đang ở đâu trong bản đồ?

```
Khóa 1 ✅ ← Bạn ở đây
    ↓
Khóa 2 → Khóa 3 → Khóa 4 → Khóa 5
    ↓
Khóa 6 → Khóa 7 → Khóa 8 → 🎉 Production
```

**Khóa 1 = Nền móng**

> Không có nền móng vững, 7 khóa sau sẽ sụp đổ.
> Đầu tư nghiêm túc vào khóa này — phần thưởng sẽ đến ở các khóa sau.

---

## Slide 9 — Khóa 1 sẽ đưa bạn đến đâu?

### 5 deliverable cụ thể

✅ **Monorepo hoàn chỉnh** — pnpm workspaces, sẵn sàng mở rộng

✅ **Backend skeleton (NestJS)** — `/health`, `/courses` endpoints

✅ **Shared TypeScript packages** — `@lms/types`, `@lms/config`

✅ **Claude Code workflow** — `CLAUDE.md` + quy ước làm việc với AI

✅ **Developer tooling** — ESLint, Prettier, Husky, `pnpm verify`

> 📦 Cuối khóa: Git tag `course-1-complete`

---

## Slide 10 — Stack công nghệ Khóa 1

| Lớp | Công nghệ | Vì sao chọn |
|-----|-----------|------------|
| Runtime | Node.js 20 LTS | Standard, LTS support dài |
| Ngôn ngữ | TypeScript 5.4+ strict | Type safety production |
| Package manager | pnpm 9 workspaces | Nhanh, monorepo-friendly |
| Framework | NestJS 10 | Cấu trúc rõ, DI mạnh |
| Validation | Zod 3 | Runtime + compile-time |
| Logging | nestjs-pino | Structured JSON logging |
| Testing | Vitest | Nhanh hơn Jest |

---

## Slide 11 — Vì sao dự án này MẠNH cho portfolio?

### Không phải CRUD app đơn giản

Dự án này cover **toàn bộ kỹ năng senior fullstack**:

- 🎨 Frontend engineering (React, TanStack Query)
- ⚙️ Backend engineering (NestJS, REST API)
- 🤖 AI engineering (Claude API, prompt engineering)
- ⚡ Caching architecture (Redis)
- 📬 Queue systems (BullMQ background jobs)
- 📈 Scalable APIs, analytics
- 🚢 Production deployment (Docker + CI/CD)

> 💼 Recruiter nhìn vào → biết bạn đã đụng real-world architecture

---

## Slide 12 — Vì sao dự án này GẦN với startup thật?

### Đây là kiến trúc thật của EdTech startups hiện nay

Khi bạn nộp CV vào:

- 🎓 AI education startups
- 📚 SaaS learning platforms
- 🏫 Modern LMS systems

Bạn có thể nói:

> *"Tôi đã build một hệ thống tương tự — đây là source code, đây là kiến trúc, đây là trade-off tôi đã cân nhắc."*

→ **Khác biệt giữa "đã làm tutorial" vs "đã build production system"**

---

## Slide 13 — Bạn cần chuẩn bị gì trước khi bắt đầu?

### Yêu cầu kiến thức

✅ **Phải có:**

- JavaScript ES6+ (arrow function, async/await, destructuring)
- Cơ bản về HTTP và REST API
- Quen với terminal / command line
- Đã từng dùng Git (basic commit, branch)

⭐ **Nên có (nhưng không bắt buộc):**

- Đã viết qua TypeScript chút ít
- Hiểu cơ bản về Node.js

❌ **KHÔNG cần biết trước:**

- NestJS, Zod, Redis, BullMQ → sẽ dạy từ đầu

---

## Slide 14 — Bạn cần chuẩn bị gì về máy?

### Tooling tối thiểu

🖥️ **Hardware:**

- Máy có RAM ≥ 8GB
- Disk trống ≥ 10GB

💻 **Software (sẽ cài ở Video 4):**

- Node.js 20 LTS (qua `nvm`)
- pnpm 9
- VSCode + extensions (ESLint, Prettier)
- Git
- Claude Code CLI

⏰ **Thời gian:** ~2 giờ/ngày × 2 tuần cho Khóa 1

---

## Slide 15 — Cách học hiệu quả nhất

### 5 nguyên tắc vàng

1. **Code along** — gõ tay, đừng chỉ xem
2. **Pause & try** — dừng video, thử trước khi xem giải pháp
3. **Đọc lỗi kỹ** — error message là người thầy thật sự
4. **Commit thường xuyên** — Git history là bằng chứng tiến bộ
5. **Tận dụng Claude Code** — không phải copy-paste, mà là *học cùng*

---

## Slide 16 — Anti-pattern: Đừng làm thế này

❌ **Xem video 2x speed không thực hành** → hiểu giả

❌ **Copy code không gõ tay** → muscle memory không hình thành

❌ **Bỏ qua phần "vì sao"** → chỉ học được "what", thiếu "why"

❌ **Nhảy cóc khóa** → nền móng yếu, sẽ stuck ở khóa sau

❌ **Tuần này 10 tiếng, tuần sau 0 tiếng** → đứt mạch, quên hết

> ✅ **Tốt hơn:** 1 tiếng/ngày đều đặn còn hơn 10 tiếng/tuần burst

---

## Slide 17 — Cấu trúc của mỗi khóa

Mỗi khóa được tổ chức theo pattern lặp:

```
📖 Khóa N
├── Section 1 → Tổng quan + Setup
├── Section 2-N → Học khái niệm + thực hành
├── Section cuối → Polish + tích hợp
└── Deliverable → Git tag `course-N-complete`
```

**Khóa 1 cụ thể:** 5 section × 20 video

- Section 1: Setup (4 video)
- Section 2: TypeScript (5 video)
- Section 3: Node.js (4 video)
- Section 4: NestJS Backend (4 video)
- Section 5: Workflow (3 video)

---

## Slide 18 — Tài nguyên đi kèm khóa học

### Mỗi khóa bạn nhận được

📄 **Tài liệu spec** — `planK1.md` (kỹ thuật từng feature)

📋 **Task breakdown** — `task.md` (việc cần làm theo thứ tự)

📊 **Trello board** — `trello-course-1.csv` (import sẵn)

🎬 **Slide bài giảng** — như slide này

💻 **Source code** — repo template + solution branch

🤖 **CLAUDE.md** — cấu hình Claude Code sẵn cho dự án

---

## Slide 19 — Cam kết sau Khóa 1

### Sau 20 video, bạn sẽ tự tin:

- 🔧 Setup một monorepo TypeScript chuẩn production
- 📦 Thiết kế shared package dùng chung giữa các app
- ⚙️ Build một NestJS API có middleware, logging, error handling đúng cách
- 🛡️ Validate input runtime bằng Zod
- 🧠 Hiểu event loop, async, stream của Node.js
- 🤝 Làm việc hiệu quả với Claude Code

> 💪 **Quan trọng nhất:** Bạn sẽ biết *vì sao* làm vậy — không chỉ *cách làm*

---

## Slide 20 — Câu hỏi tự kiểm tra trước khi bắt đầu

Trả lời thật với chính mình:

1. ❓ Bạn có cam kết học **đều đặn 2 tuần** cho Khóa 1?
2. ❓ Bạn sẵn sàng **gõ tay code**, không copy-paste?
3. ❓ Bạn sẽ **đọc error message** trước khi hỏi Claude?
4. ❓ Bạn sẽ **commit Git** sau mỗi video hoàn thành?
5. ❓ Bạn coi việc **học là dài hạn**, không phải quick win?

> ✅ Nếu cả 5 đều "Yes" — bắt đầu Video 2 ngay!

---

<!-- _class: lead -->

# Tiếp theo: Video 2

## Hiểu Kiến Trúc Toàn Diện Của LMS

Vẽ sơ đồ kiến trúc cấp cao của hệ thống — định vị Khóa 1 trong bức tranh tổng thể.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 2 🚀

> *"The best time to plant a tree was 20 years ago.*
> *The second best time is now."*
