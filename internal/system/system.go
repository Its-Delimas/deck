// Package system collects host-level metrics: CPU, memory, disks, network,
// sensors and GPUs. Rates (network throughput, disk I/O) are derived from the
// delta between successive collections, so a single long-lived Collector must
// be used for the lifetime of the app.
package system

import (
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type CPUStat struct {
	Usage    float64   `json:"usage"`
	PerCore  []float64 `json:"perCore"`
	Load1    float64   `json:"load1"`
	Load5    float64   `json:"load5"`
	Load15   float64   `json:"load15"`
	Cores    int       `json:"cores"`
	Threads  int       `json:"threads"`
	Freq     float64   `json:"freq"`
	Procs    int       `json:"procs"`
	Threads_ int       `json:"threadCount"`
}

type MemStat struct {
	Total     uint64  `json:"total"`
	Used      uint64  `json:"used"`
	Free      uint64  `json:"free"`
	Available uint64  `json:"available"`
	Cached    uint64  `json:"cached"`
	Percent   float64 `json:"percent"`
}

type DiskStat struct {
	Device     string  `json:"device"`
	Mount      string  `json:"mount"`
	Fstype     string  `json:"fstype"`
	Total      uint64  `json:"total"`
	Used       uint64  `json:"used"`
	Free       uint64  `json:"free"`
	Percent    float64 `json:"percent"`
	ReadRate   float64 `json:"readRate"`
	WriteRate  float64 `json:"writeRate"`
	IsInternal bool    `json:"isInternal"`
}

type NetStat struct {
	RxRate    float64          `json:"rxRate"`
	TxRate    float64          `json:"txRate"`
	RxTotal   uint64           `json:"rxTotal"`
	TxTotal   uint64           `json:"txTotal"`
	Interfaces []InterfaceStat `json:"interfaces"`
}

type InterfaceStat struct {
	Name    string  `json:"name"`
	RxRate  float64 `json:"rxRate"`
	TxRate  float64 `json:"txRate"`
	RxTotal uint64  `json:"rxTotal"`
	TxTotal uint64  `json:"txTotal"`
	Up      bool    `json:"up"`
	Addr    string  `json:"addr"`
}

type TempStat struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	High  float64 `json:"high"`
}

type GPUStat struct {
	Name    string  `json:"name"`
	Usage   float64 `json:"usage"`
	MemUsed uint64  `json:"memUsed"`
	MemTot  uint64  `json:"memTotal"`
	Temp    float64 `json:"temp"`
	Power   float64 `json:"power"`
	Vendor  string  `json:"vendor"`
}

type IOStat struct {
	ReadRate  float64 `json:"readRate"`
	WriteRate float64 `json:"writeRate"`
}

type Snapshot struct {
	Time    int64      `json:"time"`
	CPU     CPUStat    `json:"cpu"`
	Memory  MemStat    `json:"memory"`
	Swap    MemStat    `json:"swap"`
	Disks   []DiskStat `json:"disks"`
	DiskIO  IOStat     `json:"diskIO"`
	Network NetStat    `json:"network"`
	Temps   []TempStat `json:"temps"`
	GPUs    []GPUStat  `json:"gpus"`
	Uptime  uint64     `json:"uptime"`
}

type HostInfo struct {
	Hostname string `json:"hostname"`
	Platform string `json:"platform"`
	Version  string `json:"version"`
	Kernel   string `json:"kernel"`
	Arch     string `json:"arch"`
	CPUModel string `json:"cpuModel"`
	Cores    int    `json:"cores"`
	Threads  int    `json:"threads"`
	MemTotal uint64 `json:"memTotal"`
	BootTime int64  `json:"bootTime"`
	User     string `json:"user"`
	Shell    string `json:"shell"`
	Home     string `json:"home"`
	GoVer    string `json:"goVersion"`
}

type Collector struct {
	mu       sync.Mutex
	lastNet  map[string]net.IOCountersStat
	lastIO   map[string]disk.IOCountersStat
	lastTime time.Time

	// Static values are resolved once; they never change while we run.
	coresOnce sync.Once
	physical  int
	logical   int
	cpuModel  string
	cpuFreq   float64

	// Partition discovery is comparatively expensive, so it is refreshed on a
	// slower cadence than the rest of the snapshot.
	partMu     sync.Mutex
	parts      []disk.PartitionStat
	partsAt    time.Time
}

func NewCollector() *Collector {
	c := &Collector{lastNet: map[string]net.IOCountersStat{}, lastIO: map[string]disk.IOCountersStat{}}
	c.warm()
	return c
}

func (c *Collector) warm() {
	_, _ = cpu.Percent(0, false)
	_, _ = cpu.Percent(0, true)
	_ = c.Collect()
}

func (c *Collector) static() {
	c.coresOnce.Do(func() {
		if n, err := cpu.Counts(false); err == nil {
			c.physical = n
		}
		if n, err := cpu.Counts(true); err == nil {
			c.logical = n
		}
		if info, err := cpu.Info(); err == nil && len(info) > 0 {
			c.cpuModel = info[0].ModelName
			c.cpuFreq = info[0].Mhz
		}
	})
}

