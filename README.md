# cafe-backend

Backend for a cafe point-of-sale (POS) system, built with Node.js and Express 5 using ES modules.

## Current status

P01 foundation: testable Express app, validated environment, request/error envelopes, public liveness, protected DB readiness, Prisma Client with MariaDB adapter, native test harness and transaction helpers. P02 adds cookie authentication, session rotation/revocation, CSRF, password change and first-admin bootstrap. P03 adds employee administration, cafe settings/logo uploads, pricing-rule configuration and payment-method configuration. P04 adds categories, product lifecycle/promotions/images and the filtered POS menu. P05 adds variant/add-on configuration and pure selection validation. P06 adds register management, atomic shift opening/closure, histories and sales summaries. P07a adds Decimal-priced quotes, idempotent order creation and scoped reads. P07b adds captured-price order editing, holds/discounts, preparation history and unpaid cancellation. P08 adds atomic cash/manual QRIS settlement, receipt issuance, pending recovery CLI and sanitized payment reads. P09 adds scoped snapshot receipt JSON, safe58/80mm HTML/reprint/history and downloadable local-font PDF. P10a adds employee histories/owner sales summaries and seven snapshot-based reports. Dashboard/export endpoints remain future phases. Initial migration covers users, catalog, shifts, orders, payments, receipts and audit logs. Runtime verified against MariaDB 12.3.3; MySQL 8.0.16+ remains the schema target, not a claim of MySQL runtime testing.

## Requirements

- Node.js `^20.19 || ^22.12 || >=24.0` (Prisma 7 requirement; use a supported LTS release)
- npm
- MySQL 8.0.16+ for database deployment (InnoDB)

## Setup and run

```bash
git clone https://github.com/Anemonastrum/cafe-backend
cd cafe-backend
npm ci
npm run db:generate
# Configure private .env using .env.example; generate two independent secrets.
node --env-file=.env src/server.js
```

Server requires DATABASE_URL, ALLOWED_ORIGIN (exact origin), CSRF_KEY and READINESS_SECRET (at least 32 bytes each). No built-in secrets. Cookie security defaults on; ALLOW_INSECURE_COOKIE=true is rejected in production. URL query options are rejected rather than silently discarding TLS settings; TLS connection configuration needs explicit support before a deployment requiring it. Bind defaults to 127.0.0.1 and port 3000. Override PORT with:

```bash
PORT=8080 node src/server.js
```

## Database

`prisma/schema.prisma` mirrors the supplied SQL database contract. The initial migration preserves 28 tables, 41 foreign keys, 20 CHECK constraints, database-managed timestamp updates, and reference data (Cash, QRIS, cafe settings, Main Register). Tables explicitly use `utf8mb4_unicode_ci`.

Validate without a running database or `DATABASE_URL`:

```bash
npm run db:validate
npm run db:check
```

`db:check` compares the frozen `tests/fixtures/initial-schema.prisma` against the initial migration, checking columns, types, defaults, nullability, indexes, and relations. `npm run db:drift` separately checks the current schema against the authorized test DB using private `.env.test`. If local `notes/db.sql` exists, it also compares the complete source SQL with the migration, allowing only removal of `CREATE DATABASE`/`USE` and explicit table charset/collation. `npm run db:format` formats the schema.

### Deploy to a new database

**Use an empty database only. Do not run this initial migration against an existing schema. MySQL DDL is not fully transactional: a failed migration may leave partial changes. Inspect and resolve the failure before retrying.**

1. Provision an empty MySQL database with `utf8mb4` / `utf8mb4_unicode_ci` and a dedicated user with migration permissions. The migration intentionally does not create or select a database.
2. Copy `.env.example` to `.env` and replace its example connection URL. Percent-encode special characters in credentials. Keep `.env` private; it is git-ignored.
3. Load `.env` explicitly with Node.js and apply committed migrations:

   ```bash
   node --env-file=.env node_modules/prisma/build/index.js migrate deploy
   ```

   If `DATABASE_URL` is already supplied by your shell or secrets manager, use:

   ```bash
   npm run db:deploy
   ```

Prisma config and the server do not automatically load `.env`. Validation and schema checks are offline checks, not proof that MySQL executed the migration successfully.

### Existing databases and future changes

For an existing database, back it up and compare its schema, constraints, and reference data with this migration before baselining. Only after confirming equivalent state should an operator mark `20261109000000_initial` as applied with `prisma migrate resolve --applied 20261109000000_initial`. Do not blindly apply or baseline it.

