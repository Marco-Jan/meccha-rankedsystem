/* =========================================================================
   FREIGABE-API - die geschuetzte Seite des Servers.

   Getrennt von server.ts, weil hier ein anderer Zugang gilt: der
   Upload-Endpunkt steht Zuschauern offen (mit Token), diese Endpunkte
   nur dir und deinen Mods (mit Admin-Schluessel).

   Endpunkte:
     GET  /api/offene       was wartet auf Entscheidung
     POST /api/entscheiden  freigeben oder ablehnen
     GET  /api/bild         das Bild zu einer Runde

   Beim Freigeben wandert die Runde in die bestehende Punkteliste im
   Turnier-Server - erst dann zaehlt sie. Das ist der Punkt, an dem aus
   einer Einreichung ein Ergebnis wird.
   ========================================================================= */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import { Freigabeliste, type OffeneRunde } from './freigabe.js';
import { Tokenliste, brauchtFreigabe } from './tokens.js';
import type { Kontenliste } from './konten.js';
import type { Karteispiegel } from './spiegel.js';
import type { Nachtragliste, Eintragsergebnis } from './nachtrag.js';
import { leserBeschreibung } from './leser-wahl.js';
import { bewerteRunde, teileAuf, personVon } from './runde.js';
import { nameKey } from './namen.js';
import {
  fruehereAblehnungen, verlaufVon, pruefeVerdacht, type Verlaufseintrag
} from './verdacht.js';
import type { TurnierZustand, Spiel } from './turnier-client.js';

export interface FreigabeApiOptionen {
  readonly freigabe: Freigabeliste;
  /** Ohne Schluessel sind die Endpunkte gesperrt - nicht offen. */
  readonly adminKey: string;
  readonly holeZustand: () => Promise<{ zustand: TurnierZustand; spiel: Spiel }>;
  readonly eintragen: (
    gameId: string,
    e: { name: string; punkte: number }
  ) => Promise<void | Eintragsergebnis>;
  /** Fuer die Tokenverwaltung im Dashboard. */
  readonly tokens?: Tokenliste | undefined;
  /** Fuer die Kontenverwaltung im Dashboard. */
  readonly konten?: Kontenliste | undefined;
  /**
   * Kartei-Spiegel. Nur zum ANZEIGEN - das Dashboard soll sagen koennen,
   * ob turnier gerade da ist und wie alt der gespiegelte Stand ist.
   * Ohne ihn meldet der Status wie frueher nur "erreichbar: ja/nein".
   */
  readonly spiegel?: Karteispiegel | undefined;
  /** Warteschlange der Eintraege, die auf turnier warten. */
  readonly nachtrag?: Nachtragliste | undefined;
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
export function adminOk(req: http.IncomingMessage, adminKey: string): boolean {
  if (!adminKey) return false;

  const url = new URL(req.url ?? '/', 'http://localhost');
  const eingabe = String(req.headers['x-mc-admin'] ?? url.searchParams.get('key') ?? '');
  if (eingabe.length === 0) return false;

  const a = Buffer.from(eingabe);
  const b = Buffer.from(adminKey);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
    '/api/offene', '/api/entscheiden', '/api/bild',
    '/api/uebersicht', '/api/tokens', '/api/token-neu', '/api/token-sperren',
    '/api/konten', '/api/konto-admin',
    '/api/nachtrag', '/api/nachtrag-jetzt', '/api/nachtrag-loeschen'
  ];
  if (!meine.includes(pfad)) return false;

  if (!adminOk(req, o.adminKey)) {
    sendeJson(res, 401, {
      ok: false,
      fehler: o.adminKey
        ? 'Falscher Admin-Schluessel'
        : 'Kein Admin-Schluessel eingerichtet - MC_ADMIN_KEY setzen'
    });
    return true;
  }

