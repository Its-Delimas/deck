// Package term runs real PTY-backed shell sessions. The frontend renders the
// raw byte stream, so interactive programs (vim, htop, less) behave exactly as
// they would in any other terminal emulator.
package term

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

// Emitter delivers terminal output to the UI layer.
type Emitter func(event string, data ...interface{})

type session struct {
	id   string
	cmd  *exec.Cmd
	tty  *os.File
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

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	cmd := exec.Command(shell, "-l")
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")

	tty, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return err
	}
	s := &session{id: id, cmd: cmd, tty: tty}
	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	go func() {
		buf := make([]byte, 8192)
		for {
			n, err := tty.Read(buf)
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
	return nil
}

func (m *Manager) Write(id, data string) error {
	s := m.get(id)
	if s == nil {
		return fmt.Errorf("no session %s", id)
	}
	_, err := s.tty.WriteString(data)
	return err
}

func (m *Manager) Resize(id string, cols, rows int) error {
	s := m.get(id)
	if s == nil {
		return nil
	}
	return pty.Setsize(s.tty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
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
		_ = s.tty.Close()
		if s.cmd.Process != nil {
			_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGHUP)
		}
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
