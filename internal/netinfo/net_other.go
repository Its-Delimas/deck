//go:build !linux

package netinfo

import (
	"strings"

	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

// scan uses gopsutil's socket enumeration off Linux. The port-to-process join
// is the whole point of this package, so connections without an owning PID are
// still listed, just without a name.
func scan() ([]Conn, error) {
	conns, err := gnet.Connections("inet")
	if err != nil {
		return nil, err
	}
	names := map[int32]procMeta{}
	out := make([]Conn, 0, len(conns))
	for _, c := range conns {
		proto := "tcp"
		if c.Type == 2 {
			proto = "udp"
		}
		if c.Family == 10 { // AF_INET6
			proto += "6"
		}
		state := c.Status
		if proto[:3] == "udp" {
			if c.Raddr.Port == 0 {
				state = "LISTEN"
			} else {
				state = "ESTABLISHED"
			}
		}
		conn := Conn{
			Proto: proto, Local: c.Laddr.IP, Port: int(c.Laddr.Port),
			Remote: c.Raddr.IP, RPort: int(c.Raddr.Port), State: state, PID: c.Pid,
		}
		if c.Pid > 0 {
			meta, ok := names[c.Pid]
			if !ok {
				meta = describe(c.Pid)
				names[c.Pid] = meta
			}
			conn.Proc, conn.Cmd, conn.Cwd = meta.name, meta.cmd, meta.cwd
		}
		out = append(out, conn)
	}
	return out, nil
}

type procMeta struct {
	name string
	cmd  string
	cwd  string
}

func describe(pid int32) procMeta {
	var m procMeta
	p, err := process.NewProcess(pid)
	if err != nil {
		return m
	}
	m.name, _ = p.Name()
	m.cmd, _ = p.Cmdline()
	m.cwd, _ = p.Cwd()
	return m
}

func guessFromCmd(name, cmd string) string {
	c := strings.ToLower(cmd + " " + name)
	switch {
	case strings.Contains(c, "vite"):
		return "Vite"
	case strings.Contains(c, "next"):
		return "Next.js"
	case strings.Contains(c, "webpack"):
		return "Webpack"
	case strings.Contains(c, "postgres"):
		return "PostgreSQL"
	case strings.Contains(c, "redis"):
		return "Redis"
	case strings.Contains(c, "docker"), strings.Contains(c, "com.docker"):
		return "Docker"
	case strings.Contains(c, "node"):
		return "Node"
	}
	return ""
}
