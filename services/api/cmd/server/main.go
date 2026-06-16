package main

import (
	"log"
	"os"

	"home-finance/services/api/internal/httpapi"
	"home-finance/services/api/internal/store"
)

func main() {
	dbPath := os.Getenv("HOME_FINANCE_DB_PATH")
	if dbPath == "" {
		dbPath = "home-finance.db"
	}

	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	server := httpapi.NewServer(db, httpapi.Config{
		AdminPassword: os.Getenv("HOME_FINANCE_ADMIN_PASSWORD"),
		DBPath:        dbPath,
	})
	if err := server.Run(":8080"); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
