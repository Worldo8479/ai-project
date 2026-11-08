# Required product scope

Owner requirements, recorded 8 November 2026:
- Full account-based web application.
- Mac application.
- Recurring subscription business; target $1,000/month in actual profit.
- Public source repository with README: Worldo8479/ai-project.
- Website remains private until the owner requests otherwise.
- Advertising needs explicit approval of a concrete campaign and budget.
- Carefully designed UI; reduced decorative arrows.

## Delivery sequence

1. Shared backend: identity, user-owned client records, monthly review snapshots, comparisons, validation, data export and deletion. Authorization enforced server-side on every record operation.
2. Subscription lifecycle: hosted checkout, verified payment events, access entitlements, billing portal, cancellation, renewal failures, refunds and reconciliation. Merchant account and support identity remain owner setup dependencies.
3. Full web product: onboarding, working review, saved history, account/settings and subscription management. Multi-account isolation, restore/reload, error states and end-to-end billing tests must pass before paid launch.
4. Mac app: a deliberate native desktop experience using the same API, identity and entitlement model. Secure login, keychain-backed session storage, synced reviews, window/menu/keyboard support, offline/error behavior, signed distribution and update process. Developer signing/notarization setup will require the owner's account. A browser shortcut alone does not satisfy this requirement.
5. Customer validation, launch permission, acquisition and retention improvement. No additional platform is automatically required; add it only where customer evidence supports the cost.

The current static preview is an early prototype, not completion of the web or Mac requirements. No account backend, Mac binary or active subscription is delivered yet.
