package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "deck",
		Width:     1360,
		Height:    860,
		MinWidth:  940,
		MinHeight: 620,
		Frameless: true,
		// The shell paints its own background before React mounts, so the
		// window never flashes white on launch.
		BackgroundColour: &options.RGBA{R: 9, G: 10, B: 13, A: 1},
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Linux: &linux.Options{
			ProgramName:         "deck",
			WindowIsTranslucent: false,
		},
		Bind: []interface{}{app},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
