#!/bin/zsh
# Reparatur-Agent der Scraper-Überwachung, minütlich via launchd
# (com.regradar.repair). Läuft wie der Stundenlauf über /bin/zsh (gleiche
# TCC-Freigabe für den Ordnerzugriff). Ohne offene Aufträge endet er still.
export PATH="/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
exec /usr/bin/python3 repair_agent.py
