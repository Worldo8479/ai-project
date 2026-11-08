# Subscription implementation status

The business model is one recurring studio subscription shared by the web and Mac apps. Proposed price: USD 29/month. No purchases, charges or paid entitlements are enabled.

`lib/stripe-sandbox.js` is server-only, sandbox-only groundwork, with mocked contract tests. It is deliberately not imported by a public route or UI. It rejects live keys, validates the exact monthly price, creates hosted Checkout and portal sessions, uses stable retry keys, checks existing subscriptions across all pages, and describes sandbox access only from matching customer/price records and unexpired active/trial periods. Return origins and price IDs are server configuration, never client choices. Provider errors are redacted.

These are simulated tests, not completed Stripe integration tests. No Stripe merchant account is connected. The site remains owner-private.

## Durable sandbox coordination

`lib/billing-service.js` now binds the authenticated account to an opaque provider customer reference in D1. Unique constraints prevent two owners from sharing a customer within a configured sandbox. A stable server-configured scope identifies one Stripe merchant sandbox; never reuse it for another merchant or sandbox. Client-supplied customer IDs, account IDs and request keys are ignored.

An atomic, expiring database lease serializes billing work per account. Customer creation and Checkout keys are persisted before provider writes. Lost responses reuse the exact request key and parameters, including after process restart. Existing open sessions are retrieved from Stripe rather than creating new ones. Only provider-confirmed expiry permits a replacement. Completed sessions direct the account to billing management; they do not grant access. A late lease holder cannot overwrite the newer holder's state or release its lock.

Uncertain operations at least 23 hours old stop for reconciliation. Stripe may prune keys after 24 hours, so blindly retrying an old key can create a new object. A future operational reconciliation flow must inspect provider state before resolving these records. Do not manually clear a pending attempt to bypass this protection. Completed-subscription cancellation/re-subscription reconciliation remains unfinished.

Migration `0002_lyrical_masked_marvel.sql` adds billing tables without modifying review data. Ten coordinator tests exercise real SQLite migrations with simulated provider calls; an additional gateway test rejects mismatched checkout sessions. Coverage includes two-account isolation, forged ownership, double clicks, lost customer/checkout responses, restart, lease recovery, expired and completed sessions, and stale-request refusal. One test combines the actual gateway and coordinator to verify identical provider request parameters on retry. These are not genuine Stripe sandbox acceptance tests.

Neither the coordinator nor its request adapter is mounted as an application route. No checkout button, paid entitlement or charge is enabled.

## Required before enabling even sandbox purchases

- Connect and verify the intended Stripe sandbox, fixed plan and stable scope; complete real provider acceptance tests.
- Implement verified webhook processing using raw bodies and Stripe's SDK. Persist event IDs, reconcile current provider state, handle retries and out-of-order events, and never grant access from a success-page redirect.
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
- [Webhook delivery and signature verification](https://docs.stripe.com/events/manage-webhook-endpoints)

API version pinned to the documented `2026-10-28.endive`. Recheck these contracts when integration credentials become available.
