import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer, MAX_BILD } from '../src/server.js';
import { Freigabeliste, ladeFreigabeliste } from '../src/freigabe.js';
import { Tokenliste, ladeTokens, ABSTAND_FEHLSCHLAG_MS } from '../src/tokens.js';
import type { Spieler } from '../src/namen.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   Diese Tests brauchen weder Python noch Ollama noch einen Turnier-Server:
   Leser und Zustand werden eingesetzt. Geprueft werden die REGELN des
   Servers, nicht die Erkennungsleistung - die ist anderswo gemessen.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-server-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const SPIELER: readonly Spieler[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'mj', aliases: [] },
  { id: 'p3', name: 'TREV', aliases: [] },
  /* Angemeldet, aber auf den Testbildern nicht zu sehen. Gebraucht fuer
     die Faelle "dein Name steht nicht in DIESER Rangliste" - die sind
     etwas anderes als "zu deinem Namen gibt es kein Konto", und seit
     beides geprueft wird, muessen die Tests sie auseinanderhalten. */
  { id: 'p4', name: 'GibtsNichtHier', aliases: [] },
  { id: 'p5', name: 'J0nes', aliases: [] }
];

/** Was der eingesetzte Leser zurueckgibt. */
let leserAntwort = JSON.stringify({
  zeilen: [
    { name: 'Jones', rohPunkte: '2 771' },
    { name: 'TREV', rohPunkte: '922' },
    { name: 'mj', rohPunkte: '239' }
  ]
});
let leserWirft: Error | null = null;
/* Die Mindestzahl Verstecker. In den meisten Tests aus, damit die
   Drei-Zeilen-Fixtures durchkommen - die eigene Regel prueft ein eigener
   Block, der sie hochsetzt. Als Getter am Server, also je Anfrage frisch. */
let minSpielerTest = 0;
/* Die Testbilder ("PNG-abc") haben keine echte PNG-Struktur - fuer die
   Bildpruefung waeren sie allesamt nachbearbeitet. Hier wird sie deshalb
   eingesetzt und nur dort auf "auffaellig" gestellt, wo genau das
   geprueft werden soll. */
let bildWirktEcht = true;

/** Was der Turnier-Server angeblich bekommen hat. */
let eingetragen: Array<{ kontoId: string; punkte: number }> = [];

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let zuschauerToken: string;
let eigenerToken: string;

let n = 0;

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    get minSpieler() { return minSpielerTest; },
    bilderDir: path.join(ORDNER, 'bilder'),
    leser: async () => {
      if (leserWirft) throw leserWirft;
      return leserAntwort;
    },
    bildpruefer: () => ({
      bloecke: [],
      wirktEcht: bildWirktEcht,
      auffaelligkeiten: bildWirktEcht ? [] : ['Metadaten fehlen']
    }),
    eintragen: (kontoId, punkte) => { eingetragen.push({ kontoId, punkte }); },
    holeStand: () => standMit(SPIELER)
  });

  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

beforeEach(() => {
  n++;
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'freigabe-' + n + '.json'));
  tokens = ladeTokens(path.join(ORDNER, 'tokens-' + n + '.json'));
  // Zuschauer-Token brauchen den Ingame-Namen - nur diese Zeile zaehlt.
  zuschauerToken = tokens.anlegen('Zuschauerin', false, 'Jones').token;
  eigenerToken = tokens.anlegen('Spiel-PC', true).token;
  eingetragen = [];
  leserWirft = null;
  bildWirktEcht = true;
  minSpielerTest = 0;
  leserAntwort = JSON.stringify({
    zeilen: [
      { name: 'Jones', rohPunkte: '2 771' },
      { name: 'TREV', rohPunkte: '922' },
      { name: 'mj', rohPunkte: '239' }
    ]
  });
});

/** Ein eindeutiges "Bild" - der Inhalt ist egal, der Leser ist eingesetzt. */
function bild(inhalt: string): Buffer {
  return Buffer.from('PNG-' + inhalt);
}

