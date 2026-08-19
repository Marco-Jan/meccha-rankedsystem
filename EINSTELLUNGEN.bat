@echo off
REM ===================================================================
REM  ZENTRALE EINSTELLUNGEN - hier und nirgends sonst.
REM
REM  Diese Datei wird von MECCHA-START.bat eingelesen. Beim Umzug auf
REM  einen anderen Server aenderst du NUR hier etwas, nichts am Code.
REM ===================================================================

REM --- Turnier-Server -------------------------------------------------
REM  TEST : http://localhost:8778   (npm run testserver, Wegwerf-Kopie)
REM  LIVE : http://localhost:8777   (turnier\START.bat, echte Daten)
REM  Auf dem Hetzner: https://turnier.deine-domain.de
set TURNIER_URL=http://localhost:8778

REM --- Passwort fuer die Freigabeseite --------------------------------
REM  Sobald der Server aus dem Internet erreichbar ist: etwas Langes,
REM  Zufaelliges nehmen.
set MC_ADMIN_KEY=geheim

REM --- Port des mc-ranked-Servers -------------------------------------
set MC_PORT=8790

REM --- Turnier-Server mitstarten? (1 = ja) ----------------------------
REM  Auf 0 setzen, wenn turnier woanders laeuft, z.B. auf dem Hetzner.
set TURNIER_MITSTARTEN=1

REM  1 = Wegwerf-Kopie (npm run testserver), 0 = turnier\START.bat
set TURNIER_ALS_TEST=1
