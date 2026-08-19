import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bearbeiteKonto, cookieLesen, SITZUNG_COOKIE } from '../src/konto-api.js';
import { kontoSeite } from '../src/konto-seite.js';
import { ladeKonten, type Kontenliste } from '../src/konten.js';
import { ladeFreigabeliste, type Freigabeliste } from '../src/freigabe.js';
import { ladeTokens, type Tokenliste } from '../src/tokens.js';
import type { Pruefung } from '../src/steam.js';

/* =========================================================================
   Kein Netz noetig: die Rueckfrage bei Steam ist eingesetzt (o.pruefer).
   Geprueft werden die REGELN des Kontobereichs - wer reindarf, was ein
   Cookie wert ist, und was passiert, wenn zwei Leute denselben
   Ingame-Namen wollen.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-konto-api-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const STEAM_A = '76561198000000001';
const STEAM_B = '76561198000000002';

let server: http.Server;
let basis: string;
let konten: Kontenliste;
let tokens: Tokenliste;
let freigabe: Freigabeliste;

/** Was die eingesetzte Steam-Pruefung antwortet. */
let pruefung: Pruefung = { ok: true, steamId: STEAM_A };
/** Wonach der Server sich nach aussen nennt - fuer den https-Test. */
let oeffentlicheUrl = '';

let n = 0;

before(async () => {
  server = http.createServer(async (req, res) => {
    const behandelt = await bearbeiteKonto(req, res, {
      konten, tokens, freigabe,
      oeffentlicheUrl: oeffentlicheUrl || basis,
      pruefer: async () => pruefung
    });
    // So sieht der Test, dass ein Pfad NICHT hierher gehoert.
    if (!behandelt) { res.writeHead(404); res.end('nicht meine'); }
  });

  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

beforeEach(() => {
  n++;
  tokens = ladeTokens(path.join(ORDNER, 't-' + n + '.json'));
  konten = ladeKonten(path.join(ORDNER, 'k-' + n + '.json'), tokens);
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'f-' + n + '.json'));
  pruefung = { ok: true, steamId: STEAM_A };
  oeffentlicheUrl = '';
});

/* ------------------------------------------------------------ Werkzeug */

/** Eine Anfrage ohne selbsttaetiges Folgen von Weiterleitungen. */
function hole(pfad: string, o: RequestInit & { sitzung?: string } = {}) {
  const { sitzung, ...rest } = o;
  return fetch(basis + pfad, {
    redirect: 'manual',
    ...rest,
    headers: {
      ...(sitzung ? { Cookie: SITZUNG_COOKIE + '=' + sitzung } : {}),
      ...(rest.headers ?? {})
    }
  });
}

/** Meldet jemanden an und gibt die Sitzungskennung aus dem Cookie zurueck. */
async function anmelden(steamId = STEAM_A): Promise<string> {
  pruefung = { ok: true, steamId };
  const res = await hole('/steam-zurueck?openid.mode=id_res');
  const gesetzt = res.headers.getSetCookie().join('; ');
  const m = new RegExp(SITZUNG_COOKIE + '=([^;]+)').exec(gesetzt);
  assert.ok(m, 'die Anmeldung muss ein Sitzungs-Cookie setzen');
  return decodeURIComponent(m![1]!);
}

interface Ansicht {
  benutzername: string;
  ingameName: string;
  steamId: string;
  token: string | null;
  brauchtFreigabe: boolean;
  gesperrt: boolean;
  namensSperreBis: number;
}

async function schicke(pfad: string, sitzung: string, wert?: string) {
  const res = await hole(pfad, {
    method: 'POST',
    sitzung,
    ...(wert === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wert })
    })
  });
  return {
    code: res.status,
    body: (await res.json()) as { ok: boolean; fehler?: string; konto?: Ansicht }
  };
}

async function ansicht(sitzung: string): Promise<Ansicht> {
  const res = await hole('/api/konto', { sitzung });
  const j = (await res.json()) as { angemeldet: boolean; konto: Ansicht };
  assert.equal(j.angemeldet, true);
  return j.konto;
}

/* ------------------------------------------------------------- Routing */

describe('Kontobereich - Routing', () => {
  test('laesst fremde Pfade durch', async () => {
    // bearbeiteKonto gibt false zurueck, damit der Server weitersucht.
    for (const p of ['/api/runde', '/api/offene', '/freigabe', '/']) {
      assert.equal(await (await hole(p)).text(), 'nicht meine', p);
    }
  });

  test('liefert die Kontoseite als HTML', async () => {
    const res = await hole('/konto');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await res.text(), /<!doctype html>/i);
  });

  test('stoert sich nicht an einem Schraegstrich am Ende', async () => {
    assert.equal((await hole('/konto/')).status, 200);
  });

  test('gibt die Kontoseite nicht aus dem Zwischenspeicher', async () => {
    // Sonst zeigt der Browser nach dem Abmelden noch den alten Stand.
    assert.match((await hole('/konto')).headers.get('cache-control') ?? '', /no-store/);
  });
});