async function lade(
  daten: Buffer,
  kopf: Record<string, string> = {}
): Promise<{ code: number; body: Record<string, unknown> }> {
  const res = await fetch(basis + '/api/runde', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', ...kopf },
    body: new Uint8Array(daten)
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

/* ---------------------------------------------------------------- Routing */

describe('Server - Routing', () => {
  test('meldet den Status', async () => {
    const res = await fetch(basis + '/api/status');
    const j = (await res.json()) as { ok: boolean; maxBild: number };
    assert.equal(res.status, 200);
    assert.equal(j.ok, true);
    assert.equal(j.maxBild, MAX_BILD);
  });

  test('sagt dem Client, wer er ist', async () => {
    /* Der Zuschauer sieht seinen Ingame-Namen sonst nirgends - im Spiel
       ist die eigene Zeile nicht hervorgehoben, der Client kennt nur den
       Token. */
    const res = await fetch(basis + '/api/wer', { headers: { 'X-MC-Token': zuschauerToken } });
    const j = (await res.json()) as {
      ok: boolean; name: string; ingameName: string;
      ganzeLobby: boolean; brauchtFreigabe: boolean; gesperrt: boolean;
    };

    assert.equal(res.status, 200);
    assert.equal(j.name, 'Zuschauerin');
    assert.equal(j.ingameName, 'Jones');
    assert.equal(j.ganzeLobby, false);
    assert.equal(j.brauchtFreigabe, true);
    assert.equal(j.gesperrt, false);
  });

  test('verbraucht mit der Auskunft nicht den Mindestabstand', async () => {
    /* Sonst koennte der Client nicht beim Start fragen, ohne die naechste
       Runde des Zuschauers fuer fuenf Sekunden zu blockieren. */
    await fetch(basis + '/api/wer', { headers: { 'X-MC-Token': zuschauerToken } });
    const { code } = await lade(bild('nach-auskunft'), { 'X-MC-Token': zuschauerToken });
    assert.equal(code, 200);
  });

  test('weist die Auskunft ohne gueltigen Token ab', async () => {
    assert.equal((await fetch(basis + '/api/wer')).status, 401);
    assert.equal((await fetch(basis + '/api/wer',
      { headers: { 'X-MC-Token': 'erfunden' } })).status, 401);
  });

  test('bietet die Client-Datei zum Herunterladen an', async () => {
    /* Die Kontoseite verlinkt sie - eine Bezugsquelle statt fuenf
       Anhaengen im Discord, von denen nach einem Serverumzug keiner mehr
       funktioniert. Ohne hinterlegte Datei eine verstaendliche Absage. */
    const res = await fetch(basis + '/client');
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Admin oder Mod/);
  });

  test('gibt die Rangliste ohne Anmeldung heraus', async () => {
    /* Sie ist der Grund, warum jemand die Seite aufruft - dafuer soll
       niemand erst einen Zugang brauchen. */
    const res = await fetch(basis + '/api/rangliste');
    const j = (await res.json()) as {
      ok: boolean; fenster: number; voll: number;
      listen: Array<{ id: string; name: string; gewertet: unknown[]; anwaerter: unknown[] }>;
    };

    assert.equal(res.status, 200);
    assert.equal(j.ok, true);
    assert.equal(j.fenster, 10);
    assert.equal(j.voll, 10);
    /* Seit es mehrere Ranglisten geben kann, steht die Wertung je Liste.
       Oeffentlich sind nur die AKTIVEN - eine abgeschlossene Saison
       gehoert ins Dashboard, nicht auf die Startseite. */
    assert.ok(Array.isArray(j.listen));
    assert.ok(j.listen.length >= 1, 'mindestens eine aktive Liste');
    assert.ok(Array.isArray(j.listen[0]!.gewertet));
    assert.ok(Array.isArray(j.listen[0]!.anwaerter));
  });

  test('weist unbekannte Pfade ab', async () => {
    assert.equal((await fetch(basis + '/irgendwas')).status, 404);
  });

  test('weist GET auf /api/runde ab', async () => {
    assert.equal((await fetch(basis + '/api/runde')).status, 405);
  });
});

/* ----------------------------------------------------------------- Tokens */

describe('Server - Zugang', () => {
  test('weist eine Anfrage ohne Token ab', async () => {
    const { code, body } = await lade(bild('a'));
    assert.equal(code, 401);
    assert.match(String(body.fehler), /Kein Token/);
  });

  test('weist einen unbekannten Token ab', async () => {
    const { code } = await lade(bild('a'), { 'X-MC-Token': 'erfunden' });
    assert.equal(code, 401);
  });

  test('weist einen gesperrten Token ab', async () => {
    tokens.sperren(zuschauerToken, 'bearbeitete Screenshots');
    const { code, body } = await lade(bild('a'), { 'X-MC-Token': zuschauerToken });
    assert.equal(code, 401);
    assert.match(String(body.fehler), /bearbeitete Screenshots/);
  });

  test('bremst zu schnelle Zuschauer-Uploads', async () => {
    await lade(bild('a'), { 'X-MC-Token': zuschauerToken });
    const zweite = await lade(bild('b'), { 'X-MC-Token': zuschauerToken });
    assert.equal(zweite.code, 429);
  });

  test('prueft den Token, BEVOR das Bild gelesen wird', async () => {
    // Sonst koennte jemand ohne Zugang acht Megabyte hochladen.
    leserWirft = new Error('haette nicht aufgerufen werden duerfen');
    const { code } = await lade(bild('a'), { 'X-MC-Token': 'erfunden' });
    assert.equal(code, 401);
  });
});

/* ------------------------------------------------------------- Bildpruefung */

describe('Server - Bildpruefung', () => {
  test('weist einen falschen Content-Type ab', async () => {
    const { code, body } = await lade(bild('a'), {
      'X-MC-Token': eigenerToken,
      'Content-Type': 'application/json'
    });
    assert.equal(code, 415);
    assert.match(String(body.fehler), /image\/png/);
  });

  test('weist ein leeres Bild ab', async () => {
    const { code } = await lade(Buffer.alloc(0), { 'X-MC-Token': eigenerToken });
    assert.equal(code, 400);
  });

  test('nimmt PNG und JPEG an', async () => {
    /* Je Durchlauf ein eigener Zugang: seit dem zweistufigen
       Mindestabstand bremst der zweite Upload desselben Tokens, und der
       Test wuerde 429 statt 200 sehen - obwohl es um die Dateitypen
       geht und nicht um das Zeitfenster. */
    for (const typ of ['image/png', 'image/jpeg']) {
      const eigener = tokens.anlegen('Typ-Probe ' + typ, true).token;
      const { code } = await lade(bild(typ), {
        'X-MC-Token': eigener, 'Content-Type': typ
      });
      assert.equal(code, 200, typ + ' sollte angenommen werden');
    }
  });

  test('meldet ein unlesbares Bild als solches', async () => {
    const { ModellAntwortUnbrauchbar } = await import('../src/leser.js');
    leserWirft = new ModellAntwortUnbrauchbar('kein JSON', 'Prosa');
    const { code, body } = await lade(bild('muell'), { 'X-MC-Token': eigenerToken });
    assert.equal(code, 422);
    assert.match(String(body.fehler), /keine brauchbare Rangliste/);
  });
});

/* --------------------------------------------------------- Zuschauer-Upload */

describe('Server - Zuschauer laden hoch', () => {
  test('landet in der Freigabeliste, NICHT in der Punkteliste', async () => {
    // Die Kernregel aus dem Auftrag: Zuschauer duerfen keine Punktzahl
    // selbst eintragen.
    const { code, body } = await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });

    assert.equal(code, 200);
    assert.equal(body.status, 'offen');
    assert.equal(eingetragen.length, 0);
    assert.equal(freigabe.offene().length, 1);
  });

  /*
     Der Screenshot zeigt die ganze Lobby, gewertet wird aber nur die
     eigene Zeile. Sonst wuerde ein Zuschauer die Punkte aller
     Mitspieler einreichen - und saessen zwei aus derselben Lobby am
     Client, bekaeme jeder alles doppelt.
  */
  test('beansprucht nur die eigene Zeile, nicht die ganze Lobby', async () => {
    const { body } = await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });
    const zeilen = body.zeilen as Array<{ rohName: string }>;

    assert.equal(zeilen.length, 1);
    assert.equal(zeilen[0]?.rohName, 'Jones');
    assert.deepEqual(freigabe.offene()[0]?.beansprucht, ['jones']);
  });

  test('weist ab, wenn der eigene Name nicht in der Rangliste steht', async () => {
    const fremd = tokens.anlegen('Fremde', false, 'GibtsNichtHier').token;
    const { code, body } = await lade(bild('runde1'), { 'X-MC-Token': fremd });
    assert.equal(code, 422);
    assert.match(String(body.fehler), /steht so nicht in dieser Rangliste/);
  });

  test('zeigt dabei, wie das Spiel die Namen schreibt', async () => {
    /* Im Spiel ist der eigene Name in der Rangliste nicht hervorgehoben -
       viele wissen gar nicht, wie sie dort genau geschrieben werden. Der
       Client zeigt "zeilen" an, also muessen sie mitkommen. */
    const fremd = tokens.anlegen('Fremde', false, 'GibtsNichtHier').token;
    const { body } = await lade(bild('runde-namen'), { 'X-MC-Token': fremd });

    const zeilen = body.zeilen as Array<{ rohName: string; rohPunkte: string }>;
    assert.deepEqual(zeilen.map((z) => z.rohName), ['Jones', 'TREV', 'mj']);
    assert.equal(zeilen[0]?.rohPunkte, '2 771', 'mit Punktzahl, wie im Bild');
  });

  test('findet den eigenen Namen auch bei einem Lesefehler', async () => {
    // Der Leser gibt 'Jones' zurueck, der Token sagt 'J0nes'.
    const mitFehler = tokens.anlegen('Nori', false, 'J0nes').token;
    const { code } = await lade(bild('runde-fehler'), { 'X-MC-Token': mitFehler });
    assert.equal(code, 200);
  });

  test('weist ab, wenn zum Ingame-Namen gar kein Konto gehoert', async () => {
    /* Gewertet wird gegen die angemeldeten Konten. Ein Token ohne Konto
       dahinter koennte hochladen, wuerde aber NIE gewertet - frueher
       fiel das erst beim Freigeben auf, an einer kleinen Null. Der
       Zuschauer wartete und erfuhr nie, warum nichts passierte. */
    const ohneKonto = tokens.anlegen('Niemand', false, 'NieAngemeldet').token;
    const { code, body } = await lade(bild('runde1'), { 'X-MC-Token': ohneKonto });

    assert.equal(code, 403);
    assert.equal(body.art, 'kein-konto');
    assert.match(String(body.fehler), /Melde dich mit Steam an/);
  });

  test('nennt den Absender in der Freigabeliste', async () => {
    await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });
    assert.equal(freigabe.offene()[0]?.absender, 'Zuschauerin');
  });

  test('hebt das Bild auf - ohne es ist keine Pruefung moeglich', async () => {
    await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });
    const runde = freigabe.offene()[0]!;
    assert.ok(runde.bildPfad.length > 0);
    const dateien = readdirSync(path.join(ORDNER, 'bilder'));
    assert.ok(dateien.some((f) => runde.bildPfad.endsWith(f)));
  });

  test('sagt dem Absender, dass noch nichts gewertet ist', async () => {
    const { body } = await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });
    assert.match(String(body.hinweis), /erst nach Pruefung/);
  });
});

