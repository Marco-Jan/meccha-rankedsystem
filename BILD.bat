@echo off
title Meccha - Screenshot fuer die Kalibrierung
cd /d "%~dp0"

REM ===================================================================
REM  Macht NUR einen Screenshot. Kein Server, kein Modell noetig.
REM
REM  Vorher im Spiel:
REM    - Rangliste einblenden
REM    - Taste 2 druecken (Namensschilder aus)
REM ===================================================================

set BILDSCHIRM=3
set WARTEN=8

call npm run bild --silent -- --bildschirm %BILDSCHIRM% --warte %WARTEN%

echo.
pause
