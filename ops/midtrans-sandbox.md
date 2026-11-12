# Midtrans sandbox — partial implementation, disabled

`src/integrations/midtrans.js` provides standalone sandbox-only QRIS transport and notification signature verification. It is not imported by payment routes. Existing Midtrans attempts still return `503 PROVIDER_DISABLED`; webhook route remains absent. Forward migration `20261113000100_midtrans_reconciliation` adds order reconciliation hold, nullable immutable attempt JSON/dispatch timestamp storage and nullable autonomous receipt issuer. No production configuration added. Apply forward migrations before running updated client; existing schemas are not automatically migrated.

## Transport boundary

- `createMidtransClient({serverKey, timeoutMs = 5000})` uses native fetch, fixed `https://api.sandbox.midtrans.com`, Basic API authentication, no redirects, no automatic retries and a 64 KiB streamed response bound. Timeout must be integer 1–30000 ms. Never log credentials, response bodies or request headers.
- `chargeQris({gatewayOrderId, amount})` requires positive whole IDR as a decimal string within current schema bound. Fractional IDR is rejected, never rounded. Output is a bounded observation, **not settlement authorization**. All network/parse/provider failures remain ambiguous; never infer charge absence or send a second POST automatically.
- `getProviderStatus(gatewayOrderId)` distinguishes provider `404` as `status: not_found`. This does not prove a delayed charge is impossible and must not release order/payment/shift freezes. Successful observations require QRIS, IDR, bounded transaction identity/status and whole-IDR amount. Unknown statuses remain observations for later conflict reconciliation, never automatic settlement.
- Identity/charge amount mismatch throws sanitized `PROVIDER_UNAVAILABLE`, with bounded observation details for future internal reconciliation. Do not expose exception details directly through a future payment controller. No raw provider messages, signatures or arbitrary fields retained.
- Optional QR action URLs require HTTPS sandbox API origin and `/v2/qris/` path; URLs are returned, never fetched server-side. QR availability and merchant-specific contract remain sandbox gates.
- `verifySignature(payload, [currentSecret, previousSecret?])` checks SHA-512 over exact `order_id + status_code + gross_amount + SignatureSecretKey`, using constant-time digest comparison. API ServerKey is distinct. Signature verification alone never authorizes settlement; future callback must query trusted provider status and reconcile under DB locks.

## Remaining gates

Persistence columns and hold guards now exist. Held orders reject order/item/discount/lifecycle/cancel/hold mutations, checkout and manual failure recovery; existing immutable paid/replay reads remain allowed. Shift closure detects held orders through originating shift or any attempt shift, even failed attempt and paid/cancelled order. Existing closed shifts stay closed. No public setter or generic hold-release endpoint exists.

Migration exercised on authorized isolated schemas only: populated order/cash payment/receipt upgrade preserved exact old fields, nullable issuer still enforces nonnull FK, JSON/timestamp roundtrip passed. Fixture/race checks are MariaDB evidence, not MySQL or sandbox evidence.

Remaining: create immutable attempts and dispatch claim before network, authenticated admin status/expire recovery, separate autonomous receipt/audit actor in settlement, locked monotonic callback processing and admin-only sanitized conflict projection. Columns alone do not supply those behaviors. Existing databases and populated recovery copies must remain untouched.

Current signature-secret rule is based on indexed official documentation, not genuine merchant notification evidence. Do not enable until actual sandbox charge/QR, notification signature, trusted status, duplicate/out-of-order callbacks, timeout/restart and late-conflict gates pass. Sandbox charge and dashboard registration need separate authorization. Production remains unprovisioned and blocked independently.

Temporary callback tunnel is reachability-only until handler exists: callback POST returns `503`, not acknowledgement; tested unrelated paths return `404`. Tunnel does not forward full API. URL/process lifetime belongs in local checkpoint, never a stable production setting. Do not register unfinished callback in merchant dashboard.

Offline check: `node --test tests/unit/midtrans.test.js` and `npm test`. Live tests require private `MIDTRANS_TEST_DATABASE_URL` and exact `MIDTRANS_TEST_DATABASE_TARGET=10.10.10.9:3306/app_midtrans_test`; explicit selection is validated before loading historical `.env.test`, and invalid selection never falls back. No provisioning/reset happens inside tests. With authorized private env loaded, `npm run test:all` exercises regressions on isolated target; use no production/shared database. Hold/closure tests write synthetic fixture holds directly, not through an implemented provider callback. Fake transport tests establish local boundary behavior only; no sandbox success, DB persistence or settlement claim.
