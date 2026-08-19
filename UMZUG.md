# Umzug auf den Hetzner-Server

Ziel: **`meccha.walk-budd.app`** — mc-ranked öffentlich erreichbar, `turnier` daneben
auf demselben Rechner.

Beide ziehen um. Das ist kein Zusatzaufwand, sondern der einfachere Weg: mc-ranked
braucht von `turnier` die Kartei und den Schreibzugriff, und über `localhost` ist das
eine Zeile Konfiguration statt eines Tunnels zu dir nach Hause.

> **Arbeitsweise:** Du führst die Befehle aus, ich lese mit. Nach jedem Schritt kurz
> Bescheid geben, dann gehen wir weiter. Bei Fehlern die Ausgabe hierher kopieren.

---

## Vorher zu klären

| | |
|---|---|
| **DNS** | Zeigt `meccha.walk-budd.app` schon auf die Server-IP? Prüfen mit `nslookup meccha.walk-budd.app` |
| **Webserver** | Auf `walk-budd.app` läuft schon etwas. Caddy? nginx? Das entscheidet Schritt 6 |
| **turnier öffentlich?** | Dein OBS muss das Overlay erreichen. Entweder eine zweite Subdomain (`turnier.walk-budd.app`) oder nur die Overlay-Pfade freigeben |

---

## Schritt 0 · Bestandsaufnahme

Auf dem Server ausführen, Ausgabe hierher:

```bash
cat /etc/os-release | head -2
echo "--- wer horcht ---"
sudo ss -tlnp | grep -E ':(80|443|8777|8790)'
echo "--- webserver ---"
which caddy nginx apache2 2>/dev/null
systemctl is-active caddy nginx 2>/dev/null
ls -l /etc/caddy/ /etc/nginx/sites-enabled/ 2>/dev/null
echo "--- node / python ---"
node -v; npm -v; python3 -V
echo "--- platz ---"
free -m | head -2; df -h / | tail -1
```

**Worauf ich schaue:** RAM (RapidOCR braucht kurz Luft), Node-Version (mindestens 20,
besser 22) und welcher Webserver schon auf 443 sitzt.

---

## Schritt 1 · Grundausstattung

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip rsync

# Node 22, falls node -v etwas älteres als v20 zeigt:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Eigener Benutzer, damit nichts als root läuft:

```bash
sudo adduser --system --group --home /opt/meccha meccha
sudo mkdir -p /opt/meccha/{turnier,mc-ranked}
sudo chown -R meccha:meccha /opt/meccha
```

---

## Schritt 2 · Code auf den Server

Das Repo ist **privat**, also braucht der Server einen eigenen Schlüssel — ein
Deploy-Key, der nur lesen darf.

```bash
# auf dem SERVER
sudo -u meccha ssh-keygen -t ed25519 -f /opt/meccha/.ssh/id_ed25519 -N ""
sudo cat /opt/meccha/.ssh/id_ed25519.pub
```

Den ausgegebenen Schlüssel auf GitHub eintragen:
**Repo → Settings → Deploy keys → Add deploy key**, Häkchen bei „Allow write access"
**nicht** setzen. Dann:

```bash
sudo -u meccha git clone git@github.com:DEIN-NAME/DEIN-REPO.git /opt/meccha/mc-ranked
```

Spätere Aktualisierungen sind dann ein Zweizeiler:

```bash
cd /opt/meccha/mc-ranked && sudo -u meccha git pull && sudo systemctl restart meccha-ranked
```

### Was NICHT im Repo ist — und trotzdem gebraucht wird

| Fehlt | Warum | Was tun |
|---|---|---|
| `client-cs/Meccha-Ranked.exe` | ignoriert (Binärdatei) | nach jedem `BAUEN.bat` einzeln hochladen, siehe Schritt 7 |
| `EINSTELLUNGEN.bat` | trägt den Admin-Schlüssel | brauchst du auf dem Server nicht — dort steht alles in `/etc/meccha-ranked.env` |
| `daten/` | Konten, Tokens, Bilder | wird beim ersten Start leer angelegt |
| `.venv/` | Python-Umgebung | Schritt 4 |

### turnier ist nicht im Repo

`turnier` liegt eine Ebene darüber und gehört nicht dazu. Das lädst du per rsync
hoch — **ohne** `START.bat` und **ohne** `data/`:

```bash
# von deinem PC, im Ordner  E:/myprojects/twitch/scripte
rsync -av \
  --exclude 'node_modules' --exclude 'data' \
  --exclude 'START.bat' --exclude 'mc-ranked' \
  turnier/ DEIN-USER@DEIN-SERVER:/tmp/turnier/

# auf dem Server
sudo cp -r /tmp/turnier/* /opt/meccha/turnier/
sudo chown -R meccha:meccha /opt/meccha/turnier
```

