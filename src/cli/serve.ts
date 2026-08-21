/* =========================================================================
   SERVE - startet den mc-ranked-Server.

   Nimmt hochgeladene Runden entgegen und stellt die Freigabeseite bereit.

     npm run serve                 auf Port 8790
     npm run serve -- --port 9000

   Umgebung:
     MC_PORT        Port (Standard 8790)
     MC_ADMIN_KEY   Schluessel fuer die Freigabeseite - OHNE ihn ist sie
                    gesperrt, nicht offen.
     MC_DATEN       wo Rangliste, Konten und Zugaenge liegen

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { baueServer } from '../server.js';
import { ladeFreigabeliste } from '../freigabe.js';
import { ladeTokens } from '../tokens.js';
import { ladeKonten } from '../konten.js';
import { ladeRangliste } from '../rangliste.js';
import { ladeListen } from '../listen.js';
import { ladeWertung } from '../wertung.js';
import { leserBeschreibung } from '../leser-wahl.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.join(HIER, '..', '..');

const DATEN_DIR = process.env.MC_DATEN || path.join(PROJEKT, 'daten');
const BILDER_DIR = process.env.MC_UPLOADS || path.join(DATEN_DIR, 'uploads');

/**
 * Unter welcher Adresse dieser Server von aussen erreichbar ist.
 *
 * Steam leitet nach der Anmeldung dorthin zurueck. Lokal reicht
 * localhost - Steam akzeptiert das. Auf dem Server die oeffentliche
 * Adresse eintragen, dann ist der Umzug eine Zeile in der START.bat
 * statt einer Codeaenderung.
 */
const OEFFENTLICHE_URL = process.env.MC_OEFFENTLICHE_URL ||
  ('http://localhost:' + (process.env.MC_PORT || 8790));

/**
 * Wie lange das ORIGINAL eines hochgeladenen Bildes liegen bleibt.
 *
 * Drei Tage. Frueher waren es 24 Stunden, weil ein Screenshot rund 2 MB
 * wiegt und der Platz knapp ist. Seit der Ranglisten-Block beim
 * Hochladen ausgeschnitten und DAUERHAFT aufgehoben wird (ausschnitt.ts,
 * ~55 KB), ist das Original nur noch fuer den seltenen Fall da, dass man
 * den ganzen Bildschirm sehen will.
 *
 * Drei Tage heisst: am Wochenende kann man die Woche noch durchsehen.
 * Hoechststand rund 500 MB, auch bei viel Betrieb.
 *
 * Geflaggte Runden behalten ihr Original 30 Tage - siehe freigabe.ts.
 */
const BILD_STUNDEN = Number(process.env.MC_BILD_STUNDEN || 72);


