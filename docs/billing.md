# Subscription implementation status

The business model is one recurring studio subscription shared by the web and Mac apps. Proposed price: USD 29/month. No purchases, charges or paid entitlements are enabled.

`lib/stripe-sandbox.js` is server-only, sandbox-only groundwork, with unit contract tests and a separate provider acceptance runner. It is deliberately not imported by a public route or UI. It rejects live keys, validates the exact monthly price, creates hosted Checkout and portal sessions, uses stable retry keys, checks existing subscriptions across all pages, and describes sandbox access only from matching customer/price records and unexpired active/trial periods. Return origins and price IDs are server configuration, never client choices. Provider errors are redacted.

Unit tests use simulated responses. A separate run against an actual claimable Stripe test environment passed 14 API checks on 8 November 2026; see the evidence below. No registered merchant account is connected and no real payments are enabled. The site remains owner-private.

## Durable sandbox coordination

`lib/billing-service.js` now binds the authenticated account to an opaque provider customer reference in D1. Unique constraints prevent two owners from sharing a customer within a configured sandbox. A stable server-configured scope identifies one Stripe merchant sandbox; never reuse it for another merchant or sandbox. Client-supplied customer IDs, account IDs and request keys are ignored.

An atomic, expiring database lease serializes billing work per account. Customer creation and Checkout keys are persisted before provider writes. Lost responses reuse the exact request key and parameters, including after process restart. Existing open sessions are retrieved from Stripe rather than creating new ones. Provider-confirmed expiry permits a replacement. A completed session can also be retired when its exact linked subscription is verified as belonging to the same sandbox customer and permanently canceled or incomplete-expired. The normal all-subscriptions check still runs before another checkout. Unknown, active, past-due, unpaid, paused, foreign and live-mode records cannot authorize a replacement. Other completed sessions direct the account to billing management; they do not grant access. A late lease holder cannot overwrite the newer holder's state or release its lock.

Uncertain operations at least 23 hours old stop for reconciliation. Stripe may prune keys after 24 hours, so blindly retrying an old key can create a new object. A future operational reconciliation flow must inspect provider state before resolving these records. Do not manually clear a pending attempt to bypass this protection. Completed-session retirement is covered by database and gateway contract tests. A genuine hosted Checkout completion followed by cancellation/re-subscription still needs end-to-end acceptance.

Migration `0002_lyrical_masked_marvel.sql` adds billing tables without modifying review data. Coordinator tests exercise real SQLite migrations with simulated provider calls; an additional gateway test rejects mismatched checkout sessions. Coverage includes two-account isolation, forged ownership, double clicks, lost customer/checkout responses, restart, lease recovery, expired and completed sessions, and stale-request refusal. One test combines the actual gateway and coordinator to verify identical provider request parameters on retry. These are not genuine Stripe sandbox acceptance tests.

Neither the coordinator nor its request adapter is mounted as an application route. No checkout button, paid entitlement or charge is enabled.

## Provider acceptance evidence — 8 November 2026

After explicit owner approval to share the connected GitHub email, Stripe CLI 1.55.8 created a claimable test environment. Its credentials and claim URL are excluded from this repository. It expires on 15 November 2026 unless claimed. The owner has a private local setup page with the original claim link; no browser automation was used.

`scripts/verify-stripe-sandbox.mjs` accepts an explicitly test-mode key as JSON on stdin. It supports Stripe's `sk_test_` and claimable `rkcs_test_` keys, rejects live credentials, and never emits keys or hosted session URLs. Run it explicitly against an isolated sandbox; it is not part of ordinary unit tests or CI. The test script creates fictional provider records and then cleans them up. Stripe's initial default portal configuration is retained if applicable; it contains no customer records or live payment access.

The recorded provider run passed 14 checks: the exact USD 29 monthly price, serialized/reused checkout, separate customer mapping, cross-customer rejection, configured portal creation, expired-session replacement, lost-response recovery using the same Stripe idempotency key, trial access, duplicate-subscription refusal, scheduled cancellation and immediate cancellation. `docs/stripe-sandbox-verification.json` contains the sanitized result. Test customers were deleted, sessions closed and test catalog entries archived. A test-only trial was used to exercise subscription state; this does not add a customer trial offer to the product.

These checks do **not** prove hosted Checkout payment completion, payment collection, renewals/failures, webhook delivery, browser portal actions, production access enforcement or Mac billing. Those still require acceptance work. Computer control is disabled for this chat by the owner's request.

## Renewal simulation status