Prisma cannot fully describe CHECK constraints, SQL `ON UPDATE CURRENT_TIMESTAMP(3)`, charset/collation, or seed INSERTs. These remain authoritative in migration SQL. Timestamp fields intentionally use `@default(now())`, not client-side `@updatedAt`: MySQL manages updates. Review future migration SQL to preserve these guarantees; do not replace migration deployment with `prisma db push`.

Use decimal arithmetic for money and handle JavaScript `BigInt` serialization explicitly when adding API integration. IDs are unsigned SQL integers; receipt paper enum values map to SQL strings `58` and `80`. Foreign-key updates remain `Restrict`, matching the source's omitted `ON UPDATE` action.

SQL comments retain application transaction rules (authorization, row locking, idempotency, payment verification, snapshot preservation). Schema alone does not implement these rules or enforce immutable audit history. Reference data contains no admin account or payment credentials.

## API

### Foundation routes

- `GET /api/v1/health`: public liveness; does not check DB.
- `GET /api/v1/ready`: requires `X-Readiness-Key` matching READINESS_SECRET; returns 200 after DB query, 503 if unavailable, 403 without valid internal credential. Restrict at reverse proxy too.
- Errors return `{error:{code,message,details},request_id}`. Unknown failures never expose DB URLs, parser bodies or stack traces.
- All responses carry server-generated X-Request-ID; JSON limit 1 MiB.
- SIGINT/SIGTERM drains HTTP, disconnects Prisma; bounded shutdown deadline.

### Authentication

- `POST /api/v1/auth/login`: JSON username/password and exact configured Origin. Returns safe user and csrf_token; sets HttpOnly cafe_session cookie.
- `GET /api/v1/auth/me`: current active profile and recoverable csrf_token.
- `POST /api/v1/auth/refresh`: rotate cookie secret, preserve eight-hour absolute expiry. Serialize client refreshes; concurrent refresh loses with 401.
- `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`: revoke current/all sessions and clear cookie, 204.
- `PATCH /api/v1/auth/me/password`: current_password/new_password; keeps current session, revokes others.

Every authenticated mutation requires exact Origin plus X-CSRF-Token. Cross-origin browsers must use credentials: include. CORS permits only configured origin. New passwords: 12–128 Unicode characters, at most 512 UTF-8 bytes; never normalized. scrypt uses N=131072/r=8/p=1, about 0.54 seconds per hash on test host, two concurrent jobs plus eight queued (overflow 429). Rate limits: five login failures per 15 minutes per IP and database username identity; 30 auth requests/minute/IP. Stores cap 10000 keys and fail closed. One API process only; shared limiter store required before replicas. Proxy trust remains off until explicit deployment configuration.

### Administration and configuration

Admin-only `/api/v1/admin/users` supports listing/creation and `/:id` detail/update, `/:id/status`, `/:id/reset-password`. Self-demotion/deactivation is rejected; serialized account changes preserve an active admin and revoke sessions on deactivation/password reset. Lists support role, is_active, search and pagination/sorting. Employee histories now include orders, shifts and paid-sales summary (see reporting).

`GET /api/v1/settings/public` requires an active admin/cashier session and excludes permissions/counter/default tax. Admin settings support GET/PATCH plus POST/DELETE logo. Logo uploads use multipart field `file`, PNG/JPEG/WebP only, 5 MiB and 20 megapixels maximum. Decoded images become generated WebP files in STORAGE_DIR, served publicly under `/media`. Keep that directory dedicated to generated images, never credentials. DB failure cleans new image; old-file cleanup failures log a retryable orphan after commit.

Admin taxes, service-charges and discounts support GET/POST/PATCH; updates validate merged values and dates. Tax rate strings retain four decimals, money strings two. Rule lists support is_active/search/pagination. No hard-delete route. Payment methods allow enabling/disabling; provider remains manual until optional Midtrans phase. Cashiers see enabled methods only; admins may request include_disabled=true.

### Catalog

Authenticated `/api/v1/categories` and `/api/v1/products` support paginated lists and details; admin mutations create/update and change status/availability. Categories accept include_inactive, products include_archived/enabled/category_id/search. Cashier flags never widen visibility: only active categories with enabled, unarchived products; hidden details return 404.

