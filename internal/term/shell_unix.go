//go:build !windows

package term

import (
	"os"
	"syscall"
)

// defaultShell honours $SHELL and starts it as a login shell so the user's
// profile, aliases and PATH are all in place.
func defaultShell() (string, []string) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	return shell, []string{"-l"}
}

// endProcess signals the whole foreground group, so children of the shell die
// with it rather than being reparented to init.
func endProcess(p *os.Process) {
	if err := syscall.Kill(-p.Pid, syscall.SIGHUP); err != nil {
		_ = p.Kill()
	}
}
