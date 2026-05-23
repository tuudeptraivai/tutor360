---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 12: Student Profile + Avatar Upload'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Student Profile
# + Avatar Upload

### Khóa 2-3 — Video 12

**Grade · Guardian · Timezone · MinIO S3**

> Upload đúng = endpoint nhỏ, nhưng đầy bẫy

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Bảng `student_profiles` + endpoint update
- ✅ Setup **MinIO** (S3-compatible) bằng Docker
- ✅ Implement **multipart file upload** với Multer
- ✅ Validate file: **type**, **size**, **magic bytes**
- ✅ Lưu key S3, không lưu raw bytes trong DB
- ✅ Generate **presigned URL** cho avatar public read
- ✅ Endpoint **DELETE avatar** + cleanup S3

> 🎯 Cuối video: avatar upload + hiển thị qua presigned URL

---

## Slide 3 — Bảng `student_profiles`

```ts
type StudentProfile = {
  userId: string;                           // PK = FK to users
  grade: string | null;                     // "Grade 10", "Lớp 12"
  guardianFullName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  timezone: string;                         // IANA "Asia/Ho_Chi_Minh"
  avatarKey: string | null;                 // S3 key — không lưu URL
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

> 💡 `avatarKey` thay vì `avatarUrl` — URL có thể đổi host, presigned expire. Key là canonical.

---

## Slide 4 — Setup MinIO bằng Docker

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Web Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  minio_data:
```

```bash
docker-compose up -d minio
# Console: http://localhost:9001 (minioadmin / minioadmin)
# API: http://localhost:9000
```

---

## Slide 5 — Tạo bucket khi boot

```ts
// storage/storage.service.ts
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService implements OnModuleInit {
  private s3: S3Client;
  private bucket = process.env.S3_BUCKET ?? 'tutor365';

  async onModuleInit() {
    this.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle: true,   // MinIO yêu cầu
    });
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}
```

---

## Slide 6 — Upload với Multer

```ts
// modules/students/students.controller.ts
import { FileInterceptor } from '@nestjs/platform-express';

@Auth('student')
@Post('me/avatar')
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 2 * 1024 * 1024 },     // 2MB
}))
async uploadAvatar(
  @CurrentUser('sub') userId: string,
  @UploadedFile() file: Express.Multer.File,
) {
  if (!file) throw new BadRequestException('file is required');
  return this.students.uploadAvatar(userId, file);
}
```

> 💡 `FileInterceptor` parse multipart/form-data và inject file vào `@UploadedFile()`.

---

## Slide 7 — Validate file: 3 lớp

```ts
async uploadAvatar(userId: string, file: Express.Multer.File) {
  // 1. MIME type (client gửi - không tin)
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    throw new BadRequestException('Chỉ chấp nhận JPG, PNG, WEBP');
  }

  // 2. Size (Multer đã limit, nhưng verify)
  if (file.size > 2 * 1024 * 1024) {
    throw new BadRequestException('Kích thước tối đa 2MB');
  }

  // 3. Magic bytes — defense in depth (client lừa MIME được)
  const magic = file.buffer.subarray(0, 12);
  const isJpeg = magic[0] === 0xff && magic[1] === 0xd8;
  const isPng = magic[0] === 0x89 && magic[1] === 0x50;
  const isWebp = magic.subarray(8, 12).toString() === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    throw new BadRequestException('File không phải ảnh hợp lệ');
  }

  // ... upload to S3
}
```

---

## Slide 8 — Upload to S3

```ts
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

async uploadAvatar(userId: string, file: Express.Multer.File) {
  // ... validate

  const ext = file.mimetype.split('/')[1];     // jpeg / png / webp
  const key = `avatars/${userId}/${randomUUID()}.${ext}`;

  await this.storage.put({
    key,
    body: file.buffer,
    contentType: file.mimetype,
  });

  // Cleanup old avatar (nếu có)
  const oldProfile = await this.findByUserId(userId);
  if (oldProfile.avatarKey) {
    await this.storage.delete(oldProfile.avatarKey);
  }

  await this.prisma.studentProfile.update({
    where: { userId },
    data: { avatarKey: key },
  });

  return { avatarUrl: await this.storage.presignedUrl(key, 3600) };
}
```

---

## Slide 9 — Storage service: put / delete / presigned

```ts
// storage/storage.service.ts (tiếp slide 5)
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async put(opts: { key: string; body: Buffer; contentType: string }) {
  await this.s3.send(new PutObjectCommand({
    Bucket: this.bucket,
    Key: opts.key,
    Body: opts.body,
    ContentType: opts.contentType,
  }));
}

async delete(key: string) {
  await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
}

async presignedUrl(key: string, ttlSec: number) {
  return getSignedUrl(this.s3, new GetObjectCommand({
    Bucket: this.bucket,
    Key: key,
  }), { expiresIn: ttlSec });
}
```

