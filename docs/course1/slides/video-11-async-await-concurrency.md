---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 11: Async/Await và Concurrency'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Async/Await
# và Concurrency

### Khóa 1 — Video 11

**Từ callback hell → code sạch + chạy song song**

> Học để viết code async như viết code sync

---

## Slide 2 — Mục tiêu video này

Sau 28 phút, bạn sẽ:

- ✅ Nắm hành trình: **Callback → Promise → async/await**
- ✅ Dùng thành thạo **`Promise.all`, `allSettled`, `race`**
- ✅ Tự xây helper **`pMap<T, R>`** giới hạn concurrency
- ✅ Tự xây helper **`retry`** với exponential backoff + jitter
- ✅ Nhận biết và fix **floating promises** và **unhandled rejections**
- ✅ Áp dụng vào dự án LMS thực tế

> 🎯 Cuối video: có `pMap` và `retry` trong `packages/config/`

---

## Slide 3 — Lịch sử ngắn của async trong JS

### 3 đời pattern

**Thế hệ 1: Callbacks (2009)**

```javascript
fs.readFile("a.txt", (err, dataA) => {
  if (err) return handle(err);
  fs.readFile("b.txt", (err, dataB) => {
    if (err) return handle(err);
    fs.readFile("c.txt", (err, dataC) => {
      // callback hell 🌀
    });
  });
});
```

**Thế hệ 2: Promises (ES6, 2015)**

```javascript
readFile("a.txt")
  .then(a => readFile("b.txt").then(b => ({ a, b })))
  .then(({ a, b }) => readFile("c.txt").then(c => ({ a, b, c })))
  .catch(handle);
```

**Thế hệ 3: async/await (ES2017)**

```typescript
const a = await readFile("a.txt");
const b = await readFile("b.txt");
const c = await readFile("c.txt");  // ✨
```

---

## Slide 4 — Promise: 3 trạng thái

### Cơ bản phải hiểu

```typescript
const promise = new Promise<string>((resolve, reject) => {
  setTimeout(() => {
    if (Math.random() > 0.5) {
      resolve("Success!");      // → fulfilled
    } else {
      reject(new Error("Fail")); // → rejected
    }
  }, 1000);
});
```

**3 trạng thái:**

- **pending** — đang chờ
- **fulfilled** — đã resolve thành công
- **rejected** — đã reject với lỗi

> 💡 Một khi đã fulfilled/rejected → **không đổi được**

---

## Slide 5 — async/await: Syntactic sugar cho Promise

### `async` function luôn trả Promise

```typescript
// 2 dòng này hoàn toàn tương đương
async function getUser() {
  return { id: "1", name: "Alice" };
}

function getUser() {
  return Promise.resolve({ id: "1", name: "Alice" });
}

// Cả 2 đều return Promise<{ id: string; name: string }>
```

**`await` "unwrap" Promise:**

```typescript
async function main() {
  const user = await getUser();
  //    ^^^^ type: { id: string; name: string }
  // không phải Promise
}
```

---

## Slide 6 — Error handling với try/catch

### Quay về syntax đồng bộ

**❌ Promise chain — lằng nhằng**

```typescript
fetchUser(id)
  .then(user => fetchPosts(user.id))
  .then(posts => render(posts))
  .catch(err => handleError(err));
```

**✅ async/await — như sync code**

```typescript
async function show(id: string) {
  try {
    const user = await fetchUser(id);
    const posts = await fetchPosts(user.id);
    render(posts);
  } catch (err) {
    handleError(err);
  }
}
```

> 💡 try/catch bắt được cả lỗi sync và lỗi từ `await`

---

## Slide 7 — Sequential vs Parallel: Khác nhau lớn

### Chạy nối tiếp

```typescript
async function fetchAll() {
  const user = await fetchUser("u-1");      // 100ms
  const posts = await fetchPosts("u-1");    // 100ms
  const tags = await fetchTags("u-1");      // 100ms
  return { user, posts, tags };
}
// Tổng: 300ms
```

### Chạy song song với `Promise.all`

```typescript
async function fetchAll() {
  const [user, posts, tags] = await Promise.all([
    fetchUser("u-1"),
    fetchPosts("u-1"),
    fetchTags("u-1"),
  ]);
  return { user, posts, tags };
}
// Tổng: 100ms (chạy đồng thời!)
```

> 🚀 3x nhanh hơn — chỉ bằng cách sửa 1 chỗ

---

## Slide 8 — `Promise.all`: All-or-nothing

### Đặc điểm

