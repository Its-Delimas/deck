//go:build linux

package hwinfo

import (
	"bufio"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

const dmi = "/sys/class/dmi/id"

func read(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// readOrNote distinguishes "hardware did not report this" from "we are not
// allowed to read it", because the two mean very different things to someone
// checking a machine over.
func readOrNote(path string) (string, string) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsPermission(err) {
			return "", "requires root"
		}
		return "", "not reported by this hardware"
	}
	v := strings.TrimSpace(string(b))
	if v == "" || v == "None" || strings.HasPrefix(v, "To Be Filled") || v == "Default string" {
		return "", "not reported by this hardware"
	}
	return v, ""
}

func dmiField(label, file string) Field {
	v, note := readOrNote(filepath.Join(dmi, file))
	if v == "" {
		return unavailable(label, filepath.Join(dmi, file), note)
	}
	return field(label, v, filepath.Join(dmi, file))
}

func num(path string) (float64, bool) {
	v := read(path)
	if v == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(v, 64)
	return f, err == nil
}

var chassis = map[string]string{
	"1": "Other", "2": "Unknown", "3": "Desktop", "4": "Low profile desktop",
	"5": "Pizza box", "6": "Mini tower", "7": "Tower", "8": "Portable",
	"9": "Laptop", "10": "Notebook", "11": "Hand held", "12": "Docking station",
	"13": "All in one", "14": "Sub notebook", "15": "Space saving", "16": "Lunch box",
	"17": "Main server chassis", "18": "Expansion chassis", "21": "Peripheral chassis",
	"23": "Rack mount chassis", "24": "Sealed case PC", "30": "Tablet",
	"31": "Convertible", "32": "Detachable", "33": "IoT gateway",
}

func collect(r *Report) {
	r.Vendor = read(filepath.Join(dmi, "sys_vendor"))
	r.Model = read(filepath.Join(dmi, "product_name"))
	r.Form = chassis[read(filepath.Join(dmi, "chassis_type"))]

	r.Sections = []Section{
		systemSection(),
		cpuSection(),
		memorySection(),
		graphicsSection(),
		storageSection(),
		displaySection(),
		networkSection(),
		osSection(),
		firmwareSection(),
	}
	r.Battery = ReadBattery()
}

func systemSection() Section {
	s := Section{ID: "system", Title: "System"}
	s.Fields = append(s.Fields,
		dmiField("Manufacturer", "sys_vendor"),
		dmiField("Model", "product_name"),
		dmiField("Version", "product_version"),
		dmiField("Family", "product_family"),
	)
	if c := read(filepath.Join(dmi, "chassis_type")); c != "" {
		s.Fields = append(s.Fields, Field{
			Label: "Form factor", Value: chassis[c], Detail: "DMI chassis type " + c,
			Source: filepath.Join(dmi, "chassis_type"),
		})
	}
	s.Fields = append(s.Fields,
		dmiField("Board", "board_name"),
		dmiField("Board vendor", "board_vendor"),
		dmiField("Serial number", "product_serial"),
		dmiField("Board serial", "board_serial"),
		dmiField("BIOS vendor", "bios_vendor"),
		dmiField("BIOS version", "bios_version"),
		dmiField("BIOS date", "bios_date"),
		dmiField("EC firmware", "ec_firmware_release"),
	)
	for i := range s.Fields {
		switch s.Fields[i].Label {
		case "Serial number", "Board serial":
			s.Fields[i].Mono = true
		}
	}
	if v := virtualisation(); v != "" {
		s.Fields = append(s.Fields, Field{
			Label: "Virtualised", Value: v, Source: "systemd-detect-virt",
			Detail: "this is not bare metal",
		})
	}
	return s
}

func virtualisation() string {
	bin, err := exec.LookPath("systemd-detect-virt")
	if err != nil {
		return ""
	}
	out, _ := exec.Command(bin).Output()
	v := strings.TrimSpace(string(out))
	if v == "" || v == "none" {
		return ""
	}
	return v
}

