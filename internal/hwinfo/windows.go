//go:build windows

package hwinfo

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Windows exposes its inventory through CIM/WMI rather than a filesystem, so
// everything here comes from one PowerShell query. As on Linux, a value the
// firmware does not publish is reported as unavailable rather than guessed.

const query = `$ErrorActionPreference='SilentlyContinue'
function G($c,$n){ if($n){ Get-CimInstance -Namespace $n -ClassName $c } else { Get-CimInstance -ClassName $c } }
$o=[ordered]@{
 cs      = G Win32_ComputerSystem | Select-Object Manufacturer,Model,SystemFamily,TotalPhysicalMemory,PCSystemType
 bios    = G Win32_BIOS | Select-Object Manufacturer,SMBIOSBIOSVersion,ReleaseDate,SerialNumber
 board   = G Win32_BaseBoard | Select-Object Manufacturer,Product,SerialNumber
 cpu     = G Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,L2CacheSize,L3CacheSize,VirtualizationFirmwareEnabled
 mem     = G Win32_PhysicalMemory | Select-Object Capacity,Speed,Manufacturer,PartNumber,SMBIOSMemoryType
 gpu     = G Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate
 disk    = G Win32_DiskDrive | Select-Object Model,Size,InterfaceType,SerialNumber,MediaType
 net     = G Win32_NetworkAdapter | Where-Object { $_.PhysicalAdapter -eq $true } | Select-Object Name,MACAddress,NetEnabled,Speed
 os      = G Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture
 tpm     = G Win32_Tpm 'root/cimv2/security/microsofttpm' | Select-Object SpecVersion,IsEnabled_InitialValue
 batt    = G Win32_Battery | Select-Object Name,EstimatedChargeRemaining,BatteryStatus,Chemistry,DesignVoltage
 bfull   = G BatteryFullChargedCapacity 'root/wmi' | Select-Object FullChargedCapacity
 bstatic = G BatteryStaticData 'root/wmi' | Select-Object DesignedCapacity,ManufactureName,DeviceName,SerialNumber,CycleCount
 bstatus = G BatteryStatus 'root/wmi' | Select-Object RemainingCapacity,Voltage,ChargeRate,DischargeRate,Charging,PowerOnline
 secure  = Confirm-SecureBootUEFI
}
$o | ConvertTo-Json -Depth 4 -Compress`

// many accepts either a single CIM object or an array of them, which is how
// PowerShell serialises a result set of one versus several.
type many[T any] []T

func (m *many[T]) UnmarshalJSON(b []byte) error {
	trimmed := strings.TrimSpace(string(b))
	if trimmed == "null" || trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") {
		var list []T
		if err := json.Unmarshal(b, &list); err != nil {
			return err
		}
		*m = list
		return nil
	}
	var one T
	if err := json.Unmarshal(b, &one); err != nil {
		return err
	}
	*m = []T{one}
	return nil
}

func (m many[T]) first() (T, bool) {
	var zero T
	if len(m) == 0 {
		return zero, false
	}
	return m[0], true
}

type wmi struct {
	CS many[struct {
		Manufacturer, Model, SystemFamily string
		TotalPhysicalMemory               float64
		PCSystemType                      int
	}] `json:"cs"`
	BIOS many[struct {
		Manufacturer, SMBIOSBIOSVersion, ReleaseDate, SerialNumber string
	}] `json:"bios"`
	Board many[struct{ Manufacturer, Product, SerialNumber string }] `json:"board"`
	CPU   many[struct {
		Name                                                string
		NumberOfCores, NumberOfLogicalProcessors            int
		MaxClockSpeed, L2CacheSize, L3CacheSize             int
		VirtualizationFirmwareEnabled                       bool
	}] `json:"cpu"`
	Mem many[struct {
		Capacity                          float64
		Speed, SMBIOSMemoryType           int
		Manufacturer, PartNumber          string
	}] `json:"mem"`
	GPU many[struct {
		Name, DriverVersion                                      string
		AdapterRAM                                               float64
		CurrentHorizontalResolution, CurrentVerticalResolution    int
		CurrentRefreshRate                                        int
	}] `json:"gpu"`
	Disk many[struct {
		Model, InterfaceType, SerialNumber, MediaType string
		Size                                          float64
	}] `json:"disk"`
	Net many[struct {
		Name, MACAddress string
		NetEnabled       bool
		Speed            float64
	}] `json:"net"`
	OS  many[struct{ Caption, Version, BuildNumber, OSArchitecture string }] `json:"os"`
	TPM many[struct {
		SpecVersion              string
		IsEnabled_InitialValue   bool
	}] `json:"tpm"`
	Batt many[struct {
		Name                                          string
		EstimatedChargeRemaining, BatteryStatus, Chemistry int
		DesignVoltage                                 float64
	}] `json:"batt"`
	BFull   many[struct{ FullChargedCapacity float64 }] `json:"bfull"`
	BStatic many[struct {
		DesignedCapacity                      float64
		ManufactureName, DeviceName, SerialNumber string
		CycleCount                            int
	}] `json:"bstatic"`
	BStatus many[struct {
		RemainingCapacity, Voltage, ChargeRate, DischargeRate float64
		Charging, PowerOnline                                 bool
	}] `json:"bstatus"`
	Secure *bool `json:"secure"`
}

