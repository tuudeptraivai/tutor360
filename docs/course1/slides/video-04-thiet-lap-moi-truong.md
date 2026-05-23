---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 4: Thiết Lập Môi Trường Phát Triển'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Thiết Lập
# Môi Trường Phát Triển

### Khóa 1 — Video 4

**Node.js + pnpm + VSCode + Git**

> Một môi trường dev tốt = bạn tập trung vào code, không vật lộn với công cụ

---

## Slide 2 — Mục tiêu video này

Sau 20 phút, bạn sẽ có một máy sẵn sàng code:

- ✅ Cài **nvm** để quản lý Node version
- ✅ Cài **Node.js 20 LTS**
- ✅ Cài **pnpm 9**
- ✅ Cấu hình **VSCode** với extensions cần thiết
- ✅ Tạo file `.nvmrc`, `.editorconfig`, `.gitignore`
- ✅ Khởi tạo **Git repository** và commit đầu tiên

> 🎯 Cuối video: gõ `node -v` và `pnpm -v` thấy version đúng

---

## Slide 3 — Checklist trước khi bắt đầu

### Bạn cần có sẵn

- [ ] **Hệ điều hành:** macOS hoặc Windows
- [ ] **Terminal:**
  - macOS: Terminal.app hoặc iTerm2
  - Windows: Windows Terminal hoặc PowerShell
- [ ] **Internet ổn định** để download
- [ ] **Quyền admin** trên máy
- [ ] **~30 phút** thời gian

> 💡 **Lưu ý cho Windows users:** Khóa này dùng **Windows native** (PowerShell + nvm-windows), KHÔNG dùng WSL. Mọi command Windows được hướng dẫn riêng ở slide tương ứng.

---

## Slide 4 — Vì sao cần nvm?

### Vấn đề: Node version conflict

Bạn có 3 project:

- Project A cần Node 16
- Project B cần Node 18
- Project AI LMS cần Node 20

**Không có nvm:**
→ Cài 1 Node global, switch project là phải uninstall → reinstall

**Có nvm:**
```bash
cd project-a && nvm use 16    # tự switch
cd project-b && nvm use 18    # tự switch
cd ai-lms && nvm use 20       # tự switch
```

> 💡 **nvm = node version manager** — bắt buộc với dev Node.js chuyên nghiệp

---

## Slide 5 — Cài đặt nvm (macOS)

### Bước 1: Download và chạy installer

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

### Bước 2: Reload shell

```bash
# zsh (mặc định macOS từ Catalina trở lên)
source ~/.zshrc

# Nếu bạn dùng bash
source ~/.bash_profile
```

### Bước 3: Kiểm tra

```bash
nvm --version
# Output: 0.39.7
```

> ⚠️ Nếu lỗi "command not found" → đóng Terminal hoàn toàn (Cmd+Q), mở lại

---

## Slide 6 — Cài đặt nvm (Windows)

### Dùng nvm-windows (KHÔNG phải nvm gốc của Linux)

**Bước 1:** Download installer từ:
```
github.com/coreybutler/nvm-windows/releases
```
→ Tải file `nvm-setup.exe` ở release mới nhất

**Bước 2:** Chạy `nvm-setup.exe` → next next next

**Bước 3:** Đóng tất cả terminal cũ, mở **Windows Terminal** hoặc **PowerShell** mới (Run as Administrator):

```powershell
nvm version
# Output: 1.1.12
```

> ⚠️ **Quan trọng:** Phải chạy PowerShell với quyền Admin lần đầu để nvm-windows symlink Node executable đúng cách.

---

## Slide 7 — Cài Node.js 20 LTS

### Cài và set làm default

```bash
# Cài Node 20 LTS (Long Term Support)
nvm install 20

# Đặt làm version mặc định
nvm alias default 20

# Kích hoạt cho terminal hiện tại
nvm use 20
```

### Kiểm tra

