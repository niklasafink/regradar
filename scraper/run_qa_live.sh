#!/bin/zsh
# Live-QS auf Knopfdruck, minütlich via launchd (com.regradar.qalive). Ohne
# eingereihten Auftrag der Freigabe-Seite endet der Aufruf sofort und still.
export PATH="/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
exec /usr/bin/python3 newsletter_qa.py --live
