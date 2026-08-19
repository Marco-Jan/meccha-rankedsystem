#!/usr/bin/env bash
#
# =============================================================================
#  MECCHA RANKED - auf dem Server ausrollen
#
#  Aufruf auf dem Server:
#
#      /opt/meccha/mc-ranked/deploy.sh
#
#  Holt beide Repos, startet die Dienste neu und prueft nach, ob sie
#  wirklich antworten. Geht dabei etwas schief, bricht es ab und sagt wo -
#  statt halb fertig zu sein und den Rest still zu ueberspringen.
#
#  Was es NICHT tut:
#    - npm run build. Der Server laeuft ueber tsx direkt aus src/; ein
#      dist/ daneben bringt die relativen Pfade durcheinander.
#    - die Client-.exe verteilen. Die steht in .gitignore, weil eine
#      Binaerdatei nichts in einem Repo verloren hat. Sie kommt per scp,
#      siehe --hilfe.
#    - Datenbestaende anfassen. daten/ und uploads/ bleiben unberuehrt.
# =============================================================================

set -euo pipefail

WURZEL="${MECCHA_WURZEL:-/opt/meccha}"
DIENSTE=(meccha-turnier meccha-ranked)
RANKED_PORT="${MC_PORT:-8790}"
TURNIER_PORT="${PORT:-8777}"

rot=$'\033[31m'; gruen=$'\033[32m'; gelb=$'\033[33m'; grau=$'\033[90m'; klar=$'\033[0m'

sage()  { printf '\n%s==>%s %s\n' "$gruen" "$klar" "$*"; }
leise() { printf '    %s%s%s\n' "$grau" "$*" "$klar"; }
warn()  { printf '    %s!  %s%s\n' "$gelb" "$*" "$klar"; }
ende()  { printf '\n%sFEHLER:%s %s\n\n' "$rot" "$klar" "$*" >&2; exit 1; }

if [[ "${1:-}" == "--hilfe" || "${1:-}" == "-h" ]]; then
  cat <<'HILFE'

  deploy.sh - Meccha Ranked ausrollen

    ./deploy.sh              beide Repos holen, Dienste neu starten, pruefen
    ./deploy.sh --nur-neustart   nichts holen, nur neu starten
    ./deploy.sh --hilfe          das hier

  Die Client-.exe geht nicht ueber git. Von deinem PC aus:

    scp mc-ranked/client-cs/Meccha-Ranked.exe \
        meccha@meccha-ranked.com:/opt/meccha/mc-ranked/client-cs/

  Danach bietet /client die neue Fassung an. Ein Neustart ist dafuer
  nicht noetig - der Server liest die Datei bei jeder Anfrage frisch.

HILFE
  exit 0
fi

NUR_NEUSTART=0
[[ "${1:-}" == "--nur-neustart" ]] && NUR_NEUSTART=1

# -----------------------------------------------------------------------------
#  Voraussetzungen
# -----------------------------------------------------------------------------
[[ -d "$WURZEL" ]] || ende "$WURZEL gibt es nicht. Falscher Server?"
command -v node >/dev/null || ende "node ist nicht installiert."

# tsx braucht Node 22. Unter 20 startet mc-ranked, faellt aber spaeter
# ueber Syntax, die es nicht kennt - das ist schwer zu finden.
NODE_HAUPT="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_HAUPT" -ge 22 ]] || ende "Node $NODE_HAUPT ist zu alt, gebraucht wird 22 oder neuer."

sudo -n true 2>/dev/null || leise "sudo fragt gleich nach dem Passwort."

# -----------------------------------------------------------------------------
#  Holen
# -----------------------------------------------------------------------------
hole() {
  local name="$1" pfad="$WURZEL/$1"
  [[ -d "$pfad/.git" ]] || ende "$pfad ist kein Repo."

  sage "$name"
  cd "$pfad"

  # Aenderungen von Hand am Server wuerde ein Pull sonst wegwerfen oder
  # daran scheitern. Lieber vorher sagen, was da liegt.
  if [[ -n "$(git status --porcelain)" ]]; then
    warn "hier liegen ungespeicherte Aenderungen:"
    git status --short | sed 's/^/       /'
    ende "Erst aufraeumen (git stash oder git checkout .), dann nochmal."
  fi

  local vorher; vorher="$(git rev-parse --short HEAD)"
  git pull --ff-only
  local nachher; nachher="$(git rev-parse --short HEAD)"

  if [[ "$vorher" == "$nachher" ]]; then
    leise "schon aktuell ($nachher)"
  else
    leise "$vorher -> $nachher"
    git --no-pager log --oneline "$vorher..$nachher" | sed 's/^/       /'
  fi

  # Nur wenn sich die Abhaengigkeiten wirklich geaendert haben - npm ci
  # loescht node_modules und braucht sonst jedes Mal eine Minute umsonst.
  if [[ -f package-lock.json ]] && \
     ! git diff --quiet "$vorher" "$nachher" -- package-lock.json 2>/dev/null; then
    leise "package-lock.json hat sich geaendert, installiere neu"
    npm ci --omit=dev
  fi
}

