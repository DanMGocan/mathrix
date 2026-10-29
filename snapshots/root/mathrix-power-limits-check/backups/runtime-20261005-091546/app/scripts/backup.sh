#!/usr/bin/env bash
set -euo pipefail
backup_dir="${1:-/root/mathrix/backups}"
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/mathrix-$(date -u +%Y%m%d-%H%M%S).dump"
runuser -u postgres -- pg_dump --format=custom mathrix > "$backup_file"
chmod 600 "$backup_file"
printf 'Backup created: %s\n' "$backup_file"
