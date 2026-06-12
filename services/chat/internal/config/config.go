package config

import (
	"os"
	"strings"
)

type Config struct {
	ServerAddr  string
	JWTSecret   string
	DatabaseURL string
	CORSOrigins []string
}

func Load() Config {
	return Config{
		ServerAddr:  getEnv("CHAT_ADDR", ":8082"),
		JWTSecret:   getEnv("JWT_SECRET", "change-me-in-production-secret-32chars"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://livestream:livestream_secret@localhost:5432/livestream"),
		CORSOrigins: strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000"), ","),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
