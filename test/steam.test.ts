import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STEAM_ANMELDUNG, anmeldeUrl, steamIdAus, pruefeRueckkehr, holeSteamNamen
} from '../src/steam.js';

/* =========================================================================
   Diese Tests gehen NICHT ins Netz. Die Rueckfrage bei Steam ist in
   pruefeRueckkehr() als Parameter herausgezogen und wird hier eingesetzt;
   bei holeSteamNamen() werden nur die Wege geprueft, die vor dem Abruf
   abbiegen.
   ========================================================================= */

const STEAM_A = '76561198000000001';

/* ------------------------------------------------------------ Hinweg */

describe('anmeldeUrl', () => {
  test('schickt den Nutzer zu Steam', () => {
    const u = new URL(anmeldeUrl('http://localhost:8790/steam-zurueck', 'http://localhost:8790/'));
    assert.equal(u.origin + u.pathname, STEAM_ANMELDUNG);
  });

  test('traegt Rueckadresse und Bereich ein', () => {
    const p = new URL(anmeldeUrl('http://x.de/steam-zurueck', 'http://x.de/')).searchParams;
    assert.equal(p.get('openid.return_to'), 'http://x.de/steam-zurueck');
    assert.equal(p.get('openid.realm'), 'http://x.de/');
  });

  test('fragt nicht nach einem bestimmten Nutzer', () => {
    // identifier_select heisst "Steam soll selbst wissen, wer angemeldet ist".
    const p = new URL(anmeldeUrl('http://x.de/z', 'http://x.de/')).searchParams;
    assert.equal(p.get('openid.mode'), 'checkid_setup');
    assert.equal(p.get('openid.identity'), 'http://specs.openid.net/auth/2.0/identifier_select');
    assert.equal(p.get('openid.claimed_id'), 'http://specs.openid.net/auth/2.0/identifier_select');
    assert.equal(p.get('openid.ns'), 'http://specs.openid.net/auth/2.0');
  });
});

/* ------------------------------------------------------------ Kennung */

describe('steamIdAus', () => {
  test('zieht die SteamID64 aus der Kennung', () => {
    assert.equal(steamIdAus('https://steamcommunity.com/openid/id/' + STEAM_A), STEAM_A);
    assert.equal(steamIdAus('http://steamcommunity.com/openid/id/' + STEAM_A), STEAM_A);
  });

  test('stoert sich nicht an Leerzeichen aussen herum', () => {
    assert.equal(steamIdAus('  https://steamcommunity.com/openid/id/' + STEAM_A + ' '), STEAM_A);
  });

  test('weist fremde Adressen ab', () => {
    // Sonst koennte jemand eine eigene Seite als Ausweis vorlegen.
    assert.equal(steamIdAus('https://boese.de/openid/id/' + STEAM_A), null);
    assert.equal(steamIdAus('https://steamcommunity.com.boese.de/openid/id/' + STEAM_A), null);
  });

  test('weist unpassende Kennungen ab', () => {
    assert.equal(steamIdAus('https://steamcommunity.com/openid/id/123'), null);
    assert.equal(steamIdAus('https://steamcommunity.com/openid/id/' + STEAM_A + 'x'), null);
    assert.equal(steamIdAus('https://steamcommunity.com/profiles/' + STEAM_A), null);
    assert.equal(steamIdAus(''), null);
    assert.equal(steamIdAus(undefined as unknown as string), null);
  });
});

/* ---------------------------------------------------------- Rueckkehr */

/** Eine Rueckleitung, wie Steam sie schickt. */
function rueckkehr(aenderungen: Record<string, string> = {}): URLSearchParams {
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_ANMELDUNG,
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/' + STEAM_A,
    'openid.identity': 'https://steamcommunity.com/openid/id/' + STEAM_A,
    'openid.return_to': 'http://localhost:8790/steam-zurueck',
    'openid.response_nonce': '2026-08-18T17:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'aBcDeF+ghi/jkl='
  });
  for (const [k, v] of Object.entries(aenderungen)) p.set(k, v);
  return p;
}

const JA = async () => 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n';
const NEIN = async () => 'ns:http://specs.openid.net/auth/2.0\nis_valid:false\n';