```bash
node -v
# Output: v20.x.x

npm -v
# Output: 10.x.x
```

> 📌 **Vì sao LTS, không phải latest?**
> LTS được support 30 tháng, ổn định cho production.
> Latest (odd version) chỉ support 6 tháng — chỉ để thử nghiệm.

---

## Slide 8 — Cài pnpm 9

### Chọn cách phù hợp với hệ điều hành

**🍎 macOS — Cách 1: Qua npm (đơn giản nhất)**

```bash
npm install -g pnpm@9
```

**🍎 macOS — Cách 2: Standalone installer**

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

**🪟 Windows — PowerShell**

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

**🍎🪟 Cả hai — Qua Corepack (built-in Node 16+, khuyến nghị)**

```bash
corepack enable
corepack prepare pnpm@9 --activate
```

### Kiểm tra (mọi OS)

```bash
pnpm -v
# Output: 9.x.x
```

---

## Slide 9 — Cấu hình pnpm

### Setup hiệu suất tối ưu

**🍎 macOS:**

```bash
pnpm config set store-dir ~/.pnpm-store
pnpm config set strict-peer-dependencies false
pnpm config set auto-install-peers true
```

**🪟 Windows (PowerShell):**

```powershell
pnpm config set store-dir "$env:LOCALAPPDATA\pnpm-store"
pnpm config set strict-peer-dependencies false
pnpm config set auto-install-peers true
```

**Lưu ý quan trọng:**

- ✅ `strict-peer-dependencies false` cho dự án này (NestJS có conflict)
- ✅ `auto-install-peers true` để khỏi phải add manually
- ⚠️ Trong production library: set `strict-peer-dependencies true`

---

## Slide 10 — VSCode: Cài đặt và setup

### Download và mở

🔗 [code.visualstudio.com](https://code.visualstudio.com)

**Tại sao VSCode?**

- ✅ Free, open source, cross-platform
- ✅ TypeScript first-class support (cùng nhà Microsoft)
- ✅ Marketplace cực đa dạng
- ✅ Tích hợp Git, terminal, debugger
- ✅ Hỗ trợ Claude Code extension

> 💡 Có thể dùng Cursor, JetBrains, Vim — slide này dùng VSCode làm chuẩn

---

## Slide 11 — VSCode Extensions bắt buộc

### Cài 6 extension này trước khi code

| Extension | ID | Dùng để |
|-----------|----|----|
| **ESLint** | `dbaeumer.vscode-eslint` | Lint TS/JS real-time |
| **Prettier** | `esbenp.prettier-vscode` | Format on save |
| **EditorConfig** | `EditorConfig.EditorConfig` | Đồng bộ formatting |
| **GitLens** | `eamodio.gitlens` | Git blame inline |
| **Error Lens** | `usernamehw.errorlens` | Hiện error inline |
| **Pretty TS Errors** | `yoavbls.pretty-ts-errors` | Đọc TS error dễ hơn |

**Cài nhanh qua terminal:**
```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
# ... (lặp cho từng extension)
```

---

## Slide 12 — VSCode Settings — Cài đặt khuyến nghị

### `.vscode/settings.json` ở root project

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/pnpm-lock.yaml": true
  }
}
```

> 💡 Commit file này vào Git → team dev cùng setup giống nhau

---

## Slide 13 — Tạo thư mục dự án

### Cấu trúc tối giản ban đầu

```bash
# Tạo và vào thư mục
mkdir ai-lms && cd ai-lms

