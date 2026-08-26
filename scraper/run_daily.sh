#!/bin/zsh
# Täglicher Lauf: Quellen crawlen, Big-4-Kommentare, Web-Export und — nur wenn
# sich live.json geändert hat — Production-Deploy auf Vercel. Danach verschickt
# der Vercel-Cron (18:00 MESZ) die neuen Updates per Newsletter.
# Geplant via launchd: ~/Library/LaunchAgents/de.regradar.daily.plist

set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin"

DIR="${0:a:h}"
cd "$DIR"

LOG="$DIR/data/daily.log"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') Lauf startet ===" >> "$LOG"

BEFORE=$(shasum ../web/lib/live.json 2>/dev/null | cut -d' ' -f1 || true)

/usr/bin/python3 -m regradar run all >> "$LOG" 2>&1
/usr/bin/python3 -m regradar big4 >> "$LOG" 2>&1 || echo "big4 fehlgeschlagen (weiter)" >> "$LOG"
/usr/bin/python3 -m regradar export-web >> "$LOG" 2>&1

AFTER=$(shasum ../web/lib/live.json | cut -d' ' -f1)

if [[ "$BEFORE" == "$AFTER" ]]; then
  echo "live.json unverändert, kein Deploy." >> "$LOG"
else
  echo "live.json geändert, deploye…" >> "$LOG"
  cd ../web
  npx vercel deploy --prod --yes >> "$LOG" 2>&1
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S') Lauf fertig ===" >> "$LOG"
