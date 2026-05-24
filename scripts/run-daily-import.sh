#!/bin/bash
# Daily recipe import — chips away at pending recipes until the list is empty.
# Loaded by ~/Library/LaunchAgents/com.recipefork.import.plist (runs daily at 09:00).

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="/Users/jason/Library/Mobile Documents/com~apple~CloudDocs/Cowork OS/Build & Learn/Recipe Fork"
LOG_DIR="$REPO/scripts/daily-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/import-$(date +%Y-%m-%d).log"

cd "$REPO"

# If no URLs remain unprocessed, exit early (no work to do).
if [ -f scripts/import-recipes.pending.txt ] && [ ! -s scripts/import-recipes.pending.txt ]; then
  echo "$(date): Pending list empty. Nothing to do." >> "$LOG"
  exit 0
fi

# Reset pending file at start of each run — script will repopulate if rate-limited.
rm -f scripts/import-recipes.pending.txt

{
  echo "=== Run: $(date) ==="
  npx tsx scripts/import-recipes.ts
  echo "=== End: $(date) ==="
} >> "$LOG" 2>&1
