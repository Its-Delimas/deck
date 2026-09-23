//go:build linux

package proc

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var (
	clockTicks = float64(100) // _SC_CLK_TCK is 100 on every mainstream Linux build
	pageSize   = uint64(os.Getpagesize())
	bootTime   int64
	userNames  = map[string]string{}
)

func init() {
	if b, err := os.ReadFile("/proc/stat"); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(line, "btime ") {
				bootTime, _ = strconv.ParseInt(strings.TrimSpace(line[6:]), 10, 64)
			}
		}
	}
	loadPasswd()
}

func loadPasswd() {
	f, err := os.Open("/etc/passwd")
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		parts := strings.Split(sc.Text(), ":")
		if len(parts) > 2 {
			userNames[parts[2]] = parts[0]
		}
	}
}

func (c *Collector) memoryTotal() uint64 {
	if c.memTotal > 0 {
		return c.memTotal
	}
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				kb, _ := strconv.ParseUint(fields[1], 10, 64)
				c.memTotal = kb * 1024
			}
			break
		}
	}
	return c.memTotal
}

func (c *Collector) scan() ([]Info, error) {
	dir, err := os.Open("/proc")
	if err != nil {
		return nil, err
	}
	names, err := dir.Readdirnames(-1)
	dir.Close()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	elapsed := now.Sub(c.prevTime).Seconds()
	c.prevTime = now
	memTotal := c.memoryTotal()

	out := make([]Info, 0, len(names))
	current := make(map[int32]cpuSample, len(names))

	for _, name := range names {
		if name[0] < '0' || name[0] > '9' {
			continue
		}
		pid64, err := strconv.ParseInt(name, 10, 32)
		if err != nil {
			continue
		}
		pid := int32(pid64)
		info, ticks, ok := readStat(pid)
		if !ok {
			continue
		}
		if memTotal > 0 {
			info.MemPercent = float64(info.MemRSS) / float64(memTotal) * 100
		}
		if prev, ok := c.prev[pid]; ok && elapsed > 0 && ticks >= prev.ticks {
			info.CPU = float64(ticks-prev.ticks) / clockTicks / elapsed * 100
		}
		current[pid] = cpuSample{ticks: ticks}
		info.Cmdline = readCmdline(pid)
		info.User = readUser(pid)
		out = append(out, info)
	}
	c.prev = current
	return out, nil
}

// readStat parses /proc/<pid>/stat. The comm field can contain spaces and
// parentheses, so the fields after it are located from the last ')'.
func readStat(pid int32) (Info, uint64, bool) {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return Info{}, 0, false
	}
	close := bytes.LastIndexByte(b, ')')
	open := bytes.IndexByte(b, '(')
	if close < 0 || open < 0 || close < open {
		return Info{}, 0, false
	}
	info := Info{PID: pid, Name: string(b[open+1 : close])}
	fields := strings.Fields(string(b[close+2:]))
	if len(fields) < 22 {
		return Info{}, 0, false
	}
	info.State = stateName(fields[0])
	ppid, _ := strconv.ParseInt(fields[1], 10, 32)
	info.PPID = int32(ppid)
	utime, _ := strconv.ParseUint(fields[11], 10, 64)
	stime, _ := strconv.ParseUint(fields[12], 10, 64)
	threads, _ := strconv.Atoi(fields[17])
	info.Threads = threads
	start, _ := strconv.ParseFloat(fields[19], 64)
	info.StartTime = (bootTime + int64(start/clockTicks)) * 1000
	rss, _ := strconv.ParseUint(fields[21], 10, 64)
	info.MemRSS = rss * pageSize
	return info, utime + stime, true
}

func stateName(s string) string {
	switch s {
	case "R":
		return "running"
	case "S":
		return "sleeping"
	case "D":
		return "waiting"
	case "Z":
		return "zombie"
	case "T", "t":
		return "stopped"
	case "I":
		return "idle"
	}
	return s
}

func readCmdline(pid int32) string {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil || len(b) == 0 {
		return ""
	}
	return strings.TrimSpace(strings.ReplaceAll(string(bytes.TrimRight(b, "\x00")), "\x00", " "))
}

func readUser(pid int32) string {
	f, err := os.Open(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "Uid:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				if n, ok := userNames[fields[1]]; ok {
					return n
				}
				return fields[1]
			}
			return ""
		}
	}
	return ""
}

// Describe returns the expensive, per-process details only fetched when the
// user actually opens a process.
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
	}
	if !found {
		return nil, fmt.Errorf("process %d not found", pid)
	}
	for _, p := range list {
		if p.PPID == pid {
			d.Children = append(d.Children, p)
		}
	}
	base := fmt.Sprintf("/proc/%d", pid)
	d.Exe, _ = os.Readlink(base + "/exe")
	d.Cwd, _ = os.Readlink(base + "/cwd")
	if fds, err := os.ReadDir(base + "/fd"); err == nil {
		d.OpenFDs = len(fds)
	}
	if b, err := os.ReadFile(base + "/io"); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			f := strings.Fields(line)
			if len(f) != 2 {
				continue
			}
			v, _ := strconv.ParseUint(f[1], 10, 64)
			switch f[0] {
			case "read_bytes:":
				d.ReadBytes = v
			case "write_bytes:":
				d.WriteBytes = v
			}
		}
	}
	if b, err := os.ReadFile(base + "/environ"); err == nil {
		for _, kv := range strings.Split(string(bytes.TrimRight(b, "\x00")), "\x00") {
			if kv != "" {
				d.Env = append(d.Env, kv)
			}
		}
	}
	return &d, nil
}

// Kill sends a signal to a process. "term" asks politely, "kill" does not.
func Kill(pid int32, mode string) error {
	sig := syscall.SIGTERM
	switch mode {
	case "kill":
		sig = syscall.SIGKILL
	case "stop":
		sig = syscall.SIGSTOP
	case "cont":
		sig = syscall.SIGCONT
	case "int":
		sig = syscall.SIGINT
	}
	return syscall.Kill(int(pid), sig)
}

// PIDsFor returns the pids whose working directory or command line sits inside
// the given path — the basis of Project Mode.
func PIDsFor(root string) []int32 {
	root = filepath.Clean(root)
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	var out []int32
	for _, e := range entries {
		if !e.IsDir() || e.Name()[0] < '0' || e.Name()[0] > '9' {
			continue
		}
		pid64, err := strconv.ParseInt(e.Name(), 10, 32)
		if err != nil {
			continue
		}
		cwd, err := os.Readlink(fmt.Sprintf("/proc/%d/cwd", pid64))
		if err == nil && (cwd == root || strings.HasPrefix(cwd, root+string(os.PathSeparator))) {
			out = append(out, int32(pid64))
			continue
		}
		if cmd := readCmdline(int32(pid64)); cmd != "" && strings.Contains(cmd, root) {
			out = append(out, int32(pid64))
		}
	}
	return out
}