var (
	cacheMu sync.Mutex
	cached  *wmi
	cachedAt time.Time
	cacheErr error
)

// read runs the CIM query, caching briefly: the PowerShell round trip is slow
// and both the inventory and the battery panel want the same data.
func read() (*wmi, error) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if cached != nil && time.Since(cachedAt) < 5*time.Second {
		return cached, cacheErr
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", query)
	out, err := cmd.Output()
	if err != nil {
		cacheErr = fmt.Errorf("could not query WMI: %w", err)
		cachedAt = time.Now()
		return nil, cacheErr
	}
	var parsed wmi
	if err := json.Unmarshal(out, &parsed); err != nil {
		cacheErr = fmt.Errorf("could not parse the WMI response: %w", err)
		cachedAt = time.Now()
		return nil, cacheErr
	}
	cached, cachedAt, cacheErr = &parsed, time.Now(), nil
	return cached, nil
}

var formFactor = map[int]string{
	1: "Desktop", 2: "Mobile", 3: "Workstation", 4: "Enterprise server",
	5: "Small office server", 6: "Appliance", 7: "Performance server", 8: "Maximum",
}

func collect(r *Report) {
	data, err := read()
	if err != nil {
		r.Sections = []Section{{ID: "system", Title: "System", Fields: []Field{
			unavailable("Inventory", "powershell Get-CimInstance", err.Error()),
		}}}
		r.Battery = &Battery{Note: "the battery could not be read: " + err.Error()}
		return
	}

	if cs, ok := data.CS.first(); ok {
		r.Vendor, r.Model, r.Form = cs.Manufacturer, cs.Model, formFactor[cs.PCSystemType]
	}

	r.Sections = []Section{
		winSystem(data), winCPU(data), winMemory(data), winGPU(data),
		winDisks(data), winNetwork(data), winOS(data), winFirmware(data),
	}
	r.Battery = ReadBattery()
}

func winSystem(d *wmi) Section {
	s := Section{ID: "system", Title: "System"}
	if cs, ok := d.CS.first(); ok {
		s.Fields = append(s.Fields,
			field("Manufacturer", cs.Manufacturer, "Win32_ComputerSystem"),
			field("Model", cs.Model, "Win32_ComputerSystem"),
		)
		if cs.SystemFamily != "" {
			s.Fields = append(s.Fields, field("Family", cs.SystemFamily, "Win32_ComputerSystem"))
		}
		if form := formFactor[cs.PCSystemType]; form != "" {
			s.Fields = append(s.Fields, field("Form factor", form, "Win32_ComputerSystem.PCSystemType"))
		}
	}
	if b, ok := d.Board.first(); ok {
		s.Fields = append(s.Fields,
			field("Board", strings.TrimSpace(b.Manufacturer+" "+b.Product), "Win32_BaseBoard"),
			serialField("Board serial", b.SerialNumber, "Win32_BaseBoard"),
		)
	}
	if b, ok := d.BIOS.first(); ok {
		s.Fields = append(s.Fields,
			field("BIOS vendor", b.Manufacturer, "Win32_BIOS"),
			field("BIOS version", b.SMBIOSBIOSVersion, "Win32_BIOS"),
			field("BIOS date", cimDate(b.ReleaseDate), "Win32_BIOS"),
			serialField("Serial number", b.SerialNumber, "Win32_BIOS"),
		)
	}
	return s
}

func serialField(label, value, source string) Field {
	if value == "" || strings.EqualFold(value, "To be filled by O.E.M.") {
		return unavailable(label, source, "not published by this firmware")
	}
	f := field(label, value, source)
	f.Mono = true
	return f
}

// cimDate turns a CIM datetime (20240317000000.000000+000) into a plain date.
func cimDate(v string) string {
	if len(v) < 8 {
		return v
	}
	return fmt.Sprintf("%s-%s-%s", v[0:4], v[4:6], v[6:8])
}

