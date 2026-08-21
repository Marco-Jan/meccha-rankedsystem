#!/usr/bin/env bash
#
# =============================================================================
#  MECCHA RANKED - auf dem Server ausrollen
#
#  Aufruf auf dem Server, als root oder als meccha - beides geht:
#
#      /opt/meccha/mc-ranked/deploy.sh
#
#  git laeuft immer als der Besitzer der Dateien, systemctl ueber sudo.
#
#  Holt das Repo, startet den Dienst neu und prueft nach, ob er wirklich
#  antwortet. Geht dabei etwas schief, bricht es ab und sagt wo - statt
#  halb fertig zu sein und den Rest still zu ueberspringen.
#
#  Was es NICHT tut:
#    - npm run build. Der Server laeuft ueber tsx direkt aus src/; ein
#      dist/ daneben bringt die relativen Pfade durcheinander.
#    - die Client-.exe verteilen. Die liegt seit dem 21.08.2026 bei
#      GitHub, neben dem Quelltext; /client leitet nur noch dorthin
#      weiter. Siehe --hilfe.
#    - Datenbestaende anfassen. daten/ und uploads/ bleiben unberuehrt.
# =============================================================================

set -euo pipefail

WURZEL="${MECCHA_WURZEL:-/opt/meccha}"

# Nur noch ein Dienst. Bis zum 20.08.2026 stand hier auch meccha-turnier -
# von dort kamen Namensliste und Punkteliste. mc-ranked ist seither
# eigenstaendig, siehe UMBAU.md.
DIENSTE=(meccha-ranked)
RANKED_PORT="${MC_PORT:-8790}"

rot=$'\033[31m'; gruen=$'\033[32m'; gelb=$'\033[33m'; grau=$'\033[90m'; klar=$'\033[0m'

sage()  { printf '\n%s==>%s %s\n' "$gruen" "$klar" "$*"; }
leise() { printf '    %s%s%s\n' "$grau" "$*" "$klar"; }
warn()  { printf '    %s!  %s%s\n' "$gelb" "$*" "$klar"; }
ende()  { printf '\n%sFEHLER:%s %s\n\n' "$rot" "$klar" "$*" >&2; exit 1; }

if [[ "${1:-}" == "--hilfe" || "${1:-}" == "-h" ]]; then
  cat <<'HILFE'

  deploy.sh - Meccha Ranked ausrollen

    ./deploy.sh              Repo holen, Dienst neu starten, pruefen
    ./deploy.sh --nur-neustart   nichts holen, nur neu starten
    ./deploy.sh --hilfe          das hier

  Die Client-.exe geht NICHT mehr ueber diesen Server. Seit dem
  21.08.2026 liegt sie bei GitHub, neben dem Quelltext:

    https://github.com/Marco-Jan/meccha-rankedsystem/releases

  Der Server verweist nur noch dorthin - /client leitet weiter. Das
  frueher noetige scp entfaellt damit ersatzlos.

  Nach einem Neubau also: Release auf GitHub anlegen, .exe anhaengen,
  SHA-256 in die Notizen. Und clientVersion in config/verteilung.json
  muss zur veroeffentlichten Fassung passen - sonst schickt der Server
  die Zuschauer zu einem Release, das es noch nicht gibt.

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
#  Als wer wird gezogen?
#
#  Die Dienste laufen als meccha, und die Dateien gehoeren meccha. Zieht
#  root hier hinein, gehoeren alle neu geholten Dateien danach root - der
#  Dienst kann sie dann nicht mehr schreiben. Das faellt erst Wochen
#  spaeter auf und sieht dann nach einem ganz anderen Fehler aus.
#
#  Also: systemctl braucht root, git und npm brauchen den Besitzer. Beides
#  macht dieses Skript selbst, egal als wer es gestartet wurde.
# -----------------------------------------------------------------------------
BESITZER="$(stat -c '%U' "$WURZEL/mc-ranked")"
ICH="$(id -un)"

alsBesitzer() {
  if [[ "$ICH" == "$BESITZER" ]]; then
    "$@"
  else
    # -H setzt auch das Heimatverzeichnis um, sonst sucht git den
    # Deploy-Key unter /root/.ssh/ und scheitert an der Anmeldung.
    sudo -u "$BESITZER" -H "$@"
  fi
}

[[ "$ICH" == "$BESITZER" ]] || leise "git laeuft als $BESITZER (du bist $ICH)"

# -----------------------------------------------------------------------------
#  Holen
# -----------------------------------------------------------------------------
hole() {
  local name="$1" pfad="$WURZEL/$1"

  sage "$name"

  [[ -d "$pfad" ]] || ende "$pfad gibt es nicht."

  [[ -d "$pfad/.git" ]] || ende "$pfad haengt nicht an git."

  cd "$pfad"

  # Aenderungen von Hand am Server wuerde ein Pull sonst wegwerfen oder
  # daran scheitern. Lieber vorher sagen, was da liegt.
  #
  # Nur VERFOLGTE Dateien zaehlen. Unversioniertes stand hier anfangs
  # auch drin, und prompt blockierte die per scp hochgeladene Client-ZIP
  # den ganzen Rollout - obwohl ein Pull sie gar nicht anfassen kann.
  if [[ -n "$(alsBesitzer git status --porcelain --untracked-files=no)" ]]; then
    warn "hier liegen ungespeicherte Aenderungen:"
    alsBesitzer git status --short | sed 's/^/       /'
    ende "Erst aufraeumen (git stash oder git checkout .), dann nochmal."
  fi

  local vorher; vorher="$(alsBesitzer git rev-parse --short HEAD)"
  alsBesitzer git pull --ff-only
  local nachher; nachher="$(alsBesitzer git rev-parse --short HEAD)"

  if [[ "$vorher" == "$nachher" ]]; then
    leise "schon aktuell ($nachher)"
  else
    leise "$vorher -> $nachher"
    alsBesitzer git --no-pager log --oneline "$vorher..$nachher" | sed 's/^/       /'
  fi

  # Nur wenn sich die Abhaengigkeiten wirklich geaendert haben - npm ci
  # loescht node_modules und braucht sonst jedes Mal eine Minute umsonst.
  if [[ -f package-lock.json ]] && \
     ! alsBesitzer git diff --quiet "$vorher" "$nachher" -- package-lock.json 2>/dev/null; then
    leise "package-lock.json hat sich geaendert, installiere neu"
    alsBesitzer npm ci --omit=dev
  fi
}

