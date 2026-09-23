//go:build !linux

package system

// gpus is a no-op on platforms where we have not implemented GPU probing yet.
// Linux is the first-class target; see gpu_linux.go.
func gpus() []GPUStat { return nil }
