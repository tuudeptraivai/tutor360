---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 10: Admin CRUD User + Block/Unblock'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Admin CRUD User
# + Block / Unblock

### Khóa 2-3 — Video 10

**Hanah quản lý 3 loại user**

> User management = bộ mặt admin của hệ thống

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Implement **`GET /v1/admin/users`** list filter + pagination
- ✅ Implement **`GET /v1/admin/users/:id`** detail kèm profile
- ✅ Implement **`POST /v1/admin/users/:id/block`** + `unblock`
- ✅ Implement **`POST /v1/admin/users`** Hanah tạo Admin/Tutor/Student
- ✅ Filter theo **role**, **status**, **search by name/email**
- ✅ Audit log mọi action block/unblock
- ✅ Side-effect: block → revoke refresh token

> 🎯 Cuối video: Hanah dashboard quản lý 100+ user mượt

---

## Slide 3 — Endpoint mapping

| Method | Path | Role |
|--------|------|------|
| GET | `/v1/admin/users` | admin |
| GET | `/v1/admin/users/:id` | admin |
| POST | `/v1/admin/users` | admin |
| PATCH | `/v1/admin/users/:id` | admin |
| POST | `/v1/admin/users/:id/block` | admin |
| POST | `/v1/admin/users/:id/unblock` | admin |
| GET | `/v1/me` | mọi role |
| PATCH | `/v1/me` | mọi role (sửa profile mình) |

---

## Slide 4 — List query DTO

```ts
// modules/users/dto/list-users.query.ts
export const ListUsersQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),       // search name/email
  role: z.enum(['admin', 'tutor', 'student', 'all']).default('all'),
  status: z.enum(['pending_verify', 'active', 'blocked', 'all']).default('all'),
  sort: z.enum(['newest', 'oldest', 'email_asc', 'email_desc']).default('newest'),
});
export type ListUsersQueryInput = z.infer<typeof ListUsersQuery>;
```

---

## Slide 5 — Repository: findMany với filter

```ts
// modules/users/repositories/prisma.repository.ts
async findMany(q: ListUsersQueryInput) {
  const where: Prisma.UserWhereInput = {};
  if (q.role !== 'all') where.role = q.role;
  if (q.status !== 'all') where.status = q.status;
  if (q.q) {
    where.OR = [
      { email: { contains: q.q, mode: 'insensitive' } },
      { fullName: { contains: q.q, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.UserOrderByWithRelationInput = {
    newest: { createdAt: 'desc' },
    oldest: { createdAt: 'asc' },
    email_asc: { email: 'asc' },
    email_desc: { email: 'desc' },
  }[q.sort];

  const [items, total] = await this.prisma.$transaction([
    this.prisma.user.findMany({
      where, orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    this.prisma.user.count({ where }),
  ]);
  return { items, total };
}
```

---

## Slide 6 — Controller list

```ts
// modules/users/users.controller.ts
@Controller({ path: 'admin/users', version: '1' })
@AdminOnly()
export class AdminUsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@ZodQuery(ListUsersQuery) q: ListUsersQueryInput) {
    return this.users.list(q);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @Post(':id/block')
  block(@Param('id') id: string, @CurrentUser('sub') adminId: string,
        @ZodBody(BlockDto) body: BlockInput) {
    return this.users.block(id, adminId, body.reason);
  }

  @Post(':id/unblock')
  unblock(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.users.unblock(id, adminId);
  }
}
```

---

## Slide 7 — Detail endpoint: kèm profile

```ts
// users.service.ts
async detail(id: string) {
  const user = await this.prisma.user.findUnique({
    where: { id },
    include: {
      tutorProfile: true,        // 1:1 nếu role = tutor
      studentProfile: true,      // 1:1 nếu role = student
    },
  });
  if (!user) throw new NotFoundException();
  return toAdminUserDetail(user);
}
```

**Mapper:**

```ts
export function toAdminUserDetail(u: UserWithProfiles) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
    phone: u.phone,
    country: u.country,
    emailVerifiedAt: u.emailVerifiedAt,
    createdAt: u.createdAt,
    tutorProfile: u.tutorProfile ? toTutorProfile(u.tutorProfile) : null,
    studentProfile: u.studentProfile ? toStudentProfile(u.studentProfile) : null,
  };
}
```

---

## Slide 8 — Block: side effect kéo theo

### Block không phải chỉ update status

```ts
async block(userId: string, adminId: string, reason: string) {
  if (adminId === userId) {
    throw new BadRequestException('Không thể tự block chính mình');
  }

  const user = await this.findById(userId);
  if (user.role === 'admin') {
    throw new ForbiddenException('Không được block admin khác');
  }

  await this.prisma.$transaction([
    // 1. Update status
    this.prisma.user.update({
      where: { id: userId },
      data: { status: 'blocked' },
    }),
    // 2. Revoke tất cả refresh token
    this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  // 3. Audit log
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'user.block',
    entityType: 'user',
    entityId: userId,
    metadata: { reason },
  });

  // 4. Notify user (email)
  await this.mailer.sendBlockNotification(user.email, reason);
}
```

