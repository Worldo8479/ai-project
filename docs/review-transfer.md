# Web and Mac review transfer

Automatic account sync is not connected in the Mac preview. The two apps now use the same local archive format for manual transfer.

1. On the web, load a saved month before editing. Choose **Export review** to download the current working month as a `.retainerlens` document, including month, currency, target and the saved version it came from. **Export account** still downloads all saved reviews and Trash as JSON.
2. Open the document in the Mac preview using File → Open. Edit and save locally. Native file-dialog acceptance remains a verification gap; the shared-format model tests pass.
3. On the web, choose **Open review archive**, select the Mac document or account JSON export, and choose a month. The dialog shows client count, fees, delivery profit and target before loading. No account records change at this step.
4. Choose **Save month** to save the loaded review. If the account version has changed, the save is rejected. Export the working review before loading the latest account version to reconcile changes. You can also choose a different month to save a separate review.

This is one-review-at-a-time transfer, not bulk restore or automatic sync. Loading a record from archive Trash creates a working copy; it does not restore account Trash. Existing deleted account records must be restored through the normal account controls before they can be edited.

## Conflict invariants

The client retains a working copy's original revision independently of the history list. Refreshing history does not change that revision. New drafts cannot borrow an existing saved record's revision. A late save response cannot reassign a revision to a different document loaded while the request was running. The server still performs owner-scoped conditional writes and rejects stale versions with 409.

Archives accept at most 25 MB and 1,200 reviews; each review uses the normal 1–500 client validation. Duplicate month/currency keys, malformed Trash, invalid timestamps and invalid numeric data are rejected before changing the workspace. Imported owner fields and unknown properties are discarded. Imported revisions never authorize access to another account.

## Native account connection

The current Sites documentation describes browser identity and identity-less server access, but does not document native desktop authorization. The private site's server access token is not a per-user credential and must not be embedded in the Mac app or handed to customers. Browser cookies must not be copied into the app. A supported native authorization path or a reviewed hosting/identity change remains required before automatic shared-account sync can be completed. Keep the website private while resolving this.