func cpuSection() Section {
	s := Section{ID: "cpu", Title: "Processor"}
	model, flags, sockets := cpuinfo()
	if model != "" {
		s.Fields = append(s.Fields, field("Model", model, "/proc/cpuinfo"))
	}

	physical, logical := cpuCounts()
	s.Fields = append(s.Fields, Field{
		Label: "Cores", Value: fmt.Sprintf("%d physical · %d logical", physical, logical),
		Source: "/sys/devices/system/cpu",
	})
	if sockets > 1 {
		s.Fields = append(s.Fields, field("Sockets", strconv.Itoa(sockets), "/proc/cpuinfo"))
	}

	base := "/sys/devices/system/cpu/cpu0/cpufreq"
	if maxF, ok := num(filepath.Join(base, "cpuinfo_max_freq")); ok {
		minF, _ := num(filepath.Join(base, "cpuinfo_min_freq"))
		s.Fields = append(s.Fields, Field{
			Label: "Frequency", Value: fmt.Sprintf("%.2f GHz max", maxF/1e6),
			Detail: fmt.Sprintf("%.2f GHz minimum", minF/1e6),
			Source: filepath.Join(base, "cpuinfo_max_freq"),
		})
	}
	if gov := read(filepath.Join(base, "scaling_governor")); gov != "" {
		driver := read(filepath.Join(base, "scaling_driver"))
		s.Fields = append(s.Fields, Field{
			Label: "Governor", Value: gov, Detail: driver,
			Source: filepath.Join(base, "scaling_governor"),
		})
	}
	if caches := cpuCaches(); caches != "" {
		s.Fields = append(s.Fields, field("Cache", caches, "/sys/devices/system/cpu/cpu0/cache"))
	}

	virt := "not supported"
	if strings.Contains(flags, " vmx ") {
		virt = "Intel VT-x"
	} else if strings.Contains(flags, " svm ") {
		virt = "AMD-V"
	}
	s.Fields = append(s.Fields, Field{Label: "Virtualisation", Value: virt, Source: "/proc/cpuinfo flags"})

	if mit := mitigations(); mit != "" {
		s.Fields = append(s.Fields, Field{
			Label: "Vulnerabilities", Value: mit,
			Source: "/sys/devices/system/cpu/vulnerabilities",
		})
	}
	return s
}

func cpuinfo() (model, flags string, sockets int) {
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return
	}
	defer f.Close()
	ids := map[string]bool{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		switch key {
		case "model name":
			if model == "" {
				model = value
			}
		case "flags", "Features":
			if flags == "" {
				flags = " " + value + " "
			}
		case "physical id":
			ids[value] = true
		}
	}
	sockets = len(ids)
	if sockets == 0 {
		sockets = 1
	}
	return
}

func cpuCounts() (physical, logical int) {
	cpus, _ := filepath.Glob("/sys/devices/system/cpu/cpu[0-9]*")
	logical = len(cpus)
	cores := map[string]bool{}
	for _, c := range cpus {
		pkg := read(filepath.Join(c, "topology/physical_package_id"))
		core := read(filepath.Join(c, "topology/core_id"))
		if core != "" {
			cores[pkg+":"+core] = true
		}
	}
	physical = len(cores)
	if physical == 0 {
		physical = logical
	}
	return
}

func cpuCaches() string {
	dirs, _ := filepath.Glob("/sys/devices/system/cpu/cpu0/cache/index[0-9]")
	var parts []string
	for _, d := range dirs {
		level := read(filepath.Join(d, "level"))
		kind := read(filepath.Join(d, "type"))
		size := read(filepath.Join(d, "size"))
		if level == "" || size == "" {
			continue
		}
		label := "L" + level
		switch kind {
		case "Data":
			label += "d"
		case "Instruction":
			label += "i"
		}
		parts = append(parts, label+" "+size)
	}
	return strings.Join(parts, " · ")
}

// mitigations lists CPU vulnerabilities the kernel reports as not mitigated.
func mitigations() string {
	files, _ := filepath.Glob("/sys/devices/system/cpu/vulnerabilities/*")
	var open []string
	total := 0
	for _, f := range files {
		v := read(f)
		if v == "" {
			continue
		}
		total++
		if strings.HasPrefix(v, "Vulnerable") {
			open = append(open, filepath.Base(f))
		}
	}
	if total == 0 {
		return ""
	}
	if len(open) == 0 {
		return fmt.Sprintf("%d known, all mitigated", total)
	}
	sort.Strings(open)
	return fmt.Sprintf("%d of %d unmitigated: %s", len(open), total, strings.Join(open, ", "))
}

