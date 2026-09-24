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

func TestFullNameRecoversTruncatedComm(t *testing.T) {
	cases := []struct{ name, cmdline, want string }{
		// The kernel caps comm at 15 characters; the command line has the rest.
		{"WebKitWebProces", "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebProcess 4 22", "WebKitWebProcess"},
		{"systemd-resolve", "/usr/lib/systemd/systemd-resolved", "systemd-resolved"},
		{"xdg-permission-", "/usr/libexec/xdg-permission-store", "xdg-permission-store"},
		// Short names are already complete and must be left alone.
		{"node", "node /home/me/app/node_modules/.bin/vite", "node"},
		// A mismatch means we cannot trust the command line, so keep comm.
		{"some-long-name1", "/bin/dash -c 'exec something else'", "some-long-name1"},
	}
	for _, c := range cases {
		if got := fullName(c.name, c.cmdline); got != c.want {
			t.Errorf("fullName(%q) = %q, want %q", c.name, got, c.want)
		}
	}
}
