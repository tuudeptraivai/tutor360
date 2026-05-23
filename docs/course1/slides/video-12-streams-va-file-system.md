---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 12: Streams và File System'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Streams
# và File System

### Khóa 1 — Video 12

**Xử lý file 1GB chỉ tốn 64MB RAM**

> Stream = nước trong ống. Buffer = nước trong xô.

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **vì sao stream tốt hơn `readFile`** cho file lớn
- ✅ Phân biệt **4 loại stream**: `Readable`, `Writable`, `Transform`, `Duplex`
- ✅ Biết **`pipeline` vs `pipe`** — khi nào dùng cái nào
- ✅ Viết **`streamCopy(src, dst)`** — copy file an toàn
- ✅ Viết **`streamHash(src, "sha256")`** — hash file dạng stream
- ✅ Hiểu **backpressure** và vì sao quan trọng

> 🎯 Cuối video: copy file 1GB không OOM, tự đo bằng `--max-old-space-size`

---

## Slide 3 — Vấn đề: `readFile` không scale

### Đọc file 1GB vào RAM

```typescript
import fs from "node:fs/promises";

// ❌ Load TOÀN BỘ file vào RAM
const content = await fs.readFile("video-lecture.mp4");
//    ^^^^^^^ type: Buffer (size = filesize)

// File 1GB → 1GB RAM
// 10 user upload cùng lúc → 10GB RAM → server chết
```

**Khi nào `readFile` OK?**

- File nhỏ (config, small JSON < 10MB)
- Single user, single operation

**Khi nào BẮT BUỘC dùng stream?**

- File lớn (video, audio, large PDF)
- Multiple concurrent uploads/downloads
- Process data trong khi đang đọc (transform, compress)

---

## Slide 4 — Stream là gì?

### Định nghĩa qua hình ảnh

> **Stream** = dòng dữ liệu chảy qua memory **từng chunk nhỏ**, thay vì load hết 1 lần

```
File 1GB:
    [chunk1] [chunk2] [chunk3] ... [chunk16384]
    ↓ (64KB)  ↓        ↓             ↓
    Đọc 1 chunk → process → bỏ → đọc chunk tiếp
    ↑
    Memory footprint: ~64KB (1 chunk) thay vì 1GB
```

**4 thao tác chính:**

- Read chunk → emit `data` event
- Process chunk (optional transform)
- Write chunk vào output
- Khi hết → emit `end` event

---

## Slide 5 — 4 loại Stream trong Node.js

### Cheat sheet

| Stream | Đọc/Ghi | Ví dụ thật |
|--------|---------|-----------|
| **Readable** | Chỉ đọc | `fs.createReadStream`, HTTP request body |
| **Writable** | Chỉ ghi | `fs.createWriteStream`, HTTP response |
| **Transform** | Đọc + biến đổi + ghi | `zlib.createGzip`, `crypto.createHash` |
| **Duplex** | Đọc và ghi riêng biệt | TCP socket, WebSocket |

```typescript
// Pipeline điển hình
ReadStream → TransformStream → WriteStream

fs.createReadStream("input.txt")    // Readable
  .pipe(zlib.createGzip())           // Transform (compress)
  .pipe(fs.createWriteStream("output.gz"));  // Writable
```

---

## Slide 6 — Readable Stream: Cơ bản

### Đọc file dưới dạng chunks

```typescript
import fs from "node:fs";

const stream = fs.createReadStream("course.pdf", {
  encoding: "utf-8",        // optional, mặc định Buffer
  highWaterMark: 64 * 1024, // chunk size 64KB
});

// Event-based API
stream.on("data", (chunk) => {
  console.log(`Got ${chunk.length} bytes`);
});

stream.on("end", () => {
  console.log("Finished reading");
});

stream.on("error", (err) => {
  console.error("Read error:", err);
});
```

> 💡 `highWaterMark` = "buffer giới hạn" — đầy thì pause đọc, vơi thì resume

---

## Slide 7 — Readable Stream: Async iterator (modern)

### Cách dễ hơn với for-await

```typescript
import fs from "node:fs";

async function readFileChunks(path: string) {
  const stream = fs.createReadStream(path, { encoding: "utf-8" });
  let lineCount = 0;

  for await (const chunk of stream) {
    // chunk: string (vì set encoding)
    lineCount += chunk.split("\n").length - 1;
  }

  return lineCount;
}

const lines = await readFileChunks("big-log.txt");
console.log(`File has ${lines} lines`);
```

> 💡 `for await` tự xử lý backpressure — đẹp hơn event listener

---

## Slide 8 — Writable Stream: Ghi từng chunk

