---
marp: true
theme: default
paginate: true
header: 'Khóa 1 — Bootstrapping the AI LMS'
footer: 'Video 10: Hiểu Event Loop'
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Hiểu
# Event Loop

### Khóa 1 — Video 10

**Vì sao Node.js single-thread vẫn nhanh**

> Bí mật của Node.js không nằm ở thread — mà ở event loop

---

## Slide 2 — Mục tiêu video này

Sau 25 phút, bạn sẽ:

- ✅ Hiểu **event loop là gì** — không phải khái niệm vu vơ
- ✅ Biết **vì sao Node.js single-thread vẫn nhanh**
- ✅ Nắm **6 pha của event loop**: timers → pending → poll → check → close → microtasks
- ✅ Phân biệt **microtask vs macrotask**
- ✅ So sánh `process.nextTick` vs `Promise.then` vs `setTimeout` vs `setImmediate`
- ✅ Viết **demo `event-loop.ts`** in ra thứ tự log thực tế
- ✅ Hiểu **khi nào code bị block** event loop

> 🎯 Cuối video: bạn predict được output của bất kỳ snippet async nào

---

## Slide 3 — Hỏi mở đầu: Output là gì?

### Bạn dự đoán thử

```typescript
console.log("1");

setTimeout(() => console.log("2"), 0);

Promise.resolve().then(() => console.log("3"));

process.nextTick(() => console.log("4"));

console.log("5");
```

### 🤔 Output sẽ in theo thứ tự nào?

> Hết video này, bạn sẽ trả lời chính xác và giải thích được vì sao

---

## Slide 4 — Đáp án (sẽ hiểu vì sao ở cuối video)

```
1   ← sync
5   ← sync
4   ← process.nextTick (microtask, priority cao nhất)
3   ← Promise.then (microtask)
2   ← setTimeout (macrotask)
```

> 💡 Tin tôi đi — bạn sẽ "à há" lúc slide 20

---

## Slide 5 — Node.js là single-threaded?

### Đúng và sai

**ĐÚNG:** JavaScript chạy trên 1 thread duy nhất (main thread)

**SAI:** Node.js có thread pool (libuv) cho I/O nặng

```
┌─────────────────────────────────────┐
│  Main Thread (V8 JavaScript)        │
│  - Chạy code JS của bạn             │
│  - 1 thread duy nhất                │
└─────────────────────────────────────┘
              ↕ I/O delegate
┌─────────────────────────────────────┐
│  libuv Thread Pool (mặc định 4)     │
│  - fs.readFile, crypto, dns         │
│  - Chạy song song trong background  │
└─────────────────────────────────────┘
```

---

## Slide 6 — Vì sao single-thread vẫn nhanh?

### Bí mật: Non-blocking I/O

**Mô hình truyền thống (PHP, Ruby — đơn giản):**

```
Request 1 → đọc file 100ms → response
Request 2 → CHỜ request 1 xong → đọc file → response
Request 3 → CHỜ tiếp...
```

→ Mỗi request blocking → cần nhiều thread

**Mô hình Node.js:**

```
Request 1 → bắt đầu đọc file → giao cho libuv → main thread RẢNH
Request 2 → bắt đầu đọc file → giao cho libuv → main thread RẢNH
Request 3 → ...
(khi file đọc xong → callback chạy trên main thread)
```

> 🎯 **1 thread phục vụ 10,000 connection đồng thời** — đây là superpower của Node

---

## Slide 7 — Event Loop là gì?

### Định nghĩa đơn giản

> **Event Loop = vòng lặp vô tận kiểm tra "có callback nào sẵn sàng chạy không?"**

```javascript
// Pseudo code của event loop
while (true) {
  // Pha 1: timers (setTimeout, setInterval)
  runDueTimers();

  // Pha 2: pending I/O callbacks
  runPendingCallbacks();

  // Pha 3: poll (đọc/ghi file, network)
  pollForNewIO();

  // Pha 4: check (setImmediate)
  runImmediates();

  // Pha 5: close callbacks
  runCloseHandlers();

  // Giữa MỌI pha: chạy microtasks
  runMicrotasks();
}
```

---

## Slide 8 — 6 pha của Event Loop

### Sơ đồ chính xác

