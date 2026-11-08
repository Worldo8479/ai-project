# RetainerLens

A monthly retainer profitability review for small agencies. Working prelaunch prototype; not yet a revenue-generating business.

## Run

Node.js 22 or later. No dependencies or install step.

```sh
npm test
npm run build
npm start
```

Open http://127.0.0.1:4173. Deploy the `dist/` directory with any static host. `src/` is the canonical application source; the build copies it into `dist/`.

## Working features

- Editable clients, fees, delivered hours, hourly delivery costs, and other direct costs.
- Delivery profit and weighted portfolio margin, user-selected target, and fee/hour planning scenarios.
- CSV import with validation, CSV export with spreadsheet formula escaping.
- Responsive layout and printable review. Data stays in the current browser tab; no analytics, accounts, uploads, or persistence.

The illustrative client data is fictional. Currency selection changes labels, not values. Figures are delivery profit, not company net profit. Other costs, overhead, tax and customer acquisition must be considered separately. Export before closing the tab. CSV contains monthly client totals only; it does not preserve currency, target or month metadata.

## Status and next work

Canonical project repository: https://github.com/Worldo8479/ai-project (public). The owner created it for this project. All application source, tests, design notes, business plans and hosting configuration are maintained here. The hosting service uses a deployment mirror; GitHub remains the main project repository.

Website hosting, saved monthly history, payment processing, customer acquisition and paid subscriptions are not live. No ad spend has been authorized. The $29/month plan is a pricing hypothesis, not an available purchase.

See `docs/business.md` for research, economics and validation milestones; `docs/design.md` for the visual approach and QA evidence.

## Verification

`npm test` covers financial formulas, zero revenue, invalid numbers, overflow, infeasible hour budgets, quoted CSV, duplicates, and formula escaping. Browser checks confirmed editing the sample Fieldwork fee from 1,800 to 3,360 produces a 50% margin. Desktop and 390px mobile layouts were visually reviewed; the financial table scrolls within its own container without widening the page.

## Publishing hygiene

Keep customer data, billing exports, credentials, and environment files out of this public repository. Only fictional examples and aggregate non-sensitive business metrics belong here. Source visibility does not imply a redistribution license; no open-source license has been selected yet.
