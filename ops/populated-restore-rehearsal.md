# Authorized populated recovery rehearsal

## Scope and cutoff

Executed 2026-11-12T18:22:05.101Z UTC (2026-11-13 WIB), MariaDB 12.3.3 with native MariaDB 11.8.6 clients. Owner explicitly authorized two new absent-or-empty schemas for synthetic fixtures and restore, isolated synthetic media, private backup, read-only restored smoke and sanitized Git delivery. Both schemas checked for tables/routines/events before provisioning; restore target rechecked immediately before import. Existing application and previous restore schemas were not mutated; before/after exact manifests match. No schema reset, deletion or nonempty overwrite. Rehearsal schemas and private media retained; deletion not authorized.

Fixture schema received the three committed migrations through `npm run db:deploy` with private DATABASE_URL. Existing test harness target guard was neither modified nor invoked against these schemas. A private one-shot script used existing fixture helpers with an explicitly constructed DB client, then mounted application routes for shift, order, payment, cancellation and image operations. Source apps stopped before cutoff; no external writers present in these dedicated schemas.

Dataset: four synthetic users, four orders (cash paid, manually confirmed QRIS paid, QRIS pending, cancelled), three payments, two immutable receipts, audit/history/session rows, and two referenced WebP images (café logo/product image). No external gateway calls. Synthetic seed is deliberately small; not coverage of every business state, recovery CLI, options/tax/discount combinations, failed payments or production volume.

## Commands and observed results

Private scripts kept URLs/passwords/session cookies out of arguments/output. Native command shapes, using owner-only temporary client file:

```text
mariadb-dump --defaults-extra-file=<private-client-file> --single-transaction --quick --routines --triggers --events --hex-blob --skip-add-drop-table --skip-comments <authorized-fixture-schema>
tar -czf - -C <isolated-source-media> .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:<separate-private-key> -out <private-encrypted-artifact>
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:<separate-private-key> -in <private-encrypted-artifact>
mariadb --defaults-extra-file=<private-client-file> --database=<authorized-empty-restore-schema> --binary-mode
tar -xzf - -C <isolated-restored-media>
```

- Every native subprocess exited 0; decrypted SQL/archive SHA-256 matched originals. SQL had no CREATE DATABASE/USE selector and no DROP TABLE. Temporary client credential file removed in finally.
- SQL: 54,538 bytes; encrypted SHA-256 `e032e7505a2b20c68ea9ea2454cddb9e469fbab20b6ea17f61e0c5c1defeb4ee`.
- Media archive: 303 bytes; encrypted SHA-256 `4eaa5f247cd6d4efe7a198950068be4f9ca01f6940ce83005954e717d3fd5866`.
- Restored 29 InnoDB tables, 59 rows, three migrations and 119 constraints. Exact SHOW CREATE TABLE and sorted raw-row hashes match. JSON decoded as raw text, decimal/BigInt/date precision preserved. Source manifest unchanged across dump, import and process smoke.
- Manifest SHA-256 `1e7a7cea54d5c44aea64e6e209f00e37a86ad82052f9c2d8bcad0be02e387553`.
- Paid: two payments, IDR 125,000.00 total; pending: one payment, IDR 50,000.00. Duplicate paid, paid without receipt, receipt without paid, and order/payment amount/status mismatch each zero on populated rows.
- Both DB image references resolved to restored regular files; byte-for-byte comparison and SHA-256 passed. Two 66-byte synthetic WebP files, each SHA-256 `5d6300e7af7dd832dd04a029c2961eeb363383912d4ea0e3dd4a841d5c7f25c0`.
- Import: 500 ms; backup/encrypt/restore/verify/process segment: 5,136 ms. Tiny-data observations, not production RTO/RPO guarantees.

## Restored process smoke

Actual `src/server.js` process bound loopback with restored schema/media and integrations disabled:

- Health200; readiness403 without key / 200 with key; orders401 without session.
- Existing synthetic session authenticated `/auth/me`; all four owned orders read200.
- Both receipt JSON responses exactly equal pre-backup captured responses, including immutable snapshots and amounts.
- Both referenced images served HTTP200 with expected file hashes.
- SIGTERM exit0. Both rehearsal DB manifests still equal cutoff afterward; protected original/previous-restore DB manifests unchanged too.

Authentication here proves restored session/account reads, not fresh password login or post-restore writes. Read-only checks deliberately preserve cutoff. During first invocation all backup/import/smoke assertions completed and result JSON was saved, but final console serialization hit `TypeError: Do not know how to serialize a BigInt` (exit1). Fixed console formatter, **did not repeat import into nonempty target**. Separate read-only recheck exited0, confirming manifests, files, protected DBs and retained smoke evidence. No fabricated successful initial exit claim.

## Retention and remaining gates

Encrypted artifacts, source/protected manifests, migration log and result JSON retained outside repository with owner-only directories/files. Synthetic fixture password/session evidence also private; no credential, dump or raw row committed. Keys stored in separate owner-only local key directory, not offsite escrow. Only sanitizer/evidence and read-only media helper/tests are Git deliverables; private provisioning scripts are not a general-purpose automated restore command.

Small populated financial/media rehearsal gate is satisfied for this dataset. **Production release remains BLOCKED** until owner approves retention, offsite backup/key custody, RPO/RTO and deployment-specific TLS/proxy/DB privileges/load gates. No production-volume, physical printing, offsite disaster recovery, MySQL runtime or automatic cleanup claim. Optional providers untouched.
