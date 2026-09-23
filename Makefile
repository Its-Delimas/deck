# deck — developer system monitor
#
# WebKitGTK 4.1 is the default on current distributions; the build tag selects
# it over the 4.0 series that Wails assumes.
TAGS := webkit2_41

PREFIX ?= $(HOME)/.local
ICON_SIZES := 16 32 48 64 128 256 512

.PHONY: dev build run clean tidy check install uninstall desktop-shortcut

dev:
	wails dev -tags $(TAGS)

build:
	wails build -tags $(TAGS) -trimpath

run: build
	./build/bin/deck

check:
	go vet ./...
	cd frontend && npx tsc --noEmit

tidy:
	go mod tidy
	cd frontend && npm install

clean:
	rm -rf build/bin frontend/dist

# Installs the binary, its icons and the menu launcher into $(PREFIX); the
# default of ~/.local needs no root. Icons are installed both into the hicolor
# theme (best case) and to a fixed path the launcher references directly, so a
# theme directory we cannot write to does not leave the app iconless.
install: build
	install -Dm755 build/bin/deck $(PREFIX)/bin/deck
	install -Dm644 build/appicon/deck-256.png $(PREFIX)/share/deck/icon.png
	-@for s in $(ICON_SIZES); do \
		install -Dm644 build/appicon/deck-$$s.png \
			$(PREFIX)/share/icons/hicolor/$${s}x$${s}/apps/deck.png 2>/dev/null; \
	done
	install -Dm644 build/linux/deck.desktop $(PREFIX)/share/applications/deck.desktop
	sed -i -e "s|^Exec=deck$$|Exec=$(PREFIX)/bin/deck|" \
	       -e "s|^Icon=deck$$|Icon=$(PREFIX)/share/deck/icon.png|" \
	       $(PREFIX)/share/applications/deck.desktop
	-update-desktop-database $(PREFIX)/share/applications
	-gtk-update-icon-cache -f -t $(PREFIX)/share/icons/hicolor
	@echo "deck installed to $(PREFIX)/bin/deck"

# Optional: also drop a launcher on the desktop and mark it trusted so the
# desktop runs it instead of showing an "untrusted" placeholder.
desktop-shortcut: install
	install -Dm755 $(PREFIX)/share/applications/deck.desktop $(HOME)/Desktop/deck.desktop
	-gio set $(HOME)/Desktop/deck.desktop metadata::trusted true
	@echo "launcher placed on the desktop"

uninstall:
	rm -f $(PREFIX)/bin/deck $(PREFIX)/share/applications/deck.desktop $(HOME)/Desktop/deck.desktop
	rm -rf $(PREFIX)/share/deck
	-@for s in $(ICON_SIZES); do \
		rm -f $(PREFIX)/share/icons/hicolor/$${s}x$${s}/apps/deck.png 2>/dev/null; \
	done
	-update-desktop-database $(PREFIX)/share/applications
