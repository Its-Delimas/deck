//go:build linux

package netinfo

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
)

var tcpStates = map[string]string{
	"01": "ESTABLISHED", "02": "SYN_SENT", "03": "SYN_RECV", "04": "FIN_WAIT1",
	"05": "FIN_WAIT2", "06": "TIME_WAIT", "07": "CLOSE", "08": "CLOSE_WAIT",
	"09": "LAST_ACK", "0A": "LISTEN", "0B": "CLOSING",
}

type procMeta struct {
	pid  int32
	name string
	cmd  string
	cwd  string
	user string
}

// scan reads the kernel socket tables and joins them against the socket inodes
// held open by each process, which is how a port gets a name.
func scan() ([]Conn, error) {
	inodes := inodeOwners()
	var out []Conn
	for _, src := range []struct{ file, proto string }{
		{"/proc/net/tcp", "tcp"},
		{"/proc/net/tcp6", "tcp6"},
		{"/proc/net/udp", "udp"},
		{"/proc/net/udp6", "udp6"},
	} {
		out = append(out, parseTable(src.file, src.proto, inodes)...)
	}
	return out, nil
}

func parseTable(path, proto string, inodes map[string]procMeta) []Conn {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Scan() // header
	var out []Conn
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 10 {
			continue
		}
		localIP, localPort := parseAddr(fields[1])
		remoteIP, remotePort := parseAddr(fields[2])
		state := tcpStates[fields[3]]
		if strings.HasPrefix(proto, "udp") {
			// UDP has no connection state; a bound socket with no peer is a listener.
			if remotePort == 0 {
				state = "LISTEN"
			} else {
				state = "ESTABLISHED"
			}
		}
		c := Conn{Proto: proto, Local: localIP, Port: localPort, Remote: remoteIP, RPort: remotePort, State: state}
		if meta, ok := inodes[fields[9]]; ok {
			c.PID, c.Proc, c.Cmd, c.Cwd, c.User = meta.pid, meta.name, meta.cmd, meta.cwd, meta.user
		}
		out = append(out, c)
	}
	return out
}

func parseAddr(s string) (string, int) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return "", 0
	}
	port, _ := strconv.ParseInt(parts[1], 16, 32)
	raw, err := hex.DecodeString(parts[0])
	if err != nil {
		return "", int(port)
	}
	// Addresses are little-endian 32-bit words.
	for i := 0; i+3 < len(raw); i += 4 {
		raw[i], raw[i+1], raw[i+2], raw[i+3] = raw[i+3], raw[i+2], raw[i+1], raw[i]
	}
	ip := net.IP(raw)
	if len(raw) == 16 {
		if v4 := ip.To4(); v4 != nil {
			ip = v4
		}
	}
	return ip.String(), int(port)
}

// inodeOwners walks /proc/<pid>/fd once and indexes every socket inode by the
// process holding it.
func inodeOwners() map[string]procMeta {
	out := map[string]procMeta{}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return out
	}
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || name[0] < '0' || name[0] > '9' {
			continue
		}
		pid, err := strconv.ParseInt(name, 10, 32)
		if err != nil {
			continue
		}
		fdDir := "/proc/" + name + "/fd"
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue // not ours; kernel threads and other users' processes
		}
		var meta *procMeta
		for _, fd := range fds {
			link, err := os.Readlink(fdDir + "/" + fd.Name())
			if err != nil || !strings.HasPrefix(link, "socket:[") {
				continue
			}
			if meta == nil {
				meta = describe(int32(pid))
			}
			out[strings.TrimSuffix(strings.TrimPrefix(link, "socket:["), "]")] = *meta
		}
	}
	return out
}

func describe(pid int32) *procMeta {
	m := &procMeta{pid: pid}
	if b, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid)); err == nil {
		m.name = strings.TrimSpace(string(b))
	}
	if b, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid)); err == nil {
		m.cmd = strings.TrimSpace(strings.ReplaceAll(strings.TrimRight(string(b), "\x00"), "\x00", " "))
	}
	m.cwd, _ = os.Readlink(fmt.Sprintf("/proc/%d/cwd", pid))
	return m
}

// guessFromCmd derives a friendly label from the command line when the port
// itself is not recognisable.
func guessFromCmd(name, cmd string) string {
	c := strings.ToLower(cmd + " " + name)
	switch {
	case strings.Contains(c, "vite"):
		return "Vite"
	case strings.Contains(c, "next"):
		return "Next.js"
	case strings.Contains(c, "nuxt"):
		return "Nuxt"
	case strings.Contains(c, "webpack"):
		return "Webpack"
	case strings.Contains(c, "uvicorn"), strings.Contains(c, "gunicorn"):
		return "Python API"
	case strings.Contains(c, "postgres"):
		return "PostgreSQL"
	case strings.Contains(c, "redis"):
		return "Redis"
	case strings.Contains(c, "docker"):
		return "Docker"
	case strings.Contains(c, "node"):
		return "Node"
	}
	return ""
}