/* ------------------------------------------------------------ Anmelden */

describe('Kontobereich - Anmeldung', () => {
  test('schickt /anmelden zu Steam', async () => {
    const res = await hole('/anmelden');
    assert.equal(res.status, 302);

    const ziel = new URL(res.headers.get('location') ?? '');
    assert.equal(ziel.host, 'steamcommunity.com');
    assert.equal(ziel.searchParams.get('openid.return_to'), basis + '/steam-zurueck');
    assert.equal(ziel.searchParams.get('openid.realm'), basis + '/');
  });

  test('legt bei bestaetigter Rueckkehr ein Konto an', async () => {
    const res = await hole('/steam-zurueck?openid.mode=id_res');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/konto');
    assert.equal(konten.alle().length, 1);
    assert.equal(konten.alle()[0]!.steamId, STEAM_A);
  });

  test('setzt das Sitzungs-Cookie geschuetzt', async () => {
    const res = await hole('/steam-zurueck?openid.mode=id_res');
    const c = res.headers.getSetCookie().join('; ');
    assert.match(c, /HttpOnly/, 'JavaScript soll nicht an die Sitzung kommen');
    assert.match(c, /SameSite=Lax/, 'sonst kommt der Cookie bei der Rueckkehr von Steam nicht mit');
    assert.match(c, /Path=\//);
    assert.doesNotMatch(c, /Secure/, 'ueber http wuerde Secure den Cookie ganz verhindern');
  });

  test('setzt Secure, sobald der Server ueber https laeuft', async () => {
    oeffentlicheUrl = 'https://ranked.example.de';
    const res = await hole('/steam-zurueck?openid.mode=id_res');
    assert.match(res.headers.getSetCookie().join('; '), /Secure/);
  });

  test('legt bei abgelehnter Pruefung kein Konto an', async () => {
    // Der Kern: eine selbstgebastelte Rueckleitung darf nichts bewirken.
    pruefung = { ok: false, fehler: 'Steam hat die Anmeldung nicht bestaetigt.' };
    const res = await hole('/steam-zurueck?openid.mode=id_res');

    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') ?? '', /^\/konto\?fehler=/);
    assert.equal(res.headers.getSetCookie().length, 0, 'kein Cookie ohne Beweis');
    assert.equal(konten.alle().length, 0);
  });

  test('gibt den Grund an die Seite weiter', async () => {
    pruefung = { ok: false, fehler: 'Die Anmeldung wurde abgebrochen.' };
    const res = await hole('/steam-zurueck?openid.mode=id_res');
    const ziel = new URL(res.headers.get('location') ?? '', basis);
    assert.equal(ziel.searchParams.get('fehler'), 'Die Anmeldung wurde abgebrochen.');
  });

  test('meldet dieselbe SteamID wieder an, statt ein zweites Konto anzulegen', async () => {
    await anmelden(STEAM_A);
    await anmelden(STEAM_A);
    assert.equal(konten.alle().length, 1);
  });
});

describe('Kontobereich - Abmelden', () => {
  test('loescht den Cookie und die Sitzung', async () => {
    const s = await anmelden();
    const res = await hole('/abmelden', { sitzung: s });

    assert.equal(res.status, 302);
    assert.match(res.headers.getSetCookie().join('; '), /Max-Age=0/);

    // Wichtiger als der Cookie: die Sitzung gilt serverseitig nicht mehr.
    const j = await (await hole('/api/konto', { sitzung: s })).json() as { angemeldet: boolean };
    assert.equal(j.angemeldet, false);
  });

  test('stolpert nicht ueber ein Abmelden ohne Sitzung', async () => {
    assert.equal((await hole('/abmelden')).status, 302);
  });
});

/* --------------------------------------------------------------- Lesen */

describe('Kontobereich - /api/konto', () => {
  test('sagt ohne Cookie, dass niemand angemeldet ist', async () => {
    const res = await hole('/api/konto');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, angemeldet: false });
  });

  test('sagt bei erfundenem Cookie dasselbe', async () => {
    const j = await (await hole('/api/konto', { sitzung: 'ausgedacht' })).json() as
      { angemeldet: boolean };
    assert.equal(j.angemeldet, false);
  });

  test('zeigt das frische Konto ohne Ingame-Namen und ohne Token', async () => {
    const a = await ansicht(await anmelden());
    assert.equal(a.steamId, STEAM_A);
    assert.equal(a.ingameName, '');
    assert.equal(a.token, null, 'ohne Ingame-Namen waere ein Token nutzlos');
    assert.equal(a.brauchtFreigabe, true);
    assert.equal(a.namensSperreBis, 0, 'der erste Name geht sofort');
  });

  test('gibt die Sitzungskennung nicht mit heraus', async () => {
    const s = await anmelden();
    const roh = await (await hole('/api/konto', { sitzung: s })).text();
    assert.equal(roh.includes(s), false);
  });
});