/* ---------------------------------------------------- Mindestzahl */

describe('Server - zu kleine Runde', () => {
  /* In einer winzigen Runde laesst sich der eigene Platz schoenspielen.
     Das Scoreboard zeigt nur die Verstecker - jede Zeile ist einer, also
     zaehlt einfach ihre Zahl. Der Fixture-Leser gibt drei Zeilen zurueck. */
  test('haelt eine Zuschauer-Runde mit zu wenigen Versteckern zurueck', async () => {
    minSpielerTest = 6;
    const { code, body } = await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });

    assert.equal(code, 422);
    assert.equal(body.art, 'zu-wenige-spieler');
    assert.equal(body.erkannt, 3);
    assert.equal(body.minSpieler, 6);
    // Nichts eingetragen, nichts zur Freigabe gelegt - gar nicht erst rein.
    assert.equal(eingetragen.length, 0);
    assert.equal(freigabe.offene().length, 0);
  });

  test('nennt kein "Abgelehnt" - der Zuschauer hat nichts falsch gemacht', async () => {
    minSpielerTest = 6;
    const { body } = await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });
    // Neutrale Sprache: "Zaehlt nicht", nicht "Abgelehnt".
    assert.match(String(body.fehler), /[Zz]aehlt nicht|Zählt nicht/);
  });

  test('laesst genug Verstecker durch', async () => {
    minSpielerTest = 3;   // genau die drei aus dem Fixture
    const { code, body } = await lade(bild('runde1'), { 'X-MC-Token': zuschauerToken });
    assert.equal(code, 200);
    assert.equal(body.status, 'offen');
  });

  test('gilt NICHT fuer die eigenen Rechner', async () => {
    // Der Spiel-PC erfasst die ganze Runde auf einen Griff - da waere die
    // Sperre nur im Weg, und Betrug am eigenen Rechner ist ein anderes Thema.
    minSpielerTest = 6;
    const { code } = await lade(bild('runde1'), { 'X-MC-Token': eigenerToken });
    assert.equal(code, 200);
    assert.ok(eingetragen.length >= 1);
  });

  test('meldet die Zahl ueber /api/status', async () => {
    minSpielerTest = 6;
    const r = await fetch(basis + '/api/status');
    const s = await r.json() as { minSpieler?: number };
    assert.equal(s.minSpieler, 6);
  });
});