> **`turnier/START.bat` bleibt zu Hause.** Dort steht dein Discord-Token im Klartext,
> und im Turnier-Projekt gibt es **keine `.gitignore`**. Solltest du turnier später
> auch versionieren, lege zuerst eine an — sonst liegt der Token im Verlauf und lässt
> sich nur noch durch Zurücksetzen bei Discord entschärfen.

---

## Schritt 3 · turnier einrichten

`turnier` hat **keine npm-Abhängigkeiten** — kein `npm install` nötig.

```bash
sudo -u meccha mkdir -p /opt/meccha/turnier/data
sudo tee /etc/meccha-turnier.env >/dev/null <<'EOF'
PORT=8777
TURNIER_KEY=HIER-EIN-LANGES-ZUFAELLIGES-WORT
# DISCORD_TOKEN=...      nur wenn der Bot mitlaufen soll
# DISCORD_GUILD=...
EOF
sudo chmod 600 /etc/meccha-turnier.env
```

Zufälligen Schlüssel erzeugen: `openssl rand -hex 24`

```bash
sudo tee /etc/systemd/system/meccha-turnier.service >/dev/null <<'EOF'
[Unit]
Description=Turnier-Server (Overlay + Punkteliste)
After=network.target

[Service]
Type=simple
User=meccha
WorkingDirectory=/opt/meccha/turnier
EnvironmentFile=/etc/meccha-turnier.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now meccha-turnier
sudo systemctl status meccha-turnier --no-pager
curl -s localhost:8777/api/state | head -c 200
```

---

## Schritt 4 · RapidOCR

**Der Server liest die Bilder, nicht der Zuschauer.** Ohne Python passiert nichts.

```bash
cd /opt/meccha/mc-ranked
sudo -u meccha python3 -m venv .venv
sudo -u meccha .venv/bin/pip install rapidocr-onnxruntime pillow
```

> **Kein `pip install --upgrade pip`.** Das hat die Umgebung auf dem Windows-Rechner
> reproduzierbar zerlegt (`No module named pip._internal.cli`). Die mitgelieferte
> Version reicht.

Probe:

```bash
sudo -u meccha .venv/bin/python -c "import rapidocr_onnxruntime, PIL; print('ok')"
```

Rechnet mit ~300 MB Paketen und dem ersten Aufruf, der die Modelle lädt.

---

## Schritt 5 · mc-ranked einrichten

```bash
cd /opt/meccha/mc-ranked
sudo -u meccha npm install          # MIT devDependencies - tsx steckt dort drin
```

> **Nicht `npm run build` benutzen.** `config.ts` und `serve.ts` bestimmen den
> Projektordner als „eine Ebene über mir". Kompiliert liegt der Code in `dist/src/`,
> und dann zeigen alle Pfade nach `dist/` — dort gibt es weder `python/` noch
> `public/` noch `daten/`. Der Server startet und findet nichts. Wir starten mit
> `tsx`, genau wie lokal.

```bash
sudo tee /etc/meccha-ranked.env >/dev/null <<'EOF'
MC_PORT=8790
MC_ADMIN_KEY=HIER-EIN-ANDERES-LANGES-ZUFAELLIGES-WORT
MC_OEFFENTLICHE_URL=https://meccha.walk-budd.app
TURNIER_URL=http://localhost:8777
TURNIER_KEY=DERSELBE-WIE-IN-SCHRITT-3
MC_SPIEL=Meccha 2026
MC_PYTHON=/opt/meccha/mc-ranked/.venv/bin/python
EOF
sudo chmod 600 /etc/meccha-ranked.env
```

**`MC_PYTHON` ist Pflicht.** Ohne die Zeile sucht `src/rapidocr.ts:41` unter
`.venv/Scripts/python.exe` — dem Windows-Pfad — und der Leser startet nie.

**`MC_OEFFENTLICHE_URL` ebenfalls.** Steam leitet nach der Anmeldung exakt dorthin
zurück, und das Sitzungs-Cookie bekommt sein `Secure` nur bei `https://`.

```bash
sudo tee /etc/systemd/system/meccha-ranked.service >/dev/null <<'EOF'
[Unit]
Description=mc-ranked (OCR-Feeder, Freigabe, Kontoseite)
After=network.target meccha-turnier.service

[Service]
Type=simple
User=meccha
WorkingDirectory=/opt/meccha/mc-ranked
EnvironmentFile=/etc/meccha-ranked.env
ExecStart=/usr/bin/npm run serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now meccha-ranked
sudo journalctl -u meccha-ranked -n 30 --no-pager
```

Im Log muss stehen: `Turnier erreichbar: Meccha 2026 (0 Eintraege)`.

---

## Schritt 6 · Caddy

**Läuft dort schon Caddy**, kommt das an die `Caddyfile` — sonst streiten sich zwei
Programme um Port 443:

