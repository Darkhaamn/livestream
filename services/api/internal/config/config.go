package config

import (
	"os"
	"strings"
)

type Config struct {
	ServerAddr    string
	DatabaseURL   string
	RedisURL      string
	JWTSecret     string
	CORSOrigins   []string
	MediaMTXURL   string
}

func Load() Config {
	return Config{
		ServerAddr:  getEnv("SERVER_ADDR", ":8081"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://livestream:livestream_secret@localhost:5432/livestream"),
		RedisURL:    getEnv("REDIS_URL", "redis://:redis_secret@localhost:6379/0"),
		JWTSecret:   getEnv("JWT_SECRET", "change-me-in-production-secret-32chars"),
		CORSOrigins: strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000"), ","),
		MediaMTXURL: getEnv("MEDIAMTX_URL", "http://localhost:9997"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
