/* =========================================================================
   SERVE - startet den mc-ranked-Server.

   Nimmt hochgeladene Runden entgegen und stellt die Freigabeseite bereit.

     npm run serve                 auf Port 8790
     npm run serve -- --port 9000

   Umgebung:
     MC_PORT        Port (Standard 8790)
     MC_ADMIN_KEY   Schluessel fuer die Freigabeseite - OHNE ihn ist sie
                    gesperrt, nicht offen.
     TURNIER_URL    wohin die freigegebenen Runden gehen

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baueServer } from '../server.js';
import { ladeFreigabeliste } from '../freigabe.js';
import { ladeTokens } from '../tokens.js';
import { ladeKonten } from '../konten.js';
import { ladeZustand, findeSpiel, trageEin } from '../turnier-client.js';
import { ladeSpiegel } from '../spiegel.js';
import { ladeNachtrag } from '../nachtrag.js';
import { TURNIER_URL, SPIEL_NAME } from '../config.js';
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

/** Wie lange hochgeladene Bilder aufgehoben werden. */
const BILD_STUNDEN = Number(process.env.MC_BILD_STUNDEN || 24);

/**
 * Wie oft versucht wird, wartende Eintraege nachzutragen.
 *
 * Eine Minute ist ein Kompromiss: haeufiger belastet einen Server, der
 * ohnehin nicht antwortet; seltener laesst Punkte laenger haengen, als
 * noetig waere. Wer nicht warten will, klickt im Dashboard auf "Jetzt
 * nachtragen".
 */
const NACHTRAG_TAKT_S = Number(process.env.MC_NACHTRAG_TAKT || 60);

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
     Die beiden Stuecke, mit denen der Server ohne turnier weiterarbeitet.

       spiegel   haelt die letzte bekannte Kartei - sonst koennte ohne
                 turnier kein Name zugeordnet werden und jeder Upload
                 endete mit 502, ohne dass die Runde ueberhaupt in der
                 Warteschlange landet.

       nachtrag  faengt Eintraege auf, die gerade nicht durchkommen, und
                 traegt sie in der urspruenglichen Reihenfolge nach.

     Beide sind bewusst hier verdrahtet und nicht im Server: server.ts
     kennt weiterhin nur "hole den Zustand" und "trag das ein", und die
     Tests koennen wie bisher etwas anderes einsetzen.
  */
  const spiegel = ladeSpiegel(path.join(DATEN_DIR, 'kartei-spiegel.json'), async () => {
    const zustand = await ladeZustand();
    return { zustand, spiel: findeSpiel(zustand) };
  });

  const nachtrag = ladeNachtrag(path.join(DATEN_DIR, 'nachtrag.json'), trageEin);

  const server = baueServer({
    freigabe,
    tokens,
    bilderDir: BILDER_DIR,
    adminKey,
    oeffentlichDir: path.join(PROJEKT, 'public'),
    clientDatei: path.join(PROJEKT, 'client-cs', 'Meccha-Ranked.exe'),
    konten,
    oeffentlicheUrl: OEFFENTLICHE_URL,
    holeZustand: () => spiegel.holen(),
    eintragen: (gameId, e) => nachtrag.trageEinOderMerke(gameId, e),
    spiegel,
    nachtrag
  });

  server.listen(port, host, () => {
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
    console.log('  Turnier   :  ' + TURNIER_URL + '  -> ' + SPIEL_NAME);
    console.log('  Leser     :  ' + leserBeschreibung());
    console.log('  Konto     ->  ' + OEFFENTLICHE_URL + '/konto');
    console.log('');
    console.log('  Tokens    :  ' + tokens.alle().length +
      ' (' + tokens.alle().filter((t) => t.vertraut).length + ' vertraut)');
    console.log('  Konten    :  ' + konten.alle().length + ' angemeldet');
    console.log('  Offen     :  ' + freigabe.offene().length + ' Runden');
    if (nachtrag.anzahl() > 0) {
      console.log('  Nachtrag  :  ' + nachtrag.anzahl() + ' Eintrag/Eintraege warten auf turnier');
    }
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

  /*
     Wartende Eintraege nachtragen. Laeuft still, solange nichts wartet -
     eine Zeile pro Takt in einer Konsole, die den ganzen Stream offen
     ist, waere nur Rauschen.
  */
  const nachtragen = (): void => {
    if (nachtrag.anzahl() === 0) return;
    void nachtrag.arbeiteAb().then((a) => {
      if (a.erledigt > 0) {
        console.log('  ' + a.erledigt + ' wartende(r) Eintrag nachgetragen, ' +
          a.offen + ' noch offen');
      }
    });
  };
  setInterval(nachtragen, NACHTRAG_TAKT_S * 1000);

  // Fruehe Warnung, wenn der Turnier-Server nicht erreichbar ist - besser
  // jetzt als beim ersten Freigabeklick.
  try {
    const { zustand, spiel } = await spiegel.holen();
    const lage = spiegel.lage();

    if (lage.erreichbar) {
      console.log('  Turnier erreichbar: ' + spiel.name + ' (' + spiel.eintraege + ' Eintraege), ' +
        zustand.kartei.length + ' Personen in der Kartei');
    } else {
      console.log('  WARNUNG: Turnier-Server nicht erreichbar - ' + lage.letzterFehler);
      console.log('  Es wird mit dem gespiegelten Stand vom ' + zeitpunkt(lage.gespiegeltAm) +
        ' gearbeitet:');
      console.log('  ' + spiel.name + ', ' + zustand.kartei.length + ' Personen. Neue Eintraege');
      console.log('  werden gesammelt und nachgetragen, sobald turnier wieder da ist.');
    }
    console.log('');
  } catch (err) {
    console.log('  WARNUNG: Turnier-Server nicht erreichbar - ' + (err as Error).message);
    console.log('  Und es gibt noch keinen gespiegelten Stand. Solange turnier nicht');
    console.log('  wenigstens einmal geantwortet hat, werden Uploads abgewiesen - ohne');
    console.log('  Kartei liesse sich kein Name zuordnen.');
    console.log('');
  }

  // Beim Start gleich nachtragen, falls beim letzten Mal etwas liegenblieb.
  nachtragen();

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
