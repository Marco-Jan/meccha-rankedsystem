# Umzug auf den Hetzner-Server

Ziel: **`meccha-ranked.com`** — mc-ranked öffentlich erreichbar, `turnier` daneben
auf demselben Rechner.

Beide ziehen um. Das ist kein Zusatzaufwand, sondern der einfachere Weg: mc-ranked
braucht von `turnier` die Kartei und den Schreibzugriff, und über `localhost` ist das
eine Zeile Konfiguration statt eines Tunnels zu dir nach Hause.

> **Arbeitsweise:** Du führst die Befehle aus, ich lese mit. Nach jedem Schritt kurz
> Bescheid geben, dann gehen wir weiter. Bei Fehlern die Ausgabe hierher kopieren.

---

## Der Server, wie er ist (Stand 19.08.)

| | |
|---|---|
| System | Ubuntu 24.04.4 LTS, `walkbuddy-live`, 89.167.44.253 |
| Webserver | **nginx** auf 80/443 — drei Seiten: `chew.walk-buddy.app`, `cms.walk-buddy.app`, `walkbuddy` |
| Node | **v18.19.1** — zu alt, wird in Schritt 1 gehoben |
| Python | 3.12.3 ✓ |
| Frei | 8777 und 8790 sind unbelegt ✓ |
| Platz | 7,7 GB RAM (4 GB frei), 24 GB Plattenplatz ✓ |
| Sonstiges | Docker auf 8055, ein Python-Dienst auf 127.0.0.1:8000 — beide unberührt |

## Die Adresse

**`https://meccha-ranked.com`** — eigene Domain, unabhängig von `walk-buddy.app`
und von der alten Hetzner-Anmeldung.

Beim Domain-Anbieter eintragen:

| Typ | Name | Wert |
|---|---|---|
| **A** | `@` | `89.167.44.253` |
| **A** | `www` | `89.167.44.253` |
| AAAA *(optional)* | `@` | `2a01:4f9:c014:6fb2::1` |

Prüfen, sobald es sich verteilt hat (Minuten bis wenige Stunden):

```bash
dig +short meccha-ranked.com          # muss 89.167.44.253 zeigen
```

**`turnier` bekommt keine Adresse.** Es läuft auf dem Server nur intern, mc-ranked
erreicht es über `localhost:8777`. Von außen kommt niemand daran — auch OBS nicht,
so wie du es wolltest. Brauchst du das Overlay später doch von unterwegs, ist es ein
weiterer nginx-Block; heute lassen wir es zu.

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

**Node muss hoch.** v18 ist zu alt: der Code nutzt Dinge, die es dort noch nicht
gibt, und die Testsuite läuft gar nicht erst. Die anderen Dienste auf dem Server
stören sich nicht daran — Docker und der Python-Dienst bringen ihre eigenen
Laufzeiten mit.

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip rsync

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v          # muss v22.x zeigen
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
MC_OEFFENTLICHE_URL=https://meccha-ranked.com
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

## Schritt 6 · nginx

Auf dem Server läuft **nginx** mit drei Seiten. Kein Caddy — wir hängen uns an das
Vorhandene, sonst streiten sich zwei Programme um Port 443.

