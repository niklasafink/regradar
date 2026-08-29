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

/usr/bin/python3 -m regradar run all >> "$LOG" 2>&1
/usr/bin/python3 -m regradar big4 >> "$LOG" 2>&1 || echo "big4 fehlgeschlagen (weiter)" >> "$LOG"
/usr/bin/python3 -m regradar export-web >> "$LOG" 2>&1
# Lücken-Report: Big4-Artikel ohne gescrapte Primärquelle (max. 1 Mail/Tag).
# Läuft NACH export-web, damit big4_matches aktuell sind.
/usr/bin/python3 -m regradar gap-report >> "$LOG" 2>&1 || echo "gap-report fehlgeschlagen (weiter)" >> "$LOG"

# Nur committen/pushen, wenn sich live.json inhaltlich geändert hat
# (mehr als nur der generated_at-Zeitstempel). Vercel deployt dann automatisch
# via Git-Integration (Root Directory "web").
cd ..
if git diff -U0 -- web/lib/live.json | grep '^[+-][^+-]' | grep -v generated_at | grep -q .; then
  echo "live.json geändert, committe & pushe…" >> "$LOG"
  git add web/lib/live.json web/lib/sources.json
  git commit -m "Auto-Update: live.json ($(date '+%Y-%m-%d %H:%M'))" >> "$LOG" 2>&1
  git push origin main >> "$LOG" 2>&1
else
  git checkout -- web/lib/live.json web/lib/sources.json 2>/dev/null || true
  echo "live.json unverändert, kein Deploy." >> "$LOG"
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S') Lauf fertig ===" >> "$LOG"
