package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"deck/internal/health"
	"deck/internal/hwinfo"
	"deck/internal/logs"
	"deck/internal/netinfo"
	"deck/internal/proc"
	"deck/internal/project"
	"deck/internal/services"
	"deck/internal/storage"
	"deck/internal/system"
	"deck/internal/term"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the single object bound to the frontend. It owns the collectors and
// the metrics ticker that pushes snapshots to the UI.
type App struct {
	ctx context.Context

	system   *system.Collector
	procs    *proc.Collector
	net      *netinfo.Collector
	services *services.Manager
	terms    *term.Manager
	logs     *logs.Streamer

	version    string
	settings   Settings
	settingsMu sync.Mutex

	healthMu     sync.Mutex
	healthCancel context.CancelFunc

	tickMu   sync.Mutex
	interval time.Duration
	stop     chan struct{}
}

func NewApp() *App {
	return &App{interval: time.Second, settings: defaultSettings()}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	emit := func(event string, data ...interface{}) { wruntime.EventsEmit(ctx, event, data...) }

	a.system = system.NewCollector()
	a.procs = proc.NewCollector()
	a.net = netinfo.NewCollector()
	a.services = services.NewManager()
	a.terms = term.NewManager(emit)
	a.logs = logs.NewStreamer(emit)
	a.settings = loadSettings()

	a.startTicker()
}

func (a *App) shutdown(ctx context.Context) {
	a.stopTicker()
	if a.terms != nil {
		a.terms.CloseAll()
	}
	if a.logs != nil {
		a.logs.StopAll()
	}
}

// startTicker pushes a metrics snapshot on a fixed cadence. Pushing from Go
// keeps the frontend free of polling loops and guarantees an even sample rate.
func (a *App) startTicker() {
	a.tickMu.Lock()
	defer a.tickMu.Unlock()
	if a.stop != nil {
		close(a.stop)
	}
	stop := make(chan struct{})
	a.stop = stop
	interval := a.interval

	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				snap := a.system.Collect()
				wruntime.EventsEmit(a.ctx, "metrics", snap)
			}
		}
	}()
}

func (a *App) stopTicker() {
	a.tickMu.Lock()
	defer a.tickMu.Unlock()
	if a.stop != nil {
		close(a.stop)
		a.stop = nil
	}
}

// SetPollInterval changes the metrics cadence, in milliseconds.
func (a *App) SetPollInterval(ms int) {
	if ms < 250 {
		ms = 250
	}
	if ms > 10000 {
		ms = 10000
	}
	a.tickMu.Lock()
	a.interval = time.Duration(ms) * time.Millisecond
	a.tickMu.Unlock()
	a.startTicker()
}

// ---- System -----------------------------------------------------------

// Version reports the build the user is running.
func (a *App) Version() string { return a.version }

func (a *App) GetHost() system.HostInfo      { return a.system.Host() }
func (a *App) GetSnapshot() *system.Snapshot { return a.system.Collect() }

// ---- Processes --------------------------------------------------------

func (a *App) ListProcesses() ([]proc.Info, error) { return a.procs.List() }

func (a *App) ProcessDetail(pid int32) (*proc.Detail, error) { return a.procs.Describe(pid) }

func (a *App) KillProcess(pid int32, mode string) error { return proc.Kill(pid, mode) }

// ---- Network ----------------------------------------------------------

func (a *App) ListConnections() ([]netinfo.Conn, error) { return a.net.All() }
func (a *App) ListPorts() ([]netinfo.Conn, error)       { return a.net.Listening() }

// ---- Storage ----------------------------------------------------------

func (a *App) ScanPath(path string) (*storage.ScanResult, error) { return storage.Scan(path) }
func (a *App) HomeDir() string                                   { return storage.Home() }

// ---- Services ---------------------------------------------------------

func (a *App) ListServices() ([]services.Service, error) { return a.services.List() }

func (a *App) ServiceAction(id, source, action string) error {
	return a.services.Action(id, source, action)
}

func (a *App) ServiceLogs(id, source string, lines int) (string, error) {
	return a.services.Logs(id, source, lines)
}

// ---- Project ----------------------------------------------------------

// ProjectState is the live view of a project: what it is running right now.
type ProjectState struct {
	Project   *project.Project `json:"project"`
	Processes []proc.Info      `json:"processes"`
	Ports     []netinfo.Conn   `json:"ports"`
	CPU       float64          `json:"cpu"`
	Memory    uint64           `json:"memory"`
}

func (a *App) OpenProject(path string) (*project.Project, error) {
	p, err := project.Open(path)
	if err != nil {
		return nil, err
	}
	a.rememberProject(p.Path)
	return p, nil
}

// PickProject opens a native directory chooser.
func (a *App) PickProject() (string, error) {
	return wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title:            "Open project",
		DefaultDirectory: storage.Home(),
	})
}

func (a *App) DiscoverProjects() []project.Project {
	var out []project.Project
	for _, dir := range project.Discover(storage.Home(), 3) {
		if p, err := project.Open(dir); err == nil {
			out = append(out, *p)
		}
	}
	return out
}