Product promotion updates merge current state, enforce promo price <= base and valid time windows. Promo start is inclusive, end exclusive. Archive/restore preserves availability. Product image POST/DELETE uses shared managed WebP uploads. External HTTP(S) image URLs are stored only, never fetched or deleted by backend. No catalog hard-delete route.

`GET /api/v1/pos/menu` returns complete visible categories/products arrays with enabled variant/add-on options and promo_active. Variant/add-on group lists include options; cashiers see enabled options only. Admins manage groups and options through product-bound create and group/option PATCH/DELETE routes. Referenced options/groups return 409 on deletion; disable options to preserve history. Add-on limits count summed option quantities per item. Required variants, duplicate/foreign/disabled options and negative promotional sale prices are rejected by selection validation before ordering.

### Registers and shifts

`GET /cash-registers` lists active registers; admins may include inactive. Admin create/PATCH routes manage names, codes and status; disabling an occupied register conflicts. Shift opening accepts only cash_register_id and assigns authenticated actor, including admins. One open shift per cashier and register, serialized through cafe singleton lock.

`GET /cashier-shifts/current` returns own open shift or null. Close is owner/admin only, blocked by noncancelled unpaid originating orders or pending payments. Paid unfinished preparation does not block closure. Repeated close retains original time, closer and notes. No cash drawer fields.

Own/admin shift histories support status/time filters, pagination and admin cashier/register filters. Owner/admin summaries count paid payment amounts attributed to payments.shift_id, never cash tender; method breakdown and duration included. Shift order lists use orders.shift_id. Cross-cashier reads/actions return 404. Close-versus-order-create ordering verified through mounted routes in P07a; mounted payment writer checks remain for P08.

### Pricing and order creation

`POST /orders/quote` requires authentication/CSRF but no shift. `POST /orders` additionally requires own open shift, including admins. Input: order_type, notes, items with product_id/quantity/variant_option_ids/addons/special_instructions; optional configured discounts as `{discount_id}`. Creation also requires UUID client_request_id. Server captures current catalog, promotions, taxes and automatic charges; client totals/actor IDs rejected.

Money stays Decimal with half-up cent rounding. Promotion reduces base only; ordered discounts use cent-exact largest-remainder allocation. Inclusive tax extracted, exclusive tax added; auto charges use post-discount subtotal and are not taxed. Stored line pricing_snapshot v1 preserves tax, promotion and allocated discount. Initial migration stays unchanged; deploy forward order-contract migration before running this version.

Same actor/key/normalized payload replays original order with HTTP 200, including after shift closure/catalog changes; first creation returns 201. Changed payload or different actor returns 409. Order numbering, snapshots, children and audit commit atomically. `GET /orders`, `/orders/:id`, `/orders/active` scope cashiers to own orders; active queue is oldest-first pending/preparing/ready, excludes held. List filters support status/payment_status/order_type/is_held/from/to/search with pagination.

### Order editing and preparation

Unpaid financial changes require originating shift open and no pending payment attempt. Quantity/instruction/notes edits preserve captured prices, promotions, options, tax and charge rules. Explicit selection replacement and new lines use current catalog. Discount amounts recalculate from captured rules with fixed amounts capped at remaining base; prior valid discounts survive cashier permission revocation. Applying/removing discounts requires current permission; manual `{name,calculation,value}` and configured `{discount_id}` requests are exclusive. Removal ID is applied order_discounts.id, not source discount ID. Admin approval fields are server-set.

Line removal may leave empty draft; quote/create still reject empty carts and checkout must reject empty drafts. Hold/resume requires unpaid editable order. Preparation follows pending, preparing, ready, completed without skips/backwards; held orders cannot advance, completion requires paid. Paid preparation may finish after originating shift closes. Repeating same status creates no history. Cancellation requires unpaid/no pending attempt, current cashier permission or admin, and nonempty reason up to 500 characters; repeated cancellation preserves original reason/actor/time. History records actual transitions and actors. P08 mounted cash/cancel ordering now verified in both schedules; earlier P07b fixture checks remain regression coverage.

### Cash and manual QRIS payments

`POST /orders/:orderId/payments/cash` accepts `{cash_received}` and requires `Idempotency-Key` (1–120 ASCII letters/digits or `._:-`). `POST /orders/:orderId/payments/qris` accepts `{provider:"manual"}` with same key requirement. Enabled manual method required; Midtrans remains disabled until P12. Server verifies captured order arithmetic, never current catalog. Originating shift and processor's own shift must be open; held/cancelled/empty/paid orders and competing pending attempts reject checkout. Zero-total cash with zero tender allowed. Exact actor/key/normalized payload replay returns original attempt with 200, even after shift closure; first creation returns 201, changed key payload conflicts.

