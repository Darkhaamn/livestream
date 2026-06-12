package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/auth"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/cache"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/config"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/db"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/middleware"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/mtxhook"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/user"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	gormDB, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}

	if err := db.Migrate(gormDB); err != nil {
		log.Fatalf("db migrate: %v", err)
	}
	log.Println("database migrations applied")

	redisCache, err := cache.New(cfg.RedisURL)
	if err != nil {
		log.Printf("redis unavailable: %v (continuing without cache)", err)
	}
	_ = redisCache

	authSvc := auth.NewService(gormDB, cfg.JWTSecret)
	authHandler := auth.NewHandler(authSvc)
	userRepo := user.NewRepository(gormDB)
	userHandler := user.NewHandler(userRepo, cfg.JWTSecret)
	mtxHandler := mtxhook.NewHandler(gormDB)

	mode := os.Getenv("GIN_MODE")
	if mode == "" {
		mode = gin.DebugMode
	}
	gin.SetMode(mode)

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(middleware.CORS(cfg.CORSOrigins))

	v1 := r.Group("/api/v1")
	{
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/refresh", authHandler.Refresh)
			authGroup.POST("/logout", authHandler.Logout)
		}

		usersGroup := v1.Group("/users")
		{
			// GET /users/:username also serves /users/me (handled inside GetUser)
			// to avoid gin's wildcard/static route conflict.
			usersGroup.GET("/:username", userHandler.GetUser)
			usersGroup.GET("/:username/sessions", userHandler.GetSessions)

			authed := usersGroup.Group("")
			authed.Use(middleware.Auth(cfg.JWTSecret))
			{
				authed.PUT("/me", userHandler.UpdateMe)
				authed.POST("/me/stream-key", userHandler.RegenerateKey)
			}
		}

		v1.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})
	}

	// Internal MediaMTX webhooks: no auth middleware, outside /api/v1.
	// MediaMTX calls these from localhost only.
	mtx := r.Group("/internal/mtx")
	{
		mtx.POST("/auth", mtxHandler.Auth)
		mtx.POST("/stream-started", mtxHandler.StreamStarted)
		mtx.POST("/stream-stopped", mtxHandler.StreamStopped)
	}

	srv := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("API server listening on %s", cfg.ServerAddr)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutCtx)
	log.Println("API server stopped")
}