// GetProjectState joins the process table and socket table against a project
// directory: the processes it started, the ports they bound, and what they cost.
func (a *App) GetProjectState(path string) (*ProjectState, error) {
	p, err := project.Open(path)
	if err != nil {
		return nil, err
	}
	state := &ProjectState{Project: p}

	pids := map[int32]bool{}
	for _, pid := range proc.PIDsFor(path) {
		pids[pid] = true
	}
	all, err := a.procs.List()
	if err == nil {
		// Include descendants so a `npm run dev` child chain is attributed too.
		byPID := make(map[int32]proc.Info, len(all))
		for _, p := range all {
			byPID[p.PID] = p
		}
		for _, p := range all {
			if pids[p.PID] {
				continue
			}
			for parent := p.PPID; parent > 1; {
				if pids[parent] {
					pids[p.PID] = true
					break
				}
				next, ok := byPID[parent]
				if !ok {
					break
				}
				parent = next.PPID
			}
		}
		for _, p := range all {
			if pids[p.PID] {
				state.Processes = append(state.Processes, p)
				state.CPU += p.CPU
				state.Memory += p.MemRSS
			}
		}
	}
	sort.Slice(state.Processes, func(i, j int) bool { return state.Processes[i].CPU > state.Processes[j].CPU })

	if conns, err := a.net.Listening(); err == nil {
		for _, c := range conns {
			if pids[c.PID] || (c.Cwd != "" && strings.HasPrefix(c.Cwd, path)) {
				state.Ports = append(state.Ports, c)
			}
		}
	}
	return state, nil
}

// RunScript launches a project script and streams its output as a log source.
func (a *App) RunScript(dir, command, id string) error {
	if id == "" {
		id = fmt.Sprintf("script:%d", time.Now().UnixNano())
	}
	return a.logs.Start(id, logs.Source{
		ID: id, Label: command, Kind: "command", Target: command, Dir: dir,
	})
}

// ---- Terminal ---------------------------------------------------------

func (a *App) TermStart(id, dir string, cols, rows int) error {
	return a.terms.Start(id, dir, cols, rows)
}
func (a *App) TermWrite(id, data string) error      { return a.terms.Write(id, data) }
func (a *App) TermResize(id string, c, r int) error { return a.terms.Resize(id, c, r) }
func (a *App) TermClose(id string)                  { a.terms.Close(id) }

// ---- Logs -------------------------------------------------------------

func (a *App) LogSources() []logs.Source { return logs.Available() }

func (a *App) LogStart(id string, src logs.Source) error { return a.logs.Start(id, src) }
func (a *App) LogStop(id string)                         { a.logs.Stop(id) }

// ---- Shell helpers ----------------------------------------------------

// OpenURL hands a URL (typically http://localhost:<port>) to the desktop.
func (a *App) OpenURL(url string) { wruntime.BrowserOpenURL(a.ctx, url) }

func (a *App) Quit() { wruntime.Quit(a.ctx) }

func (a *App) Minimise() { wruntime.WindowMinimise(a.ctx) }

func (a *App) ToggleMaximise() { wruntime.WindowToggleMaximise(a.ctx) }

// ---- Machine inventory and health -------------------------------------

// GetMachineReport returns the hardware inventory. Values come straight from
// the kernel and firmware; anything the hardware does not report is marked
// unavailable instead of being filled in.
func (a *App) GetMachineReport() *hwinfo.Report { return hwinfo.Collect() }

// GetBattery re-reads just the battery, for live updates.
func (a *App) GetBattery() *hwinfo.Battery { return hwinfo.Collect().Battery }

// RunHealthCheck performs live measurements: real work on the CPU, real bytes
// through memory and the disk, and a timed sample of the battery counter. It
// takes around 25 seconds and emits "health:progress" as it goes.
func (a *App) RunHealthCheck() []health.Check {
	a.healthMu.Lock()
	if a.healthCancel != nil {
		a.healthCancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	a.healthCancel = cancel
	a.healthMu.Unlock()
	defer func() {
		cancel()
		a.healthMu.Lock()
		a.healthCancel = nil
		a.healthMu.Unlock()
	}()

	// deck's own sampling competes with the benchmark, so the metrics ticker
	// pauses for the duration and the UI coasts on its last snapshot.
	a.stopTicker()
	defer a.startTicker()

	return health.Run(ctx, func(id, label string, index, total int) {
		wruntime.EventsEmit(a.ctx, "health:progress", id, label, index, total)
	})
}

// CancelHealthCheck stops a run in progress.
func (a *App) CancelHealthCheck() {
	a.healthMu.Lock()
	defer a.healthMu.Unlock()
	if a.healthCancel != nil {
		a.healthCancel()
	}
}

// ---- Window -----------------------------------------------------------

type Geometry struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// GetGeometry and SetGeometry back the custom resize grips: the window is
// frameless, so deck draws and drives its own chrome.
func (a *App) GetGeometry() Geometry {
	w, h := wruntime.WindowGetSize(a.ctx)
	x, y := wruntime.WindowGetPosition(a.ctx)
	return Geometry{X: x, Y: y, W: w, H: h}
}

func (a *App) SetGeometry(g Geometry) {
	if g.W > 0 && g.H > 0 {
		wruntime.WindowSetSize(a.ctx, g.W, g.H)
	}
	wruntime.WindowSetPosition(a.ctx, g.X, g.Y)
}

func (a *App) IsMaximised() bool { return wruntime.WindowIsMaximised(a.ctx) }
