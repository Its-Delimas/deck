// Package logs streams log sources (the system journal, a systemd unit, a
// docker container, or an arbitrary command) into the UI. Lines are batched
// before being emitted: a busy journal can produce thousands of lines a second
// and one event per line would swamp the bridge.
package logs

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Line struct {
	Time    int64  `json:"time"`
	Level   string `json:"level"`
	Source  string `json:"source"`
	Message string `json:"message"`
	Stream  string `json:"stream"`
}

type Emitter func(event string, data ...interface{})

type Source struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Kind   string `json:"kind"` // system | unit | docker | command
	Target string `json:"target"`
	Dir    string `json:"dir"`
}

type stream struct {
	cancel context.CancelFunc
}

type Streamer struct {
	mu      sync.Mutex
	streams map[string]*stream
	emit    Emitter
}

func NewStreamer(emit Emitter) *Streamer {
	return &Streamer{streams: map[string]*stream{}, emit: emit}
}

// Available lists the log sources present on this machine.
func Available() []Source {
	var out []Source
	if _, err := exec.LookPath("journalctl"); err == nil {
		out = append(out,
			Source{ID: "system", Label: "System journal", Kind: "system"},
			Source{ID: "kernel", Label: "Kernel", Kind: "system", Target: "-k"},
			Source{ID: "user", Label: "User session", Kind: "system", Target: "--user"},
		)
	}
	if _, err := exec.LookPath("docker"); err == nil {
		out = append(out, Source{ID: "docker", Label: "Docker daemon", Kind: "unit", Target: "docker"})
	}
	return out
}

// Start begins following a source. Existing streams with the same id are
// replaced so switching sources never leaks a process.
func (s *Streamer) Start(id string, src Source) error {
	s.Stop(id)
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.streams[id] = &stream{cancel: cancel}
	s.mu.Unlock()

	cmd := build(ctx, src)
	if src.Dir != "" {
		cmd.Dir = src.Dir
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		cancel()
		return err
	}

	go s.pump(ctx, id, src, stdout)
	go func() {
		_ = cmd.Wait()
		s.emit("logs:closed", id)
	}()
	return nil
}

func build(ctx context.Context, src Source) *exec.Cmd {
	switch src.Kind {
	case "unit":
		return exec.CommandContext(ctx, "journalctl", "-u", src.Target, "-f", "-n", "400", "--no-pager", "-o", "json")
	case "docker":
		return exec.CommandContext(ctx, "docker", "logs", "-f", "--tail", "400", src.Target)
	case "command":
		shell, flag := commandShell()
		return exec.CommandContext(ctx, shell, flag, src.Target)
	default:
		// JSON gives us the journal's own priority and unit name instead of
		// guessing severity from the text.
		args := []string{"-f", "-n", "400", "--no-pager", "-o", "json"}
		if src.Target != "" {
			args = append([]string{src.Target}, args...)
		}
		return exec.CommandContext(ctx, "journalctl", args...)
	}
}

// pump reads lines and flushes them in batches of at most 200, or every 120ms.
func (s *Streamer) pump(ctx context.Context, id string, src Source, r io.Reader) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	lines := make(chan Line, 4096)

	go func() {
		defer close(lines)
		for sc.Scan() {
			select {
			case lines <- parse(sc.Text(), src):
			case <-ctx.Done():
				return
			default: // drop under extreme pressure rather than block the reader
			}
		}
	}()

	ticker := time.NewTicker(120 * time.Millisecond)
	defer ticker.Stop()
	batch := make([]Line, 0, 200)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		s.emit("logs:lines", id, batch)
		batch = make([]Line, 0, 200)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case l, ok := <-lines:
			if !ok {
				flush()
				return
			}
			batch = append(batch, l)
			if len(batch) >= 200 {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

var levelWords = []struct{ token, level string }{
	{"emerg", "error"}, {"alert", "error"}, {"critical", "error"}, {"crit", "error"},
	{"fatal", "error"}, {"error", "error"}, {"err ", "error"}, {"failed", "error"},
	{"warning", "warn"}, {"warn", "warn"}, {"deprecat", "warn"},
	{"debug", "debug"}, {"trace", "debug"}, {"notice", "info"},
}

// ansi matches the escape sequences that progress output (docker compose, npm)
// sprays into a stream. They are meaningless in a log viewer.
var ansi = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-Z\\-_]|\r`)

func clean(s string) string {
	return strings.TrimRight(ansi.ReplaceAllString(s, ""), " \t")
}

// journalEntry is the subset of journalctl's JSON output we use.
type journalEntry struct {
	Timestamp string          `json:"__REALTIME_TIMESTAMP"`
	Priority  string          `json:"PRIORITY"`
	Unit      string          `json:"SYSLOG_IDENTIFIER"`
	Comm      string          `json:"_COMM"`
	PID       string          `json:"_PID"`
	Message   json.RawMessage `json:"MESSAGE"`
}

// priorities maps syslog severities onto the four levels the UI filters by.
var priorities = map[string]string{
	"0": "error", "1": "error", "2": "error", "3": "error",
	"4": "warn", "5": "info", "6": "info", "7": "debug",
}

func parse(raw string, src Source) Line {
	if src.Kind == "system" || src.Kind == "unit" {
		if line, ok := parseJournal(raw, src); ok {
			return line
		}
	}
	return parseText(raw, src)
}

// parseJournal reads one JSON entry. MESSAGE is usually a string but is an
// array of bytes when the line is not valid UTF-8.
func parseJournal(raw string, src Source) (Line, bool) {
	var e journalEntry
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		return Line{}, false
	}
	l := Line{Level: "info", Stream: src.ID, Time: time.Now().UnixMilli()}
	if micros, err := strconv.ParseInt(e.Timestamp, 10, 64); err == nil {
		l.Time = micros / 1000
	}
	if lvl, ok := priorities[e.Priority]; ok {
		l.Level = lvl
	}
	l.Source = e.Unit
	if l.Source == "" {
		l.Source = e.Comm
	}
	if l.Source == "" {
		l.Source = src.Label
	}
	if e.PID != "" {
		l.Source += "[" + e.PID + "]"
	}
	l.Message = clean(decodeMessage(e.Message))
	return l, true
}

func decodeMessage(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}
	var bytes []byte
	if json.Unmarshal(raw, &bytes) == nil {
		return string(bytes)
	}
	return string(raw)
}

// parseText handles sources that emit plain lines: docker and project scripts.
func parseText(raw string, src Source) Line {
	raw = clean(raw)
	l := Line{Time: time.Now().UnixMilli(), Level: "info", Stream: src.ID, Message: raw, Source: src.Label}
	lower := strings.ToLower(raw)
	for _, w := range levelWords {
		if strings.Contains(lower, w.token) {
			l.Level = w.level
			break
		}
	}
	return l
}

func (s *Streamer) Stop(id string) {
	s.mu.Lock()
	st := s.streams[id]
	delete(s.streams, id)
	s.mu.Unlock()
	if st != nil {
		st.cancel()
	}
}

func (s *Streamer) StopAll() {
	s.mu.Lock()
	ids := make([]string, 0, len(s.streams))
	for id := range s.streams {
		ids = append(ids, id)
	}
	s.mu.Unlock()
	for _, id := range ids {
		s.Stop(id)
	}
}
