#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
mac_release="${1:-$project_root/work/mac-release}"
mac_app="$mac_release/RetainerLens.app"
test -x "$mac_app/Contents/MacOS/RetainerLens"
installer_stage="$(mktemp -d /private/tmp/retainerlens-installer.XXXXXX)"
trap 'rm -rf "$installer_stage"' EXIT
mkdir -p "$installer_stage/root/Applications"
ditto --norsrc "$mac_app" "$installer_stage/root/Applications/RetainerLens.app"
xattr -dr com.apple.FinderInfo "$installer_stage/root/Applications/RetainerLens.app" 2>/dev/null || true
xattr -dr com.apple.ResourceFork "$installer_stage/root/Applications/RetainerLens.app" 2>/dev/null || true
codesign --verify --strict "$installer_stage/root/Applications/RetainerLens.app"
pkgbuild --analyze --root "$installer_stage/root" "$installer_stage/components.plist"
python3 - "$installer_stage" "$(uname -m)" <<'PY'
import pathlib,plistlib,sys
stage=pathlib.Path(sys.argv[1])
components=plistlib.loads((stage/'components.plist').read_bytes())
for component in components:
    component['BundleIsRelocatable']=False
    component['BundleIsVersionChecked']=True
(stage/'components.plist').write_bytes(plistlib.dumps(components))
(stage/'requirements.plist').write_bytes(plistlib.dumps({'arch':[sys.argv[2]],'os':['14.0']}))
PY
pkgbuild --root "$installer_stage/root" --component-plist "$installer_stage/components.plist" \
  --identifier com.retainerlens.desktop.preview --version 0.1.0 --install-location / \
  "$installer_stage/RetainerLens-component.pkg"
productbuild --synthesize --product "$installer_stage/requirements.plist" \
  --package "$installer_stage/RetainerLens-component.pkg" "$installer_stage/Distribution.xml"
python3 - "$installer_stage/Distribution.xml" <<'PY'
import sys,xml.etree.ElementTree as ET
path=sys.argv[1];tree=ET.parse(path);root=tree.getroot()
ET.SubElement(root,'title').text='RetainerLens — Desktop Preview'
ET.SubElement(root,'welcome',{'file':'welcome.html','mime-type':'text/html'})
tree.write(path,encoding='utf-8',xml_declaration=True)
PY
installer="$mac_release/RetainerLens-0.1.0-$(uname -m)-preview.pkg"
productbuild --distribution "$installer_stage/Distribution.xml" --package-path "$installer_stage" \
  --resources "$project_root/mac/installer-resources" "$installer"
pkgutil --payload-files "$installer" > "$mac_release/installer-payload.txt"
shasum -a 256 "$installer"
echo "Built unsigned developer installer: $installer"