```typescript
import fs from "node:fs";

const stream = fs.createWriteStream("output.txt");

stream.write("Hello\n");
stream.write("World\n");
stream.end();  // báo "ghi xong"

stream.on("finish", () => {
  console.log("All data written");
});

stream.on("error", (err) => {
  console.error("Write error:", err);
});
```

**Vì sao không dùng `fs.writeFile`?**

- ✅ `writeFile`: cần Buffer/string toàn bộ trong RAM
- ✅ Stream: ghi từng chunk → memory tối thiểu

---

## Slide 9 — `pipe`: Kết nối Readable → Writable

### Đường ống dữ liệu

```typescript
import fs from "node:fs";

const read = fs.createReadStream("source.mp4");
const write = fs.createWriteStream("destination.mp4");

read.pipe(write);
// Tự động: đọc chunk → ghi chunk → repeat → close

write.on("finish", () => {
  console.log("Done!");
});
```

**❌ Vấn đề với `pipe`:**

- Lỗi không propagate đúng cách
- Phải listen `error` thủ công ở từng stream
- Nếu quên → memory leak / file descriptor leak

```typescript
// Phải làm thế này (dài dòng):
read.on("error", cleanup);
write.on("error", cleanup);
read.pipe(write);
```

---

## Slide 10 — `pipeline`: Modern, an toàn hơn

### Auto cleanup + error propagation

```typescript
import { pipeline } from "node:stream/promises";
import fs from "node:fs";

// Promise-based pipeline
await pipeline(
  fs.createReadStream("source.mp4"),
  fs.createWriteStream("destination.mp4")
);
console.log("Done!");

// Nếu bất kỳ stream nào lỗi → throw + cleanup tự động
```

**Pipeline với nhiều stage:**

```typescript
import zlib from "node:zlib";

await pipeline(
  fs.createReadStream("input.txt"),
  zlib.createGzip(),                       // compress
  fs.createWriteStream("input.txt.gz")
);
```

> ✅ **Luôn dùng `pipeline`** — không bao giờ dùng `pipe` thủ công nữa

---

## Slide 11 — Tự build `streamCopy`

### File `/packages/config/src/streams.ts`

```typescript
import { pipeline } from "node:stream/promises";
import fs from "node:fs";

export async function streamCopy(src: string, dst: string): Promise<void> {
  await pipeline(
    fs.createReadStream(src),
    fs.createWriteStream(dst)
  );
}
```

### Sử dụng

```typescript
import { streamCopy } from "@lms/config";

// Copy video lecture 2GB không dùng > 64MB RAM
await streamCopy(
  "/uploads/lecture-raw.mp4",
  "/storage/courses/c-1/lectures/lec-01.mp4"
);
```

---

## Slide 12 — Test `streamCopy` với file lớn

### Chứng minh memory tiết kiệm

```bash
# Tạo file test 100MB
dd if=/dev/urandom of=test-100mb.bin bs=1m count=100   # macOS
fsutil file createnew test-100mb.bin 104857600          # Windows PowerShell

# Chạy script copy với memory limit 64MB
node --max-old-space-size=64 -r tsx test-copy.ts
```

```typescript
// test-copy.ts
import { streamCopy } from "@lms/config";

await streamCopy("test-100mb.bin", "test-copy.bin");
console.log("Success — không OOM!");
```

**Kết quả:**

- ✅ `streamCopy`: pass với 64MB limit
- ❌ `fs.readFile` + `fs.writeFile`: crash OOM

---

## Slide 13 — Transform Stream: Biến đổi data on-the-fly

### Compress trên đường đi

```typescript
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import zlib from "node:zlib";

// Compress khi copy
await pipeline(
  fs.createReadStream("course.pdf"),
  zlib.createGzip({ level: 9 }),         // ← Transform
  fs.createWriteStream("course.pdf.gz")
);

// Decompress
await pipeline(
  fs.createReadStream("course.pdf.gz"),
  zlib.createGunzip(),                   // ← Transform
  fs.createWriteStream("course.pdf")
);
```

---

## Slide 14 — Tự build Transform stream

### Custom: uppercase mọi text

```typescript
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";

class UppercaseTransform extends Transform {
  _transform(chunk: Buffer, encoding: BufferEncoding, callback: Function) {
    const upper = chunk.toString().toUpperCase();
    callback(null, upper);
    //       ^^^^  ^^^^^
    //       error data
  }
}

await pipeline(
  fs.createReadStream("input.txt"),
  new UppercaseTransform(),
  fs.createWriteStream("output.txt")
);
```

**Use case LMS:**

- Strip metadata khỏi PDF
- Convert markdown → HTML on-the-fly
- Watermark images stream

---

## Slide 15 — `crypto.createHash`: Hash dạng stream

### Tính hash mà không load file

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

