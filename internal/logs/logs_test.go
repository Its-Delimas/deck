package logs

import (
	"fmt"
	"testing"
	"time"
)

func TestJournalParse(t *testing.T) {
	raw := `{"__REALTIME_TIMESTAMP":"1758712385990923","PRIORITY":"4","SYSLOG_IDENTIFIER":"dockerd","_PID":"3136","MESSAGE":"level=warning msg=\"healthcheck failed\" timeout=15s"}`
	l := parse(raw, Source{ID: "system", Kind: "system", Label: "System journal"})
	fmt.Printf("time=%s level=%s source=%s msg=%s\n", time.UnixMilli(l.Time).Format("15:04:05.000"), l.Level, l.Source, l.Message)
	if l.Level != "warn" {
		t.Errorf("priority 4 should be warn, got %q", l.Level)
	}
	if l.Source != "dockerd[3136]" {
		t.Errorf("source = %q", l.Source)
	}
	if l.Time < 1_700_000_000_000 {
		t.Errorf("timestamp not decoded: %d", l.Time)
	}
}

func TestAnsiStripped(t *testing.T) {
	l := parse("\x1b[1A\x1b[2K #2 DONE 0.6s\r", Source{ID: "s", Kind: "command", Label: "compose"})
	if l.Message != " #2 DONE 0.6s" {
		t.Errorf("escapes survived: %q", l.Message)
	}
}
