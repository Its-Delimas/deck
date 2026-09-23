//go:build linux

package health

import (
	"os"

	"golang.org/x/sys/unix"
)

// fadviseDontNeed evicts the file from the page cache so a read-back test
// measures the drive rather than RAM.
func fadviseDontNeed(f *os.File) {
	_ = unix.Fadvise(int(f.Fd()), 0, 0, unix.FADV_DONTNEED)
}
