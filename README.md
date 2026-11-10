# cafe-backend

Backend for a cafe point-of-sale (POS) system, built with Node.js and Express 5 using ES modules.

## Current status

P01 foundation: testable Express app, validated environment, request/error envelopes, public liveness, protected DB readiness, Prisma Client with MariaDB adapter, native test harness and transaction helpers. P02 adds cookie authentication, session rotation/revocation, CSRF, password change and first-admin bootstrap. POS business endpoints are not implemented yet. Initial migration covers users, catalog, shifts, orders, payments, receipts and audit logs. Runtime verified against MariaDB 12.3.3; MySQL 8.0.16+ remains the schema target, not a claim of MySQL runtime testing.

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
