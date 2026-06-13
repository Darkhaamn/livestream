package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/config"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/vods"
)

func TestResolveRecordingsFromCmdDir(t *testing.T) {
	repoRoot := filepath.Clean(filepath.Join("..", "..", "..", ".."))
	recordings := filepath.Join(repoRoot, "recordings")
	if st, err := os.Stat(recordings); err != nil || !st.IsDir() {
		t.Skip("repo recordings dir not present")
	}

	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	cmdDir := filepath.Join(repoRoot, "services", "mtx-manager", "cmd", "mtx-manager")
	if err := os.Chdir(cmdDir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })

	t.Setenv("RECORDINGS_DIR", "")
	cfg := config.Load()
	if !strings.HasSuffix(cfg.RecordingsDir, "recordings") {
		t.Fatalf("recordings dir = %q", cfg.RecordingsDir)
	}

	svc := vods.New(cfg.RecordingsDir)
	list, err := svc.List("live/sda")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) == 0 {
		t.Fatal("expected recordings for live/sda")
	}
}
