---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 64: Final Review — API.md + ERD Recap'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Final Review
# API.md + ERD Recap

### Khóa 2-3 — Video 64

**Auto-gen docs · pnpm verify · Wrap-up**

> Ready to ship: docs + tests + verify pass

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Setup Swagger UI tại `/api/docs`
- ✅ Auto-gen `API.md` từ OpenAPI spec
- ✅ ERD recap visualize
- ✅ Test coverage check >= 70% service
- ✅ `pnpm verify` workflow
- ✅ Git tag `course-2-3-complete`

> 🎯 Cuối video: project ready cho C4 frontend.

---

## Slide 3 — Swagger setup full

```ts
// main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

if (process.env.NODE_ENV !== 'production') {
  const config = new DocumentBuilder()
    .setTitle('Tutor365 API')
    .setDescription('Backend cho marketplace + live tutoring')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', 'Authentication & user management')
    .addTag('courses', 'Course marketplace')
    .addTag('bookings', 'Live tutoring booking')
    .addTag('payments', 'VNPay integration')
    .addTag('admin', 'Hanah admin endpoints')
    .build();

  const doc = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (ctrl, method) => method,
  });

  SwaggerModule.setup('api/docs', app, doc, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Write to file for git
  writeFileSync('docs/openapi.json', JSON.stringify(doc, null, 2));
}
```

---

## Slide 4 — Decorate controllers

```ts
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('courses')
@Controller({ path: 'courses', version: '1' })
export class CoursesController {

  @ApiOperation({ summary: 'List published courses (public)' })
  @ApiResponse({ status: 200, description: 'List of courses' })
  @Public()
  @Get()
  list(@ZodQuery(ListCoursesQuery) q) {}

  @ApiOperation({ summary: 'Create course (tutor only)' })
  @ApiBearerAuth('access-token')
  @ApiBody({ schema: { /* ZodToOpenApi */ } })
  @Auth('tutor')
  @Post()
  create(@ZodBody(CreateCourseDto) body) {}
}
```

---

## Slide 5 — Zod → OpenAPI

### Convert Zod schema to OpenAPI

```bash
pnpm add @anatine/zod-openapi
```

```ts
import { generateSchema } from '@anatine/zod-openapi';

@ApiBody({ schema: generateSchema(CreateCourseDto) })
```

> 💡 Một schema cho cả runtime validation + docs.

---

## Slide 6 — Auto-gen API.md

```ts
// scripts/gen-api-md.ts
import { readFileSync, writeFileSync } from 'fs';

const openapi = JSON.parse(readFileSync('docs/openapi.json', 'utf-8'));

let md = `# Tutor365 API\n\nGenerated from OpenAPI spec.\n\n`;
md += `## Base URL\n\n\`http://localhost:3000/v1\`\n\n`;

for (const tag of openapi.tags) {
  md += `## ${tag.name}\n${tag.description ?? ''}\n\n`;
}

for (const [path, methods] of Object.entries(openapi.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    md += `### ${method.toUpperCase()} ${path}\n\n`;
    md += `${op.summary}\n\n`;
    md += `**Tags:** ${op.tags.join(', ')}\n\n`;
    if (op.security) {
      md += `**Auth required**\n\n`;
    }
    md += `**Response:** ${op.responses['200']?.description ?? 'OK'}\n\n---\n\n`;
  }
}