```bash
sudo tee /etc/nginx/sites-available/meccha-ranked.com >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name meccha-ranked.com;

    # Screenshots sind 2-5 MB gross. nginx laesst per Vorgabe nur 1 MB
    # durch und antwortet sonst mit 413 - der Zuschauer saehe nur einen
    # Fehler, ohne dass im Server-Log etwas steht.
    client_max_body_size 12m;

    # Der Admin-Schluessel steht in der Adresse (?key=...). Ohne diese
    # Zeile landet er in jeder Logzeile auf der Platte.
    access_log off;

    location / {
        proxy_pass http://127.0.0.1:8790;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Das Lesen eines Bildes dauert ein paar Sekunden. 60 s Vorgabe
        # reichen zwar, aber bei zwei Uploads gleichzeitig wird es knapp.
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/meccha-ranked.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Dann das Zertifikat — certbot trägt sich selbst in den Block ein und legt die
Umleitung von http auf https an:

```bash
sudo certbot --nginx -d meccha-ranked.com
```

> Ist certbot noch nicht da: `sudo apt install -y certbot python3-certbot-nginx`.
> Für `chew.` und `cms.` läuft schon eines, also vermutlich vorhanden.

### Die Ports zumachen

`turnier` und mc-ranked lauschten frueher auf **allen** Schnittstellen. Damit
waren `89.167.44.253:8777` und `:8790` direkt erreichbar - an nginx vorbei,
**ohne TLS**, und beim Turnier-Server auch das Admin-Panel.

Das ist inzwischen im Code geloest und nicht mehr deine Aufgabe: beide Dienste
binden an `127.0.0.1` und nehmen nur noch Verbindungen von der Maschine selbst
an. nginx laeuft dort ebenfalls und spricht sie ueber localhost an - fuer den
aendert sich nichts. Von aussen sind die Ports nicht gefiltert, sondern gar
nicht vorhanden.

```bash
# Nachpruefen, dass wirklich nur localhost dranhaengt:
sudo ss -tlnp | grep -E '8777|8790'
```

Richtig sieht so aus - `127.0.0.1:8790`, **nicht** `0.0.0.0:8790` oder `*:8790`:

```
LISTEN 0 511 127.0.0.1:8777 0.0.0.0:*  users:(("node",pid=...))
LISTEN 0 511 127.0.0.1:8790 0.0.0.0:*  users:(("node",pid=...))
```

Von aussen gegenpruefen, von deinem PC:

```bash
curl -m 5 http://89.167.44.253:8790/api/status    # muss ins Leere laufen
```

> **Keine Firewall noetig.** Eine fruehere Fassung dieser Anleitung liess dich
> hier `ufw` einschalten. Das ist der gefaehrlichere Weg: kommt `ufw enable`,
> bevor die Regel fuer Port 22 wirklich steht, sperrt es dich aus deinem
> eigenen Server aus, und es nimmt **alle** Dienste mit - auch die, die mit
> mc-ranked nichts zu tun haben. Zurueck kommst du dann nur ueber die
> Hetzner-Konsole mit `sudo ufw disable`. Die Bindung an localhost loest
> dasselbe Problem und kann dir dabei nichts kaputt machen.
>
> Willst du das Overlay im Heimnetz von einem zweiten Geraet holen, startest
> du `turnier` lokal mit `HOST=0.0.0.0`. Auf dem Server bleibt es zu.

> **Kein Overlay von außen.** `turnier` bleibt damit intern, so wie besprochen.
> Brauchst du das Scoreboard später doch von unterwegs, ist es ein zweiter
> nginx-Block plus DNS-Eintrag — aber dann bedenke: `TURNIER_KEY` schützt nur die
> Schreibzugriffe (`server.js:76`), `/admin` und `/api/state` wären lesbar.

---

## Schritt 7 · Client neu bauen

Auf **deinem PC**, in `mc-ranked/config/verteilung.json`:

```json
{
  "server": "https://meccha-ranked.com",
  "clientVersion": "0.4.0",
  "discord": "https://discord.gg/W7tHtSu4p"
}
```

Dann `client-cs\BAUEN.bat`. Die neue `Meccha-Ranked.exe` nach
`/opt/meccha/mc-ranked/client-cs/` hochladen — ab dann lädt sie jeder über
`https://meccha-ranked.com/client`.

**`clientVersion` unbedingt hochzählen.** Der Server meldet die Zahl über `/api/wer`;
wer noch die alte Fassung hat, sieht dann „NEUE FASSUNG verfügbar". Ohne das senden
alte Programme weiter an `localhost:8790` — also ins Leere — und niemand merkt es.

---

## Schritt 8 · Abnahme

Der Reihe nach, jedes einzeln prüfen:

- [ ] `https://meccha-ranked.com/konto` lädt, Zertifikat gültig
- [ ] **Mit Steam anmelden** funktioniert und leitet zurück
- [ ] Ingame-Namen eintragen, Token wird angezeigt
- [ ] `https://meccha-ranked.com/client` lädt die `.exe` herunter
- [ ] Client starten, Token einfügen — Kopfzeile zeigt `Im Spiel: …`
- [ ] Eine Runde per F9 einreichen
- [ ] Dashboard `https://meccha-ranked.com/?key=…` zeigt sie
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
| **Admin-Schlüssel in der URL** | `?key=…` landet in Proxy-Logs. Deshalb `access_log off` |
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
