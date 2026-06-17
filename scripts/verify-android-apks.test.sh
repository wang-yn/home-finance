#!/bin/sh
set -eu

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

bin_dir="$tmp_dir/bin"
apk_dir="$tmp_dir/outputs/apk/debug"
mkdir -p "$bin_dir" "$apk_dir"

cat >"$bin_dir/aapt" <<'SCRIPT'
#!/bin/sh
set -eu

if [ "$1" != "dump" ] || [ "$2" != "badging" ]; then
  exit 2
fi
if [ ! -f "$3" ]; then
  exit 3
fi
printf "%s\n" "package: name='com.homefinance.app.debug' versionCode='1' versionName='0.1.0'"
SCRIPT
chmod +x "$bin_dir/aapt"

touch "$apk_dir/app-debug.apk"

PATH="$bin_dir:$PATH" sh scripts/verify-android-apks.sh "$tmp_dir/outputs/apk"
