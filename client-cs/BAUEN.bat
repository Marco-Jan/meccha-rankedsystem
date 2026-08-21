@echo off
title Meccha Ranked - Client bauen
cd /d "%~dp0"

REM ===================================================================
REM  Baut den Zuschauer-Client zu einer einzigen .exe.
REM
REM  Gebaut wird gegen .NET Framework 4, das auf jedem Windows liegt -
REM  die fertige Datei braucht deshalb keine Installation und ist rund
REM  24 KB gross. Der Compiler csc.exe gehoert zu Windows, es muss
REM  nichts nachinstalliert werden.
REM
REM  Serveradresse aendern: config\verteilung.json im uebergeordneten
REM  Ordner, dann diese Datei erneut ausfuehren. Am Code aendert sich
REM  nichts.
REM ===================================================================

set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe

if not exist "%CSC%" (
  echo.
  echo   FEHLER: csc.exe nicht gefunden unter
  echo   %CSC%
  echo.
  echo   Das .NET Framework 4 gehoert eigentlich zu Windows. Pruefe,
  echo   ob der Ordner existiert.
  echo.
  pause
  exit /b 1
)

echo.
echo   Lese Serveradresse aus ..\config\verteilung.json ...

REM  Die Adresse in Vorgabe.cs schreiben - so bleibt sie ausserhalb des
REM  Codes und der Umzug ist eine Aenderung an einer JSON-Datei.
node "%~dp0vorgabe-schreiben.cjs"
if errorlevel 1 (
  echo   WARNUNG: Vorgabe konnte nicht gesetzt werden, nehme was in Kern.cs steht.
)

REM  Haelt fest, welche Quellen unter welcher Nummer gebaut wurden - und
REM  bricht ab, wenn sich der Code geaendert hat, clientVersion aber nicht.
REM  Sonst meldet der Server dieselbe Zahl, die in der alten .exe steht,
REM  der Hinweis auf die neue Fassung bleibt aus, und zwei verschiedene
REM  Dateien heissen gleich. Genau das ist beim Japanisch-Umbau passiert.
node "%~dp0stempeln.cjs"
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo   Uebersetze ...
REM  -codepage:65001 ist Pflicht: ohne ihn liest csc.exe die Quellen in
REM  der Windows-Codepage. Aus "primaer" wurde so schon einmal Buchstaben-
REM  salat in der fertigen .exe, und die chinesischen Texte wuerden ganz
REM  zerfallen. Die Dateien haben zusaetzlich eine BOM - doppelt haelt.
"%CSC%" -nologo -target:winexe -optimize+ -codepage:65001 ^
  -out:"Meccha-Ranked.exe" ^
  -r:System.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Core.dll ^
  Kern.cs Sprache.cs Fenster.cs

if errorlevel 1 (
  echo.
  echo   FEHLER beim Uebersetzen - siehe oben.
  echo.
  pause
  exit /b 1
)

REM ===================================================================
REM  Als ZIP verpacken.
REM
REM  Chrome blockt eine unsignierte .exe von einer noch unbekannten
REM  Domain hart weg - "Verdaechtiger Download blockiert", ohne Knopf
REM  zum Trotzdem-Laden. Ein Archiv laesst es durch. Der Server liefert
REM  darum die ZIP aus, wenn eine bereitliegt.
REM
REM  tar gehoert seit Windows 10 zum System, es muss nichts nachinstal-
REM  liert werden. -a waehlt das Format anhand der Endung.
REM ===================================================================
echo.
echo   Verpacke ...
if exist "%~dp0Meccha-Ranked.zip" del "%~dp0Meccha-Ranked.zip"
tar -a -c -f "%~dp0Meccha-Ranked.zip" -C "%~dp0" Meccha-Ranked.exe
if errorlevel 1 (
  echo   WARNUNG: ZIP konnte nicht erzeugt werden - der Server liefert dann die .exe aus.
)

echo.
echo   Fertig: %~dp0Meccha-Ranked.exe
echo.
echo   Weitergeben: die .exe. Beim ersten Start legt sie
echo   client.json daneben an; die Serveradresse ist schon eingetragen,
echo   der Zuschauer muss nur seinen Token einfuegen.
echo.
pause