func memorySection() Section {
	s := Section{ID: "memory", Title: "Memory"}
	if total, ok := meminfo("MemTotal"); ok {
		s.Fields = append(s.Fields, Field{
			Label: "Usable", Value: humanKB(total), Source: "/proc/meminfo MemTotal",
			Detail: "what the kernel can address; firmware reserves a little of the installed total",
		})
	}
	if sw, ok := meminfo("SwapTotal"); ok && sw > 0 {
		s.Fields = append(s.Fields, field("Swap", humanKB(sw), "/proc/meminfo"))
	}
	// Module-level detail (speed, type, slots) lives in DMI table 17, which
	// only root may read. Say so plainly rather than guessing.
	if mods, err := dmiMemory(); err == nil && len(mods) > 0 {
		for i, m := range mods {
			s.Fields = append(s.Fields, Field{
				Label: fmt.Sprintf("Slot %d", i+1), Value: m, Source: "dmidecode -t 17",
			})
		}
	} else {
		s.Fields = append(s.Fields, unavailable("Modules", "dmidecode -t 17",
			"module type, speed and slot layout need root: sudo dmidecode -t 17"))
	}
	return s
}

func meminfo(key string) (float64, bool) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, false
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if strings.HasPrefix(sc.Text(), key+":") {
			fields := strings.Fields(sc.Text())
			if len(fields) > 1 {
				v, err := strconv.ParseFloat(fields[1], 64)
				return v, err == nil
			}
		}
	}
	return 0, false
}

func humanKB(kb float64) string {
	gb := kb / 1024 / 1024
	if gb >= 1 {
		return fmt.Sprintf("%.1f GB", gb)
	}
	return fmt.Sprintf("%.0f MB", kb/1024)
}

func dmiMemory() ([]string, error) {
	bin, err := exec.LookPath("dmidecode")
	if err != nil {
		return nil, err
	}
	out, err := exec.Command(bin, "-t", "17").Output()
	if err != nil {
		return nil, err
	}
	var mods []string
	var size, speed, kind, part string
	flush := func() {
		if size != "" && !strings.Contains(size, "No Module") {
			mods = append(mods, strings.TrimSpace(fmt.Sprintf("%s %s %s %s", size, kind, speed, part)))
		}
		size, speed, kind, part = "", "", "", ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "Memory Device"):
			flush()
		case strings.HasPrefix(line, "Size:"):
			size = strings.TrimSpace(strings.TrimPrefix(line, "Size:"))
		case strings.HasPrefix(line, "Configured Memory Speed:"), strings.HasPrefix(line, "Speed:"):
			if speed == "" {
				speed = strings.TrimSpace(line[strings.Index(line, ":")+1:])
			}
		case strings.HasPrefix(line, "Type:"):
			kind = strings.TrimSpace(strings.TrimPrefix(line, "Type:"))
		case strings.HasPrefix(line, "Part Number:"):
			part = strings.TrimSpace(strings.TrimPrefix(line, "Part Number:"))
		}
	}
	flush()
	return mods, nil
}

var pciVendors = map[string]string{
	"0x10de": "NVIDIA", "0x1002": "AMD", "0x8086": "Intel", "0x1af4": "Red Hat (virtio)",
	"0x15ad": "VMware", "0x1414": "Microsoft",
}

func graphicsSection() Section {
	s := Section{ID: "gpu", Title: "Graphics"}
	cards, _ := filepath.Glob("/sys/class/drm/card[0-9]/device")
	for _, dir := range cards {
		vendor := pciVendors[read(filepath.Join(dir, "vendor"))]
		if vendor == "" {
			vendor = read(filepath.Join(dir, "vendor"))
		}
		name := read(filepath.Join(dir, "product_name"))
		if name == "" {
			name = pciName(dir)
		}
		driver := ""
		for _, line := range strings.Split(read(filepath.Join(dir, "uevent")), "\n") {
			if strings.HasPrefix(line, "DRIVER=") {
				driver = strings.TrimPrefix(line, "DRIVER=")
			}
		}
		value := strings.TrimSpace(vendor + " " + name)
		if value == "" {
			value = filepath.Base(filepath.Dir(dir))
		}
		f := Field{Label: "Adapter", Value: value, Detail: driver, Source: dir}
		if vram, ok := num(filepath.Join(dir, "mem_info_vram_total")); ok {
			f.Detail = strings.TrimSpace(fmt.Sprintf("%s · %.1f GB VRAM", driver, vram/1e9))
		}
		s.Fields = append(s.Fields, f)
	}
	if nv := nvidiaInfo(); nv != "" {
		s.Fields = append(s.Fields, field("NVIDIA driver", nv, "nvidia-smi"))
	}
	if len(s.Fields) == 0 {
		s.Fields = append(s.Fields, unavailable("Adapter", "/sys/class/drm", "no DRM device exposed"))
	}
	return s
}

