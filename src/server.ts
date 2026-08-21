/* =========================================================================
   SERVER - nimmt hochgeladene Runden entgegen.

   Bewusst ohne Framework, mit Node-Bordmitteln, wie turnier/server.js.

   Zwei Wege, je nach Token:

     vertraut    deine eigenen Rechner -> direkt in die Punkteliste
     Zuschauer   -> Freigabeliste, wartet auf deinen Klick

   Der zweite Weg ist der Grund, warum es diesen Server ueberhaupt gibt.
   Der Auftrag sagt: "Zuschauer duerfen niemals eine Punktzahl selbst
   eingeben." Sobald jemand sein eigenes Bild schickt, bestimmt sein Bild
   die Punkte - und ein bearbeiteter Screenshot ist von einem echten
   nicht zu unterscheiden. Die Freigabe haelt die Regel trotzdem ein.

   Alle Konsolenausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import http from 'node:http';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { Freigabeliste, rundenKennung } from './freigabe.js';
import { Tokenliste, brauchtFreigabe } from './tokens.js';
import { leseListe, ModellAntwortUnbrauchbar, type ModellFrage } from './leser.js';
import { waehleLeser } from './leser-wahl.js';
import { bewerteRunde, teileAuf, personVon } from './runde.js';
import { ordneZu, istSicher, nameKey } from './namen.js';
import { pruefeBild, type Bildbefund } from './bildpruefung.js';
import { pruefeVerdacht } from './verdacht.js';
import { verteilung } from './config.js';
import { bearbeiteFreigabe } from './freigabe-api.js';
import { bearbeiteKonto } from './konto-api.js';
import { kontoSeite } from './konto-seite.js';
import { regelnSeite } from './regeln-seite.js';
import { downloadSeite, clientstand } from './download-seite.js';
import type { Kontenliste } from './konten.js';
import type { Wertungsstand } from './wertung.js';
import type { Listen } from './listen.js';
import { schneideAus, ausschnittPfadZu } from './ausschnitt.js';
import type { RohZeile } from './parse.js';

/** Groesste erlaubte Bildgroesse. Ein 1920x1080-PNG liegt bei rund 2 MB. */
export const MAX_BILD = 8 * 1024 * 1024;

/**
 * Mindestzahl Verstecker im Scoreboard, damit eine Zuschauer-Runde zaehlt.
 *
 * Im Scoreboard von MECCHA CHAMELEON stehen nur die Verstecker, keine
 * Hunter - jede gelesene Zeile ist also ein Verstecker. In einer winzigen
 * Runde ist der eigene Platz beliebig steuerbar; die Latte liegt bei 6,
 * damit man nicht allein eine Lobby aufmacht und farmt. Ueber
 * MC_MIN_SPIELER einstellbar, falls sich 6 als zu hoch oder niedrig zeigt.
 *
 * Nur eine ungueltige oder fehlende Angabe faellt auf 6 zurueck; eine
 * bewusste 0 schaltet die Pruefung ab (fuer Tests und Sonderfaelle).
 */
export const MIN_SPIELER = (() => {
  const roh = process.env.MC_MIN_SPIELER;
  if (roh === undefined || roh.trim() === '') return 6;
  const n = Number(roh);
  return Number.isInteger(n) && n >= 0 ? n : 6;
})();

const ERLAUBTE_TYPEN = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg']
]);

export interface ServerOptionen {
  readonly freigabe: Freigabeliste;
  readonly tokens: Tokenliste;
  readonly bilderDir: string;
  /**
   * Der Stand der Wertung, je Anfrage frisch geholt - damit ein Konto,
   * das sich gerade angemeldet hat, sofort zugeordnet werden kann.
   * In Tests einsetzbar.
   */
  readonly holeStand: () => Wertungsstand;
  /**
   * Womit gelesen wird. Standard ist die Wahl aus leser-wahl.ts.
   *
   * Herausgezogen, damit die Tests ohne Python und ohne Ollama laufen -
   * sie pruefen die Regeln des Servers, nicht die Erkennungsleistung.
   */
  readonly leser?: ModellFrage;
  /**
   * Wie geprueft wird, ob ein Bild nach einer frischen Aufnahme aussieht.
   *
   * Herausgezogen wie der Leser, und aus demselben Grund: die Tests
   * arbeiten mit erfundenen Bildern, die keine echte PNG-Struktur haben.
   * Ohne diesen Haken wuerde dort jede Runde als "nachbearbeitet"
   * angehalten, und die Regeln des Servers liessen sich nicht mehr
   * einzeln pruefen.
   */
  readonly bildpruefer?: (bild: Buffer, typ: string) => Bildbefund;
  /**
   * Wie eine Punktzahl in die Rangliste kommt.
   *
   * Erwartet die KONTO-KENNUNG, nicht den gelesenen Namen: die Zuordnung
   * hat namen.ts vorher gemacht, und hier noch einmal nach einem Namen
   * zu suchen wuerde genau die Pruefung umgehen, die davor sitzt.
   *
   * Herausgezogen, damit Tests beobachten koennen, was eingetragen
   * wuerde, ohne eine echte Rangliste anzulegen.
   */
  readonly eintragen: (kontoId: string, punkte: number) => void;
  /**
   * Schluessel fuer die Freigabe-Endpunkte. LEER heisst gesperrt, nicht
   * offen - wer die Einrichtung vergisst, soll keine Freigabe haben,
   * die jeder bedienen kann.
   */
  readonly adminKey?: string;
  /** Statische Dateien der Freigabeseite. */
  readonly oeffentlichDir?: string;
  /** Selbstverwaltung der Zuschauer - Anmeldung ueber Steam. */
  readonly konten?: Kontenliste;
  /** Die Ranglisten - nur fuers Dashboard, der Server selbst liest sie
   *  ueber holeStand(). */
  readonly listen?: Listen;
  /**
   * Adresse, unter der dieser Server von aussen erreichbar ist.
   * Steam leitet dorthin zurueck. Aus MC_OEFFENTLICHE_URL, damit ein
   * Serverumzug keine Codeaenderung braucht.
   */
  readonly oeffentlicheUrl?: string;
  /**
   * Die ausgelieferte Client-Datei.
   *
   * Sie ueber den Server anzubieten macht die Kontoseite zur einzigen
   * Bezugsquelle: dort holt der Zuschauer ohnehin seinen Token. Ein Ort,
   * eine Fassung - statt fuenf Anhaenge im Discord, von denen nach einem
   * Serverumzug keiner mehr funktioniert.
   */
  readonly clientDatei?: string;