/* ------------------------------------------------------------- Vertraut */

describe('Server - Zuschauer ohne Freigabe', () => {
  /*
     Der neue Fall aus der Entkopplung: jemand, dem du vertraust, soll
     nicht klicken muessen - aber trotzdem nur seine eigene Zeile
     einbringen duerfen, nicht die ganze Lobby.
  */
  test('traegt direkt ein, aber nur die eigene Zeile', async () => {
    const t = tokens.anlegen('Vertrauter Gast', false, 'Jones', true).token;
    const { code, body } = await lade(bild('ohne-freigabe'), { 'X-MC-Token': t });

    assert.equal(code, 200);
    assert.equal(body.direkt, true, 'keine Freigabe noetig');
    assert.equal(body.geschrieben, 1, 'aber nur EINE Zeile, nicht die Lobby');
    assert.deepEqual(eingetragen, [{ kontoId: 'p1', punkte: 2771 }]);
    assert.equal(freigabe.offene().length, 0);
  });

  test('wird trotzdem als Zuschauer vermerkt', async () => {
    const t = tokens.anlegen('Vertrauter Gast', false, 'Jones', true).token;
    await lade(bild('quelle'), { 'X-MC-Token': t });
    assert.equal(freigabe.alle()[0]?.quelle, 'zuschauer');
  });

  test('belegt seine Zeile fuer die Partie', async () => {
    // Sonst koennte er dieselbe Runde ueber einen zweiten Token nochmal
    // einreichen.
    const a = tokens.anlegen('Gast', false, 'Jones', true).token;
    const b = tokens.anlegen('Kompliz', false, 'Jones', true).token;

    await lade(bild('erst'), { 'X-MC-Token': a });
    const zweite = await lade(bild('nochmal'), { 'X-MC-Token': b });

    assert.equal(zweite.body.neu, false);
    assert.equal(eingetragen.length, 1);
  });
});

