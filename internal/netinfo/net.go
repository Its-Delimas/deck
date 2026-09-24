// Package netinfo reports sockets and, crucially, which process owns each one.
// A port number on its own is not useful to a developer; "5173 → vite → myapp"
// is.
package netinfo

import (
	"sort"
	"strings"
	"sync"
	"time"
)

type Conn struct {
	Proto  string `json:"proto"`
	Local  string `json:"local"`
	Port   int    `json:"port"`
	Remote string `json:"remote"`
	RPort  int    `json:"remotePort"`
	State  string `json:"state"`
	PID    int32  `json:"pid"`
	Proc   string `json:"process"`
	Cmd    string `json:"cmd"`
	User   string `json:"user"`
	Label  string `json:"label"` // well-known service name, e.g. "PostgreSQL"
	Cwd    string `json:"cwd"`
}

type Collector struct {
	mu       sync.Mutex
	cache    []Conn
	cachedAt time.Time
}

func NewCollector() *Collector { return &Collector{} }

// All returns every TCP/UDP socket with owning-process information attached.
func (c *Collector) All() ([]Conn, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Since(c.cachedAt) < 2500*time.Millisecond && c.cache != nil {
		return c.cache, nil
	}
	list, err := scan()
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Label = wellKnown(list[i].Port, list[i].Proc, list[i].Cmd)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Port < list[j].Port })
	c.cache, c.cachedAt = list, time.Now()
	return list, nil
}

// Listening filters All down to bound server sockets, which is what matters
// when you are looking for "what is on port 3000".
func (c *Collector) Listening() ([]Conn, error) {
	all, err := c.All()
	if err != nil {
		return nil, err
	}
	out := make([]Conn, 0, 32)
	seen := map[string]bool{}
	for _, cn := range all {
		if cn.State != "LISTEN" {
			continue
		}
		// A service bound on both IPv4 and IPv6 is one service, not two.
		key := strings.TrimSuffix(cn.Proto, "6") + ":" + itoa(cn.Port)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, cn)
	}
	return out, nil
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b [8]byte
	p := len(b)
	for i > 0 {
		p--
		b[p] = byte('0' + i%10)
		i /= 10
	}
	return string(b[p:])
}

var known = map[int]string{
	3000: "Dev server", 3001: "Dev server", 4000: "Dev server", 4200: "Angular",
	5000: "Dev server", 5173: "Vite", 5174: "Vite", 8000: "Dev server", 8080: "HTTP",
	8081: "HTTP", 9000: "Dev server", 1337: "Dev server", 5432: "PostgreSQL",
	3306: "MySQL", 6379: "Redis", 27017: "MongoDB", 9200: "Elasticsearch",
	5672: "RabbitMQ", 11211: "Memcached", 2375: "Docker", 2376: "Docker",
	9090: "Prometheus", 3100: "Loki", 8888: "Jupyter", 5601: "Kibana",
}

func wellKnown(port int, name, cmd string) string {
	if l, ok := known[port]; ok && l != "" {
		return l
	}
	return guessFromCmd(name, cmd)
}
