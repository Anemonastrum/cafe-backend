# Authorized restore rehearsal evidence

## Scope and outcome

Executed 2026-11-12T17:31:15.902Z (UTC), MariaDB 12.3.3 source and separate target on same server. User explicitly authorized read-only source backup, restore only into absent/empty target and private backup storage. Existing target was empty. No source reset, migration, fixture insert or business-row mutation. Target retained; deletion not authorized.

Native MariaDB 11.8.6 clients downloaded from Debian package repository and extracted to private scratch, not installed system-wide. Runtime dependencies unchanged. mariadb-dump used single-transaction/quick/routines/triggers/events/hex-blob, no CREATE DATABASE/USE in dump, no DROP TABLE. All 29 source tables InnoDB. No active source command observed at preflight; table hashes unchanged across backup, restore verification and smoke. This is observed stable rehearsal data, not proof an external production writer was administratively quiesced.

- SQL dump: 41,918 bytes; encrypted AES-256-CBC, random salt, PBKDF2 200,000 iterations; decryption hash matches original.
- Encrypted SQL SHA-256: `4ded3e187004d6be9f5e796868ed72d33720e83c208ebeb5e78469a482fc3d47`.
- Media archive: 45 bytes, empty; source storage directory absent and no image/logo references. Encryption/decryption/archive extraction passed; nonempty file recovery **not exercised**.
- Encrypted media SHA-256: `8af4e24f838c25d0a821d149df84c62a7d9cc5695066672845df2464d6cee151`.
- Restored 29 tables, 7 rows, 3 applied migrations, 119 constraints; exact DDL and per-table sorted row-hash comparisons match source. CHECK/FK/index definitions included in SHOW CREATE TABLE hashes; constraint inventory also matches.
- Schema/data manifest SHA-256: `76d2fad5dd2bc3c099007f74f8a3dd0dc832bf26d1b3473301a52550d7360ef5`.
- Import duration: 341 ms; backup/encrypt/restore/verify segment: 2,270 ms. These timings are tiny-development-dataset observations, **not production RTO/RPO guarantees**.
- Real restored-target API process: health200, readiness403 without key/200 with key, unauthenticated orders401, SIGTERM exit0. Subsequent comparison confirms source unchanged from backup manifest.

## Evidence limits

Seven rows are settings/payment methods/register reference data and migration history. No users, orders, payments, receipts or business media existed at backup cutoff. Duplicate paid payments, missing paid receipts, receipt/payment status and order/payment total checks returned zero, but empty financial dataset makes those checks vacuous for populated recovery. Receipt snapshot hashes would be compared when rows exist; this run does not prove representative receipt recovery. No credentials/account creation on restored target; no authenticated business smoke.

Private encrypted backup and result JSON retained outside repository under owner-only vault directory, keys in separate owner-only key directory. Client credential file removed after operation. No dump, credential, key, raw row or private host identity included in Git deliverables. Encryption key is separate locally, not off-host escrow. Operator still must approve retention, offsite key/backup custody, RPO/RTO targets and populated rehearsal before production release.

## Repeat verification

`ops/verify-restore.mjs` performs read-only distinct-target comparison using installed MariaDB driver. Set RESTORE_SOURCE_URL/RESTORE_TARGET_URL from a private environment file, then run `node --env-file=/private/restore.env ops/verify-restore.mjs`. Never pass passwords in arguments or commit the file. Different schema names required regardless of hostname alias; JSON read as raw text without JavaScript-number conversion. Source must be quiescent; in-memory hash scan suits rehearsal only. Large databases need streaming hashes and production backup tooling. Existing test harness target guard unchanged; no silent test-target bypass.

Operational release gate remains **BLOCKED** for populated financial/media recovery and production environment checks. Core code delivery and this empty-data restore evidence are complete; optional integrations remain deferred.
