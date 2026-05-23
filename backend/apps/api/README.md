# Tutor365 API (`backend/apps/api`)

Backend NestJS 10 cho Tutor365. Phase này là **scaffold**: cấu trúc thư mục + 14 module domain rỗng + stack base. Chưa có business logic, Prisma schema hay auth.

## Stack

| Layer | Package |
|-------|---------|
| Framework | `@nestjs/core` `@nestjs/common` `@nestjs/platform-express` (NestJS 10) |
| Validation | `zod` 3 + Zod pipe (`common/pipes`) |
| Logger | `nestjs-pino` + `nestjs-cls` |
| ORM | `prisma` + `@prisma/client` 5 (chỉ cài, chưa có schema) |
| Auth | `@nestjs/jwt` `bcrypt` (chỉ cài deps) |
| Rate limit | `@nestjs/throttler` |
| Security | `helmet` |
| Swagger | `@nestjs/swagger` |
| Calendar | `ical-generator` |
| Test | `vitest` + `supertest` |

## Cấu trúc

```
src/
├── main.ts              # Bootstrap: helmet, CORS, versioning v1, pino, swagger, shutdown
├── app.module.ts        # Wiring toàn bộ module
├── common/              # Pipes/guards/... dùng chung (Zod validation pipe)
├── config/              # Đọc + validate ENV bằng Zod
├── prisma/              # PrismaModule (rỗng, chờ schema)
├── notifications/       # NotificationsModule (rỗng)
├── health/              # GET /v1/health
└── modules/             # 14 module domain rỗng
    ├── auth/ users/ tutors/ students/ taxonomy/ courses/
    ├── enrollments/ availabilities/ bookings/ assignments/
    └── meetings/ calendar/ payments/ payouts/
```

## Yêu cầu môi trường

| OS | Node | Package manager |
|----|------|----------------|
| **macOS** | Node 20 LTS (`nvm`) | pnpm 9 |
| **Windows** | Node 20 LTS (`nvm-windows`, PowerShell) | pnpm 9 |

> Không hỗ trợ WSL/Linux.

## Setup

### macOS (zsh/bash)

```bash
# từ thư mục backend/
cd backend
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter api start:dev
```

### Windows (PowerShell)

```powershell
# từ thư mục backend\
cd backend
pnpm install
Copy-Item apps\api\.env.example apps\api\.env
pnpm --filter api start:dev
```

## Scripts

| Lệnh | Mô tả |
|------|-------|
| `pnpm --filter api start:dev` | Dev server (watch) tại port 3000 |
| `pnpm --filter api build` | Build TypeScript -> `dist/` |
| `pnpm --filter api start` | Chạy bản build (`node dist/main.js`) |
| `pnpm --filter api test` | Chạy test (vitest, `--passWithNoTests`) |
| `pnpm --filter api test:watch` | Test watch mode |

## Kiểm tra nhanh

Sau khi `start:dev`:

- Swagger UI: <http://localhost:3000/api/docs>
- Health check: <http://localhost:3000/v1/health> → `{ "status": "ok" }`

## ENV

Xem [`.env.example`](./.env.example). Biến được validate bằng Zod tại `src/config/env.validation.ts` — app sẽ fail-fast nếu ENV sai.

| Biến | Mô tả |
|------|-------|
| `PORT` | Port HTTP (mặc định 3000) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `DATABASE_URL` | Postgres connection string (chưa dùng) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Secret JWT (chưa dùng) |
| `CORS_ORIGINS` | Whitelist CORS, phân tách bằng dấu phẩy |
| `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` | VNPay (chưa dùng) |

## Ngoài phạm vi phase này

Prisma schema/migration, auth logic, VNPay, Jitsi, Docker Compose, frontend — sẽ làm ở các issue sau.
