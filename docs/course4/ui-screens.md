# Course 4 — UI/UX Screens (Student Dashboard)

> **Course 4 — Building the Student Dashboard** (React + TanStack Query) là khoá FE chính theo syllabus.
> File này lưu spec UI/UX của Next.js (`apps/web`). Mỗi màn hình có: **mục đích, layout, components, states, accessibility, prompt cho stitch.google.com**.
> 7 màn dưới đây là seed planning ban đầu — Course 4 sẽ mở rộng thêm screens cho Quiz UI, Progress Tracking, Analytics widgets, v.v. theo syllabus PDF (Sections 4 & 7).

---

## Design System (dùng chung mọi màn)

| Token | Value |
|-------|-------|
| Brand | **AI LMS** — tagline: "Learn smarter with AI" |
| Style | Modern minimal, generous whitespace, rounded-2xl cards, subtle shadows |
| Primary | `#6366F1` (indigo-500) |
| Secondary | `#0EA5E9` (sky-500) |
| Accent | `#A855F7` (purple-500) — biểu tượng AI |
| Success | `#10B981` (emerald-500) |
| Warning | `#F59E0B` (amber-500) |
| Error | `#EF4444` (red-500) |
| Background | `#F8FAFC` (slate-50) light · `#0F172A` (slate-900) dark |
| Surface | `#FFFFFF` light · `#1E293B` dark |
| Text | `#0F172A` / `#F1F5F9` (dark) |
| Border | `#E2E8F0` / `#334155` (dark) |
| Font | Inter (UI), JetBrains Mono (code) |
| Radius | `sm: 6px`, `md: 12px`, `lg: 16px`, `2xl: 24px` |
| Shadow | `sm: 0 1px 2px rgba(0,0,0,.05)`, `lg: 0 10px 25px rgba(15,23,42,.08)` |
| Breakpoints | `sm 640`, `md 768`, `lg 1024`, `xl 1280` |

**Conventions:**
- Mọi page là **Server Component** mặc định; chuyển sang `"use client"` khi cần state.
- Layout chung: `apps/web/src/app/layout.tsx` chứa `<Header>` + `<Footer>` + `<Toaster>`.
- Loading state dùng `loading.tsx` (Next.js convention) với skeleton.
- Error state dùng `error.tsx` (client component) hiển thị `requestId` để debug.

---

## SCREEN MAP (Course 1)

| ID | Route | Tên màn | Mục đích | Persona |
|----|-------|---------|----------|---------|
| S1 | `/` | Landing Home | Welcome + check trạng thái BE | Mọi người |
| S2 | `/system/health` | System Health | Dashboard sức khoẻ API (dev-facing) | Dev/Admin |
| S3 | `/courses` | Courses Browse | List khoá học (paginated, search) | Student/Visitor |
| S4 | `/courses/new` | Create Course | Form tạo khoá học | Teacher |
| S5 | `/courses/[slug]` | Course Detail (stub) | Xem chi tiết 1 khoá | Student |
| S6 | — | Error / 404 | Hiển thị lỗi + `requestId` | Mọi người |
| S7 | — | Loading Skeleton | State trung gian khi fetch SSR | Mọi người |

---

# S1 — Landing Home `/`

## Mục đích
Trang chào của AI LMS. Hiển thị giá trị cốt lõi + badge **trạng thái backend live** (gọi `GET /health` qua `apiFetch`).

## File
- `/apps/web/src/app/page.tsx` (Server Component)
- `/apps/web/src/components/health-badge.tsx`

