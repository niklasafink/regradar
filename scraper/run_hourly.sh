#!/bin/zsh
# Stündlicher Scraper-Lauf: run all + big4 + export-web + Auto-Push + Vercel-Deploy
# Wird von launchd aufgerufen (com.regradar.scraper), Logs unter scraper/logs/
# Secrets (DIP_API_KEY, OPENROUTER_API_KEY) liegen in scraper/.env (gitignoriert)
set -e
export PATH="/usr/local/bin:/usr/bin:/bin"

cd "$(dirname "$0")"
REPO="$(dirname "$PWD")"
mkdir -p logs

echo "=== Lauf gestartet: $(date '+%Y-%m-%d %H:%M:%S') ==="
/usr/bin/python3 -m regradar run all
/usr/bin/python3 -m regradar big4
/usr/bin/python3 -m regradar export-web

# Auto-Push + Deploy: nur wenn sich live.json inhaltlich geändert hat
# (mehr als nur der generated_at-Zeitstempel)
cd "$REPO"
if git diff -U0 -- web/lib/live.json | grep '^[+-][^+-]' | grep -v generated_at | grep -q .; then
  echo "live.json inhaltlich geändert → Commit, Push, Deploy"
  git add web/lib/live.json web/lib/sources.json
  git commit -m "Auto-Update: live.json ($(date '+%Y-%m-%d %H:%M'))"
  git push origin main
  cd web
  npx vercel --prod --yes
  echo "Deploy abgeschlossen"
else
  git checkout -- web/lib/live.json web/lib/sources.json 2>/dev/null || true
  echo "Keine inhaltlichen Änderungen in live.json → kein Deploy"
fi
echo "=== Lauf beendet:   $(date '+%Y-%m-%d %H:%M:%S') ==="