/* ---------------------------------------------------------- Ingame-Name */

describe('Kontobereich - Ingame-Name', () => {
  test('legt beim ersten Namen den Token an', async () => {
    const s = await anmelden();
    const { code, body } = await schicke('/api/konto-ingame', s, 'Jones');

    assert.equal(code, 200);
    assert.equal(body.konto!.ingameName, 'Jones');
    assert.ok(body.konto!.token, 'jetzt gibt es etwas zum Hochladen');
    /* Seit es die Auffaelligkeitspruefung gibt, laeuft ein neuer Zugang
       durch - angehalten wird nur, was auffaellt. Umstellbar ueber
       MC_NEUE_BRAUCHEN_FREIGABE=1. */
    assert.equal(body.konto!.brauchtFreigabe, false, 'neue Zugaenge zaehlen sofort');
  });

  test('traegt den Ingame-Namen in den Token ein', async () => {
    // Er entscheidet spaeter, WELCHE Zeile des Scoreboards gewertet wird.
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    assert.equal(tokens.alle()[0]!.ingameName, 'Jones');
  });

  test('sperrt danach die Aenderung fuer eine Weile', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');

    const { code, body } = await schicke('/api/konto-ingame', s, 'TREV');
    assert.equal(code, 400);
    assert.match(String(body.fehler), /alle 30 Tage/);
    assert.ok((await ansicht(s)).namensSperreBis > Date.now());
  });

  test('gibt einen belegten Namen nicht an ein zweites Konto', async () => {
    // Die eigentliche Sperre gegen "ich nehme den Namen des Erstplatzierten".
    const a = await anmelden(STEAM_A);
    await schicke('/api/konto-ingame', a, 'Jones');

    const b = await anmelden(STEAM_B);
    const { code, body } = await schicke('/api/konto-ingame', b, 'jones');

    assert.equal(code, 400);
    assert.match(String(body.fehler), /schon einem anderen Konto/);
    assert.equal((await ansicht(b)).ingameName, '');
  });

  test('weist einen leeren Namen ab', async () => {
    const s = await anmelden();
    const { code } = await schicke('/api/konto-ingame', s, '   ');
    assert.equal(code, 400);
  });
});

/* -------------------------------------------------------- Benutzername */

describe('Kontobereich - Benutzername', () => {
  test('aendert den Anzeigenamen', async () => {
    const s = await anmelden();
    const { code, body } = await schicke('/api/konto-name', s, 'Noriko');
    assert.equal(code, 200);
    assert.equal(body.konto!.benutzername, 'Noriko');
  });

  test('zieht den Namen im Token mit', async () => {
    // Im Dashboard steht er als Absender der Runde.
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    await schicke('/api/konto-name', s, 'Noriko');
    assert.equal(tokens.alle()[0]!.name, 'Noriko');
  });

  test('weist einen leeren Namen ab', async () => {
    const s = await anmelden();
    const { code } = await schicke('/api/konto-name', s, '');
    assert.equal(code, 400);
  });

  test('ruehrt den Ingame-Namen nicht an', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    await schicke('/api/konto-name', s, 'Noriko');
    assert.equal((await ansicht(s)).ingameName, 'Jones');
  });
});

/* ---------------------------------------------------------------- Token */

describe('Kontobereich - Token', () => {
  test('erzeugt einen neuen Token ohne mitgeschickte Daten', async () => {
    /* Der Knopf "Neuen erzeugen" schickt keinen Koerper. Frueher
       scheiterte JSON.parse('') und er tat scheinbar gar nichts. */
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    const alt = (await ansicht(s)).token;

    const res = await hole('/api/konto-token', { method: 'POST', sitzung: s });
    const body = await res.json() as { ok: boolean; konto: Ansicht };

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.konto.token);
    assert.notEqual(body.konto.token, alt);
  });

  test('sperrt den alten Token', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    const alt = (await ansicht(s)).token;

    await hole('/api/konto-token', { method: 'POST', sitzung: s });

    const vorher = tokens.alle().find((t) => t.token === alt);
    assert.equal(vorher?.gesperrt, true, 'ein verlorener Token darf nicht weiter gelten');
  });

  test('verlangt vorher den Ingame-Namen', async () => {
    const s = await anmelden();
    const res = await hole('/api/konto-token', { method: 'POST', sitzung: s });
    assert.equal(res.status, 400);
    assert.match(String(((await res.json()) as { fehler: string }).fehler), /Ingame-Namen/);
  });
});

