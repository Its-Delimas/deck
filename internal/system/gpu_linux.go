//go:build linux

package system

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	gpuMu     sync.Mutex
	gpuCache  []GPUStat
	gpuAt     time.Time
	nvidiaBin string
	probed    bool
)

// gpus reports GPU utilisation. NVIDIA is queried through nvidia-smi; AMD and
// Intel are read from the amdgpu/i915 sysfs nodes. Results are cached briefly
// because shelling out to nvidia-smi is far too slow for the metrics tick.
func gpus() []GPUStat {
	gpuMu.Lock()
	defer gpuMu.Unlock()
	if time.Since(gpuAt) < 2*time.Second {
		return gpuCache
	}
	gpuAt = time.Now()
	if !probed {
		probed = true
		nvidiaBin, _ = exec.LookPath("nvidia-smi")
	}
	var out []GPUStat
	if nvidiaBin != "" {
		out = append(out, nvidiaStats()...)
	}
	out = append(out, sysfsGPUs()...)
	gpuCache = out
	return out
}

func nvidiaStats() []GPUStat {
	cmd := exec.Command(nvidiaBin, "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
		"--format=csv,noheader,nounits")
	buf, err := cmd.Output()
	if err != nil {
		return nil
	}
	var out []GPUStat
	for _, line := range strings.Split(strings.TrimSpace(string(buf)), "\n") {
		f := strings.Split(line, ",")
		if len(f) < 6 {
			continue
		}
		for i := range f {
			f[i] = strings.TrimSpace(f[i])
		}
		out = append(out, GPUStat{
			Vendor: "NVIDIA", Name: f[0],
			Usage:   parseF(f[1]),
			MemUsed: uint64(parseF(f[2])) * 1024 * 1024,
			MemTot:  uint64(parseF(f[3])) * 1024 * 1024,
			Temp:    parseF(f[4]), Power: parseF(f[5]),
		})
	}
	return out
}

func sysfsGPUs() []GPUStat {
	cards, _ := filepath.Glob("/sys/class/drm/card[0-9]/device")
	var out []GPUStat
	for _, dir := range cards {
		busy := readFile(filepath.Join(dir, "gpu_busy_percent"))
		if busy == "" {
			continue
		}
		g := GPUStat{Vendor: "AMD", Name: gpuName(dir), Usage: parseF(busy)}
		if v := readFile(filepath.Join(dir, "mem_info_vram_used")); v != "" {
			g.MemUsed = uint64(parseF(v))
		}
		if v := readFile(filepath.Join(dir, "mem_info_vram_total")); v != "" {
			g.MemTot = uint64(parseF(v))
		}
		if t, _ := filepath.Glob(filepath.Join(dir, "hwmon/hwmon*/temp1_input")); len(t) > 0 {
			g.Temp = parseF(readFile(t[0])) / 1000
		}
		out = append(out, g)
	}
	return out
}

func gpuName(dir string) string {
	if n := readFile(filepath.Join(dir, "product_name")); n != "" {
		return n
	}
	return "Integrated GPU"
}

func readFile(p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func parseF(s string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return f
}
