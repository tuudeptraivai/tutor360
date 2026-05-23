---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 9: Role Guard + @Roles Decorator'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Role Guard
# + @Roles Decorator

### Khóa 2-3 — Video 9

**RBAC cho Admin · Tutor · Student**

> Authorization khác Authentication — biết bạn là ai vs cho phép bạn làm gì

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Phân biệt **AuthN** (bạn là ai) vs **AuthZ** (bạn làm được gì)
- ✅ Implement **`@Roles()` decorator** + **`RolesGuard`**
- ✅ 3 role Tutor365: **Admin (Hanah) / Tutor / Student**
- ✅ Combine `JwtAuthGuard` + `RolesGuard` đúng order
- ✅ Pattern **resource ownership check** (tutor sửa course của mình)
- ✅ Test scenario forbidden cross-role
- ✅ Hiểu **RBAC vs ABAC** — khi nào dùng cái nào

> 🎯 Cuối video: Hanah-only endpoint `/courses/:id/approve` chạy đúng

---

## Slide 3 — AuthN vs AuthZ

### Khác biệt

| | Authentication (AuthN) | Authorization (AuthZ) |
|--|------------------------|----------------------|
| Câu hỏi | "Bạn là ai?" | "Bạn được làm gì?" |
| Implement | JWT verify | Role check + ownership |
| Layer | JwtAuthGuard | RolesGuard + service |
| Fail | 401 Unauthorized | 403 Forbidden |
| Ví dụ | Token hợp lệ | Role là 'admin' |

> 💡 **Quan trọng:** 403 ≠ 401. 401 = "chưa login". 403 = "đã login nhưng không có quyền".

---

## Slide 4 — 3 role Tutor365

| Role | Người | Quyền chính |
|------|-------|------------|
| **admin** | Hanah duy nhất | Approve course, assign booking, payout, ban user |
| **tutor** | Người dạy | Create course, declare availability, accept booking |
| **student** | Người học | Buy course, book session, review |

**Không có role:**

- ❌ Parent (Q1 chốt — không có phụ huynh)
- ❌ Moderator phụ — Hanah là single admin
- ❌ Super-admin — không cần multi-tenant

---

## Slide 5 — `@Roles()` decorator

```ts
// common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export type AppRole = 'admin' | 'tutor' | 'student';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
```

**Dùng:**

```ts
@Roles('admin')
@Post('courses/:id/approve')
approve() {}

@Roles('tutor', 'admin')   // OR — tutor hoặc admin đều được
@Patch('courses/:id')
updateCourse() {}
```

---

## Slide 6 — `RolesGuard` implementation

```ts
// common/guards/roles.guard.ts
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, AppRole } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;   // no @Roles → public to all authenticated

    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.role) throw new ForbiddenException('Missing role in token');
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`Yêu cầu role: ${required.join(' hoặc ')}`);
    }
    return true;
  }
}
```

---

## Slide 7 — Order: JwtAuthGuard chạy trước RolesGuard

```ts
// app.module.ts
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },   // 1
    { provide: APP_GUARD, useClass: RolesGuard },     // 2
  ],
})
export class AppModule {}
```

**Order chạy:** theo thứ tự khai báo trong providers.

```
Request đến
  ↓
JwtAuthGuard — verify token, set req.user
  ↓ (pass)
RolesGuard — check role từ req.user
  ↓ (pass)
Controller
```

> 💡 Nếu RolesGuard chạy trước → req.user chưa có → fail.

---

## Slide 8 — Decorator combo: `@Auth(...roles)`

### Gộp cho gọn

```ts
// common/decorators/auth.decorator.ts
import { applyDecorators, UseGuards } from '@nestjs/common';
import { Roles, AppRole } from './roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

export function Auth(...roles: AppRole[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(...roles),
  );
}
```

**Dùng:**

```ts
@Auth('admin')
@Post('courses/:id/approve')
approve() {}

@Auth('tutor', 'admin')
@Patch('courses/:id')
update() {}
```

→ Gọn hơn, đỡ quên `@UseGuards`.

---

## Slide 9 — Resource ownership check

### Role check chưa đủ

```ts
@Auth('tutor')
@Patch('courses/:id')
async update(@Param('id') id: string, @Body() body, @CurrentUser() u) {
  // ❌ Tutor A có thể sửa course của Tutor B!
  return this.coursesService.update(id, body);
}
```

**Đúng:** check ownership

```ts
@Auth('tutor')
@Patch('courses/:id')
async update(@Param('id') id: string, @Body() body, @CurrentUser() u: JwtPayload) {
  const course = await this.coursesService.findById(id);
  if (course.tutorId !== u.sub) {
    throw new ForbiddenException('Bạn không sở hữu khoá học này');
  }
  return this.coursesService.update(id, body);
}
```

---

## Slide 10 — Ownership check trong service

