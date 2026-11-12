# Operational policy and production release gates

## Current decision

Owner selected recommended policy defaults and stated production is **not provisioned** (2026-11-13 WIB). Targets below are planning requirements, not evidence of an installed backup system or achieved service levels. No production host/domain, offsite destination or named backup/key custodian has been supplied. **Production release remains BLOCKED.**

Core code, reference recovery and small synthetic populated recovery are delivered. Evidence: [reference restore](restore-rehearsal.md), [populated restore](populated-restore-rehearsal.md). These rehearsals do not prove production-sized recovery or offsite disaster recovery.

## Selected default targets

| Item | Requirement | Current status |
|---|---|---|
| Recovery point objective (RPO) | Maximum 1 hour of committed data loss, measured from incident time to latest recoverable common DB/media cutoff | Target selected; no production schedule or offsite recovery evidence |
| Recovery time objective (RTO) | Maximum 4 hours from service-disrupting incident onset to validated business service restoration, including detection, access/key retrieval, provisioning, restore, checks and traffic reopening | Target selected; production-sized end-to-end drill required |
| Retention | 48 hourly, 30 daily and 12 monthly verified recovery points; one point may satisfy multiple tiers | Target selected; no automated retention configured |
| Backup coverage | Transactionally consistent InnoDB schema/data/migrations plus corresponding dedicated media store, exact cutoff and integrity manifest | Demonstrated only on small isolated rehearsal |
| Offsite storage | Encrypted copy in separate failure domain and separately controlled account; versioning and deletion protection/immutability where supported | Destination/provider/account not selected |
| Key custody | Named primary and alternate operators; recovery key available independently of failed API host and backup storage credentials | People and independent key location not assigned |

RPO is the age of a **usable** recovery point, not the interval of a cron job. Initial proposal: create consistent DB/media recovery points every 30 minutes, transfer offsite and verify each within 30 minutes. Alert whenever latest verified offsite common cutoff is older than 45 minutes; at 60 minutes declare RPO breach and escalate. This timing is a budget to validate, not a claimed guarantee. If write pauses or transfer times cannot fit it, reassess the design before launch; do not silently relax the objective. Binlog-based point-in-time recovery is not configured and does not solve media consistency by itself.

For the present single-process/local-media design, pause all business and media writers before recording the common cutoff and copying both stores. A DB snapshot alone cannot synchronize concurrent file changes. Prove pause duration is acceptable at representative size before adopting this approach in production. Select hourly/daily/monthly retained points only from completed, integrity-verified backups; a failed run never counts. Never remove the last verified recovery point or any point under incident/legal hold. Retention policy does not authorize deleting existing backups, keys, media or rehearsal schemas.

Keep keys outside the public media store, repository and backup account. Separate local directories are not offsite key custody. Use independently controlled encrypted secret storage and exercise alternate-operator retrieval; never store the only recovery key on the host being protected. Native encrypted artifacts from prior rehearsals remain private local evidence, not an offsite implementation. Provider encryption, access/deletion controls and integrity/authenticity verification must be selected and tested before adopting production tooling; checksums stored beside ciphertext alone do not protect against a malicious backup-account writer.

## Release evidence checklist

Each gate needs a named owner, exact environment/release identity, dated evidence and reviewer disposition. Do not mark a row passed from a template, policy selection, test suite count or tiny-dataset timing.

| Gate | Required evidence before traffic | Status |
|---|---|---|
| Production inventory | Named host, HTTPS API/frontend domains, service identity, storage paths, DB engine/version and network topology; resource sizing | BLOCKED: production not provisioned |
| Runtime and migrations | Supported Node, pinned dependencies/generated Prisma client, committed migrations applied using separate migration identity; no reset/db push | NOT RUN on production |
| TLS/proxy/network | Valid certificate/renewal, actual `nginx -t`, composed CSP, trusted proxy/client IP, secure cookies, exact CORS/CSRF, backend/readiness network restriction | NOT RUN on production |
| DB access | Inspect actual runtime and migration grants; runtime has schema CRUD only, no global/DDL/GRANT; trusted transport (current adapter has no configured remote DB TLS) | NOT RUN on production |
| Service/storage/monitoring | One supervised process, persistent media/private temporary storage, restricted secrets/files, SIGTERM/restart, disk/log rotation, health/readiness and alert delivery | NOT RUN on production |
| Offsite recovery | Destination and primary/alternate custodians assigned; encrypted DB/media schedule, integrity checks, deletion protection, independently recoverable keys and failed/stale backup alerts exercised | BLOCKED: destination/custodians not assigned |
| Production-sized drill | Authorized distinct empty target, representative financial/media size, restore from offsite with independent keys, exact manifests/invariants/authenticated business smoke; measured common cutoff age and full recovery time meet RPO/RTO | NOT RUN; small synthetic drill is supporting evidence only |
| Capacity | Owner-approved concurrency/data size/workload; authorized isolated load test for API/export/PDF/disk/memory, acceptable latency/error limits and headroom | BLOCKED: workload/environment unspecified |
| Release approval | Operator reviews all evidence, accepts residual risks, names incident/on-call contact and approves launch | NOT GRANTED |

No load test, account provisioning, install, DNS/certificate change, service reload, backup schedule, retention deletion or production DB mutation is authorized by this document. Existing test fixture suites remain restricted to their explicit development target and must never be pointed at production.

## Next handoff

Owner supplies production inventory, offsite destination and primary/alternate custodians. Then separately authorize provisioning/configuration and bounded verification against named targets. Keep production release blocked until evidence closes every required row. Optional Midtrans/email work is unrelated to these gates and requires its own authorization.