/* --------------------------------------------------------------- Zugang */

describe('Kontobereich - Zugang zu den Aenderungen', () => {
  const geschuetzt = ['/api/konto-name', '/api/konto-ingame', '/api/konto-token'];

  test('weist Aenderungen ohne Anmeldung ab', async () => {
    for (const p of geschuetzt) {
      const res = await hole(p, { method: 'POST' });
      assert.equal(res.status, 401, p);
    }
  });

  test('weist GET auf die Aenderungen ab', async () => {
    const s = await anmelden();
    for (const p of geschuetzt) {
      assert.equal((await hole(p, { sitzung: s })).status, 405, p);
    }
  });

  test('weist unlesbare Daten ab', async () => {
    const s = await anmelden();
    const res = await hole('/api/konto-name', {
      method: 'POST', sitzung: s,
      headers: { 'Content-Type': 'application/json' },
      body: '{kaputt'
    });
    assert.equal(res.status, 400);
  });

  test('prueft die Anmeldung vor den Daten', async () => {
    // Sonst verriete die Fehlermeldung, ob es die Sitzung gibt.
    const res = await hole('/api/konto-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{kaputt'
    });
    assert.equal(res.status, 401);
  });
});

/* ---------------------------------------------------------------- Cookie */

describe('cookieLesen', () => {
  /** Baut eine Anfrage, wie sie der Server sieht. */
  function anfrage(cookie?: string): http.IncomingMessage {
    return { headers: cookie === undefined ? {} : { cookie } } as http.IncomingMessage;
  }

  test('findet den Cookie zwischen anderen', () => {
    const req = anfrage('theme=dark; ' + SITZUNG_COOKIE + '=abc123; sonst=1');
    assert.equal(cookieLesen(req, SITZUNG_COOKIE), 'abc123');
  });

  test('kommt ohne Cookie-Kopf zurecht', () => {
    assert.equal(cookieLesen(anfrage(), SITZUNG_COOKIE), null);
  });

  test('gibt null zurueck, wenn der Name nicht dabei ist', () => {
    assert.equal(cookieLesen(anfrage('theme=dark'), SITZUNG_COOKIE), null);
  });

  test('verwechselt keinen Namen, der nur aehnlich anfaengt', () => {
    const req = anfrage(SITZUNG_COOKIE + '_alt=falsch; ' + SITZUNG_COOKIE + '=richtig');
    assert.equal(cookieLesen(req, SITZUNG_COOKIE), 'richtig');
  });

  test('macht die Verschluesselung des Werts rueckgaengig', () => {
    assert.equal(cookieLesen(anfrage('x=a%2Fb%3Dc'), 'x'), 'a/b=c');
  });

  test('uebersteht Bruchstuecke ohne Gleichheitszeichen', () => {
    assert.equal(cookieLesen(anfrage('kaputt; x=1'), 'x'), '1');
  });
});

/* ------------------------------------------------------ Seite und API */