```
   ┌───────────────────────────┐
┌─>│        TIMERS             │  ← setTimeout, setInterval
│  └─────────────┬─────────────┘     đến hạn
│  ┌─────────────┴─────────────┐
│  │     PENDING CALLBACKS     │  ← I/O system callbacks
│  └─────────────┬─────────────┘     (TCP errors...)
│  ┌─────────────┴─────────────┐
│  │       IDLE, PREPARE       │  ← internal use
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           POLL            │  ← I/O (fs.read, network)
│  └─────────────┬─────────────┘     callback
│  ┌─────────────┴─────────────┐
│  │           CHECK           │  ← setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      CLOSE CALLBACKS      │  ← socket.on("close")
   └───────────────────────────┘
```

---

## Slide 9 — Microtask: Chạy GIỮA mọi pha

### Priority cao hơn mọi macrotask

```
┌─ TIMERS pha ──────────────┐
│  Chạy callback A          │
│  → 🔥 Microtask queue chạy NGAY
│  Chạy callback B          │
│  → 🔥 Microtask queue chạy NGAY
└───────────────────────────┘
       ↓ giữa pha
🔥 Tất cả microtask phải xong
       ↓
┌─ POLL pha ────────────────┐
│  ...
```

**2 loại microtask:**

- `process.nextTick()` — **priority cao nhất** (Node-specific)
- `Promise.then()`, `queueMicrotask()` — priority thấp hơn

---

## Slide 10 — Demo: `process.nextTick` ưu tiên cao nhất

```typescript
console.log("1: sync");

process.nextTick(() => console.log("2: nextTick"));

Promise.resolve().then(() => console.log("3: promise"));

console.log("4: sync");

// Output:
// 1: sync
// 4: sync
// 2: nextTick     ← chạy trước Promise!
// 3: promise
```

**Vì sao?**

- Sync code chạy hết trước → `1`, `4`
- Sau sync: microtask queue chạy
- Trong microtask queue: `nextTick` queue trước promise queue
- → `nextTick` luôn chạy trước

---

## Slide 11 — Demo: setTimeout vs setImmediate

### Khác biệt tinh tế

```typescript
import fs from "node:fs";

setTimeout(() => console.log("timeout"), 0);
setImmediate(() => console.log("immediate"));

// Output có thể là:
// timeout, immediate
// HOẶC
// immediate, timeout
// (không deterministic ở top-level!)
```

**NHƯNG trong I/O callback:**

```typescript
fs.readFile(__filename, () => {
  setTimeout(() => console.log("timeout"), 0);
  setImmediate(() => console.log("immediate"));
});

// Output LUÔN là:
// immediate
// timeout
```

> 💡 Trong I/O callback, đang ở POLL pha → CHECK chạy ngay sau

---

## Slide 12 — `setTimeout(fn, 0)`: Không phải "0ms"

### Sự thật phũ phàng

```typescript
console.time("delay");
setTimeout(() => {
  console.timeEnd("delay");
  // Output: delay: 1.234ms (KHÔNG phải 0ms!)
}, 0);
```

**Vì sao có delay?**

- Node.js có **minimum delay** ~1ms cho setTimeout
- Phải chờ đến pha TIMERS của event loop
- Nếu có pha khác đang bận → trễ thêm

**Khi nào dùng `setTimeout(fn, 0)`:**

- "Defer" code chạy sau current tick (giảm CPU spike)
- Bị **deprecated** dần — thay bằng `queueMicrotask` cho microtask hoặc `setImmediate` cho macrotask

---

## Slide 13 — Demo đầy đủ: Predict the output

```typescript
console.log("=== Start ===");

setTimeout(() => console.log("1. setTimeout"), 0);

setImmediate(() => console.log("2. setImmediate"));

Promise.resolve().then(() => console.log("3. promise.then"));

process.nextTick(() => console.log("4. process.nextTick"));

queueMicrotask(() => console.log("5. queueMicrotask"));

console.log("=== End ===");
```

### Bạn predict output trước khi xem slide tiếp theo

---

## Slide 14 — Output và giải thích

```
=== Start ===           ← sync code
=== End ===             ← sync code
4. process.nextTick     ← nextTick queue (priority cao nhất)
3. promise.then         ← microtask queue
5. queueMicrotask       ← microtask queue (cùng queue Promise)
1. setTimeout           ← TIMERS pha
2. setImmediate         ← CHECK pha (sau TIMERS ở top-level chỉ là maybe)
```

**Quy tắc nhớ:**

```
sync → nextTick → microtask → timers → poll → check → close
```

> 💡 **Hiểu rule này = bạn hiểu 90% async behavior của Node.js**

---

## Slide 15 — Code thực tế: File `event-loop.ts`

### Tạo file `/apps/api/src/demos/event-loop.ts`

