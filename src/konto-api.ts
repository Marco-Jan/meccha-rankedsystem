/* =========================================================================
   KONTOSEITE - was Zuschauer selbst bedienen.

   Der dritte Zugangsbereich des Servers, mit einer eigenen Regel:

     /api/runde       Zuschauer-Client, mit Upload-Token
     /api/offene ...  Streamer, mit Admin-Schluessel
     /konto ...       angemeldeter Zuschauer, mit Sitzungs-Cookie

   Hier meldet sich jemand ueber Steam an, traegt seinen Ingame-Namen ein
   und holt seinen Token ab. Das ersetzt das Anlegen von Hand, das bei
   vielen Zuschauern nicht mehr zu schaffen waere.
   ========================================================================= */

import http from 'node:http';

import { Kontenliste, type Konto } from './konten.js';
import type { Freigabeliste } from './freigabe.js';
import { nameKey } from './namen.js';
import { Tokenliste, brauchtFreigabe } from './tokens.js';
import { anmeldeUrl, pruefeRueckkehr, holeSteamNamen } from './steam.js';
import { kontoSeite } from './konto-seite.js';

/** Name des Cookies mit der Sitzungskennung. */
export const SITZUNG_COOKIE = 'mc_sitzung';

export interface KontoApiOptionen {
  readonly konten: Kontenliste;
  readonly tokens: Tokenliste;
  /**
   * Adresse, unter der dieser Server von aussen erreichbar ist.
   *
   * Steam leitet dorthin zurueck und prueft, dass die Rueckadresse zum
   * angegebenen Bereich passt. Kommt aus MC_OEFFENTLICHE_URL, damit ein
   * Serverumzug keine Codeaenderung braucht.
   */
  readonly oeffentlicheUrl: string;
  /**
   * Die Freigabeliste - nur zum Anzeigen der eigenen Runden.
   *
   * Ohne sie sieht der Zuschauer auf seiner Kontoseite nicht, was aus
   * seinen Einreichungen geworden ist. Er bekommt ausschliesslich seine
   * eigenen zu sehen, ohne Bild und ohne die Zeilen der Mitspieler.
   */
  readonly freigabe?: Freigabeliste | undefined;
  /** Nur zum Testen: umgeht die Rueckfrage bei Steam. */
  readonly pruefer?: typeof pruefeRueckkehr;
}