---

## Slide 9 — Block DTO

```ts
// dto/block.dto.ts
export const BlockDto = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type BlockInput = z.infer<typeof BlockDto>;
```

> 💡 **Bắt buộc lý do block** — cho compliance + audit.

**Unblock không cần reason** (rare action, log là đủ).

---

## Slide 10 — Tạo user bằng Hanah

### Endpoint `POST /v1/admin/users`

**Khác signup public:**

- Không cần verify email (Hanah tạo trực tiếp `active`)
- Chọn được `role` = admin/tutor/student
- Set password tạm thời → email gửi cho user

```ts
async createByAdmin(input: CreateUserInput, adminId: string) {
  const tempPassword = randomBytes(8).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await this.prisma.user.create({
    data: {
      ...input,
      passwordHash,
      status: 'active',                  // direct active
      emailVerifiedAt: new Date(),
    },
  });

  await this.mailer.sendWelcomeWithTempPassword(user.email, tempPassword);
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'user.create_by_admin',
    entityId: user.id,
    metadata: { role: user.role },
  });

  return toPublicUser(user);
}
```

---

## Slide 11 — `/v1/me` endpoint

### User xem profile mình

```ts
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private users: UsersService) {}

  @Get()
  me(@CurrentUser() jwt: JwtPayload) {
    return this.users.detail(jwt.sub);
  }

  @Patch()
  update(
    @CurrentUser('sub') id: string,
    @ZodBody(UpdateMeDto) body: UpdateMeInput,
  ) {
    return this.users.updateOwn(id, body);
  }
}
```

**DTO chỉ cho phép sửa field an toàn:**

```ts
export const UpdateMeDto = z.object({
  fullName: z.string().min(2).max(80).optional(),
  phone: z.string().regex(/^\+?[0-9]{9,14}$/).optional(),
  country: z.string().length(2).optional(),
});
// ❌ KHÔNG cho user tự sửa role, status, email
```

---

## Slide 12 — Đổi email: 2 bước

### Email là identifier quan trọng

```ts
@Post('change-email')
async changeEmail(
  @CurrentUser('sub') id: string,
  @ZodBody(ChangeEmailDto) body,
) {
  return this.users.requestEmailChange(id, body.newEmail);
}

// Service
async requestEmailChange(userId: string, newEmail: string) {
  // 1. Kiểm tra newEmail chưa được dùng
  const exists = await this.findByEmail(newEmail);
  if (exists) return { ok: true };       // generic (enumeration prevention)

  // 2. Sinh token verify → gửi email mới
  const { raw, hash } = generateVerifyToken();
  await this.emailChangeRequests.create({
    userId,
    newEmail,
    tokenHash: hash,
    expiresAt: addHours(new Date(), 24),
  });
  await this.mailer.sendChangeEmailConfirm(newEmail, raw);
  return { ok: true };
}
```

**Confirm endpoint:** verify token → set `user.email = newEmail`.

---

## Slide 13 — Đổi password

```ts
@Post('change-password')
async changePassword(
  @CurrentUser('sub') id: string,
  @ZodBody(ChangePasswordDto) body,
) {
  await this.users.changePassword(id, body.current, body.new);
  // Side effect: revoke all refresh tokens → logout all devices
  await this.refreshTokens.revokeAllForUser(id);
  return { ok: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' };
}

// Service
async changePassword(id: string, current: string, newPw: string) {
  const user = await this.findById(id);
  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) throw new UnauthorizedException('Mật khẩu hiện tại sai');

  const newHash = await bcrypt.hash(newPw, 12);
  await this.prisma.user.update({
    where: { id },
    data: { passwordHash: newHash },
  });
  await this.auditLog.record({ actorUserId: id, action: 'user.password_change' });
}
```

---

## Slide 14 — List sort + pagination response

```ts
// Response shape thống nhất
type PageResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Service
async list(q: ListUsersQueryInput) {
  const { items, total } = await this.repo.findMany(q);
  return {
    items: items.map(toAdminUserListItem),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.ceil(total / q.pageSize),
  };
}
```

---

## Slide 15 — Search performance: index `LOWER(email)`

### Postgres index cho ILIKE

```sql
-- Section 20 chi tiết
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
CREATE INDEX idx_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops);
-- pg_trgm extension cho fuzzy search
```

**Prisma query:**

```ts
where.OR = [
  { email: { contains: q.q, mode: 'insensitive' } },  // ILIKE
  { fullName: { contains: q.q, mode: 'insensitive' } },
];
```

> 💡 Index trigram → tìm "tu" match "Tu Nguyen", "Anh Tu", "Tutorial".

