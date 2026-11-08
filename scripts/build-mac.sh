#!/bin/bash
set -euo pipefail
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
project_root="$(cd "$(dirname "$0")/.." && pwd)"
mac_build_root="$project_root/work/mac-build"
mac_output_root="${1:-$project_root/work/mac-release}"
mkdir -p "$mac_output_root" "$project_root/work/swift-cache"
export CLANG_MODULE_CACHE_PATH="$project_root/work/swift-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$project_root/work/swift-cache"
swift build --package-path "$project_root/mac" --scratch-path "$mac_build_root" --cache-path "$project_root/work/swiftpm-cache" --disable-sandbox -c release
mac_binary_dir="$(swift build --package-path "$project_root/mac" --scratch-path "$mac_build_root" --disable-sandbox -c release --show-bin-path)"
mac_app="$mac_output_root/RetainerLens.app"
mkdir -p "$mac_app/Contents/MacOS" "$mac_app/Contents/Resources"
cp "$mac_binary_dir/RetainerLens" "$mac_app/Contents/MacOS/RetainerLens"
cp "$project_root/mac/Info.plist" "$mac_app/Contents/Info.plist"
# File-provider folders may attach Finder metadata to freshly built bundles.
# Remove only the two resource attributes that codesign rejects.
xattr -dr com.apple.FinderInfo "$mac_app" 2>/dev/null || true
xattr -dr com.apple.ResourceFork "$mac_app" 2>/dev/null || true
codesign --force --sign - "$mac_app"
codesign --verify --strict "$mac_app"
ditto -c -k --sequesterRsrc --keepParent "$mac_app" "$mac_output_root/RetainerLens-mac-$(uname -m)-preview.zip"
echo "Built local preview: $mac_app"
echo 'This preview is ad-hoc signed, not notarized for customer distribution.'