## Layout (Desktop)
```
┌──────────────────────────────────────────────────────────────┐
│  [Logo AI LMS]              Docs   GitHub   Sign in (disabled)│   ← Header (sticky)
├──────────────────────────────────────────────────────────────┤
│                                                                │
│         Hero (centered, max-w-3xl)                            │
│         ┌──────────────────────────────────┐                  │
│         │  Learn smarter with AI           │  ← H1, 56px      │
│         │  Bootstrapping the AI LMS — K1   │  ← muted         │
│         │  [Browse courses] [Read docs]    │  ← 2 CTA         │
│         │  ● API healthy · uptime 3h 12m   │  ← Health badge  │
│         └──────────────────────────────────┘                  │
│                                                                │
│         3-column features grid                                 │
│         ┌────────┐ ┌────────┐ ┌────────┐                      │
│         │ NestJS │ │ Next.js│ │ Zod    │                      │
│         │ API    │ │ App    │ │ types  │                      │
│         └────────┘ └────────┘ └────────┘                      │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  © 2026 AI LMS · v0.1.0 · request-id: shown on hover         │   ← Footer
└──────────────────────────────────────────────────────────────┘
```

## Components & Behavior
| Component | Note |
|-----------|------|
| Header | Sticky, blur backdrop khi scroll, logo SVG indigo→purple gradient |
| Hero H1 | Gradient text indigo→purple, font-bold |
| CTA primary | bg `primary`, text white, `hover:opacity-90`, `focus:ring-2 ring-primary/40` |
| CTA secondary | outline, border-slate-300 |
| HealthBadge | Server-side fetch `apiFetch<HealthResponse>("/health", { schema })`. Dot xanh nếu `status="ok"`, đỏ nếu fail. Show `uptime` format human. |
| Features grid | 3 cards rounded-2xl, icon top, title 18px, description 14px slate-500 |
| Footer | 1 dòng, font-mono nhỏ, link `/system/health` |

## States
- **Default:** badge xanh + uptime.
- **BE down:** badge đỏ "API unreachable", CTA `Browse courses` disabled với tooltip.
- **Loading SSR:** dùng `loading.tsx` skeleton.

## Accessibility
- H1 chỉ 1 lần, contrast ≥ 4.5:1.
- CTA có `aria-label` rõ nghĩa.
- Badge có `role="status"` + screen-reader text "Backend status: ok".

## 🎨 Stitch Prompt

```
Design a modern minimal landing page for an AI-powered Learning Management
System called "AI LMS", with the tagline "Learn smarter with AI". Use a sticky
top header containing the AI LMS logo on the left (indigo-to-purple gradient
mark + wordmark) and three navigation items on the right: "Docs", "GitHub",
and a disabled "Sign in" button. Below the header, create a centered hero
section on a slate-50 background with a large gradient H1 reading "Learn
smarter with AI", a smaller muted subtitle "Bootstrapping the AI LMS —
Course 1", two CTAs side by side ("Browse courses" filled indigo-500 primary,
"Read docs" outlined), and a small pill-shaped status badge directly under
the CTAs showing a green dot and text "API healthy · uptime 3h 12m". Below
the hero, a three-column feature grid of rounded-2xl white cards with subtle
shadow, each card having an icon at the top (a NestJS hex logo for the first,
Next.js triangle for the second, a Zod shield for the third), a 18px bold
title ("NestJS API", "Next.js App", "Zod types"), and a 14px slate-500
description of one sentence. End with a thin centered footer in monospace
text: "© 2026 AI LMS · v0.1.0 · request-id: ...". Use Inter font for UI,
indigo-500 (#6366F1) as primary, purple-500 (#A855F7) as accent, plenty of
whitespace, rounded-2xl corners, and a soft shadow language. Provide both
light (slate-50 background) and dark (slate-900 background, slate-100 text)
variants. Make it fully responsive: on mobile, header collapses to a
hamburger, hero text scales down, and the feature grid stacks vertically.
```

---

# S2 — System Health `/system/health`

## Mục đích
Trang dev-facing hiển thị chi tiết `GET /health`: status, uptime, version, timestamp, last 10 requests log (mock từ in-memory buffer ở BE Course 1 — Course 6 sẽ thay log realtime).

## File
- `/apps/web/src/app/system/health/page.tsx`
- `/apps/web/src/components/metric-card.tsx`
- `/apps/web/src/components/status-pill.tsx`

