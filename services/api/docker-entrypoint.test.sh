#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
entrypoint="$script_dir/docker-entrypoint.sh"

grep -F 'chown -R homefinance:homefinance /data' "$entrypoint" >/dev/null
grep -F 'exec su-exec homefinance "$@"' "$entrypoint" >/dev/null