describe('pruefeRueckkehr', () => {
  test('nimmt eine von Steam bestaetigte Rueckkehr an', async () => {
    const p = await pruefeRueckkehr(rueckkehr(), JA);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.steamId, STEAM_A);
  });

  test('lehnt ab, wenn Steam nicht bestaetigt', async () => {
    // Der wichtigste Test des Moduls: eine selbstgebastelte Adresse mit
    // fremder SteamID darf nicht durchkommen.
    const p = await pruefeRueckkehr(rueckkehr(), NEIN);
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.match(p.fehler, /nicht bestaetigt/);
  });

  test('erkennt einen Abbruch bei Steam', async () => {
    let gefragt = false;
    const p = await pruefeRueckkehr(
      rueckkehr({ 'openid.mode': 'cancel' }),
      async () => { gefragt = true; return 'is_valid:true'; }
    );
    assert.equal(p.ok, false);
    assert.equal(gefragt, false, 'ohne id_res braucht Steam gar nicht erst gefragt zu werden');
  });

  test('weist eine Kennung ab, die nicht von Steam stammt', async () => {
    let gefragt = false;
    const p = await pruefeRueckkehr(
      rueckkehr({ 'openid.claimed_id': 'https://boese.de/openid/id/' + STEAM_A }),
      async () => { gefragt = true; return 'is_valid:true'; }
    );
    assert.equal(p.ok, false);
    assert.equal(gefragt, false);
  });

  test('schickt alle openid-Felder unveraendert zurueck', async () => {
    /* Die Signatur deckt die Felder mit ab - wer eines weglaesst oder
       aendert, macht die Pruefung ungueltig und bekommt immer false. */
    const rein = rueckkehr();
    let raus = new URLSearchParams();
    await pruefeRueckkehr(rein, async (k) => { raus = k; return 'is_valid:true'; });

    for (const [name, wert] of rein) {
      if (name === 'openid.mode') continue;
      assert.equal(raus.get(name), wert, name + ' muss unveraendert zurueckgehen');
    }
  });

  test('tauscht nur den Modus aus', async () => {
    let raus = new URLSearchParams();
    await pruefeRueckkehr(rueckkehr(), async (k) => { raus = k; return 'is_valid:true'; });
    assert.equal(raus.get('openid.mode'), 'check_authentication');
  });

  test('schickt eigene Parameter nicht mit', async () => {
    // Was nicht mit openid. anfaengt, gehoert uns und nicht Steam.
    let raus = new URLSearchParams();
    await pruefeRueckkehr(
      rueckkehr({ weiter: '/konto' }),
      async (k) => { raus = k; return 'is_valid:true'; }
    );
    assert.equal(raus.get('weiter'), null);
  });

  test('kommt mit Zeilenenden und Leerraum in Steams Antwort zurecht', async () => {
    const p = await pruefeRueckkehr(rueckkehr(), async () => 'ns:...\r\n  is_valid:true  \r\n');
    assert.equal(p.ok, true);
  });

  test('laesst sich nicht von einer Antwort ohne is_valid taeuschen', async () => {
    const p = await pruefeRueckkehr(rueckkehr(), async () => 'is_valid:truetrue\nfehler:nein');
    assert.equal(p.ok, false);
  });

  test('meldet einen nicht erreichbaren Steam-Dienst als solchen', async () => {
    const p = await pruefeRueckkehr(rueckkehr(), async () => { throw new Error('ETIMEDOUT'); });
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.match(p.fehler, /nicht erreichbar/);
    assert.match(p.fehler, /ETIMEDOUT/);
  });
});

/* --------------------------------------------------------- Anzeigename */

describe('holeSteamNamen', () => {
  test('gibt ohne Schluessel null zurueck, ohne ins Netz zu gehen', async () => {
    assert.equal(await holeSteamNamen(STEAM_A, ''), null);
  });

  test('gibt bei unbrauchbarer SteamID null zurueck', async () => {
    assert.equal(await holeSteamNamen('abc', 'schluessel'), null);
    assert.equal(await holeSteamNamen('', 'schluessel'), null);
  });
});
