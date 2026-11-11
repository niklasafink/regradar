#!/bin/zsh
# Anforderungsanalyse nachholen (launchd com.regradar.scope, alle 15 Minuten
# und beim Anmelden): analysiert Ziele ohne aktuelle Analyse über das
# Claude-Abo, in kleinen parallelen Paketen und unter dem Token-Deckel
# (scraper/regradar/scope.py). Läuft schon ein Lauf, endet dieser sofort.
# Damit überlebt ein großer Nachlauf auch einen Neustart des Rechners.
export PATH="/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
echo "--- $(date '+%Y-%m-%d %H:%M') ---"
/usr/bin/python3 -u -m regradar scope
