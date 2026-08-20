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
#    - die Client-.exe verteilen. Die steht in .gitignore, weil eine
#      Binaerdatei nichts in einem Repo verloren hat. Sie kommt per scp,
#      siehe --hilfe.
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

  Die Client-.exe geht nicht ueber git - sie steht in der .gitignore,
  eine Binaerdatei hat in einem Repo nichts verloren. Von deinem PC aus:

    scp client-cs/Meccha-Ranked.exe DEIN-BENUTZER@meccha-ranked.com:/tmp/

  Und dann auf dem Server:

    sudo mv /tmp/Meccha-Ranked.exe /opt/meccha/mc-ranked/client-cs/
    sudo chown meccha:meccha /opt/meccha/mc-ranked/client-cs/Meccha-Ranked.exe

  NICHT direkt als meccha@ hochladen. Dieses Konto ist mit --system
  angelegt: kein Passwort, keine Anmeldung. Es existiert nur, damit der
  Dienst nicht als root laeuft - scp fragt dort nach einem Passwort, das
  es gar nicht gibt.

  Das chown nicht vergessen. Gehoert die Datei danach root, liest der
  Dienst sie zwar noch, aber es ist genau die Abweichung, die Wochen
  spaeter als raetselhafter Rechtefehler wiederkommt.

  Danach bietet /client die neue Fassung an. Ein Neustart ist dafuer
  nicht noetig - der Server liest die Datei bei jeder Anfrage frisch,
  und /api/client rechnet die Pruefsumme neu.

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

# Die ZIP hat Vorrang - genau so waehlt der Server auch aus.
paket=""
for k in Meccha-Ranked.zip Meccha-Ranked.exe; do
  [[ -f "$WURZEL/mc-ranked/client-cs/$k" ]] && { paket="$k"; break; }
done

if [[ -n "$paket" ]]; then
  exe_stand="$(date -r "$WURZEL/mc-ranked/client-cs/$paket" '+%d.%m. %H:%M')"
  soll="$(node -p "require('$WURZEL/mc-ranked/config/verteilung.json').clientVersion" 2>/dev/null || echo '?')"
  printf 'Client %s liegt bereit (%s).\n\n' "$soll" "$exe_stand"
else
  printf '\n'
  warn "Es liegt kein Client bereit (weder .zip noch .exe) - /client gibt eine 404 zurueck."
  warn "Hochladen mit:  ./deploy.sh --hilfe"
  printf '\n'
fi
