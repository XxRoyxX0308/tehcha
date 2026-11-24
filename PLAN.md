# BMS 手搖飲管理系統 — Plan

Source: `資料庫系統.pdf` (SRS v1.0, NTUT). All phases below are built, back end included; the current
architecture, setup and every change against the SRS are in [README.md](README.md).

## What the SRS says

- **Stack:** Vue 3 front end (Node 18+), Laravel and PostgreSQL back end, REST/JSON between them. Redis is used for status push, with a 3-second update target (BMS-N-003).
- **Three roles, mapped to the three sites:**
  - **Customer end:** 顧客 (customer).
  - **Employee end:** 店員 (staff). Staff are scoped to their own store(s) (BR-008).
  - **Company/operations end:** 管理員 (admin). Admin handles accounts, roles and backup/restore. An admin can also be staff.
- **Subsystems that drive the screens:** UMS (users), PIS (products and inventory), SRMS (search and recommendations), SCMS (cart), OCS (orders and pickup), DIS (discounts and points), SRS (sales reports), DBS (database).
- **UI requirements the SRS lists:** CUI-001 to 007 for customers, SUI-001 to 005 for staff, AUI-001 and 002 for admin. Customer pages must work on mobile (RWD).
- **Core business rules the front end must reflect:**
  - Order status goes only forward: received → processing → shipping → closed (BR-001). Customers can cancel only at "received" (BR-006).
  - Total = subtotal (including option surcharges) + 5% tax + shipping (NT$60 for delivery, 0 for pickup) − discounts − points, and never below 0 (BR-002, BR-009).
  - Points: earn 1 point per NT$10 paid, once the order is closed. Redeem at 1 point = NT$1, capped at 50% of the payable amount (BR-003, BR-004). Both rules and the tax/shipping figures are marked tentative in the SRS.
  - Three discount types. Shipping (free above a threshold) and seasonal (a rate over a date range) apply to the whole order. Special-event discounts apply to specific products (a rate or buy-one-get-one), and their periods can't overlap (BR-005, 010, 011).
  - Quantity must be an integer greater than 0 and no more than that store's stock (BR-007). A rating is 1–5, one review per closed order (BR-012).
  - Options are sweetness, ice and topping, each with an extra price.
- **Data model:** 17 entities (section 2.4 / 4.2). Mirror them as mock data and TypeScript types so the back end drops in later.

## Plan

### Phase 0: Foundation
1. Scaffold with Vite, Vue 3, TypeScript, Vue Router, Pinia and Vitest. One app with three route areas (`/`, `/staff`, `/admin`), not three separate projects. Shared components, types and the mock API live in one place; the areas can be split later if needed.
2. Typed API layer with a mock implementation (in-memory data and seed data), swappable for real REST calls later.
3. Auth state and role guards in the router (customer, staff, admin). Staff routes are scoped to their store.
4. Shared UI: layout shell, buttons, forms, modal, toast, table, status badge.
5. Pure functions for pricing, point earn/redeem, the discount stack and valid status transitions. These are the testable core (TR-001 asks for 80% coverage).

### Phase 1: Customer end (mobile-first)

| Screen | SRS ref |
|---|---|
| Register, login, profile and password | CUI-001 |
| Menu browse, search, category and price filter, popular and "your usual" | CUI-002 |
| Product customization modal (sweetness, ice, topping) | CUI-003 |
| Cart and checkout: store, pickup/delivery, price breakdown, points | CUI-004 |
| Live order tracking (4-step progress) and order history, with cancel at "received" | CUI-005 |
| Points balance and history | CUI-006 |
| Store rating and review | CUI-007 |

### Phase 2: Employee end
1. Live order board with a highlight for new orders and one-click status advance (SUI-001).
2. Product CRUD (soft delete) and customization options (SUI-002).
3. Store info and per-store stock and safety stock, with low-stock and sold-out indicators (SUI-003).
4. Discount policy CRUD with the three types and overlap validation (SUI-004).
5. Sales reports for day/week/month, a best-sellers chart and CSV export (SUI-005).

### Phase 3: Company/operations end
1. Account management: create, edit, disable and suspend accounts, assign roles, view members (AUI-001).
2. Backup/restore UI, mocked for now (AUI-002).
3. Optional cross-store overview. Beyond the SRS; skip unless wanted.

### Phase 4: Polish and tests
- Unit tests for pricing, points and the state machine.
- Responsive checks and form validation matching the integrity constraints.
- A mock "real-time" status feed standing in for Redis push.

## Open items

1. Component library for staff/admin: Element Plus or Naive UI, versus hand-built. (Customer site is custom-styled regardless.)
2. UI language: Traditional Chinese, English, or switchable.
3. The ER diagram is an image in the PDF; field tables in sections 2.4 and 4.2 were used instead.
4. The cart is keyed by `user_id` in section 2.4 but `member_id` in section 4.2. Using `member_id`.

## Customer design direction

Brand: **得茶 Tehcha**. Logo is a vertical red 白文 seal reading 得 / 茶, paired with the wordmark "得茶 · Tehcha". Hero line: 得茶，且得閒.

Traditional Chinese tea / 青花 (qinghua) porcelain, earthy and minimalist. No generic corporate templates, no purple gradient blobs.

Taken from `UI inspo/`:
- **Jia Mi recipes site:** warm cream paper background, a single cobalt-blue ink for everything (text, icons, buttons), hand-drawn porcelain line illustrations (teapot, bowl, cups), outline pill buttons, a thin porcelain-pattern strip as the footer divider, serif headings, a lot of empty space.
- **新中式 herbal tea cards:** paper-label cards with a thin rule under the title, a small English title paired with a Chinese poetic line, a red seal stamp in the corner, and an olive/earth-gold backdrop.

Tokens:

| Token | Value | Use |
|---|---|---|
| paper | `#F8F1E7` | page background |
| paper-deep | `#EFE5D3` | cards, image wells |
| ink | `#2B2118` | body text (warm brown-black) |
| qinghua | `#23339B` | brand ink: headings, links, buttons, illustrations |
| seal | `#A32A2F` | stamp and sold-out / alert accents only |
| tea | `#8A6A3F` | secondary text, prices |
| olive | `#A39A5E` | section backdrops, hover wash |
| line | `#CFC2A9` | hairlines |

Type: Noto Serif TC for headings and prices, Noto Sans TC for body. Chinese is the primary label with a small English line underneath, as in the references.

Rules: no photos (illustrated cups instead), no gradients, no drop-shadow stacks, one accent per screen, flat paper cards separated by hairlines.

## Decisions made while building (override if wrong)

- Back end: TypeScript (Hono + node-postgres) on Vercel instead of Laravel; schema, constraints and REST shape follow the SRS. See README, "與規格書不同的地方".
- Customer UI: no component library, hand-written CSS; the staff and admin console uses the same tokens.
- Language: Traditional Chinese primary, English secondary, no switcher.
- `Discount.discount_rate` is the fraction taken off (0.1 = 10% off = 9 折).
- Tax is computed on the item subtotal before discounts.
- Amounts are computed only by the API (`POST /api/quote` and the order), so screen and receipt agree.
- A guest's cart is kept in `localStorage` and merges into the account's server cart at sign-in.
- Live status (order tracking, staff board) polls every 3 seconds instead of a Redis push.
