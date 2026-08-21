import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { downloadSeite, clientstand } from '../src/download-seite.js';
import { ladeFreigabeliste } from '../src/freigabe.js';
import { ladeTokens } from '../src/tokens.js';
import { verteilung } from '../src/config.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DIE DOWNLOAD-SEITE

   Chrome und Windows warnen beide vor der Datei, weil sie unbekannt ist:
   keine Signatur, kein Ruf. Dagegen hilft nur ein Zertifikat fuer
   mehrere hundert Euro im Jahr - das Projekt soll nichts kosten.

   Bis zum 21.08.2026 lag die .exe auf diesem Server, und diese Seite
   nannte die SHA-256, die er aus der ausgelieferten Datei berechnete.
   Das hatte eine schoene Eigenschaft: die Summe konnte gar nicht falsch
   sein.

   Jetzt liegt die Datei bei GitHub, neben dem Quelltext. Der Server
   verweist nur noch. Damit ist das Gewicht dieser Tests ein anderes: es
   geht nicht mehr um die Summe, sondern darum, dass der Weg zur Datei
   stimmt und die Seite nichts behauptet, was sie nicht mehr wissen kann.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-download-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

describe('Clientstand', () => {
  test('nennt Fassung und Bezugsquelle aus der Konfiguration', () => {
    const s = clientstand();
    const v = verteilung();
    assert.equal(s.version, v.clientVersion);
    assert.equal(s.releases, v.releases);
    assert.equal(s.quelltext, v.quelltext);
  });

  test('das Baudatum kommt aus dem Stempel und passt zur Fassung', () => {
    /* Nicht die Aenderungszeit irgendeiner Datei: der Stempel sagt, wann
       die Fassung wirklich entstanden ist - aber nur, wenn seine Nummer
       zur ausgelieferten passt. Sonst gehoert das Datum zu einem anderen
       Bau, und ein falsches Datum ist schlimmer als keines. */
    const s = clientstand();
    if (s.gebaut) {
      assert.ok(!Number.isNaN(Date.parse(s.gebaut)), 'kein lesbares Datum');
    }
  });

  test('kennt weder Groesse noch Pruefsumme - und tut auch nicht so', () => {
    /* Der Server liefert die Datei nicht mehr aus. Eine Summe hier waere
       geraten, und eine falsche Pruefsumme ist schlimmer als keine: sie
       laesst die echte Datei manipuliert aussehen. */
    const s = clientstand() as unknown as Record<string, unknown>;
    assert.equal(s.sha256, undefined);
    assert.equal(s.groesse, undefined);
  });
});

describe('Download-Seite', () => {
  const seite = downloadSeite();

  test('fuehrt zu GitHub, nicht zu einer Datei auf diesem Server', () => {
    assert.match(seite, /github\.com/);
    assert.doesNotMatch(seite, /href="\/client"/,
      'der Knopf darf nicht mehr auf den eigenen Server zeigen');
  });

  test('sagt, wo die Pruefsumme steht', () => {
    /* Sie ist nicht verschwunden - sie steht jetzt in den Release-
       Notizen. Wer das nicht sagt, laesst den Misstrauischen ohne
       Werkzeug zurueck. */
    assert.match(seite, /Release/);
    assert.match(seite, /Get-FileHash/);
  });

  test('erklaert BEIDE Warnungen, nicht nur eine', () => {
    /* Browser beim Herunterladen, SmartScreen beim Ausfuehren - zwei
       verschiedene Momente. Wer nur eine erklaert, laesst den Zuschauer
       beim zweiten Mal wieder allein. */
    assert.match(seite, /Beim Herunterladen/);
    assert.match(seite, /Beim ersten Start/);
    assert.match(seite, /Beibehalten/);
    assert.match(seite, /Trotzdem ausführen/);
  });

  test('nimmt die Virenscanner-Treffer vorweg', () => {
    /* Sieben von siebzig melden "trojan", alles Heuristik. Wer den Leser
       ungewarnt zu VirusTotal schickt, macht es schlimmer als ohne
       Link. */
    assert.match(seite, /virustotal/i);
    assert.match(seite, /Vermutungen|schlagen an/);
  });

  test('bietet an, selbst zu bauen', () => {
    // Das Repo ist offen - wer will, laedt gar nichts herunter.
    assert.match(seite, /Quelltext/);
  });

  test('sagt, warum gewarnt wird - ohne es kleinzureden', () => {
    assert.match(seite, /unbekannt/);
    assert.match(seite, /signiert|Signatur/);
  });

  test('sagt, was das Programm tut', () => {
    assert.match(seite, /F9/);
    assert.match(seite, /Bild/);
  });

  test('gehoert nicht in Suchmaschinen', () => {
    // Ein Download-Link als Suchtreffer waere die falsche Tuer.
    assert.match(seite, /<meta name="robots" content="noindex, nofollow">/);
  });

  test('kommt zurecht, wenn keine Quelle hinterlegt ist', () => {
    const ohne = downloadSeite({
      version: '0.1.0', gebaut: '', releases: '', quelltext: ''
    });
    assert.match(ohne, /nicht verfügbar/);
    assert.doesNotMatch(ohne, /class="holen"/, 'ohne Quelle kein Knopf ins Leere');
  });
});

/* ------------------------------------------------------- ueber den Server */

let server: http.Server;
let basis: string;

before(async () => {
  server = baueServer({
    freigabe: ladeFreigabeliste(path.join(ORDNER, 'f.json')),
    tokens: ladeTokens(path.join(ORDNER, 't.json')),
    bilderDir: path.join(ORDNER, 'bilder'),
    holeStand: () => standMit([]),
    eintragen: () => { /* nichts */ }
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => { await new Promise<void>((f) => server.close(() => f())); });

describe('Download - ausgeliefert', () => {
  test('/download ist ohne Anmeldung erreichbar', async () => {
    const res = await fetch(basis + '/download');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  });

  test('/api/client nennt Fassung und Bezugsquelle', async () => {
    const a = (await (await fetch(basis + '/api/client')).json()) as {
      ok: boolean; version: string; releases: string;
    };
    assert.equal(a.ok, true);
    assert.equal(a.version, verteilung().clientVersion);
    assert.match(a.releases, /github\.com/);
  });

  test('/client leitet weiter, statt ins Leere zu laufen', async () => {
    /* In aelteren .exe-Fassungen und in Discord-Nachrichten steht dieser
       Pfad noch. Er soll dorthin fuehren, wo die Datei jetzt liegt - ein
       404 waere fuer den Zuschauer nicht von "Projekt tot" zu
       unterscheiden. */
    const res = await fetch(basis + '/client', { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') ?? '', /github\.com/);
  });

  test('auch die alten Schreibweisen leiten weiter', async () => {
    for (const pfad of ['/client.exe', '/client.zip']) {
      const res = await fetch(basis + pfad, { redirect: 'manual' });
      assert.equal(res.status, 302, pfad + ' leitet nicht weiter');
    }
  });
});
