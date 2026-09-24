// Package health runs live hardware checks.
//
// Every figure here is measured on the spot — work is actually executed, bytes
// are actually written, the battery is actually sampled over time. Nothing is
// read from a vendor claim or interpolated from a model number, so the results
// cannot be dressed up by whoever is selling the machine.
package health

import (
	"context"

	"deck/internal/hwinfo"
	"fmt"
	"math"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Check is one measurement.
type Check struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Value    string `json:"value"`
	Detail   string `json:"detail"`
	Verdict  string `json:"verdict"` // ok | warn | danger | info | skipped
	Method   string `json:"method"`  // exactly what was done, so it can be repeated by hand
	Duration int64  `json:"duration"`
	Err      string `json:"error"`
}

// Progress reports which check is running so the UI can show live state.
type Progress func(id, label string, index, total int)

var order = []struct {
	id    string
	label string
	run   func(context.Context) Check
}{
	{"cpu", "Processor throughput", cpuCheck},
	{"thermal", "Thermals under load", thermalCheck},
	{"memory", "Memory bandwidth", memoryCheck},
	{"disk", "Disk read and write", diskCheck},
	{"battery", "Battery discharge", batteryCheck},
	{"smart", "Drive SMART data", smartCheck},
}

// Run executes every check in sequence. The whole suite takes roughly 25
// seconds, dominated by the battery sampling window.
func Run(ctx context.Context, progress Progress) []Check {
	out := make([]Check, 0, len(order))
	for i, c := range order {
		if ctx.Err() != nil {
			break
		}
		if progress != nil {
			progress(c.id, c.label, i+1, len(order))
		}
		start := time.Now()
		result := c.run(ctx)
		result.ID, result.Label = c.id, c.label
		result.Duration = time.Since(start).Milliseconds()
		out = append(out, result)
	}
	return out
}

// cpuCheck saturates every logical CPU with dependent integer work for three
// seconds and reports the aggregate rate, plus how far the clock sagged.
func cpuCheck(ctx context.Context) Check {
	const window = 3 * time.Second
	threads := runtime.NumCPU()
	deadline := time.Now().Add(window)

	freqStop := make(chan struct{})
	freqDone := make(chan []float64)
	go sampleFreq(freqStop, freqDone)

	var wg sync.WaitGroup
	counts := make([]uint64, threads)
	for t := 0; t < threads; t++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			// xorshift64: a dependency chain the compiler cannot elide or
			// vectorise away, so the number reflects real single-thread work.
			state := uint64(i)*2654435761 + 88172645463325252
			var n uint64
			for {
				for k := 0; k < 4096; k++ {
					state ^= state << 13
					state ^= state >> 7
					state ^= state << 17
					n++
				}
				if time.Now().After(deadline) || ctx.Err() != nil {
					break
				}
			}
			counts[i] = n + state&1 // keep the result live
		}(t)
	}
	wg.Wait()
	close(freqStop)
	freqs := <-freqDone

	var total uint64
	for _, c := range counts {
		total += c
	}
	mops := float64(total) / window.Seconds() / 1e6

	check := Check{
		Value:   fmt.Sprintf("%.0f Mops/s", mops),
		Detail:  fmt.Sprintf("%d threads · %.0f Mops/s per thread", threads, mops/float64(threads)),
		Method:  fmt.Sprintf("xorshift64 loop on %d goroutines for %s, operations counted", threads, window),
		Verdict: "info",
	}

	if len(freqs) > 0 {
		var sum float64
		for _, f := range freqs {
			sum += f
		}
		avg := sum / float64(len(freqs)) / 1e6
		maxF := maxFreqGHz()
		if maxF > 0 {
			ratio := avg / maxF
			check.Detail += fmt.Sprintf(" · held %.2f GHz of %.2f GHz max (%.0f%%)", avg, maxF, ratio*100)
			switch {
			case ratio < 0.55:
				check.Verdict = "warn"
				check.Detail += " — heavy throttling under sustained load"
			case ratio < 0.75:
				check.Verdict = "warn"
				check.Detail += " — clock sagged under sustained load"
			default:
				check.Verdict = "ok"
			}
		} else {
			check.Detail += fmt.Sprintf(" · held %.2f GHz", avg)
		}
	}
	return check
}