Cash atomically marks payment/order paid, computes change, creates unique receipt with cafe and order-owner name snapshots, appends audit/event. QRIS starts pending without receipt; owner cashier/admin confirms only after independently checking transfer through `POST /payments/:id/confirm-manual`. Confirmer needs own open shift plus original processor/originating shifts open. Confirmation preserves original processor/shift; event records confirming actor/current shift. Repeated paid confirmation issues no duplicate receipt.

Protected recovery: `node scripts/resolve-manual-payment.mjs < /private/recovery.json` with DATABASE_URL supplied securely. Input fields: username, password, id, reason, expected_status:"pending". Use mode-0600 file outside repository; never command-line credentials. Active admin authentication required; only pending manual QRIS may become failed, never paid reversal. Failed-key replay remains failed; replacement uses new key. No public fail/refund endpoint.

Payment detail/order attempts enforce order-owner/admin scope. Admin lists filter status, payment_method_id, cashier_id (processor), search reference and `[from,to)` creation timestamps; pagination stable. Admin event history uses scalar payload allowlist on write/read; raw gateway data, request hashes and idempotency keys excluded from payment responses. Mounted races exercise cash/cash, cash/manual, pay/cancel, processor-close/pay and repeated confirmation; receipt failure rolls back checkout.

### Receipt reads, printing and PDF

`GET /orders/:orderId/receipt` and `GET /receipts/:id` return original receipt/cafe/cashier and settled order/item/option/pricing/payment snapshots. Owner cashier/admin only; pending orders return404, paid order missing receipt returns integrity500 without creating one. Reads remain available after shift closure. Product/category/cafe/account renames never change captured display names or totals.

`GET /receipts/:id/print` returns escaped print HTML; `POST /receipts/:id/reprint` requires Origin/CSRF and returns same print-ready HTML. Optional `paper_mm=58|80` query overrides captured width. Print requests/reprints append actor events, not proof of physical printing. No scripts, remote images or printer hardware integration; restrictive CSP and private no-store. Admin `GET /admin/receipts/:id/events` paginates/sorts by id/created_at.

`GET /receipts/:id/pdf` downloads `receipt-<id>.pdf`, optional same paper width. Direct pdfkit layout, local OFL-licensed Noto Sans, no remote resource fetching/browser execution. Latin/Greek/Cyrillic supported by font; unsupported glyphs render explicit `[U+HEX]` instead of disappearing. Snapshot totals shared with HTML;100order-line ceiling,64,000 expanded-text-character/128page/16MiB bounds, with event-loop yielding between fields. Excess consecutive blank lines collapse to one blank line. Oversized layouts fail safely without a success event; JSON/HTML remain available, no financial content truncated. `pdf_export` event records generated bytes only, never generation failure or physical delivery; `pdf_url` stays null. Parsed58/80mm PDFs,100line multipage output, controlled generator failure and rendered first-page layout verified locally.

### Employee histories and reports

Admin-only `/admin/users/:id/orders`, `/shifts`, `/sales-summary` use `[from,to)` timezone-bearing ISO ranges, at most366days; default current Jakarta day. Orders date on created_at with status/payment_status filters, shifts on opened_at with status, summary on payment.paid_at. Lists paginate/sort deterministically. Summary returns transaction_count, paid_sales_total and average_order_value, attributed to order owner even when admin processed payment; empty averages0.00. Unknown employee404; unsupported timezone rejected (only Asia/Jakarta).

Admin `/admin/reports/{sales,payments,products,categories,employees,orders,cancellations}` shares range rules and consistent RepeatableRead snapshot per request. Sales accepts `group_by=day|week|month`, zero-fills local buckets (ISO week starts Monday) and returns bucket rows plus `meta.totals`. Revenue=sum paid payment amount, never tender; gross=sum order subtotal, discounts=item+order discounts, net_sales=gross−discounts−inclusive tax. Tax/charges shown separately, not added twice. Average=revenue/distinct paid order count, zero when empty.

Other reports accept page/limit with stable natural ordering: method code/status, product ID/name/category snapshot, category snapshot, owner ID, order status, or cancellation time/ID. Product/category revenue sums allocated line_total, excludes order service charges; catalog renames preserve historical names. Payment groups include paid/failed/pending attempts: paid_at for paid, created_at for nonpaid. Orders diagnose created_at status/held/unpaid counts; cancellations use cancelled_at and reason/actor/approval, no refunds. Separate paginated requests are live views, not frozen export sessions. CSV/XLSX and dashboards now delivered (below).