function sendeJson(res: http.ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

function leseKoerper(req: http.IncomingMessage): Promise<string> {
  return new Promise((fertig, fehler) => {
    let roh = '';
    req.on('data', (s: Buffer) => {
      roh += s.toString();
      if (roh.length > 16 * 1024) { fehler(new Error('zu gross')); req.destroy(); }
    });
    req.on('end', () => fertig(roh));
    req.on('error', fehler);
  });
}

/** Liest einen Cookie aus dem Kopf der Anfrage. */
export function cookieLesen(req: http.IncomingMessage, name: string): string | null {
  const roh = req.headers.cookie;
  if (!roh) return null;

  for (const teil of roh.split(';')) {
    const i = teil.indexOf('=');
    if (i < 0) continue;
    if (teil.slice(0, i).trim() === name) {
      return decodeURIComponent(teil.slice(i + 1).trim());
    }
  }
  return null;
}

/**
 * Baut den Cookie-Kopf fuer die Sitzung.
 *
 * HttpOnly: JavaScript soll nicht drankommen. SameSite=Lax: der Cookie
 * geht bei der Rueckleitung von Steam mit, aber nicht bei fremden
 * Formularen. Secure nur bei https - sonst wuerde der Cookie beim
 * lokalen Testen ueber http gar nicht erst gesetzt.
 */
function sitzungsCookie(code: string, ueberHttps: boolean, tage = 30): string {
  const teile = [
    SITZUNG_COOKIE + '=' + encodeURIComponent(code),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + (tage * 24 * 60 * 60)
  ];
  if (ueberHttps) teile.push('Secure');
  return teile.join('; ');
}

/** Wie sich ein Konto nach aussen darstellt - ohne die Sitzung. */
function alsAnsicht(konto: Konto, tokens: Tokenliste, konten: Kontenliste) {
  const token = konto.token
    ? tokens.alle().find((t) => t.token === konto.token) ?? null
    : null;

  const frei = konten.sperreBis(konto);
  return {
    benutzername: konto.benutzername,
    ingameName: konto.ingameName,
    steamId: konto.steamId,
    /* Damit die Kontoseite Mods und Admins den Weg zur Verwaltung
       zeigen kann - Zuschauer sehen davon nichts. */
    rolle: konten.rolleVon(konto),
    token: token && !token.gesperrt ? token.token : null,
    brauchtFreigabe: token ? brauchtFreigabe(token) : true,
    gesperrt: token ? token.gesperrt === true : false,
    sperrgrund: token?.sperrgrund ?? null,
    /* Wann der Ingame-Name wieder aenderbar ist. 0 heisst sofort - die
       Seite zeigt das an, damit niemand vergeblich klickt. */
    namensSperreBis: frei,
    /* Mit welcher Client-Fassung diese Person zuletzt gesendet hat.
       null = noch nie gesendet oder ein Client vor 0.7.0, der seine
       Nummer noch nicht mitschickte. Die Seite unterscheidet beides
       nicht - sie kann in beiden Faellen nur "unbekannt" sagen. */
    clientVersion: token?.clientVersion ?? null
  };
}

/**
 * Die letzten Einreichungen dieses Kontos - Zeitpunkt, Punktzahl,
 * Ausgang, und bei einer Ablehnung der Grund.
 *
 * Ohne Bild: der Screenshot zeigt die ganze Lobby und damit fremde
 * Namen. Fuer die Rueckmeldung braucht es ihn nicht.
 */
function eigeneRunden(o: KontoApiOptionen, konto: Konto) {
  if (!o.freigabe || !konto.ingameName) return [];

  const key = nameKey(konto.ingameName);
  return o.freigabe.vonPerson(key, konto.benutzername).map((r) => {
    const eigene = r.zeilen.find((z) => nameKey(z.rohName) === key) ?? null;
    return {
      id: r.id,
      eingegangen: r.eingegangen,
      status: r.status,
      punkte: eigene?.punkte?.punkte ?? null,
      grund: r.grund ?? null,
      bearbeitetAm: r.bearbeitetAm ?? null
    };
  });
}

/**
 * Wie weit ist diese Person von der Wertung entfernt?
 *
 * Gewertet wird erst ab VOLL Eintraegen, davor
 * steht man als Anwaerter (listen.js:30). Ohne diese Angabe wundert
 * sich jemand nach drei Runden, warum er nirgends auftaucht - und
 * fragt dich.
 *
 * Gezaehlt werden die eigenen FREIGEGEBENEN Runden. Naeherung: was du
 * ausserhalb der Freigabe entsteht, weiss dieser Server nicht.
 */
function wertungsstand(o: KontoApiOptionen, konto: Konto): { gewertet: number; voll: number } {
  const voll = 10;
  if (!o.freigabe || !konto.ingameName) return { gewertet: 0, voll };

  const key = nameKey(konto.ingameName);
  const gewertet = o.freigabe.vonPerson(key, konto.benutzername, 999)
    .filter((r) => r.status === 'freigegeben').length;

  return { gewertet, voll };
}

/**
 * Bearbeitet eine Anfrage der Kontoseite.
 *
 * Gibt false zurueck, wenn der Pfad nicht hierher gehoert.
 */
export async function bearbeiteKonto(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  o: KontoApiOptionen
): Promise<boolean> {

  const url = new URL(req.url ?? '/', o.oeffentlicheUrl || 'http://localhost');
  const pfad = url.pathname.replace(/\/+$/, '') || '/';

  const meine = [
    '/konto', '/anmelden', '/abmelden', '/steam-zurueck',
    '/api/konto', '/api/konto-ingame', '/api/konto-name', '/api/konto-token',
    '/api/konto-loeschen'
  ];
  if (!meine.includes(pfad)) return false;

  const basis = (o.oeffentlicheUrl || 'http://localhost:8790').replace(/\/+$/, '');
  const ueberHttps = basis.startsWith('https://');

  /* ------------------------------------------------------- Anmelden */

  if (pfad === '/anmelden') {
    res.writeHead(302, { Location: anmeldeUrl(basis + '/steam-zurueck', basis + '/') });
    res.end();
    return true;
  }

  if (pfad === '/steam-zurueck') {
    /*
       Die Rueckleitung allein beweist nichts - jeder koennte sich eine
       Adresse mit fremder SteamID basteln. Erst die Rueckfrage bei Steam
       macht daraus einen Beweis. Siehe steam.ts.
    */
    const pruefer = o.pruefer ?? pruefeRueckkehr;
    const p = await pruefer(url.searchParams);

    if (!p.ok) {
      res.writeHead(302, { Location: '/konto?fehler=' + encodeURIComponent(p.fehler) });
      res.end();
      return true;
    }

    /* Anzeigenamen von Steam holen, falls ein Schluessel hinterlegt ist.
       Ohne Schluessel bleibt er leer und der Nutzer traegt ihn selbst
       ein - die Anmeldung darf daran nicht scheitern. */
    const steamName = await holeSteamNamen(p.steamId);
    const a = o.konten.anmelden(p.steamId, steamName ?? undefined);
    if (!a.ok) {
      res.writeHead(302, { Location: '/konto?fehler=' + encodeURIComponent(a.fehler) });
      res.end();
      return true;
    }

    res.writeHead(302, {
      Location: '/konto',
      'Set-Cookie': sitzungsCookie(a.wert.sitzung, ueberHttps)
    });
    res.end();
    return true;
  }

  if (pfad === '/abmelden') {
    const code = cookieLesen(req, SITZUNG_COOKIE);
    if (code) o.konten.abmelden(code);
    res.writeHead(302, {
      Location: '/konto',
      'Set-Cookie': SITZUNG_COOKIE + '=; Path=/; Max-Age=0'
    });
    res.end();
    return true;
  }

  /* ---------------------------------------------------------- Seite */

  if (pfad === '/konto') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(kontoSeite());
    return true;
  }

  /* ------------------------------------------------------------ API */

  const code = cookieLesen(req, SITZUNG_COOKIE);
  const konto = code ? o.konten.ausSitzung(code) : null;

  if (pfad === '/api/konto') {
    if (!konto) {
      sendeJson(res, 200, { ok: true, angemeldet: false });
      return true;
    }
    sendeJson(res, 200, {
      ok: true,
      angemeldet: true,
      konto: alsAnsicht(konto, o.tokens, o.konten),
      runden: eigeneRunden(o, konto),
      wertung: wertungsstand(o, konto)
    });
    return true;
  }

  // Ab hier: nur angemeldet, und nur POST.
  if (!konto) {
    sendeJson(res, 401, { ok: false, fehler: 'Nicht angemeldet.' });
    return true;
  }
  if (req.method !== 'POST') {
    sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
    return true;
  }

  /*
     Leerer Koerper ist erlaubt: /api/konto-token braucht keine Angaben
     und schickt deshalb nichts mit. Vorher scheiterte JSON.parse('')
     und der Knopf "Neuen erzeugen" tat scheinbar gar nichts.
  */
  const roh = (await leseKoerper(req)).trim();
  let daten: { wert?: string } = {};
  if (roh.length > 0) {
    try {
      daten = JSON.parse(roh) as typeof daten;
    } catch {
      sendeJson(res, 400, { ok: false, fehler: 'Ungueltige Daten' });
      return true;
    }
  }

  if (pfad === '/api/konto-name') {
    const e = o.konten.aendereBenutzername(konto.id, String(daten.wert ?? ''));
    sendeJson(res, e.ok ? 200 : 400,
      e.ok ? { ok: true, konto: alsAnsicht(e.wert, o.tokens, o.konten) }
           : { ok: false, fehler: e.fehler });
    return true;
  }

  if (pfad === '/api/konto-ingame') {
    // vomStreamer bleibt false - hier ist ausdruecklich der Nutzer am Werk,
    // also gelten Sperrfrist und Rueckstufung auf "braucht Freigabe".
    const e = o.konten.setzeIngameName(konto.id, String(daten.wert ?? ''), false);
    sendeJson(res, e.ok ? 200 : 400,
      e.ok ? { ok: true, konto: alsAnsicht(e.wert, o.tokens, o.konten) }
           : { ok: false, fehler: e.fehler });
    return true;
  }

  /*
     Das eigene Konto loeschen.

     Gehoert hierher und nicht nur ins Dashboard: wer sich anmeldet,
     muss auch wieder gehen koennen, ohne jemanden darum zu bitten.

     Weich wie ueberall - der Zugang gilt nicht mehr, die schon
     gewerteten Runden bleiben aber in der Punkteliste stehen. Sie
     gehoeren zum Turnier und nicht mehr allein zu ihm; sie
     nachtraeglich herauszunehmen wuerde fremde Schnitte veraendern.
  */
  if (pfad === '/api/konto-loeschen') {
    const e = o.konten.loeschen(konto.id);
    if (!e.ok) {
      sendeJson(res, 400, { ok: false, fehler: e.fehler });
      return true;
    }
    // Die Sitzung ist mit dem Loeschen erloschen - Cookie mit wegraeumen.
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': SITZUNG_COOKIE + '=; Path=/; Max-Age=0'
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (pfad === '/api/konto-token') {
    const e = o.konten.tokenNeu(konto.id);
    if (!e.ok) {
      sendeJson(res, 400, { ok: false, fehler: e.fehler });
      return true;
    }
    const frisch = o.konten.findeNachId(konto.id)!;
    sendeJson(res, 200, { ok: true, konto: alsAnsicht(frisch, o.tokens, o.konten) });
    return true;
  }

  sendeJson(res, 404, { ok: false, fehler: 'Unbekannt' });
  return true;
}