func winCPU(d *wmi) Section {
	s := Section{ID: "cpu", Title: "Processor"}
	cpu, ok := d.CPU.first()
	if !ok {
		s.Fields = append(s.Fields, unavailable("Model", "Win32_Processor", "no processor reported"))
		return s
	}
	s.Fields = append(s.Fields,
		field("Model", strings.TrimSpace(cpu.Name), "Win32_Processor"),
		field("Cores", fmt.Sprintf("%d physical · %d logical", cpu.NumberOfCores, cpu.NumberOfLogicalProcessors), "Win32_Processor"),
		field("Frequency", fmt.Sprintf("%.2f GHz rated", float64(cpu.MaxClockSpeed)/1000), "Win32_Processor.MaxClockSpeed"),
	)
	if cpu.L2CacheSize > 0 || cpu.L3CacheSize > 0 {
		s.Fields = append(s.Fields, field("Cache",
			fmt.Sprintf("L2 %d KB · L3 %d KB", cpu.L2CacheSize, cpu.L3CacheSize), "Win32_Processor"))
	}
	virt := "not enabled in firmware"
	if cpu.VirtualizationFirmwareEnabled {
		virt = "enabled"
	}
	s.Fields = append(s.Fields, field("Virtualisation", virt, "Win32_Processor.VirtualizationFirmwareEnabled"))
	return s
}

var memoryTypes = map[int]string{
	20: "DDR", 21: "DDR2", 24: "DDR3", 26: "DDR4", 34: "DDR5", 35: "DDR5",
}

func winMemory(d *wmi) Section {
	s := Section{ID: "memory", Title: "Memory"}
	if cs, ok := d.CS.first(); ok && cs.TotalPhysicalMemory > 0 {
		s.Fields = append(s.Fields, field("Installed",
			fmt.Sprintf("%.1f GB", cs.TotalPhysicalMemory/1e9), "Win32_ComputerSystem"))
	}
	for i, m := range d.Mem {
		kind := memoryTypes[m.SMBIOSMemoryType]
		s.Fields = append(s.Fields, Field{
			Label:  fmt.Sprintf("Slot %d", i+1),
			Value:  strings.TrimSpace(fmt.Sprintf("%.0f GB %s %d MT/s", m.Capacity/1e9, kind, m.Speed)),
			Detail: strings.TrimSpace(m.Manufacturer + " " + m.PartNumber),
			Source: "Win32_PhysicalMemory",
		})
	}
	if len(d.Mem) == 0 {
		s.Fields = append(s.Fields, unavailable("Modules", "Win32_PhysicalMemory", "no module detail reported"))
	}
	return s
}

func winGPU(d *wmi) Section {
	s := Section{ID: "gpu", Title: "Graphics"}
	for _, g := range d.GPU {
		detail := "driver " + g.DriverVersion
		if g.AdapterRAM > 0 {
			detail = fmt.Sprintf("%.1f GB · %s", g.AdapterRAM/1e9, detail)
		}
		s.Fields = append(s.Fields, Field{Label: "Adapter", Value: g.Name, Detail: detail, Source: "Win32_VideoController"})
		if g.CurrentHorizontalResolution > 0 {
			s.Fields = append(s.Fields, Field{
				Label: "Mode",
				Value: fmt.Sprintf("%d × %d at %d Hz", g.CurrentHorizontalResolution, g.CurrentVerticalResolution, g.CurrentRefreshRate),
				Source: "Win32_VideoController", Mono: true,
			})
		}
	}
	if len(d.GPU) == 0 {
		s.Fields = append(s.Fields, unavailable("Adapter", "Win32_VideoController", "no display adapter reported"))
	}
	return s
}

func winDisks(d *wmi) Section {
	s := Section{ID: "storage", Title: "Storage"}
	for _, disk := range d.Disk {
		detail := disk.InterfaceType
		if disk.MediaType != "" {
			detail += " · " + disk.MediaType
		}
		if disk.SerialNumber != "" {
			detail += " · S/N " + strings.TrimSpace(disk.SerialNumber)
		}
		s.Fields = append(s.Fields, Field{
			Label: strings.TrimSpace(disk.Model),
			Value: fmt.Sprintf("%.0f GB", disk.Size/1e9),
			Detail: detail, Source: "Win32_DiskDrive", Mono: true,
		})
	}
	if len(d.Disk) == 0 {
		s.Fields = append(s.Fields, unavailable("Devices", "Win32_DiskDrive", "no drives reported"))
	}
	return s
}

