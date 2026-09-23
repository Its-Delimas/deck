//go:build !linux

package health

import "os"

func fadviseDontNeed(f *os.File) {}
