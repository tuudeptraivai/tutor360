---
marp: true
theme: default
paginate: true
header: 'Khóa 2-3 — Building Tutor365 Backend + Database'
footer: 'Video 18: File Upload Lesson Content (Multer + MinIO)'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# File Upload Lesson Content
# Multer + MinIO

### Khóa 2-3 — Video 18

**Multipart · Stream · Multipart Upload S3**

> Upload 500MB không khoá memory = bài học của senior backend

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **stream upload** vs **buffer upload**
- ✅ Configure Multer dùng **`diskStorage`** thay `memoryStorage` cho video lớn
- ✅ Implement **S3 multipart upload** với `@aws-sdk/lib-storage`
- ✅ Track **upload progress** report ra FE
- ✅ Resume upload khi mất kết nối (advanced)
- ✅ Generate **HLS-friendly storage layout** cho video streaming

> 🎯 Cuối video: upload video 500MB không OOM, hiện progress

---

## Slide 3 — Vấn đề với memoryStorage

### V17 upload buffer

```ts
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
async upload(@UploadedFile() file: Express.Multer.File) {
  // file.buffer chứa TOÀN BỘ 500MB trong RAM
  await this.storage.put({ key, body: file.buffer });
}
```

**Vấn đề:**

- ❌ 1 request 500MB → consume 500MB RAM
- ❌ 10 user upload đồng thời → 5GB RAM
- ❌ Container OOM → crash

**Fix:** dùng **diskStorage** + **stream**.

---

## Slide 4 — Multer diskStorage

```ts
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';

@UseInterceptors(FileInterceptor('file', {
  storage: diskStorage({
    destination: '/tmp/uploads',
    filename: (req, file, cb) => {
      const ext = file.originalname.split('.').pop();
      cb(null, `${randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
}))
async upload(@UploadedFile() file: Express.Multer.File) {
  // file.path = "/tmp/uploads/uuid.mp4"
  // file.buffer = undefined (không load vào RAM)
}
```

**Trade-off:**

- ✅ RAM constant, không phụ thuộc file size
- ⚠️ Tốn disk tạm — cần đảm bảo `/tmp` đủ chỗ
- ⚠️ Phải cleanup sau khi upload S3 xong

---

## Slide 5 — Stream từ disk lên S3

```ts
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';

async uploadFromDisk(opts: { tmpPath: string; key: string; contentType: string }) {
  const stream = createReadStream(opts.tmpPath);

  const upload = new Upload({
    client: this.s3,
    params: {
      Bucket: this.bucket,
      Key: opts.key,
      Body: stream,
      ContentType: opts.contentType,
    },
    queueSize: 4,           // 4 chunk song song
    partSize: 5 * 1024 * 1024,  // 5MB / part
  });

  upload.on('httpUploadProgress', (p) => {
    this.logger.log(`Uploaded ${p.loaded}/${p.total}`);
  });

  await upload.done();

  await unlink(opts.tmpPath).catch(() => {});
}
```

> 💡 `@aws-sdk/lib-storage` tự chia file thành parts, upload song song, retry per-part.

---

## Slide 6 — Multipart Upload S3 cơ chế

```
File 500MB
  ↓ chia thành 100 parts × 5MB
  ↓
S3.CreateMultipartUpload → uploadId
  ↓
[part 1] [part 2] ... [part 100]  ← upload song song (queueSize=4)
  ↓
S3.CompleteMultipartUpload(uploadId, [...etag])
  ↓
File hoàn chỉnh trên S3
```

**Lợi ích:**

- ✅ Resume khi network fail (chỉ retry part bị fail)
- ✅ Upload nhanh hơn (parallelism)
- ✅ S3 cho phép part 5MB-5GB, file tổng tối đa 5TB

---

## Slide 7 — Progress callback ra FE

### Issue: HTTP req chỉ trả 1 response

```
Client → POST /upload → Server → ... → 200 (sau 30 giây)
                  ↑ no progress
```

**Giải pháp 1: WebSocket / SSE**

```ts
// FE subscribe SSE
const evt = new EventSource('/v1/lessons/uploads/<jobId>');
evt.onmessage = e => console.log(JSON.parse(e.data).progress);

// BE
@Get('uploads/:jobId')
@Sse()
streamProgress(@Param('jobId') jobId: string) {
  return this.uploadProgress.subscribe(jobId);
}
```

**Giải pháp 2: Direct upload S3 + presigned multipart (tốt nhất MVP)**

→ FE upload trực tiếp S3, biết progress qua XHR/Fetch.

---

## Slide 8 — Direct upload với presigned multipart

### Backend phát URL cho từng part

```ts
// 1. Init upload
@Post('lessons/:id/upload/init')
async initUpload(@Param('id') id: string, @CurrentUser() u, @ZodBody(InitDto) body) {
  await this.ensureOwnership(id, u);
  const key = `lessons/${id}/${randomUUID()}.mp4`;

  const { UploadId } = await this.s3.send(new CreateMultipartUploadCommand({
    Bucket: this.bucket,
    Key: key,
    ContentType: body.contentType,
  }));

  return { uploadId: UploadId, key, partUrls: await this.signParts(key, UploadId, body.partCount) };
}

