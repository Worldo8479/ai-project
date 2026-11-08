# Account preview verification — 8 November 2026

Private hosted URL: https://retainerlens-studio.marco-anderson2011.chatgpt.site

The account-enabled deployment succeeded. Hosted browser checks confirmed the signed-in identity is recognized, a fictional November 2026 USD review saves successfully, the saved review is retrieved after a full page reload, and comparison with the same snapshot returns zero deltas. A sample review remains in the owner's preview account. No real customer data was used.

Local verification: 11 calculation/validation tests pass; TypeScript checking passes; production Worker builds. A local database migration was applied, and the local UI saved, reloaded and loaded a review successfully.

Follow-up implementation: version-protected saves, reversible Trash, restore, and full account export. Eight additional API/database tests verify separate users, forged ownership, stale edits, cross-origin writes, Trash and export with real migration SQL. This tests the application authorization layer; the hosting identity boundary is supplied by Sites.

Still required: a more complete account/settings UI, hosted billing lifecycle tests, Mac app implementation and live multi-account acceptance testing. The current implementation filters reads and writes using the authenticated user ID and rejects cross-origin save requests, but this does not substitute for the remaining integration tests.

Paid subscriptions, customer acquisition and profit are not yet achieved. Website access must remain private per the owner's instruction.

## Account safeguards acceptance

A fresh browser run verified opening the client editor, moving the sample review to Trash through the in-page confirmation, restoring it, saving a new revision, and downloading the full account JSON export. The downloaded file contained one active sample review, no trashed reviews, and month/currency/target/rows/revision metadata. No browser warning or error was captured in that run. The earlier browser interaction issue is resolved for this workflow.

GitHub Actions run 42507353803 passed for the account-safeguards commit. Nineteen local tests and the production build pass. Further billing and Mac work remains separate and unfinished.

## Account preferences — 8 November 2026

An Account dialog now shows the signed-in name/email, default currency and margin target, current private-preview subscription status, account export and sign-out. Defaults are stored per authenticated owner and protected by revisions. Changing preferences does not relabel or recalculate current/saved reviews; Start fresh and an untouched new-account workspace use the defaults. Late startup responses do not replace a review the user has begun editing. Sign-out asks for confirmation when a working review is present.

Five database/API tests cover defaults, owner isolation, forged identity, stale edits, validation, origin checks and export metadata without altering saved reviews. UI element references and JavaScript syntax were checked. Browser and visual acceptance for this new dialog were not performed because the owner disabled computer control in this chat. Earlier browser evidence above covers earlier features only.