func (c *Collector) partitions() []disk.PartitionStat {
	c.partMu.Lock()
	defer c.partMu.Unlock()
	if time.Since(c.partsAt) < 30*time.Second && c.parts != nil {
		return c.parts
	}
	if p, err := disk.Partitions(false); err == nil {
		c.parts = p
		c.partsAt = time.Now()
	}
	return c.parts
}

// Collect returns a fresh snapshot. It is safe for concurrent use but is
// intended to be driven by a single ticker.
func (c *Collector) Collect() *Snapshot {
	c.static()
	now := time.Now()

	c.mu.Lock()
	elapsed := now.Sub(c.lastTime).Seconds()
	if c.lastTime.IsZero() || elapsed <= 0 {
		elapsed = 0
	}
	c.lastTime = now
	c.mu.Unlock()

	s := &Snapshot{Time: now.UnixMilli()}

	if pct, err := cpu.Percent(0, false); err == nil && len(pct) > 0 {
		s.CPU.Usage = pct[0]
	}
	if per, err := cpu.Percent(0, true); err == nil {
		s.CPU.PerCore = per
	}
	if l, err := load.Avg(); err == nil {
		s.CPU.Load1, s.CPU.Load5, s.CPU.Load15 = l.Load1, l.Load5, l.Load15
	}
	s.CPU.Cores, s.CPU.Threads, s.CPU.Freq = c.physical, c.logical, c.cpuFreq
	if pids, err := process.Pids(); err == nil {
		s.CPU.Procs = len(pids)
	}

	if v, err := mem.VirtualMemory(); err == nil {
		s.Memory = MemStat{Total: v.Total, Used: v.Used, Free: v.Free, Available: v.Available, Cached: v.Cached, Percent: v.UsedPercent}
	}
	if v, err := mem.SwapMemory(); err == nil {
		s.Swap = MemStat{Total: v.Total, Used: v.Used, Free: v.Free, Percent: v.UsedPercent}
	}

	// Disks + per-device I/O rates.
	ioNow, _ := disk.IOCounters()
	var totalRead, totalWrite float64
	rates := map[string][2]float64{}
	c.mu.Lock()
	for name, cur := range ioNow {
		if prev, ok := c.lastIO[name]; ok && elapsed > 0 {
			r := float64(cur.ReadBytes-prev.ReadBytes) / elapsed
			w := float64(cur.WriteBytes-prev.WriteBytes) / elapsed
			if r < 0 {
				r = 0
			}
			if w < 0 {
				w = 0
			}
			rates[name] = [2]float64{r, w}
			totalRead += r
			totalWrite += w
		}
		c.lastIO[name] = cur
	}
	c.mu.Unlock()
	s.DiskIO = IOStat{ReadRate: totalRead, WriteRate: totalWrite}

	seen := map[string]bool{}
	for _, p := range c.partitions() {
		if seen[p.Device] || !isRealFS(p.Fstype) {
			continue
		}
		u, err := disk.Usage(p.Mountpoint)
		if err != nil || u.Total == 0 {
			continue
		}
		seen[p.Device] = true
		d := DiskStat{Device: p.Device, Mount: p.Mountpoint, Fstype: p.Fstype,
			Total: u.Total, Used: u.Used, Free: u.Free, Percent: u.UsedPercent,
			IsInternal: isInternal(p.Device)}
		if r, ok := rates[baseDevice(p.Device)]; ok {
			d.ReadRate, d.WriteRate = r[0], r[1]
		}
		s.Disks = append(s.Disks, d)
	}

	// Network throughput per interface.
	if counters, err := net.IOCounters(true); err == nil {
		c.mu.Lock()
		for _, cur := range counters {
			if skipIface(cur.Name) {
				continue
			}
			is := InterfaceStat{Name: cur.Name, RxTotal: cur.BytesRecv, TxTotal: cur.BytesSent}
			if prev, ok := c.lastNet[cur.Name]; ok && elapsed > 0 {
				is.RxRate = maxf(0, float64(cur.BytesRecv-prev.BytesRecv)/elapsed)
				is.TxRate = maxf(0, float64(cur.BytesSent-prev.BytesSent)/elapsed)
			}
			c.lastNet[cur.Name] = cur
			if addr, up := ifaceState(cur.Name); addr != "" || up {
				is.Addr, is.Up = addr, up
			}
			s.Network.RxRate += is.RxRate
			s.Network.TxRate += is.TxRate
			s.Network.RxTotal += is.RxTotal
			s.Network.TxTotal += is.TxTotal
			s.Network.Interfaces = append(s.Network.Interfaces, is)
		}
		c.mu.Unlock()
	}

	if temps, err := sensors(); err == nil {
		s.Temps = temps
	}
	s.GPUs = gpus()
	if up, err := host.Uptime(); err == nil {
		s.Uptime = up
	}
	return s
}

func (c *Collector) Host() HostInfo {
	c.static()
	h := HostInfo{Cores: c.physical, Threads: c.logical, CPUModel: c.cpuModel, GoVer: goVersion()}
	if info, err := host.Info(); err == nil {
		h.Hostname, h.Platform, h.Version, h.Kernel, h.Arch = info.Hostname, info.Platform, info.PlatformVersion, info.KernelVersion, info.KernelArch
		h.BootTime = int64(info.BootTime)
	}
	if v, err := mem.VirtualMemory(); err == nil {
		h.MemTotal = v.Total
	}
	h.User, h.Shell, h.Home = userInfo()
	return h
}

func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
