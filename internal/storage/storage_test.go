package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanMeasuresTreeAndFlagsArtifacts(t *testing.T) {
	root := t.TempDir()
	write := func(path string, size int) {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, make([]byte, size), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("src/main.go", 1000)
	write("node_modules/pkg/index.js", 4000)
	write("node_modules/pkg/data.bin", 6000)
	write("README.md", 500)

	res, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 11500 {
		t.Errorf("total = %d, want 11500", res.Total)
	}
	if res.Items != 4 {
		t.Errorf("items = %d, want 4", res.Items)
	}
	if res.Reclaim != 10000 {
		t.Errorf("reclaimable = %d, want 10000 (node_modules)", res.Reclaim)
	}
	// Entries are ordered largest first.
	if res.Entries[0].Name != "node_modules" {
		t.Errorf("largest entry = %q, want node_modules", res.Entries[0].Name)
	}
	if res.Entries[0].Kind != "artifact" {
		t.Errorf("node_modules should be flagged reclaimable, got %q", res.Entries[0].Kind)
	}
	if len(res.Largest) == 0 || res.Largest[0].Size != 6000 {
		t.Errorf("largest file = %+v, want the 6000 byte one", res.Largest)
	}
}

func TestFileHeapKeepsBiggest(t *testing.T) {
	var h fileHeap
	for _, size := range []int64{5, 1, 9, 3, 7} {
		h.push(Entry{Size: size}, 3)
	}
	got := h.sorted()
	if len(got) != 3 || got[0].Size != 9 || got[1].Size != 7 || got[2].Size != 5 {
		t.Errorf("heap kept %v, want the three largest (9, 7, 5)", got)
	}
}