// sampleFreq records the actual clock of CPU 0 while the load test runs.
func sampleFreq(stop <-chan struct{}, done chan<- []float64) {
	var samples []float64
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			done <- samples
			return
		case <-ticker.C:
			if f, ok := readFloat("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"); ok {
				samples = append(samples, f)
			}
		}
	}
}

func maxFreqGHz() float64 {
	if f, ok := readFloat("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq"); ok {
		return f / 1e6
	}
	return 0
}

// thermalCheck re-runs a short load and records the peak sensor reading, so
// the temperature reported is one deck caused and observed.
func thermalCheck(ctx context.Context) Check {
	peak, sensor := 0.0, ""
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				if v, name := hottest(); v > peak {
					peak, sensor = v, name
				}
			}
		}
	}()

	deadline := time.Now().Add(4 * time.Second)
	var wg sync.WaitGroup
	for t := 0; t < runtime.NumCPU(); t++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			x := 1.0000001
			for time.Now().Before(deadline) && ctx.Err() == nil {
				for k := 0; k < 200000; k++ {
					x = math.Sqrt(x*1.0000003 + 1e-9)
				}
			}
			_ = x
		}()
	}
	wg.Wait()
	close(stop)
	<-done

	if peak == 0 {
		return Check{
			Verdict: "skipped",
			Detail:  "no temperature sensor is exposed by this hardware",
			Method:  "read /sys/class/hwmon/*/temp*_input while loading all cores for 4s",
		}
	}
	verdict := "ok"
	switch {
	case peak >= 95:
		verdict = "danger"
	case peak >= 87:
		verdict = "warn"
	}
	return Check{
		Value:   fmt.Sprintf("%.0f °C peak", peak),
		Detail:  fmt.Sprintf("hottest sensor: %s, measured while all cores were loaded for 4s", sensor),
		Method:  "read /sys/class/hwmon/*/temp*_input every 250ms under full load",
		Verdict: verdict,
	}
}

func hottest() (float64, string) {
	inputs, _ := filepath.Glob("/sys/class/hwmon/hwmon*/temp*_input")
	best, name := 0.0, ""
	for _, in := range inputs {
		v, ok := readFloat(in)
		if !ok {
			continue
		}
		c := v / 1000
		if c <= 0 || c > 150 {
			continue
		}
		if c > best {
			best = c
			label := strings.TrimSuffix(in, "_input") + "_label"
			chip := filepath.Join(filepath.Dir(in), "name")
			name = strings.TrimSpace(readString(chip) + " " + readString(label))
		}
	}
	return best, strings.TrimSpace(name)
}

// memoryCheck measures copy bandwidth over a buffer far larger than cache.
func memoryCheck(ctx context.Context) Check {
	const size = 192 << 20 // 192 MB, well past any L3
	defer runtime.GC()

	src := make([]byte, size)
	dst := make([]byte, size)
	// Touch every page of both buffers first: otherwise the run measures the
	// kernel faulting in fresh pages rather than memory bandwidth.
	for i := 0; i < size; i += 4096 {
		src[i] = byte(i)
		dst[i] = byte(i)
	}
	copy(dst, src)

	start := time.Now()
	deadline := start.Add(1500 * time.Millisecond)
	var moved int64
	for time.Now().Before(deadline) && ctx.Err() == nil {
		copy(dst, src)
		moved += size
	}
	gbps := float64(moved) / time.Since(start).Seconds() / (1 << 30)
	return Check{
		Value:   fmt.Sprintf("%.1f GB/s", gbps),
		Detail:  fmt.Sprintf("%d MB buffer copied repeatedly for 1.5s, after both buffers were faulted in", size>>20),
		Method:  "sequential copy of a 192 MB buffer, bytes moved divided by elapsed time",
		Verdict: "info",
	}
}

