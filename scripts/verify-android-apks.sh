#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <apk>..." >&2
  exit 2
fi

if ! command -v aapt >/dev/null 2>&1; then
  echo "aapt is required to verify APK package metadata" >&2
  exit 2
fi

for apk in "$@"; do
  aapt dump badging "$apk" | grep -F "package: name='com.homefinance.app.debug'" >/dev/null
done
