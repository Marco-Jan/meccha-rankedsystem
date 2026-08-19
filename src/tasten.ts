/* =========================================================================
   GLOBALER HOTKEY

   Die Aufnahme soll ausloesen, waehrend das SPIEL im Vordergrund ist. Ein
   normales Tastatur-Einlesen im Konsolenfenster hilft da nicht - das
   bekommt nur Tasten, wenn es selbst den Fokus hat.

   Deshalb fragt ein PowerShell-Prozess ueber GetAsyncKeyState aus user32
   den Tastenzustand systemweit ab. Kein Admin noetig, keine
   Zusatzsoftware, kein npm-Paket.

   Bewusst NICHT RegisterHotKey: das wuerde die Taste global belegen und
   dem Spiel wegnehmen. GetAsyncKeyState schaut nur zu - drueckst du die
   Taste, bekommt das Spiel sie trotzdem.
   ========================================================================= */

import { spawn, type ChildProcess } from 'node:child_process';

/* Virtual-Key-Codes. F-Tasten, weil die im Spiel meist frei sind. */
const TASTEN: ReadonlyMap<string, number> = new Map([
  ['F1', 0x70], ['F2', 0x71], ['F3', 0x72], ['F4', 0x73],
  ['F5', 0x74], ['F6', 0x75], ['F7', 0x76], ['F8', 0x77],
  ['F9', 0x78], ['F10', 0x79], ['F11', 0x7A], ['F12', 0x7B],
  ['DRUCK', 0x2C],          // Druck / PrintScreen
  ['ENDE', 0x23],           // Ende / End
  ['POS1', 0x24],           // Pos1 / Home
  ['EINFG', 0x2D],          // Einfg / Insert
  ['NUM0', 0x60], ['NUM1', 0x61], ['NUM2', 0x62], ['NUM3', 0x63],
  ['NUM4', 0x64], ['NUM5', 0x65], ['NUM6', 0x66], ['NUM7', 0x67],
  ['NUM8', 0x68], ['NUM9', 0x69]
]);

export function tastenListe(): string[] {
  return [...TASTEN.keys()];
}

export function codeFuer(name: string): number | null {
  return TASTEN.get(name.trim().toUpperCase()) ?? null;
}

export interface Waechter {
  /** Beendet den PowerShell-Prozess. */
  stopp(): void;
}

/**
 * Startet die Tastenueberwachung.
 *
 * beiDruck wird aufgerufen, sobald die Taste gedrueckt wurde. Waehrend der
 * Rueckruf laeuft, werden weitere Druecke ignoriert - sonst wuerde ein
 * zweiter Tastendruck mitten in einen laufenden Durchlauf platzen und die
 * Runde doppelt eintragen.
 */
export function ueberwache(code: number, beiDruck: () => Promise<void>): Waechter {
  const skript = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class MCTaste {',
    '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);',
    '}',
    '"@',
    '$vk = [int]$env:MC_TASTE',
    '$warGedrueckt = $false',
    'while ($true) {',
    '  $jetzt = ([MCTaste]::GetAsyncKeyState($vk) -band 0x8000) -ne 0',
    // Nur die FLANKE melden, nicht den Dauerzustand: sonst feuert
    // Gedrueckthalten hundertfach.
    '  if ($jetzt -and -not $warGedrueckt) {',
    '    Write-Output "DRUCK"',
    '    [Console]::Out.Flush()',
    '  }',
    '  $warGedrueckt = $jetzt',
    '  Start-Sleep -Milliseconds 40',
    '}'
  ].join(String.fromCharCode(10));

  const kind: ChildProcess = spawn(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', skript],
    {
      env: { ...process.env, MC_TASTE: String(code) },
      stdio: ['ignore', 'pipe', 'pipe'],
      /*
         OHNE DAS springt staendig ein PowerShell-Fenster in den
         Vordergrund. Sichtbar wurde es erst, als die .exe fensterlos
         gebaut wurde: vorher erbte der Unterprozess die Konsole des
         Programms, jetzt macht er sich mangels Konsole eine eigene auf.
         Mitten im Spiel ist das unertraeglich.
      */
      windowsHide: true
    }
  );

  let laeuft = false;
  let rest = '';

  kind.stdout?.on('data', (stueck: Buffer) => {
    rest += stueck.toString();
    const zeilen = rest.split(/\r?\n/);
    rest = zeilen.pop() ?? '';

    for (const z of zeilen) {
      if (z.trim() !== 'DRUCK') continue;
      if (laeuft) {
        console.log('  (laeuft noch - Tastendruck ignoriert)');
        continue;
      }
      laeuft = true;
      void beiDruck().finally(() => { laeuft = false; });
    }
  });

  return {
    stopp() { kind.kill(); }
  };
}