describe('Server - vertraute Quelle', () => {
  test('traegt direkt ein, ohne Freigabe', async () => {
    const { code, body } = await lade(bild('runde1'), { 'X-MC-Token': eigenerToken });
    assert.equal(code, 200);
    assert.equal(body.direkt, true);
    assert.equal(body.geschrieben, 3);
    assert.equal(freigabe.offene().length, 0);
  });

  test('meldet Rueckfragen mit zurueck', async () => {
    leserAntwort = JSON.stringify({
      zeilen: [
        { name: 'Jones', rohPunkte: '2 771' },
        { name: 'TREV', rohPunkte: '922' },
        { name: 'Wildfremd', rohPunkte: '100' }
      ]
    });
    const { body } = await lade(bild('gemischt'), { 'X-MC-Token': eigenerToken });
    assert.equal(body.geschrieben, 2);
    assert.equal((body.rueckfragen as unknown[]).length, 1);
  });
});

/* ----------------------------------------------------------- Dubletten */

describe('Server - dieselbe Partie von zwei Leuten', () => {
  /*
     Zwei Mitspieler aus derselben Lobby, beide mit echtem Bild. Jeder
     beansprucht nur seine eigene Zeile - also duerfen BEIDE durch.
  */
  test('zwei verschiedene Spieler derselben Lobby kommen beide durch', async () => {
    const a = tokens.anlegen('SpielerA', false, 'Jones').token;
    const b = tokens.anlegen('SpielerB', false, 'mj').token;

    const erste = await lade(bild('bild-von-a'), { 'X-MC-Token': a });
    const zweite = await lade(bild('bild-von-b'), { 'X-MC-Token': b });

    assert.equal(erste.body.neu, true);
    assert.equal(zweite.body.neu, true, 'SpielerB muss ebenfalls durchkommen');
    assert.equal(freigabe.offene().length, 2);
  });

  test('derselbe Spieler zweimal wird abgewiesen', async () => {
    const a = tokens.anlegen('SpielerA', false, 'Jones').token;
    const b = tokens.anlegen('Kompliz', false, 'Jones').token;

    await lade(bild('bild-eins'), { 'X-MC-Token': a });
    const zweite = await lade(bild('bild-zwei'), { 'X-MC-Token': b });

    assert.equal(zweite.body.neu, false);
    assert.match(String(zweite.body.hinweis), /bereits von SpielerA/);
    assert.equal(freigabe.alle().length, 1);
  });

  test('nach eigener Aufnahme ist die ganze Lobby belegt', async () => {
    // Ein F9 am eigenen Rechner erfasst alle - danach darf niemand aus
    // derselben Lobby nochmal einschicken.
    await lade(bild('eigene'), { 'X-MC-Token': eigenerToken });

    const zuschauer = tokens.anlegen('Mitspieler', false, 'mj').token;
    const spaeter = await lade(bild('vom-mitspieler'), { 'X-MC-Token': zuschauer });
    assert.equal(spaeter.body.neu, false);
  });
});

