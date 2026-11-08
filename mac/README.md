# RetainerLens for Mac

A native SwiftUI document application, targeting macOS 14 or later. This is a local desktop preview, not the finished account-synced product.

## Run and package

With Xcode and a Swift 6 toolchain (the standalone Command Line Tools do not include XCTest):

```sh
cd mac
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
swift test
swift run RetainerLens
```

From the repository root, `bash scripts/build-mac.sh` builds a release executable and `.app` bundle in `work/mac-release/`, with an architecture-specific ZIP. The script uses ad-hoc signing for local testing. It does not request or use a Developer ID identity and does not notarize the app. App bundles, intermediate binaries and customer documents are excluded from the public repository.

Run `bash scripts/package-mac.sh` after building to create an architecture-specific `.pkg`. It installs only `Applications/RetainerLens.app`, disables bundle relocation, requires macOS 14+, and includes no installation scripts or background services. The website's downloadable Apple Silicon preview package is intentionally tracked in `public/downloads/` at the owner's request, together with its hash and release metadata. App bundles, intermediate binaries and customer documents remain excluded. The installer is unsigned and unnotarized, so macOS may block installation; Developer ID signing and notarization remain required for customer distribution.

## Implemented document flow

- Create a monthly review or explore explicitly fictional sample clients.
- Use File → Open to open a `retainerlens-account-v1` JSON export from the web app.
- Edit fees, hours and delivery costs in native forms; review weighted portfolio margins and client fee/hour scenarios.
- Create reviews, change review settings, and move reviews to reversible local Trash.
- Use standard File → Save / Save As for `.retainerlens` documents. Existing JSON files are editable, so duplicate an imported backup first if you want to keep the original unchanged.

The archive format preserves the web review revision and timestamps. Local edits are marked separately with `localEdited`; they are not represented as a successful cloud save. Local Trash does not change the web account. Validation rejects malformed archives and duplicate review keys before replacing the document. Generated web calculation fixtures verify arithmetic parity with the JavaScript product.

## Verification

Eight native tests pass: web calculation parity, weighted totals, archive round trips, conflict metadata preservation, reversible Trash, invalid-edit atomicity, duplicate-month protection and malformed-input rejection. The web suite also checks the shared fixtures against current JavaScript logic. Debug and release builds pass; the packaged app passes ad-hoc signature verification and opens to the native welcome screen.

Desktop automation lost screen-capture access after launch, so the client editor, File Save/Open, visual layout and keyboard workflow still require click-through acceptance. Build and model tests do not establish that those UI flows are finished. No account sync or payment checks have passed on Mac.

## Still required

Browser-based account authorization with a reviewed desktop token flow, Keychain storage, the shared authenticated API, account isolation, conflict-aware bidirectional sync, subscription entitlement enforcement, offline queue/recovery, full accessibility/keyboard acceptance, signed/notarized distribution and updates. The existing private Sites session is not a desktop login token; do not copy browser cookies or embed a client secret. Keep local preview status visible until the shared-account experience is implemented and verified.

Apple references: [DocumentGroup](https://developer.apple.com/documentation/swiftui/documentgroup), [FileDocument](https://developer.apple.com/documentation/swiftui/filedocument), and [Table](https://developer.apple.com/documentation/swiftui/table).