---

## Slide 16 — Test curl matrix

```bash
ADMIN=$(curl -s -X POST /v1/auth/login -d '...' | jq -r .accessToken)

# List
curl /v1/admin/users -H "Authorization: Bearer $ADMIN"

# Filter
curl '/v1/admin/users?role=tutor&status=active&page=1&pageSize=10' \
  -H "Authorization: Bearer $ADMIN"

# Search
curl '/v1/admin/users?q=tu' -H "Authorization: Bearer $ADMIN"

# Detail
curl /v1/admin/users/u-uuid -H "Authorization: Bearer $ADMIN"

# Block
curl -X POST /v1/admin/users/u-1/block \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"reason":"Spam khoá học chất lượng kém"}'

# Verify side-effect: user blocked không login được
curl -X POST /v1/auth/login -d '{"email":"u-1@x.com","password":"..."}'
# 403 — Tài khoản đã bị khoá

# Verify refresh revoked
curl -X POST /v1/auth/refresh -d '{"refreshToken":"<old>"}'
# 401

# Unblock
curl -X POST /v1/admin/users/u-1/unblock \
  -H "Authorization: Bearer $ADMIN"
```

---

## Slide 17 — Audit log query: ai làm gì khi nào

```ts
@AdminOnly()
@Get('admin/audit-logs')
async listAuditLogs(@ZodQuery(ListAuditQuery) q) {
  return this.auditLog.list(q);
}

// Query schema
const ListAuditQuery = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().max(100).default(50),
  actorUserId: z.string().uuid().optional(),
  action: z.string().optional(),     // 'user.block', 'course.approve'
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
```

---

## Slide 18 — Anti-patterns

```ts
// ❌ Cho user tự đổi role
PATCH /me { role: 'admin' }  // → block field này ở DTO

// ❌ Block user không revoke session
// → User dùng access token TTL 15 phút tiếp tục browse → bypass

// ❌ Trả password hash trong API
return user;   // có passwordHash → leak

// ❌ Không paginate
return prisma.user.findMany();  // 50k user → response 50MB

// ❌ Search case-sensitive
where: { email: { contains: q } }  // không match "Tu" với "tu"

// ❌ Allow block admin khác
// → Compromised account block tất cả admin → lock out

// ❌ Tạo user không gửi email tạm password
// → User không biết login như thế nào
```

---

## Slide 19 — Pagination chuẩn cho admin

### Cursor vs offset

| | Offset (`?page=N`) | Cursor (`?cursor=...`) |
|--|--------------------|------------------------|
| Stable khi insert mới | ❌ duplicate row | ✅ stable |
| Random page jump | ✅ | ❌ chỉ next/prev |
| Total count | ✅ dễ | ⚠️ phải estimate |
| Performance lớn | ⚠️ chậm với OFFSET cao | ✅ dùng index |

**Tutor365 chọn:**

- ✅ **Offset** cho admin dashboard (Hanah cần jump page)
- ✅ **Cursor** cho list infinite scroll (FE C4 — course list, booking list)

---

## Slide 20 — Bài tập thực hành

### 🎯 Admin user management

**Bài 1:** Implement đầy đủ 6 endpoint admin/users.

**Bài 2:** Seed 50 user (10 admin? không — 1 Hanah + 20 tutor + 29 student). Test pagination.

**Bài 3:** Test filter:
- `?role=tutor&status=active` → chỉ tutor active
- `?q=hanah` → tìm tên admin
- `?role=all&status=blocked` → blocked user mọi role

**Bài 4:** Block + verify:
- Refresh token revoked (`SELECT * FROM refresh_tokens WHERE user_id=... AND revoked_at IS NOT NULL`)
- Login fail
- Audit log có row `user.block`

**Bài 5:** Test edge: admin block chính mình → 400. Admin block admin khác → 403.

**Bài 6:** Implement `/v1/me/change-password` + verify auto-logout-all sau khi đổi.

---

## Slide 21 — Tổng kết Video 10

### Bạn vừa học

- ✅ Admin CRUD user 6 endpoint
- ✅ List filter + pagination + search ILIKE
- ✅ Block: update status + revoke refresh + audit + notify
- ✅ Edge case: không tự block, không block admin khác
- ✅ Hanah tạo user trực tiếp (skip verify, set temp password)
- ✅ `/v1/me` cho user tự xem/sửa
- ✅ Change email 2-step verify
- ✅ Change password auto-logout-all
- ✅ Audit log mọi action sensitive

> 💪 Admin layer chuẩn = backend management ready

---

<!-- _class: lead -->

# Tiếp theo: Video 11

## Tutor Profile + Approval Workflow

Tutor khai báo bio, qualification, declared subjects/levels → Hanah review → approve/reject.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 11 🚀

> *"Admin tools are dev tools wearing a tie."*
