// Package hwinfo builds a machine inventory from the kernel and firmware.
//
// Every value carries the path or command it came from, and a field that the
// hardware does not report is marked as unavailable rather than filled with a
// plausible-looking number. Nothing here is estimated or synthesised: the point
// is that a stranger's laptop can be inspected and the output trusted.
package hwinfo

import "time"

// Field is one line of the report.
type Field struct {
	Label  string `json:"label"`
	Value  string `json:"value"`
	Detail string `json:"detail"`
	// Source is the file or command the value was read from, shown in the UI
	// so any claim can be verified by hand.
	Source string `json:"source"`
	// Note explains why Value is empty (permissions, hardware silent, tool
	// not installed). Never used to soften a real value.
	Note string `json:"note"`
	Mono bool   `json:"mono"`
}

type Section struct {
	ID     string  `json:"id"`
	Title  string  `json:"title"`
	Fields []Field `json:"fields"`
}

type Report struct {
	Generated int64     `json:"generated"`
	Model     string    `json:"model"`
	Vendor    string    `json:"vendor"`
	Form      string    `json:"form"`
	Sections  []Section `json:"sections"`
	Battery   *Battery  `json:"battery"`
}

// Battery is reported separately because the UI visualises it.
type Battery struct {
	Present      bool    `json:"present"`
	Name         string  `json:"name"`
	Manufacturer string  `json:"manufacturer"`
	Model        string  `json:"model"`
	Serial       string  `json:"serial"`
	Technology   string  `json:"technology"`
	Status       string  `json:"status"`
	Percent      float64 `json:"percent"`
	// Capacities in watt-hours, derived from the raw charge/energy counters.
	DesignWh float64 `json:"designWh"`
	FullWh   float64 `json:"fullWh"`
	NowWh    float64 `json:"nowWh"`
	// Health is measured full capacity over design capacity. The firmware
	// reports both; deck only divides them.
	Health     float64 `json:"health"`
	HealthKnown bool   `json:"healthKnown"`
	Cycles     int     `json:"cycles"`
	CyclesKnown bool   `json:"cyclesKnown"`
	VoltageV   float64 `json:"voltageV"`
	PowerW     float64 `json:"powerW"`
	OnAC       bool    `json:"onAC"`
	Source     string  `json:"source"`
	Note       string  `json:"note"`
}

// Collect returns the full inventory.
func Collect() *Report {
	r := &Report{Generated: time.Now().UnixMilli()}
	collect(r)
	return r
}

func field(label, value, source string) Field {
	return Field{Label: label, Value: value, Source: source}
}

func unavailable(label, source, note string) Field {
	return Field{Label: label, Source: source, Note: note}
}
