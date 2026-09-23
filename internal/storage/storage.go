// Package storage answers "what is eating my disk": directory sizes, the
// largest files, and the build artefacts (node_modules, target, .venv) that
// tend to be the real culprits on a development machine.
package storage

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
)

type Entry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	Items   int64  `json:"items"`
	Kind    string `json:"kind"` // "artifact" for caches/build output worth reclaiming
	Percent float64 `json:"percent"`
	ModTime int64  `json:"modTime"`
}

type ScanResult struct {
	Path     string  `json:"path"`
	Parent   string  `json:"parent"`
	Total    int64   `json:"total"`
	Items    int64   `json:"items"`
	Entries  []Entry `json:"entries"`
	Largest  []Entry `json:"largest"`
	Reclaim  int64   `json:"reclaimable"`
	Truncated bool   `json:"truncated"`
}

var artifactDirs = map[string]bool{
	"node_modules": true, "target": true, ".next": true, "dist": true, "build": true,
	".venv": true, "venv": true, "__pycache__": true, ".cache": true, "vendor": true,
	".gradle": true, ".pytest_cache": true, "coverage": true, ".turbo": true,
	".parcel-cache": true, "Pods": true, ".terraform": true,
}

// Scan measures every immediate child of root. Sub-directory sizes are computed
// in parallel because a cold walk of a large tree is I/O bound.
func Scan(root string) (*ScanResult, error) {
	root = expand(root)
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return &ScanResult{Path: root, Parent: filepath.Dir(root), Total: info.Size()}, nil
	}
	children, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	res := &ScanResult{Path: root, Parent: filepath.Dir(root)}
	entries := make([]Entry, len(children))

	var files fileHeap
	var filesMu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for i, ch := range children {
		name := ch.Name()
		full := filepath.Join(root, name)
		e := Entry{Name: name, Path: full, IsDir: ch.IsDir()}
		if artifactDirs[name] {
			e.Kind = "artifact"
		}
		if fi, err := ch.Info(); err == nil {
			e.ModTime = fi.ModTime().UnixMilli()
			if !ch.IsDir() {
				e.Size, e.Items = fi.Size(), 1
			}
		}
		if !ch.IsDir() {
			entries[i] = e
			filesMu.Lock()
			files.push(e, 20)
			filesMu.Unlock()
			continue
		}
		wg.Add(1)
		go func(i int, e Entry) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			size, items, big := walk(e.Path)
			e.Size, e.Items = size, items
			entries[i] = e
			filesMu.Lock()
			for _, f := range big {
				files.push(f, 20)
			}
			filesMu.Unlock()
		}(i, e)
	}
	wg.Wait()

	for _, e := range entries {
		if e.Name == "" {
			continue
		}
		res.Total += e.Size
		res.Items += e.Items
		if e.Kind == "artifact" {
			res.Reclaim += e.Size
		}
		res.Entries = append(res.Entries, e)
	}
	sort.Slice(res.Entries, func(i, j int) bool { return res.Entries[i].Size > res.Entries[j].Size })
	for i := range res.Entries {
		if res.Total > 0 {
			res.Entries[i].Percent = float64(res.Entries[i].Size) / float64(res.Total) * 100
		}
	}
	res.Largest = files.sorted()
	return res, nil
}

// walk totals a subtree, returning its size, entry count and the largest files
// found inside it.
func walk(root string) (size, items int64, largest []Entry) {
	var h fileHeap
	var total, count int64
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // unreadable paths are skipped, not fatal
		}
		if d.IsDir() {
			return nil
		}
		fi, err := d.Info()
		if err != nil {
			return nil
		}
		atomic.AddInt64(&total, fi.Size())
		atomic.AddInt64(&count, 1)
		h.push(Entry{Name: d.Name(), Path: path, Size: fi.Size(), Items: 1, ModTime: fi.ModTime().UnixMilli()}, 20)
		return nil
	})
	return total, count, h.sorted()
}

// fileHeap keeps the n largest entries seen without retaining the whole tree.
type fileHeap struct{ items []Entry }

func (h *fileHeap) push(e Entry, n int) {
	if len(h.items) < n {
		h.items = append(h.items, e)
		return
	}
	min, idx := h.items[0].Size, 0
	for i, it := range h.items {
		if it.Size < min {
			min, idx = it.Size, i
		}
	}
	if e.Size > min {
		h.items[idx] = e
	}
}

func (h *fileHeap) sorted() []Entry {
	out := append([]Entry(nil), h.items...)
	sort.Slice(out, func(i, j int) bool { return out[i].Size > out[j].Size })
	return out
}

func expand(p string) string {
	if strings.HasPrefix(p, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, strings.TrimPrefix(p, "~"))
		}
	}
	if p == "" {
		if home, err := os.UserHomeDir(); err == nil {
			return home
		}
	}
	return filepath.Clean(p)
}

// Home exposes the default scan root to the frontend.
func Home() string { return expand("") }