/** Zeitpunkt ohne Umlaute und ohne Abhaengigkeit von der Systemsprache. */
function zeitpunkt(t: number | null): string {
  if (t === null) return '(nie)';
  return new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function zahlArg(argv: readonly string[], flagge: string, standard: number): number {
  const i = argv.indexOf(flagge);
  if (i < 0) return standard;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : standard;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const port = zahlArg(argv, '--port', Number(process.env.MC_PORT || 8790));

  /* Nur die eigene Maschine darf den Port sehen. Auf dem Server steht nginx
     davor und spricht ueber localhost - fuer den aendert sich nichts, aber
     der Umweg an Zertifikat und Verschluesselung vorbei faellt weg. Wer den
     Dienst wirklich ins Netz haengen will, setzt MC_HOST=0.0.0.0. */
  const host = process.env.MC_HOST || '127.0.0.1';
  const adminKey = process.env.MC_ADMIN_KEY || '';

  const freigabe = ladeFreigabeliste(path.join(DATEN_DIR, 'freigabe.json'));
  const tokens = ladeTokens(path.join(DATEN_DIR, 'tokens.json'));
  const konten = ladeKonten(path.join(DATEN_DIR, 'konten.json'), tokens);

  /*
     Die Wertung: Rangliste (die Punkte) und Konten (wer dahintersteckt),
     zusammengefuehrt in wertung.ts.

     Bewusst hier verdrahtet und nicht im Server: server.ts kennt nur
     "hole den Stand" und "trag das ein", und die Tests setzen dafuer
     etwas anderes ein.
  */
  const rangliste = ladeRangliste(path.join(DATEN_DIR, 'rangliste.json'));
  const listen = ladeListen(path.join(DATEN_DIR, 'listen.json'));
  const wertung = ladeWertung(rangliste, konten, listen);

  /* Bevorzugt die .exe, faellt auf die ZIP zurueck.

     Umgedreht am 21.08.2026. Die ZIP sollte Chromes Warnung umgehen -
     sie tut es nicht: ein Archiv mit einer unsignierten .exe darin wird
     genauso gemeldet. Damit blieb von ihr nur der Nachteil, und der ist
     nicht klein: entpacken ist ein zusaetzlicher Schritt, den nicht jeder
     kann, und ein Programm, das man erst auspacken muss, wirkt
     umstaendlicher als es ist.

     Eine Warnung, die man wegklickt, ist besser als eine Warnung PLUS
     ein Arbeitsschritt. Erklaert wird sie auf /download. */

  const server = baueServer({
    freigabe,
    tokens,
    bilderDir: BILDER_DIR,
    adminKey,
    oeffentlichDir: path.join(PROJEKT, 'public'),
    konten,
    listen,
    oeffentlicheUrl: OEFFENTLICHE_URL,
    holeStand: () => wertung.stand(),
    eintragen: (kontoId, punkte) => { wertung.eintragen(kontoId, punkte); }
  });

  server.listen(port, host, () => {
    const stand = wertung.stand();
    console.log('');
    console.log('  ############################################');
    console.log('  #   M C - R A N K E D   S E R V E R        #');
    console.log('  ############################################');
    console.log('');
    console.log('  Upload    ->  POST http://localhost:' + port + '/api/runde');
    if (adminKey) {
      console.log('  Freigabe  ->  http://localhost:' + port + '/?key=' + adminKey);
    } else {
      console.log('  Freigabe  ->  GESPERRT (MC_ADMIN_KEY nicht gesetzt)');
    }
    console.log('');
    console.log('  Rangliste ->  ' + OEFFENTLICHE_URL + '/');
    console.log('  Leser     :  ' + leserBeschreibung());
    console.log('  Konto     ->  ' + OEFFENTLICHE_URL + '/konto');
    console.log('');
    console.log('  Tokens    :  ' + tokens.alle().length +
      ' (' + tokens.alle().filter((t) => t.vertraut).length + ' vertraut)');
    console.log('  Konten    :  ' + konten.alle().length + ' angemeldet');
    console.log('  Offen     :  ' + freigabe.offene().length + ' Runden');
    const aktiveListen = stand.listen.filter((l) => l.aktiv);
    console.log('  Listen    :  ' + (aktiveListen.length
      ? aktiveListen.map((l) => l.name + ' (' + l.eintraege + ')').join(', ')
      : 'KEINE AKTIVE - freigegebene Runden landen nirgends!'));
    console.log('  Wertung   :  ' + stand.eintraege + ' Eintraege gesamt, ' +
      aktiveListen.reduce((n, l) => n + l.gewertet.length, 0) + ' in der Wertung');
    console.log('  Spieler   :  ' + stand.spieler.length + ' mit Ingame-Namen' +
      (stand.spieler.length === 0
        ? '  <- ohne die kann nichts zugeordnet werden!' : ''));
    console.log('  Bilder    :  ' + BILDER_DIR + '  (Loeschung nach ' + BILD_STUNDEN + ' h)');
    console.log('');
    if (!adminKey) {
      console.log('  ACHTUNG: ohne MC_ADMIN_KEY kannst du nichts freigeben.');
      console.log('  In der START.bat setzen:  set MC_ADMIN_KEY=deinschluessel');
      console.log('');
    }
    console.log('  Beenden mit STRG+C');
    console.log('');
  });

  // Beim Start und danach stuendlich aufraeumen. Das Loeschen betrifft nur
  // entschiedene Runden - offene behalten ihr Bild, sonst waere die
  // Freigabe nicht mehr pruefbar.
  const aufraeumen = () => {
    const weg = freigabe.bilderAufraeumen(BILD_STUNDEN);
    if (weg > 0) console.log('  ' + weg + ' Bild(er) nach Ablauf der Frist geloescht');
  };
  aufraeumen();
  setInterval(aufraeumen, 60 * 60 * 1000);



  process.on('SIGINT', () => {
    freigabe.jetztSpeichern();
    console.log('');
    console.log('  Beendet.');
    process.exit(0);
  });
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});
