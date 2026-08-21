# Projekt-Updates & Known Issues

## ✅ Erledigt in v.4.1.0 (21.08.2026)

* **1. Spieler-Lobby-Zähler (7 statt 8)** — behoben.
  * Kein Off-by-One im Index. Zwei andere Ursachen, an `heseder3.JPG` nachgemessen:
    ein Name **ohne lesbare Zahl** fiel lautlos heraus (traf Caspian, dessen `567`
    auf hellem Marmor liegt), und OCR zerlegt manchmal `#2 Baloou` in zwei Kästen,
    worauf sich das Rangzeichen die Punktzahl nahm und der echte Name herausfiel.
  * Solche Zeilen zählen jetzt mit, aber nur auf einer freien **Rasterstelle** —
    ohne diese Bedingung wurden aus buntem Boden acht Zeilen Weltinhalt.

* **2. OCR / Score-Erkennung** — teilweise behoben.
  * Die **Kopfzeile** stand mit im Streifen (liegt bei y 450–472, gelesen wurde ab 465).
    Jetzt ab 477.
  * Für die abgeschnittene führende `1` fand sich **kein Beleg**: breiter lesen brachte
    nur Rauschen. Offen bleibt die **Polarität über hellem Grund** — dort behält der
    Farbfilter den Untergrund und wirft die Schrift weg. Ein Rasterversuch mit lokalem
    Schwellwert war insgesamt schlechter als der Farbfilter (6/8) und wurde verworfen.
  * **Grüner Name** (der des Absenders): von 345 grünen Pixeln in „Baloou" überlebten
    nur 109 — die Schranken `r<130`/`b<130` warfen die hellen Kanten weg. Ohne sie
    wird der Name wieder gelesen.

* **3. Falsche Versionsbenachrichtigung** — behoben.
  * Der Client verglich mit `!=` statt „neuer als" und riet damit zum Downgrade.
  * Auslöser war ein stehengebliebener Server: die `.exe` lag per scp oben, das Repo
    war nie gezogen. `deploy.sh` fragt jetzt den **laufenden Dienst** nach seiner
    Fassung statt die lokale Datei zu lesen.

* **4. UX-Hinweis im Client** — eingebaut.
  * „Erst am Ende der Runde drücken – die Punkte laufen bis zuletzt weiter."
    Dauerhaft im Infokasten, in allen vier Sprachen.

## 🐛 Noch offen

* **Polarität über hellem Untergrund.** Liegt die Rangliste über hellem Boden, kippt
  der Farbfilter: der Untergrund wird behalten, die Schrift fällt heraus. Betroffene
  Zeilen werden zur Rückfrage statt still falsch — aber gelesen werden sie nicht.
  Braucht echte PNGs aus dem Spiel, kein nachkomprimiertes JPG.

---

## 🎯 Nächste Schritte & Test-Strategie

* **Keine automatisierten Unit-Tests im aktuellen Schritt:**
  * Die bisherigen Mocks/Tests spiegeln die Realität nicht zu 100 % wider und verbrauchen zu viele Ressourcen.
* **Fokus auf Live-Testing:**
  * Wir führen direkte **Real-Life-Tests** durch, um das Auslesen der Werte unter echten Bedingungen zu prüfen und anzupassen.
  * Erst wenn die Bild- und Datenerkennung im Live-Betrieb stabil funktioniert, werden bei Bedarf wieder gezielte automatisierte Tests geschrieben.