## Layout
```
┌──────────────────────────────────────────────────────────────┐
│ Header                                                         │
├──────────────────────────────────────────────────────────────┤
│ Breadcrumb: Home / System / Health                             │
│ H1: System Health    [Refresh ⟲]                              │
│                                                                │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │ Status  │ │ Uptime  │ │ Version │ │ Now     │                │
│ │ ● ok    │ │ 3h 12m  │ │ 0.1.0   │ │ 10:42   │                │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│                                                                │
│ Recent requests (table)                                        │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ time     method  path        status  durationMs  reqId  │   │
│ │ 10:42:01 GET     /courses    200     12ms        a3f.. │   │
│ │ 10:41:58 POST    /courses    201     47ms        b1c.. │   │
│ │ 10:41:55 GET     /health     200     2ms         d9e.. │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## Components & Behavior
| Component | Note |
|-----------|------|
| MetricCard | 4 ô, mỗi ô có icon, label nhỏ slate-500, value bold 24px |
| StatusPill | Green/red dot + label |
| RefreshButton | Client component, gọi lại `apiFetch`, có spinner khi loading |
| LogTable | Stripe alternate, status code badge màu (2xx xanh, 4xx vàng, 5xx đỏ), `reqId` copyable |

## States
- **Loading:** 4 skeleton card + 5 skeleton rows.
- **Error:** Banner đỏ "Cannot reach API" + retry button.
- **Empty logs:** Empty state với illustration đơn giản + "No requests yet".

## 🎨 Stitch Prompt

```
Design a developer-facing system health dashboard for a NestJS API, modern
minimal style with a slate-50 background. Top of the page has a breadcrumb
"Home / System / Health" in slate-500 small text, then an H1 reading "System
Health" with a circular refresh icon button on the right aligned. Below the
H1, render four equal metric cards in a single row (stacks on mobile): each
card is a rounded-2xl white card with subtle shadow, an icon at the top-left
(heartbeat for Status, clock for Uptime, tag for Version, calendar for Now),
a small slate-500 label, and a large 24px bold value. The Status card shows
a green dot followed by the word "ok"; Uptime shows "3h 12m"; Version shows
"0.1.0"; Now shows "10:42 UTC". Below the cards, a section titled "Recent
requests" with a full-width white card containing a striped table. Columns:
"Time" (mono), "Method" (colored chip — GET sky, POST emerald, DELETE red,
PUT amber), "Path" (mono), "Status" (colored pill — 2xx emerald, 4xx amber,
5xx red), "Duration" (mono e.g. "12ms"), "Request ID" (truncated UUID with
a copy icon on hover). Show 8 example rows. Use Inter font, indigo-500 as
the primary accent for the refresh button, JetBrains Mono for monospace
fields. Include a sticky header above and an "Empty state" variant showing
a friendly illustration of an empty inbox and the text "No requests yet"
when the table has zero rows. Provide light and dark themes. Fully
responsive: cards become 2x2 grid on tablet and 1-column on mobile, table
collapses to stacked cards on mobile.
```

---

# S3 — Courses Browse `/courses`

## Mục đích
List khoá học (gọi `GET /courses?page&pageSize&q`). Có search box, pagination, empty state.

## File
- `/apps/web/src/app/courses/page.tsx` (Server Component nhận `searchParams`)
- `/apps/web/src/components/course-card.tsx`
- `/apps/web/src/components/pagination.tsx`
- `/apps/web/src/components/search-input.tsx` (client component, push query string)

## Layout
```
┌──────────────────────────────────────────────────────────────┐
│ Header                                                         │
├──────────────────────────────────────────────────────────────┤
│ H1: Browse courses          [+ New course] (chỉ teacher)      │
│ [🔍 Search courses...]      Filter: All ▾  Sort: Newest ▾    │
│                                                                │
│ Grid 3-cols (sm:1, md:2, lg:3)                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │ [cover]  │ │ [cover]  │ │ [cover]  │                        │
│ │ Title    │ │ Title    │ │ Title    │                        │
│ │ Teacher  │ │ Teacher  │ │ Teacher  │                        │
│ │ 12 lessons│ │ 8 lessons│ │ 20 lessons│                       │
│ │ [Enroll] │ │ [Enroll] │ │ [Enroll] │                        │
│ └──────────┘ └──────────┘ └──────────┘                        │
│                                                                │
│         ← Prev   1 2 3 ... 8   Next →                          │
└──────────────────────────────────────────────────────────────┘
```

## Components & Behavior
| Component | Note |
|-----------|------|
| SearchInput | Debounce 300ms, push `?q=` vào URL |
| CourseCard | Hover lift `translate-y-[-2px]` + shadow tăng. Click → `/courses/[slug]` |
| Cover | Gradient placeholder nếu chưa upload (Course 1 chưa có image upload) |
| Badge | "Published" emerald, "Draft" slate |
| Pagination | URL-driven (`?page=`), 5 số quanh current + ellipsis |

## States
- **Loading:** 6 skeleton card.
- **Empty (q="..."):** "No courses match 'foo'" + clear search.
- **Empty (no data):** "No courses yet. Be the first to create one." + CTA → `/courses/new`.

## 🎨 Stitch Prompt

```
Design a course browsing page for an AI LMS platform, modern minimal style
on a slate-50 background. The header at top has the AI LMS logo on the left
and primary navigation. Below, a page header section with H1 "Browse courses"
on the left and a filled indigo-500 primary button "+ New course" on the
right (only visible for teachers). The next row contains a wide search input
with a magnifying glass icon and placeholder "Search courses..." on the
left, taking ~60% width, plus two compact dropdown filters on the right:
"Filter: All ▾" and "Sort: Newest ▾", all in a single horizontal row.
Below, render a responsive 3-column grid of course cards (1 column on
mobile, 2 on tablet, 3 on desktop). Each course card is a rounded-2xl white
card with subtle shadow, hover-lifts slightly. The card contains: a 16:9
cover image at top (use an abstract indigo-to-purple gradient placeholder
when no image), a small colored chip in the top-right corner over the cover
saying "Published" (emerald) or "Draft" (slate), then card body with: course
title (18px bold, two-line clamp), teacher name with a small avatar circle
(14px slate-500), a row with two metadata pills — "12 lessons" and a
duration like "3h 40m" — in slate-100 background, and a full-width outlined
"Enroll" button at the bottom. Show 9 example cards with varied gradients.
Below the grid, a centered pagination component: "← Prev   1 2 3 ... 8
Next →", current page styled as indigo-500 filled, others as ghost. Provide
three states: default with cards, an empty-state variant ("No courses match
'foo'" with a clear-search link), and a loading-state variant showing 6
shimmer skeleton cards. Use Inter font. Light and dark themes. Mobile-first
responsive layout.
```

---

# S4 — Create Course `/courses/new`

## Mục đích
Form tạo khoá học (gọi `POST /courses`). Validate phía client bằng cùng `CreateCourseDto` (Zod) đang dùng ở backend.

## File
- `/apps/web/src/app/courses/new/page.tsx` (Client Component vì có form state)
- `/apps/web/src/components/form/text-field.tsx`
- `/apps/web/src/components/form/textarea-field.tsx`
- `/apps/web/src/components/form/switch-field.tsx`

## Layout
```
┌──────────────────────────────────────────────────────────────┐
│ Header                                                         │
├──────────────────────────────────────────────────────────────┤
│ Breadcrumb: Courses / New                                      │
│                                                                │
│ ┌─────────────────────────────────────────────┐               │
│ │ H1: Create a new course                     │               │
│ │ Caption: Fill in the details below.         │               │
│ │                                              │               │
│ │ Title *           [_________________]       │               │
│ │ ↳ helper: 3–200 chars                       │               │
│ │                                              │               │
│ │ Slug *            [_________________]       │               │
│ │ ↳ helper: lowercase, hyphens only           │               │
│ │ ↳ preview: ai-lms.com/courses/<slug>        │               │
│ │                                              │               │
│ │ Description *     [_________________]       │               │
│ │                   [_________________]       │               │
│ │                   [_________________]       │               │
│ │ ↳ counter: 1240/2000                        │               │
│ │                                              │               │
│ │ Published         [⚪⚫] off                  │               │
│ │                                              │               │
│ │            [Cancel]    [Create course]       │               │
│ └─────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

## Components & Behavior
| Component | Note |
|-----------|------|
| TextField | Label trên, helper xám, error đỏ dưới với icon ⚠ |
| Slug field | Auto-generate từ title (slugify), cho phép edit manual |
| Description | Textarea 5 rows, counter `len/2000` |
| Switch | Toggle published, default off |
| Submit | Disabled khi `formState.isValid === false` hoặc đang submit (`isPending`) |
| Toast | Success → toast emerald "Course created" + redirect `/courses/[slug]`. Error → toast đỏ với `error.message` + `requestId` |

## Validation
- Dùng `react-hook-form` + `zodResolver(CreateCourseDto)` (import từ `@lms/types`).
- Inline error per field từ Zod issues.
- Server-side 409 slug trùng → highlight field `slug` đỏ + message "Slug already taken".

## States
- **Idle:** form rỗng.
- **Submitting:** button có spinner + disabled.
- **Server error 409:** field slug highlight đỏ + helper text replaced.
- **Server error 500:** banner top "Something went wrong (reqId: …)".

## Accessibility
- Mỗi input có `<label htmlFor>` + `aria-describedby` cho helper/error.
- Error message có `role="alert"`.

## 🎨 Stitch Prompt

```
Design a clean course creation form page for an AI LMS, modern minimal style
on a slate-50 background. At the top, a breadcrumb "Courses / New" in
slate-500 small text. Center the page content within a max-width 720px
container. Render the form inside a single rounded-2xl white card with
generous padding (32px) and subtle shadow. Inside the card: an H1 "Create a
new course" in 28px bold, a slate-500 caption "Fill in the details below."
underneath, then a vertical form with the following fields, each with a
label above, the input, and a helper text below in slate-500:
(1) "Title" required, single-line text input, helper "3–200 characters";
(2) "Slug" required, single-line text input with a prefix label
"ai-lms.com/courses/" rendered inside the input as a slate-100 chip, helper
"lowercase letters and hyphens only";
(3) "Description" required, 5-row textarea with a small character counter
"1240 / 2000" aligned bottom-right under the field;
(4) "Published", a toggle switch (off by default) with a description "Make
this course visible to students".
Below all fields, separated by a thin slate-200 divider, a button row aligned
right with a ghost "Cancel" button and a filled indigo-500 "Create course"
primary button. Show three visual states stacked or as variants:
(a) Idle/clean form.
(b) Validation error state: the Title field shows a red border, an
exclamation icon, and red helper text "Title is too short".
(c) Submitting state: the primary button shows a small white spinner inside
and is disabled, all inputs are dimmed.
Add a success toast variant at the top-right of the screen, emerald
background, white text "Course created successfully", and an error toast
variant in red showing "Slug already taken (req: a3f-91...)". Use Inter font.
Light and dark themes. Fully responsive: card spans full width on mobile with
16px padding.
```

---

# S5 — Course Detail (stub) `/courses/[slug]`

## Mục đích
Trang chi tiết — Course 1 chỉ là stub: hiển thị title, description, teacher, danh sách lesson (mock). Course 4 sẽ build đầy đủ.

## File
- `/apps/web/src/app/courses/[slug]/page.tsx` (Server Component, fetch by slug)

## Layout
```
┌──────────────────────────────────────────────────────────────┐
│ Hero banner (gradient) + Cover                                │
│ ┌─────────────────────────────────────────────┐               │
│ │ Breadcrumb: Courses / Intro to System Design│               │
│ │ H1: Intro to System Design                  │               │
│ │ Teacher: Alex Nguyen   12 lessons   3h 40m  │               │
│ │ [Enroll now]                                │               │
│ └─────────────────────────────────────────────┘               │
│                                                                │
│ ┌──────────────────┐  ┌────────────────────┐                  │
│ │ About this course│  │ Lessons (12)       │                  │
│ │ Lorem ipsum...   │  │ 1. Intro    8:24   │                  │
│ │                  │  │ 2. Scaling 12:11   │                  │
│ │                  │  │ 3. ...             │                  │
│ └──────────────────┘  └────────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

## States
- **404:** dùng `not-found.tsx` (xem S6).

## 🎨 Stitch Prompt

```
Design a course detail page for an AI LMS in a modern minimal style. The top
of the page features a full-width hero banner 280px tall with an indigo-to-
purple-to-sky gradient background and a subtle dot pattern overlay. Inside
the banner, left-aligned content within a centered max-width 1200px
container: a breadcrumb "Courses / Intro to System Design" in white-80%, an
H1 "Intro to System Design" in 40px bold white, a metadata row of three
small white-on-translucent chips ("Teacher: Alex Nguyen" with a small avatar,
"12 lessons", "3h 40m"), and a filled white-on-indigo CTA button "Enroll
now" at the bottom of the banner. Below the banner, a two-column layout (1
column on mobile): left column ~60% width contains a card "About this
course" with body text in slate-700 (2–3 paragraphs); right column ~40%
width contains a card "Lessons (12)" with a vertical list of 12 lesson
rows, each row showing a small numbered circle on the left, the lesson
title, a play icon on the right, and a duration like "8:24" in mono.
Hovering a row tints background slate-100. Use Inter font, JetBrains Mono
for durations. Provide light and dark themes. Fully responsive: hero text
scales down on mobile, the two-column collapses to single column with
"Lessons" rendered first below the about section.
```

---

# S6 — Error / 404 Pages

## Mục đích
- `not-found.tsx` (404): khi slug không tồn tại hoặc route sai.
- `error.tsx` (5xx hoặc unhandled): hiển thị `requestId` để user paste cho support.

## Files
- `/apps/web/src/app/not-found.tsx`
- `/apps/web/src/app/error.tsx` (Client Component, nhận `error` prop từ Next)
- `/apps/web/src/components/error-illustration.tsx`

## Layout
```
┌──────────────────────────────────────────────────────────────┐
│                                                                │
│              [Illustration: SVG 240px]                         │
│                                                                │
│              404 — Not Found                                   │
│              The page you're looking for doesn't exist.        │
│                                                                │
│              [← Back home]  [Browse courses]                   │
│                                                                │
│              Need help? Reference: <requestId>                 │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## Variants
| Variant | Code | Title | Sub |
|---------|------|-------|-----|
| 404 | `NOT_FOUND` | Not Found | "The page you're looking for doesn't exist." |
| 500 | `INTERNAL` | Something went wrong | "We've logged the issue. Try again in a moment." |
| 403 | `FORBIDDEN` | Access denied | "You don't have permission to view this page." |
| Offline | — | You appear to be offline | "Check your connection." |