func winNetwork(d *wmi) Section {
	s := Section{ID: "network", Title: "Network"}
	for _, n := range d.Net {
		if n.MACAddress == "" {
			continue
		}
		state := "down"
		if n.NetEnabled {
			state = "up"
		}
		detail := state
		if n.Speed > 0 {
			detail += fmt.Sprintf(" · %.0f Mb/s", n.Speed/1e6)
		}
		s.Fields = append(s.Fields, Field{
			Label: n.Name, Value: n.MACAddress, Detail: detail,
			Source: "Win32_NetworkAdapter", Mono: true,
		})
	}
	if len(s.Fields) == 0 {
		s.Fields = append(s.Fields, unavailable("Interfaces", "Win32_NetworkAdapter", "no physical adapters reported"))
	}
	return s
}

func winOS(d *wmi) Section {
	s := Section{ID: "os", Title: "Operating system"}
	if o, ok := d.OS.first(); ok {
		s.Fields = append(s.Fields,
			field("Edition", o.Caption, "Win32_OperatingSystem"),
			field("Version", fmt.Sprintf("%s build %s", o.Version, o.BuildNumber), "Win32_OperatingSystem"),
			field("Architecture", o.OSArchitecture, "Win32_OperatingSystem"),
		)
	}
	return s
}

func winFirmware(d *wmi) Section {
	s := Section{ID: "firmware", Title: "Firmware and security"}
	switch {
	case d.Secure == nil:
		s.Fields = append(s.Fields, unavailable("Secure Boot", "Confirm-SecureBootUEFI",
			"not reported — the machine may be booting in legacy BIOS mode"))
	case *d.Secure:
		s.Fields = append(s.Fields, field("Secure Boot", "enabled", "Confirm-SecureBootUEFI"))
	default:
		s.Fields = append(s.Fields, field("Secure Boot", "disabled", "Confirm-SecureBootUEFI"))
	}
	if t, ok := d.TPM.first(); ok {
		state := "present"
		if t.IsEnabled_InitialValue {
			state = "enabled"
		}
		version := strings.Split(t.SpecVersion, ",")[0]
		s.Fields = append(s.Fields, Field{Label: "TPM", Value: state, Detail: "version " + version, Source: "Win32_Tpm"})
	} else {
		s.Fields = append(s.Fields, unavailable("TPM", "Win32_Tpm", "no TPM reported"))
	}
	return s
}

var chemistry = map[int]string{
	1: "Other", 2: "Unknown", 3: "Lead acid", 4: "Nickel cadmium",
	5: "Nickel metal hydride", 6: "Li-ion", 7: "Zinc air", 8: "Li-polymer",
}

// ReadBattery derives health from the two capacity counters Windows publishes
// under root\wmi. Where they are absent, health is reported as unknown.
func ReadBattery() *Battery {
	data, err := read()
	if err != nil {
		return &Battery{Note: "the battery could not be read: " + err.Error()}
	}
	info, ok := data.Batt.first()
	if !ok {
		return &Battery{Note: "no battery detected — this machine reports no battery device"}
	}
	b := &Battery{
		Present: true, Name: info.Name, Percent: float64(info.EstimatedChargeRemaining),
		Technology: chemistry[info.Chemistry], Source: "Win32_Battery, root\\wmi BatteryStatus",
		Status: batteryStatus(info.BatteryStatus),
	}
	if st, ok := data.BStatic.first(); ok {
		b.Manufacturer, b.Model, b.Serial = st.ManufactureName, st.DeviceName, st.SerialNumber
		if st.DesignedCapacity > 0 {
			b.DesignWh = st.DesignedCapacity / 1000 // mWh
		}
		if st.CycleCount > 0 {
			b.Cycles, b.CyclesKnown = st.CycleCount, true
		}
	}
	if full, ok := data.BFull.first(); ok && full.FullChargedCapacity > 0 {
		b.FullWh = full.FullChargedCapacity / 1000
	}
	if s, ok := data.BStatus.first(); ok {
		b.NowWh = s.RemainingCapacity / 1000
		b.VoltageV = s.Voltage / 1000
		b.OnAC = s.PowerOnline
		b.PowerW = (s.ChargeRate + s.DischargeRate) / 1000
	}
	if b.DesignWh > 0 && b.FullWh > 0 {
		b.Health = b.FullWh / b.DesignWh * 100
		b.HealthKnown = true
	} else {
		b.Note = "Windows did not publish this battery's design capacity, so wear cannot be calculated — powercfg /batteryreport shows the firmware's own figures"
	}
	return b
}

func batteryStatus(code int) string {
	switch code {
	case 1:
		return "Discharging"
	case 2:
		return "On AC"
	case 3:
		return "Fully charged"
	case 4:
		return "Low"
	case 5:
		return "Critical"
	case 6, 7, 8, 9:
		return "Charging"
	}
	return "Unknown"
}
