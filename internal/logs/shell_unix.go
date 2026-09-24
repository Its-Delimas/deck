//go:build !windows

package logs

// commandShell returns the interpreter used to run a project script.
func commandShell() (string, string) { return "sh", "-c" }
