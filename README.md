# Tutor365

Nền tảng **LMS 2-trong-1**: marketplace khóa học self-paced + live tutoring 1:1 qua **Jitsi Meet**. Dự án được xây dựng song song với chuỗi **8 khóa học** đào tạo Fullstack Engineer (TypeScript / NodeJS / React / Claude).

---

## Tổng quan sản phẩm

Tutor365 phục vụ 3 nhóm người dùng chính:

| Vai trò | Mục đích sử dụng |
|---------|------------------|
| **Student** | Mua khóa học video, học self-paced, đặt buổi học 1:1 (single/combo) với Tutor |
| **Tutor** | Đăng khóa học (video/pptx/pdf), khai báo lịch rảnh, dạy live qua Jitsi |
| **Admin (Hanah)** | Duyệt khóa học, assign Tutor cho booking, quản lý payout |

### Hai luồng nghiệp vụ cốt lõi

1. **Marketplace khóa học** — Tutor đăng course → Admin duyệt → Student mua bằng VND → học self-paced với tracking tiến độ.
2. **Live tutoring 1:1** — Student đặt slot → Admin filter Tutor đủ chuyên môn + rảnh → Tutor accept → server sinh Jitsi room URL deterministic → cả hai phía join qua calendar.

### Giá live tutoring

- **Single:** 200.000 VND/giờ (buổi 1.5–2h)
- **Combo:** 150.000 VND/giờ, 3 buổi/tuần, kéo dài 1 hoặc 2 tháng
- **Payment:** VNPay (sandbox + production), không refund

---

## Tech Stack

| Tầng | Công nghệ |
|------|----------|
| **Frontend** | Next.js 14 (App Router), React, TanStack Query, Tailwind |
| **Backend API** | NestJS 10, TypeScript 5.4+, Zod |
| **Database** | PostgreSQL 16, Prisma 5 |
| **Cache / Queue** | Redis, BullMQ (Course 6) |
| **AI Layer** | Claude API (Course 5) |
| **Live meeting** | Jitsi Meet (iframe External API, `meet.jit.si`) |
| **Payment** | VNPay (SHA-512 hash + IPN webhook idempotent) |
| **Storage** | MinIO (S3-compatible) cho file upload |
| **Email dev** | MailPit (SMTP local) |
| **Tooling** | pnpm 9 workspaces, Turborepo, Vitest, ESLint, Prettier, Husky |

---

## Lộ trình 8 khóa học

| Khóa | Tên | Trạng thái |
|------|-----|-----------|
| **C1** | Bootstrapping AI LMS — TypeScript + NodeJS Foundations | Done |
| **C2-3** | Building Tutor365 Backend + Database (NestJS + PostgreSQL) | In progress |
| **C4** | Student Dashboard (React + FullCalendar UI) | Next |
| **C5** | AI Learning Features (Claude API) | Planned |
| **C6** | Scaling (Redis + BullMQ + Chat real-time) | Planned |
| **C7** | Testing & Engineering Quality | Planned |
| **C8** | Deploying (Docker + CI/CD) | Planned |

Tổng cộng dự kiến hơn **150 video** trải dài 8 khóa.

---

## Cấu trúc repository

```
tutor360/
├── AGENTS.md              # Quy tắc làm việc bắt buộc cho AI agents
├── CLAUDE.MD              # Trỏ tới AGENTS.md
├── README.md              # File này
├── backend/               # NestJS workspace (Tutor365 API)
│   ├── package.json       # Root workspace (pnpm)
│   ├── pnpm-workspace.yaml # Khai báo workspace apps/*
│   ├── tsconfig.base.json  # TS config dùng chung cho backend
│   └── apps/
│       └── api/           # Backend NestJS — xem backend/apps/api/README.md
└── docs/                  # Tài liệu khóa học (tiếng Việt)
    ├── course1/           # K1 — TypeScript + NodeJS Foundations
    │   ├── khoa-hoc-1-vi.md
    │   ├── planK1.md
    │   ├── crud-courses.md
    │   ├── task.md
    │   └── slides/        # Script 20 video
    ├── course2-3/         # K2-3 — Backend + Database
    │   ├── khoa-hoc-2-3-vi.md
    │   ├── planK23.md
    │   ├── task.md
    │   └── tickets/       # Backlog CSV + generator
    └── course4/           # K4 — Student Dashboard UI spec
        └── ui-screens.md
```

