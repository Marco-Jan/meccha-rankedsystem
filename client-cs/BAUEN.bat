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
REM  Relativ statt ueber %~dp0: dessen Backslashes landen in einem
REM  JavaScript-String und gelten dort als Escapes. BAUEN.bat wechselt
REM  oben ohnehin in seinen eigenen Ordner.
for /f "usebackq delims=" %%v in (`node -p "require('./../config/verteilung.json').clientVersion"`) do set FASSUNG=%%v
REM  Sonst meldet der Server dieselbe Zahl, die in der alten .exe steht,
REM  der Hinweis auf die neue Fassung bleibt aus, und zwei verschiedene
REM  Dateien heissen gleich. Genau das ist beim Japanisch-Umbau passiert.
node "%~dp0stempeln.cjs"
if errorlevel 1 (
  pause
  exit /b 1
)

REM  Die Fassung gehoert IN den Dateinamen. Ein Browser haengt sonst
REM  "(1)" an, und nach der dritten Fassung liegen drei Dateien herum,
REM  denen man nicht ansieht, welche welche ist. Am festen Platz unter
REM  %LOCALAPPDATA% heisst sie weiterhin schlicht Meccha-Ranked.exe -
REM  dort soll ja genau eine liegen, die ersetzt wird.
for /f "usebackq delims=" %%v in (`node -p "require('%~dp0..\configerteilung.json').clientVersion"`) do set FASSUNG=%%v
if "%FASSUNG%"=="" (
  echo   FEHLER: clientVersion nicht gelesen.
  pause
  exit /b 1
)
set AUSGABE=Meccha-Ranked-%FASSUNG%.exe

REM  Aeltere Faelle wegraeumen, damit nicht drei Fassungen nebeneinander
REM  liegen und man die falsche hochlaedt.
del /q "%~dp0Meccha-Ranked-*.exe" 2>nul
del /q "%~dp0Meccha-Ranked.exe" 2>nul

echo.
echo   Uebersetze ...
REM  -codepage:65001 ist Pflicht: ohne ihn liest csc.exe die Quellen in
REM  der Windows-Codepage. Aus "primaer" wurde so schon einmal Buchstaben-
REM  salat in der fertigen .exe, und die chinesischen Texte wuerden ganz
REM  zerfallen. Die Dateien haben zusaetzlich eine BOM - doppelt haelt.
"%CSC%" -nologo -target:winexe -optimize+ -codepage:65001 ^
  -out:"%AUSGABE%" ^
  -r:System.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Core.dll ^
  -win32icon:"meccha.ico" ^
  Kern.cs Sprache.cs Fenster.cs Angaben.cs

if errorlevel 1 (
  echo.
  echo   FEHLER beim Uebersetzen - siehe oben.
  echo.
  pause
  exit /b 1
)

REM ===================================================================
REM  Die ZIP ist am 22.08.2026 entfallen.
REM
REM  Sie war dafuer da, dass Chrome eine unsignierte .exe von einer
REM  unbekannten Domain nicht hart wegblockt. Seit die Datei bei GitHub
REM  liegt, gibt es dieses Problem nicht mehr - und ein Archiv, das man
REM  erst entpacken muss, ist fuer den Zuschauer ein Schritt mehr.
REM ===================================================================

echo.
echo   Fertig: %~dp0%AUSGABE%
echo.
echo   Weitergeben ueber ein GitHub-Release. Die Fassung steht im
echo   Dateinamen - so sieht jeder, welche er hat, und der Browser
echo   haengt kein "(1)" an.
echo.
echo   Pruefsumme fuer die Release-Notizen:
powershell -NoProfile -Command "(Get-FileHash '%~dp0%AUSGABE%' -Algorithm SHA256).Hash.ToLower()"
echo.
pause
