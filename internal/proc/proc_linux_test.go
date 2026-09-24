//go:build linux

package proc

import (
	"os"
	"testing"
)

func TestScanFindsThisProcess(t *testing.T) {
	c := NewCollector()
	list, err := c.List()
	if err != nil {
		t.Fatal(err)
	}
	self := int32(os.Getpid())
	for _, p := range list {
		if p.PID == self {
			if p.Name == "" || p.MemRSS == 0 {
				t.Errorf("own process has empty fields: %+v", p)
			}
			return
		}
	}
	t.Fatalf("scan of %d processes did not include this process (%d)", len(list), self)
}

func TestStateName(t *testing.T) {
	for raw, want := range map[string]string{"R": "running", "S": "sleeping", "Z": "zombie", "T": "stopped"} {
		if got := stateName(raw); got != want {
			t.Errorf("stateName(%q) = %q, want %q", raw, got, want)
		}
	}
}