## 🎨 Stitch Prompt

```
Design a friendly error/404 page for an AI LMS, modern minimal style on a
slate-50 background. Center everything vertically and horizontally on the
page. The composition (max-width 480px, stacked vertically with 24px gaps):
(1) A custom SVG illustration 240px tall — a stylized indigo-and-purple
floating book or paper plane lost in space, with small twinkling dot stars
around it, soft and friendly tone, not corporate stock-art.
(2) A small uppercase tracking-wide slate-500 label reading the error code
(e.g. "404" or "500" or "403").
(3) An H1 in 32px bold, centered: "Not Found" (or "Something went wrong",
"Access denied", "You appear to be offline" depending on variant).
(4) A 16px slate-600 body line: "The page you're looking for doesn't exist."
(or matching variant copy).
(5) A row of two centered buttons: filled indigo-500 primary "← Back home"
and outlined "Browse courses".
(6) Below buttons, a tiny mono slate-400 line: "Need help? Reference:
a3f9-...-b1c7" (the request ID), with a small copy icon next to it.
Provide four variants stacked or as separate frames: 404 Not Found,
500 Server Error, 403 Forbidden, and Offline. Use Inter font, JetBrains
Mono for the request ID. Provide light and dark themes. Fully responsive
and accessible — illustration scales down on mobile, all text remains
legible.
```

