# RetainerLens

A monthly retainer profitability review for small agencies. Working prelaunch prototype; not yet a revenue-generating business.

## Run

Node.js 22.13 or later. Install the locked framework dependencies first.

```sh
npm run install:ci
npm test
npm run build
npm run dev
```

Open the local URL printed by the dev server. This app now uses a Cloudflare Worker and D1 database; it cannot be deployed as static files alone. `src/` contains the visual interface, `app/api/` contains authenticated endpoints, and `db/` plus `drizzle/` own the database schema. The prebuild step synchronizes interface assets. Apply the generated SQL migration to the local preview database before testing persistence; Sites applies hosted migrations during publication.

## Working features

- Editable clients, fees, delivered hours, hourly delivery costs, and other direct costs.
- Delivery profit and weighted portfolio margin, user-selected target, and fee/hour planning scenarios.
- CSV import with validation, CSV export with spreadsheet formula escaping.
- Working-review archive export and one-month import from Mac documents or web account exports, with preview and stale-version protection. See `docs/review-transfer.md`; this is manual transfer, not automatic Mac sync.
- Product information and a real software screenshot on `/`; the interactive workspace lives at `/app` and requires account sign-in. New accounts start empty, and existing accounts load their latest saved review. No interactive demo or example-data loader is offered on the website.
- Account settings show the signed-in identity and save version-protected default currency and margin preferences. Defaults apply to new reviews; current and saved reviews remain unchanged. Account exports include preferences.
- Responsive layout and printable review, account-scoped saved monthly reviews, and comparisons. Unsaved edits stay in the current tab; saved records are stored in the database. No analytics.

The illustrative client data is fictional. Currency selection changes labels, not values. Figures are delivery profit, not company net profit. Other costs, overhead, tax and customer acquisition must be considered separately. Export before closing the tab. CSV contains monthly client totals only; it does not preserve currency, target or month metadata.

## Status and next work

Canonical project repository: https://github.com/Worldo8479/ai-project (public). The owner created it for this project. All application source, tests, design notes, business plans and hosting configuration are maintained here. The hosting service uses a deployment mirror; GitHub remains the main project repository.

Private preview: https://retainerlens-studio.marco-anderson2011.chatgpt.site . The owner requested keeping the site private. Account persistence has been deployed privately and hosted save/reload/comparison checks pass. Version-protected saves, reversible Trash and full account export have passed local browser acceptance checks. See the verification notes for exact coverage. Payment processing, customer acquisition and paid subscriptions are not live. No ad spend has been authorized. The $29/month plan is a pricing hypothesis, not an available purchase.

Required final scope: a full account-based web app and a Mac app sharing account data and subscription access. See `docs/roadmap.md` for delivery requirements.

The `mac/` directory now contains a native SwiftUI document preview, shared-format archive handling, web calculation fixtures and eight native tests. It builds and launches, but shared account login/sync, billing access and desktop UI acceptance are not complete. See `mac/README.md` for build instructions and current limitations.

The website includes an Apple Silicon `.pkg` download in `public/downloads/`, with version metadata and a SHA-256 checksum. It is an unsigned, unnotarized developer installer for macOS 14+, containing the current local-document Mac preview. It does not claim account sync is finished. The screenshot in `public/images/` uses only fictional client data.

Two Google Search ad drafts, paused import CSVs and a proposed campaign specification are in `marketing/ads/`. The owner requested drafts first because no advertising account is set up. No campaign has been created on an advertising platform, no launch or budget is approved, and no money has been spent. The proposal is a $70 total-budget, seven-day test after launch and billing are ready.

See `docs/business.md` for research, economics and validation milestones; `docs/design.md` for the visual approach and QA evidence.

## Verification

`npm test` covers financial formulas, CSV, review validation, two-account data isolation, forged owner IDs, origin checks, stale-write rejection, reversible Trash and account export. API tests use the real migration SQL in an isolated SQLite database through a D1-compatible adapter. Sandbox billing tests cover durable account-to-customer binding, duplicate-click protection, checkout recovery and provider contracts with simulated Stripe responses. A separate Stripe test-environment run passed 14 API checks, including real provider session reuse, recovery and cancellation states. No payment route is enabled; full payment completion and renewals remain unverified. See `docs/billing.md` for the remaining work. Browser checks confirmed editing the sample Fieldwork fee from 1,800 to 3,360 produces a 50% margin. Desktop and 390px mobile layouts were visually reviewed; the financial table scrolls within its own container without widening the page.

## Publishing hygiene

Keep customer data, billing exports, credentials, and environment files out of this public repository. Only fictional examples and aggregate non-sensitive business metrics belong here. Source visibility does not imply a redistribution license; no open-source license has been selected yet.