// pciName resolves a PCI id to a human name using the system id database.
func pciName(dir string) string {
	vendor := strings.TrimPrefix(read(filepath.Join(dir, "vendor")), "0x")
	device := strings.TrimPrefix(read(filepath.Join(dir, "device")), "0x")
	if vendor == "" || device == "" {
		return ""
	}
	f, err := os.Open("/usr/share/misc/pci.ids")
	if err != nil {
		if f, err = os.Open("/usr/share/hwdata/pci.ids"); err != nil {
			return device
		}
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	inVendor := false
	for sc.Scan() {
		line := sc.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if !strings.HasPrefix(line, "\t") {
			inVendor = strings.HasPrefix(line, vendor)
			continue
		}
		if inVendor && strings.HasPrefix(line, "\t"+device) {
			return strings.TrimSpace(line[len(device)+1:])
		}
	}
	return device
}

func nvidiaInfo() string {
	bin, err := exec.LookPath("nvidia-smi")
	if err != nil {
		return ""
	}
	out, err := exec.Command(bin, "--query-gpu=driver_version", "--format=csv,noheader").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func storageSection() Section {
	s := Section{ID: "storage", Title: "Storage"}
	devices, _ := filepath.Glob("/sys/block/*")
	sort.Strings(devices)
	for _, dev := range devices {
		name := filepath.Base(dev)
		if strings.HasPrefix(name, "loop") || strings.HasPrefix(name, "ram") ||
			strings.HasPrefix(name, "zram") || strings.HasPrefix(name, "dm-") {
			continue
		}
		sectors, ok := num(filepath.Join(dev, "size"))
		if !ok || sectors == 0 {
			continue
		}
		model := read(filepath.Join(dev, "device/model"))
		if model == "" {
			model = read(filepath.Join(dev, "device/name"))
		}
		rotational := read(filepath.Join(dev, "queue/rotational")) == "1"
		kind := "SSD"
		if rotational {
			kind = "HDD"
		}
		if strings.HasPrefix(name, "nvme") {
			kind = "NVMe SSD"
		}
		detail := kind
		if fw := read(filepath.Join(dev, "device/firmware_rev")); fw != "" {
			detail += " · firmware " + fw
		}
		if serial, note := readOrNote(filepath.Join(dev, "device/serial")); serial != "" {
			detail += " · S/N " + serial
		} else if note == "requires root" {
			detail += " · serial requires root"
		}
		s.Fields = append(s.Fields, Field{
			Label: "/dev/" + name,
			Value: fmt.Sprintf("%s — %.0f GB", strings.TrimSpace(model), sectors*512/1e9),
			Detail: detail, Source: filepath.Join(dev, "device/model"), Mono: true,
		})
	}
	if len(s.Fields) == 0 {
		s.Fields = append(s.Fields, unavailable("Devices", "/sys/block", "no block devices exposed"))
	}
	return s
}

func displaySection() Section {
	s := Section{ID: "display", Title: "Display"}
	connectors, _ := filepath.Glob("/sys/class/drm/card[0-9]-*")
	sort.Strings(connectors)
	for _, c := range connectors {
		if read(filepath.Join(c, "status")) != "connected" {
			continue
		}
		name := filepath.Base(c)
		if i := strings.Index(name, "-"); i >= 0 {
			name = name[i+1:]
		}
		modes := strings.Split(read(filepath.Join(c, "modes")), "\n")
		mode := ""
		if len(modes) > 0 {
			mode = modes[0] // the kernel lists the preferred mode first
		}
		detail := ""
		if w, h := edidSize(filepath.Join(c, "edid")); w > 0 {
			diagonal := math.Sqrt(float64(w*w + h*h)) / 2.54
			detail = fmt.Sprintf("%d × %d cm · %.1f\" diagonal", w, h, diagonal)
		}
		s.Fields = append(s.Fields, Field{
			Label: name, Value: mode, Detail: detail,
			Source: filepath.Join(c, "modes"), Mono: true,
		})
	}
	if len(s.Fields) == 0 {
		s.Fields = append(s.Fields, unavailable("Outputs", "/sys/class/drm", "no connected outputs reported"))
	}
	return s
}

// edidSize reads the physical panel size, in centimetres, from the EDID block.
func edidSize(path string) (int, int) {
	b, err := os.ReadFile(path)
	if err != nil || len(b) < 23 {
		return 0, 0
	}
	return int(b[21]), int(b[22])
}

func networkSection() Section {
	s := Section{ID: "network", Title: "Network"}
	ifaces, _ := filepath.Glob("/sys/class/net/*")
	sort.Strings(ifaces)
	for _, dir := range ifaces {
		name := filepath.Base(dir)
		if name == "lo" {
			continue
		}
		driver := ""
		for _, line := range strings.Split(read(filepath.Join(dir, "device/uevent")), "\n") {
			if strings.HasPrefix(line, "DRIVER=") {
				driver = strings.TrimPrefix(line, "DRIVER=")
			}
		}
		if driver == "" {
			continue // virtual interface (docker, veth, bridge)
		}
		kind := "Ethernet"
		if _, err := os.Stat(filepath.Join(dir, "wireless")); err == nil {
			kind = "Wi-Fi"
		}
		mac := read(filepath.Join(dir, "address"))
		state := read(filepath.Join(dir, "operstate"))
		detail := fmt.Sprintf("%s · %s · %s", kind, driver, state)
		if speed, ok := num(filepath.Join(dir, "speed")); ok && speed > 0 {
			detail += fmt.Sprintf(" · %.0f Mb/s", speed)
		}
		s.Fields = append(s.Fields, Field{
			Label: name, Value: mac, Detail: detail,
			Source: filepath.Join(dir, "address"), Mono: true,
		})
	}
	if len(s.Fields) == 0 {
		s.Fields = append(s.Fields, unavailable("Interfaces", "/sys/class/net", "no physical interfaces found"))
	}
	return s
}

func osSection() Section {
	s := Section{ID: "os", Title: "Operating system"}
	if pretty := osRelease("PRETTY_NAME"); pretty != "" {
		s.Fields = append(s.Fields, field("Distribution", pretty, "/etc/os-release"))
	}
	var uts syscall.Utsname
	if syscall.Uname(&uts) == nil {
		s.Fields = append(s.Fields,
			field("Kernel", charsToString(uts.Release[:]), "uname"),
			field("Architecture", charsToString(uts.Machine[:]), "uname"),
			field("Hostname", charsToString(uts.Nodename[:]), "uname"),
		)
	}
	if init := read("/proc/1/comm"); init != "" {
		s.Fields = append(s.Fields, field("Init", init, "/proc/1/comm"))
	}
	if de := os.Getenv("XDG_CURRENT_DESKTOP"); de != "" {
		session := os.Getenv("XDG_SESSION_TYPE")
		s.Fields = append(s.Fields, Field{Label: "Desktop", Value: de, Detail: session, Source: "XDG_CURRENT_DESKTOP"})
	}
	if shell := os.Getenv("SHELL"); shell != "" {
		s.Fields = append(s.Fields, field("Shell", shell, "$SHELL"))
	}
	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		fields := strings.Fields(string(b))
		if len(fields) > 0 {
			secs, _ := strconv.ParseFloat(fields[0], 64)
			s.Fields = append(s.Fields, field("Uptime", fmt.Sprintf("%.1f days", secs/86400), "/proc/uptime"))
		}
	}
	return s
}

func osRelease(key string) string {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), "=")
		if ok && k == key {
			return strings.Trim(v, `"`)
		}
	}
	return ""
}