async function hashFile(path: string, algo: string = "sha256") {
  const hash = crypto.createHash(algo);

  await pipeline(
    fs.createReadStream(path),
    hash
  );

  return hash.digest("hex");
}

const checksum = await hashFile("course-video.mp4");
console.log(checksum);
// 3a7bd3e2360a3d40f8b...
```

> 💡 File 5GB → vẫn chỉ 64KB RAM (chunk size)

---

## Slide 16 — Tự build `streamHash`

### File `/packages/config/src/streams.ts`

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

export async function streamHash(
  src: string,
  algo: "sha256" | "md5" | "sha512" = "sha256"
): Promise<string> {
  const hash = crypto.createHash(algo);
  await pipeline(fs.createReadStream(src), hash);
  return hash.digest("hex");
}
```

### Use case LMS

```typescript
// Detect duplicate upload (deduplication)
async function uploadLecture(file: string) {
  const hash = await streamHash(file);

  const existing = await db.findFileByHash(hash);
  if (existing) {
    return { reused: true, fileId: existing.id };  // tiết kiệm storage!
  }

  return await saveNewFile(file, hash);
}
```

---

## Slide 17 — Backpressure: Tại sao quan trọng

### Vấn đề: Đọc nhanh, ghi chậm

```
Read: 1GB/s   →   Buffer trong RAM   →   Write: 100MB/s
                       ↑
                  Buffer phình to vô tận → OOM
```

**Backpressure** = cơ chế tự pause `Readable` khi `Writable` không kịp tiêu thụ

```typescript
// pipeline() tự xử lý backpressure
await pipeline(
  fastReader,          // tự pause khi cần
  slowWriter
);

// Manual write — KHÔNG có backpressure tự động
read.on("data", (chunk) => {
  write.write(chunk);  // ⚠️ buffer phình nếu write chậm
});
```

---

## Slide 18 — Backpressure manual: API `write.write()`

### Return value cho biết khi nào pause

```typescript
import fs from "node:fs";

const read = fs.createReadStream("source");
const write = fs.createWriteStream("dest");

read.on("data", (chunk) => {
  const okToContinue = write.write(chunk);
  if (!okToContinue) {
    read.pause();                          // ← Backpressure!
    write.once("drain", () => read.resume()); // ← Resume khi buffer vơi
  }
});

read.on("end", () => write.end());
```

> 💡 Code trên = tự reimplement những gì `pipeline` đã làm.
> **Bài học:** Dùng `pipeline` — đừng tự viết.

---

## Slide 19 — fs/promises: Modern API

### Bỏ callback, dùng async/await

```typescript
import fs from "node:fs/promises";  // ← /promises

// Read file (nhỏ)
const content = await fs.readFile("config.json", "utf-8");

// Write file
await fs.writeFile("output.txt", "Hello");

// Append
await fs.appendFile("log.txt", "New line\n");

// Stat (size, modified, isDirectory...)
const stats = await fs.stat("course.pdf");
console.log(stats.size, stats.mtime);

// List directory
const files = await fs.readdir("./uploads");

// Delete
await fs.unlink("temp.txt");
await fs.rm("./old-dir", { recursive: true });

// Make directory
await fs.mkdir("./new-folder", { recursive: true });
```

---

## Slide 20 — fs.promises vs fs.createReadStream

### Khi nào dùng cái nào?

| Use case | API |
|----------|-----|
| Đọc config JSON | `fs.readFile` |
| Đọc file < 10MB | `fs.readFile` |
| Đọc file > 10MB | `createReadStream` |
| Copy file lớn | `pipeline` |
| Hash file | `pipeline` + `createHash` |
| Compress file | `pipeline` + `zlib` |
| Process từng dòng | `readline` module |

```typescript
// Đọc từng dòng file lớn
import readline from "node:readline";
import fs from "node:fs";

const rl = readline.createInterface({
  input: fs.createReadStream("huge-log.txt"),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (line.includes("ERROR")) console.log(line);
}
```

---

## Slide 21 — Stream + HTTP: Upload/Download

### HTTP request body cũng là stream

```typescript
// Express handler — upload file dạng stream
app.post("/upload/:courseId", async (req, res) => {
  const courseId = req.params.courseId;
  const dest = `./uploads/${courseId}/lecture.mp4`;

  // ✅ Stream request body thẳng vào file
  // → 1GB upload không load vào RAM
  await pipeline(
    req,                                      // Readable (request body)
    fs.createWriteStream(dest)
  );

  res.json({ ok: true });
});

// Download file lớn
app.get("/download/:fileId", async (req, res) => {
  const path = await getFilePath(req.params.fileId);
  await pipeline(
    fs.createReadStream(path),
    res                                       // Writable (response)
  );
});
```