// diskCheck writes a real file, forces it to the platter, drops the page cache
// hint and reads it back. Both figures are end-to-end.
func diskCheck(ctx context.Context) Check {
	const size = 128 << 20
	dir, err := os.UserCacheDir()
	if err != nil {
		dir = os.TempDir()
	}
	dir = filepath.Join(dir, "deck")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Check{Verdict: "skipped", Err: err.Error(), Detail: "could not create a scratch directory"}
	}
	path := filepath.Join(dir, "healthcheck.bin")
	defer os.Remove(path)

	buf := make([]byte, 8<<20)
	rnd := rand.New(rand.NewSource(1))
	rnd.Read(buf) // incompressible, so transparent compression cannot flatter the result

	f, err := os.Create(path)
	if err != nil {
		return Check{Verdict: "skipped", Err: err.Error(), Detail: "could not write to " + dir}
	}
	start := time.Now()
	for written := 0; written < size; written += len(buf) {
		if _, err := f.Write(buf); err != nil {
			f.Close()
			return Check{Verdict: "danger", Err: err.Error(), Detail: "write failed partway through"}
		}
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return Check{Verdict: "warn", Err: err.Error(), Detail: "the drive did not confirm the flush"}
	}
	writeSecs := time.Since(start).Seconds()
	f.Close()

	dropCache(path)

	start = time.Now()
	in, err := os.Open(path)
	if err != nil {
		return Check{Verdict: "danger", Err: err.Error()}
	}
	read := make([]byte, 8<<20)
	total := 0
	for {
		n, err := in.Read(read)
		total += n
		if err != nil {
			break
		}
		if ctx.Err() != nil {
			break
		}
	}
	readSecs := time.Since(start).Seconds()
	in.Close()

	writeMB := float64(size) / (1 << 20) / writeSecs
	readMB := float64(total) / (1 << 20) / readSecs
	verdict := "ok"
	if writeMB < 40 || readMB < 60 {
		verdict = "warn"
	}
	return Check{
		Value:   fmt.Sprintf("%.0f MB/s read · %.0f MB/s write", readMB, writeMB),
		Detail:  fmt.Sprintf("128 MB of incompressible data written to %s, flushed, then read back", dir),
		Method:  "write 128 MB + fsync, drop the page cache for the file, read it back",
		Verdict: verdict,
	}
}

// dropCache asks the kernel to forget the file so the read is not served from
// RAM. It is advisory: POSIX_FADV_DONTNEED is a hint.
func dropCache(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	fadviseDontNeed(f)
}

// batteryCheck samples the charge counter over a real interval instead of
// trusting the firmware's own "time remaining" estimate. The reading itself
// comes from the platform inventory, so it works wherever deck runs.
func batteryCheck(ctx context.Context) Check {
	before := hwinfo.ReadBattery()
	if !before.Present {
		return Check{Verdict: "skipped", Detail: before.Note, Method: "read the platform battery counters"}
	}

	wear, verdict := "", "info"
	if before.HealthKnown {
		wear = fmt.Sprintf("%.0f%% of design capacity (%.1f Wh of %.1f Wh)",
			before.Health, before.FullWh, before.DesignWh)
		switch {
		case before.Health < 60:
			verdict = "danger"
		case before.Health < 80:
			verdict = "warn"
		default:
			verdict = "ok"
		}
	}
	if before.CyclesKnown {
		wear += fmt.Sprintf(" · %d charge cycles", before.Cycles)
	}

	// Ten seconds is long enough for the counter to move on most firmware
	// without making the check tedious.
	const window = 10 * time.Second
	startAt := time.Now()
	select {
	case <-ctx.Done():
		return Check{Verdict: "skipped", Detail: "cancelled"}
	case <-time.After(window):
	}
	after := hwinfo.ReadBattery()
	elapsed := time.Since(startAt).Hours()

	measured := ""
	if before.NowWh > 0 && after.NowWh > 0 && elapsed > 0 {
		rate := (before.NowWh - after.NowWh) / elapsed // watts, positive while discharging
		switch {
		case math.Abs(rate) < 0.5:
			// Some firmware updates the counter too slowly to measure this way;
			// fall back to the instantaneous reading and say so.
			if after.PowerW > 0 {
				measured = fmt.Sprintf("%s at %.1f W (instantaneous reading; the charge counter did not move over 10s)",
					strings.ToLower(after.Status), after.PowerW)
			} else {
				measured = fmt.Sprintf("%s — the charge counter did not move over the 10s sample",
					strings.ToLower(after.Status))
			}
		case rate > 0:
			measured = fmt.Sprintf("drawing %.1f W", rate)
			if before.FullWh > 0 {
				measured += fmt.Sprintf(" — %.1f h from a full charge at this rate", before.FullWh/rate)
			}
		default:
			measured = fmt.Sprintf("charging at %.1f W", -rate)
			if before.FullWh > after.NowWh {
				measured += fmt.Sprintf(" — %.1f h to full at this rate", (before.FullWh-after.NowWh)/-rate)
			}
		}
	}

	detail := wear
	if measured != "" {
		if detail != "" {
			detail += " · "
		}
		detail += measured
	}
	value := "capacity unknown"
	if before.HealthKnown {
		value = fmt.Sprintf("%.0f%% health", before.Health)
	}
	return Check{
		Value: value, Detail: detail, Verdict: verdict,
		Method: "compare the measured full charge against the design capacity, then sample the charge counter over 10s",
	}
}

