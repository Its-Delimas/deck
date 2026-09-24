package project

import "testing"

func TestParseTracking(t *testing.T) {
	cases := []struct {
		line   string
		ahead  int
		behind int
	}{
		{"## master...origin/master", 0, 0},
		{"## master...origin/master [ahead 3]", 3, 0},
		{"## master...origin/master [behind 2]", 0, 2},
		{"## master...origin/master [ahead 1, behind 4]", 1, 4},
	}
	for _, c := range cases {
		ahead, behind := parseTracking(c.line)
		if ahead != c.ahead || behind != c.behind {
			t.Errorf("parseTracking(%q) = %d/%d, want %d/%d", c.line, ahead, behind, c.ahead, c.behind)
		}
	}
}

func TestMakeTargets(t *testing.T) {
	makefile := "" +
		"VERSION ?= 1.0\n" +
		".PHONY: build test\n" +
		"build:\n" +
		"\tgo build ./...\n" +
		"test: build\n" +
		"\tgo test ./...\n" +
		"# a comment\n"
	got := makeTargets(makefile)
	want := []string{"build", "test"}
	if len(got) != len(want) {
		t.Fatalf("makeTargets returned %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("target %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestRoleOf(t *testing.T) {
	for name, want := range map[string]string{
		"dev": "frontend", "start": "frontend", "api:server": "backend",
		"test:unit": "test", "build": "build", "release": "other",
	} {
		if got := roleOf(name); got != want {
			t.Errorf("roleOf(%q) = %q, want %q", name, got, want)
		}
	}
}
