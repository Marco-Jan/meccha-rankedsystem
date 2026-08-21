import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { kontoSeite } from '../src/konto-seite.js';
import { Seite, fuehreAus, idsAus } from './hilfe-dom.js';

/* =========================================================================
   DER DOWNLOAD-KNOPF SAGT, WAS ES GIBT - UND WAS DU HAST

   Der Anlass: Der Client bekam alle japanischen Texte und hiess weiter
   0.5.0. Der Hinweis auf eine neue Fassung blieb aus, denn Server und
   Client nannten dieselbe Nummer.

   Beim Nachsehen fiel ein zweiter Fehler auf: die Zeile unter dem Knopf
   wurde nur im WARNKASTEN gefuellt, und den baut die Seite ausschliess-
   lich, wenn niemand angemeldet ist. Wer angemeldet war - also jeder,
   der den Client wirklich benutzt - sah dort ewig "ohne Installation"
   und nie eine Fassungsnummer.

   Deshalb laeuft das hier im gefaelschten DOM: beide Fehler sind nur
   sichtbar, wenn man die Seite wirklich ausfuehrt.
   ========================================================================= */

const HTML = kontoSeite();

const LEERE_RANGLISTE = { ok: true, fenster: 10, voll: 10, listen: [] };

const CLIENT = {
  ok: true,
  version: '0.7.0',
  gebaut: '2026-08-21T08:00:36.626Z',
  releases: 'https://github.com/Marco-Jan/meccha-rankedsystem/releases/latest',
  quelltext: 'https://github.com/Marco-Jan/meccha-rankedsystem'
};

/** Baut die Seite mit einer bestimmten Konto-Antwort. */
async function zeichne(konto: unknown, client: unknown = CLIENT): Promise<Seite> {
  const seite = new Seite(
    {
      '/api/status': { ok: true, offen: 0, maxBild: 8388608, minSpieler: 6 },
      '/api/client': client,
      '/api/rangliste': LEERE_RANGLISTE,
      '/api/konto': konto
    },
    idsAus(HTML)
  );
  await fuehreAus(HTML, seite);
  return seite;
}

/** Ein angemeldetes Konto, das mit der angegebenen Fassung gesendet hat. */
function angemeldetMit(clientVersion: string | null) {
  return {
    ok: true,
    angemeldet: true,
    konto: {
      benutzername: 'Baloou',
      ingameName: 'Baloou',
      steamId: '76561198000000000',
      rolle: 'admin',
      token: 'WAA5FOCc',
      brauchtFreigabe: false,
      gesperrt: false,
      sperrgrund: null,
      namensSperreBis: 0,
      clientVersion
    },
    runden: [],
    wertung: { gewertet: 0, voll: 10 }
  };
}

function unterDemKnopf(seite: Seite): string {
  const k = seite.hole('holen-daten');
  assert.ok(k, 'holen-daten fehlt');
  return k.textContent;
}

describe('Download-Knopf', () => {
  test('zeigt Fassung, Baudatum und die Quelle', async () => {
    /* Die GROESSE stand hier auch einmal. Sie kam aus der Datei, die
       dieser Server auslieferte - seit die bei GitHub liegt, kennt er
       sie nicht mehr. */
    const seite = await zeichne({ ok: true, angemeldet: false });
    const text = unterDemKnopf(seite);

    assert.match(text, /0\.7\.0/, 'die Fassungsnummer fehlt');
    assert.match(text, /21\.08\.2026/, 'das Baudatum fehlt');
    assert.doesNotMatch(text, /KB/, 'die Groesse kennt der Server nicht mehr');
  });

  test('der Knopf zeigt auf die Release-Seite', async () => {
    const seite = await zeichne({ ok: true, angemeldet: false });
    const knopf = seite.hole('holen-knopf');
    assert.ok(knopf);
    assert.match(String(knopf.href ?? ''), /github\.com/);
  });

  test('auch fuer Angemeldete', async () => {
    /* Genau der Fehler: die Zeile hing am Warnkasten, und den gibt es
       nur auf der abgemeldeten Seite. Wer angemeldet war, sah nie eine
       Nummer - also gerade die Leute, die den Client benutzen. */
    const seite = await zeichne(angemeldetMit('0.7.0'));
    assert.match(unterDemKnopf(seite), /0\.7\.0/);
  });

  test('meldet eine neuere Fassung, wenn die eigene aelter ist', async () => {
    const seite = await zeichne(angemeldetMit('0.6.0'));
    const text = unterDemKnopf(seite);

    assert.match(text, /0\.7\.0/, 'die neue Nummer fehlt');
    assert.match(text, /0\.6\.0/, 'die eigene Nummer fehlt');

    const knopf = seite.hole('holen-knopf');
    assert.ok(knopf, 'der Knopf fehlt');
    assert.match(knopf.className, /\bneu\b/, 'der Knopf wird nicht hervorgehoben');
  });

  test('schweigt, wenn die Fassung stimmt', async () => {
    const seite = await zeichne(angemeldetMit('0.7.0'));
    const knopf = seite.hole('holen-knopf');
    assert.ok(knopf);
    assert.doesNotMatch(knopf.className, /\bneu\b/);
  });

  test('behauptet nichts, wenn die eigene Fassung unbekannt ist', async () => {
    /* clientVersion ist null, solange jemand nie gesendet hat - oder
       wenn sein Client aelter als 0.7.0 ist und die Nummer noch gar
       nicht mitschickte. "Du hast null" waere schlimmer als schweigen. */
    const seite = await zeichne(angemeldetMit(null));
    const text = unterDemKnopf(seite);

    assert.doesNotMatch(text, /null|undefined/);
    assert.match(text, /0\.7\.0/);

    const knopf = seite.hole('holen-knopf');
    assert.ok(knopf);
    assert.doesNotMatch(knopf.className, /\bneu\b/);
  });

  test('kommt ohne Baudatum aus', async () => {
    // Aeltere Staende haben keinen Stempel - dann eben ohne Datum.
    const ohne = { ...CLIENT, gebaut: '' };
    const text = unterDemKnopf(await zeichne({ ok: true, angemeldet: false }, ohne));

    assert.match(text, /0\.7\.0/);
    assert.doesNotMatch(text, /vom|NaN|Invalid/);
  });

  test('haelt aus, wenn der Server nichts bereitliegen hat', async () => {
    const text = unterDemKnopf(
      await zeichne({ ok: true, angemeldet: false }, { ok: false, fehler: 'nichts da' })
    );
    assert.doesNotMatch(text, /undefined|NaN/);
  });

  test('fragt /api/client nur einmal', async () => {
    /* Kopfzeile und Warnkasten brauchen dieselbe Auskunft. Zweimal zu
       fragen waere nicht falsch, aber es waere ein zweiter Weg, auf dem
       beide auseinanderlaufen koennen. */
    const seite = await zeichne({ ok: true, angemeldet: false });
    const abrufe = seite.gerufen.filter((p) => p === '/api/client').length;
    assert.equal(abrufe, 1);
  });
});
