//go:build windows

package logs

import "os"

func commandShell() (string, string) {
	comspec := os.Getenv("ComSpec")
	if comspec == "" {
		comspec = "cmd.exe"
	}
	return comspec, "/c"
}