```typescript
const results = await Promise.all([
  fetch("/api/1"),   // ✅
  fetch("/api/2"),   // ❌ throw
  fetch("/api/3"),   // ✅
]);
// ❌ Promise.all reject ngay khi BẤT KỲ promise nào reject
// → results không bao giờ được gán
// → /api/1 và /api/3 vẫn chạy (không cancel)
```

**Khi nào dùng:**

- ✅ Cần CẢ kết quả mới ý nghĩa (vd: load user + permissions + settings)
- ❌ KHÔNG dùng khi 1 lỗi không nên dừng cả batch

---

## Slide 9 — `Promise.allSettled`: Đợi hết, không reject

### An toàn hơn `Promise.all`

```typescript
const results = await Promise.allSettled([
  fetch("/api/1"),
  fetch("/api/2"),
  fetch("/api/3"),
]);

for (const result of results) {
  if (result.status === "fulfilled") {
    console.log("OK:", result.value);
  } else {
    console.log("Fail:", result.reason);
  }
}
```

**Khi nào dùng:**

- ✅ Batch gửi email (1 fail không nên dừng các email khác)
- ✅ Batch process nhiều resource độc lập
- ✅ Cleanup/logging — best-effort

---

## Slide 10 — `Promise.race`: Đua, lấy thằng đầu

### Resolved hoặc rejected — cái nào nhanh hơn

```typescript
const fastest = await Promise.race([
  fetch("/api/server-us"),
  fetch("/api/server-eu"),
  fetch("/api/server-asia"),
]);
// Trả về response của server nào về trước
```

### Use case kinh điển: Timeout

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), ms)
  );
  return Promise.race([promise, timeout]);
}

const data = await withTimeout(fetchUser("u-1"), 5000);
```

---

## Slide 11 — `Promise.any`: Bất kỳ thằng nào fulfilled

### Khác race ở chỗ ignore reject

```typescript
const data = await Promise.any([
  fetch("/api/mirror-1"),   // ❌ reject
  fetch("/api/mirror-2"),   // ✅ fulfilled (đầu tiên)
  fetch("/api/mirror-3"),   // ✅ fulfilled
]);
// → trả về kết quả từ mirror-2

// Chỉ reject khi TẤT CẢ đều reject
try {
  await Promise.any([Promise.reject("a"), Promise.reject("b")]);
} catch (err) {
  console.log(err);  // AggregateError: All promises were rejected
}
```

**Use case:**

- Failover giữa nhiều CDN
- Fetch từ nhiều mirror, lấy thằng nào thành công đầu tiên

---

## Slide 12 — So sánh 4 Promise combinator

| Method | Resolve khi | Reject khi |
|--------|-------------|-----------|
| `Promise.all` | TẤT CẢ fulfilled | BẤT KỲ rejected |
| `Promise.allSettled` | TẤT CẢ settled | Không bao giờ reject |
| `Promise.race` | THẰNG ĐẦU settled (resolve hoặc reject) | THẰNG ĐẦU reject |
| `Promise.any` | THẰNG ĐẦU fulfilled | TẤT CẢ rejected |

### Cheatsheet chọn

- Tất cả phải pass → `all`
- Không quan tâm vài cái fail → `allSettled`
- Race lấy nhanh nhất → `race`
- Race nhưng skip fail → `any`

---

## Slide 13 — Vấn đề: `Promise.all` không giới hạn concurrency

### Ví dụ: Gửi 1000 email

```typescript
const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@x.com`);

// ❌ Gửi 1000 cùng lúc
await Promise.all(emails.map(e => sendEmail(e)));
// → mail server bị flood
// → file descriptor exhausted
// → IP có thể bị block
```

**Cần:** giới hạn concurrency (vd: 5 email cùng lúc)

```typescript
// ✅ Mục tiêu API
await pMap(emails, sendEmail, { concurrency: 5 });
```

---

## Slide 14 — Tự build `pMap`: Phiên bản đầy đủ

### File `/packages/config/src/concurrency.ts`

```typescript
export async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { concurrency?: number } = {}
): Promise<R[]> {
  const { concurrency = 5 } = options;
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const i = currentIndex++;
      results[i] = await fn(items[i]!, i);
    }
  }

  // Spawn N worker chạy song song
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker
  );

  await Promise.all(workers);
  return results;
}
```

---

## Slide 15 — Sử dụng `pMap` thực tế

### Use case LMS: AI summarize batch