describe('Server - Dubletten', () => {
  test('derselbe Screenshot wird nicht zweimal angenommen', async () => {
    const daten = bild('immer-gleich');
    const erste = await lade(daten, { 'X-MC-Token': zuschauerToken });
    assert.equal(erste.body.neu, true);

    // Zweiter Versuch mit dem eigenen Token, damit der Mindestabstand
    // nicht dazwischenfunkt.
    const zweite = await lade(daten, { 'X-MC-Token': eigenerToken });
    assert.equal(zweite.body.neu, false);
    assert.match(String(zweite.body.hinweis), /schon eingereicht/);
    assert.equal(freigabe.alle().length, 1);
  });

  test('liest ein bekanntes Bild nicht noch einmal', async () => {
    const daten = bild('immer-gleich');
    await lade(daten, { 'X-MC-Token': zuschauerToken });

    leserWirft = new Error('haette nicht noch einmal lesen duerfen');
    const zweite = await lade(daten, { 'X-MC-Token': eigenerToken });
    assert.equal(zweite.code, 200);
  });

  test('warnt bei inhaltsgleicher Runde mit anderem Bild', async () => {
    await lade(bild('bild-a'), { 'X-MC-Token': zuschauerToken });
    tokens.pruefen(zuschauerToken, Date.now() + ABSTAND_FEHLSCHLAG_MS * 2);

    const zweite = await lade(bild('bild-b'), { 'X-MC-Token': eigenerToken });
    // Vertraute Quelle geht direkt durch, die Warnung greift bei
    // Zuschauern - hier wird nur geprueft, dass beides nebeneinander
    // existiert, ohne dass etwas verlorengeht.
    assert.equal(zweite.code, 200);
  });
});


/* --------------------------------------- Eigene Zeile ohne lesbare Zahl */

