/* =========================================================================
   FREIGABE-API - die geschuetzte Seite des Servers.

   Getrennt von server.ts, weil hier ein anderer Zugang gilt: der
   Upload-Endpunkt steht Zuschauern offen (mit Token), diese Endpunkte
   nur dir und deinen Mods (mit Admin-Schluessel).

   Endpunkte:
     GET  /api/offene       was wartet auf Entscheidung
     POST /api/entscheiden  freigeben oder ablehnen
     GET  /api/bild         das Bild zu einer Runde

   Beim Freigeben wandert die Runde in die Rangliste - erst dann zaehlt
   sie. Das ist der Punkt, an dem aus einer Einreichung ein Ergebnis
   wird.
   ========================================================================= */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import { Freigabeliste, type OffeneRunde } from './freigabe.js';
import { Tokenliste, brauchtFreigabe } from './tokens.js';
import type { Kontenliste } from './konten.js';
import { cookieLesen, SITZUNG_COOKIE } from './konto-api.js';
import { leserBeschreibung } from './leser-wahl.js';
import { bewerteRunde, teileAuf, personVon } from './runde.js';
import { nameKey } from './namen.js';
import {
  fruehereAblehnungen, verlaufVon, pruefeVerdacht, type Verlaufseintrag
} from './verdacht.js';
import type { Wertungsstand } from './wertung.js';

export interface FreigabeApiOptionen {
  readonly freigabe: Freigabeliste;
  /** Ohne Schluessel sind die Endpunkte gesperrt - nicht offen. */
  readonly adminKey: string;
  readonly holeStand: () => Wertungsstand;
  /** Erwartet die Konto-Kennung, nicht den gelesenen Namen. */
  readonly eintragen: (kontoId: string, punkte: number) => void;
  /** Fuer die Tokenverwaltung im Dashboard. */
  readonly tokens?: Tokenliste | undefined;
  /** Fuer die Kontenverwaltung im Dashboard. */
  readonly konten?: Kontenliste | undefined;
}