func charsToString(ca []int8) string {
	b := make([]byte, 0, len(ca))
	for _, c := range ca {
		if c == 0 {
			break
		}
		b = append(b, byte(c))
	}
	return string(b)
}

func firmwareSection() Section {
	s := Section{ID: "firmware", Title: "Firmware and security"}
	mode := "Legacy BIOS"
	if _, err := os.Stat("/sys/firmware/efi"); err == nil {
		mode = "UEFI"
	}
	s.Fields = append(s.Fields, field("Boot mode", mode, "/sys/firmware/efi"))

	if v, ok := secureBoot(); ok {
		state := "disabled"
		if v {
			state = "enabled"
		}
		s.Fields = append(s.Fields, field("Secure Boot", state, "/sys/firmware/efi/efivars/SecureBoot-*"))
	} else {
		s.Fields = append(s.Fields, unavailable("Secure Boot", "/sys/firmware/efi/efivars", "variable not readable"))
	}

	if major := read("/sys/class/tpm/tpm0/tpm_version_major"); major != "" {
		s.Fields = append(s.Fields, field("TPM", "version "+major, "/sys/class/tpm/tpm0"))
	} else if _, err := os.Stat("/sys/class/tpm/tpm0"); err == nil {
		s.Fields = append(s.Fields, field("TPM", "present", "/sys/class/tpm/tpm0"))
	} else {
		s.Fields = append(s.Fields, unavailable("TPM", "/sys/class/tpm", "no TPM device exposed"))
	}

	if lockdown := read("/sys/kernel/security/lockdown"); lockdown != "" {
		// The file lists every mode with the active one in brackets.
		active := lockdown
		if i, j := strings.Index(lockdown, "["), strings.Index(lockdown, "]"); i >= 0 && j > i {
			active = lockdown[i+1 : j]
		}
		s.Fields = append(s.Fields, field("Kernel lockdown", active, "/sys/kernel/security/lockdown"))
	}
	return s
}