# Mở trong VSCode
code .
```

**Trạng thái lúc này:**
```
ai-lms/
└── (trống)
```

> 📌 Tất cả các file ở slide tiếp theo sẽ được tạo **bên trong** thư mục này

---

## Slide 14 — File `.nvmrc`

### Pin Node version cho project

**Tạo file `.nvmrc` ở root:**

```
20
```

**Tại sao?**

- ✅ Dev mới `cd ai-lms && nvm use` → tự dùng đúng Node 20
- ✅ Tránh "works on my machine" do version Node khác nhau
- ✅ CI/CD đọc file này để cài đúng version

**Test thử:**
```bash
nvm use
# Output: Now using node v20.x.x (npm v10.x.x)
```

---

## Slide 15 — File `.editorconfig`

### Đồng bộ formatting cho mọi editor

**Tạo file `.editorconfig` ở root:**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

**Vì sao cần?**

- VSCode, JetBrains, Vim, Sublime — tất cả đều đọc file này
- Một người dùng tab, người dùng space → file `.editorconfig` ép tất cả về 1 chuẩn

---

## Slide 16 — File `.gitignore`

### Không commit những thứ không cần

**Tạo file `.gitignore` ở root:**

```
# Dependencies
node_modules
.pnpm-store

# Build output
dist
build
.next
.turbo

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# IDE / OS
.DS_Store
Thumbs.db
.idea
*.swp

# Test coverage
coverage
.nyc_output
```

---

## Slide 17 — Vì sao mỗi dòng `.gitignore` quan trọng?

### Hậu quả nếu bỏ sót

| Bỏ sót | Hậu quả |
|--------|---------|
| `node_modules` | Repo nặng 500MB+, push chậm, conflict liên tục |
| `.env` | 🚨 **Lộ API key, password — bị hack!** |
| `dist` | Confict liên tục giữa devs (build output khác nhau) |
| `.DS_Store` / `Thumbs.db` | macOS / Windows tự sinh, không liên quan code |
| `*.log` | Log file vô nghĩa làm rối Git history |
| `coverage` | Test coverage report chiếm chỗ không cần thiết |

> ⚠️ **Quy tắc vàng:** Bất cứ thứ gì *generate được* → KHÔNG commit

---

## Slide 18 — File `README.md`

### Mặt tiền của project

**Tạo `README.md` tối thiểu:**

```markdown
# AI LMS

AI-First Learning Management System

## Stack
- Node.js 20 LTS + TypeScript 5.4
- pnpm 9 workspaces
- NestJS 10 (backend)

## Getting Started

\`\`\`bash
nvm use            # đảm bảo đúng Node version
pnpm install       # cài dependencies
pnpm dev           # chạy dev mode
\`\`\`

## Scripts
- `pnpm verify` — lint + typecheck + test
- `pnpm build`  — build all packages
```

> 💡 README tốt = dev mới onboard trong 5 phút

---

## Slide 19 — Khởi tạo Git Repository

### 3 lệnh đầu tiên

```bash
# Khởi tạo Git repo
git init

# Cấu hình user (nếu chưa làm global)
git config user.name "Tên Của Bạn"
git config user.email "email@example.com"

# Đặt branch mặc định là main
git config init.defaultBranch main
git branch -M main
```

### Kiểm tra
```bash
git status
# On branch main
# No commits yet
# Untracked files: .editorconfig, .gitignore, .nvmrc, README.md
```

---

## Slide 20 — Commit đầu tiên

### Conventional Commits format

```bash
# Stage tất cả file
git add .

# Kiểm tra trước khi commit
git status
git diff --cached

# Commit với message chuẩn
git commit -m "chore: initial project setup

- Add .nvmrc pinning Node 20
- Add .editorconfig for consistent formatting
- Add .gitignore for node_modules, dist, .env
- Add README.md with quick start guide"
```

**Conventional Commits prefix:**

- `chore:` — setup, tooling
- `feat:` — feature mới
- `fix:` — bug fix
- `docs:` — chỉ đổi docs
- `refactor:` — đổi code, không đổi behavior

---

## Slide 21 — Kết nối với GitHub (tuỳ chọn)

### Push lên remote repository

**Bước 1:** Tạo repo trên GitHub (KHÔNG init README, .gitignore)

**Bước 2:** Connect local → remote

```bash
git remote add origin git@github.com:username/ai-lms.git
git push -u origin main
```

