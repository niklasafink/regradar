#!/bin/zsh
# Stündlicher Scraper-Lauf: run all + big4 + dedup + export-web + gap-report +
# Auto-Push + Vercel-Deploy; am Ende Herzschlag an die Scraper-Überwachung
# (web/lib/health.ts). Wird von launchd aufgerufen (com.regradar.scraper),
# Logs unter scraper/logs/. Secrets (DIP_API_KEY, OPENROUTER_API_KEY,
# HEALTH_SECRET) liegen in scraper/.env (gitignoriert).
#
# Kein `set -e`: Jeder Schritt wird einzeln erfasst (ok/failed/skipped) und
# gemeldet; ein Absturz im Crawl blockiert nicht mehr den Export (02.–05.09.
# 2026: KeyError bei einer Quelle → drei Tage ohne Export/Deploy, unbemerkt).
set -u
export PATH="/usr/local/bin:/usr/bin:/bin"

cd "$(dirname "$0")"
SCRAPER="$PWD"
REPO="$(dirname "$PWD")"
mkdir -p logs data

# Lauf-Sperre: launchd-Lauf und Reparatur-Agent (repair_agent.py) dürfen nicht
# parallel laufen (SQLite-Locks, doppelte Commits). Verwaiste Sperren (>2 h)
# werden entfernt.
LOCK="$SCRAPER/data/.run.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    echo "Verwaiste Sperre entfernt: $LOCK"
    rm -rf "$LOCK"; mkdir "$LOCK" || exit 1
  else
    echo "=== Lauf übersprungen $(date '+%Y-%m-%d %H:%M:%S'): anderer Lauf aktiv (PID $(cat "$LOCK/pid" 2>/dev/null)) ==="
    exit 0
  fi
fi
echo $$ > "$LOCK/pid"
STARTED="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
typeset -a STEPS
STEPS=()
RC=0
EXPORT_OK=0

finish() {
  local rc=$?
  cd "$SCRAPER"
  rm -rf "$LOCK"
  /usr/bin/python3 -m regradar heartbeat "${STEPS[@]}" --exit=$rc --started="$STARTED" \
    || echo "heartbeat fehlgeschlagen (ignoriert)"
  echo "=== Lauf beendet:   $(date '+%Y-%m-%d %H:%M:%S') (Exit $rc) ==="
}
trap finish EXIT

# step <name> <kommando…>: ausführen, Ergebnis als ok/failed merken
step() {
  local name="$1"; shift
  if "$@"; then
    STEPS+=("--step=$name=ok"); return 0
  else
    STEPS+=("--step=$name=failed"); echo "Schritt $name fehlgeschlagen (weiter)"; return 1
  fi
}

echo "=== Lauf gestartet: $(date '+%Y-%m-%d %H:%M:%S') ==="
step crawl /usr/bin/python3 -m regradar run all || RC=1
step big4  /usr/bin/python3 -m regradar big4
# Dubletten (Joint Releases über mehrere Feeds, Doppel-Posts) unterdrücken,
# bevor der Export läuft; unsichere Fälle meldet die Gap-Report-Mail.
step dedup /usr/bin/python3 -m regradar dedup
if step export /usr/bin/python3 -m regradar export-web; then EXPORT_OK=1; else RC=1; fi
# Lücken-Report: Big4-Artikel ohne gescrapte Primärquelle. Verschickt intern
# max. eine Mail pro Kalendertag (Tabelle big4_gap_runs).
/usr/bin/python3 -m regradar gap-report || echo "gap-report fehlgeschlagen (weiter)"
# NEWSLETTER_PENDING.md leeren, sobald der wöchentliche Rahmenwerk-Newsletter
# tatsächlich verschickt wurde (Zeitstempel via /api/newsletter/frameworks?status=1)
/usr/bin/python3 clear_newsletter_pending.py || echo "newsletter-pending-check fehlgeschlagen (weiter)"

# Auto-Push + Deploy: nur nach erfolgreichem Export und nur, wenn sich
# live.json inhaltlich geändert hat (mehr als der generated_at-Zeitstempel)
cd "$REPO"
if [ "$EXPORT_OK" = 1 ] && git diff -U0 -- web/lib/live.json | grep '^[+-][^+-]' | grep -v generated_at | grep -q .; then
  echo "live.json inhaltlich geändert → Commit, Push, Deploy"
  if git add web/lib/live.json web/lib/sources.json \
     && git commit -m "Auto-Update: live.json ($(date '+%Y-%m-%d %H:%M'))" \
     && git push origin main; then
    STEPS+=("--step=push=ok")
    echo "Push abgeschlossen — Vercel deployt automatisch via Git-Integration"
  else
    STEPS+=("--step=push=failed"); echo "Push fehlgeschlagen"; RC=1
  fi
else
  git checkout -- web/lib/live.json web/lib/sources.json 2>/dev/null || true
  STEPS+=("--step=push=skipped")
  echo "Keine inhaltlichen Änderungen in live.json → kein Deploy"
fi
exit $RC
