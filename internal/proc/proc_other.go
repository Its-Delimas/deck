//go:build !linux

package proc

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
)

// The Linux implementation reads /proc directly because that is deck's primary
// platform. Everywhere else gopsutil provides the same information through the
// native APIs, at the cost of a slower sweep.

func (c *Collector) memoryTotal() uint64 {
	if c.memTotal > 0 {
		return c.memTotal
	}
	if v, err := mem.VirtualMemory(); err == nil {
		c.memTotal = v.Total
	}
	return c.memTotal
}

func (c *Collector) scan() ([]Info, error) {
	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	elapsed := now.Sub(c.prevTime).Seconds()
	c.prevTime = now
	total := c.memoryTotal()

	out := make([]Info, 0, len(procs))
	current := make(map[int32]cpuSample, len(procs))

	for _, p := range procs {
		info := Info{PID: p.Pid}
		info.Name, _ = p.Name()
		if info.Name == "" {
			continue
		}
		info.PPID, _ = p.Ppid()
		info.Cmdline, _ = p.Cmdline()
		info.User, _ = p.Username()
		if states, err := p.Status(); err == nil && len(states) > 0 {
			info.State = stateName(states[0])
		}
		if threads, err := p.NumThreads(); err == nil {
			info.Threads = int(threads)
		}
		if created, err := p.CreateTime(); err == nil {
			info.StartTime = created
		}
		if m, err := p.MemoryInfo(); err == nil && m != nil {
			info.MemRSS = m.RSS
			if total > 0 {
				info.MemPercent = float64(m.RSS) / float64(total) * 100
			}
		}
		// CPU time is tracked as milliseconds so the percentage is a true
		// delta rather than an average over the process lifetime.
		var used uint64
		if times, err := p.Times(); err == nil {
			used = uint64((times.User + times.System) * 1000)
		}
		if prev, ok := c.prev[p.Pid]; ok && elapsed > 0 && used >= prev.ticks {
			info.CPU = float64(used-prev.ticks) / 1000 / elapsed * 100
		}
		current[p.Pid] = cpuSample{ticks: used}
		out = append(out, info)
	}
	c.prev = current
	return out, nil
}

func stateName(s string) string {
	switch strings.ToUpper(s) {
	case "R", "RUNNING":
		return "running"
	case "S", "SLEEP", "SLEEPING":
		return "sleeping"
	case "D", "BLOCKED":
		return "waiting"
	case "Z", "ZOMBIE":
		return "zombie"
	case "T", "STOP", "STOPPED":
		return "stopped"
	case "I", "IDLE":
		return "idle"
	}
	return strings.ToLower(s)
}

func (c *Collector) Describe(pid int32) (*Detail, error) {
	list, err := c.List()
	if err != nil {
		return nil, err
	}
	var d Detail
	found := false
	for _, p := range list {
		if p.PID == pid {
			d.Info, found = p, true
		}
		if p.PPID == pid {
			d.Children = append(d.Children, p)
		}
	}
	if !found {
		return nil, fmt.Errorf("process %d not found", pid)
	}
	p, err := process.NewProcess(pid)
	if err != nil {
		return &d, nil
	}
	d.Exe, _ = p.Exe()
	d.Cwd, _ = p.Cwd()
	if n, err := p.NumFDs(); err == nil {
		d.OpenFDs = int(n)
	}
	if io, err := p.IOCounters(); err == nil && io != nil {
		d.ReadBytes, d.WriteBytes = io.ReadBytes, io.WriteBytes
	}
	if env, err := p.Environ(); err == nil {
		d.Env = env
	}
	return &d, nil
}

// Kill asks a process to stop. Signal semantics beyond terminate and kill are
// POSIX-specific, so they are reported as unsupported rather than faked.
func Kill(pid int32, mode string) error {
	p, err := process.NewProcess(pid)
	if err != nil {
		return err
	}
	switch mode {
	case "kill":
		return p.Kill()
	case "term", "int":
		return p.Terminate()
	default:
		return fmt.Errorf("%s is not supported on this platform", mode)
	}
}

func PIDsFor(root string) []int32 {
	root = filepath.Clean(root)
	procs, err := process.Processes()
	if err != nil {
		return nil
	}
	var out []int32
	for _, p := range procs {
		if cwd, err := p.Cwd(); err == nil && cwd != "" &&
			(cwd == root || strings.HasPrefix(cwd, root+string(filepath.Separator))) {
			out = append(out, p.Pid)
			continue
		}
		if cmd, err := p.Cmdline(); err == nil && cmd != "" && strings.Contains(cmd, root) {
			out = append(out, p.Pid)
		}
	}
	return out
}