  /** Mindestzahl Verstecker im Scoreboard. Vorgabe: MIN_SPIELER (6). Als
   *  Option, damit Tests sie setzen koennen, ohne die Umgebung anzufassen. */
  readonly minSpieler?: number;
  /**
   * Wie der Ranglisten-Block ausgeschnitten wird.
   *
   * Herausgezogen wie Leser und Bildpruefer: die Tests arbeiten mit
   * erfundenen Bildern, die Pillow gar nicht oeffnen kann. Der echte
   * Weg gibt dann null zurueck - richtig, aber dann liesse sich nicht
   * pruefen, dass der Pfad ueberhaupt vermerkt wird.
   */
  readonly schneideAus?: (bildPfad: string, zielPfad: string) => string | null;
}

function sendeDatei(res: http.ServerResponse, datei: string, typ: string): void {
  try {
    const inhalt = readFileSync(datei);
    res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': 'no-store' });
    res.end(inhalt);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

function sendeJson(res: http.ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

/**
 * Liest den Rohkoerper mit harter Obergrenze.
 *
 * Die Grenze wird WAEHREND des Empfangs geprueft, nicht danach: sonst
 * koennte ein endloser Upload den Speicher fuellen, bevor irgendjemand
 * die Groesse bemerkt.
 */
function leseKoerper(req: http.IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((fertig, fehler) => {
    const teile: Buffer[] = [];
    let groesse = 0;

    req.on('data', (stueck: Buffer) => {
      groesse += stueck.length;
      if (groesse > max) {
        fehler(new Error('Bild zu gross (mehr als ' + Math.round(max / 1024 / 1024) + ' MB)'));
        req.destroy();
        return;
      }
      teile.push(stueck);
    });
    req.on('end', () => fertig(Buffer.concat(teile)));
    req.on('error', fehler);
  });
}

/*
   Frueher stand hier ein Standardweg, der den Turnier-Server anrief.
   Den gibt es nicht mehr, und einen Ersatz soll es auch nicht geben:
   die Wertung haengt an einer bestimmten Datei, und die kennt nur, wer
   den Server startet. Ein stiller Standard wuerde bedeuten, dass ein
   falsch verdrahteter Server trotzdem laeuft - und in eine Rangliste
   schreibt, die niemand ansieht.
*/
export function baueServer(o: ServerOptionen): http.Server {
  const holeStand = o.holeStand;

  return http.createServer((req, res) => {
    void bearbeite(req, res, o, holeStand).catch((err: unknown) => {
      // Ein unerwarteter Fehler darf den Server nicht mitnehmen.
      console.log('  Unerwarteter Fehler: ' + (err as Error).message);
      try {
        sendeJson(res, 500, { ok: false, fehler: 'Unerwarteter Fehler' });
      } catch {
        /* Antwort war schon raus */
      }
    });
  });
}

async function bearbeite(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  o: ServerOptionen,
  holeStand: () => Wertungsstand
): Promise<void> {
  const pfad = (req.url ?? '').split('?')[0]?.replace(/\/+$/, '') || '/';

  /* Welche Client-Fassung meldet sich hier? Einmal an dieser Stelle statt
     an jedem Endpunkt - der Client schickt den Kopf bei allen Anfragen.
     merkeClient schreibt nur, wenn sich die Nummer geaendert hat, und
     ignoriert alles, was nicht wie eine Fassung aussieht. */
  const tokenKopf = req.headers['x-mc-token'];
  if (typeof tokenKopf === 'string') {
    o.tokens.merkeClient(tokenKopf, req.headers['x-mc-client']);
  }

  // Die geschuetzten Freigabe-Endpunkte zuerst - eigener Zugang.
  const behandelt = await bearbeiteFreigabe(req, res, {
    freigabe: o.freigabe,
    adminKey: o.adminKey ?? '',
    holeStand,
    eintragen: o.eintragen,
    tokens: o.tokens,
    konten: o.konten,
    listen: o.listen
  });
  if (behandelt) return;

  // Die Kontoseite der Zuschauer - eigener Zugang ueber Sitzungs-Cookie.
  if (o.konten) {
    const kontoBehandelt = await bearbeiteKonto(req, res, {
      konten: o.konten,
      tokens: o.tokens,
      oeffentlicheUrl: o.oeffentlicheUrl ?? '',
      freigabe: o.freigabe
    });
    if (kontoBehandelt) return;
  }

  /*
     Die Wurzel gehoert den ZUSCHAUERN.

     Frueher lag dort das Dashboard - aus der Zeit, als es die Kontoseite
     noch nicht gab. Auf einem Server im Netz ist das die falsche Tuer:
     wer die Adresse aufruft, sieht eine Verwaltungsoberflaeche, die ihn
     nichts angeht (leer und gesperrt zwar, aber verwirrend). Die
     Zuschauerseite ist das, was er sucht.

     Das Dashboard bleibt unter /freigabe erreichbar, mit Schluessel.
  */
  if (pfad === '/' && o.konten) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(kontoSeite());
    return;
  }

  /*
     DIE REGELN - oeffentlich, ohne Anmeldung.

     Die Zahlen darin kommen aus dem Code, nicht aus einem Text: eine
     Regelseite, die "mindestens 6" behauptet, waehrend der Server bei 8
     abweist, ist schlimmer als gar keine. Siehe regeln-seite.ts.
  */
  if (pfad === '/regeln') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      /* Anders als der Rest darf das hier zwischengespeichert werden -
         die Seite aendert sich nur, wenn eine Regel sich aendert. */
      'Cache-Control': 'public, max-age=600'
    });
    res.end(regelnSeite({ minSpieler: o.minSpieler ?? MIN_SPIELER }));
    return;
  }

  if (o.oeffentlichDir && (pfad === '/' || pfad === '/freigabe')) {
    return sendeDatei(res, path.join(o.oeffentlichDir, 'freigabe.html'), 'text/html; charset=utf-8');
  }
  if (o.oeffentlichDir && pfad === '/freigabe.js') {
    return sendeDatei(res, path.join(o.oeffentlichDir, 'freigabe.js'), 'text/javascript; charset=utf-8');
  }

  /*
     WER BIN ICH - Auskunft fuer den Client.

     Der Zuschauer sieht seinen Namen sonst nirgends: im Spiel ist die
     eigene Zeile in der Rangliste nicht hervorgehoben, und der Client
     kennt nur seinen Token. Ohne diese Auskunft weiss er nicht, WELCHE
     Zeile fuer ihn gewertet wird - und merkt einen Tippfehler im
     Ingame-Namen erst, wenn nie etwas ankommt.

     Bewusst mit finde() statt pruefen(): eine Auskunft darf weder den
     Mindestabstand verbrauchen noch als Nutzung gelten.
  */
  if (pfad === '/api/wer') {
    const token = o.tokens.finde(req.headers['x-mc-token']);
    if (!token) {
      return sendeJson(res, 401, { ok: false, fehler: 'Token unbekannt' });
    }
    return sendeJson(res, 200, {
      ok: true,
      name: token.name,
      ingameName: token.ingameName ?? '',
      /* Die ganze Lobby oder nur die eigene Zeile - das erklaert dem
         Zuschauer, warum bei ihm nur eine Zeile gewertet wird. */
      ganzeLobby: token.vertraut === true,
      /* Damit der Client merkt, wenn er veraltet ist. Wichtig vor allem
         nach einem Serverumzug: die Adresse steckt fest in der .exe, eine
         alte Fassung wuerde sonst schweigend ins Leere senden. */
      neuesteVersion: verteilung().clientVersion,
      /* Damit der Client die Regel nennen kann, ohne sie doppelt zu
         pflegen: die Zahl steht nur hier, der Client zeigt sie an. */
      minSpieler: o.minSpieler ?? MIN_SPIELER,
      brauchtFreigabe: brauchtFreigabe(token),
      gesperrt: token.gesperrt === true,
      sperrgrund: token.sperrgrund ?? null
    });
  }

  /*
     MEINE RUNDEN - was aus den eigenen Einreichungen geworden ist.

     Der Zuschauer bekam bisher "zur Freigabe eingereicht" und danach
     nie wieder etwas. Wurde abgelehnt, schickte er dasselbe nochmal -
     er kannte den Grund ja nicht. Der Client fragt das hier im
     Minutentakt ab und meldet neue Entscheidungen.

     Herausgegeben wird nur, was diese Person selbst betrifft: ihre
     Zeile, ihr Status, ihr Grund. Die Mitspieler-Zeilen aus demselben
     Bild gehen sie nichts an.
  */
  if (pfad === '/api/meine') {
    const token = o.tokens.finde(req.headers['x-mc-token']);
    if (!token) {
      return sendeJson(res, 401, { ok: false, fehler: 'Token unbekannt' });
    }

    const key = nameKey(token.ingameName ?? '');
    const meine = o.freigabe.vonPerson(key, token.name, 15);

    /*
       Zaehlt die Runde noch?

       Gewertet werden je Person die LETZTEN ZEHN Eintraege
       (listen.js:182). Aeltere sind nicht geloescht, sie fallen nur aus
       dem Fenster - fuer den Zuschauer sieht das aber genauso aus wie
       "nie angekommen", wenn niemand es ihm sagt.

       Gezaehlt wird ueber die eigenen freigegebenen Runden. Das ist eine
       Naeherung, solange nur ueber die Freigabe gezaehlt wird. Fuer die Anzeige im Client reicht es.
    */
    const { fenster, voll } = holeStand();

    /* Ab wann jemand ueberhaupt in der Wertung steht (listen.js:30).
       Der Client zeigt es an - sonst wundert sich ein Neuer, warum seine
       Runden zaehlen, er aber nirgends auftaucht. */
    const alleFreigegeben = o.freigabe.vonPerson(key, token.name, 999)
      .filter((r) => r.status === 'freigegeben').length;

    let gezaehlt = 0;
    return sendeJson(res, 200, {
      ok: true,
      fenster,
      voll,
      gewertet: alleFreigegeben,
      runden: meine.map((r) => {
        /*
           Nur die EIGENE Zeile - die der Mitspieler gehen ihn nichts an.

           Der Client klappt eine Runde auf und zeigt, was dabei
           herauskam. Dafuer braucht er ein paar Angaben mehr als bisher,
           aber ausdruecklich keine fremden Namen: sie helfen ihm beim
           Nachpruefen nicht und stehen bei einer vollen Lobby zu
           dreizehnt in seinem Fenster.

           Der eigene ROHNAME dagegen ist die wichtigste Auskunft
           ueberhaupt: an ihm sieht er, wie der Leser ihn verstanden hat.
           Wer sich beim Ingame-Namen vertippt hat, erkennt es hier und
           nirgends sonst.
        */
        const wo = r.zeilen.findIndex((z) => nameKey(z.rohName) === key);
        const eigene = wo >= 0 ? r.zeilen[wo]! : null;

        let zaehlt = false;
        if (r.status === 'freigegeben') {
          zaehlt = gezaehlt < fenster;
          gezaehlt++;
        }

        return {
          id: r.id,
          eingegangen: r.eingegangen,
          status: r.status,
          punkte: eigene?.punkte?.punkte ?? null,
          grund: r.grund ?? null,
          bearbeitetAm: r.bearbeitetAm ?? null,
          zaehlt,
          /** Wie der Leser den Namen gelesen hat - nicht wie er eingetragen ist. */
          rohName: eigene?.rohName ?? null,
          /** Platz im Scoreboard, 1-basiert. Null, wenn die Zeile fehlt. */
          rang: wo >= 0 ? wo + 1 : null,
          /** Wie viele Verstecker im Bild standen - als Zahl, ohne Namen. */
          lobby: r.zeilen.length,
          /** Wer entschieden hat. Bei offenen Runden null. */
          bearbeitetVon: r.bearbeitetVon ?? null
        };
      })
    });
  }

  /*
     DIE RANGLISTE - oeffentlich, ohne Anmeldung.

     Sie ist der Grund, warum jemand die Seite ueberhaupt aufruft.
     Gerechnet wird sie in rangliste.ts: Schnitt der letzten zehn,
     Platzierung, Trennung Wertung/Anwaerter. Hier wird sie nur
     durchgereicht.
  */
  if (pfad === '/api/rangliste') {
    const stand = holeStand();

    /* NUR DIE AKTIVEN. Eine deaktivierte Liste ist eine abgeschlossene
       Saison - sie verschwindet von der oeffentlichen Seite und bleibt
       im Dashboard einsehbar. Sonst wuerde die Startseite mit jedem Jahr
       laenger, und niemand faende den laufenden Stand. */
    const aktive = stand.listen.filter((l) => l.aktiv);

    return sendeJson(res, 200, {
      ok: true,
      fenster: stand.fenster,
      voll: stand.voll,
      listen: aktive.map((l) => ({
        id: l.id,
        name: l.name,
        eintraege: l.eintraege,
        gewertet: l.gewertet,
        anwaerter: l.anwaerter,
        /* Anwaerter, die es unter die ersten drei schaffen wuerden. Sie
           stehen auch in anwaerter - das hier ist die Auswahl fuer den
           Block ganz oben. Wer noch keine zehn Runden hat, sieht sich
           sonst am Ende einer Liste, in der er eigentlich vorne stuende. */
        aufDemSprung: l.aufDemSprung
      }))
    });
  }

  /* Die Client-Datei zum Herunterladen - verlinkt von der Kontoseite.

     Ausgeliefert wird als ZIP, nicht als nackte .exe: Chrome blockt eine
     unsignierte .exe von einer noch unbekannten Domain hart ("Verdaechtiger
     Download blockiert"), ein Archiv laesst es durch. Der Zuschauer entpackt
     einmal und startet die .exe daraus.

     Typ und Dateiname kommen aus der Endung von clientDatei - so liefert
     dieselbe Stelle auch eine .exe aus, falls doch mal eine bereitliegt. */
  /*
     DIE DOWNLOAD-SEITE - die Warnung erklaeren, statt sie zu
     verschweigen.

     Chrome und SmartScreen warnen beide, weil die Datei unbekannt ist:
     keine Signatur, kein Ruf. Dagegen hilft nur ein Zertifikat fuer
     mehrere hundert Euro im Jahr. Der kostenlose Weg ist, die Warnung
     zu ZEIGEN und dem Misstrauischen die Pruefsumme in die Hand zu
     geben. Siehe download-seite.ts.
  */
  if (pfad === '/download') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(downloadSeite(o.clientDatei ? clientstand(o.clientDatei) : null));
    return;
  }

  /* Die Pruefsumme auch als JSON - die Kontoseite nennt sie neben dem
     Knopf, damit man sie nicht suchen muss. */
  if (pfad === '/api/client') {
    const stand = o.clientDatei ? clientstand(o.clientDatei) : null;
    return sendeJson(res, 200, stand
      ? { ok: true, ...stand }
      : { ok: false, fehler: 'Kein Client hinterlegt' });
  }

  if (pfad === '/client' || pfad === '/client.exe' || pfad === '/client.zip') {
    if (!o.clientDatei || !existsSync(o.clientDatei)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Das Programm liegt hier nicht bereit. Frag im Discord einen Admin oder Mod.');
      return;
    }
    const istZip = o.clientDatei.toLowerCase().endsWith('.zip');
    const inhalt = readFileSync(o.clientDatei);
    res.writeHead(200, {
      'Content-Type': istZip
        ? 'application/zip'
        : 'application/vnd.microsoft.portable-executable',
      'Content-Disposition': 'attachment; filename="'
        + (istZip ? 'Meccha-Ranked.zip' : 'Meccha-Ranked.exe') + '"',
      'Content-Length': inhalt.length,
      'Cache-Control': 'no-store'
    });
    res.end(inhalt);
    return;
  }

  /* ------------------------------------------------- Suchmaschinen

     Nur die Startseite gehoert in den Index. Die Verwaltung ist ohnehin
     ohne Rolle nicht zu gebrauchen, aber sie hat in Suchergebnissen
     nichts verloren - und /client als Treffer waere ein Download-Link
     ohne jede Erklaerung drumherum. */
  if (pfad === '/robots.txt') {
    const zeilen = [
      'User-agent: *',
      'Allow: /$',
      'Disallow: /freigabe',
      'Disallow: /api/',
      'Disallow: /client',
      'Disallow: /anmelden',
      'Disallow: /abmelden'
    ];
    if (o.oeffentlicheUrl) zeilen.push('', 'Sitemap: ' + o.oeffentlicheUrl.replace(/\/+$/, '') + '/sitemap.xml');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(zeilen.join('\n') + '\n');
    return;
  }

  if (pfad === '/sitemap.xml') {
    const basis = (o.oeffentlicheUrl || '').replace(/\/+$/, '');
    if (!basis) {
      // Ohne bekannte Adresse waere jeder Eintrag geraten.
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Keine oeffentliche Adresse hinterlegt.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + '  <url><loc>' + basis + '/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n'
      + '</urlset>\n');
    return;
  }

  if (pfad === '/api/status') {
    return sendeJson(res, 200, {
      ok: true,
      offen: o.freigabe.offene().length,
      maxBild: MAX_BILD,
      /* Damit die Kontoseite die Regel nennen kann, ohne Anmeldung und
         ohne die Zahl doppelt zu pflegen. */
      minSpieler: o.minSpieler ?? MIN_SPIELER
    });
  }

  if (pfad !== '/api/runde') {
    return sendeJson(res, 404, { ok: false, fehler: 'Unbekannter Pfad' });
  }
  if (req.method !== 'POST') {
    return sendeJson(res, 405, { ok: false, fehler: 'Nur POST' });
  }

  /*
     Token zuerst, VOR dem Einlesen des Bildes. Wer nicht darf, soll nicht
     erst acht Megabyte hochladen duerfen.
  */
  /*
     Admins sind vom Mindestabstand befreit - beim Einrichten und
     Nachpruefen soll niemand auf sich selbst warten.

     Absichtlich NUR Admins, nicht Mods und nicht "vertraute" Zugaenge:
     vertraut sagt etwas ueber den Rechner, nicht ueber die Person, und
     ein Mod soll Runden entscheiden, nicht am Limit vorbeischicken.

     Die Rolle liegt am Konto, nicht am Token - deshalb der Umweg.
     tokens.finde() statt pruefen(), weil eine reine Auskunft weder als
     Nutzung gelten noch das eigene Zeitfenster verbrauchen darf.
  */
  const roh = req.headers['x-mc-token'];
  let ohneAbstand = false;
  if (o.konten && typeof roh === 'string') {
    const konto = o.konten.findeNachToken(roh);
    ohneAbstand = konto !== null && o.konten.rolleVon(konto) === 'admin';
  }

  const pruefung = o.tokens.pruefen(roh, Date.now(), ohneAbstand);
  if (!pruefung.ok) {
    return sendeJson(res, pruefung.code, { ok: false, fehler: pruefung.grund });
  }
  const token = pruefung.token;

  const typ = String(req.headers['content-type'] ?? '')
    .split(';')[0]?.trim().toLowerCase() ?? '';
  const endung = ERLAUBTE_TYPEN.get(typ);
  if (!endung) {
    return sendeJson(res, 415, {
      ok: false,
      fehler: 'Content-Type muss image/png oder image/jpeg sein, war: ' + (typ || '(leer)')
    });
  }

  let bild: Buffer;
  try {
    bild = await leseKoerper(req, MAX_BILD);
  } catch (err) {
    return sendeJson(res, 413, { ok: false, fehler: (err as Error).message });
  }
  if (bild.length === 0) {
    return sendeJson(res, 400, { ok: false, fehler: 'Leeres Bild' });
  }

  /*
     Vor dem Lesen pruefen, ob dasselbe Bild schon da ist. Spart einen
     OCR-Lauf und ist die Idempotenz-Sperre: ein doppelt geschickter
     Upload darf nicht zweimal zaehlen.
  */
  const hash = Freigabeliste.hashVon(bild);
  const schon = o.freigabe.alle().find((r) => r.bildHash === hash);
  if (schon) {
    return sendeJson(res, 200, {
      ok: true,
      neu: false,
      id: schon.id,
      status: schon.status,
      hinweis: 'Dieses Bild wurde schon eingereicht',
      zeilen: schon.zeilen.map((z) => ({ rohName: z.rohName, rohPunkte: z.rohPunkte }))
    });
  }

  /*
     Bild ZUERST speichern, dann lesen.
     
     Vorher lag das Speichern hinter dem Lesen - schlug das Lesen fehl,
     blieb nichts uebrig, und man konnte nicht nachsehen, WAS der Server
     ueberhaupt bekommen hatte. Genau das hat die Fehlersuche blockiert:
     der Client loescht seine Aufnahme nach dem Senden, also war das Bild
     danach nirgends mehr.
  */
  mkdirSync(o.bilderDir, { recursive: true });
  const bildPfad = path.join(
    o.bilderDir,
    'upload-' + new Date().toISOString().replace(/[:.]/g, '-') +
      '-' + hash.slice(0, 8) + endung
  );
  writeFileSync(bildPfad, bild);

  /*
     Den Ranglisten-Block gleich ausschneiden.

     Er bleibt dauerhaft liegen, waehrend das Original nach ein paar
     Tagen geloescht wird - ~55 KB statt ~2 MB, in voller Aufloesung.
     Siehe ausschnitt.ts.

     Vor dem Lesen, nicht danach: schlaegt das Lesen fehl, will man
     gerade dann nachsehen koennen, WAS da eigentlich im Bild stand.
     Der Zuschnitt wirft nie - klappt er nicht, bleibt es beim Original.
  */
  const ausschnitt = (o.schneideAus ?? schneideAus)(
    bildPfad,
    ausschnittPfadZu(bildPfad, path.join(o.bilderDir, 'ausschnitte'))
  );

  let zeilen: RohZeile[];
  try {
    zeilen = await leseListe(bild, typ, o.leser ?? waehleLeser());
  } catch (err) {
    const unbrauchbar = err instanceof ModellAntwortUnbrauchbar;
    console.log('  Lesen fehlgeschlagen (' + token.name + '): ' + (err as Error).message);
    console.log('  Das Bild liegt hier: ' + bildPfad);
    return sendeJson(res, unbrauchbar ? 422 : 500, {
      ok: false,
      fehler: unbrauchbar
        ? 'Auf dem Bild war keine brauchbare Rangliste zu erkennen'
        : 'Lesen fehlgeschlagen'
    });
  }

  /*
     Genug Verstecker in der Runde?

     In einer winzigen Runde laesst sich der eigene Platz beliebig
     schoenspielen - zu zweit wird man immer Erster. Damit eine Runde
     zaehlt, muss das Scoreboard also eine Mindestzahl an Versteckern
     zeigen. Das haelt niemanden ab, der sich sechs Freunde sucht und
     absprachegemaess verliert; es hebt die Latte aber ueber "allein eine
     Lobby aufmachen und farmen".

     Gezaehlt werden die Zeilen der Rangliste - im Scoreboard von MECCHA
     CHAMELEON stehen nur die Verstecker, keine Hunter. Also ist jede
     Zeile ein Verstecker, und zeilen.length ist genau ihre Zahl.

     Die Pruefung steht bewusst frueh: vor der Zuordnung, vor der
     Dublettensperre, vor dem Eintragen. Ein zu kleines Bild soll gar
     nicht erst in den Bestand kommen.

     Ueber MC_MIN_SPIELER einstellbar, Vorgabe 6. Der eigene Rechner
     (vertraut) ist ausgenommen: der erfasst die ganze Runde ohnehin auf
     einen Griff, da waere die Sperre nur im Weg.
  */
  const minAktiv = o.minSpieler ?? MIN_SPIELER;
  if (!token.vertraut && zeilen.length < minAktiv) {
    console.log('  Zu wenige Verstecker (' + token.name + '): ' +
      zeilen.length + ' < ' + minAktiv);
    /* art markiert den Fall eindeutig, damit der Client ihn NICHT als
       "Abgelehnt" (rot, klingt nach Betrug) anzeigt, sondern neutral als
       "zaehlt nicht". Der Spieler hat nichts falsch gemacht - es waren
       nur zu wenige Verstecker in der Runde. */
    /*
       Der Hinweis richtet sich nach der Zahl, und das ist wichtiger als
       es aussieht.

       Bei 4 oder 5 Zeilen war die Lobby wirklich zu klein - da ist
       nichts zu machen, und ein Ratschlag waere nur Hohn.

       Bei 0 bis 2 Zeilen war es fast nie eine Mini-Lobby, sondern ein
       Lesefehler. An 13 echten Screenshots gemessen (siehe UMBAU.md)
       liefern die schlechten 0, 1, 2 und 5 Zeilen, die guten 7 bis 13 -
       und was sie unterscheidet, ist der UNTERGRUND: die Schrift liegt
       halbtransparent ueber der Spielwelt, und ueber buntem Boden
       verschwindet sie. Genau dann braucht der Spieler den Rat, nicht
       die Regel.
    */
    const wohlLesefehler = zeilen.length <= 2;
    return sendeJson(res, 422, {
      ok: false,
      art: 'zu-wenige-spieler',
      minSpieler: minAktiv,
      erkannt: zeilen.length,
      fehler: 'Zaehlt nicht: nur ' + zeilen.length + ' Verstecker im Scoreboard, ' +
        'noetig sind ' + minAktiv,
      hinweis: wohlLesefehler
        ? 'So wenige Zeilen deuten eher auf ein schwer lesbares Bild als auf eine ' +
          'kleine Runde. Druecke am ENDE der Runde, wenn die Rangliste vollstaendig ' +
          'steht, und schau dabei auf einen ruhigen Hintergrund - Himmel oder eine ' +
          'Wand statt buntem Boden. Die Schrift ist durchsichtig; ueber Bonbons und ' +
          'Wiese verschwindet sie.'
        : 'Die Runde war einfach zu klein. Ab ' + minAktiv + ' Versteckern zaehlt es.',
      zeilen: zeilen.map((z) => ({ rohName: z.rohName, rohPunkte: z.rohPunkte }))
    });
  }

  /*
     Ist diese PARTIE schon erfasst? Die Rangliste zeigt einen festen
     Endstand, zwei Screenshots derselben Lobby haben also dieselben
     Punkte. Ohne diese Sperre bekaeme jeder in der Lobby seine Punkte
     doppelt, sobald zwei Mitspieler einschicken - und auch zweimal F9
     am eigenen Rechner wuerde doppelt zaehlen.

     Die Pruefung steht VOR dem Eintragen und gilt fuer beide Wege.
  */
  const kennung = rundenKennung(zeilen);

  /*
     Welche Zeilen sollen aus diesem Bild gewertet werden?

     Zuschauer: NUR die eigene. Der Screenshot zeigt die ganze Lobby, das
     ist als Beleg auch noetig - gewertet wird aber ausschliesslich die
     Zeile des Absenders. Sonst wuerde ein Zuschauer die Punkte aller
     Mitspieler einreichen, und saessen zwei aus derselben Lobby am
     Client, bekaeme jeder alles doppelt.

     Eigene Rechner: alle. Ein Tastendruck erfasst die ganze Lobby, das
     ist ja der Sinn.
  */
  /* Den Stand hier holen und nicht erst weiter unten: schon die Frage
     "gibt es zu diesem Ingame-Namen ueberhaupt ein Konto" braucht die
     Spielerliste. */
  const stand = holeStand();

  let zuWerten = zeilen;
  if (!token.vertraut) {
    const ingame = token.ingameName ?? '';
    if (!ingame) {
      return sendeJson(res, 400, {
        ok: false,
        fehler: 'Fuer diesen Token ist kein Ingame-Name hinterlegt - bitte im Discord bei einem Admin melden'
      });
    }

    /*
       Steht hinter diesem Namen ueberhaupt ein Konto?

       Gewertet wird gegen die angemeldeten Steam-Konten. Ein Token, den
       niemand ueber /konto geholt hat, hat zwar einen Ingame-Namen, aber
       kein Konto - und wird deshalb NIE gewertet.

       Frueher fiel das erst beim Freigeben auf, und dort nur an einer
       kleinen Null ("0 eingetragen"). Der Zuschauer bekam ein "zur
       Freigabe eingereicht", wartete, und nichts passierte - ohne dass
       ihm jemand haette sagen koennen, warum. Hier abzuweisen ist
       unhoeflicher und ehrlicher.
    */
    const bekannt = stand.spieler.some(
      (sp) => nameKey(sp.name) === nameKey(ingame));

    if (!bekannt) {
      return sendeJson(res, 403, {
        ok: false,
        art: 'kein-konto',
        fehler: 'Zu deinem Ingame-Namen "' + ingame + '" gibt es kein angemeldetes ' +
          'Konto. Melde dich mit Steam an und trag den Namen dort ein - erst dann ' +
          'kann eine Runde dir zugeordnet werden.'
      });
    }
    // Denselben Abgleich benutzen wie sonst auch, damit ein Lesefehler im
    // eigenen Namen nicht dazu fuehrt, dass man sich selbst nicht findet.
    zuWerten = zeilen.filter((z) =>
      istSicher(ordneZu(z.rohName, [{ id: 'selbst', name: ingame }])));

    if (zuWerten.length === 0) {
      /*
         Die gelesenen Zeilen gehen als "zeilen" mit zurueck, nicht nur
         als Namensliste.

         Grund: im Spiel sieht man den EIGENEN Namen in der Rangliste
         nicht besonders hervorgehoben - wer sich anmeldet, weiss oft gar
         nicht, wie das Spiel ihn genau schreibt. Der Client zeigt
         "zeilen" ohnehin an; damit hat der Zuschauer die Schreibweise
         schwarz auf weiss vor sich und kann sie auf der Kontoseite
         genau so eintragen.
      */
      return sendeJson(res, 422, {
        ok: false,
        fehler: 'Dein Name "' + ingame + '" steht so nicht in dieser Rangliste. ' +
          'Gelesen wurde:',
        gelesen: zeilen.map((z) => z.rohName),
        zeilen: zeilen.map((z) => ({ rohName: z.rohName, rohPunkte: z.rohPunkte }))
      });
    }
    if (zuWerten.length > 1) {
      // Zwei Zeilen auf denselben Namen: eine davon ist falsch gelesen.
      return sendeJson(res, 422, {
        ok: false,
        fehler: 'Dein Name kommt mehrfach in der Rangliste vor - bitte im Discord bei einem Admin melden'
      });
    }
  }

  /*
     Ist dieser Spieler aus DIESER Partie schon gewertet?

     Die Regel ist "ein Spieler aus einer Partie zaehlt einmal", nicht
     "eine Partie zaehlt einmal". Drei Zuschauer aus derselben Lobby
     muessen alle drei durchkommen - jeder mit seiner eigenen Zeile.
     Abgewiesen wird nur, wer denselben Spieler ein zweites Mal einreicht.
  */
  const beansprucht = zuWerten.map((z) => nameKey(z.rohName));
  const doppelt = o.freigabe.schonGewertet(kennung, beansprucht);

  if (doppelt.length > 0 && doppelt.length === beansprucht.length) {
    const ersteRunde = doppelt[0]!.runde;
    console.log('  ' + token.name + ': schon gewertet (von ' + ersteRunde.absender + ')');
    return sendeJson(res, 200, {
      ok: true,
      neu: false,
      id: ersteRunde.id,
      status: ersteRunde.status,
      hinweis: 'Dieses Ergebnis wurde fuer diese Partie bereits von ' +
        ersteRunde.absender + ' eingeschickt - es zaehlt nur einmal',
      zeilen: zuWerten.map((z) => ({ rohName: z.rohName, rohPunkte: z.rohPunkte }))
    });
  }

  // Gewertet wird nur, was zuWerten enthaelt - bei Zuschauern die eine
  // eigene Zeile, bei eigenen Rechnern die ganze Lobby.
  const bericht = teileAuf(bewerteRunde(zuWerten, stand.spieler));

  /*
     Dieselbe Punktzahl schon wieder?

     Das Ergebnis entscheidet gleich mit, ob diese Runde ueberhaupt
     direkt durchlaufen darf - siehe unten. Deshalb steht die Pruefung
     VOR der Weiche und nicht erst in der Anzeige: ein Zugang auf
     "zaehlt sofort" wuerde sonst an ihr vorbeilaufen, und genau der ist
     der lohnende zum Faelschen.
  */
  const verdacht = pruefeVerdacht(o.freigabe.alle(), { zeilen, beansprucht });

  /*
     WAS FAELLT AUF?

     Fuer Zugaenge, die sonst direkt in die Punkteliste laufen, ist das
     die einzige Bremse - also darf sie nicht nur an der wiederholten
     Punktzahl haengen. Drei Dinge halten eine Runde an:

       1. dieselbe Punktzahl wieder      verdacht.ts
       2. Bild wirkt nachbearbeitet      bildpruefung.ts
       3. exakt dieselben Zeilen wie eine fruehere Runde

     Nummer 2 wurde bisher nur auf dem Weg ueber die Freigabe geprueft.
     Wer auf "zaehlt sofort" stand, kam mit einem in Paint bearbeiteten
     Bild ungesehen durch - genau am Zugang, dem man vertraut hat.
  */
  const befund = (o.bildpruefer ?? pruefeBild)(bild, typ);
  const gleiche = o.freigabe.inhaltsgleiche(zeilen);

  const auffaellig: string[] = [...verdacht.gruende];
  if (!befund.wirktEcht) {
    auffaellig.push('Das Bild wirkt nachbearbeitet: ' + befund.auffaelligkeiten.join(', '));
  }
  if (gleiche.length > 0) {
    auffaellig.push('Dieselben Zeilen wie in ' + gleiche.length + ' frueheren Runde(n)');
  }

  /* --------------------------------------- ohne Freigabe: direkt in die Liste
     Frueher hing das an token.vertraut - damit konnte ein Zuschauer
     entweder gar nicht ohne Freigabe laufen, oder er haette gleich die
     ganze Lobby einreichen duerfen. Beides falsch.

     Jetzt entscheidet brauchtFreigabe() ueber die Pruefung und
     token.vertraut allein darueber, wieviel gewertet wird. Die Zeilen
     stehen schon in zuWerten - dort wurde oben nach ingameName
     gefiltert, sofern der Token nicht vertraut ist.
  */
  /*
     Ein Verdacht sticht "zaehlt sofort".

     Sonst waere die Pruefung wirkungslos, wo sie am noetigsten ist: wer
     einmal dein Vertrauen hat, koennte beliebig oft dieselbe erfundene
     Punktzahl schicken, und niemand saehe je ein Bild davon. Geflaggt
     heisst deshalb: ab in die Freigabe, Bild aufheben, du entscheidest.
     Das gilt NICHT fuer vertraute Zugaenge - das sind deine eigenen
     Rechner, dort steht ohnehin niemand Fremdes davor.
  */
  if (!brauchtFreigabe(token) && !(auffaellig.length > 0 && !token.vertraut)) {
    /*
       Auch die eigene Runde wird vermerkt - sonst wuesste die
       Kennungspruefung nichts von ihr, und ein Zuschauer koennte
       dieselbe Partie danach nochmal einschicken.
    */
    const eigene = o.freigabe.hinzufuegen({
      eingegangen: Date.now(),
      quelle: token.vertraut ? 'selbst' : 'zuschauer',
      absender: token.name,
      bildPfad,
      ...(ausschnitt ? { ausschnittPfad: ausschnitt } : {}),
      bildHash: hash,
      zeilen,
      kennung,
      beansprucht,
      bildAuffaellig: []
    });
    o.freigabe.entscheiden(eigene.runde.id, 'freigegeben', token.name);

    let geschrieben = 0;
    for (const e of bericht.einzutragen) {
      // Konto-Kennung, nicht der gelesene Name - die Zuordnung ist oben
      // schon passiert und soll hier nicht wieder aufgemacht werden.
      o.eintragen(personVon(e)!.id, e.zeile.punkte!.punkte);
      geschrieben++;
    }
    console.log('  ' + token.name + ' (' + (token.vertraut ? 'vertraut' : 'ohne Freigabe') +
      '): ' + geschrieben + ' eingetragen, ' + bericht.rueckfragen.length + ' offen');

    /* Durchgekommen - ab jetzt gilt der lange Abstand. Bis hierher stand
       nur der kurze aus pruefen(), der das Fenster waehrend des Lesens
       geschlossen hielt. */
    if (!ohneAbstand) o.tokens.angenommen(token.token);

    return sendeJson(res, 200, {
      ok: true,
      neu: true,
      direkt: true,
      geschrieben,
      eingetragen: bericht.einzutragen.map((e) => ({
        name: personVon(e)!.name,
        punkte: e.zeile.punkte!.punkte
      })),
      rueckfragen: bericht.rueckfragen.map((e) => ({
        rohName: e.zeile.rohName,
        rohPunkte: e.zeile.rohPunkte,
        grund: e.grund
      }))
    });
  }

  /* ----------------------------------------------- Zuschauer: zur Freigabe

     Der Bildbefund von oben wandert mit in die Freigabeliste. Er fuehrt
     NICHT zur Ablehnung - ein anderes Aufnahmewerkzeug kodiert anders,
     ohne dass jemand betrogen hat.
  */
  const { runde, neuAngelegt } = o.freigabe.hinzufuegen({
    eingegangen: Date.now(),
    quelle: 'zuschauer',
    absender: token.name,
    bildPfad,
    ...(ausschnitt ? { ausschnittPfad: ausschnitt } : {}),
    bildHash: hash,
    zeilen,
    kennung,
    beansprucht,
    bildAuffaellig: befund.auffaelligkeiten,
    /* Der Verdacht wird MITGESCHRIEBEN, nicht nur angezeigt: er hat die
       Runde hierher gebracht, und in einem Monat soll noch nachvollziehbar
       sein, warum. Ausserdem haengt die Aufbewahrung des Bildes daran. */
    /* Bei einem Zugang, der sonst durchgelaufen waere, stehen ALLE
       Gruende drin - er soll ja sehen, warum die Runde bei ihm liegt.
       Wer ohnehin zur Freigabe geht, bekommt nur den Verdacht rot
       angestrichen; das Bild steht schon als gelber Hinweis da. */
    ...(brauchtFreigabe(token)
      ? (verdacht.geflaggt ? { verdacht: verdacht.gruende } : {})
      : (auffaellig.length > 0 ? { verdacht: auffaellig } : {}))
  });

  const aehnlich = o.freigabe.aehnliche(runde);
  console.log('  ' + token.name + ': ' + zeilen.length + ' Zeilen zur Freigabe' +
    (aehnlich.length ? '  (ACHTUNG: ' + aehnlich.length + ' inhaltsgleiche Runde(n))' : '') +
    (befund.wirktEcht ? '' : '  (ACHTUNG: Bild wirkt nachbearbeitet)') +
    (auffaellig.length > 0 ? '  (GEFLAGGT: ' + auffaellig.join('; ') + ')' : ''));

  /* Angenommen heisst hier: in der Freigabeliste gelandet - NICHT "vom
     Streamer freigegeben". Dessen Entscheidung faellt Minuten spaeter,
     bis dahin kann kein Abstand warten.

     Bei neuAngelegt === false war es derselbe Screenshot noch einmal.
     Dann ist nichts Neues passiert, und es bleibt beim kurzen Abstand:
     wer versehentlich zweimal drueckt, soll nicht drei Minuten buessen. */
  if (!ohneAbstand && neuAngelegt) o.tokens.angenommen(token.token);

  return sendeJson(res, 200, {
    ok: true,
    neu: neuAngelegt,
    id: runde.id,
    status: runde.status,
    hinweis: 'Zur Freigabe eingereicht - gewertet wird erst nach Pruefung',
    zeilen: zuWerten.map((z) => ({ rohName: z.rohName, rohPunkte: z.rohPunkte })),
    inhaltsgleich: aehnlich.length,
    geflaggt: auffaellig.length > 0
  });
}
