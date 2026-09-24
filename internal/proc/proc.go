// Package proc enumerates running processes. On Linux it reads /proc directly
// rather than going through a general-purpose library: the process table is
// polled continuously by the UI, so the cost of each sweep matters.
package proc

import (
	"sort"
	"strings"
	"sync"
	"time"
)

type Info struct {
	PID        int32   `json:"pid"`
	PPID       int32   `json:"ppid"`
	Name       string  `json:"name"`
	Cmdline    string  `json:"cmdline"`
	User       string  `json:"user"`
	State      string  `json:"state"`
	CPU        float64 `json:"cpu"`
	MemRSS     uint64  `json:"memRss"`
	MemPercent float64 `json:"memPercent"`
	Threads    int     `json:"threads"`
	StartTime  int64   `json:"startTime"`
	Kind       string  `json:"kind"` // dev-tool classification, e.g. "node", "database"
}

type Detail struct {
	Info
	Exe      string   `json:"exe"`
	Cwd      string   `json:"cwd"`
	Nice     int      `json:"nice"`
	OpenFDs  int      `json:"openFds"`
	Env      []string `json:"env"`
	Children []Info   `json:"children"`
	ReadBytes  uint64 `json:"readBytes"`
	WriteBytes uint64 `json:"writeBytes"`
}

type Collector struct {
	mu       sync.Mutex
	prev     map[int32]cpuSample
	prevTime time.Time
	memTotal uint64
	cache    []Info
	cachedAt time.Time
}

type cpuSample struct {
	ticks uint64
	seen  bool
}

func NewCollector() *Collector {
	c := &Collector{prev: map[int32]cpuSample{}}
	_, _ = c.List()
	return c
}

// List returns every process with an instantaneous CPU percentage derived from
// the delta since the previous call.
func (c *Collector) List() ([]Info, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Since(c.cachedAt) < 400*time.Millisecond && c.cache != nil {
		return c.cache, nil
	}
	list, err := c.scan()
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Kind = classify(list[i].Name, list[i].Cmdline)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].CPU > list[j].CPU })
	c.cache, c.cachedAt = list, time.Now()
	return list, nil
}

// Tree groups processes under their parent, returning root entries in the order
// produced by List.
func (c *Collector) Tree() (map[int32][]Info, error) {
	list, err := c.List()
	if err != nil {
		return nil, err
	}
	byParent := map[int32][]Info{}
	for _, p := range list {
		byParent[p.PPID] = append(byParent[p.PPID], p)
	}
	return byParent, nil
}

var shells = map[string]bool{
	"sh": true, "bash": true, "zsh": true, "fish": true, "dash": true,
	"ksh": true, "tcsh": true, "csh": true, "nu": true, "elvish": true,
}

// isShell matches on the whole binary name: substring matching would catch
// sshd, and a daemon is not a shell.
func isShell(name string) bool { return shells[name] }

// classify tags a process with a developer-meaningful category so the UI can
// show what a PID actually *is* rather than just its binary name.
func classify(name, cmd string) string {
	n := strings.ToLower(name)
	c := strings.ToLower(cmd)
	switch {
	case strings.Contains(n, "postgres"), strings.Contains(n, "mysqld"), strings.Contains(n, "mongod"),
		strings.Contains(n, "redis"), strings.Contains(n, "clickhouse"), strings.Contains(n, "mariadb"):
		return "database"
	case strings.Contains(n, "docker"), strings.Contains(n, "containerd"), strings.Contains(n, "podman"):
		return "container"
	case n == "node" || strings.HasPrefix(n, "node"), strings.Contains(c, "vite"), strings.Contains(c, "next"),
		strings.Contains(c, "webpack"), strings.Contains(c, "esbuild"):
		return "node"
	case strings.Contains(n, "python"), strings.Contains(c, "uvicorn"), strings.Contains(c, "gunicorn"), strings.Contains(c, "flask"):
		return "python"
	case n == "go" || strings.HasPrefix(n, "go") && strings.Contains(c, "go build"), strings.Contains(c, "go run"):
		return "go"
	case strings.Contains(n, "code"), strings.Contains(n, "nvim"), strings.Contains(n, "vim"), strings.Contains(n, "idea"),
		strings.Contains(n, "zed"), strings.Contains(n, "sublime"):
		return "editor"
	case strings.Contains(n, "chrome"), strings.Contains(n, "firefox"), strings.Contains(n, "brave"), strings.Contains(n, "chromium"):
		return "browser"
	case isShell(n):
		return "shell"
	}
	return ""
}
