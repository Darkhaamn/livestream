package vods

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// VOD describes a single recorded stream segment on disk.
type VOD struct {
	ID        string    `json:"id"`
	Path      string    `json:"path"`
	StartedAt time.Time `json:"startedAt"`
	ModTime   time.Time `json:"-"`
	SizeBytes int64     `json:"sizeBytes"`
	URL       string    `json:"url"`
}

// Service lists and serves recordings written by MediaMTX under recordingsDir
// with the layout <recordingsDir>/<streamPath>/YYYY/MM/DD/HH-MM-SS.mp4.
type Service struct {
	recordingsDir string
}

func New(recordingsDir string) *Service {
	return &Service{recordingsDir: recordingsDir}
}

// List returns all finished recordings, newest first. If streamPath is
// non-empty, only recordings under that stream path are returned.
func (s *Service) List(streamPath string) ([]VOD, error) {
	root := s.recordingsDir
	if streamPath != "" {
		streamPath = strings.Trim(filepath.ToSlash(filepath.Clean(streamPath)), "/")
		if streamPath == "." || strings.Contains(streamPath, "..") {
			return []VOD{}, nil
		}
		root = filepath.Join(root, filepath.FromSlash(streamPath))
	}

	vods := make([]VOD, 0)
	now := time.Now()

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if d == nil || d.IsDir() {
				return nil
			}
			return nil
		}
		if d.IsDir() || strings.HasPrefix(d.Name(), ".") {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(d.Name()))
		if ext != "" && ext != ".mp4" && ext != ".m4s" {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		// Skip empty files and files likely still being written.
		if info.Size() == 0 || now.Sub(info.ModTime()) < 30*time.Second {
			return nil
		}

		rel, err := filepath.Rel(s.recordingsDir, path)
		if err != nil {
			return nil
		}
		id := filepath.ToSlash(rel)

		segments := strings.Split(id, "/")
		if len(segments) < 5 {
			// Need at least <stream>/YYYY/MM/DD/file.mp4.
			return nil
		}
		stream := strings.Join(segments[:len(segments)-4], "/")
		year := segments[len(segments)-4]
		month := segments[len(segments)-3]
		day := segments[len(segments)-2]
		name := strings.TrimSuffix(segments[len(segments)-1], filepath.Ext(segments[len(segments)-1]))

		startedAt, err := time.ParseInLocation("2006/01/02 15-04-05", year+"/"+month+"/"+day+" "+name, time.UTC)
		if err != nil {
			startedAt = info.ModTime()
		}

		vods = append(vods, VOD{
			ID:        id,
			Path:      stream,
			StartedAt: startedAt,
			ModTime:   info.ModTime(),
			SizeBytes: info.Size(),
			URL:       "/api/vods/file/" + id,
		})
		return nil
	})
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []VOD{}, nil
		}
		return nil, err
	}

	sort.Slice(vods, func(i, j int) bool {
		return vods[i].StartedAt.After(vods[j].StartedAt)
	})
	return vods, nil
}

// LatestSince returns the newest finished recording for streamPath created
// during the current broadcast. Matches by file mod time or parsed start time.
func (s *Service) LatestSince(streamPath string, since time.Time) (*VOD, error) {
	list, err := s.List(streamPath)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, nil
	}

	cutoff := since.Add(-2 * time.Minute)
	for i := range list {
		if !list[i].ModTime.Before(cutoff) || !list[i].StartedAt.Before(cutoff) {
			return &list[i], nil
		}
	}

	// Fallback: newest file touched recently (just finalized after stream end).
	if time.Since(list[0].ModTime) < 15*time.Minute {
		return &list[0], nil
	}
	return nil, nil
}

// Open validates the given VOD id and returns the absolute path to the
// recording file, protecting against path traversal.
func (s *Service) Open(id string) (string, error) {
	id = filepath.ToSlash(filepath.Clean(id))
	if id == "" || id == "." || strings.Contains(id, "..") || strings.HasPrefix(id, "/") {
		return "", errors.New("invalid vod id")
	}

	absRoot, err := filepath.Abs(s.recordingsDir)
	if err != nil {
		return "", err
	}
	absPath, err := filepath.Abs(filepath.Join(absRoot, filepath.FromSlash(id)))
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(absPath, absRoot+string(filepath.Separator)) {
		return "", errors.New("invalid vod id")
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("invalid vod id")
	}
	return absPath, nil
}
