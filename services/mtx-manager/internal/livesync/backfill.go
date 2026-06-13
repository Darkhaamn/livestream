package livesync

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/thumbnails"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/vods"
)

// BackfillRecordings links existing files on disk to sessions missing recording_path.
func BackfillRecordings(ctx context.Context, vodSvc *vods.Service, thumbSvc *thumbnails.Service, apiBase string) {
	if vodSvc == nil {
		return
	}
	list, err := vodSvc.List("")
	if err != nil {
		log.Printf("livesync backfill: list recordings: %v", err)
		return
	}
	if len(list) == 0 {
		return
	}

	syncer := &Syncer{
		apiBase: strings.TrimRight(apiBase, "/"),
		vods:    vodSvc,
		thumbs:  thumbSvc,
		http:    &http.Client{Timeout: 5 * time.Second},
	}

	// Oldest first so time-based session matching stays stable.
	for i := len(list) - 1; i >= 0; i-- {
		rec := list[i]
		syncer.ensureVodThumbnail(rec.ID)
		reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		syncer.notify(reqCtx, "recording-attached", rec.Path, rec.ID)
		cancel()
	}
	log.Printf("livesync backfill: submitted %d recordings", len(list))
}
