//go:build windows

package term

import (
	"os"
	"os/exec"
)

// defaultShell prefers PowerShell, which every supported Windows release ships,
// and falls back to the command interpreter named by %ComSpec%.
func defaultShell() (string, []string) {
	if path, err := exec.LookPath("pwsh.exe"); err == nil {
		return path, []string{"-NoLogo"}
	}
	if path, err := exec.LookPath("powershell.exe"); err == nil {
		return path, []string{"-NoLogo"}
	}
	comspec := os.Getenv("ComSpec")
	if comspec == "" {
		comspec = "cmd.exe"
	}
	return comspec, nil
}

func endProcess(p *os.Process) {
	_ = p.Kill()
}