writeFileSync('docs/API.md', md);
console.log('✅ docs/API.md generated');
```

---

## Slide 7 — ERD visualization

### Generate diagram từ Prisma

```bash
pnpm add -D prisma-erd-generator
```

```prisma
generator erd {
  provider = "prisma-erd-generator"
  output   = "../docs/erd.svg"
  theme    = "neutral"
}
```

```bash
prisma generate
# → docs/erd.svg created
```

> 💡 SVG embedded vào README.

---

## Slide 8 — pnpm verify script

```json
// package.json
{
  "scripts": {
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "test:e2e": "pnpm --filter @tutor365/api run test:e2e",
    "build": "pnpm -r run build",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

```bash
pnpm verify
# → If exit 0, ship-ready
```

---

## Slide 9 — Test coverage check

```bash
pnpm --filter @tutor365/api test --coverage

# Output:
# All files                | 78.5 |    72.1 |   76.8 |  78.3
# modules/courses          | 92.3 |    88.2 |   91.5 |  92.1
# modules/auth             | 85.0 |    81.4 |   84.2 |  84.8
# modules/bookings         | 78.6 |    72.1 |   76.8 |  78.3
# ...

# Threshold check in vitest.config:
coverage: {
  thresholds: { lines: 70, functions: 70, branches: 65 }
}
```

---

## Slide 10 — Deliverables checklist

| Item | Status | Verified |
|------|--------|----------|
| Auth signup + verify + login + refresh + RBAC | ✅ | V06-V09 |
| Course marketplace + chapter + lesson + upload | ✅ | V16-V19 |
| Course approval workflow | ✅ | V20 |
| Enrollment + progress + review | ✅ | V21-V23 |
| Tutor availability + booking + assign | ✅ | V24-V32 |
| Jitsi meeting + attendance + cron | ✅ | V33-V34 |
| Calendar feed + iCal | ✅ | V35-V37 |
| VNPay sandbox flow E2E | ✅ | V38-V41 |
| Order state + idempotency | ✅ | V42-V43 |
| Tutor payouts | ✅ | V44-V46 |
| Notifications | ✅ | V47 |
| PG schema 20+ tables, indexes | ✅ | V48-V51 |
| SQL mastery | ✅ | V52-V55 |
| Prisma migrations + seeders | ✅ | V56-V58 |
| Optimization | ✅ | V59-V61 |
| Concurrency | ✅ | V62-V63 |
| Swagger + API.md | ✅ | This video |
| Test coverage >= 70% | ✅ | This video |
| `pnpm verify` exit 0 | ✅ | This video |
| Git tag `course-2-3-complete` | ✅ | Coming |

---

## Slide 11 — README structure

```markdown
# Tutor365 Backend (Course 2-3)

NestJS + PostgreSQL backend cho marketplace khóa học + live tutoring.

## Quick start

\`\`\`bash
docker-compose up -d   # postgres + mailpit + minio
pnpm install
pnpm --filter @tutor365/api prisma migrate dev
pnpm --filter @tutor365/api prisma db seed
pnpm dev
\`\`\`

## Endpoints

See [API.md](docs/API.md) hoặc Swagger UI: <http://localhost:3000/api/docs>

## Database

See [ERD](docs/erd.svg) hoặc `prisma/schema.prisma`.

## Test

\`\`\`bash
pnpm verify    # lint + typecheck + test + build
\`\`\`

## Architecture

- 14 modules (auth, courses, bookings, ...)
- Prisma 5 + PostgreSQL 16
- JWT auth + RBAC 3 roles
- Jitsi Meet (public meet.jit.si)
- VNPay sandbox
- iCal feed (subscribe Google/Apple Calendar)
```

---

## Slide 12 — CI/CD basic

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: tutor365
          POSTGRES_PASSWORD: tutor365
          POSTGRES_DB: tutor365_test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm --filter @tutor365/api prisma migrate deploy
        env: { DATABASE_URL: postgresql://tutor365:tutor365@localhost:5432/tutor365_test }
      - run: pnpm verify
```

> 💡 C8 deployment khoá riêng deep dive.

---

## Slide 13 — Documentation structure

```
docs/
├── README.md
├── API.md                       (auto-gen)
├── openapi.json                 (auto-gen)
├── erd.svg                      (auto-gen)
├── planK23.md                   (original spec)
├── khoa-hoc-2-3-vi.md           (overview)
└── slides/                      (this directory)
    ├── video-01-...
    └── ...
```

---

## Slide 14 — Git tag

```bash
# After all tests pass
git add .
git commit -m "feat(course-2-3): complete Tutor365 backend"

git tag -a course-2-3-complete -m "Tutor365 backend ready"
git push origin course-2-3-complete

# Tag verify
git show course-2-3-complete
```

---

## Slide 15 — Performance benchmark

### Baseline cho production planning

```
Test 1: GET /courses (cached subjects, indexed)
  → p50: 12ms, p95: 35ms, p99: 80ms

Test 2: POST /courses/:id/buy (transaction)
  → p50: 50ms, p95: 120ms, p99: 250ms

Test 3: Hanah assign endpoint
  → p50: 80ms (with eligibility re-check + EXCLUDE), p95: 200ms

Test 4: VNPay IPN webhook (full transaction)
  → p50: 150ms, p95: 350ms, p99: 800ms

Acceptable for MVP (10-50 RPS). C6 + C8 scale to 1000 RPS.
```

---

## Slide 16 — Section 22 next

✅ V64 — API.md + ERD recap

Còn V65 (Demo E2E) — closing.

---

## Slide 17 — Common shipping issues

| Issue | Fix |
|-------|-----|
| Lint fail unused var | `_` prefix or remove |
| Test fail in CI but not local | Env var difference, test isolation |
| Build fail TypeScript strict | Type narrowing |
| Migration drift | `prisma migrate status` reset dev |
| Coverage below threshold | Add tests for uncovered branches |
| Swagger schema not generating | Check decorator order |

---

## Slide 18 — Production readiness checklist (preview C8)

- [ ] Env vars validated via Zod
- [ ] CORS whitelist
- [ ] Rate limit configured
- [ ] Helmet enabled
- [ ] Health endpoint
- [ ] Graceful shutdown
- [ ] Logger structured JSON
- [ ] Audit logs comprehensive
- [ ] Error tracking (Sentry) — C8
- [ ] Monitoring (Prometheus + Grafana) — C8
- [ ] Backup strategy — C8
- [ ] Docker image — C8
- [ ] CI/CD — C8

---

## Slide 19 — Bài tập thực hành

### 🎯 Final wrap

**Bài 1:** Setup Swagger UI + decorate 5 controller chính.

**Bài 2:** Script gen API.md từ openapi.json.

**Bài 3:** Generate ERD.svg từ Prisma.

**Bài 4:** Run `pnpm verify` exit 0.

**Bài 5:** Check test coverage >= 70%.

**Bài 6:** Update README đầy đủ.

**Bài 7:** Git tag `course-2-3-complete`.

---

## Slide 20 — Tổng kết Video 64

### Bạn vừa wrap-up

- ✅ Swagger UI tại `/api/docs`
- ✅ Auto-gen API.md từ OpenAPI
- ✅ ERD.svg từ Prisma
- ✅ `pnpm verify` workflow
- ✅ Test coverage >= 70%
- ✅ README structure
- ✅ CI basic
- ✅ Performance benchmark baseline
- ✅ Git tag

> 💪 Project ready for handover hoặc C4 frontend

---

<!-- _class: lead -->

# Tiếp theo: Video 65 (CUỐI CÙNG!)

## Demo End-to-End

Student mua course + book combo + Hanah assign + Tutor dạy Jitsi + Payout.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 65 — Demo Cuối! 🚀

> *"Documentation is the silent gift to your future self."*
