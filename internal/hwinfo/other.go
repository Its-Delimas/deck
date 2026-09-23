//go:build !linux

package hwinfo

// Linux is deck's first-class platform; the inventory readers are all /sys and
// DMI based. Other platforms report nothing rather than something invented.
func collect(r *Report) {
	r.Sections = []Section{{
		ID: "system", Title: "System",
		Fields: []Field{unavailable("Inventory", "", "hardware inventory is implemented for Linux only")},
	}}
	r.Battery = &Battery{Note: "battery reporting is implemented for Linux only"}
}