function sendeJson(res: http.ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

/**
 * Prueft den Admin-Schluessel.
 *
 * Ein LEERER Schluessel sperrt alles, statt alles zu oeffnen. Das ist die
 * sichere Richtung: wer die Einrichtung vergisst, hat keine Freigabe -
 * nicht eine, die jeder bedienen kann. Auf einem Server im Netz waere die
 * andere Wahl fatal.
 */
export function schluesselOk(req: http.IncomingMessage, adminKey: string): boolean {
  if (!adminKey) return false;

  const url = new URL(req.url ?? '/', 'http://localhost');
  const eingabe = String(req.headers['x-mc-admin'] ?? url.searchParams.get('key') ?? '');
  if (eingabe.length === 0) return false;

  const a = Buffer.from(eingabe);
  const b = Buffer.from(adminKey);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* =========================================================================
   WER DARF WAS

   Frueher hing alles an einem Schluessel in der Adresse (?key=...). Das
   war eine Notloesung: er steht in der Browser-History, wandert beim
   Weitergeben unkontrolliert weiter, und einzeln entziehen kann man ihn
   niemandem.

   Jetzt entscheidet die ROLLE des angemeldeten Kontos:

     mod     Runden freigeben und ablehnen
     admin   zusaetzlich Konten, Zugaenge, Nachtraege

   Der Schluessel bleibt als Notausgang - wenn Steam streikt oder sich
   jemand aussperrt, kommt man weiter herein. Er gilt dann als Admin.
   ========================================================================= */

export type Zugangsstufe = 'keine' | 'mod' | 'admin';

export function zugangVon(req: http.IncomingMessage, o: FreigabeApiOptionen): Zugangsstufe {
  // Notausgang zuerst - er soll auch dann gehen, wenn die Konten kaputt sind.
  if (schluesselOk(req, o.adminKey)) return 'admin';

  if (!o.konten) return 'keine';
  const code = cookieLesen(req, SITZUNG_COOKIE);
  if (!code) return 'keine';

  const konto = o.konten.ausSitzung(code);
  if (!konto) return 'keine';

  const rolle = o.konten.rolleVon(konto);
  return rolle === 'zuschauer' ? 'keine' : rolle;
}

/** Was die Freigabeseite ueber eine Runde erfaehrt - ohne Bilddaten. */
/** Eine Runde, mit der verglichen wurde - zum Danebenlegen. */
function alsVergleich(r: OffeneRunde, key: string) {
  const eigene = r.zeilen.find((z) => nameKey(z.rohName) === key) ?? null;
  return {
    id: r.id,
    absender: r.absender,
    eingegangen: r.eingegangen,
    status: r.status,
    punkte: eigene?.punkte?.punkte ?? null,
    /* Ohne Bild bleibt nur die Zahl - nach 24 Stunden ist es bei
       gewoehnlichen Runden weg, bei geflaggten erst nach 30 Tagen. */
    bildDa: r.bildGeloescht !== true
  };
}

function alsAnsicht(
  r: OffeneRunde,
  aehnlich: number,
  vorgeschichte: string | null = null,
  verlauf: readonly Verlaufseintrag[] = [],
  vergleiche: ReturnType<typeof alsVergleich>[] = []
) {
  return {
    id: r.id,
    eingegangen: r.eingegangen,
    absender: r.absender,
    status: r.status,
    zeilen: r.zeilen.map((z) => ({
      rohName: z.rohName,
      rohPunkte: z.rohPunkte,
      punkte: z.punkte ? z.punkte.punkte : null,
      unsicher: z.punkte ? z.punkte.unsicher : true
    })),
    bildAuffaellig: r.bildAuffaellig ?? [],
    bildGeloescht: r.bildGeloescht === true,
    inhaltsgleich: aehnlich,
    /* Warum diese Runde geflaggt wurde - und was sonst noch ueber diese
       Person bekannt ist. Beides gehoert nebeneinander: eine Wiederholung
       wiegt schwerer, wenn schon einmal etwas abgelehnt wurde. */
    verdacht: r.verdacht ?? [],
    vorgeschichte,
    /* Was diese Person zuletzt eingereicht hat. Beim Entscheiden ist das
       die Frage, die man sonst von Hand nachschlaegt: sind 11 714 fuer
       den plausibel, oder lag der bisher immer bei 400? */
    verlauf,
    /* Womit verglichen wurde: dieselben Zeilen oder dieselbe Punktzahl.
       Erst mit dem alten Bild daneben laesst sich entscheiden. */
    vergleiche,
    bearbeitetVon: r.bearbeitetVon,
    bearbeitetAm: r.bearbeitetAm,
    grund: r.grund
  };
}

function leseKoerper(req: http.IncomingMessage, max = 64 * 1024): Promise<string> {
  return new Promise((fertig, fehler) => {
    let roh = '';
    req.on('data', (s: Buffer) => {
      roh += s.toString();
      if (roh.length > max) {
        fehler(new Error('Anfrage zu gross'));
        req.destroy();
      }
    });
    req.on('end', () => fertig(roh));
    req.on('error', fehler);
  });
}

/**
 * Bearbeitet eine Freigabe-Anfrage.
 *
 * Gibt false zurueck, wenn der Pfad nicht hierher gehoert - dann macht
 * der Aufrufer weiter.
 */
export async function bearbeiteFreigabe(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  o: FreigabeApiOptionen
): Promise<boolean> {
  const pfad = (req.url ?? '').split('?')[0]?.replace(/\/+$/, '') || '/';

  const meine = [
    '/api/offene', '/api/entscheiden', '/api/bild', '/api/galerie',
    '/api/uebersicht', '/api/tokens', '/api/token-neu', '/api/token-sperren',
    '/api/konten', '/api/konto-admin'
  ];
  if (!meine.includes(pfad)) return false;

  /*
     NUR-ADMIN-PFADE: alles, was Konten und Zugaenge betrifft. Ein Mod
     soll Runden entscheiden koennen, aber niemandem den Zugang nehmen
     oder Rollen vergeben.
  */
  const nurAdmin = [
    '/api/tokens', '/api/token-neu', '/api/token-sperren',
    '/api/konten', '/api/konto-admin'
  ];

  const stufe = zugangVon(req, o);

  if (stufe === 'keine') {
    sendeJson(res, 401, {
      ok: false,
      fehler: 'Nicht angemeldet oder keine Berechtigung.',
      anmelden: '/anmelden'
    });
    return true;
  }
  if (stufe === 'mod' && nurAdmin.includes(pfad)) {
    sendeJson(res, 403, {
      ok: false,
      fehler: 'Dafuer brauchst du Admin-Rechte. Melde dich bei einem Admin.'
    });
    return true;
  }

  /* -------------------------------------------------------- Uebersicht */
  if (pfad === '/api/uebersicht') {
    /*
       Der wichtigste Teil des Dashboards: laeuft alles, was laufen muss?

       Hier stand frueher die Frage "ist der Turnier-Server erreichbar?",
       samt Spiegelalter und Nachtragszaehler - die haeufigste Ursache
       fuer "es tut nichts". Seit die Wertung im eigenen Haus liegt, kann
       diese Frage nicht mehr mit Nein beantwortet werden, und die ganze
       Rubrik faellt weg.
    */
    const stand = o.holeStand();
    const alle = o.freigabe.alle();

    sendeJson(res, 200, {
      ok: true,
      wertung: {
        /* Wer zugeordnet werden kann: angemeldete Konten mit
           Ingame-Namen. Steht ein Name nicht dabei, wird seine Zeile zur
           Rueckfrage - deshalb ist die Zahl hier interessant. */
        spieler: stand.spieler.length,
        eintraege: stand.eintraege,
        fenster: stand.fenster,
        voll: stand.voll,
        gewertet: stand.gewertet.length,
        anwaerter: stand.anwaerter.length,
        /* Was tatsaechlich in der Rangliste steht - die Gegenprobe zu
           "freigegeben". */
        letzte: stand.letzte
      },
      /* Damit das Dashboard weiss, was es anzeigen darf - ein Mod sieht
         die Reiter fuer Konten und Zugaenge gar nicht erst. */
      stufe,
      leser: leserBeschreibung(),
      freigabe: {
        offen: alle.filter((r) => r.status === 'offen').length,
        freigegeben: alle.filter((r) => r.status === 'freigegeben').length,
        abgelehnt: alle.filter((r) => r.status === 'abgelehnt').length
      },
      tokens: o.tokens ? o.tokens.alle().length : 0
    });
    return true;
  }

  /* ------------------------------------------------------------ Konten */
  if (pfad === '/api/konten') {
    if (!o.konten) {
      sendeJson(res, 200, { ok: true, konten: [] });
      return true;
    }
    const jetzt = Date.now();
    sendeJson(res, 200, {
      ok: true,
      konten: o.konten.alle().map((k) => {
        const t = k.token
          ? o.tokens?.alle().find((x) => x.token === k.token) ?? null
          : null;
        return {
          id: k.id,
          benutzername: k.benutzername,
          ingameName: k.ingameName,
          steamId: k.steamId,
          hatToken: t !== null && t.gesperrt !== true,
          brauchtFreigabe: t ? brauchtFreigabe(t) : true,
          gesperrt: t?.gesperrt === true,
          angelegt: k.angelegt,
          rolle: o.konten!.rolleVon(k),
          geloescht: k.geloescht ?? null,
          letzteAnmeldung: k.letzteAnmeldung ?? null,
          /* Wie lange der Nutzer selbst noch warten muesste. Du bist
             daran nicht gebunden - die Anzeige sagt nur, ob es fuer ihn
             gerade gesperrt ist. */
          nutzerSperreTage: Math.max(0,
            Math.ceil((o.konten!.sperreBis(k) - jetzt) / (24 * 60 * 60 * 1000)))
        };
      })
    });
    return true;
  }

  if (pfad === '/api/konto-admin') {
    if (!o.konten) {
      sendeJson(res, 503, { ok: false, fehler: 'Kontenverwaltung nicht verfuegbar' });
      return true;
    }
    if (req.method !== 'POST') {
      sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
      return true;
    }

    let d: { id?: string; ingame?: string; ohneFreigabe?: boolean; aktion?: string; rolle?: string };
    try {
      d = JSON.parse(await leseKoerper(req)) as typeof d;
    } catch {
      sendeJson(res, 400, { ok: false, fehler: 'Ungueltiges JSON' });
      return true;
    }

    const konto = o.konten.findeNachId(String(d.id ?? ''));
    if (!konto) {
      sendeJson(res, 404, { ok: false, fehler: 'Konto nicht gefunden' });
      return true;
    }

    /* Loeschen ist WEICH: das Konto verschwindet aus der Liste und sein
       Zugang gilt nicht mehr, aber die Historie der Einreichungen bleibt
       nachvollziehbar und der Ingame-Name belegt. Meldet sich die Person
       erneut ueber Steam an, ist sie wieder da - wer draussen bleiben
       soll, dessen Token wird gesperrt. */
    /* Rollen vergeben. Nur Admins kommen ueberhaupt hierher - der
       nurAdmin-Filter oben hat Mods schon abgewiesen. */
    if (d.aktion === 'rolle') {
      const gewuenscht = String(d.rolle ?? '');
      if (gewuenscht !== 'admin' && gewuenscht !== 'mod' && gewuenscht !== 'zuschauer') {
        sendeJson(res, 400, { ok: false, fehler: 'Unbekannte Rolle' });
        return true;
      }
      const e = o.konten.setzeRolle(konto.id, gewuenscht);
      sendeJson(res, e.ok ? 200 : 400,
        e.ok ? { ok: true } : { ok: false, fehler: e.fehler });
      return true;
    }

    if (d.aktion === 'loeschen' || d.aktion === 'wiederherstellen') {
      const e = d.aktion === 'loeschen'
        ? o.konten.loeschen(konto.id)
        : o.konten.wiederherstellen(konto.id);

      sendeJson(res, e.ok ? 200 : 400,
        e.ok ? { ok: true } : { ok: false, fehler: e.fehler });
      return true;
    }

    if (typeof d.ingame === 'string') {
      /* vomStreamer: umgeht die Sperrfrist und stuft NICHT auf
         "braucht Freigabe" zurueck - die Aenderung kommt ja von dir. */
      const e = o.konten.setzeIngameName(konto.id, d.ingame, true);
      if (!e.ok) {
        sendeJson(res, 400, { ok: false, fehler: e.fehler });
        return true;
      }
    }

    if (typeof d.ohneFreigabe === 'boolean' && konto.token && o.tokens) {
      o.tokens.aktualisiere(konto.token, { ohneFreigabe: d.ohneFreigabe });
    }

    sendeJson(res, 200, { ok: true });
    return true;
  }

  /* ------------------------------------------------------------ Tokens */
  if (pfad === '/api/tokens') {
    if (!o.tokens) {
      sendeJson(res, 200, { ok: true, tokens: [] });
      return true;
    }
    sendeJson(res, 200, {
      ok: true,
      tokens: o.tokens.alle().map((t) => ({
        // Nur der Anfang: die Seite landet leicht in einem Screenshot.
        kurz: t.token.slice(0, 8),
        token: t.token,
        name: t.name,
        ingameName: t.ingameName ?? null,
        ganzeLobby: t.vertraut,
        brauchtFreigabe: brauchtFreigabe(t),
        gesperrt: t.gesperrt === true,
        sperrgrund: t.sperrgrund ?? null,
        letzteNutzung: t.letzteNutzung ?? null
      }))
    });
    return true;
  }

  if (pfad === '/api/token-neu' || pfad === '/api/token-sperren') {
    if (!o.tokens) {
      sendeJson(res, 503, { ok: false, fehler: 'Tokenverwaltung nicht verfuegbar' });
      return true;
    }
    if (req.method !== 'POST') {
      sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
      return true;
    }

    let daten: {
      name?: string; ingame?: string;
      ganzeLobby?: boolean; ohneFreigabe?: boolean;
      token?: string; grund?: string;
    };
    try {
      daten = JSON.parse(await leseKoerper(req)) as typeof daten;
    } catch {
      sendeJson(res, 400, { ok: false, fehler: 'Ungueltiges JSON' });
      return true;
    }

    if (pfad === '/api/token-sperren') {
      const ok = o.tokens.sperren(String(daten.token ?? ''), String(daten.grund ?? 'ohne Angabe'));
      sendeJson(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, fehler: 'Token nicht gefunden' });
      return true;
    }

    try {
      const t = o.tokens.anlegen(
        String(daten.name ?? ''),
        daten.ganzeLobby === true,
        daten.ingame,
        daten.ohneFreigabe === true
      );
      sendeJson(res, 200, { ok: true, token: t.token, name: t.name });
    } catch (err) {
      sendeJson(res, 400, { ok: false, fehler: (err as Error).message });
    }
    return true;
  }

  /* ------------------------------------------------------------- Liste */
  if (pfad === '/api/offene') {
    const alle = o.freigabe.alle();
    const offen = alle.filter((r) => r.status === 'offen');
    const erledigt = alle
      .filter((r) => r.status !== 'offen')
      .sort((a, b) => (b.bearbeitetAm ?? 0) - (a.bearbeitetAm ?? 0))
      .slice(0, 20);

    sendeJson(res, 200, {
      ok: true,
      offen: offen.map((r) => {
        const andere = alle.filter((x) => x.id !== r.id);
        const key = (r.beansprucht ?? [])[0] ?? '';

        /* Womit verglichen wurde: inhaltsgleiche Runden und solche mit
           derselben Punktzahl derselben Person. Beides wird HIER frisch
           berechnet, nicht beim Hochladen - sonst stuende auf einer
           Karte von gestern noch die Lage von gestern. */
        const gleich = o.freigabe.aehnliche(r);
        const gleicheZahl = pruefeVerdacht(andere, r).treffer;

        const vergleiche = [...gleich, ...gleicheZahl]
          .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
          .slice(0, 6)
          .map((x) => alsVergleich(x, key));

        return alsAnsicht(
          r,
          gleich.length,
          fruehereAblehnungen(andere, r.beansprucht),
          verlaufVon(andere, r.beansprucht),
          vergleiche
        );
      }),
      erledigt: erledigt.map((r) => alsAnsicht(r, 0))
    });
    return true;
  }

  /* -------------------------------------------------------------- Bild */
  /* ---------------------------------------------------------- Galerie

     Alle Runden als Kacheln, nicht nur die offenen.

     Der Nutzen ist das NEBENEINANDERLEGEN: kommt eine Punktzahl komisch
     vor, filtert man auf den Spieler und sieht seine letzten Ausschnitte
     als Reihe. Faelschungen fallen im Vergleich auf, nicht im
     Einzelbild - eine einzelne Zahl sieht immer plausibel aus.

     Geliefert werden nur die Angaben fuer die Kachel. Das Bild holt die
     Seite einzeln ueber /api/bild?art=ausschnitt, sonst haette eine
     Antwort dreissig eingebettete Bilder.
  */
  if (pfad === '/api/galerie') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const spieler = (url.searchParams.get('spieler') ?? '').trim().toLowerCase();
    const status = url.searchParams.get('status') ?? '';
    /*
       NaN muss vor den Klammern abgefangen werden, nicht danach:
       Math.max(1, NaN) ist NaN, und slice(0, NaN) liefert eine LEERE
       Liste. Aus "?grenze=quatsch" wuerde damit eine Galerie ohne ein
       einziges Bild - und es saehe aus, als sei nichts eingereicht.
    */
    const gewuenscht = Number(url.searchParams.get('grenze') ?? 60);
    const grenze = Number.isFinite(gewuenscht)
      ? Math.min(300, Math.max(1, Math.floor(gewuenscht)))
      : 60;

    let alle = [...o.freigabe.alle()];

    if (status === 'offen' || status === 'freigegeben' || status === 'abgelehnt') {
      alle = alle.filter((r) => r.status === status);
    } else if (status === 'geflaggt') {
      alle = alle.filter((r) => (r.verdacht?.length ?? 0) > 0);
    }

    if (spieler) {
      /* Ueber die BEANSPRUCHTEN Namen, nicht ueber den Absender: wer
         sich einen neuen Zugang holt oder seinen Anzeigenamen aendert,
         soll trotzdem unter einem Filter auftauchen. */
      alle = alle.filter((r) =>
        (r.beansprucht ?? []).some((n) => n.includes(spieler)) ||
        r.absender.toLowerCase().includes(spieler));
    }

    /* Nach der zuletzt geschehenen Sache, wie in der eigenen
       Rundenliste - sonst passt die Reihenfolge nicht zu den
       angezeigten Zeiten. */
    alle.sort((a, b) => (b.bearbeitetAm ?? b.eingegangen) - (a.bearbeitetAm ?? a.eingegangen));

    /* Wer taucht ueberhaupt auf - fuer die Auswahlliste im Filter.
       Aus ALLEN Runden, nicht aus den gefilterten: sonst schrumpfte die
       Auswahl, sobald man sie benutzt, und man kaeme nicht mehr zurueck. */
    const namen = [...new Set(
      o.freigabe.alle().flatMap((r) => [...(r.beansprucht ?? [])])
    )].sort();

    sendeJson(res, 200, {
      ok: true,
      gesamt: alle.length,
      namen,
      runden: alle.slice(0, grenze).map((r) => ({
        id: r.id,
        eingegangen: r.eingegangen,
        bearbeitetAm: r.bearbeitetAm ?? null,
        absender: r.absender,
        status: r.status,
        geflaggt: (r.verdacht?.length ?? 0) > 0,
        verdacht: r.verdacht ?? [],
        bildAuffaellig: r.bildAuffaellig ?? [],
        beansprucht: r.beansprucht ?? [],
        grund: r.grund ?? null,
        zeilen: r.zeilen.length,
        /* Die beanspruchte Punktzahl - das ist die Zahl, um die es geht.
           Bei einer eigenen Aufnahme steht dort die erste Zeile. */
        punkte: (() => {
          const key = (r.beansprucht ?? [])[0];
          const zeile = key
            ? r.zeilen.find((z) => nameKey(z.rohName) === key)
            : r.zeilen[0];
          return zeile?.punkte?.punkte ?? null;
        })(),
        /* Womit die Kachel gefuellt wird: Ausschnitt bevorzugt, Original
           als Rueckfall, gar nichts wenn beides weg ist. */
        bildDa: (r.ausschnittPfad !== undefined && existsSync(r.ausschnittPfad)) ||
                (r.bildGeloescht !== true && existsSync(r.bildPfad)),
        originalDa: r.bildGeloescht !== true && existsSync(r.bildPfad)
      }))
    });
    return true;
  }

  if (pfad === '/api/bild') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const runde = o.freigabe.finde(String(url.searchParams.get('id') ?? ''));

    if (!runde) {
      sendeJson(res, 404, { ok: false, fehler: 'Runde nicht gefunden' });
      return true;
    }
    /*
       Erst das Original, dann der Ausschnitt.

       Das Original zeigt den ganzen Bildschirm und ist der bessere
       Beleg, solange es lebt - nach ein paar Tagen wird es geloescht,
       weil es rund 2 MB wiegt. Der Ausschnitt bleibt dauerhaft: ~55 KB,
       volle Aufloesung, und darauf steht alles, was zaehlt.

       Ausdruecklich mit ?art=ausschnitt erzwingbar. Die Galerie zeigt
       Kacheln und braucht nie das Original - 2 MB je Kachel waeren bei
       dreissig Kacheln 60 MB fuer eine Seite.
    */
    const url2 = new URL(req.url ?? '/', 'http://localhost');
    const nurAusschnitt = url2.searchParams.get('art') === 'ausschnitt';

    const original = !runde.bildGeloescht && existsSync(runde.bildPfad) ? runde.bildPfad : null;
    const klein = runde.ausschnittPfad && existsSync(runde.ausschnittPfad)
      ? runde.ausschnittPfad : null;

    const datei = nurAusschnitt ? (klein ?? original) : (original ?? klein);

    if (!datei) {
      sendeJson(res, 410, { ok: false, fehler: 'Bild wurde nach Ablauf der Frist geloescht' });
      return true;
    }

    const typ = path.extname(datei).toLowerCase() === '.jpg'
      ? 'image/jpeg' : 'image/png';
    const daten = readFileSync(datei);
    res.writeHead(200, {
      'Content-Type': typ,
      'Cache-Control': 'no-store',
      /* Damit die Anzeige sagen kann, was sie da zeigt - "Original nach
         3 Tagen geloescht, das ist der Ausschnitt" ist eine Auskunft,
         keine Entschuldigung. */
      'X-MC-Bildart': datei === runde.bildPfad ? 'original' : 'ausschnitt'
    });
    res.end(daten);
    return true;
  }

  /* -------------------------------------------------------- entscheiden */
  if (req.method !== 'POST') {
    sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
    return true;
  }

  let daten: { id?: string; status?: string; grund?: string; von?: string };
  try {
    daten = JSON.parse(await leseKoerper(req)) as typeof daten;
  } catch {
    sendeJson(res, 400, { ok: false, fehler: 'Ungueltiges JSON' });
    return true;
  }

  if (daten.status !== 'freigegeben' && daten.status !== 'abgelehnt') {
    sendeJson(res, 400, { ok: false, fehler: 'status muss freigegeben oder abgelehnt sein' });
    return true;
  }

  const runde = o.freigabe.finde(String(daten.id ?? ''));
  if (!runde) {
    sendeJson(res, 404, { ok: false, fehler: 'Runde nicht gefunden' });
    return true;
  }

  /*
     Bei einer Ablehnung ist nichts weiter zu tun - der Status genuegt.
     Bei einer Freigabe muss die Runde in die Punkteliste, und zwar BEVOR
     der Status gesetzt wird: schlaegt das Eintragen fehl, soll die Runde
     offen bleiben statt als erledigt zu gelten, ohne dass etwas ankam.
  */
  if (daten.status === 'abgelehnt') {
    const e = o.freigabe.entscheiden(runde.id, 'abgelehnt',
      String(daten.von ?? 'Admin'), daten.grund);
    sendeJson(res, e.ok ? 200 : 409, e.ok ? { ok: true } : { ok: false, fehler: e.fehler });
    return true;
  }

  if (runde.status !== 'offen') {
    sendeJson(res, 409, {
      ok: false,
      fehler: 'Runde ist schon ' + runde.status + ' (durch ' + (runde.bearbeitetVon ?? '?') + ')'
    });
    return true;
  }

  const stand = o.holeStand();

  /*
     NUR die beanspruchten Zeilen werten - nicht alles, was im Bild
     stand.

     Der Screenshot zeigt die ganze Lobby, gespeichert ist er auch
     komplett (als Beleg). Gewertet wird aber nur, was der Absender
     beansprucht hat: bei einem Zuschauer seine eine Zeile.

     Ohne diesen Filter bekaeme jeder Mitspieler die Punkte erneut,
     sobald ein zweiter Zuschauer derselben Lobby freigegeben wird -
     genau die Doppelwertung, die verhindert werden soll. Beim Hochladen
     wird schon gefiltert; hier muss dasselbe passieren, sonst nuetzt es
     nichts.
  */
  const beansprucht = runde.beansprucht;
  const zuWerten = beansprucht === undefined
    ? [...runde.zeilen]                       // aeltere Eintraege ohne Angabe
    : runde.zeilen.filter((z) => beansprucht.includes(nameKey(z.rohName)));

  const bericht = teileAuf(bewerteRunde(zuWerten, stand.spieler));

  /*
     Erst schreiben, dann als entschieden vermerken.

     Frueher konnte das Schreiben scheitern (der Turnier-Server war weg),
     und dieser Block war entsprechend umfangreich: Teilerfolge zaehlen,
     502 melden, die Runde offen lassen, im Nachtrag merken. Eine Datei
     auf derselben Platte kennt diesen Zustand nicht - sie schreibt oder
     der Prozess ist tot.

     Die Reihenfolge bleibt trotzdem: kaeme das Entscheiden zuerst und
     das Schreiben danach schief, staende die Runde als freigegeben da,
     ohne dass Punkte angekommen waeren - und niemand wuerde es je
     bemerken.
  */
  let geschrieben = 0;
  for (const e of bericht.einzutragen) {
    // Die Konto-Kennung, nicht der gelesene Name - sonst waere die
    // Zuordnung, die gerade stattgefunden hat, wieder aufgeworfen.
    o.eintragen(personVon(e)!.id, e.zeile.punkte!.punkte);
    geschrieben++;
  }

  const e = o.freigabe.entscheiden(runde.id, 'freigegeben', String(daten.von ?? 'Admin'));
  sendeJson(res, 200, {
    ok: e.ok,
    geschrieben,
    offen: bericht.rueckfragen.length,
    ...(e.ok ? {} : { fehler: e.fehler })
  });
  return true;
}
