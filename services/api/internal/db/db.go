package db

import (
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/model"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		TranslateError: true,
	})
	if err != nil {
		return nil, fmt.Errorf("gorm open: %w", err)
	}
	return db, nil
}

func Migrate(db *gorm.DB) error {
	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS pgcrypto").Error; err != nil {
		return fmt.Errorf("enable pgcrypto: %w", err)
	}
	if err := db.AutoMigrate(
		&model.User{},
		&model.RefreshToken{},
		&model.Follow{},
		&model.StreamSession{},
		&model.StreamMetricSample{},
	); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}
	return nil
}
