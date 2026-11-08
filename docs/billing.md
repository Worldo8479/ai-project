# Subscription implementation status

The business model is one recurring studio subscription shared by the web and Mac apps. Proposed price: USD 29/month. No purchases, charges or paid entitlements are enabled.

`lib/stripe-sandbox.js` is server-only, sandbox-only groundwork, with mocked contract tests. It is deliberately not imported by a public route or UI. It rejects live keys, validates the exact monthly price, creates hosted Checkout and portal sessions, uses stable retry keys, checks existing subscriptions across all pages, and describes sandbox access only from matching customer/price records and unexpired active/trial periods. Return origins and price IDs are server configuration, never client choices. Provider errors are redacted.

These are simulated tests, not completed Stripe integration tests. No Stripe merchant account is connected. The site remains owner-private.

## Required before enabling even sandbox purchases

- Store an opaque account-to-Stripe-customer mapping with unique constraints. Read it using the authenticated owner only. The current gateway assumes a trusted server caller; it is not an authorization layer.
- Persist pending checkout attempts and atomically lock checkout per customer. Reuse an existing unexpired session and its request key. The gateway's subscription check alone cannot prevent two simultaneous new checkouts.
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
- [Webhook delivery and signature verification](https://docs.stripe.com/events/manage-webhook-endpoints)

API version pinned to the documented `2026-10-28.endive`. Recheck these contracts when integration credentials become available.
