// Package project turns a directory on disk into something deck can monitor:
// its git state, its detected stack, and the commands that start it.
package project

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Git struct {
	Branch    string `json:"branch"`
	Modified  int    `json:"modified"`
	Staged    int    `json:"staged"`
	Untracked int    `json:"untracked"`
	Ahead     int    `json:"ahead"`
	Behind    int    `json:"behind"`
	Remote    string `json:"remote"`
	Commit    string `json:"commit"`
	Message   string `json:"message"`
	Author    string `json:"author"`
	When      int64  `json:"when"`
	Clean     bool   `json:"clean"`
}

type Script struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Source  string `json:"source"` // npm | make | compose | go
	Role    string `json:"role"`   // frontend | backend | test | build | other
}

type Project struct {
	Name    string   `json:"name"`
	Path    string   `json:"path"`
	Git     *Git     `json:"git"`
	Stack   []string `json:"stack"`
	Scripts []Script `json:"scripts"`
	Opened  int64    `json:"opened"`
}

// Open reads everything static about a project directory.
func Open(path string) (*Project, error) {
	path = filepath.Clean(path)
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	p := &Project{Name: filepath.Base(path), Path: path, Opened: time.Now().UnixMilli()}
	p.Git = readGit(path)
	p.Stack = detectStack(path)
	p.Scripts = readScripts(path)
	return p, nil
}

func git(dir string, args ...string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(string(out)), true
}

func readGit(dir string) *Git {
	if _, ok := git(dir, "rev-parse", "--is-inside-work-tree"); !ok {
		return nil
	}
	g := &Git{}
	g.Branch, _ = git(dir, "rev-parse", "--abbrev-ref", "HEAD")
	g.Remote, _ = git(dir, "remote", "get-url", "origin")

	if status, ok := git(dir, "status", "--porcelain=v1", "--branch"); ok {
		for _, line := range strings.Split(status, "\n") {
			if strings.HasPrefix(line, "##") {
				g.Ahead, g.Behind = parseTracking(line)
				continue
			}
			if len(line) < 2 {
				continue
			}
			switch {
			case strings.HasPrefix(line, "??"):
				g.Untracked++
			default:
				if line[0] != ' ' {
					g.Staged++
				}
				if line[1] != ' ' {
					g.Modified++
				}
			}
		}
	}
	g.Clean = g.Modified == 0 && g.Staged == 0 && g.Untracked == 0

	if last, ok := git(dir, "log", "-1", "--format=%h%x1f%s%x1f%an%x1f%ct"); ok {
		parts := strings.Split(last, "\x1f")
		if len(parts) == 4 {
			g.Commit, g.Message, g.Author = parts[0], parts[1], parts[2]
			sec, _ := strconv.ParseInt(parts[3], 10, 64)
			g.When = sec * 1000
		}
	}
	return g
}

func parseTracking(line string) (ahead, behind int) {
	if i := strings.Index(line, "["); i >= 0 {
		for _, part := range strings.Split(strings.Trim(line[i:], "[]"), ", ") {
			fields := strings.Fields(part)
			if len(fields) != 2 {
				continue
			}
			n, _ := strconv.Atoi(fields[1])
			switch fields[0] {
			case "ahead":
				ahead = n
			case "behind":
				behind = n
			}
		}
	}
	return
}

var stackMarkers = []struct{ file, label string }{
	{"package.json", "Node"}, {"go.mod", "Go"}, {"Cargo.toml", "Rust"},
	{"pyproject.toml", "Python"}, {"requirements.txt", "Python"}, {"Gemfile", "Ruby"},
	{"composer.json", "PHP"}, {"pom.xml", "Java"}, {"build.gradle", "Gradle"},
	{"Dockerfile", "Docker"}, {"docker-compose.yml", "Compose"}, {"docker-compose.yaml", "Compose"},
	{"vite.config.ts", "Vite"}, {"vite.config.js", "Vite"}, {"next.config.js", "Next.js"},
	{"next.config.mjs", "Next.js"}, {"svelte.config.js", "Svelte"}, {"nuxt.config.ts", "Nuxt"},
	{"tailwind.config.js", "Tailwind"}, {"prisma/schema.prisma", "Prisma"},
	{"Makefile", "Make"}, {"wails.json", "Wails"},
}