---

## Slide 10 — Vì sao presigned URL?

### 3 cách phát file

| Cách | Pros | Cons |
|------|------|------|
| Public bucket | URL công khai, không expire | ❌ Mọi avatar lộ, không revoke |
| API stream | Quyền control | ❌ Server bandwidth tốn |
| **Presigned URL** | Quyền control + S3 phục vụ | ✅ Expire, audit |

**Pattern Tutor365:**

```
Frontend: GET /v1/me  → { avatarUrl: "https://minio.../avatars/u-1/abc.jpg?X-Amz-Signature=..." }
Browser: load avatarUrl trực tiếp từ S3
S3: verify signature + serve
```

> 💡 TTL 1 giờ là đủ — FE refresh khi cần.

---

## Slide 11 — `/v1/me` response có avatar URL

```ts
// students.service.ts
async getMineWithAvatar(userId: string) {
  const profile = await this.findByUserId(userId);
  return {
    ...toPublicStudentProfile(profile),
    avatarUrl: profile.avatarKey
      ? await this.storage.presignedUrl(profile.avatarKey, 3600)
      : null,
  };
}
```

> ⚠️ **Cẩn thận N+1**: list 100 student → 100 lần call presigned. Cache hoặc batch.

---

## Slide 12 — Update student profile fields

```ts
@Auth('student')
@Patch('me/student-profile')
async update(
  @CurrentUser('sub') userId: string,
  @ZodBody(UpdateStudentProfileDto) body,
) {
  return this.students.updateOwn(userId, body);
}

// DTO
export const UpdateStudentProfileDto = z.object({
  grade: z.string().min(1).max(20).optional(),
  guardianFullName: z.string().min(2).max(80).optional(),
  guardianEmail: z.string().email().optional(),
  guardianPhone: z.string().regex(/^\+?[0-9]{9,14}$/).optional(),
  timezone: z.string().regex(/^[A-Za-z_]+\/[A-Za-z_]+$/).default('Asia/Ho_Chi_Minh').optional(),
  bio: z.string().max(500).optional(),
});
```

---

## Slide 13 — Delete avatar endpoint

```ts
@Auth('student')
@Delete('me/avatar')
async deleteAvatar(@CurrentUser('sub') userId: string) {
  await this.students.deleteAvatar(userId);
  return { ok: true };
}

// Service
async deleteAvatar(userId: string) {
  const profile = await this.findByUserId(userId);
  if (!profile.avatarKey) return;

  await this.storage.delete(profile.avatarKey);
  await this.prisma.studentProfile.update({
    where: { userId },
    data: { avatarKey: null },
  });
}
```

---

## Slide 14 — Validate magic bytes cho từng format

```ts
function detectImageFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) return 'png';
  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer.subarray(8, 12).toString() === 'WEBP'
  ) return 'webp';
  return null;
}
```

> 💡 Tham khảo: <https://en.wikipedia.org/wiki/List_of_file_signatures>.

---

## Slide 15 — Image resize trước khi upload (tuỳ chọn)

### Tránh user up ảnh 5000x5000 px

```ts
import sharp from 'sharp';

async uploadAvatar(userId, file) {
  // ... validate

  // Resize về tối đa 512x512, convert webp giảm size
  const optimized = await sharp(file.buffer)
    .resize(512, 512, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();

  const key = `avatars/${userId}/${randomUUID()}.webp`;
  await this.storage.put({
    key,
    body: optimized,
    contentType: 'image/webp',
  });
  // ...
}
```

**Pros:**

- ✅ Giảm storage 80%+
- ✅ FE load nhanh
- ✅ Strip EXIF (privacy: tránh leak GPS location trong ảnh)

---

## Slide 16 — Direct upload S3 (advanced)

### Skip backend với presigned PUT URL

```ts
// Backend chỉ phát presigned URL, không nhận file
@Auth('student')
@Post('me/avatar/upload-url')
async getUploadUrl(@CurrentUser('sub') userId: string) {
  const key = `avatars/${userId}/${randomUUID()}.jpg`;
  const url = await this.storage.presignedPutUrl(key, 300);  // 5 phút
  return { uploadUrl: url, key };
}

// Sau khi FE upload xong, confirm
@Auth('student')
@Post('me/avatar/confirm')
async confirmAvatar(@CurrentUser('sub') userId: string, @ZodBody(ConfirmDto) body) {
  // Verify file tồn tại trong S3
  await this.storage.headObject(body.key);
  await this.prisma.studentProfile.update({
    where: { userId },
    data: { avatarKey: body.key },
  });
}
```

> 💡 Direct upload **tiết kiệm bandwidth backend** — nhưng MVP dùng cách qua server cho dễ.

