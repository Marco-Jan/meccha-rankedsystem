# Projekt-Updates & Known Issues

## 🐛 Bekannte Fehler & Anmerkungen

* **1. Spieler-Lobby-Zähler (Off-by-One Error)**
  * **Problem:** Der Reader zählt eine Person zu wenig (z. B. 7 statt 8 Spieler in der Lobby).
  * **Vermutete Ursache:** Nullbasierter Index (`0` bis `7` entspricht 8 Spielern, wird aber fälschlicherweise als Gesamtzahl `7` ausgegeben).

* **2. OCR / Score-Erkennung ungenau**
  * **Problem:** Punkte werden bei manchen Runden unvollständig ausgelesen.
  * **Beispiel:** Eine führende `1` bei `1665` Punkten wird ignoriert, woraufhin nur `665` erkannt werden.

* **3. Falsche Versionsbenachrichtigung im Client**
  * **Problem:** Der Client zeigt fälschlicherweise an, dass Version `0.5.0` verfügbar sei, obwohl aktuell bereits Version `0.7.0` läuft.

* **4. UI-Erweiterung / UX-Hinweis**
  * **Anforderung:** Eine kleine Info-Box neben dem "Bereit"-Button (F9) im Client hinzufügen.
  * **Inhalt:** Hinweis an den Nutzer, bis ganz zum Schluss mit dem Einreichen zu warten, da sich die Punktzahl in den letzten Sekunden noch verändern kann.

---

## 🎯 Nächste Schritte & Test-Strategie

* **Keine automatisierten Unit-Tests im aktuellen Schritt:**
  * Die bisherigen Mocks/Tests spiegeln die Realität nicht zu 100 % wider und verbrauchen zu viele Ressourcen.
* **Fokus auf Live-Testing:**
  * Wir führen direkte **Real-Life-Tests** durch, um das Auslesen der Werte unter echten Bedingungen zu prüfen und anzupassen.
  * Erst wenn die Bild- und Datenerkennung im Live-Betrieb stabil funktioniert, werden bei Bedarf wieder gezielte automatisierte Tests geschrieben.