package system

import (
	"net"
	"os"
	"os/user"
	"runtime"
	"strings"

	gsensors "github.com/shirou/gopsutil/v4/sensors"
)

var pseudoFS = map[string]bool{
	"tmpfs": true, "devtmpfs": true, "squashfs": true, "overlay": true, "proc": true,
	"sysfs": true, "cgroup": true, "cgroup2": true, "devpts": true, "ramfs": true,
	"autofs": true, "efivarfs": true, "fuse.gvfsd-fuse": true, "fuse.portal": true,
	"mqueue": true, "hugetlbfs": true, "debugfs": true, "tracefs": true, "pstore": true,
	"bpf": true, "configfs": true, "securityfs": true, "binfmt_misc": true, "nsfs": true,
}

func isRealFS(fs string) bool { return !pseudoFS[strings.ToLower(fs)] }

func isInternal(device string) bool {
	d := strings.ToLower(device)
	return !strings.Contains(d, "usb") && !strings.Contains(d, "mmcblk") || strings.Contains(d, "nvme")
}

// baseDevice maps a partition path (/dev/nvme0n1p2) onto the block device that
// the kernel reports I/O counters for (nvme0n1).
func baseDevice(device string) string {
	d := strings.TrimPrefix(device, "/dev/")
	if i := strings.Index(d, "p"); i > 0 && strings.HasPrefix(d, "nvme") {
		return d[:i]
	}
	return strings.TrimRight(d, "0123456789")
}

func skipIface(name string) bool {
	n := strings.ToLower(name)
	return n == "lo" || strings.HasPrefix(n, "veth") || strings.HasPrefix(n, "br-") ||
		strings.HasPrefix(n, "docker") && n != "docker0"
}

func ifaceState(name string) (addr string, up bool) {
	iface, err := net.InterfaceByName(name)
	if err != nil {
		return "", false
	}
	up = iface.Flags&net.FlagUp != 0
	addrs, err := iface.Addrs()
	if err != nil {
		return "", up
	}
	for _, a := range addrs {
		if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil {
			return ipn.IP.String(), up
		}
	}
	return "", up
}

func sensors() ([]TempStat, error) {
	raw, err := gsensors.SensorsTemperatures()
	if err != nil && len(raw) == 0 {
		return nil, err
	}
	out := make([]TempStat, 0, len(raw))
	for _, t := range raw {
		if t.Temperature <= 0 || t.Temperature > 150 {
			continue
		}
		out = append(out, TempStat{Label: t.SensorKey, Value: t.Temperature, High: t.High})
	}
	return out, nil
}

func goVersion() string { return runtime.Version() }

func userInfo() (name, shell, home string) {
	if u, err := user.Current(); err == nil {
		name, home = u.Username, u.HomeDir
	}
	shell = os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	return
}
