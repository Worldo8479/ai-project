# Shared web and Mac accounts — proposed next step

Status: proposal awaiting owner choice and a connected Supabase account. No Supabase project has been created, no data has been transferred, no new account emails have been sent, and no paid plan has been selected. The existing Sites website remains owner-private. This proposal is not evidence that native login or sync works.

## Why this is the next architectural decision

The web app currently uses Sites-provided browser identity. The native app is a local document application. Sites' available identity documentation describes browser sign-in and identity-less service access, but does not document a native desktop token flow. Its service token cannot become a customer login credential. Copying browser cookies or embedding a service credential would not satisfy secure shared accounts.

The recommended candidate is one owner-controlled Supabase development project for shared identity and account data. Supabase documents Swift OAuth sign-in and PKCE sessions, and offers two free projects across qualifying organizations. This is a development option, not a promise of permanently free production hosting. Production capacity, email delivery and hosting costs must be reviewed before launch.

The Supabase integration is available but was not connected when this proposal was written. Owner approval of this direction and an account connection are required before project provisioning or data migration. Approval would not authorize a paid upgrade, public launch, new email distribution or advertising.

## Concrete migration boundary

Keep the current private website and its data intact while implementing the replacement account service. Do not layer a desktop credential onto the Sites access gate. A native-compatible API must be reachable by authenticated native clients, with product access restricted to explicitly approved test identities while development stays private. The API's network reachability is separate from permission to read data or join the product.

The proposed application API uses one verified identity subject for both web and Mac. It carries over the existing review validation, currency rules, revision checks, Trash/restore, account preferences and billing behavior. PostgreSQL storage requires an explicit adapter and transactional migration of the current SQLite/D1 invariants; it is not a drop-in schema change. The marketing website remains informational, with software images and no interactive demo.

| Area | Proposed implementation | Required proof before use |
| --- | --- | --- |
| Web identity | Supabase-managed account session, with server-verified identity on every account operation | Real sign-in, expiry, sign-out and second-account isolation |
| Mac identity | Official Swift SDK and external browser authorization using PKCE; session storage backed by macOS Keychain | Callback validation, canceled login, token refresh, revocation and secure sign-out |
| Private development | Explicit allowed test identities and closed registration; anonymous callers cannot read or write account data | Anonymous and unapproved-user rejection on every data path |
| Reviews | Shared API retaining owner scoping, revision-conditional writes and reversible Trash | Web-to-Mac and Mac-to-web round trips; concurrent edit conflicts without data loss |
| Database | Row-level restrictions for exposed reads; clients cannot directly write billing state or bypass subscription checks | Attempts through direct database APIs fail or enforce the same ownership/access rules |
| Subscription | Same server-owned customer mapping, notification receipts and current-state reconciliation for both apps | Real sandbox purchases, renewals, declines, recovery and cancellation on both clients |
| Offline Mac work | Local drafts retain their base revision; reconnect requires conflict review when the server changed | Offline edits, account switching, deletion conflicts, retries and late responses |
| Migration | Explicit authenticated export/import of the owner's private preview, preserving a rollback copy | No email-based automatic account linking; imported owner IDs grant no permissions |

Database administrative credentials and Stripe secrets stay server-side. Public client keys are not authorization by themselves. Native requests must not contain trusted owner IDs selected by the client. If an administrative backend bypasses row-level policies, it must independently bind every query to the verified identity and enforce subscription checks.

The existing Stripe sandbox belongs to one merchant environment. Changing identity/storage must not silently create a second paid subscription, reuse a scope for another merchant, or copy old subscription ownership based only on an email match. A deliberate owner migration is required.

## Implementation order after approval and connection

1. Inspect the connected account and available free-project capacity. Present any cost before creating a paid resource. Provision an isolated development project only with owner approval and verified privacy controls.
2. Implement and test the account-data adapter using fictional users. Disable open registration and keep administrative secrets out of the public repository and app bundles.
3. Implement real web and native account sessions against that project. Retain the current native document UI and local-file functionality; a browser wrapper alone is not the requested Mac app.
4. Add shared review sync with explicit conflict recovery and server-verified subscription state. Keep exports and data management usable after a lapse.
5. Claim the existing Stripe environment and finish the blocked payment lifecycle/delivery tests using an authorized test key. No live purchases follow automatically from a successful test.
6. Complete native signing/notarization and update the website package only after the new app is verified. User-driven UI acceptance is required while computer control remains off.
7. Review migration, support identity, production costs, customer policies and launch readiness. Public access and ad spend require the owner's separate approval.

For customer email/password or email-link login, Supabase's default email service is limited to project team addresses. A production email provider or an approved OAuth provider setup is an additional dependency. Neither is configured by this proposal.

## Primary references checked 8 November 2026

- [Swift OAuth sign-in](https://supabase.com/docs/reference/swift/auth-signinwithoauth)
- [PKCE sessions](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Free project limits and billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Email delivery requirements](https://supabase.com/docs/guides/auth/auth-smtp)
