# deck

A native developer system monitor and environment manager for Linux.

deck answers the questions you actually have about your development machine —
what is eating the CPU, what is listening on port 3000, which services are
running, where the disk went — in one desktop application instead of six
terminal windows.

![status](https://img.shields.io/badge/platform-linux-informational)

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