describe('Server - eigene Zeile da, Punktzahl unlesbar', () => {
  /** Genug Verstecker, aber Jones' Zahl ist nicht zu entziffern. */
  const OHNE_ZAHL = JSON.stringify({
    zeilen: [
      { name: 'Jones', rohPunkte: '' },
      { name: 'mj', rohPunkte: '2000' },
      { name: 'TREV', rohPunkte: '1500' },
      { name: 'Vier', rohPunkte: '1000' },
      { name: 'Fuenf', rohPunkte: '500' },
      { name: 'Sechs', rohPunkte: '300' }
    ]
  });

  test('sagt es als eigenen Fall, nicht als Ablehnung', async () => {
    minSpielerTest = 6;
    leserAntwort = OHNE_ZAHL;

    const { code, body } = await lade(bild('untergrund-1'),
      { 'X-MC-Token': zuschauerToken });

    assert.equal(code, 422);
    assert.equal(body.art, 'untergrund');
    assert.match(String(body.hinweis), /Hintergrund|ruhigen/);
  });

  test('speichert NICHTS - sonst sperrt die Partie-Kennung den zweiten Versuch', async () => {
    /* Der Kern der Sache. Waere die Runde erfasst, traege ein neuer
       Screenshot derselben Rangliste dieselbe Kennung und floege als
       "schon erfasst" heraus. Der Rat "mach es nochmal mit besserem
       Hintergrund" liefe dann gegen eine Sperre, die wir selbst gesetzt
       haben. */
    minSpielerTest = 6;
    leserAntwort = OHNE_ZAHL;

    await lade(bild('untergrund-2'), { 'X-MC-Token': zuschauerToken });

    assert.equal(freigabe.offene().length, 0, 'nichts in der Freigabeliste');
    assert.equal(eingetragen.length, 0, 'nichts eingetragen');
  });

  test('kein langer Abstand - es darf sofort nochmal probiert werden', async () => {
    /* Wer nichts bekommen hat, soll nicht drei Minuten warten, bis er es
       besser machen darf. Bis dahin ist die Lobby weiter. */
    minSpielerTest = 6;
    leserAntwort = OHNE_ZAHL;

    const vorher = Date.now();
    await lade(bild('untergrund-3'), { 'X-MC-Token': zuschauerToken });

    const t = tokens.finde(zuschauerToken);
    assert.ok(t, 'Token muss es geben');
    const wartet = (t.sperreBis ?? 0) - vorher;
    assert.ok(wartet <= ABSTAND_FEHLSCHLAG_MS + 2000,
      'nur der kurze Abstand, nicht die drei Minuten - es sind aber ' +
      Math.round(wartet / 1000) + ' s');
  });

  test('eine LESBARE Zahl geht weiter ihren Weg', async () => {
    // Die Gegenprobe: der neue Fall darf nicht alles einfangen.
    minSpielerTest = 6;
    leserAntwort = JSON.stringify({
      zeilen: [
        { name: 'Jones', rohPunkte: '2771' },
        { name: 'mj', rohPunkte: '2000' },
        { name: 'TREV', rohPunkte: '1500' },
        { name: 'Vier', rohPunkte: '1000' },
        { name: 'Fuenf', rohPunkte: '500' },
        { name: 'Sechs', rohPunkte: '300' }
      ]
    });

    const { code, body } = await lade(bild('untergrund-4'),
      { 'X-MC-Token': zuschauerToken });

    assert.equal(code, 200);
    assert.equal(body.status, 'offen');
  });

  test('gilt nicht fuer den eigenen Rechner', async () => {
    /* Dort wird die ganze Lobby erfasst, und eine unlesbare Zeile unter
       vielen ist der Normalfall - sie wird zur Rueckfrage, mehr nicht. */
    minSpielerTest = 6;
    leserAntwort = OHNE_ZAHL;

    const { code } = await lade(bild('untergrund-5'),
      { 'X-MC-Token': eigenerToken });

    assert.equal(code, 200);
  });
});

/* ------------------------------------------------- Hinweis bei zu wenig */

describe('Server - was der Zuschauer bei zu wenigen Zeilen erfaehrt', () => {
  test('bei 0-2 Zeilen wird auf Hintergrund und Rundenende hingewiesen', async () => {
    /* So wenige Zeilen sind fast nie eine Mini-Lobby, sondern ein
       schwer lesbares Bild. Dann hilft die Regel nicht weiter, sondern
       nur der Rat, wie man es besser macht. */
    minSpielerTest = 6;
    leserAntwort = JSON.stringify({
      zeilen: [{ name: 'Jones', rohPunkte: '2771' }]
    });

    const { code, body } = await lade(bild('zu-wenig-lesefehler'),
      { 'X-MC-Token': zuschauerToken });

    assert.equal(code, 422);
    assert.equal(body.art, 'zu-wenige-spieler');
    assert.match(String(body.hinweis), /Hintergrund|ruhigen/);
    assert.match(String(body.hinweis), /ENDE der Runde/);
  });

  test('bei 4-5 Zeilen wird NICHT auf den Hintergrund geschimpft', async () => {
    /* Da war die Lobby wirklich zu klein. Ein Ratschlag zum Bild waere
       hier nur irrefuehrend - der Spieler hat alles richtig gemacht. */
    minSpielerTest = 6;
    leserAntwort = JSON.stringify({
      zeilen: [
        { name: 'Jones', rohPunkte: '2771' },
        { name: 'mj', rohPunkte: '2000' },
        { name: 'TREV', rohPunkte: '1500' },
        { name: 'Vier', rohPunkte: '1000' },
        { name: 'Fuenf', rohPunkte: '500' }
      ]
    });

    const { code, body } = await lade(bild('zu-wenig-echt'),
      { 'X-MC-Token': zuschauerToken });

    assert.equal(code, 422);
    assert.equal(body.erkannt, 5);
    assert.doesNotMatch(String(body.hinweis), /Hintergrund/);
    assert.match(String(body.hinweis), /zu klein/);
  });
});