---

# S7 — Loading Skeleton

## Mục đích
State trung gian khi Next.js đang fetch SSR (dùng convention `loading.tsx` ở mỗi route).

## Files
- `/apps/web/src/app/loading.tsx` (root)
- `/apps/web/src/app/courses/loading.tsx`
- `/apps/web/src/components/skeleton.tsx`

## Layout (cho `/courses`)
- Hide content thật, render 6 card skeleton với shimmer animation.

## Spec Skeleton component
- `<div class="animate-pulse bg-slate-200 rounded-md" style={{width, height}}>`
- Shimmer gradient: linear-gradient từ slate-200 → slate-100 → slate-200, 1.5s loop.

## 🎨 Stitch Prompt

```
Design a loading skeleton state for the courses browse page of an AI LMS.
On a slate-50 background, replicate the same page layout but replace
content with shimmering placeholders. At the top, a skeleton block 36px
tall and 240px wide standing in for the page title, a thinner 16px tall and
120px wide block below for the subtitle. A full-width skeleton bar 44px
tall for the search input. Below, a 3-column responsive grid of 6 skeleton
cards (1 col mobile, 2 tablet, 3 desktop). Each skeleton card is a
rounded-2xl white card with: a 16:9 shimmering block at top representing
the cover, then a stack of 3 lines below — 70% wide bar for title, 40%
wide bar for teacher, 90% wide bar for description — followed by two small
pill-shaped placeholders 20px tall for metadata, and a full-width 40px
button placeholder at bottom. All placeholders use a slate-200 base with
an animated linear-gradient shimmer (slate-200 → slate-100 → slate-200,
1.5 second loop) moving diagonally. Use Inter font for any visible text
(there should be none in this state). Provide light and dark themes (dark
uses slate-700 base with slate-600 shimmer). Fully responsive.
```