func secureBoot() (bool, bool) {
	matches, _ := filepath.Glob("/sys/firmware/efi/efivars/SecureBoot-*")
	for _, m := range matches {
		b, err := os.ReadFile(m)
		if err != nil || len(b) < 5 {
			continue
		}
		return b[4] == 1, true // first four bytes are EFI variable attributes
	}
	return false, false
}

// ReadBattery converts the raw power-supply counters into watt-hours. Laptops
// expose either charge (µAh) or energy (µWh); both are handled.
func ReadBattery() *Battery {
	dirs, _ := filepath.Glob("/sys/class/power_supply/BAT*")
	if len(dirs) == 0 {
		return &Battery{Note: "no battery detected — this machine reports no BAT device"}
	}
	dir := dirs[0]
	b := &Battery{
		Present: true, Name: filepath.Base(dir), Source: dir,
		Manufacturer: read(filepath.Join(dir, "manufacturer")),
		Model:        read(filepath.Join(dir, "model_name")),
		Serial:       read(filepath.Join(dir, "serial_number")),
		Technology:   read(filepath.Join(dir, "technology")),
		Status:       read(filepath.Join(dir, "status")),
	}
	if p, ok := num(filepath.Join(dir, "capacity")); ok {
		b.Percent = p
	}
	volts, _ := num(filepath.Join(dir, "voltage_now"))
	b.VoltageV = volts / 1e6
	designV, _ := num(filepath.Join(dir, "voltage_min_design"))
	if designV == 0 {
		designV = volts
	}

	if e, ok := num(filepath.Join(dir, "energy_full_design")); ok {
		b.DesignWh = e / 1e6
		if f, ok := num(filepath.Join(dir, "energy_full")); ok {
			b.FullWh = f / 1e6
		}
		if n, ok := num(filepath.Join(dir, "energy_now")); ok {
			b.NowWh = n / 1e6
		}
	} else if c, ok := num(filepath.Join(dir, "charge_full_design")); ok {
		// µAh × V = µWh
		b.DesignWh = c / 1e6 * (designV / 1e6)
		if f, ok := num(filepath.Join(dir, "charge_full")); ok {
			b.FullWh = f / 1e6 * (designV / 1e6)
		}
		if n, ok := num(filepath.Join(dir, "charge_now")); ok {
			b.NowWh = n / 1e6 * (b.VoltageV)
		}
	}
	if b.DesignWh > 0 && b.FullWh > 0 {
		b.Health = b.FullWh / b.DesignWh * 100
		b.HealthKnown = true
	} else {
		b.Note = "this battery does not report its design capacity, so wear cannot be calculated"
	}
	if c, ok := num(filepath.Join(dir, "cycle_count")); ok && c > 0 {
		b.Cycles = int(c)
		b.CyclesKnown = true
	}
	if p, ok := num(filepath.Join(dir, "power_now")); ok {
		b.PowerW = p / 1e6
	} else if cur, ok := num(filepath.Join(dir, "current_now")); ok {
		b.PowerW = cur / 1e6 * b.VoltageV
	}
	if online, ok := num("/sys/class/power_supply/AC/online"); ok {
		b.OnAC = online == 1
	} else {
		adapters, _ := filepath.Glob("/sys/class/power_supply/A*/online")
		for _, a := range adapters {
			if v, ok := num(a); ok && v == 1 {
				b.OnAC = true
			}
		}
	}
	return b
}
