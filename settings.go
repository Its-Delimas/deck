package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
)

// Settings is persisted to the user's config directory so preferences and the
// recent-project list survive restarts.
type Settings struct {
	PollInterval   int      `json:"pollInterval"`
	Accent         string   `json:"accent"`
	Density        string   `json:"density"`  // comfortable | compact
	CPUMode        string   `json:"cpuMode"`  // total | cores
	TempUnit       string   `json:"tempUnit"` // c | f
	RecentProjects []string `json:"recentProjects"`
	ActiveProject  string   `json:"activeProject"`
	ConfirmKill    bool     `json:"confirmKill"`
	ShowSystemProcs bool    `json:"showSystemProcs"`
	StartPage      string   `json:"startPage"`
}

func defaultSettings() Settings {
	return Settings{
		PollInterval: 1000, Accent: "indigo", Density: "comfortable",
		CPUMode: "total", TempUnit: "c", ConfirmKill: true, StartPage: "dashboard",
	}
}

func settingsPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "deck", "settings.json")
}

func loadSettings() Settings {
	s := defaultSettings()
	b, err := os.ReadFile(settingsPath())
	if err != nil {
		return s
	}
	_ = json.Unmarshal(b, &s)
	if s.PollInterval < 250 {
		s.PollInterval = 1000
	}
	return s
}

// GetSettings returns the persisted preferences.
func (a *App) GetSettings() Settings {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	return a.settings
}

// SaveSettings writes preferences to disk and applies the ones that affect the
// running app immediately.
func (a *App) SaveSettings(s Settings) error {
	a.settingsMu.Lock()
	a.settings = s
	a.settingsMu.Unlock()
	if s.PollInterval > 0 {
		a.SetPollInterval(s.PollInterval)
	}
	return persist(s)
}

func persist(s Settings) error {
	path := settingsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// rememberProject moves a path to the front of the recent list, capped at ten.
func (a *App) rememberProject(path string) {
	a.settingsMu.Lock()
	recent := []string{path}
	for _, p := range a.settings.RecentProjects {
		if p != path && len(recent) < 10 {
			if _, err := os.Stat(p); err == nil {
				recent = append(recent, p)
			}
		}
	}
	a.settings.RecentProjects = recent
	a.settings.ActiveProject = path
	s := a.settings
	a.settingsMu.Unlock()
	_ = persist(s)
}

// ForgetProject removes a path from the recent list.
func (a *App) ForgetProject(path string) Settings {
	a.settingsMu.Lock()
	out := a.settings.RecentProjects[:0]
	for _, p := range a.settings.RecentProjects {
		if p != path {
			out = append(out, p)
		}
	}
	a.settings.RecentProjects = out
	sort.SliceStable(out, func(i, j int) bool { return false })
	s := a.settings
	a.settingsMu.Unlock()
	_ = persist(s)
	return s
}
