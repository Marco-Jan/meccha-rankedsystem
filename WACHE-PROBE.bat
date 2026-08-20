@echo off
title Meccha - Wache PROBE (traegt nichts ein)
cd /d "%~dp0"

REM Wie WACHE.bat, aber OHNE --eintragen: zeigt bei jedem Tastendruck
REM nur an, was passieren wuerde. Zum Einrichten und Ausprobieren.

set BILDSCHIRM=2
set TASTE=F9
call npm run wache --silent -- --bildschirm %BILDSCHIRM% --taste %TASTE%

echo.
pause