```caddy
meccha.walk-budd.app {
	reverse_proxy localhost:8790
	# Der Admin-Schlüssel steht in der Adresse (?key=...). Ohne diese Zeile
	# landet er in jeder Logzeile.
	log {
		output discard
	}
}

turnier.walk-budd.app {
	reverse_proxy localhost:8777
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Läuft dort nginx**, sag mir Bescheid — dann schreibe ich den Block passend dazu,
inklusive `certbot`. Zwei Webserver nebeneinander funktionieren nicht.

> **Überlegung zu `turnier.walk-budd.app`:** `TURNIER_KEY` schützt nur die
> Schreibzugriffe (`server.js:76`). `/admin`, `/api/state` und `/api/save` sind
> **ohne Schlüssel lesbar**. Wer die Adresse kennt, sieht dein Admin-Panel und kann
> Stände herunterladen — ändern kann er nichts. Ist dir das zu offen, geben wir nur
> die Overlay-Pfade frei, die dein OBS braucht.

---

## Schritt 7 · Client neu bauen

Auf **deinem PC**, in `mc-ranked/config/verteilung.json`:

```json
{
  "server": "https://meccha.walk-budd.app",
  "clientVersion": "0.4.0",
  "discord": "https://discord.gg/W7tHtSu4p"
}
```

Dann `client-cs\BAUEN.bat`. Die neue `Meccha-Ranked.exe` nach
`/opt/meccha/mc-ranked/client-cs/` hochladen — ab dann lädt sie jeder über
`https://meccha.walk-budd.app/client`.

**`clientVersion` unbedingt hochzählen.** Der Server meldet die Zahl über `/api/wer`;
wer noch die alte Fassung hat, sieht dann „NEUE FASSUNG verfügbar". Ohne das senden
alte Programme weiter an `localhost:8790` — also ins Leere — und niemand merkt es.

---

## Schritt 8 · Abnahme

Der Reihe nach, jedes einzeln prüfen:

- [ ] `https://meccha.walk-budd.app/konto` lädt, Zertifikat gültig
- [ ] **Mit Steam anmelden** funktioniert und leitet zurück
- [ ] Ingame-Namen eintragen, Token wird angezeigt
- [ ] `https://meccha.walk-budd.app/client` lädt die `.exe` herunter
- [ ] Client starten, Token einfügen — Kopfzeile zeigt `Im Spiel: …`
- [ ] Eine Runde per F9 einreichen
- [ ] Dashboard `https://meccha.walk-budd.app/?key=…` zeigt sie
- [ ] Freigeben → Eintrag erscheint unter „Zuletzt in der Punkteliste"
- [ ] Der Name steht in der **Kartei** des Servers (sonst „nicht zugeordnet")
- [ ] OBS-Quellen auf die neue Turnier-Adresse umstellen

---

## Schritt 9 · Betrieb

```bash
sudo journalctl -u meccha-ranked -f      # mitlesen
sudo systemctl restart meccha-ranked     # nach Änderungen
```

**Sicherung** — die Laufzeitdaten liegen in zwei Ordnern:

```bash
sudo tar czf /root/meccha-$(date +%F).tar.gz \
  /opt/meccha/turnier/data /opt/meccha/mc-ranked/daten
```

Die hochgeladenen Bilder unter `daten/uploads/` räumt der Server selbst auf: nach
24 Stunden, geflaggte Runden erst nach 30 Tagen.

---

## Fallstricke, die ich schon geprüft habe

| | |
|---|---|
| **Python-Pfad** | `src/rapidocr.ts:41` zeigt auf Windows. `MC_PYTHON` setzen |
| **`npm run build`** | Bricht die Pfade. Mit `tsx` starten |
| **`MC_OEFFENTLICHE_URL`** | Ohne sie leitet Steam falsch zurück, und der Cookie bekommt kein `Secure` |
| **Discord-Token** | Steht im Klartext in `turnier/START.bat`, die **nicht** ignoriert wird. Nicht hochladen — und wenn die Datei je in einem Backup gelandet ist, den Token bei Discord zurücksetzen |
| **Admin-Schlüssel in der URL** | `?key=…` landet in Proxy-Logs. Deshalb `log { output discard }` |
| **`EINSTELLUNGEN.bat`** | Steht **jetzt** in der `.gitignore`, als Vorlage liegt `EINSTELLUNGEN.bat.beispiel` daneben. Bleibt lokal |
| **Groß-/Kleinschreibung** | Auf Linux streng. Alle Dateinamen in `public/` sind konsequent klein — geprüft, passt |
| **turnier ohne npm** | Keine Abhängigkeiten, kein `npm install`, kein Build |

---

## Wenn es schiefgeht

```bash
sudo systemctl stop meccha-ranked meccha-turnier
```

Deine lokale Einrichtung ist unberührt: `MECCHA-START.bat` startet wie bisher gegen
`localhost`. Der einzige Weg zurück beim Client ist eine `.exe` mit der alten
Adresse — deshalb bewahre die aktuelle auf, bevor du in Schritt 7 neu baust.