---

## Slide 22 — Use case LMS thực tế

### 4 nơi stream cứu mạng

**1. Upload video lecture (1-2GB)**

```typescript
await pipeline(req, fs.createWriteStream(path));
```

**2. Generate hash để dedupe upload**

```typescript
const hash = await streamHash(uploadedFile);
```

**3. Stream PDF cho AI summarize (Khóa 5)**

```typescript
for await (const chunk of fs.createReadStream("lecture.pdf")) {
  await sendChunkToClaude(chunk);
}
```

**4. Export student progress CSV (Khóa 7)**

```typescript
const csv = createCsvStream();
for (const student of students) {
  csv.write(toCsvRow(student));
}
csv.pipe(res);  // stream xuống browser
```

---

## Slide 23 — File system: Path handling

### `node:path` — cross-platform paths

```typescript
import path from "node:path";

// ✅ Đúng — works trên cả macOS và Windows
const fullPath = path.join("uploads", "courses", "c-1", "lec.mp4");
// macOS:   "uploads/courses/c-1/lec.mp4"
// Windows: "uploads\\courses\\c-1\\lec.mp4"

// ❌ Sai — hard-code separator
const wrong = "uploads/courses/c-1/lec.mp4";  // fail trên Windows

// Resolve absolute path
const abs = path.resolve(__dirname, "uploads");
// macOS: "/Users/alice/project/uploads"
// Win:   "C:\\Users\\alice\\project\\uploads"

// Parse path
path.basename("a/b/c.txt");   // "c.txt"
path.dirname("a/b/c.txt");    // "a/b"
path.extname("c.txt");        // ".txt"
path.parse("a/b/c.txt");      // { root, dir, base, name, ext }
```

---

## Slide 24 — `__dirname` trong ESM

### Khác giữa CommonJS và ESM

```typescript
// CommonJS — sẵn có
console.log(__dirname);

// ESM — phải tính từ import.meta.url
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(__dirname);
```

> 💡 Khóa 1 dùng NestJS (CommonJS) → `__dirname` sẵn có.
> Khóa 4 dùng Next.js (ESM) → cần helper trên.

---

## Slide 25 — Anti-pattern phổ biến

### 4 sai lầm cần tránh

**❌ 1. Sync API trong request handler**

```typescript
app.get("/file", (req, res) => {
  const data = fs.readFileSync("big.txt");  // ⛔ block event loop
  res.send(data);
});
```

**❌ 2. Quên `pipeline`, dùng `pipe`**

```typescript
read.pipe(write);  // ⛔ error không cleanup
```

**❌ 3. Buffer hóa stream rồi mới process**

```typescript
const chunks = [];
read.on("data", c => chunks.push(c));
read.on("end", () => process(Buffer.concat(chunks)));
// ⛔ Phản tác dụng — load tất cả vào RAM rồi
```

**❌ 4. Không catch error**

```typescript
fs.createReadStream("missing.txt").pipe(res);
// File không tồn tại → unhandled error → server crash
```

---

## Slide 26 — Bài tập thực hành

### 🎯 Code trong `packages/config/src/`

**Bài 1:** Implement `streamCopy` + `streamHash`

- Đặt trong `streams.ts`
- Test với file 100MB + `--max-old-space-size=64`

**Bài 2:** Helper `streamCompress(src, dst)`

```typescript
// Compress file dst = src + ".gz"
// Dùng pipeline + zlib.createGzip
```

**Bài 3:** Stream-based line counter

```typescript
async function countLines(path: string): Promise<number>
// Dùng readline + for-await
// Test với file 10 triệu dòng
```

**Bài 4:** HTTP upload endpoint (preview Khóa 4)

```typescript
// POST /upload — stream request body vào /tmp/<uuid>
// Trả về file size + hash
```

---

## Slide 27 — Tổng kết Video 12

### Bạn vừa học

- ✅ Vì sao stream tốt hơn `readFile` cho file lớn
- ✅ 4 loại stream: `Readable`, `Writable`, `Transform`, `Duplex`
- ✅ `pipeline` thay `pipe` — tự cleanup + error propagate
- ✅ `streamCopy` và `streamHash` — production-ready
- ✅ Backpressure — `pipeline` tự xử lý
- ✅ `node:path` cho cross-platform path
- ✅ HTTP request/response cũng là stream

> 💪 File 1GB giờ không còn là vấn đề

---

<!-- _class: lead -->

# Tiếp theo: Video 13

## Biến Môi Trường và Configs

Vì sao không hardcode, `.env` files, validate bằng Zod khi khởi động, fail-fast pattern, quản lý nhiều môi trường.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 13 🚀

> *"Buffer everything? No. Stream everything."*