// smartCheck surfaces the drive's own lifetime counters. Without elevated
// rights the kernel will not pass the command through, and that is reported
// rather than skipped silently.
func smartCheck(ctx context.Context) Check {
	bin, err := exec.LookPath("smartctl")
	if err != nil {
		return Check{
			Verdict: "skipped",
			Detail:  "smartctl is not installed — install smartmontools to read drive lifetime counters",
			Method:  "smartctl -A /dev/<disk>",
		}
	}
	device := firstDisk()
	if device == "" {
		return Check{Verdict: "skipped", Detail: "no physical disk found"}
	}
	out, err := exec.CommandContext(ctx, bin, "-H", "-A", device).CombinedOutput()
	text := string(out)
	if strings.Contains(text, "Permission denied") || strings.Contains(text, "requires root") {
		return Check{
			Verdict: "skipped", Detail: "reading SMART data needs root: sudo smartctl -H -A " + device,
			Method: "smartctl -H -A " + device,
		}
	}
	if err != nil && text == "" {
		return Check{Verdict: "skipped", Err: err.Error(), Method: "smartctl -H -A " + device}
	}

	health := "unknown"
	if strings.Contains(text, "PASSED") {
		health = "PASSED"
	} else if strings.Contains(text, "FAILED") {
		health = "FAILED"
	}
	var extras []string
	for _, line := range strings.Split(text, "\n") {
		for _, key := range []string{"Power_On_Hours", "Power On Hours", "Percentage Used",
			"Reallocated_Sector_Ct", "Media_Wearout_Indicator", "Power_Cycle_Count", "Data Units Written"} {
			if strings.Contains(line, key) {
				extras = append(extras, strings.Join(strings.Fields(line), " "))
				break
			}
		}
	}
	verdict := "ok"
	if health == "FAILED" {
		verdict = "danger"
	} else if health == "unknown" {
		verdict = "info"
	}
	return Check{
		Value:   health,
		Detail:  strings.Join(trim(extras, 4), " · "),
		Method:  "smartctl -H -A " + device,
		Verdict: verdict,
	}
}

func firstDisk() string {
	devices, _ := filepath.Glob("/sys/block/*")
	for _, d := range devices {
		name := filepath.Base(d)
		if strings.HasPrefix(name, "nvme") || strings.HasPrefix(name, "sd") {
			return "/dev/" + name
		}
	}
	return ""
}

func trim(list []string, n int) []string {
	if len(list) > n {
		return list[:n]
	}
	return list
}

func readString(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func readFloat(path string) (float64, bool) {
	s := readString(path)
	if s == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(s, 64)
	return v, err == nil
}