> `backend/apps/api` đã được scaffold (Issue #3 — Video 01). `backend/apps/web`, `backend/packages/*` sẽ được tạo ở các khóa sau.

---

## Yêu cầu môi trường

| OS | Node | Package manager |
|----|------|----------------|
| **macOS** | Node 20 LTS (qua `nvm`) | pnpm 9 |
| **Windows** | Node 20 LTS (qua `nvm-windows`, PowerShell) | pnpm 9 |

> Không hỗ trợ WSL/Linux trong chuỗi khóa học này.

**Dịch vụ dev (Docker):**
- PostgreSQL 16
- MailPit (SMTP)
- MinIO (S3-compat)

**Tài khoản:**
- VNPay Sandbox merchant
- Jitsi Meet — **không cần account** (dùng public `meet.jit.si`)

---

## Bắt đầu

### macOS (zsh/bash + nvm)

```bash
# Cài Node 20 LTS
nvm install 20 && nvm use 20

# Cài pnpm
npm install -g pnpm@9

# Clone repo
git clone https://github.com/tuudeptraivai/tutor360.git
cd tutor360/backend

# Cài dependencies
pnpm install

# Copy biến môi trường cho backend
cp apps/api/.env.example apps/api/.env

# Chạy backend dev server (port 3000)
pnpm --filter api start:dev
```

### Windows (PowerShell + nvm-windows)

```powershell
# Cài Node 20 LTS
nvm install 20
nvm use 20

# Cài pnpm
npm install -g pnpm@9

# Clone repo
git clone https://github.com/tuudeptraivai/tutor360.git
cd tutor360\backend

# Cài dependencies
pnpm install

# Copy biến môi trường cho backend
Copy-Item apps\api\.env.example apps\api\.env

# Chạy backend dev server (port 3000)
pnpm --filter api start:dev
```

Sau khi server chạy:

- Swagger UI: <http://localhost:3000/api/docs>
- Health check: <http://localhost:3000/v1/health> → `{ "status": "ok" }`

> Chi tiết backend xem [`backend/apps/api/README.md`](./backend/apps/api/README.md).

---

## Quy tắc làm việc

Mọi đóng góp (bao gồm AI agents) **bắt buộc đọc** [`AGENTS.md`](./AGENTS.md) trước khi bắt đầu công việc. File này định nghĩa:

- Phase discipline — chia nhỏ work, dừng sau mỗi phase để review
- Human approval gates — không tự ý edit file khi chưa được duyệt
- Acceptance criteria — định nghĩa rõ tiêu chí thành công trước khi code
- UI work phải được verify trực quan trên dev server

---

## Tài liệu

- **Quy tắc agent:** [`AGENTS.md`](./AGENTS.md)
- **Khóa 1 — Foundations:** [`docs/course1/khoa-hoc-1-vi.md`](./docs/course1/khoa-hoc-1-vi.md)
- **Khóa 2-3 — Backend + DB:** [`docs/course2-3/khoa-hoc-2-3-vi.md`](./docs/course2-3/khoa-hoc-2-3-vi.md)
- **Khóa 4 — UI Spec:** [`docs/course4/ui-screens.md`](./docs/course4/ui-screens.md)
- **Syllabus gốc (PDF):** `docs/Remote - Fullstack Engineer (Claude, NodeJS, React).pdf`
- **QC Test Cases:** `docs/(tuu)Tutor365-QC Test Case.xlsx`

---

## License

Chưa xác định.
