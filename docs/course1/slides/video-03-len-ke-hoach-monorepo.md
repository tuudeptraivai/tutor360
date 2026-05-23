---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 3: Lên Kế Hoạch Monorepo'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Lên Kế Hoạch
# Monorepo

### Khóa 1 — Video 3

**pnpm workspaces + Turborepo**

> Cách Google, Meta, Vercel quản lý hàng nghìn project trong 1 repo

---

## Slide 2 — Mục tiêu video này

Sau 18 phút, bạn sẽ:

- ✅ Hiểu **monorepo là gì**, khác polyrepo thế nào
- ✅ Biết **vì sao chọn monorepo** cho dự án AI LMS
- ✅ Nắm **cấu trúc thư mục** `apps/` + `packages/`
- ✅ Hiểu **pnpm workspaces** hoạt động ra sao
- ✅ Biết **Turborepo** giúp gì (và khi nào cần)
- ✅ Thiết kế **quy ước đặt tên package** chuẩn

> 🎯 Cuối video: bạn có sẵn bản thiết kế thư mục để gõ ở Video 4

---

## Slide 3 — Monorepo là gì?

### Định nghĩa đơn giản

**Monorepo** = nhiều project trong **1 Git repository duy nhất**

```
my-monorepo/
├── apps/
│   ├── api/          ← Backend NestJS
│   ├── web/          ← Frontend Next.js
│   └── mobile/       ← React Native
└── packages/
    ├── types/        ← Shared types
    ├── ui/           ← Component library
    └── config/       ← Shared utils
```

**Polyrepo** = mỗi project 1 repo riêng (`api-repo`, `web-repo`, `types-repo`...)

---

## Slide 4 — Ai dùng monorepo?

### Big tech và open source nổi tiếng

🏢 **Big tech:**

- **Google** — 1 repo cho ~2 tỷ dòng code (!)
- **Meta** — Buck + Mercurial monorepo
- **Microsoft** — toàn bộ Windows codebase
- **Uber** — Go monorepo cho microservices

📦 **Open source nổi tiếng:**

- **Next.js** (Vercel) — Turborepo
- **React** — Yarn workspaces
- **NestJS** — Lerna
- **Babel** — Lerna
- **Vue** — pnpm workspaces

> 💡 Nếu monorepo đủ tốt cho Google, chắc chắn đủ tốt cho LMS của bạn

---

## Slide 5 — Polyrepo: Vấn đề thực tế

### Ngày làm việc với polyrepo

```
🌅 9:00  - Clone api-repo, web-repo, types-repo
🕐 9:30  - Pull update cả 3 repo
🕑 10:00 - Sửa type ở types-repo
🕒 10:15 - Bump version, npm publish
🕓 10:30 - Sang api-repo, npm update @lms/types
🕔 10:45 - Sang web-repo, npm update @lms/types
🕕 11:00 - PR ở 3 repo, chờ 3 review, merge 3 lần
🕖 11:30 - 1 trong 3 PR có conflict → repeat
```

> 😩 Đổi 1 dòng type = nửa ngày coordination

---

## Slide 6 — Monorepo: Cùng tình huống

### Ngày làm việc với monorepo

```
🌅 9:00  - Clone 1 repo
🕐 9:05  - Sửa type ở packages/types/
🕑 9:06  - api/ và web/ thấy ngay (cùng commit)
🕒 9:10  - 1 PR duy nhất, 1 review, 1 merge
🕓 9:15  - ✅ Done
```

> 🎉 Đổi 1 dòng type = 15 phút

---

## Slide 7 — Monorepo: Lợi ích cụ thể

### 5 lợi ích quan trọng nhất

| # | Lợi ích | Vì sao quan trọng |
|---|---------|-------------------|
| 1 | **Atomic commits** | Đổi type + UI + API trong 1 PR |
| 2 | **No version hell** | Không cần publish + bump version |
| 3 | **Shared tooling** | 1 ESLint config, 1 tsconfig.base |
| 4 | **Refactor dễ** | Đổi tên function → 1 grep ra hết |
| 5 | **Code reuse** | `@lms/types` dùng được mọi nơi |