### Dashboard, audit and exports

Admin-only `/admin/dashboard/{summary,sales-trend,top-products,payment-breakdown,recent-orders,employee-activity}` shares report dates/formulas. Summary returns today_revenue (paid amount, tax-inclusive), paid_transaction_count/average_order_value; active_orders=pending/preparing/ready, pending_orders=status pending, open_shifts=status open are current operational counts, not date-filtered. Optional range changes financial summary only. Trend `period=day|week|month`; top-products `rank_by=quantity|revenue` (default quantity); payment-breakdown paid groups only; recent-orders newest created_at/id first. Lists use page/limit. Employee activity mirrors sanitized audit query.

`/admin/audit-logs` filters user_id/action/entity_type/entity_id/from/to with page/limit; default current Jakarta day. Detail `/:id` returns sanitized before/after, actor ID, time and IP. Recursive domain-field allowlist removes unknown keys and credentials even from legacy nested JSON. Entity IDs remain opaque strings (numeric IDs/UUIDs). No audit update/delete route.

`/admin/reports/export?report=sales|payments|products|categories|employees|orders|cancellations&format=csv|xlsx&from=...&to=...` downloads all rows from one consistent snapshot, not current JSON page. Sales export uses daily buckets. Fixed columns match JSON projections; no formula/macro/external-link creation. CSV quotes every cell and prefixes dangerous spreadsheet formulas; XLSX all cells explicit strings, preserving money/IDs without spreadsheet precision loss. CSV automatic numeric inference in spreadsheet apps can still round large IDs; use XLSX for exact IDs.

Export caps100000 rows and64MiB text/file, range366days. Private temporary dir0700/file0600 under OS tmpdir (`TMPDIR` supported); artifact completes before response headers, streamed with no-store, deleted on success/disconnect/failure. No public file URL. Server crash may leave temp artifacts; OS/operator retention cleanup required. ExcelJS4.4.0 uses scoped uuid11.1.1 override; dependency audit currently zero findings, deprecated transitive packages remain. Production concurrent-export capacity not verified.

### First admin bootstrap

Use only on intended database with no admin account, including inactive admins. No default password or public registration. Prepare a private mode-0600 JSON file outside repository with username, full_name and password; never put password in command arguments/history.

```sh
node --env-file=.env scripts/bootstrap-admin.mjs < /secure/path/first-admin.json
```

CLI accepts stdin only, serializes on cafe settings lock, and refuses second admin bootstrap. Remove private input securely after use according to storage policy. Bootstrap integration tests require no preexisting admin in authorized disposable test DB; they refuse rather than delete existing users.

### `GET /`

```bash
curl http://localhost:3000/
```

Response (`200 OK`):

```json
{"message":"API is running"}
```

## Project files

- `src/server.js` — Express application and HTTP server.
- `prisma/schema.prisma` — models, enums, indexes, and relations.
- `prisma/migrations/` — initial SQL migration and MySQL migration lock.
- `prisma.config.ts` — schema path, migration path, and connection configuration.
- `scripts/check-schema.mjs` — offline schema/migration parity check.
- `package.json` / `package-lock.json` — dependencies and reproducible installation.

`notes/` and `docs/` stay local and git-ignored.

## Tests

```sh
npm test                  # offline unit + mounted HTTP tests
npm run test:integration  # live DB, actual server process and shutdown
npm run test:concurrency  # ordered two-connection isolation check
npm run test:all          # all suites, missing configuration fails
npm run db:validate
npm run db:check          # immutable initial schema parity
npm run db:drift          # current live Prisma-representable schema
```

Live suites require owner-only `.env.test` (mode 0600) with TEST_DATABASE_URL and TEST_DATABASE_TARGET. Target identity must match the explicitly authorized development database; the harness currently restricts this to `10.10.10.9:3306/app`. Never use a production database. Tests do not migrate/reset/drop databases; fixture writes roll back or remove only their own rows. A fresh target needs explicit migration deployment before tests. Missing configuration is an error, not a skipped success.

The initial migration has been applied to the supplied development target. Do not reset or re-baseline it. Use a restricted DB account for deployment; never ship root credentials.

## License

[MIT](LICENSE)
