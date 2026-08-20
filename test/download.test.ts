import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { downloadSeite, clientstand } from '../src/download-seite.js';
import { ladeFreigabeliste } from '../src/freigabe.js';
import { ladeTokens } from '../src/tokens.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DIE DOWNLOAD-SEITE

   Chrome und Windows warnen beide vor der Datei, weil sie unbekannt ist:
   keine Signatur, kein Ruf. Dagegen hilft nur ein Zertifikat fuer
   mehrere hundert Euro im Jahr - das Projekt soll nichts kosten.

   Der kostenlose Weg ist, die Warnung zu ZEIGEN und dem Misstrauischen
   die Pruefsumme zu geben. Das steht und faellt damit, dass die Summe
   STIMMT: eine falsche laesst die echte Datei manipuliert aussehen und
   zerstoert genau das Vertrauen, das sie herstellen soll. Deshalb liegt
   das Gewicht dieser Tests dort.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-download-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const CLIENT = path.join(ORDNER, 'Meccha-Ranked.zip');
const INHALT = Buffer.from('so tut eine ZIP-Datei');
writeFileSync(CLIENT, INHALT);

const ECHTE_SUMME = createHash('sha256').update(INHALT).digest('hex');

describe('Clientstand', () => {
  test('berechnet die Summe aus der Datei', () => {
    const s = clientstand(CLIENT);
    assert.ok(s);
    assert.equal(s.sha256, ECHTE_SUMME);
    assert.equal(s.groesse, INHALT.length);
    assert.equal(s.name, 'Meccha-Ranked.zip');
    assert.equal(s.istZip, true);
  });

  test('eine fehlende Datei gibt null, keinen Fehler', () => {
    assert.equal(clientstand(path.join(ORDNER, 'gibtsnicht.zip')), null);
  });

  test('nach einem Neubau stimmt die Summe wieder', () => {
    /* DER wichtigste Test hier. Die Summe wird gemerkt, damit nicht bei
       jedem Aufruf gelesen wird - bliebe die alte stehen, zeigte die
       Seite nach jedem BAUEN.bat eine falsche an, und wer nachrechnet,
       haelt die echte Datei fuer manipuliert. */
    const datei = path.join(ORDNER, 'wechselhaft.zip');

    writeFileSync(datei, 'erste Fassung');
    const vorher = clientstand(datei);
    assert.ok(vorher);

    writeFileSync(datei, 'zweite Fassung, laenger als die erste');
    // Aenderungszeit sicher verschieben - manche Dateisysteme sind grob.
    const spaeter = new Date(Date.now() + 5000);
    utimesSync(datei, spaeter, spaeter);

    const nachher = clientstand(datei);
    assert.ok(nachher);
    assert.notEqual(nachher.sha256, vorher.sha256, 'die Summe muss mitziehen');
    assert.equal(nachher.sha256,
      createHash('sha256').update('zweite Fassung, laenger als die erste').digest('hex'));
  });
});

describe('Download-Seite', () => {
  const seite = downloadSeite(clientstand(CLIENT));

  test('nennt die echte Pruefsumme', () => {
    // In Achtergruppen, damit man sie von Auge vergleichen kann.
    assert.match(seite.replace(/ /g, ''), new RegExp(ECHTE_SUMME));
  });

  test('verlinkt VirusTotal mit genau dieser Summe', () => {
    assert.match(seite, new RegExp('virustotal\\.com/gui/file/' + ECHTE_SUMME));
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

  test('kommt auch ohne hinterlegten Client zurecht', () => {
    const ohne = downloadSeite(null);
    assert.match(ohne, /nicht verfügbar/);
    assert.doesNotMatch(ohne, /virustotal/, 'ohne Datei keine Summe zum Nachschlagen');
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
    eintragen: () => { /* nichts */ },
    clientDatei: CLIENT
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

  test('/api/client nennt Summe, Groesse und Namen', async () => {
    const a = (await (await fetch(basis + '/api/client')).json()) as {
      ok: boolean; sha256: string; groesse: number; name: string;
    };
    assert.equal(a.ok, true);
    assert.equal(a.sha256, ECHTE_SUMME);
    assert.equal(a.groesse, INHALT.length);
  });

  test('die ausgelieferte Datei hat wirklich diese Summe', async () => {
    /* Die Gegenprobe, auf die es ankommt: was /api/client behauptet und
       was /client herausgibt, muss dasselbe sein. Sonst waere die ganze
       Seite eine Luege mit gutem Gewissen. */
    const roh = Buffer.from(await (await fetch(basis + '/client')).arrayBuffer());
    assert.equal(createHash('sha256').update(roh).digest('hex'), ECHTE_SUMME);
  });
});
