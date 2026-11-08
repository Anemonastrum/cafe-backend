# cafe-backend

Backend for a cafe point-of-sale (POS) system, built with Node.js and Express 5 using ES modules.

## Current status

Minimal API with JSON request parsing and one status endpoint. Prisma schema and initial MySQL migration cover users, catalog, shifts, orders, payments, receipts, and audit logs. Application authentication, POS endpoints, and runtime database integration are not implemented yet; no Prisma Client is configured.

## Requirements

- Node.js `^20.19 || ^22.12 || >=24.0` (Prisma 7 requirement; use a supported LTS release)
- npm
- MySQL 8.0.16+ for database deployment (InnoDB)

## Setup and run

```bash
git clone https://github.com/Anemonastrum/cafe-backend
cd cafe-backend
npm ci
node src/server.js
```

Server uses port `3000` by default. Override it with `PORT`:

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

`db:check` compares Prisma-generated DDL against the committed migration, checking columns, types, defaults, nullability, indexes, and relations. If local `notes/db.sql` exists, it also compares the complete source SQL with the migration, allowing only removal of `CREATE DATABASE`/`USE` and explicit table charset/collation. `npm run db:format` formats the schema.

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

Database contract checks run with `npm run db:validate && npm run db:check`. No application test suite is configured: `npm test` still prints `Error: no test specified` and exits with status `1`. Use the API request above for a manual smoke check.

## License

[MIT](LICENSE)