private async signParts(key, uploadId, partCount) {
  return Promise.all(
    Array.from({ length: partCount }).map((_, i) =>
      getSignedUrl(this.s3, new UploadPartCommand({
        Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: i + 1,
      }), { expiresIn: 3600 }),
    ),
  );
}
```

---

## Slide 9 — Direct upload: complete + abort

```ts
@Post('lessons/:id/upload/complete')
async complete(
  @Param('id') id: string,
  @ZodBody(CompleteDto) body,
  @CurrentUser() u,
) {
  await this.ensureOwnership(id, u);

  await this.s3.send(new CompleteMultipartUploadCommand({
    Bucket: this.bucket,
    Key: body.key,
    UploadId: body.uploadId,
    MultipartUpload: {
      Parts: body.parts.map((etag, i) => ({ ETag: etag, PartNumber: i + 1 })),
    },
  }));

  await this.prisma.lesson.update({
    where: { id },
    data: { contentKey: body.key },
  });
}

@Post('lessons/:id/upload/abort')
async abort(@Param('id') id, @ZodBody(AbortDto) body) {
  await this.s3.send(new AbortMultipartUploadCommand({
    Bucket: this.bucket, Key: body.key, UploadId: body.uploadId,
  }));
}
```

---

## Slide 10 — FE flow upload trực tiếp

```ts
// FE pseudo-code
async function uploadVideo(lessonId: string, file: File) {
  const partSize = 5 * 1024 * 1024;
  const partCount = Math.ceil(file.size / partSize);

  // 1. Init
  const { uploadId, key, partUrls } = await fetch('/v1/lessons/' + lessonId + '/upload/init', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, partCount }),
  }).then(r => r.json());

  // 2. Upload parts song song
  const etags = await Promise.all(partUrls.map(async (url, i) => {
    const blob = file.slice(i * partSize, (i + 1) * partSize);
    const res = await fetch(url, { method: 'PUT', body: blob });
    return res.headers.get('ETag')!.replace(/"/g, '');
  }));

  // 3. Complete
  await fetch('/v1/lessons/' + lessonId + '/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ uploadId, key, parts: etags }),
  });
}
```

---

## Slide 11 — Resume upload (advanced)

### Lưu state ở localStorage

```ts
// FE
const state = {
  uploadId, key, partCount,
  uploadedParts: { 1: '<etag>', 3: '<etag>' },  // part 2 fail
};
localStorage.setItem(`upload:${lessonId}`, JSON.stringify(state));

// Khi resume:
const missing = Array.from({ length: partCount }, (_, i) => i + 1)
  .filter(n => !state.uploadedParts[n]);