func detectStack(dir string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range stackMarkers {
		if _, err := os.Stat(filepath.Join(dir, m.file)); err == nil && !seen[m.label] {
			seen[m.label] = true
			out = append(out, m.label)
		}
	}
	return out
}

type packageJSON struct {
	Name    string            `json:"name"`
	Scripts map[string]string `json:"scripts"`
}

func readScripts(dir string) []Script {
	var out []Script
	if b, err := os.ReadFile(filepath.Join(dir, "package.json")); err == nil {
		var pkg packageJSON
		if json.Unmarshal(b, &pkg) == nil {
			runner := npmRunner(dir)
			names := make([]string, 0, len(pkg.Scripts))
			for name := range pkg.Scripts {
				names = append(names, name)
			}
			sort.Strings(names)
			for _, name := range names {
				out = append(out, Script{Name: name, Command: runner + " run " + name, Source: "npm", Role: roleOf(name)})
			}
		}
	}
	if b, err := os.ReadFile(filepath.Join(dir, "Makefile")); err == nil {
		for _, target := range makeTargets(string(b)) {
			out = append(out, Script{Name: target, Command: "make " + target, Source: "make", Role: roleOf(target)})
		}
	}
	for _, f := range []string{"docker-compose.yml", "docker-compose.yaml", "compose.yaml"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			out = append(out,
				Script{Name: "compose up", Command: "docker compose up -d", Source: "compose", Role: "backend"},
				Script{Name: "compose down", Command: "docker compose down", Source: "compose", Role: "other"})
			break
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
		out = append(out, Script{Name: "go run", Command: "go run .", Source: "go", Role: "backend"})
	}
	return out
}

// npmRunner honours whichever lockfile the project actually uses.
func npmRunner(dir string) string {
	for file, runner := range map[string]string{
		"bun.lockb": "bun", "bun.lock": "bun", "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn",
	} {
		if _, err := os.Stat(filepath.Join(dir, file)); err == nil {
			return runner
		}
	}
	return "npm"
}

func roleOf(name string) string {
	n := strings.ToLower(name)
	switch {
	// Backend first: "api:server" also contains "serve".
	case strings.Contains(n, "api"), strings.Contains(n, "server"), strings.Contains(n, "backend"):
		return "backend"
	case strings.Contains(n, "dev"), strings.Contains(n, "start"), strings.Contains(n, "serve"):
		return "frontend"
	case strings.Contains(n, "test"), strings.Contains(n, "lint"), strings.Contains(n, "check"):
		return "test"
	case strings.Contains(n, "build"), strings.Contains(n, "compile"):
		return "build"
	}
	return "other"
}

func makeTargets(content string) []string {
	var out []string
	for _, line := range strings.Split(content, "\n") {
		if line == "" || line[0] == '\t' || line[0] == '#' || line[0] == '.' || strings.HasPrefix(line, " ") {
			continue
		}
		idx := strings.Index(line, ":")
		if idx <= 0 || strings.Contains(line[:idx], "=") || strings.Contains(line[:idx], " ") {
			continue
		}
		out = append(out, strings.TrimSpace(line[:idx]))
		if len(out) >= 12 {
			break
		}
	}
	return out
}

// Discover finds git repositories beneath root, shallowly, so the project
// switcher has something to offer without a full-disk crawl.
func Discover(root string, maxDepth int) []string {
	root = filepath.Clean(root)
	var found []string
	var visit func(dir string, depth int)
	visit = func(dir string, depth int) {
		if depth > maxDepth || len(found) >= 60 {
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if !e.IsDir() || strings.HasPrefix(e.Name(), ".") && e.Name() != ".git" {
				continue
			}
			if e.Name() == ".git" {
				found = append(found, dir)
				return // do not descend into a repository
			}
		}
		for _, e := range entries {
			name := e.Name()
			if !e.IsDir() || strings.HasPrefix(name, ".") || name == "node_modules" {
				continue
			}
			visit(filepath.Join(dir, name), depth+1)
		}
	}
	visit(root, 0)
	sort.Strings(found)
	return found
}