`scripts/verify-stripe-lifecycle.mjs` is prepared to exercise an initial test payment, collection pause/resume, renewal, declined renewal, recovery, cancel/restore, cancellation at period end, a test refund, and incomplete-payment expiry. It uses only documented test PaymentMethods and explicitly test-mode keys. It never runs in ordinary CI and must not be treated as passing until its report says so.

The first provider attempt on 8 November stopped at test-clock creation with HTTP 403. A separate diagnostic confirmed Stripe's reason: the unclaimed sandbox key has limited permissions and this operation requires claiming the sandbox and obtaining a suitable authorized test key. The existing key can list test clocks, but cannot create one. No permission workaround was attempted. The failed run cleaned up its test catalog. `docs/stripe-lifecycle-verification.json` records the failure and verified restriction; none of its payment or renewal checks passed.

The owner has been asked to claim the environment using the private setup page already provided. Keep its claim link and keys out of this public repository. Do not rerun the blocked lifecycle simulation until the authorized key state changes. Earlier successful checkout API checks remain separate evidence.

## Signed notification processing

`lib/billing-webhooks.js` now implements an unmounted, test-only handler using official Stripe SDK 23.1.0 and WebCrypto. It verifies the original request bytes with a five-minute signature tolerance before database writes, limits bodies to 256 KiB, requires the configured snapshot API version and test-mode events, and refuses Connect/context events. No public delivery endpoint or signing secret has been configured.

Supported Checkout, invoice and subscription notifications store a receipt keyed by sandbox and event ID. Raw payloads and personal details are not retained. A matching receipt detects repeat delivery; changed content under the same event ID is rejected. Unknown customer mappings, provider failures and busy account leases return retryable failures. Unrelated event types are acknowledged without affecting access.

Reconciliation uses the account's existing checkout lease and fetches current subscriptions from Stripe instead of applying the event's potentially old snapshot. D1 writes the subscription snapshot and completed receipt in one transaction, with fencing against expired or superseded lease holders. The reader is scoped to the authenticated owner; unresolved notifications, expired periods and snapshots older than five minutes cannot grant access. A future access controller must refresh stale state through authenticated reconciliation; this reader alone is not production enforcement. Existing review access and exports are unchanged.

Migration `0005_abnormal_khan.sql` adds receipts and subscription snapshots. Twelve signed-message/database tests cover signature failures, live/foreign events, size limits, two-account isolation, duplicates, out-of-order events, early delivery, retries, lease contention, stale writers and transaction rollback. `npm run test:billing-runtime` additionally bundles the handler for the local Workers runtime and uses actual local D1 transactions to check signature rejection, successful reconciliation, duplicate delivery and delayed cancellation. All four runtime checks passed on 8 November. Provider responses in these tests are fictional. Genuine Stripe delivery remains unverified, and purchases remain disabled.

## Required before enabling even sandbox purchases

- Claim the temporary test environment, configure the application sandbox and stable scope, and complete the remaining provider acceptance tests.
- Connect and verify the implemented notification processor with genuine Stripe delivery, including retry and delayed-event acceptance; the local fixture tests below are not provider-delivery evidence.
- Configure a deliberate webhook delivery route. Owner-private hosting may block Stripe's unauthenticated server requests. Do not change the website audience or publish a separate endpoint without resolving this with the owner.
- Add account billing controls and access enforcement. Preserve exports/read access when a subscription lapses. Decide and document grace periods, cancellations, refunds and retention.
- Test genuine sandbox signup, duplicate clicks, renewals, failures, cancel/restore, delayed events and two-account isolation. Reconcile provider invoices/refunds/fees with a profit ledger.

## Required before real payments

Merchant identity, supported business setup, support email, tax configuration, terms/privacy/refund policy, reviewed pricing, owner launch approval and successful end-to-end sandbox acceptance. Secrets belong in the hosting secret store, never in this public repository or chat. The hard sandbox restriction must be deliberately replaced and reviewed before live credentials are supported.

## References checked 8 November 2026

- [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe customer portal sessions](https://docs.stripe.com/api/customer_portal/sessions/create)
- [Subscription listing and item periods](https://docs.stripe.com/api/subscriptions/list)
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Price validation](https://docs.stripe.com/api/prices/retrieve)
- [Checkout session retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [D1 prepared statements and atomic writes](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Stripe test clocks](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)
- [Test payment methods](https://docs.stripe.com/testing?testing-method=payment-methods)
- [Webhook delivery and signature verification](https://docs.stripe.com/events/manage-webhook-endpoints)

API version pinned to the documented `2026-10-28.endive`. Recheck these contracts when integration credentials become available.