if [[ "$NUR_NEUSTART" -eq 0 ]]; then
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

# Ueber localhost, denn genau so spricht nginx den Dienst an. Von aussen
# ist der Port absichtlich nicht erreichbar - siehe UMZUG.md.
pruefe "mc-ranked" "http://127.0.0.1:$RANKED_PORT/api/status"
pruefe "die Seite" "https://meccha-ranked.com/api/status"
pruefe "die Regeln" "https://meccha-ranked.com/regeln"

# Haengt einer der Dienste doch am offenen Netz, faellt es hier auf.
if ss -tln 2>/dev/null | grep -qE "0\.0\.0\.0:$RANKED_PORT|\*:$RANKED_PORT"; then
  warn "Der Dienst lauscht auf allen Schnittstellen statt nur auf 127.0.0.1."
  warn "Dann ist er an nginx und am Zertifikat vorbei erreichbar."
  fehlt=1
fi

# -----------------------------------------------------------------------------
#  Altbestand
#
#  turnier lief hier bis zum 20.08.2026 als eigener Dienst. Es wird nicht
#  mehr gebraucht, und solange es laeuft, belegt es Port 8777 und
#  Arbeitsspeicher fuer nichts.
#
#  ABGERAEUMT WIRD HIER NICHTS. Ein Deploy-Skript, das von sich aus
#  Dienste entfernt, ist ein Deploy-Skript, dem man nicht mehr traut -
#  und /opt/meccha/turnier/data koennte noch etwas enthalten, das jemand
#  ansehen will. Es sagt nur Bescheid.
# -----------------------------------------------------------------------------
if systemctl list-unit-files 2>/dev/null | grep -q '^meccha-turnier\.service'; then
  printf '\n'
  warn "Der alte Dienst meccha-turnier ist noch eingerichtet."
  warn "Er wird nicht mehr gebraucht. Zum Entfernen, in dieser Reihenfolge:"
  leise "  sudo tar czf /root/turnier-letzter-stand.tar.gz /opt/meccha/turnier/data"
  leise "  sudo systemctl disable --now meccha-turnier"
  leise "  sudo rm /etc/systemd/system/meccha-turnier.service /etc/meccha-turnier.env"
  leise "  sudo systemctl daemon-reload"
  leise "  sudo rm -rf /opt/meccha/turnier"
  printf '\n'
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

# ---------------------------------------------------------------------
#  Was der LAUFENDE Dienst meldet - nicht, was in der Datei steht.
#
#  Am 21.08.2026 lag die neue .exe per scp auf dem Server, das Repo war
#  aber nie gezogen. Der Dienst nannte weiter 0.5.0, jeder Client mit
#  0.7.0 bekam "neue Fassung 0.5.0 verfuegbar" - ein Hinweis auf ein
#  Downgrade. Die lokale Datei zu lesen haette das nie gezeigt: sie war
#  ja richtig. Nur der Dienst hatte sie nie gesehen.
# ---------------------------------------------------------------------
soll="$(node -p "require('$WURZEL/mc-ranked/config/verteilung.json').clientVersion" 2>/dev/null || echo '?')"
auskunft="$(curl -s -m 10 "http://127.0.0.1:$RANKED_PORT/api/client" 2>/dev/null || echo '')"
ist="$(printf '%s' "$auskunft" | node -p "try{JSON.parse(require('fs').readFileSync(0,'utf8')).version||'?'}catch(e){'?'}" 2>/dev/null || echo '?')"
quelle="$(printf '%s' "$auskunft" | node -p "try{JSON.parse(require('fs').readFileSync(0,'utf8')).releases||''}catch(e){''}" 2>/dev/null || echo '')"

if [[ "$ist" != "$soll" ]]; then
  printf '\n'
  warn "Der Dienst meldet Fassung '${ist}', in config/verteilung.json steht '${soll}'."
  warn "Solange das auseinandergeht, bekommen Clients einen falschen"
  warn "Fassungshinweis. Laeuft der Dienst wirklich auf diesem Stand?"
  printf '\n'
elif [[ -z "$quelle" ]]; then
  printf '\n'
  warn "Es ist keine Bezugsquelle hinterlegt - /client fuehrt ins Leere."
  warn "In config/verteilung.json fehlt \"releases\"."
  printf '\n'
else
  # Gibt es das Release wirklich? Ein Verweis auf eine Fassung, die nie
  # veroeffentlicht wurde, ist schlimmer als gar keiner: der Zuschauer
  # bekommt gesagt, es gaebe etwas Neues, und findet dann nichts.
  code="$(curl -s -o /dev/null -w '%{http_code}' -L -m 15 "$quelle" || echo '000')"
  if [[ "$code" == "200" ]]; then
    printf 'Client %s, zu holen bei GitHub.

' "$soll"
  else
    printf '\n'
    warn "Die Bezugsquelle antwortet mit HTTP ${code}:"
    warn "  $quelle"
    warn "Ist das Release fuer ${soll} schon angelegt?"
    printf '\n'
  fi
fi
