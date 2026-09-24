// Package term runs real PTY-backed shell sessions: a genuine pseudo-terminal
// on Unix and a ConPTY on Windows, so interactive programs behave exactly as
// they would in any other terminal emulator.
package term

import (
	"fmt"
	"os"
	"sync"

	"github.com/aymanbagabas/go-pty"
)

// Emitter delivers terminal output to the UI layer.
type Emitter func(event string, data ...interface{})

type session struct {
	id   string
	pty  pty.Pty
	cmd  *pty.Cmd
	once sync.Once
}

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*session
	emit     Emitter
}

func NewManager(emit Emitter) *Manager {
	return &Manager{sessions: map[string]*session{}, emit: emit}
}

// Start opens a shell in dir and streams its output as "term:data" events.
func (m *Manager) Start(id, dir string, cols, rows int) error {
	m.mu.Lock()
	if _, exists := m.sessions[id]; exists {
		m.mu.Unlock()
		return nil
	}
	m.mu.Unlock()

	p, err := pty.New()
	if err != nil {
		return fmt.Errorf("could not allocate a pseudo-terminal: %w", err)
	}
	if cols > 0 && rows > 0 {
		_ = p.Resize(cols, rows)
	}

	shell, args := defaultShell()
	cmd := p.Command(shell, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	if err := cmd.Start(); err != nil {
		_ = p.Close()
		return fmt.Errorf("could not start %s: %w", shell, err)
	}

	s := &session{id: id, pty: p, cmd: cmd}
	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	go func() {
		buf := make([]byte, 8192)
		for {
			n, err := p.Read(buf)
			if n > 0 {
				m.emit("term:data", id, string(buf[:n]))
			}
			if err != nil {
				break
			}
		}
		m.emit("term:exit", id)
		m.Close(id)
	}()
	go func() {
		_ = cmd.Wait()
	}()
	return nil
}

func (m *Manager) Write(id, data string) error {
	s := m.get(id)
	if s == nil {
		return fmt.Errorf("no session %s", id)
	}
	_, err := s.pty.Write([]byte(data))
	return err
}

func (m *Manager) Resize(id string, cols, rows int) error {
	s := m.get(id)
	if s == nil || cols <= 0 || rows <= 0 {
		return nil
	}
	return s.pty.Resize(cols, rows)
}

func (m *Manager) Close(id string) {
	m.mu.Lock()
	s := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()
	if s == nil {
		return
	}
	s.once.Do(func() {
		if s.cmd != nil && s.cmd.Process != nil {
			endProcess(s.cmd.Process)
		}
		_ = s.pty.Close()
	})
}

// CloseAll tears every session down on shutdown so no orphan shells survive.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		m.Close(id)
	}
}

func (m *Manager) get(id string) *session {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[id]
}
