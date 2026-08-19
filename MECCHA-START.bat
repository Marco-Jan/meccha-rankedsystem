@echo off
title Meccha Ranked
cd /d "%~dp0"

REM ===================================================================
REM  EIN KNOPFDRUCK - startet alles und oeffnet die Freigabeseite.
REM
REM  Was eingestellt wird, steht in EINSTELLUNGEN.bat. Hier drin ist
REM  absichtlich nichts festverdrahtet.
REM ===================================================================

call "%~dp0EINSTELLUNGEN.bat"

echo.
echo   Meccha Ranked - Start
echo.
echo   Turnier  : %TURNIER_URL%
echo   Freigabe : http://localhost:%MC_PORT%/?key=%MC_ADMIN_KEY%
echo.

if "%TURNIER_MITSTARTEN%"=="1" (
  if "%TURNIER_ALS_TEST%"=="1" (
    echo   Starte Turnier-Server ^(Wegwerf-Kopie^) ...
    start "Turnier-Server" /min cmd /c "npm run testserver"
  ) else (
    echo   Starte Turnier-Server ^(ECHTE Daten^) ...
    start "Turnier-Server" /min cmd /c "%~dp0..\START.bat"
  )
  REM  Kurz warten, damit der Turnier-Server steht, bevor mc-ranked ihn
  REM  das erste Mal abfragt - sonst meldet er faelschlich "nicht
  REM  erreichbar".
  timeout /t 6 /nobreak >nul
)

echo   Starte mc-ranked-Server ...
start "mc-ranked" /min cmd /c "npm run serve"

timeout /t 5 /nobreak >nul

echo   Oeffne die Freigabeseite ...
start "" "http://localhost:%MC_PORT%/?key=%MC_ADMIN_KEY%"

echo.
echo   Fertig. Beide Server laufen minimiert in der Taskleiste.
echo   Zum Beenden dort STRG+C druecken oder die Fenster schliessen.
echo.
timeout /t 4 /nobreak >nul
