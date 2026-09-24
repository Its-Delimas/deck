#!/usr/bin/env bash
# Packages an already-built Linux binary as a tarball and a .deb.
#
#   scripts/package-linux.sh <version>
#
# Expects build/bin/deck to exist. Output lands in dist/.
set -euo pipefail

VERSION="${1:-0.0.0}"
VERSION="${VERSION#v}"
# Debian versions must begin with a digit, so untagged builds (a bare commit
# hash from git describe) get a numeric prefix.
case "$VERSION" in
  [0-9]*) ;;
  *) VERSION="0.0.0+$VERSION" ;;
esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
ICONS="16 32 48 64 128 256 512"

test -x "$ROOT/build/bin/deck" || { echo "build/bin/deck is missing — run 'make build' first" >&2; exit 1; }
rm -rf "$DIST"
mkdir -p "$DIST"

# ---- portable tarball -------------------------------------------------
STAGE="$DIST/deck-$VERSION-linux-amd64"
mkdir -p "$STAGE"
cp "$ROOT/build/bin/deck" "$STAGE/"
cp "$ROOT/build/linux/deck.desktop" "$STAGE/"
cp "$ROOT/build/appicon/deck-256.png" "$STAGE/deck.png"
cp "$ROOT/README.md" "$STAGE/"
cat > "$STAGE/install.sh" <<'INNER'
#!/usr/bin/env bash
# Installs deck for the current user. No root required.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${PREFIX:-$HOME/.local}"
install -Dm755 "$HERE/deck" "$PREFIX/bin/deck"
install -Dm644 "$HERE/deck.png" "$PREFIX/share/deck/icon.png"
install -Dm644 "$HERE/deck.desktop" "$PREFIX/share/applications/deck.desktop"
sed -i -e "s|^Exec=deck$|Exec=$PREFIX/bin/deck|" \
       -e "s|^Icon=deck$|Icon=$PREFIX/share/deck/icon.png|" \
       "$PREFIX/share/applications/deck.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$PREFIX/share/applications" || true
echo "deck installed to $PREFIX/bin/deck — it is now in your application menu."
INNER
chmod +x "$STAGE/install.sh"
tar -C "$DIST" -czf "$DIST/deck-$VERSION-linux-amd64.tar.gz" "deck-$VERSION-linux-amd64"
rm -rf "$STAGE"

# ---- debian package ---------------------------------------------------
PKG="$DIST/debian"
mkdir -p "$PKG/DEBIAN" "$PKG/usr/bin" "$PKG/usr/share/applications"
install -Dm755 "$ROOT/build/bin/deck" "$PKG/usr/bin/deck"
install -Dm644 "$ROOT/build/linux/deck.desktop" "$PKG/usr/share/applications/deck.desktop"
for size in $ICONS; do
  install -Dm644 "$ROOT/build/appicon/deck-$size.png" \
    "$PKG/usr/share/icons/hicolor/${size}x${size}/apps/deck.png"
done
cat > "$PKG/DEBIAN/control" <<CONTROL
Package: deck
Version: $VERSION
Section: utils
Priority: optional
Architecture: amd64
Depends: libgtk-3-0, libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37
Maintainer: Its-Delimas <spencerdelimas@gmail.com>
Description: Developer system monitor and environment manager
 deck shows what a development machine is doing: processes, the ports they
 bind, developer services, disk usage, logs, a real terminal and a hardware
 inventory with live health checks.
CONTROL
dpkg-deb --build --root-owner-group "$PKG" "$DIST/deck_${VERSION}_amd64.deb" >/dev/null
rm -rf "$PKG"

echo "Packaged:"
ls -1sh "$DIST"
