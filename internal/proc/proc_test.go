package proc

import "testing"

func TestClassify(t *testing.T) {
	cases := []struct{ name, cmd, want string }{
		{"postgres", "/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql", "database"},
		{"redis-server", "redis-server *:6379", "database"},
		{"node", "node /home/me/app/node_modules/.bin/vite", "node"},
		{"python3", "python3 -m uvicorn app:api", "python"},
		{"dockerd", "/usr/bin/dockerd", "container"},
		{"code", "/usr/share/code/code --type=renderer", "editor"},
		{"firefox", "/usr/lib/firefox/firefox", "browser"},
		{"sshd", "sshd: /usr/sbin/sshd -D", ""},
	}
	for _, c := range cases {
		if got := classify(c.name, c.cmd); got != c.want {
			t.Errorf("classify(%q) = %q, want %q", c.name, got, c.want)
		}
	}
}