---

## Slide 17 — Test curl upload

```bash
STUDENT_TOKEN=$(curl -s -X POST /v1/auth/login ... | jq -r .accessToken)

# Upload
curl -X POST /v1/me/avatar \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -F "file=@/path/to/photo.jpg"
# { avatarUrl: "http://minio:9000/tutor365/avatars/u-1/uuid.jpg?X-Amz-..." }

# Verify GET /me trả URL có signature
curl /v1/me -H "Authorization: Bearer $STUDENT_TOKEN"

# Upload file quá lớn
curl -X POST /v1/me/avatar \
  -F "file=@/path/to/huge.jpg" -H "Authorization: ..."
# 413 Payload Too Large (Multer limit)

# Upload file không phải ảnh
curl -X POST /v1/me/avatar \
  -F "file=@/path/to/text.txt" -H "Authorization: ..."
# 400 — Chỉ chấp nhận JPG, PNG, WEBP

# Delete
curl -X DELETE /v1/me/avatar -H "Authorization: ..."
```

---

## Slide 18 — Anti-patterns

```ts
// ❌ Lưu raw bytes vào DB
{ avatarBinary: Buffer }   // → DB phình to, không cache CDN được

// ❌ Trust client MIME type
if (file.mimetype === 'image/jpeg') ok();
// → client gửi MIME giả + nội dung exe

// ❌ Trust client filename
const key = file.originalname;
// → ../../etc/passwd path traversal

// ❌ Không expire presigned URL
// → URL dùng vĩnh viễn = same as public

// ❌ Upload không limit size
// → DoS dễ dàng

// ❌ Không cleanup old avatar
// → S3 storage tràn theo thời gian

// ❌ Save URL vào DB
{ avatarUrl: "http://..." }
// → đổi domain → URL chết hàng loạt
```

---

## Slide 19 — Edge cases

| Case | Behavior |
|------|----------|
| Upload file rỗng (0 byte) | 400 |
| Upload không có field `file` | 400 |
| Upload 2 file cùng tên | Lưu mỗi cái UUID khác → OK |
| MinIO down | 503 — graceful, không crash |
| Old avatar key tồn tại nhưng file đã bị xoá ngoài | Delete trả 404 → ignore, vẫn update DB |
| Concurrent upload từ 2 tab | Last write wins (DB transaction) |
| Avatar bị xoá ở DB nhưng còn S3 | Cron cleanup orphan key (job riêng) |

---

## Slide 20 — Section 3 hoàn tất

### User & Profile layer

✅ V10 — Admin CRUD user + block + audit
✅ V11 — Tutor profile + 4-state approval workflow
✅ V12 — Student profile + avatar upload MinIO

**Section 4 — Taxonomy** (3 video) sẽ build:

- Subjects (môn học)
- Levels (lớp)
- Qualifications (bằng cấp)

Cả 3 dùng pattern CRUD chung — slug + admin manage.

> 🚀 Sang Section 4 — chuẩn bị data master cho course + tutor.

---

## Slide 21 — Bài tập thực hành

### 🎯 Avatar upload end-to-end

**Bài 1:** Setup MinIO Docker + bucket auto-create.

**Bài 2:** Implement `POST /v1/me/avatar` với 3 lớp validate (MIME, size, magic).

**Bài 3:** Test:
- Upload JPG 1MB → OK
- Upload JPG 3MB → 413
- Upload .exe đổi tên thành .jpg → 400 (magic bytes catch)
- Upload không Bearer → 401

**Bài 4:** Implement presigned URL TTL 1h. Test mở URL sau 1h → 403 từ MinIO.

**Bài 5:** Implement resize 512x512 + webp bằng `sharp`.

**Bài 6:** Bonus: implement direct upload (presigned PUT) — đo bandwidth backend giảm.

---

## Slide 22 — Tổng kết Video 12

### Bạn vừa học

- ✅ `student_profiles` schema với avatarKey
- ✅ Setup MinIO S3-compat Docker
- ✅ Multer multipart upload + size limit
- ✅ Validate 3 lớp: MIME → size → magic bytes
- ✅ Lưu key, không lưu raw / URL
- ✅ Presigned URL TTL 1h cho avatar read
- ✅ Cleanup avatar cũ khi upload mới
- ✅ Sharp resize 512 + webp + strip EXIF
- ✅ Direct upload pattern (advanced)

> 💪 Upload an toàn = bài thi của 1 backend production

---

<!-- _class: lead -->

# Tiếp theo: Video 13

## Subjects CRUD + Slug + Assign cho Tutor

Subjects master data: CRUD admin, slug auto-gen, gán cho tutor lúc onboarding.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 13 🚀

> *"Trust the client; verify the bytes."*