  /* -------------------------------------------------------- Uebersicht */
  if (pfad === '/api/uebersicht') {
    /*
       Der wichtigste Teil des Dashboards: laeuft alles, was laufen muss?
       Beim Testen war die haeufigste Ursache fuer "es tut nichts", dass
       der Turnier-Server nicht erreichbar war - das sieht man hier auf
       einen Blick statt es aus Logzeilen zu raten.
    */
    let turnierOk = false;
    let spielName = '';
    let eintraege = 0;
    let kartei = 0;
    let fehler = '';
    let letzte: ReadonlyArray<{ id: string; name: string; punkte: number; zeit: number }> = [];

    try {
      const { zustand, spiel } = await o.holeZustand();
      turnierOk = true;
      spielName = spiel.name;
      eintraege = spiel.eintraege;
      kartei = zustand.kartei.length;
      letzte = spiel.letzte ?? [];
    } catch (err) {
      fehler = (err as Error).message;
    }

    /*
       Mit Spiegel antwortet holeZustand() auch dann, wenn turnier weg ist
       - es kommt eben der gespiegelte Stand. Ohne die folgende Zeile
       stuende im Dashboard "erreichbar", obwohl seit Stunden niemand
       drangeht. Die Lage weiss der Spiegel, nicht der Aufruf.
    */
    const lage = o.spiegel?.lage();
    if (lage) {
      turnierOk = lage.erreichbar;
      if (!lage.erreichbar) fehler = lage.letzterFehler ?? '';
    }

    const alle = o.freigabe.alle();
    sendeJson(res, 200, {
      ok: true,
      turnier: {
        erreichbar: turnierOk, spiel: spielName, eintraege, kartei, fehler,
        /* Woher die Kartei kommt, mit der gerade zugeordnet wird. Steht
           hier drin, damit im Dashboard nicht der Eindruck entsteht, die
           Zuordnung waere auf dem neuesten Stand. */
        ausSpiegel: lage?.ausSpiegel ?? false,
        gespiegeltAm: lage?.gespiegeltAm ?? null,
        /* Was tatsaechlich in der Punkteliste steht - die Gegenprobe zu
           "freigegeben". Kommt aus dem Turnier-Server; ist der gerade weg,
           ist es der gespiegelte Stand und damit aelter als die Anzeige
           sonst. Deshalb steht ausSpiegel gleich daneben. */
        letzte
      },
      nachtrag: {
        wartend: o.nachtrag?.anzahl() ?? 0,
        letzterFehler: o.nachtrag?.alle()[0]?.letzterFehler ?? null
      },
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

  /* ---------------------------------------------------------- Nachtrag

     Was noch auf turnier wartet. Steht im Dashboard, damit nicht der
     Eindruck entsteht, alles sei eingetragen - und damit du im Zweifel
     nachsehen kannst, welche Punktzahl noch fehlt.
  */
  if (pfad === '/api/nachtrag') {
    sendeJson(res, 200, {
      ok: true,
      wartend: (o.nachtrag?.alle() ?? []).map((n) => ({
        id: n.id,
        name: n.name,
        punkte: n.punkte,
        absender: n.absender ?? null,
        erstellt: n.erstellt,
        versuche: n.versuche,
        letzterFehler: n.letzterFehler
      }))
    });
    return true;
  }

  /* Von Hand anstossen, statt auf den naechsten Takt zu warten. */
  if (pfad === '/api/nachtrag-jetzt') {
    if (req.method !== 'POST') {
      sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
      return true;
    }
    if (!o.nachtrag) {
      sendeJson(res, 200, { ok: true, erledigt: 0, offen: 0, fehler: null });
      return true;
    }
    const a = await o.nachtrag.arbeiteAb();
    sendeJson(res, 200, { ok: true, ...a });
    return true;
  }

  /*
     Einen Nachtrag wegwerfen. Gebraucht fuer den einen Fall, den die
     Warteschlange nicht selbst aufloesen kann: der Eintrag ist in
     Wahrheit schon drin (Antwort verlorengegangen), und ein Nachtragen
     wuerde ihn doppeln. Siehe Kopf von nachtrag.ts.
  */
  if (pfad === '/api/nachtrag-loeschen') {
    if (req.method !== 'POST') {
      sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
      return true;
    }
    let daten: { id?: string } = {};
    try {
      daten = JSON.parse(await leseKoerper(req)) as typeof daten;
    } catch {
      sendeJson(res, 400, { ok: false, fehler: 'Ungueltige Daten' });
      return true;
    }
    const weg = o.nachtrag?.loesche(String(daten.id ?? '')) ?? false;
    sendeJson(res, weg ? 200 : 404,
      weg ? { ok: true } : { ok: false, fehler: 'Nachtrag nicht gefunden' });
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

    let d: { id?: string; ingame?: string; ohneFreigabe?: boolean; aktion?: string };
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
  if (pfad === '/api/bild') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const runde = o.freigabe.finde(String(url.searchParams.get('id') ?? ''));

    if (!runde) {
      sendeJson(res, 404, { ok: false, fehler: 'Runde nicht gefunden' });
      return true;
    }
    if (runde.bildGeloescht || !existsSync(runde.bildPfad)) {
      sendeJson(res, 410, { ok: false, fehler: 'Bild wurde nach Ablauf der Frist geloescht' });
      return true;
    }

    const typ = path.extname(runde.bildPfad).toLowerCase() === '.jpg'
      ? 'image/jpeg' : 'image/png';
    const daten = readFileSync(runde.bildPfad);
    res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': 'no-store' });
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

  let zustand: TurnierZustand;
  let spiel: Spiel;
  try {
    ({ zustand, spiel } = await o.holeZustand());
  } catch (err) {
    sendeJson(res, 502, {
      ok: false,
      fehler: 'Turnier-Server nicht erreichbar: ' + (err as Error).message
    });
    return true;
  }

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

  const bericht = teileAuf(bewerteRunde(zuWerten, zustand.kartei));

  let geschrieben = 0;
  let gemerkt = 0;
  try {
    for (const e of bericht.einzutragen) {
      const wie = await o.eintragen(spiel.id, {
        name: personVon(e)!.name,
        punkte: e.zeile.punkte!.punkte
      });
      /* Mit Nachtragsliste wirft das Eintragen nicht mehr, wenn turnier
         weg ist - es meldet 'gemerkt'. Die Runde gilt trotzdem als
         freigegeben: entschieden hast DU, das Schreiben ist nur
         verzoegert. Sonst muesstest du dieselbe Runde spaeter nochmal
         freigeben, und die schon geschriebenen Zeilen waeren doppelt. */
      if (wie === 'gemerkt') gemerkt++; else geschrieben++;
    }
  } catch (err) {
    // Teilweise eingetragen: die Runde bleibt offen, damit du siehst,
    // dass etwas schiefging. Erneutes Freigeben wuerde das Bereits-
    // Eingetragene allerdings doppeln - deshalb steht es in der Meldung.
    sendeJson(res, 502, {
      ok: false,
      fehler: 'Eintragen fehlgeschlagen nach ' + geschrieben + ' von ' +
        bericht.einzutragen.length + ' Zeilen: ' + (err as Error).message
    });
    return true;
  }

  const e = o.freigabe.entscheiden(runde.id, 'freigegeben', String(daten.von ?? 'Admin'));
  sendeJson(res, 200, {
    ok: e.ok,
    geschrieben,
    gemerkt,
    offen: bericht.rueckfragen.length,
    ...(e.ok ? {} : { fehler: e.fehler })
  });
  return true;
}
