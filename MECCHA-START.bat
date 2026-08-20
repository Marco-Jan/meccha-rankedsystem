@echo off
title Meccha Ranked
cd /d "%~dp0"

REM ===================================================================
REM  EIN KNOPFDRUCK - startet den Server und oeffnet die Verwaltung.
REM
REM  Was eingestellt wird, steht in EINSTELLUNGEN.bat. Hier drin ist
REM  absichtlich nichts festverdrahtet.
REM
REM  Frueher startete diese Datei zusaetzlich den Turnier-Server aus
REM  dem Nachbarordner - von dort kamen Namensliste und Punkteliste.
REM  Seit dem 20.08.2026 ist mc-ranked eigenstaendig, siehe UMBAU.md.
REM  Es gibt nur noch einen Dienst zu starten.
REM ===================================================================

call "%~dp0EINSTELLUNGEN.bat"

echo.
echo   Meccha Ranked - Start
echo.
echo   Verwaltung : http://localhost:%MC_PORT%/?key=%MC_ADMIN_KEY%
echo   Rangliste  : http://localhost:%MC_PORT%/
echo.

echo   Starte mc-ranked-Server ...
start "mc-ranked" /min cmd /c "npm run serve"

timeout /t 5 /nobreak >nul

echo   Oeffne die Verwaltung ...
start "" "http://localhost:%MC_PORT%/?key=%MC_ADMIN_KEY%"

echo.
echo   Fertig. Der Server laeuft minimiert in der Taskleiste.
echo   Zum Beenden dort STRG+C druecken oder das Fenster schliessen.
echo.
timeout /t 4 /nobreak >nul
