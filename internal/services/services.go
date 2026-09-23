// Package services discovers developer infrastructure — databases, caches,
// container runtimes and language runtimes — from systemd, Docker and the
// process table, and exposes lifecycle actions for each.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"
)

type Service struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`     // database | cache | container | runtime | web
	Source   string `json:"source"`   // systemd | docker | process
	Status   string `json:"status"`   // running | stopped | failed | unknown
	Detail   string `json:"detail"`   // image, unit description, or command
	PID      int32  `json:"pid"`
	Ports    []int  `json:"ports"`
	Uptime   string `json:"uptime"`
	Managed  bool   `json:"managed"`  // whether start/stop actions apply
	Enabled  bool   `json:"enabled"`
}

type Manager struct {
	mu       sync.Mutex
	cache    []Service
	cachedAt time.Time
	docker   string
	systemd  string
	probed   bool
}

func NewManager() *Manager { return &Manager{} }

func (m *Manager) probe() {
	if m.probed {
		return
	}
	m.probed = true
	m.docker, _ = exec.LookPath("docker")
	m.systemd, _ = exec.LookPath("systemctl")
}

// List returns the merged view of everything we can see. Shelling out is slow,
// so results are cached for a couple of seconds.
func (m *Manager) List() ([]Service, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if time.Since(m.cachedAt) < 3*time.Second && m.cache != nil {
		return m.cache, nil
	}
	m.probe()

	var out []Service
	out = append(out, m.systemdUnits()...)
	out = append(out, m.dockerContainers()...)
	sort.Slice(out, func(i, j int) bool {
		if (out[i].Status == "running") != (out[j].Status == "running") {
			return out[i].Status == "running"
		}
		return out[i].Name < out[j].Name
	})
	m.cache, m.cachedAt = out, time.Now()
	return out, nil
}

var interesting = map[string]string{
	"postgresql": "database", "postgres": "database", "mysql": "database",
	"mariadb": "database", "mongod": "database", "redis": "cache",
	"redis-server": "cache", "memcached": "cache", "docker": "container",
	"containerd": "container", "podman": "container", "nginx": "web",
	"apache2": "web", "httpd": "web", "elasticsearch": "database",
	"rabbitmq-server": "cache", "clickhouse-server": "database", "minio": "database",
	"ollama": "runtime", "influxdb": "database", "cassandra": "database",
}

func (m *Manager) systemdUnits() []Service {
	if m.systemd == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, m.systemd, "list-units", "--type=service", "--all",
		"--no-pager", "--no-legend", "--plain")
	buf, err := cmd.Output()
	if err != nil {
		return nil
	}
	var out []Service
	for _, line := range strings.Split(string(buf), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		unit := strings.TrimSuffix(fields[0], ".service")
		kind, ok := interesting[baseUnit(unit)]
		if !ok {
			continue
		}
		status := "stopped"
		switch fields[3] {
		case "running":
			status = "running"
		case "failed":
			status = "failed"
		case "exited", "dead":
			status = "stopped"
		}
		out = append(out, Service{
			ID: fields[0], Name: prettyName(unit), Kind: kind, Source: "systemd",
			Status: status, Detail: strings.Join(fields[4:], " "), Managed: true,
			Enabled: fields[1] == "loaded",
		})
	}
	return out
}

// baseUnit strips instance and version suffixes: "postgresql@16-main" -> "postgresql".
func baseUnit(unit string) string {
	if i := strings.IndexAny(unit, "@"); i > 0 {
		unit = unit[:i]
	}
	return strings.ToLower(unit)
}

func prettyName(unit string) string {
	switch baseUnit(unit) {
	case "postgresql", "postgres":
		return "PostgreSQL"
	case "redis", "redis-server":
		return "Redis"
	case "mysql":
		return "MySQL"
	case "mariadb":
		return "MariaDB"
	case "mongod":
		return "MongoDB"
	case "docker":
		return "Docker"
	case "containerd":
		return "containerd"
	case "nginx":
		return "nginx"
	case "elasticsearch":
		return "Elasticsearch"
	case "rabbitmq-server":
		return "RabbitMQ"
	}
	return unit
}

type dockerPS struct {
	ID     string `json:"ID"`
	Names  string `json:"Names"`
	Image  string `json:"Image"`
	State  string `json:"State"`
	Status string `json:"Status"`
	Ports  string `json:"Ports"`
}

func (m *Manager) dockerContainers() []Service {
	if m.docker == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, m.docker, "ps", "-a", "--format", "{{json .}}")
	buf, err := cmd.Output()
	if err != nil {
		return nil
	}
	var out []Service
	for _, line := range strings.Split(strings.TrimSpace(string(buf)), "\n") {
		if line == "" {
			continue
		}
		var c dockerPS
		if json.Unmarshal([]byte(line), &c) != nil {
			continue
		}
		status := "stopped"
		if c.State == "running" {
			status = "running"
		} else if c.State == "exited" && strings.Contains(c.Status, "(1)") {
			status = "failed"
		}
		out = append(out, Service{
			ID: c.ID, Name: c.Names, Kind: "container", Source: "docker",
			Status: status, Detail: c.Image, Ports: parsePorts(c.Ports),
			Uptime: c.Status, Managed: true,
		})
	}
	return out
}

func parsePorts(s string) []int {
	var out []int
	seen := map[int]bool{}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if i := strings.LastIndex(part, ":"); i >= 0 {
			part = part[i+1:]
		}
		if i := strings.Index(part, "->"); i > 0 {
			part = part[:i]
		}
		var p int
		if _, err := fmt.Sscanf(part, "%d", &p); err == nil && p > 0 && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

// Action runs start/stop/restart against a service. systemd units usually need
// elevation, so the error text is surfaced verbatim to the UI.
func (m *Manager) Action(id, source, action string) error {
	switch action {
	case "start", "stop", "restart":
	default:
		return fmt.Errorf("unsupported action %q", action)
	}
	m.probe()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	switch source {
	case "docker":
		if m.docker == "" {
			return fmt.Errorf("docker is not installed")
		}
		cmd = exec.CommandContext(ctx, m.docker, action, id)
	case "systemd":
		if m.systemd == "" {
			return fmt.Errorf("systemctl is not available")
		}
		cmd = exec.CommandContext(ctx, m.systemd, action, id)
	default:
		return fmt.Errorf("%s services cannot be controlled from deck", source)
	}
	out, err := cmd.CombinedOutput()
	m.mu.Lock()
	m.cachedAt = time.Time{} // force a refresh on the next poll
	m.mu.Unlock()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

// Logs returns the most recent log lines for a service.
func (m *Manager) Logs(id, source string, lines int) (string, error) {
	m.probe()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	var cmd *exec.Cmd
	switch source {
	case "docker":
		cmd = exec.CommandContext(ctx, m.docker, "logs", "--tail", fmt.Sprint(lines), id)
	case "systemd":
		cmd = exec.CommandContext(ctx, "journalctl", "-u", id, "-n", fmt.Sprint(lines), "--no-pager")
	default:
		return "", fmt.Errorf("no logs available for %s", source)
	}
	out, err := cmd.CombinedOutput()
	return string(out), err
}