```typescript
import { pMap } from "@lms/config";

async function summarizeAllLessons(lessons: Lesson[]) {
  return pMap(
    lessons,
    async (lesson) => {
      const summary = await callClaudeAPI(lesson.content);
      return { lessonId: lesson.id, summary };
    },
    { concurrency: 3 }  // không spam Claude API
  );
}

// Other use cases:
// - Batch resize images
// - Batch send notifications
// - Batch validate URLs
```

> 💡 Khóa 5 sẽ dùng `pMap` cho AI batch processing — không reset rate limit

---

## Slide 16 — Test `pMap`: Đảm bảo concurrency đúng

```typescript
import { describe, it, expect } from "vitest";
import { pMap } from "./concurrency";

describe("pMap", () => {
  it("respects concurrency limit", async () => {
    let inflight = 0;
    let maxInflight = 0;

    await pMap(
      Array.from({ length: 20 }, (_, i) => i),
      async (n) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise(r => setTimeout(r, 10));
        inflight--;
        return n * 2;
      },
      { concurrency: 5 }
    );

    expect(maxInflight).toBeLessThanOrEqual(5);
  });

  it("preserves order in results", async () => {
    const result = await pMap([1, 2, 3], async (n) => n * 10);
    expect(result).toEqual([10, 20, 30]);
  });
});
```

---

## Slide 17 — Vấn đề: Network/API có thể fail tạm thời

### Tình huống thực tế

```typescript
// Claude API thi thoảng 429 (rate limit) hoặc 500 (server error)
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  body: JSON.stringify({ /* ... */ }),
});

if (response.status === 429) {
  // Server bảo đợi rồi thử lại
}
```

**Cần:** retry với strategy thông minh

```typescript
// ✅ API mục tiêu
const result = await retry(
  () => callClaudeAPI(prompt),
  { retries: 3, baseMs: 200 }
);
```

---

## Slide 18 — Tự build `retry`: Exponential backoff + jitter

### File `/packages/config/src/concurrency.ts`

```typescript
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    baseMs?: number;
    maxMs?: number;
    onRetry?: (err: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const { retries = 3, baseMs = 200, maxMs = 5000, onRetry } = options;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;

      // Exponential backoff: 200, 400, 800, 1600 ms...
      // + jitter để tránh "thundering herd"
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) + Math.random() * baseMs;
      onRetry?.(err, attempt + 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

---

## Slide 19 — Tại sao cần JITTER?

### "Thundering herd problem"

**Không có jitter:**

```
1000 client cùng fail tại t=0
→ tất cả retry tại t=200ms      ← spike!
→ tất cả fail lại
→ tất cả retry tại t=400ms      ← spike lớn hơn!
→ server đổ
```

**Có jitter (random 0-baseMs):**

```
1000 client cùng fail tại t=0
→ retry trải đều từ t=200ms đến t=400ms  ← smooth
→ server xử lý được
```

> 💡 Industry standard: AWS, Google đều dùng "Exponential Backoff with Full Jitter"

---

## Slide 20 — Sử dụng `retry` thực tế

### Use case LMS

```typescript
import { retry } from "@lms/config";

// Gọi Claude API có retry
async function summarizeLesson(content: string): Promise<string> {
  return retry(
    async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", { /* ... */ });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    {
      retries: 3,
      baseMs: 500,
      onRetry: (err, attempt) => {
        logger.warn({ err, attempt }, "Claude retry");
      },
    }
  );
}

// Kết hợp pMap + retry
await pMap(
  lessons,
  (l) => retry(() => summarizeLesson(l.content)),
  { concurrency: 3 }
);
```

---

## Slide 21 — Floating Promises: Bug lặng lẽ

### Quên `await` → lỗi không bao giờ phát hiện

```typescript
// ❌ Floating promise — lỗi biến mất silently
async function handler() {
  saveToDb(user);  // quên await!
  res.json({ ok: true });
}

// Nếu saveToDb throw → unhandled rejection
// Response đã gửi → user nghĩ thành công
// → DB thật ra không lưu được
```

**ESLint rule bắt buộc:**

```json
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error"
  }
}
```

**Output ESLint:**
```
error: Promises must be awaited, end with a call to .catch...
```

---

## Slide 22 — Fix floating promise: 3 cách

```typescript
// 1. await (default)
async function handler() {
  await saveToDb(user);
  res.json({ ok: true });
}

// 2. void operator (cố ý fire-and-forget)
function handler() {
  void analytics.track("click");  // explicit ignore
  return render();
}