if [[ "$NUR_NEUSTART" -eq 0 ]]; then
  hole turnier
  hole mc-ranked
else
  sage "Nur Neustart, nichts geholt"
fi

# -----------------------------------------------------------------------------
#  Neu starten
# -----------------------------------------------------------------------------
sage "Dienste neu starten"
for d in "${DIENSTE[@]}"; do
  sudo systemctl restart "$d"
  leise "$d neu gestartet"
done

# Node braucht einen Moment, bis der Port offen ist. Sofort zu pruefen
# meldet einen Fehlschlag, den es gar nicht gibt.
sleep 3

# -----------------------------------------------------------------------------
#  Nachpruefen
# -----------------------------------------------------------------------------
sage "Nachsehen, ob sie leben"

fehlt=0
for d in "${DIENSTE[@]}"; do
  if sudo systemctl is-active --quiet "$d"; then
    leise "$d laeuft"
  else
    warn "$d laeuft NICHT"
    sudo journalctl -u "$d" -n 20 --no-pager | sed 's/^/       /'
    fehlt=1
  fi
done

pruefe() {
  local name="$1" url="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$url" || true)"
  if [[ "$code" == "200" ]]; then
    leise "$name antwortet ($url)"
  else
    warn "$name antwortet nicht: HTTP ${code:-keine Verbindung} auf $url"
    fehlt=1
  fi
}

# Ueber localhost, denn genau so spricht nginx die Dienste an. Von aussen
# sind die Ports absichtlich nicht erreichbar - siehe UMZUG.md.
pruefe "turnier"   "http://127.0.0.1:$TURNIER_PORT/liste"
pruefe "mc-ranked" "http://127.0.0.1:$RANKED_PORT/api/status"
pruefe "die Seite" "https://meccha-ranked.com/api/status"

# Haengt einer der Dienste doch am offenen Netz, faellt es hier auf.
if ss -tln 2>/dev/null | grep -qE "0\.0\.0\.0:($RANKED_PORT|$TURNIER_PORT)|\*:($RANKED_PORT|$TURNIER_PORT)"; then
  warn "Ein Dienst lauscht auf allen Schnittstellen statt nur auf 127.0.0.1."
  warn "Dann ist er an nginx und am Zertifikat vorbei erreichbar."
  fehlt=1
fi

if [[ "$fehlt" -ne 0 ]]; then
  printf '\n%sNicht alles ist in Ordnung - siehe oben.%s\n' "$gelb" "$klar"
  printf '  Zurueck auf den letzten Stand:  cd %s/mc-ranked && git reset --hard HEAD~1 && ./deploy.sh --nur-neustart\n\n' "$WURZEL"
  exit 1
fi

# -----------------------------------------------------------------------------
#  Fertig
# -----------------------------------------------------------------------------
printf '\n%sFertig.%s ' "$gruen" "$klar"

if [[ -f "$WURZEL/mc-ranked/client-cs/Meccha-Ranked.exe" ]]; then
  exe_stand="$(date -r "$WURZEL/mc-ranked/client-cs/Meccha-Ranked.exe" '+%d.%m. %H:%M')"
  soll="$(node -p "require('$WURZEL/mc-ranked/config/verteilung.json').clientVersion" 2>/dev/null || echo '?')"
  printf 'Client %s liegt bereit (%s).\n\n' "$soll" "$exe_stand"
else
  printf '\n'
  warn "Es liegt keine Meccha-Ranked.exe bereit - /client gibt eine 404 zurueck."
  warn "Hochladen mit:  ./deploy.sh --hilfe"
  printf '\n'
fi
