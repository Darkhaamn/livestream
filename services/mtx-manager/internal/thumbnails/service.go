package thumbnails

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var ErrNotFound = errors.New("thumbnail not found")

type cached struct {
	data []byte
	at   time.Time
}

type Service struct {
	rtspBase  string
	hlsBase   string
	dir       string
	interval  time.Duration
	ttl       time.Duration
	mu        sync.RWMutex
	cache     map[string]cached
	ffmpegBin string
}

func New(rtspBase, hlsBase, dir string, interval time.Duration) *Service {
	if interval <= 0 {
		interval = 10 * time.Second
	}
	ffmpegBin, err := exec.LookPath("ffmpeg")
	if err != nil {
		ffmpegBin = ""
	}
	return &Service{
		rtspBase:  strings.TrimRight(rtspBase, "/"),
		hlsBase:   strings.TrimRight(hlsBase, "/"),
		dir:       dir,
		interval:  interval,
		ttl:       interval * 3,
		cache:     make(map[string]cached),
		ffmpegBin: ffmpegBin,
	}
}

func (s *Service) Interval() time.Duration {
	return s.interval
}

func (s *Service) HasFFmpeg() bool {
	return s.ffmpegBin != ""
}

func (s *Service) Get(pathName string) ([]byte, error) {
	s.mu.RLock()
	item, ok := s.cache[pathName]
	s.mu.RUnlock()
	if ok && time.Since(item.at) < s.ttl {
		return item.data, nil
	}

	data, err := s.loadFromDisk(pathName)
	if err == nil {
		s.store(pathName, data)
		return data, nil
	}

	if s.ffmpegBin == "" {
		if ok {
			return item.data, nil
		}
		return nil, ErrNotFound
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	data, err = s.capture(ctx, pathName)
	if err != nil {
		if ok {
			return item.data, nil
		}
		return nil, ErrNotFound
	}
	s.store(pathName, data)
	return data, nil
}

func (s *Service) Refresh(pathName string) {
	if s.ffmpegBin == "" {
		if data, err := s.loadFromDisk(pathName); err == nil {
			s.store(pathName, data)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	data, err := s.capture(ctx, pathName)
	if err != nil {
		log.Printf("thumbnail %q: %v", pathName, err)
		return
	}
	s.store(pathName, data)
}

func (s *Service) store(pathName string, data []byte) {
	s.mu.Lock()
	s.cache[pathName] = cached{data: data, at: time.Now()}
	s.mu.Unlock()
}

func (s *Service) diskPath(pathName string) string {
	safe := strings.ReplaceAll(pathName, "..", "")
	return filepath.Join(s.dir, safe+".jpg")
}

func (s *Service) loadFromDisk(pathName string) ([]byte, error) {
	if s.dir == "" {
		return nil, ErrNotFound
	}
	path := s.diskPath(pathName)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, ErrNotFound
	}
	return data, nil
}

func (s *Service) capture(ctx context.Context, pathName string) ([]byte, error) {
	key := strings.Trim(pathName, "/")
	rtspURL := fmt.Sprintf("%s/%s", s.rtspBase, key)
	hlsURL := fmt.Sprintf("%s/%s/index.m3u8", s.hlsBase, key)

	tryInputs := []string{rtspURL, hlsURL}
	var lastErr error
	for _, input := range tryInputs {
		data, err := s.runFFmpeg(ctx, input)
		if err == nil {
			return data, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func (s *Service) runFFmpeg(ctx context.Context, input string) ([]byte, error) {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
	}
	if strings.HasPrefix(input, "rtsp://") {
		args = append(args, "-rtsp_transport", "tcp")
	}
	args = append(args,
		"-i", input,
		"-frames:v", "1",
		"-f", "image2pipe",
		"-vcodec", "mjpeg",
		"pipe:1",
	)

	cmd := exec.CommandContext(ctx, s.ffmpegBin, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("ffmpeg: %s", msg)
	}
	if stdout.Len() == 0 {
		return nil, errors.New("ffmpeg: empty output")
	}
	return stdout.Bytes(), nil
}

func (s *Service) vodDiskPath(recordingID string) string {
	id := filepath.ToSlash(filepath.Clean(recordingID))
	id = strings.TrimSuffix(id, filepath.Ext(id))
	return filepath.Join(s.dir, "vods", id+".jpg")
}

// EnsureVOD extracts a JPEG thumbnail from a finished recording and caches it on disk.
func (s *Service) EnsureVOD(recordingID, videoAbsPath string) error {
	diskPath := s.vodDiskPath(recordingID)
	if data, err := os.ReadFile(diskPath); err == nil && len(data) > 0 {
		return nil
	}
	if s.ffmpegBin == "" {
		return ErrNotFound
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	data, err := s.captureFromFile(ctx, videoAbsPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(diskPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(diskPath, data, 0o644)
}

// GetVOD returns a cached VOD thumbnail, generating it from the recording if needed.
func (s *Service) GetVOD(recordingID, videoAbsPath string) ([]byte, error) {
	if err := s.EnsureVOD(recordingID, videoAbsPath); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(s.vodDiskPath(recordingID))
	if err != nil || len(data) == 0 {
		return nil, ErrNotFound
	}
	return data, nil
}

func (s *Service) captureFromFile(ctx context.Context, videoPath string) ([]byte, error) {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-ss", "3",
		"-i", videoPath,
		"-frames:v", "1",
		"-f", "image2pipe",
		"-vcodec", "mjpeg",
		"pipe:1",
	}

	cmd := exec.CommandContext(ctx, s.ffmpegBin, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("ffmpeg: %s", msg)
	}
	if stdout.Len() == 0 {
		return nil, errors.New("ffmpeg: empty output")
	}
	return stdout.Bytes(), nil
}