```typescript
export function demonstrateEventLoop(): void {
  console.log("1. sync");

  setTimeout(() => console.log("4. setTimeout"), 0);

  setImmediate(() => console.log("5. setImmediate"));

  Promise.resolve().then(() => console.log("3. promise.then"));

  process.nextTick(() => console.log("2. process.nextTick"));

  console.log("1.5. sync end");
}

// Chạy
demonstrateEventLoop();
```

### Output mong đợi
```
1. sync
1.5. sync end
2. process.nextTick
3. promise.then
4. setTimeout
5. setImmediate
```

---

## Slide 16 — Test predictably

### File `event-loop.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { demonstrateEventLoop } from "./event-loop";

describe("event loop demo", () => {
  it("logs in expected order", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => {
      logs.push(m);
    });

    demonstrateEventLoop();
    await new Promise((r) => setImmediate(r));  // chờ tất cả callback chạy

    expect(logs).toEqual([
      "1. sync",
      "1.5. sync end",
      "2. process.nextTick",
      "3. promise.then",
      "4. setTimeout",
      "5. setImmediate",
    ]);

    spy.mockRestore();
  });
});
```

---

## Slide 17 — Blocking event loop: Lỗi chí mạng

### Tình huống dễ mắc

```typescript
// ❌ Block event loop 5 giây — toàn server đứng
function badPasswordHash(password: string) {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    // CPU-intensive sync loop
  }
  return hash(password);
}

// Request đến trong 5s đó đều bị treo
app.post("/login", (req, res) => {
  const hashed = badPasswordHash(req.body.password);  // 💀
  res.json({ ok: true });
});
```

> 🚨 **Trong 5 giây này:** 10,000 user đang truy cập đều bị chờ — server "chết"

---

## Slide 18 — Cách phát hiện code block

### 3 cách check

**Cách 1: Đo bằng console.time**

```typescript
console.time("operation");
heavyComputation();
console.timeEnd("operation");
// operation: 3450ms  ← > 100ms là cảnh báo
```

**Cách 2: Module `perf_hooks`**

```typescript
import { performance } from "node:perf_hooks";
const start = performance.now();
heavyComputation();
console.log(`Took ${performance.now() - start}ms`);
```

**Cách 3: Event loop lag monitoring**

```typescript
import { monitorEventLoopDelay } from "node:perf_hooks";
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
// ... một lúc sau
console.log(`Max lag: ${h.max / 1e6}ms`);
```

---

## Slide 19 — Cách fix code block: 3 chiến lược

### Tùy theo loại task

**1. CPU-bound nhỏ → Chia nhỏ với `setImmediate`**

```typescript
function processArray(arr: number[]) {
  function step(i: number) {
    if (i >= arr.length) return;
    doWork(arr[i]);
    setImmediate(() => step(i + 1));  // nhả event loop
  }
  step(0);
}
```

**2. CPU-bound lớn → Worker thread**

```typescript
import { Worker } from "node:worker_threads";
const worker = new Worker("./crypto-worker.js");
worker.postMessage({ password });  // chạy ở thread riêng
```

**3. I/O-bound → Dùng API async**

```typescript
// ❌ fs.readFileSync — block
// ✅ await fs.promises.readFile — non-block
```

---

## Slide 20 — Quay lại câu hỏi đầu video

### Bây giờ bạn giải thích được

```typescript
console.log("1");                                    // sync
setTimeout(() => console.log("2"), 0);               // macrotask (timers)
Promise.resolve().then(() => console.log("3"));      // microtask
process.nextTick(() => console.log("4"));            // microtask (highest)
console.log("5");                                    // sync
```

**Phân tích:**

1. Sync code chạy trước: `1`, `5`
2. Microtask queue: `nextTick` trước `Promise` → `4`, `3`
3. Macrotask queue: `setTimeout` → `2`

**Output:**
```
1
5
4
3
2
```

> 🎉 Bạn đã hiểu event loop!

---

## Slide 21 — Async patterns vs Event Loop

### Quan hệ giữa các API

| API | Loại | Khi nào chạy |
|-----|------|--------------|
| `process.nextTick` | microtask | NGAY sau current operation |
| `queueMicrotask` | microtask | Sau nextTick queue |
| `Promise.then` | microtask | Sau nextTick queue |
| `setTimeout(fn, 0)` | macrotask (TIMERS) | Pha TIMERS tiếp theo |
| `setImmediate` | macrotask (CHECK) | Pha CHECK tiếp theo |
| `fs.readFile callback` | macrotask (POLL) | Pha POLL khi I/O xong |
| `socket.on("close")` | macrotask (CLOSE) | Pha CLOSE callbacks |

---

## Slide 22 — Anti-pattern: Lạm dụng `process.nextTick`

### Cảnh báo từ Node.js docs

```typescript
// ❌ Vô tận nextTick → starve event loop!
function recurse() {
  process.nextTick(recurse);  // I/O không bao giờ chạy
}
recurse();