---

# WORKFLOW khi dùng Stitch

1. **Mở** [stitch.google.com](https://stitch.google.com).
2. **Chọn New design** → paste prompt từ mục `🎨 Stitch Prompt` của màn cần.
3. **Refine** bằng natural language:
   - "Make the hero darker"
   - "Add a sidebar"
   - "Change primary to indigo-500"
4. **Export**:
   - `Export to Figma` — chỉnh tinh + handoff.
   - `Get HTML/CSS` — paste vào `apps/web/src/app/<route>/page.tsx`, sau đó **adapt sang Tailwind classes** + Next.js components.
5. **Map sang code:** tham chiếu file path ở mỗi screen spec, tạo component theo đúng convention `apps/web/src/components/...`.

---

# CROSS-SCREEN COMPONENTS (build trong K1)

| Component | File | Dùng ở |
|-----------|------|--------|
| `<Header />` | `components/layout/header.tsx` | All |
| `<Footer />` | `components/layout/footer.tsx` | All |
| `<HealthBadge />` | `components/health-badge.tsx` | S1, S2 |
| `<StatusPill status="ok"|"down" />` | `components/status-pill.tsx` | S1, S2 |
| `<MetricCard />` | `components/metric-card.tsx` | S2 |
| `<CourseCard />` | `components/course-card.tsx` | S3 |
| `<Pagination />` | `components/pagination.tsx` | S3 |
| `<SearchInput />` | `components/search-input.tsx` | S3 |
| `<TextField />` `<TextareaField />` `<SwitchField />` | `components/form/*.tsx` | S4 |
| `<Skeleton />` | `components/skeleton.tsx` | S7 |
| `<ErrorIllustration />` | `components/error-illustration.tsx` | S6 |
| `<Toast />` (toaster setup) | `components/toaster.tsx` | All |

---

# DELIVERABLES UI (kết thúc K1)

- ✅ 7 màn (S1–S7) implement bằng Next.js App Router.
- ✅ Tailwind setup + design tokens (colors, fonts, radii) trong `tailwind.config.ts`.
- ✅ Dark mode hoạt động (toggle ở Header hoặc `prefers-color-scheme`).
- ✅ Mọi màn responsive ở 3 breakpoints (mobile/tablet/desktop).
- ✅ Accessibility: keyboard nav được, contrast pass WCAG AA, focus ring rõ ràng.
- ✅ Mỗi screen có Stitch design link (lưu trong CLAUDE.md hoặc README).
