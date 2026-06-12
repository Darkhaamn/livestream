package thumbnails

import (
	"context"
	"time"
)

type PathLister func() []string

func (s *Service) RunWorker(ctx context.Context, listPaths PathLister) {
	if listPaths == nil {
		return
	}

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	s.tick(listPaths)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(listPaths)
		}
	}
}

func (s *Service) tick(listPaths PathLister) {
	for _, name := range listPaths() {
		go s.Refresh(name)
	}
}