---

## Slide 8 — Monorepo: Nhược điểm cần biết

### Trung thực: không phải hoàn hảo

⚠️ **Repo to dần theo thời gian**
→ Clone chậm, IDE indexing lâu (~1GB+ sau vài năm)

⚠️ **CI/CD phức tạp hơn**
→ Cần chạy test chỉ cho phần thay đổi (Turborepo giải quyết)

⚠️ **Permission khó scope**
→ Không thể "team A chỉ access folder X" (cho team nhỏ thì OK)

⚠️ **Lock-in tooling**
→ Đổi từ pnpm → npm rất tốn công

> 💡 Với dự án LMS 1-5 người: **lợi ích >> nhược điểm**

---

## Slide 9 — Vì sao chọn monorepo cho AI LMS?

### 4 lý do then chốt

**1. Shared types Backend ↔ Frontend**
`Course`, `User`, `Quiz` schema dùng chung — đổi 1 nơi, áp dụng mọi nơi

**2. Tooling đồng nhất**
1 ESLint config, 1 Prettier config, 1 TypeScript base — không drift

**3. Refactor toàn dự án dễ**
Đổi tên `Lesson.title` → `Lesson.heading`: 1 grep ra mọi nơi

**4. Onboarding nhanh**
Dev mới clone 1 repo, chạy `pnpm install` → có cả backend, frontend

---

## Slide 10 — Cấu trúc thư mục: Bức tranh đầy đủ

```
ai-lms/
├── apps/                       ← APPLICATIONS
│   ├── api/                    ← Backend NestJS (Khóa 1)
│   └── web/                    ← Frontend Next.js (Khóa 4)
│
├── packages/                   ← SHARED PACKAGES
│   ├── types/                  ← Domain types + Zod schemas
│   ├── config/                 ← env, pMap, retry, streams
│   └── eslint-config/          ← ESLint preset dùng chung
│
├── pnpm-workspace.yaml         ← Khai báo workspace
├── package.json                ← Root, chứa scripts orchestrate
├── tsconfig.base.json          ← TS config gốc, mọi package extends
├── .gitignore
├── .nvmrc
├── CLAUDE.md                   ← Hướng dẫn cho Claude Code
└── README.md
```

---

## Slide 11 — apps/ vs packages/: Khác nhau gì?

### Quy ước phổ biến trong cộng đồng

| | `apps/` | `packages/` |
|---|---------|-------------|
| **Là gì?** | Ứng dụng deploy được | Library dùng chung |
| **Có entry point?** | ✅ `pnpm dev`, listen port | ❌ Không tự chạy |
| **Build output?** | Docker image, dist | npm package, dist |
| **Phụ thuộc** | Dùng packages | Dùng packages khác |
| **Ví dụ** | `api`, `web`, `mobile` | `types`, `ui`, `utils` |

