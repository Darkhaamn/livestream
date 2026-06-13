package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/backplane"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/config"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/hub"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/server"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/store"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if mode := os.Getenv("GIN_MODE"); mode != "" {
		gin.SetMode(mode)
	} else {
		gin.SetMode(gin.DebugMode)
	}

	st, err := store.New(cfg.DatabaseURL)
	if err != nil {
		log.Printf("chat store unavailable: %v (continuing without history)", err)
		st = nil
	} else {
		log.Println("chat history store ready")
	}

	// Redis backplane lets chat run on many pods (cross-pod fan-out + global
	// presence). Falls back to a single-process local backplane for dev.
	var bp backplane.Backplane
	if rb, err := backplane.NewRedis(cfg.RedisURL); err != nil {
		log.Printf("redis backplane unavailable: %v (falling back to single-node local)", err)
		bp = backplane.NewLocal()
	} else {
		log.Println("redis chat backplane ready")
		bp = rb
	}
	defer bp.Close()

	h := hub.New(bp)
	srv := server.New(h, bp, st, cfg.JWTSecret, cfg.CORSOrigins)

	r := gin.New()
	r.Use(gin.Recovery())
	srv.Register(r)

	httpSrv := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("Chat server listening on %s", cfg.ServerAddr)
	go func() {
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("chat server: %v", err)
		}
	}()

	<-ctx.Done()
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutCtx)
	log.Println("chat server stopped")
}
