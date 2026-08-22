/* =========================================================================
   WAS IN DEN DATEIEIGENSCHAFTEN STEHT

   Bis zum 22.08.2026 stand dort nichts. Ein Rechtsklick auf die .exe,
   Reiter "Details" - leer. Kein Produktname, kein Hersteller, keine
   Versionsangabe.

   Fuer einen Menschen ist das nur unfreundlich. Fuer ein
   Erkennungsmodell ist es ein Merkmal: eine namenlose Datei, die
   Bildschirmfotos macht und ins Netz sendet, sieht aus wie etwas, das
   nicht gefunden werden will. Windows Defender hat sie darauf als
   Schaedling eingestuft.

   Nichts davon macht das Programm ungefaehrlicher. Es nimmt der
   Heuristik nur das weg, woran sie sich festhaelt - und dem Zuschauer
   die Frage, was da eigentlich laeuft.

   csc.exe macht aus diesen Angaben eine Win32-Versionsressource, ganz
   ohne Werkzeug drumherum. Die Version wird beim Bauen ersetzt, siehe
   vorgabe-schreiben.cjs.
   ========================================================================= */

using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("Meccha Ranked")]
[assembly: AssemblyDescription("Schickt das Ergebnis einer Meccha-Runde an die Rangliste.")]
[assembly: AssemblyProduct("Meccha Ranked")]
[assembly: AssemblyCompany("Marco Jan")]
[assembly: AssemblyCopyright("© 2026 Marco Jan · MIT-Lizenz")]

/* Vier Stellen, weil Windows das so erwartet. Die vierte bleibt 0 - wir
   zaehlen in drei, wie ueberall im Projekt. */
[assembly: AssemblyVersion("0.17.0.0")]
[assembly: AssemblyFileVersion("0.17.0.0")]

[assembly: ComVisible(false)]
