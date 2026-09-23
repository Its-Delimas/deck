# deck — developer system monitor
#
# WebKitGTK 4.1 is the default on current distributions; the build tag selects
# it over the 4.0 series that Wails assumes.
TAGS := webkit2_41

.PHONY: dev build run clean tidy check

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