> 🎯 Quy tắc đơn giản: **chạy độc lập → apps/, dùng để import → packages/**

---

## Slide 12 — Quy ước đặt tên package

### Pattern: `@<scope>/<name>`

```json
// packages/types/package.json
{ "name": "@lms/types" }

// packages/config/package.json
{ "name": "@lms/config" }

// apps/api/package.json
{ "name": "@lms/api" }

// apps/web/package.json (Khóa 4)
{ "name": "@lms/web" }
```

**Vì sao có scope `@lms/`?**

- ✅ Tránh đụng tên với npm package public
- ✅ Dễ tìm: tất cả internal package bắt đầu `@lms/`
- ✅ Sau này publish private cũng dễ (npm scope)

---

## Slide 13 — pnpm là gì? Vì sao không dùng npm?

### So sánh 3 package manager

| | **npm** | **yarn** | **pnpm** ✅ |
|---|---------|----------|-------------|
| Tốc độ install | Chậm | Trung bình | **Nhanh nhất** |
| Disk usage | Lặp nhiều | Lặp nhiều | **Hardlink, tiết kiệm** |
| Workspace support | ✓ (npm 7+) | ✓ | ✅ **Tốt nhất** |
| Strict by default | ❌ | ❌ | ✅ |
| Monorepo-friendly | ⚠️ | ✓ | ✅✅ |

**pnpm = "performant npm"** — content-addressable store, mỗi package chỉ tải 1 lần trên cả máy.

> 💾 Tiết kiệm 50-80% disk so với npm

---

## Slide 14 — pnpm Workspaces hoạt động thế nào?

### File `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**pnpm tự động:**

- 🔍 Scan tất cả folder trong `apps/` và `packages/`
- 🔗 Symlink các package nội bộ vào `node_modules`
- 📦 Cài external dependencies 1 lần ở root store
- 🚀 Cho phép cross-package import ngay lập tức

**Ví dụ:**

```typescript
// apps/api/src/main.ts
import { CourseSchema } from "@lms/types";  // ← resolve tự động
```

---

## Slide 15 — Cross-package dependency

### Khai báo dependency giữa packages

```json
// apps/api/package.json
{
  "name": "@lms/api",
  "dependencies": {
    "@lms/types": "workspace:*",
    "@lms/config": "workspace:*",
    "@nestjs/common": "^10.0.0"
  }
}
```

**Từ khoá `workspace:*`** = "lấy version mới nhất trong workspace"

→ Không cần publish, không cần version number

→ Sửa `packages/types` → `apps/api` thấy ngay

---

## Slide 16 — Scripts ở root package.json

### Orchestrate tất cả packages

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel run dev",
    "build": "pnpm -r run build",
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "verify": "pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

**Flag `-r` (recursive):**

- Chạy script ở tất cả workspace package
- `--parallel`: chạy song song (cho dev mode)
- Mặc định: chạy theo topological order (build dependency trước)

---

## Slide 17 — Turborepo là gì?

### Build system trên đầu pnpm workspace

**Vấn đề pnpm chưa giải quyết:**

- ❌ Mỗi lần `pnpm build` → build LẠI mọi package
- ❌ Chạy test toàn bộ kể cả khi chỉ đổi 1 file
- ❌ CI chậm vì không nhớ "cái này đã build rồi"

**Turborepo giải quyết bằng:**

- ✅ **Incremental build** — chỉ build cái thay đổi
- ✅ **Remote cache** — share cache giữa devs và CI
- ✅ **Pipeline** — định nghĩa thứ tự task chạy
- ✅ **Parallelism** — auto chạy song song khi có thể

---

## Slide 18 — Turborepo: Có cần ở Khóa 1?

### Câu trả lời thẳng: KHÔNG

**Khóa 1 chỉ có ~2 package** → `pnpm -r run build` đã đủ nhanh

**Khi nào nên thêm Turborepo?**

- 📈 Khi có ≥ 5 packages
- ⏱️ Khi `pnpm build` mất > 30 giây
- 🚀 Khi setup CI và muốn cache build
- 👥 Khi có team > 3 người

> 💡 Khóa này **chuẩn bị sẵn cấu trúc** để thêm Turborepo sau, không cài ngay

---

## Slide 19 — Cấu trúc Khóa 1 cụ thể

```
ai-lms/
├── apps/
│   └── api/                        ← DUY NHẤT trong Khóa 1
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── modules/
│       │   │   ├── health/
│       │   │   └── courses/
│       │   ├── common/
│       │   │   ├── filters/
│       │   │   ├── interceptors/
│       │   │   ├── middleware/
│       │   │   ├── pipes/
│       │   │   └── errors/
│       │   └── demos/              ← event-loop, streams
│       └── nest-cli.json
│
├── packages/
│   ├── types/                      ← Zod schemas
│   ├── config/                     ← env, utils
│   └── eslint-config/              ← Shared ESLint
```

---

## Slide 20 — Monorepo-ready cho Khóa 4

### Tại sao thiết kế như vậy?

`pnpm-workspace.yaml` đã khai báo `apps/*`:

```yaml
packages:
  - "apps/*"      ← Khóa 4 chỉ cần add folder
  - "packages/*"
```

**Khi Khóa 4 thêm frontend:**

```bash
pnpm create next-app apps/web --ts --app
```

→ **Plug-in ngay, không cần sửa root config!**

→ `apps/web` tự động:
- Thấy `@lms/types`
- Dùng chung ESLint config
- Tham gia `pnpm verify`

> 🎯 Đây là sức mạnh thật của workspace setup tốt

---

## Slide 21 — Anti-pattern cần tránh

### Đừng làm những điều này

❌ **Đặt mọi thứ flat trong root**
```
src/api.ts, src/web.ts, src/types.ts
```
→ Không scale được

❌ **Hardcode version giữa packages**
```json
"@lms/types": "^0.1.0"  // KHÔNG → dùng "workspace:*"
```

❌ **Mỗi package có tsconfig.json riêng từ đầu**
→ Drift config → dùng `extends: tsconfig.base.json`

❌ **Tạo packages/utils chứa mọi thứ**
→ "Utils" trở thành dumping ground → tách theo concern

---

## Slide 22 — Best practice từ kinh nghiệm thật

### 5 nguyên tắc vàng

**1. Một package = một concern rõ ràng**
`@lms/types` chỉ chứa types, không chứa logic

**2. Dependencies hướng từ apps → packages**
KHÔNG có chiều ngược (`@lms/types` không import từ `@lms/api`)

**3. Tránh "god package"**
Tách `@lms/utils` thành `@lms/config`, `@lms/format`, `@lms/validation`

**4. Cùng version Node, cùng version TS toàn repo**
`.nvmrc` ở root + `tsconfig.base.json`

**5. Document trong README.md mỗi package**
"Package này dùng để làm gì, ai dùng nó"

---

## Slide 23 — Checklist trước khi sang Video 4

### Bạn đã hiểu rõ?

- [ ] Monorepo khác polyrepo thế nào
- [ ] Vì sao chọn monorepo cho LMS
- [ ] Khác nhau `apps/` vs `packages/`
- [ ] Cách `pnpm-workspace.yaml` hoạt động
- [ ] Ý nghĩa `workspace:*` trong dependencies
- [ ] Quy ước đặt tên `@lms/<name>`
- [ ] Turborepo là gì, khi nào cần
- [ ] Cấu trúc thư mục Khóa 1 sẽ trông thế nào

> ✅ Nếu hết 8/8 → sẵn sàng cho Video 4!

---

## Slide 24 — Bài tập tự luyện

### 🎯 Trước khi xem Video 4

**Bài 1:** Tự vẽ cấu trúc thư mục cho 1 app khác bạn đang nghĩ (vd: Shopify clone)

- Phân biệt `apps/` vs `packages/`
- Đặt tên packages theo quy ước `@<scope>/<name>`

**Bài 2:** Tìm hiểu thêm

- Đọc [pnpm.io/workspaces](https://pnpm.io/workspaces) — 10 phút
- Xem `package.json` của Next.js trên GitHub
- So sánh với cấu trúc Vercel monorepo

**Bài 3:** Cài đặt sẵn (chuẩn bị cho Video 4)

- Cài `nvm` lên máy
- Cài Git nếu chưa có

---

<!-- _class: lead -->

# Tiếp theo: Video 4

## Thiết Lập Môi Trường Phát Triển

Cài Node.js 20 LTS qua nvm, cài pnpm 9, cấu hình VSCode, tạo `.nvmrc` + `.editorconfig` + `.gitignore`, init Git và commit đầu tiên.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 4 🚀

> *"Make it work, make it right, make it fast."*
> *— Kent Beck*
