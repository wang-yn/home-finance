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

apk_list=$(mktemp)
trap 'rm -f "$apk_list"' EXIT

for path in "$@"; do
  if [ -d "$path" ]; then
    find "$path" -type f -name '*.apk' >>"$apk_list"
  elif [ -f "$path" ]; then
    printf "%s\n" "$path" >>"$apk_list"
  else
    echo "APK path does not exist: $path" >&2
    exit 2
  fi
done

if [ ! -s "$apk_list" ]; then
  echo "no APK files found" >&2
  exit 2
fi

while IFS= read -r apk; do
  aapt dump badging "$apk" | grep -F "package: name='com.homefinance.app.debug'" >/dev/null
done <"$apk_list"
