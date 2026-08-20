@echo off
title Meccha - Wache (F9 = Runde eintragen)
cd /d "%~dp0"

REM ===================================================================
REM  Laeuft neben dem Spiel und wartet auf deinen Tastendruck.
REM  Einmal starten, den ganzen Stream liegen lassen.
REM
REM  F9 druecken, wenn die Rangliste im Spiel zu sehen ist - das geht
REM  auch, waehrend das Spiel im Vordergrund ist.
REM ===================================================================

REM Welcher Bildschirm? Herausfinden mit:  npm run runde -- --bildschirme
set BILDSCHIRM=2

REM Welche Taste? F1 bis F12, DRUCK, ENDE, POS1, EINFG, NUM0 bis NUM9
set TASTE=F9

call npm run wache --silent -- --bildschirm %BILDSCHIRM% --taste %TASTE% --eintragen

echo.
pause
