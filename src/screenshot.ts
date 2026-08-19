/* =========================================================================
   BILDSCHIRMAUFNAHME mit Windows-Bordmitteln.

   Kein OBS, keine Zusatzsoftware, keine Abhaengigkeit: PowerShell kann
   ueber System.Drawing den Bildschirminhalt kopieren. Das reicht fuer den
   Zweck und laesst sich spaeter durch OBS-WebSocket ersetzen, ohne dass
   der Rest sich aendert.

   Bekannte Grenze: im EXKLUSIVEN Vollbild liefert CopyFromScreen bei
   manchen Spielen ein schwarzes Bild. Meccha im randlosen Fenster
   (borderless) funktioniert - dafuer spricht auch, dass der Screenshot,
   den Baloou geschickt hat, 1901x1077 gross war, also ein Fensterinhalt.
   Falls doch schwarz: im Spiel auf randloses Fenster umstellen.
   ========================================================================= */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface Aufnahme {
  readonly bild: Buffer;
  /** Wohin das Bild gelegt wurde - bleibt liegen, damit man nachsehen kann. */
  readonly datei: string;
  readonly breite: number;
  readonly hoehe: number;
}

/*
   Die Rohdaten muessen ueberleben. Wenn eine Runde falsch gelesen wurde,
   ist der Screenshot die einzige Moeglichkeit, das nachzuvollziehen oder
   spaeter mit einem besseren Modell neu zu lesen. Dieselbe Ueberlegung wie
   bei rohPunkte in parse.ts.
*/
export const BILDER_DIR = process.env.MC_BILDER || path.join(tmpdir(), 'mc-ranked-bilder');

/**
 * Nimmt einen Bildschirm auf.
 *
 * bildschirm: 0 = primaerer, sonst der Index aus AllScreens (siehe
 * listeBildschirme). Bei mehreren Monitoren ist das noetig - das Spiel
 * laeuft nicht zwangslaeufig auf dem primaeren.
 */
export interface Ausschnitt {
  readonly x: number;
  readonly y: number;
  readonly breite: number;
  readonly hoehe: number;
}

/**
 * Nimmt einen Bildschirm auf - ganz oder nur einen Ausschnitt.
 *
 * Der Ausschnitt ist kein Luxus, sondern noetig: ein voller 1920x1080-
 * Desktop hat das Modell 235 Sekunden gekostet, derselbe Inhalt als
 * kleiner Ausschnitt braucht Sekunden. Und weniger Bild heisst weniger
 * fremder Text, den das Modell faelschlich fuer die Rangliste haelt.
 */
export function nimmAuf(bildschirm = 0, ziel?: string, aus?: Ausschnitt): Aufnahme {
  mkdirSync(BILDER_DIR, { recursive: true });

  const datei = ziel ?? path.join(
    BILDER_DIR,
    'runde-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png'
  );

  /*
     Der Zielpfad geht als Umgebungsvariable an PowerShell, nicht in den
     Skripttext. Damit entfaellt jedes Escaping von Backslashes und
     Apostrophen - bei Windows-Pfaden die haeufigste Fehlerquelle.
  */
  const skript = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
    '$alle = [System.Windows.Forms.Screen]::AllScreens',
    '$i = [int]$env:MC_BILDSCHIRM',
    'if ($i -le 0) { $s = [System.Windows.Forms.Screen]::PrimaryScreen }',
    'else { $s = $alle[$i - 1] }',
    'if ($null -eq $s) { throw "Bildschirm $i gibt es nicht" }',
    '$b = $s.Bounds',
    // Ausschnitt relativ zum gewaehlten Bildschirm, nicht zum Gesamtdesktop -
    // sonst muesste man bei einem linken Zweitmonitor negative Werte angeben.
    'if ($env:MC_AUS) {',
    '  $t = $env:MC_AUS -split ","',
    '  $ax = $b.X + [int]$t[0]; $ay = $b.Y + [int]$t[1]',
    '  $aw = [int]$t[2]; $ah = [int]$t[3]',
    '} else {',
    '  $ax = $b.X; $ay = $b.Y; $aw = $b.Width; $ah = $b.Height',
    '}',
    '$bmp = New-Object System.Drawing.Bitmap $aw, $ah',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($ax, $ay, 0, 0, (New-Object System.Drawing.Size $aw, $ah))',
    '$bmp.Save($env:MC_ZIEL, [System.Drawing.Imaging.ImageFormat]::Png)',
    '$g.Dispose(); $bmp.Dispose()',
    'Write-Output "$aw $ah"'
    // Mit Zeilenumbruechen verbinden, NICHT mit Semikolon: ein ';' vor
    // 'else' beendet das if-Statement, PowerShell sieht dann ein nacktes
    // 'else' und bricht ab.
    /*
       Mit Zeilenumbruechen verbinden, NICHT mit Semikolon: ein ';' direkt
       vor 'else' beendet das if-Statement, PowerShell sieht dann ein
       nacktes 'else' und bricht mit CommandNotFound ab.
    */
  ].join(String.fromCharCode(10));

  let ausgabe: string;
  try {
    ausgabe = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', skript], {
      encoding: 'utf8',
      timeout: 30000,
      // Kein Fenster aufpoppen lassen - siehe tasten.ts.
      windowsHide: true,
      env: {
        ...process.env,
        MC_ZIEL: datei,
        MC_BILDSCHIRM: String(bildschirm),
        MC_AUS: aus ? [aus.x, aus.y, aus.breite, aus.hoehe].join(',') : ''
      }
    }).trim();
  } catch (err) {
    throw new Error('Bildschirmaufnahme fehlgeschlagen: ' + (err as Error).message);
  }

  if (!existsSync(datei)) throw new Error('Bildschirmaufnahme hat keine Datei erzeugt: ' + datei);

  const teile = ausgabe.split(/\s+/);
  return {
    bild: readFileSync(datei),
    datei,
    breite: Number(teile[0]) || 0,
    hoehe: Number(teile[1]) || 0
  };
}

export interface BildschirmInfo {
  readonly nummer: number;
  readonly name: string;
  readonly breite: number;
  readonly hoehe: number;
  readonly primaer: boolean;
}

/** Zeigt, welche Bildschirme es gibt - fuer die Wahl von --bildschirm. */
export function listeBildschirme(): BildschirmInfo[] {
  const skript = `
Add-Type -AssemblyName System.Windows.Forms
$i = 0
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $i++
  Write-Output "$i|$($s.DeviceName)|$($s.Bounds.Width)|$($s.Bounds.Height)|$($s.Primary)"
}`.trim();

  const ausgabe = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', skript], {
    encoding: 'utf8', timeout: 15000, windowsHide: true
  });

  return ausgabe.trim().split(/\r?\n/).filter(Boolean).map((z) => {
    const [nummer, name, breite, hoehe, primaer] = z.split('|');
    return {
      nummer: Number(nummer),
      name: String(name),
      breite: Number(breite),
      hoehe: Number(hoehe),
      primaer: primaer === 'True'
    };
  });
}