### Tốt hơn: làm trong service

```ts
// courses.service.ts
async updateAsOwner(id: string, input: UpdateCourseInput, currentUserId: string) {
  const course = await this.repo.findById(id);
  if (!course) throw new NotFoundException();
  if (course.tutorId !== currentUserId) {
    throw new ForbiddenException('Bạn không sở hữu khoá học này');
  }
  return this.repo.update(id, input);
}

async updateAsAdmin(id: string, input: UpdateCourseInput) {
  // Admin bypass ownership
  return this.repo.update(id, input);
}
```

**Controller chọn entry point:**

```ts
@Auth('tutor')
@Patch('courses/:id')
update(@Param('id') id, @ZodBody(UpdateCourseDto) body, @CurrentUser('sub') uid) {
  return this.coursesService.updateAsOwner(id, body, uid);
}
```

---

## Slide 11 — Ownership guard generic

### Refactor nếu nhiều endpoint có pattern này

```ts
// common/guards/course-owner.guard.ts
@Injectable()
export class CourseOwnerGuard implements CanActivate {
  constructor(private coursesService: CoursesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const id = req.params.id;
    const user = req.user;

    if (user.role === 'admin') return true;       // admin bypass
    const course = await this.coursesService.findById(id);
    if (course.tutorId !== user.sub) {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

**Dùng:**

```ts
@Auth('tutor', 'admin')
@UseGuards(CourseOwnerGuard)
@Patch('courses/:id')
update() {}
```

---

## Slide 12 — Map endpoint → role table

### Reference cho cả khoá

| Endpoint | Method | Role |
|---------|--------|------|
| `/v1/auth/*` | POST | public |
| `/v1/me` | GET | mọi role logged-in |
| `/v1/users` | GET | admin |
| `/v1/users/:id/block` | POST | admin |
| `/v1/tutor-profile` | PATCH | tutor (own) |
| `/v1/tutor-profile/:id/approve` | POST | admin |
| `/v1/courses` | GET | public |
| `/v1/courses` | POST | tutor |
| `/v1/courses/:id/approve` | POST | admin |
| `/v1/courses/:id` | PATCH | tutor (own), admin |
| `/v1/bookings` | POST | student |
| `/v1/bookings/:id/assign` | POST | admin |
| `/v1/bookings/:id/accept` | POST | tutor (assigned) |
| `/v1/payouts` | GET | admin |

---

## Slide 13 — Test scenario forbidden

```bash
# Student có token
STUDENT_TOKEN=$(curl ... | jq -r .accessToken)

# Try approve course → 403
curl -X POST /v1/courses/c-1/approve \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# 403 — Yêu cầu role: admin

# Tutor try assign booking → 403
TUTOR_TOKEN=$(curl ... | jq -r .accessToken)
curl -X POST /v1/bookings/b-1/assign \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d '{"tutorId":"u-2"}'
# 403

# Admin approve → 200
ADMIN_TOKEN=$(curl ... | jq -r .accessToken)
curl -X POST /v1/courses/c-1/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# 200
```

---

## Slide 14 — RBAC vs ABAC

### Khi nào nâng cấp?

**RBAC** (Role-Based) — Tutor365 dùng

- ✅ Đơn giản: role → quyền
- ❌ Không xử lý được "tutor sửa course của mình"
  → Phải combine ownership check

**ABAC** (Attribute-Based) — phức tạp hơn

- ✅ Policy: `user.role == 'tutor' AND resource.ownerId == user.id`
- ✅ Linh hoạt cho enterprise (Casbin, Open Policy Agent)
- ❌ Học curve cao, overkill cho MVP

**Quy tắc:** start RBAC, upgrade ABAC khi rule > 20 và phức tạp.

---

## Slide 15 — `@AdminOnly()` helper cho Hanah

```ts
// common/decorators/admin-only.decorator.ts
import { Auth } from './auth.decorator';
export const AdminOnly = () => Auth('admin');
```

**Dùng cho dashboard Hanah:**

```ts
@AdminOnly()
@Get('admin/dashboard/pending-bookings')
listPendingBookings() {}

@AdminOnly()
@Get('admin/payouts')
listPayouts() {}

@AdminOnly()
@Post('users/:id/block')
blockUser() {}
```

> 💡 Đọc code mới biết ngay: endpoint này chỉ Hanah dùng.

---

## Slide 16 — Forbidden mà ẩn endpoint (404 vs 403)

### Có nên expose endpoint tồn tại?

**Option A — 403:**
```
GET /v1/admin/users
→ 403 Forbidden (Student biết endpoint tồn tại)
```

**Option B — 404 (security through obscurity):**
```
GET /v1/admin/users  với role=student
→ 404 (giả vờ không tồn tại)
```

**Tutor365 chọn:** **403 rõ ràng**.

> 💡 OWASP khuyến nghị: status code chính xác → debug dễ. Security thật phải qua auth/RBAC, không che giấu.

---

## Slide 17 — Audit log mọi action role-sensitive

```ts
// modules/courses/courses.service.ts
async approve(id: string, adminId: string) {
  const course = await this.repo.update(id, {
    status: 'published',
    publishedAt: new Date(),
  });
  await this.auditLog.record({
    actorUserId: adminId,
    action: 'course.approve',
    entityType: 'course',
    entityId: id,
  });
  return course;
}
```

**Cần log:**

- ✅ Admin action (approve, block, assign)
- ✅ Cross-role action (student trên course tutor)
- ✅ Sensitive read (Hanah xem audit log → cũng log)
- ✅ Failed authz attempt (Student try /admin → log để phát hiện probe)

---

## Slide 18 — Roles + Permissions: pattern nâng cao

### Khi role không đủ

```ts
// Permission: granular hơn role
type Permission = 'course.approve' | 'user.block' | 'payout.confirm' | ...;

const rolePermissions: Record<AppRole, Permission[]> = {
  admin: ['course.approve', 'user.block', 'payout.confirm', ...],
  tutor: ['course.create', 'availability.declare', 'booking.accept'],
  student: ['course.buy', 'booking.create', 'review.write'],
};

@Permissions('course.approve')
@Post('courses/:id/approve')
approve() {}
```

> 💡 Tutor365 MVP **chưa dùng** — chỉ 3 role đơn giản. Nâng cấp khi role > 5 hoặc permission cần granular.

---

## Slide 19 — Anti-patterns

```ts
// ❌ Hardcode role trong service
if (user.role === 'admin' || user.role === 'super-admin') {
  // → guard làm chuyện này, không phải service
}

// ❌ Check role ở 3 chỗ
@Auth('admin')
@Get('/admin/x')
async x(@CurrentUser() u) {
  if (u.role !== 'admin') throw ...;       // ❌ guard đã check rồi
  return this.service.x();
}

// ❌ Throw 401 cho authz fail
if (user.role !== 'admin') throw new UnauthorizedException();  // → 403 mới đúng

// ❌ Trust role từ body
@Post('signup')
signup(@Body() body) {
  return create({...body, role: body.role });  // ← user gán role='admin'!
}

// ❌ Role string thay enum
if (user.role === 'admins')  // ← typo, không catch compile-time
```

---

## Slide 20 — Bài tập thực hành

### 🎯 Build RBAC layer

**Bài 1:** Implement `@Roles()` + `RolesGuard` + register global APP_GUARD.

**Bài 2:** Implement `@Auth(...roles)` decorator gộp + `@AdminOnly()` shortcut.

**Bài 3:** Tạo 3 user (admin/tutor/student) qua seed. Login mỗi role lấy token.

**Bài 4:** Test matrix:
- Student gọi `/v1/courses/:id/approve` → 403
- Tutor gọi `/v1/users/:id/block` → 403
- Admin gọi cả 2 → 200

**Bài 5:** Implement `CourseOwnerGuard` cho `PATCH /v1/courses/:id`:
- Tutor A sửa course của Tutor B → 403
- Tutor A sửa course của mình → 200
- Admin sửa bất kỳ → 200

**Bài 6:** Audit log mọi cross-role attempt fail. Verify bảng `audit_logs`.

---

## Slide 21 — Section 2 hoàn tất

### Bạn đã build xong Auth layer

✅ V06 — Signup + email verification + MailPit
✅ V07 — Login + JWT access + `@CurrentUser()`
✅ V08 — Refresh rotation + replay detection + logout
✅ V09 — RBAC 3 role + ownership check + `@Auth()`

**Section 3 — Users & Profiles** (3 video) sẽ dùng auth layer:

- V10: Admin CRUD user
- V11: Tutor profile + approval workflow
- V12: Student profile + avatar upload

> 🚀 Sang Section 3 — quản lý 3 loại user thực tế.

---

## Slide 22 — Tổng kết Video 9

### Bạn vừa học

- ✅ AuthN vs AuthZ phân biệt rõ
- ✅ `@Roles()` decorator + `RolesGuard`
- ✅ Order JwtAuthGuard → RolesGuard
- ✅ Combo `@Auth(...roles)` gọn
- ✅ Resource ownership check (service hoặc guard)
- ✅ Map endpoint → role table cho cả Tutor365
- ✅ 403 vs 404 trade-off
- ✅ Audit log mọi role-sensitive action
- ✅ RBAC vs ABAC khi nào nâng cấp

> 💪 RBAC chuẩn = bước cuối của auth foundation

---

<!-- _class: lead -->

# Tiếp theo: Video 10

## Admin CRUD User + Status Block/Unblock

Hanah quản lý 3 role user: list filter, view detail, block/unblock với audit log.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 10 🚀

> *"Authentication says hello. Authorization decides who gets in."*
