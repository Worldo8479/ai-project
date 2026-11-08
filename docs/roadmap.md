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

The private web preview now has an account backend with saved reviews, comparisons, version-protected saves, reversible Trash and full account export. The sandbox billing gateway now has durable account binding, serialized checkout creation and recovery tests; checkout is not enabled. See `docs/billing.md` for the remaining lifecycle and launch work. A native Mac document preview now compiles, passes eight model tests, packages and launches. Its UI acceptance, shared login/sync and customer distribution remain unfinished; see `mac/README.md`. There is no active paid subscription or revenue. The full web and Mac requirements remain unfinished.
