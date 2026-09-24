//go:build linux

package netinfo

import "testing"

func TestParseAddr(t *testing.T) {
	// /proc/net/tcp writes addresses as little-endian hex words.
	cases := []struct {
		raw  string
		ip   string
		port int
	}{
		{"0100007F:1F90", "127.0.0.1", 8080},          // 127.0.0.1:8080
		{"00000000:1538", "0.0.0.0", 5432},            // any:5432
		{"0101A8C0:0016", "192.168.1.1", 22},          // 192.168.1.1:22
		{"00000000000000000000000000000000:1435", "::", 5173}, // IPv6 any:5173
	}
	for _, c := range cases {
		ip, port := parseAddr(c.raw)
		if ip != c.ip || port != c.port {
			t.Errorf("parseAddr(%q) = %s:%d, want %s:%d", c.raw, ip, port, c.ip, c.port)
		}
	}
}

func TestParseAddrRejectsJunk(t *testing.T) {
	if ip, port := parseAddr("not-an-address"); ip != "" || port != 0 {
		t.Errorf("expected empty result, got %s:%d", ip, port)
	}
}

func TestWellKnownPrefersPortThenCommand(t *testing.T) {
	if got := wellKnown(5432, "postgres", ""); got != "PostgreSQL" {
		t.Errorf("port 5432 should be named PostgreSQL, got %q", got)
	}
	if got := wellKnown(49001, "node", "node /home/me/app/node_modules/.bin/vite"); got != "Vite" {
		t.Errorf("an unknown port should fall back to the command line, got %q", got)
	}
	if got := wellKnown(49002, "mystery", "mystery --serve"); got != "" {
		t.Errorf("an unrecognisable service should stay unnamed, got %q", got)
	}
}
