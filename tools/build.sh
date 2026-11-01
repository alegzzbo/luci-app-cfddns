#!/bin/sh
# Build (and optionally install) the package with an already prepared OpenWrt SDK.
# Usage: tools/build.sh <sdk_dir> [root@router]
set -e
SDK="$1"; ROUTER="$2"
[ -d "$SDK" ] || { echo "Usage: $0 <sdk_dir> [root@router]"; exit 1; }
SRC=$(cd "$(dirname "$0")/.." && pwd)

rm -rf "$SDK/package/luci-app-cfddns"
cp -a "$SRC" "$SDK/package/luci-app-cfddns"
rm -rf "$SDK/package/luci-app-cfddns/.git"

cd "$SDK"
if ! grep -q '^CONFIG_PACKAGE_luci-app-cfddns=m' .config 2>/dev/null; then
    echo "CONFIG_PACKAGE_luci-app-cfddns=m" >> .config
    make defconfig
fi
find bin -name 'luci-app-cfddns*' -delete 2>/dev/null || true
make package/luci-app-cfddns/compile V=s

PKG=$(find bin \( -name 'luci-app-cfddns*.apk' -o -name 'luci-app-cfddns*.ipk' \) | head -n1)
[ -n "$PKG" ] || { echo "Package not found"; exit 1; }
echo "Built: $PKG"

if [ -n "$ROUTER" ]; then
    scp "$PKG" "$ROUTER:/tmp/"
    case "$PKG" in
        *.apk) ssh "$ROUTER" "apk add --allow-untrusted /tmp/$(basename "$PKG")" ;;
        *)     ssh "$ROUTER" "opkg install /tmp/$(basename "$PKG")" ;;
    esac
fi
