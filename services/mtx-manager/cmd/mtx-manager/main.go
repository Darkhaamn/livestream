package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/api"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/config"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/livesync"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/mediamtx"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/presence"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/thumbnails"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/vods"
)

func main() {
	var (
		watch    = flag.Bool("watch", false, "poll and print stream status")
		interval = flag.Duration("interval", 3*time.Second, "watch refresh interval")
		once     = flag.Bool("once", false, "print status once and exit")
	)
	flag.Parse()

	cfg := config.Load()
	client := mediamtx.NewClient(cfg.MediaMTXBase(), cfg.MediaMTXUsername, cfg.MediaMTXPassword)

	switch {
	case *once || *watch:
		if *watch {
			ticker := time.NewTicker(*interval)
			defer ticker.Stop()
			for {
				printDashboard(client)
				<-ticker.C
				fmt.Println()
			}
		}
		printDashboard(client)
		return
	default:
		startServer(cfg, client)
	}
}

func startServer(cfg config.Config, client *mediamtx.Client) {
	thumbInterval, err := time.ParseDuration(cfg.ThumbnailInterval)
	if err != nil {
		thumbInterval = 10 * time.Second
	}

	thumbSvc := thumbnails.New(
		cfg.RTSPPlaybackURL,
		cfg.HLSPlaybackURL,
		cfg.ThumbnailDir,
		thumbInterval,
	)

	vodSvc := vods.New(cfg.RecordingsDir)

	mode := os.Getenv("GIN_MODE")
	if mode == "" {
		mode = gin.DebugMode
	}
	gin.SetMode(mode)

	presenceSvc := newPresence(cfg)

	srv := api.New(
		client,
		thumbSvc,
		vodSvc,
		presenceSvc,
		api.ParseCORSOrigins(cfg.CORSOrigins),
		cfg.RTMPIngestURL,
		cfg.HLSPlaybackURL,
		cfg.WHIPIngestURL,
		cfg.WebRTCPlaybackURL,
	)
	httpServer := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("MediaMTX manager listening on %s (%s)", cfg.ServerAddr, cfg)
	log.Printf("recordings dir: %s", cfg.RecordingsDir)
	log.Printf("thumbnails dir: %s", cfg.ThumbnailDir)
	if thumbSvc.HasFFmpeg() {
		log.Printf("thumbnails: ffmpeg capture enabled (interval %s)", thumbInterval)
	} else {
		log.Printf("thumbnails: ffmpeg not found — using %s if mediamtx writes snapshots", cfg.ThumbnailDir)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go thumbSvc.RunWorker(ctx, srv.LivePathNames)

	syncInterval, err := time.ParseDuration(cfg.LiveSyncInterval)
	if err != nil {
		syncInterval = 3 * time.Second
	}
	metricsInterval, err := time.ParseDuration(cfg.MetricsSampleInterval)
	if err != nil {
		metricsInterval = 5 * time.Second
	}
	go livesync.New(client, cfg.APIURL, vodSvc, thumbSvc, syncInterval, metricsInterval).Run(ctx)
	log.Printf("livesync: watching MediaMTX → %s (interval %s, metrics %s)", cfg.APIURL, syncInterval, metricsInterval)

	go func() {
		time.Sleep(2 * time.Second)
		livesync.BackfillRecordings(ctx, vodSvc, thumbSvc, cfg.APIURL)
	}()

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
	log.Println("shutdown complete")
}

// newPresence builds the viewer presence backend. It prefers Redis (correct
// across multiple pods, self-heals missed leaves) and gracefully falls back to
// the in-process tracker when Redis is unavailable so local dev still works.
func newPresence(cfg config.Config) presence.Service {
	rdb, err := presence.NewRedis(context.Background(), cfg.RedisURL)
	if err != nil {
		log.Printf("presence: redis unavailable (%v) — falling back to in-memory single-node tracker", err)
		return presence.NewMemory()
	}
	log.Printf("presence: using redis backend (%s)", cfg.RedisURL)
	return rdb
}

func printDashboard(client *mediamtx.Client) {
	dashboard, err := client.Dashboard()
	if err != nil {
		log.Fatalf("dashboard: %v", err)
	}

	fmt.Printf("MediaMTX %s | updated %s\n", dashboard.Server.Version, dashboard.UpdatedAt)
	fmt.Printf("Paths: %d\n\n", len(dashboard.Paths))

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "PATH\tONLINE\tIN (Mbps)\tOUT (Mbps)\tMEMBERS\tSOURCE")
	for _, p := range dashboard.Paths {
		source := "-"
		if p.Source != nil {
			source = p.Source.Type
		}
		fmt.Fprintf(w, "%s\t%v\t%.2f\t%.2f\t%d\t%s\n",
			p.Name,
			p.Online,
			p.Bandwidth.InboundMbps,
			p.Bandwidth.OutboundMbps,
			len(p.Members),
			source,
		)
	}
	_ = w.Flush()

	for _, p := range dashboard.Paths {
		if len(p.Members) == 0 {
			continue
		}
		fmt.Printf("\nMembers for %s:\n", p.Name)
		mw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(mw, "TYPE\tSTATE\tREMOTE\tUSER\tUSER AGENT\tID")
		for _, m := range p.Members {
			user := m.User
			if user == "" {
				user = m.Query
			}
			fmt.Fprintf(mw, "%s\t%s\t%s\t%s\t%s\t%s\n", m.Type, m.State, m.RemoteAddr, user, m.UserAgent, m.ID)
		}
		_ = mw.Flush()
	}
}
