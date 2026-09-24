# deck

A native developer system monitor and environment manager for Linux.

deck answers the questions you actually have about your development machine —
what is eating the CPU, what is listening on port 3000, which services are
running, where the disk went — in one desktop application instead of six
terminal windows.

[![CI](https://github.com/Its-Delimas/deck/actions/workflows/ci.yml/badge.svg)](https://github.com/Its-Delimas/deck/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Its-Delimas/deck?display_name=tag)](https://github.com/Its-Delimas/deck/releases/latest)
![Platforms](https://img.shields.io/badge/platform-linux%20%7C%20windows%20%7C%20macos-informational)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Features

**Dashboard** — CPU, memory, GPU, disk and network at a glance, with live
charts, per-core utilisation, thermals and a single ranked list of anything
that needs attention.

**Processes** — a full process manager: search, sort, parent/child trees,
per-process detail (working directory, open files, I/O, children) and signal
control with confirmation for destructive actions.

**Network** — ports translated into meaning. Every listening socket is joined
to its owning process and project directory, so `5173 → vite → chromafinity`
replaces a raw socket table. Established connections and per-interface
throughput are a tab away.

**Storage** — directory-level size analysis with reclaimable build artefacts
(`node_modules`, `target`, `.venv`, …) called out, plus the largest files in
any tree.

**Services** — PostgreSQL, Redis, Docker containers, web servers and other
infrastructure discovered from systemd and Docker, with start/stop/restart and
recent log output.

**Project mode** — point deck at a repository and it tracks the processes it
started, the ports they bound, its git state, its scripts and its total CPU and
memory cost as one unit.

**Terminal** — real PTY sessions, not a simulated prompt.

**Logs** — the system journal and container output streamed, filtered by
severity, searchable, pausable.

**This machine** — a full hardware inventory: model, board, BIOS, CPU topology
and cache, memory, GPU, disks, panel size, network adapters, firmware and
Secure Boot state. Every value shows the `/sys` path or command it came from,
and anything the hardware does not report is marked unavailable rather than
filled in with a guess. Battery health is the firmware's measured full charge
against its design capacity, with the cycle count.

**Health check** — live measurements, not specifications: real load on every
core with the clock sampled for throttling, peak temperature caused and
observed, memory copy bandwidth, a 128 MB incompressible disk write and
read-back, and the battery charge counter sampled over ten seconds. Useful when
you are looking at a second-hand machine and want to know what it actually
does. Results and the whole inventory copy to the clipboard as plain text.

**Command palette** — `Ctrl K` for everything: switch views, open a project,
jump to a port, restart a service, kill a process.

## Architecture

```
React + TypeScript          UI, charts, interaction
        │
      Wails v2              bridge (events in, bound methods out)
        │
       Go                   system access
   ┌────┼──────┬─────────┬──────────┬────────┐
 system  proc  netinfo  services  storage  project
   └──────────────── /proc, systemd, Docker ┘
```

Metrics are pushed from Go on a fixed tick rather than polled from the
frontend, and the process and socket tables are read straight from `/proc`, so
continuous monitoring stays cheap. Platform-specific code sits behind build
tags; Linux is the first-class target.

## Requirements

- Go 1.22+
- Node 18+
- WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`) and GTK 3

## Download

Builds for every release are on the
[releases page](https://github.com/Its-Delimas/deck/releases/latest).

| Platform | File | Notes |
| --- | --- | --- |
| Debian, Ubuntu, Mint | `deck_<version>_amd64.deb` | Double-click, or `sudo dpkg -i deck_*.deb` |
| Any Linux | `deck-<version>-linux-amd64.tar.gz` | Contains `install.sh` for a per-user install; no root needed |
| Windows 10/11 | `deck-<version>-windows-amd64-installer.exe` | Or the bare `.exe` to run without installing |
| macOS 12+ | `deck-<version>-macos-universal.zip` | Universal binary (Apple silicon and Intel) |

The Windows and macOS builds are unsigned, so the first launch needs
*More info → Run anyway* on Windows, or right-click → *Open* on macOS.

### Platform support

Linux is the first-class platform and gets the direct `/proc` readers, the
systemd service control and the full hardware inventory. The other platforms
share everything that is not tied to Linux internals:

| | Linux | Windows | macOS |
| --- | :-: | :-: | :-: |
| Dashboard, charts, thermals | ● | ● | ● |
| Processes, trees, signals | ● | ● | ● |
| Ports mapped to processes | ● | ● | ● |
| Storage analysis | ● | ● | ● |
| Project mode, git, scripts | ● | ● | ● |
| Terminal | ● | ● (ConPTY) | ● |
| Hardware inventory and battery health | ● | ● (WMI) | ○ |
| Services | systemd + Docker | Docker | Docker |
| Logs | journald + Docker | Docker | Docker |

## Build from source

```sh
make install            # binary, icons and menu launcher under ~/.local
make desktop-shortcut   # the above, plus a launcher on the desktop
make dist               # tarball and .deb in dist/
make crosscheck         # compile for linux, windows and darwin
make uninstall          # remove everything it installed
```

`make install` needs no root: it puts the binary in `~/.local/bin/deck` and the
launcher in `~/.local/share/applications`, so deck shows up in the application
menu and in search. Install elsewhere with `make install PREFIX=/usr/local`.

Releases are cut by tagging: `git tag v0.1.0 && git push origin v0.1.0` builds
and publishes all three platforms.

## Development

```sh
make dev      # hot-reloading development build
make build    # production binary in build/bin/deck
make check    # go vet + TypeScript type check
```

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl K` | Command palette |
| `Ctrl 1`–`7` | Switch view |
| `Ctrl B` | Collapse sidebar |
| `/` | Focus the filter field |
| `Del` / `Shift Del` | Terminate / force kill the selected process |

## License

MIT — see [LICENSE](LICENSE).