// Tiếp tục upload các part thiếu
for (const partNum of missing) {
  const url = await getSignedPartUrl(uploadId, key, partNum);
  // upload + lưu etag
}
```

> 💡 Pattern này dùng cho upload network không ổn định.

---

## Slide 12 — Cleanup abandoned uploads

### Multipart upload chưa complete = tốn storage

```ts
@Cron('0 2 * * *')   // 2h sáng mỗi ngày
async cleanupAbandonedUploads() {
  const { Uploads } = await this.s3.send(new ListMultipartUploadsCommand({
    Bucket: this.bucket,
  }));
  if (!Uploads) return;

  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const u of Uploads) {
    if (u.Initiated && u.Initiated.getTime() < cutoff) {
      await this.s3.send(new AbortMultipartUploadCommand({
        Bucket: this.bucket, Key: u.Key, UploadId: u.UploadId,
      }));
      this.logger.log(`Aborted abandoned upload ${u.UploadId}`);
    }
  }
}
```

> 💡 MinIO + S3 lifecycle policy cũng làm việc này — set qua console.

---

## Slide 13 — Validate trên server sau upload

### Tin tưởng client không đủ

```ts
@Post('lessons/:id/upload/complete')
async complete(@Param('id') id, @ZodBody(CompleteDto) body, @CurrentUser() u) {
  // ... existing complete

  // Verify file size + content sau khi assemble
  const head = await this.s3.send(new HeadObjectCommand({
    Bucket: this.bucket, Key: body.key,
  }));

  const lesson = await this.lessons.findById(id);
  if (lesson.type === 'video' && head.ContentLength! > 500 * 1024 * 1024) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: body.key }));
    throw new BadRequestException('Video vượt quá 500MB');
  }

  // Probe video duration
  if (lesson.type === 'video') {
    const durationSec = await this.probeVideoFromS3(body.key);
    await this.prisma.lesson.update({
      where: { id }, data: { durationSec, contentKey: body.key },
    });
  }
}
```

---

## Slide 14 — Probe video từ S3 (không tải về máy)

### Range request đầu file để đọc metadata

```ts
async probeVideoFromS3(key: string): Promise<number> {
  // Tải 10MB đầu (đủ cho header metadata mp4/mov)
  const range = await this.s3.send(new GetObjectCommand({
    Bucket: this.bucket, Key: key, Range: 'bytes=0-10485760',
  }));
  const buf = await streamToBuffer(range.Body as Readable);

  const tmp = `/tmp/probe-${randomUUID()}.mp4`;
  await fs.writeFile(tmp, buf);
  try {
    const { stdout } = await exec(ffprobe.path, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', tmp,
    ]);
    return Math.floor(parseFloat(stdout));
  } finally {
    await fs.unlink(tmp);
  }
}
```

> 💡 Mp4 header `moov` thường ở đầu — 10MB đủ. Webm cần full file → fallback download.

---

## Slide 15 — Bandwidth + concurrency considerations

### Limits nên cấu hình

```ts
export const UPLOAD_LIMITS = {
  // Concurrent uploads per user
  MAX_CONCURRENT_PER_USER: 2,

  // Max parts in flight
  MAX_PARTS_PARALLEL: 4,

  // Part size
  PART_SIZE_MB: 5,

  // Max upload time
  MAX_UPLOAD_DURATION_MIN: 60,

  // Throttle large files
  THROTTLE_BANDWIDTH_KBPS: null,    // null = no throttle dev, prod set theo plan
};
```

**Enforce:** tracking active uploads cho mỗi userId trong cache.

---

## Slide 16 — Anti-patterns

```ts
// ❌ memoryStorage cho video lớn
storage: memoryStorage()             // → OOM với 100MB+

// ❌ Upload qua backend rồi forward S3 (waste bandwidth)
client → backend → S3                 // backend bandwidth ×2

// ❌ Không cleanup tmp file
// → /tmp tràn theo thời gian

// ❌ Không validate sau complete (trust FE)
// → FE gửi nhầm key → corrupt content

// ❌ Multipart không abort khi error
// → Tốn storage parts orphan

// ❌ Đặt fileSize limit thấp ở Multer nhưng cao ở front
// → user upload 1h fail ở phút cuối

// ❌ Không expose progress
// → User không biết upload tới đâu
```

---

## Slide 17 — Edge cases

| Case | Behavior |
|------|----------|
| Network drop giữa chừng | Retry part bị fail (lib-storage tự retry 3 lần) |
| User đóng tab khi đang upload | Multipart abandoned → cron cleanup |
| Part order swap (network) | OK — S3 assembly theo `PartNumber` |
| ETag không khớp | S3 reject complete → FE retry |
| File >5TB | S3 max → từ chối từ trước |
| Disk `/tmp` đầy | Multer fail → 500 graceful |

---

## Slide 18 — Bài tập thực hành

### 🎯 Production upload pipeline

**Bài 1:** Switch V17 từ memoryStorage sang diskStorage cho lesson type=video.

**Bài 2:** Implement stream upload S3 với `@aws-sdk/lib-storage`. Test upload 100MB:
- RAM stays constant (`top` monitor)
- Progress log đều

**Bài 3:** Implement direct upload presigned multipart (init/parts/complete/abort).

**Bài 4:** FE side: upload 1 video 200MB, hiện progress bar 0-100%.

**Bài 5:** Test cleanup:
- Init upload, upload 2/10 parts, không complete
- Đợi 1 ngày (hoặc sửa cron sang 1 phút)
- Verify multipart aborted

**Bài 6:** Implement probe video duration từ S3 không tải full file.

---

## Slide 19 — Tổng kết Video 18

### Bạn vừa học

- ✅ memoryStorage vs diskStorage trade-off
- ✅ Stream upload S3 với `@aws-sdk/lib-storage`
- ✅ Multipart upload 5MB parts × parallelism 4
- ✅ Direct upload pattern (init/parts/complete/abort)
- ✅ Resume upload với localStorage state
- ✅ Cleanup abandoned multipart bằng cron
- ✅ Post-complete validation (size, probe duration)
- ✅ Probe video không tải full file (Range request)

> 💪 Upload pipeline = đặc trưng senior backend engineering

---

<!-- _class: lead -->

# Tiếp theo: Video 19

## Free Preview + Public Listing với Filter

Free preview cơ chế, public listing đầy đủ filter, cursor pagination cho infinite scroll.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 19 🚀

> *"Memory is finite. Streams are infinite."*
