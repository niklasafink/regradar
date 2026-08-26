#!/bin/zsh
# Stündlicher Scraper-Lauf: run all + big4 + export-web
# Wird von launchd aufgerufen (com.regradar.scraper), Logs unter scraper/logs/
set -e
cd "$(dirname "$0")"
mkdir -p logs

echo "=== Lauf gestartet: $(date '+%Y-%m-%d %H:%M:%S') ==="
python3 -m regradar run all
python3 -m regradar big4
python3 -m regradar export-web
echo "=== Lauf beendet:   $(date '+%Y-%m-%d %H:%M:%S') ==="
