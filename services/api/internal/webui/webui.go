package webui

import "embed"

// Files contains the built web frontend served by the API binary.
//
//go:embed dist/*
var Files embed.FS