// 3. .catch (handle error riêng)
function handler() {
  saveToDb(user).catch(err => logger.error(err));
  res.json({ ok: true });
}
```

> 💡 **Quy tắc:** Mọi async call phải có 1 trong 3. ESLint sẽ chặn nếu không.

---

## Slide 23 — Unhandled Rejection: Server có thể crash

### Listen để debug

```typescript
// /apps/api/src/main.ts
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
  // Log vào monitoring (Sentry, Datadog)
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Graceful shutdown
  process.exit(1);
});
```

**Node 15+:** unhandled rejection → process exit (mặc định)

**Best practice:**

- Log → alert
- Graceful shutdown (close DB, finish current requests)
- Restart bằng pm2/Docker

---

## Slide 24 — Pattern: Sequential khi cần thứ tự

### Khi parallel KHÔNG đúng

```typescript
// ❌ Parallel — dependency sai
const [user, posts] = await Promise.all([
  fetchUser("u-1"),
  fetchPostsByUser(user.id),  // user chưa có!
]);

// ✅ Sequential — user phải có trước posts
const user = await fetchUser("u-1");
const posts = await fetchPostsByUser(user.id);

// ✅ Combo: parallel khi có thể, sequential khi cần
const user = await fetchUser("u-1");
const [posts, settings] = await Promise.all([
  fetchPostsByUser(user.id),
  fetchSettings(user.id),
]);
```

---

## Slide 25 — Pattern: For-loop async đúng cách

### 3 cách iterate array async

```typescript
const ids = ["a", "b", "c"];

// 1. Sequential — for...of với await
for (const id of ids) {
  await processItem(id);    // ✅ chờ từng cái
}

// 2. Parallel — Promise.all + map
await Promise.all(ids.map(id => processItem(id)));   // ✅

// 3. ❌ forEach KHÔNG await được
ids.forEach(async (id) => {
  await processItem(id);    // floating promise!
});
// → return ngay, không chờ → bug
```

> 🚨 **Quy tắc:** `.forEach` + async = sai. Dùng `for...of` hoặc `Promise.all`

---

## Slide 26 — Áp dụng cho LMS: Batch enroll students

### Real-world example

```typescript
import { pMap, retry } from "@lms/config";

async function enrollStudents(
  studentIds: string[],
  courseId: string
): Promise<EnrollResult[]> {
  return pMap(
    studentIds,
    async (studentId) =>
      retry(
        async () => {
          await checkAlreadyEnrolled(studentId, courseId);
          const enrollment = await createEnrollment(studentId, courseId);
          await sendWelcomeEmail(studentId);
          return { studentId, ok: true };
        },
        { retries: 2 }
      ).catch((err) => ({
        studentId,
        ok: false,
        error: getErrorMessage(err),
      })),
    { concurrency: 10 }
  );
}
```

---

## Slide 27 — Bài tập thực hành

### 🎯 Code trong `packages/config/src/`

**Bài 1:** Tạo `pMap` và `retry` đầy đủ test

- Concurrency limit đúng
- Order preserve
- Error propagation
- Retry với jitter

**Bài 2:** Helper `withTimeout<T>(promise, ms)`

```typescript
// Throw "Timeout" nếu promise không resolve trong ms
const data = await withTimeout(slowApi(), 5000);
```

**Bài 3:** Helper `debounceAsync<T>(fn, ms)`

```typescript
// Gọi fn nhiều lần liên tục → chỉ chạy 1 lần sau ms
const search = debounceAsync(searchApi, 300);
search("a"); search("ab"); search("abc");  // chỉ "abc" gọi
```

**Bài 4:** Trigger floating promise → xem ESLint báo

---

## Slide 28 — Tổng kết Video 11

### Bạn vừa học

- ✅ Callback → Promise → async/await — lịch sử async JS
- ✅ Promise có 3 state: pending, fulfilled, rejected
- ✅ 4 combinator: `all`, `allSettled`, `race`, `any`
- ✅ Self-build `pMap` với concurrency limit
- ✅ Self-build `retry` với exponential backoff + jitter
- ✅ Floating promises + unhandled rejections — debug như thế nào
- ✅ Sequential vs Parallel — chọn khi nào

> 💪 Giờ code async của bạn = clean + fast + safe

---

<!-- _class: lead -->

# Tiếp theo: Video 12

## Streams và File System

Stream tốt hơn `readFile` cho file lớn. `Readable`, `Writable`, `Transform`. Viết `streamCopy` và `streamHash`. Backpressure là gì.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 12 🚀

> *"Concurrency is about dealing with lots of things at once.*
> *Parallelism is about doing lots of things at once."*
> *— Rob Pike*
