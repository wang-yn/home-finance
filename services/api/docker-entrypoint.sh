#!/bin/sh
set -eu

mkdir -p /data
chown -R homefinance:homefinance /data

exec su-exec homefinance "$@"
