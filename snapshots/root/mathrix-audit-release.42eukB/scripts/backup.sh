#!/usr/bin/env bash
set -euo pipefail
backup_dir="${1:-/root/mathrix/backups}"
umask 077
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/mathrix-$(date -u +%Y%m%d-%H%M%S).dump"
runuser -u postgres -- pg_dump --format=custom mathrix > "$backup_file"
chmod 600 "$backup_file"
design_state="${STATE_DIR:-/var/lib/mathrix}"
if [ -d "$design_state/design-files" ]; then
  tar --exclude='design-files/.upload-*' -czf "${backup_file%.dump}-design-files.tar.gz" -C "$design_state" design-files
  printf 'Design files backup: %s\n' "${backup_file%.dump}-design-files.tar.gz"
fi
printf 'Backup created: %s\n' "$backup_file"