**Bước 3:** Kiểm tra trên GitHub → thấy 4 file đã push

> 💡 **Khuyến nghị:** Dùng SSH key thay vì HTTPS để không phải gõ password.
> Setup: `ssh-keygen -t ed25519` → add public key vào GitHub Settings

---

## Slide 22 — Kiểm tra toàn bộ setup

### ✅ Checklist cuối cùng

Chạy từng lệnh, đảm bảo output đúng:

```bash
node -v       # → v20.x.x
pnpm -v       # → 9.x.x
nvm current   # → v20.x.x
git --version # → git version 2.x.x
code --version # → 1.x.x
```

**Files đã có trong project:**

```
ai-lms/
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .vscode/
│   └── settings.json
└── README.md
```

---

## Slide 23 — Troubleshooting thường gặp

### 3 lỗi phổ biến + cách fix

**❌ `nvm: command not found`**
→ Đóng terminal, mở lại. Hoặc `source ~/.zshrc`

**❌ `pnpm: command not found`**
→ Kiểm tra `npm config get prefix` có trong PATH chưa.
→ Hoặc reinstall qua `corepack enable && corepack prepare pnpm@9 --activate`

**❌ VSCode không format on save**
→ `Cmd+Shift+P` → "Format Document With..." → set Prettier làm default
→ Check `.vscode/settings.json` có `"editor.formatOnSave": true`

> 💡 99% lỗi setup = PATH issue. Restart terminal trước khi panic.

---

## Slide 24 — Best practice: 1 commit/feature

### Đừng đợi → commit thường xuyên

❌ **Bad:**
```
Day 1: write 500 lines
Day 7: 1 commit "implement everything"
```

✅ **Good:**
```
Day 1: 5 commits
- chore: setup tooling
- feat: add health endpoint
- test: add health controller test
- docs: update README
- refactor: extract config module
```

**Vì sao?**

- ✅ Rollback dễ (revert 1 commit thay vì 500 dòng)
- ✅ Git blame có ý nghĩa
- ✅ Code review nhanh hơn
- ✅ CI chạy nhanh hơn (test ít hơn)

---

## Slide 25 — Bài tập sau video

### 🎯 Củng cố trước khi sang Video 5

**Bài 1:** Setup hoàn chỉnh máy

- [ ] Cài nvm + Node 20 + pnpm 9
- [ ] Cài VSCode + 6 extensions
- [ ] Tạo project `ai-lms` + 4 file config

**Bài 2:** Tạo SSH key và kết nối GitHub

**Bài 3:** Đọc thêm

- Conventional Commits: [conventionalcommits.org](https://www.conventionalcommits.org)
- pnpm settings: [pnpm.io/cli/config](https://pnpm.io/cli/config)

**Bài 4:** Tự explore VSCode

- Học 5 keyboard shortcut hay dùng
- Tìm hiểu Command Palette (`Cmd+Shift+P`)

---

## Slide 26 — Tổng kết Section 1

### Bạn vừa hoàn thành Section 1 — Project Setup 🎉

**4 video đã xem:**

- ✅ Video 1: Chào mừng + lộ trình
- ✅ Video 2: Kiến trúc toàn diện
- ✅ Video 3: Lên kế hoạch monorepo
- ✅ Video 4: Setup môi trường dev

**Bạn có gì rồi:**

- Hiểu dự án xây gì, vì sao
- Có máy sẵn sàng để code
- Git repo với commit đầu tiên

> 🚀 **Tiếp theo: Section 2 — TypeScript Foundations**

---

<!-- _class: lead -->

# Tiếp theo: Video 5

## Cơ Bản Về TypeScript

TypeScript khác JavaScript ở điểm nào, kiểu dữ liệu cơ bản, Type vs Interface, Union types và literal types.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 5 🚀

> *"A good developer environment is invisible.*
> *You don't think about it — it just works."*