// Server không response request được — vì I/O bị block bởi nextTick
```

**Tại sao nguy hiểm?**

- Microtask queue phải **rỗng** mới chuyển pha
- `nextTick` thêm vào queue liên tục → queue không bao giờ rỗng
- → POLL pha không bao giờ chạy → không xử lý network request

> ⚠️ **Quy tắc:** `nextTick` chỉ dùng cho 1 lần "defer", không trong recursion

---

## Slide 23 — Best practice tổng kết

### 5 quy tắc vàng

**1. CPU-heavy work → Worker thread, không phải main thread**

**2. Sync API trong production code → CẤM (`fs.readFileSync`, `crypto.pbkdf2Sync`)**

**3. Khi nào dùng từng API:**

- Defer cho microtask → `queueMicrotask`
- Defer cho macrotask → `setImmediate`
- Defer ưu tiên cực cao → `process.nextTick`

**4. Đo lường trước khi optimize:** `monitorEventLoopDelay`

**5. Hiểu thư viện bạn dùng:**

- `bcrypt.hash` (async) ≠ `bcrypt.hashSync` (block!)

---

## Slide 24 — Visualize: Event loop trong real-time

### Trick: `console.log` từng pha

```typescript
console.log("0. sync start");

setTimeout(() => console.log("3. timers pha"), 0);

setImmediate(() => console.log("4. check pha"));

Promise.resolve()
  .then(() => console.log("2. microtask 1"))
  .then(() => console.log("2.5 microtask 2"));

process.nextTick(() => {
  console.log("1. nextTick 1");
  process.nextTick(() => console.log("1.5 nextTick 2"));
});

console.log("0. sync end");
```

> 🎯 Tự chạy trên máy → so với output dự đoán

---

## Slide 25 — Output của slide trước

```
0. sync start
0. sync end
1. nextTick 1
1.5 nextTick 2     ← nextTick lồng nhau cũng chạy hết trong cùng "drain"
2. microtask 1
2.5 microtask 2    ← Promise.then nối tiếp cũng chạy hết
3. timers pha
4. check pha
```

**Bài học:**

- Microtask queue **drain hoàn toàn** trước khi chuyển pha
- `nextTick` lồng nhau → CHẠY HẾT trước Promise
- `Promise.then` nối tiếp → chạy hết trước macrotask

---

## Slide 26 — Bài tập thực hành

### 🎯 Code trong `apps/api/src/demos/`

**Bài 1:** Tạo `event-loop.ts` đầy đủ 5 loại callback

- Như slide 15 — chạy + đo time mỗi callback

**Bài 2:** Tạo `block-detector.ts`

```typescript
// Code mô phỏng:
// - Có 1 setInterval(() => console.log("tick"), 100)
// - Sau 1s, chạy blocking function 3s
// - Quan sát "tick" bị thiếu trong 3s đó
```

**Bài 3:** Predict output

Cho snippet bất kỳ kết hợp 5 loại callback → viết predict trước khi chạy

**Bài 4:** Viết test

- Capture stdout
- Assert đúng thứ tự
- Tham khảo Slide 16

---

## Slide 27 — Tổng kết Video 10

### Bạn vừa học

- ✅ Node.js single-thread + libuv thread pool
- ✅ Event loop = vòng lặp 6 pha
- ✅ Microtask drain hết giữa mỗi pha
- ✅ `nextTick` > `Promise.then` > `setTimeout/setImmediate`
- ✅ Cách phát hiện code block event loop
- ✅ Chia nhỏ với `setImmediate`, dùng Worker cho CPU-heavy
- ✅ Predict được output của bất kỳ async snippet nào

> 💪 Đây là **kiến thức nền cho mọi optimization** sau này

---

<!-- _class: lead -->

# Tiếp theo: Video 11

## Async/Await và Concurrency

Callback → Promise → async/await. `Promise.all` vs `allSettled` vs `race`. Xây helper `pMap` và `retry` cho dự án.

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Cảm ơn bạn đã xem!

### Hẹn gặp ở Video 11 🚀

> *"Don't block the event loop. Ever."*
> *— Node.js docs*