describe('Kontoseite und API passen zusammen', () => {
  test('ruft nur Pfade auf, die es auch gibt', async () => {
    /* Die Seite steht in konto-seite.ts, die Pfade in konto-api.ts. Wer
       einen davon umbenennt, soll es hier merken und nicht erst im
       Browser des Zuschauers. */
    const html = kontoSeite();
    const pfade = new Set<string>();
    for (const m of html.matchAll(/(?:fetch|schicke)\(\s*'(\/[^']+)'/g)) pfade.add(m[1]!);
    for (const m of html.matchAll(/\.href = '(\/[^']+)'/g)) pfade.add(m[1]!);

    assert.ok(pfade.size >= 5, 'die Seite sollte mehrere Pfade aufrufen, gefunden: ' + pfade.size);

    for (const p of pfade) {
      /* /client liefert der Server selbst aus (die .exe liegt neben ihm),
         nicht der Kontobereich - dafuer gibt es einen eigenen Test in
         server.test.ts. */
      if (p === '/client') continue;

      const text = await (await hole(p)).text();
      assert.notEqual(text, 'nicht meine', p + ' wird von der Seite aufgerufen, aber nicht bedient');
    }
  });
});

/* -------------------------------------------------------- eigene Runden */

describe('Kontobereich - eigene Runden', () => {
  /** Legt eine Runde ab, wie sie ein Upload erzeugt haette. */
  function runde(ingame: string, punkte: number) {
    return freigabe.hinzufuegen({
      eingegangen: Date.now(),
      quelle: 'zuschauer',
      absender: 'Baloou',
      bildPfad: '/tmp/x.png',
      bildHash: Math.random().toString(36),
      zeilen: [{
        zeile: 1, rohName: ingame, rohPunkte: String(punkte),
        punkte: { punkte, unsicher: false }
      }],
      beansprucht: [ingame.toLowerCase()]
    }).runde;
  }

  test('sind leer, solange nichts eingereicht wurde', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');

    const res = await hole('/api/konto', { sitzung: s });
    const j = (await res.json()) as { runden: unknown[] };
    assert.deepEqual(j.runden, []);
  });

  test('zeigen den Ausgang der eigenen Einreichung', async () => {
    /* Ohne diese Rueckmeldung endet es fuer den Zuschauer bei
       "eingereicht" - und er schickt dasselbe nochmal. */
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');

    const r = runde('Jones', 2771);
    freigabe.entscheiden(r.id, 'abgelehnt', 'Baloou', 'Bild wirkt bearbeitet');

    const res = await hole('/api/konto', { sitzung: s });
    const j = (await res.json()) as {
      runden: Array<{ punkte: number; status: string; grund: string }>;
    };

    assert.equal(j.runden.length, 1);
    assert.equal(j.runden[0]!.punkte, 2771);
    assert.equal(j.runden[0]!.status, 'abgelehnt');
    assert.equal(j.runden[0]!.grund, 'Bild wirkt bearbeitet');
  });

  test('zeigen keine fremden Runden', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    runde('TREV', 5000);

    const res = await hole('/api/konto', { sitzung: s });
    const j = (await res.json()) as { runden: unknown[] };
    assert.deepEqual(j.runden, []);
  });
});

/* -------------------------------------------------- geloeschtes Konto */

describe('Kontobereich - geloeschtes Konto', () => {
  test('gilt als abgemeldet', () => {
    /* Die Kontoseite darf nicht weiterlaufen, als waere nichts gewesen -
       sonst holt sich jemand nach dem Loeschen munter neue Tokens. */
    const e = konten.anmelden(STEAM_A);
    assert.equal(e.ok, true);
    if (!e.ok) return;

    konten.loeschen(e.wert.konto.id);
    assert.equal(konten.ausSitzung(e.wert.sitzung), null);
  });
});

/* ------------------------------------------------- selbst loeschen */

describe('Kontobereich - Konto selbst loeschen', () => {
  test('loescht das eigene Konto und beendet die Sitzung', async () => {
    /* Wer sich anmelden kann, muss auch gehen koennen, ohne jemanden
       darum zu bitten. */
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');

    const res = await hole('/api/konto-loeschen', { method: 'POST', sitzung: s });
    assert.equal(res.status, 200);
    assert.match(res.headers.getSetCookie().join('; '), /Max-Age=0/);

    const j = await (await hole('/api/konto', { sitzung: s })).json() as { angemeldet: boolean };
    assert.equal(j.angemeldet, false, 'die Sitzung ist erloschen');
  });

  test('sperrt dabei den Zugang', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    await hole('/api/konto-loeschen', { method: 'POST', sitzung: s });

    assert.equal(tokens.alle()[0]!.gesperrt, true);
    assert.equal(konten.aktive().length, 0);
    assert.equal(konten.alle().length, 1, 'die Historie haengt daran - weg ist es nie');
  });

  test('holt das Konto bei erneuter Anmeldung zurueck', async () => {
    const s = await anmelden();
    await schicke('/api/konto-ingame', s, 'Jones');
    await hole('/api/konto-loeschen', { method: 'POST', sitzung: s });

    const neu = await anmelden();
    const a = await ansicht(neu);
    assert.equal(a.ingameName, 'Jones', 'derselbe Name, dasselbe Konto');
    assert.equal(konten.aktive().length, 1);
  });

  test('braucht eine Anmeldung', async () => {
    assert.equal((await hole('/api/konto-loeschen', { method: 'POST' })).status, 401);
  });

  test('weist GET ab', async () => {
    const s = await anmelden();
    assert.equal((await hole('/api/konto-loeschen', { sitzung: s })).status, 405);
  });
});
