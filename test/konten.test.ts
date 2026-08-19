import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ladeKonten, istSteamId, ingameSchluessel,
  SITZUNG_GUELTIG_MS, NAMENSSPERRE_TAGE, type Kontenliste
} from '../src/konten.js';
import { ladeTokens, brauchtFreigabe, type Tokenliste } from '../src/tokens.js';

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-konten-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const TAG = 24 * 60 * 60 * 1000;

let n = 0;
let konten: Kontenliste;
let tokens: Tokenliste;

beforeEach(() => {
  n++;
  tokens = ladeTokens(path.join(ORDNER, 't-' + n + '.json'));
  konten = ladeKonten(path.join(ORDNER, 'k-' + n + '.json'), tokens);
});

/** Legt ein fertiges Konto an: ueber Steam anmelden, Namen setzen. */
function konto(steamId: string, ingame: string, jetzt = Date.now()) {
  const e = konten.anmelden(steamId, undefined, jetzt);
  assert.equal(e.ok, true);
  if (!e.ok) throw new Error('unerreichbar');

  if (ingame) konten.setzeIngameName(e.wert.konto.id, ingame, false, jetzt);
  return e.wert.konto;
}

/** Erfundene, aber formal gueltige SteamIDs. */
const STEAM_A = '76561198000000001';
const STEAM_B = '76561198000000002';
const STEAM_C = '76561198000000003';

/* ------------------------------------------------------------- Steam */

describe('SteamID', () => {
  test('erkennt gueltige Kennungen', () => {
    assert.equal(istSteamId(STEAM_A), true);
    assert.equal(istSteamId('7656119800000000'), false, '16 Ziffern sind zu wenig');
    assert.equal(istSteamId('abc'), false);
    assert.equal(istSteamId(''), false);
  });
});

describe('Anmelden ueber Steam', () => {
  test('legt beim ersten Mal ein Konto an', () => {
    const e = konten.anmelden(STEAM_A);
    assert.equal(e.ok, true);
    if (!e.ok) return;
    assert.equal(e.wert.konto.steamId, STEAM_A);
    assert.ok(e.wert.sitzung.length > 10);
    assert.equal(konten.alle().length, 1);
  });

  test('meldet ein bestehendes Konto wieder an, ohne ein zweites anzulegen', () => {
    konten.anmelden(STEAM_A);
    konten.anmelden(STEAM_A);
    assert.equal(konten.alle().length, 1);
  });

  test('uebernimmt den Steam-Namen als Startwert', () => {
    const e = konten.anmelden(STEAM_A, 'NorikoTv');
    if (!e.ok) return;
    assert.equal(e.wert.konto.benutzername, 'NorikoTv');
  });

  test('kommt ohne Steam-Namen zurecht', () => {
    const e = konten.anmelden(STEAM_A);
    if (!e.ok) return;
    assert.ok(e.wert.konto.benutzername.length > 0);
  });

  test('weist unsinnige Kennungen ab', () => {
    assert.equal(konten.anmelden('keine-id').ok, false);
    assert.equal(konten.anmelden('').ok, false);
  });
});

describe('Sitzungen', () => {
  test('finden das Konto wieder', () => {
    const e = konten.anmelden(STEAM_A);
    if (!e.ok) return;
    assert.equal(konten.ausSitzung(e.wert.sitzung)?.steamId, STEAM_A);
  });

  test('eine abgelaufene Sitzung gilt nicht mehr', () => {
    const jetzt = Date.now();
    const e = konten.anmelden(STEAM_A, undefined, jetzt);
    if (!e.ok) return;
    assert.equal(konten.ausSitzung(e.wert.sitzung, jetzt + SITZUNG_GUELTIG_MS + 1), null);
  });

  test('Nutzung verlaengert die Sitzung', () => {
    const jetzt = Date.now();
    const e = konten.anmelden(STEAM_A, undefined, jetzt);
    if (!e.ok) return;

    const halb = jetzt + SITZUNG_GUELTIG_MS / 2;
    assert.ok(konten.ausSitzung(e.wert.sitzung, halb));
    // Von halb aus gerechnet ist sie jetzt wieder voll gueltig.
    assert.ok(konten.ausSitzung(e.wert.sitzung, halb + SITZUNG_GUELTIG_MS - 1000));
  });

  test('Abmelden macht die Sitzung ungueltig', () => {
    const e = konten.anmelden(STEAM_A);
    if (!e.ok) return;
    konten.abmelden(e.wert.sitzung);
    assert.equal(konten.ausSitzung(e.wert.sitzung), null);
  });

  test('ein erfundener Code findet nichts', () => {
    assert.equal(konten.ausSitzung('gibtsnicht'), null);
  });
});

/* ------------------------------------------------------- Benutzername */

describe('Benutzername', () => {
  test('ist frei aenderbar', () => {
    const k = konto(STEAM_A, 'Jones');
    assert.equal(konten.aendereBenutzername(k.id, 'NorikoTv').ok, true);
    assert.equal(konten.findeNachId(k.id)?.benutzername, 'NorikoTv');
  });

  test('darf nicht leer sein', () => {
    const k = konto(STEAM_A, 'Jones');
    assert.equal(konten.aendereBenutzername(k.id, '   ').ok, false);
  });

  test('aendert den Ingame-Namen NICHT mit', () => {
    // Die beiden duerfen nicht verwechselt werden: der eine ist Anzeige,
    // der andere entscheidet ueber die Wertung.
    const k = konto(STEAM_A, 'Jones');
    konten.aendereBenutzername(k.id, 'Skylit');
    assert.equal(konten.findeNachId(k.id)?.ingameName, 'Jones');
  });
});

/* -------------------------------------------------------- Ingame-Name */

describe('Ingame-Name - Eindeutigkeit', () => {
  /*
     Die eigentliche Sperre gegen "ich nehme den Namen des
     Erstplatzierten". Eine Mailbestaetigung wuerde das nicht
     verhindern - die beweist nur, dass jemand seine eigene Mailadresse
     besitzt.
  */
  test('ein Name gehoert dem, der zuerst da war', () => {
    konto(STEAM_B, 'Skylit');
    const dieb = konto(STEAM_C, '');

    const e = konten.setzeIngameName(dieb.id, 'Skylit');
    assert.equal(e.ok, false);
    if (!e.ok) assert.match(e.fehler, /schon einem anderen Konto/);
  });

  test('auch bei anderer Schreibweise', () => {
    konto(STEAM_B, 'Skylit');
    const dieb = konto(STEAM_C, '');
    assert.equal(konten.setzeIngameName(dieb.id, 'SKYLIT').ok, false);
    assert.equal(konten.setzeIngameName(dieb.id, '  skylit ').ok, false);
  });

  test('den eigenen Namen erneut zu setzen ist erlaubt', () => {
    const k = konto(STEAM_A, 'Jones');
    assert.equal(konten.setzeIngameName(k.id, 'Jones').ok, true);
  });

  test('freie Namen gehen durch', () => {
    konto(STEAM_B, 'Skylit');
    const k = konto(STEAM_A, '');
    assert.equal(konten.setzeIngameName(k.id, 'Jones').ok, true);
  });
});

describe('Ingame-Name - Sperrfrist', () => {
  test('eine zweite Aenderung wird abgewiesen', () => {
    const jetzt = Date.now();
    const k = konto(STEAM_A, 'Jones', jetzt);

    const e = konten.setzeIngameName(k.id, 'Jones2026', false, jetzt + TAG);
    assert.equal(e.ok, false);
    if (!e.ok) assert.match(e.fehler, /Tage aendern/);
  });

  test('nach Ablauf der Frist geht es wieder', () => {
    const jetzt = Date.now();
    const k = konto(STEAM_A, 'Jones', jetzt);
    const spaeter = jetzt + (NAMENSSPERRE_TAGE + 1) * TAG;
    assert.equal(konten.setzeIngameName(k.id, 'Jones2026', false, spaeter).ok, true);
  });

  /*
     Die Frist bindet nur den Nutzer. Aendert sich ein Name wirklich
     zweimal kurz hintereinander, macht es der Streamer - der soll nicht
     warten muessen.
  */
  test('der Streamer ist an keine Frist gebunden', () => {
    const jetzt = Date.now();
    const k = konto(STEAM_A, 'Jones', jetzt);
    assert.equal(konten.setzeIngameName(k.id, 'Jones2026', true, jetzt + 1000).ok, true);
    assert.equal(konten.setzeIngameName(k.id, 'Jones2027', true, jetzt + 2000).ok, true);
  });

  test('die Eindeutigkeit gilt auch fuer den Streamer', () => {
    // Sonst koennte er versehentlich zwei Konten denselben Namen geben,
    // und beide wuerden dieselbe Zeile beanspruchen.
    konto(STEAM_B, 'Skylit');
    const k = konto(STEAM_A, 'Jones');
    assert.equal(konten.setzeIngameName(k.id, 'Skylit', true).ok, false);
  });
});

describe('Ingame-Name - Rueckstufung', () => {
  /*
     Wer den Namen aendert, faellt zurueck auf "braucht Freigabe". Beim
     naechsten Upload sieht der Streamer Bild und beanspruchte Zeile
     nebeneinander - dort faellt ein fremder Name auf.
  */
  test('eine Aenderung durch den Nutzer setzt auf Freigabe zurueck', () => {
    const jetzt = Date.now();
    const k = konto(STEAM_A, 'Jones', jetzt);

    // Vertrauen erteilen, wie es der Streamer im Dashboard taete.
    tokens.aktualisiere(konten.findeNachId(k.id)!.token, { ohneFreigabe: true });
    const vorher = tokens.alle().find((t) => t.token === konten.findeNachId(k.id)!.token)!;
    assert.equal(brauchtFreigabe(vorher), false);

    konten.setzeIngameName(k.id, 'Jones2026', false, jetzt + (NAMENSSPERRE_TAGE + 1) * TAG);

    const nachher = tokens.alle().find((t) => t.token === konten.findeNachId(k.id)!.token)!;
    assert.equal(brauchtFreigabe(nachher), true, 'muss wieder geprueft werden');
  });

  test('eine Aenderung durch den Streamer stuft nicht zurueck', () => {
    const k = konto(STEAM_A, 'Jones');
    tokens.aktualisiere(konten.findeNachId(k.id)!.token, { ohneFreigabe: true });

    konten.setzeIngameName(k.id, 'Jones2026', true);

    const t = tokens.alle().find((x) => x.token === konten.findeNachId(k.id)!.token)!;
    assert.equal(brauchtFreigabe(t), false);
  });
});

/* --------------------------------------------------------------- Token */

describe('Token am Konto', () => {
  test('wird beim Setzen des Ingame-Namens angelegt', () => {
    const k = konto(STEAM_A, 'Jones');
    const t = konten.findeNachId(k.id)!.token;
    assert.ok(t.length > 10);
    assert.equal(tokens.alle().find((x) => x.token === t)?.ingameName, 'Jones');
  });

  test('bleibt bei einer Namensaenderung derselbe', () => {
    // Sonst muesste jeder seine client.json neu ausfuellen.
    const jetzt = Date.now();
    const k = konto(STEAM_A, 'Jones', jetzt);
    const vorher = konten.findeNachId(k.id)!.token;

    konten.setzeIngameName(k.id, 'Jones2026', false, jetzt + (NAMENSSPERRE_TAGE + 1) * TAG);
    assert.equal(konten.findeNachId(k.id)!.token, vorher);
    assert.equal(tokens.alle().find((x) => x.token === vorher)?.ingameName, 'Jones2026');
  });

  test('laesst sich neu erzeugen und sperrt den alten', () => {
    const k = konto(STEAM_A, 'Jones');
    const alt = konten.findeNachId(k.id)!.token;

    const e = konten.tokenNeu(k.id);
    assert.equal(e.ok, true);
    if (!e.ok) return;

    assert.notEqual(e.wert, alt);
    assert.equal(tokens.alle().find((x) => x.token === alt)?.gesperrt, true);
    assert.equal(tokens.pruefen(alt).ok, false);
  });

  test('ohne Ingame-Namen gibt es keinen Token', () => {
    const e = konten.anmelden(STEAM_A);
    if (!e.ok) return;
    assert.equal(e.wert.konto.token, '');
    assert.equal(konten.tokenNeu(e.wert.konto.id).ok, false);
  });
});

/* ------------------------------------------------------ Speichern */

describe('Speichern und Laden', () => {
  test('ueberlebt einen Neustart', () => {
    const tDatei = path.join(ORDNER, 'dauer-t.json');
    const kDatei = path.join(ORDNER, 'dauer-k.json');

    const t1 = ladeTokens(tDatei);
    const k1 = ladeKonten(kDatei, t1);
    const e = k1.anmelden(STEAM_A);
    if (!e.ok) return;
    k1.setzeIngameName(e.wert.konto.id, 'Jones');

    const t2 = ladeTokens(tDatei);
    const k2 = ladeKonten(kDatei, t2);
    assert.equal(k2.alle().length, 1);
    assert.equal(k2.findeNachIngame('Jones')?.steamId, STEAM_A);
  });

  test('legt eine kaputte Datei zur Seite', () => {
    const datei = path.join(ORDNER, 'kaputt-' + (++n) + '.json');
    writeFileSync(datei, 'kein JSON', 'utf8');
    assert.equal(ladeKonten(datei, tokens).alle().length, 0);

    const beiseite = readdirSync(ORDNER)
      .filter((f) => f.startsWith(path.basename(datei, '.json')) && f.includes('.defekt-'));
    assert.equal(beiseite.length, 1);
  });
});

describe('ingameSchluessel', () => {
  test('zieht Gross/Klein und Leerzeichen zusammen', () => {
    assert.equal(ingameSchluessel('  Albert   Wesker  '), 'albert wesker');
    assert.equal(ingameSchluessel('SKYLIT'), 'skylit');
  });
});

/* --------------------------------------------------- Vorgabe fuer Neue */

describe('Neue Konten zaehlen sofort', () => {
  test('ein frisches Konto braucht keine Freigabe mehr', () => {
    /* Frueher musste jede erste Runde von Hand durchgewunken werden.
       Inzwischen haelt der Server an, was auffaellt - das reicht, und
       bei fuenfzig Zuschauern spart es fuenfzig Klicks. */
    const k = konto(STEAM_A, 'Jones');
    const t = tokens.alle().find((x) => x.token === k.token)!;

    assert.equal(brauchtFreigabe(t), false);
    assert.equal(t.vertraut, false, 'trotzdem nur die eigene Zeile, nie die ganze Lobby');
  });

  test('eine spaetere Namensaenderung stuft wieder zurueck', () => {
    // Der Moment, in dem jemand eine fremde Zeile beanspruchen koennte.
    const k = konto(STEAM_A, 'Jones');
    konten.setzeIngameName(k.id, 'TREV', false, Date.now() + 40 * TAG);

    const t = tokens.alle().find((x) => x.token === k.token)!;
    assert.equal(brauchtFreigabe(t), true);
  });
});

/* ------------------------------------------------------ Weiches Loeschen */

describe('Konten loeschen - weich, nie wirklich', () => {
  test('nimmt das Konto aus der aktiven Liste', () => {
    const k = konto(STEAM_A, 'Jones');
    assert.equal(konten.loeschen(k.id).ok, true);

    assert.equal(konten.aktive().length, 0);
    assert.equal(konten.alle().length, 1, 'weg ist es nie - die Historie haengt daran');
    assert.ok(konten.findeNachId(k.id)!.geloescht);
  });

  test('sperrt den Zugang mit', () => {
    // Sonst laedt der Client munter weiter hoch.
    const k = konto(STEAM_A, 'Jones');
    konten.loeschen(k.id);

    const t = tokens.alle().find((x) => x.token === k.token)!;
    assert.equal(t.gesperrt, true);
    assert.equal(t.sperrgrund, 'Konto geloescht');
  });

  test('beendet offene Sitzungen', () => {
    const e = konten.anmelden(STEAM_B);
    if (!e.ok) return;
    konten.loeschen(e.wert.konto.id);
    assert.equal(konten.ausSitzung(e.wert.sitzung), null);
  });

  test('haelt den Ingame-Namen weiter belegt', () => {
    /* Sonst koennte ihn jemand uebernehmen - und die alten Runden des
       Geloeschten waeren ploetzlich seine. */
    const k = konto(STEAM_A, 'Jones');
    konten.loeschen(k.id);

    const zweiter = konten.anmelden(STEAM_B);
    if (!zweiter.ok) return;
    const e = konten.setzeIngameName(zweiter.wert.konto.id, 'Jones');
    assert.equal(e.ok, false);
  });

  test('laesst sich zurueckholen', () => {
    const k = konto(STEAM_A, 'Jones');
    konten.loeschen(k.id);
    assert.equal(konten.wiederherstellen(k.id).ok, true);

    assert.equal(konten.aktive().length, 1);
    assert.equal(konten.findeNachId(k.id)!.geloescht, undefined);
    assert.equal(tokens.alle().find((x) => x.token === k.token)!.gesperrt, undefined);
  });

  test('holt eine ECHTE Sperre nicht mit zurueck', () => {
    /* Loeschen raeumt auf, Sperren haelt draussen. Wer wegen bearbeiteter
       Screenshots gesperrt wurde, bleibt es. */
    const k = konto(STEAM_A, 'Jones');
    tokens.sperren(k.token, 'bearbeitete Screenshots');
    konten.loeschen(k.id);
    konten.wiederherstellen(k.id);

    const t = tokens.alle().find((x) => x.token === k.token)!;
    assert.equal(t.gesperrt, true);
    assert.equal(t.sperrgrund, 'bearbeitete Screenshots');
  });

  test('eine erneute Anmeldung holt das Konto zurueck', () => {
    // Das Loeschen ist fuer Karteileichen, keine Sperre.
    const k = konto(STEAM_A, 'Jones');
    konten.loeschen(k.id);

    const e = konten.anmelden(STEAM_A);
    assert.equal(e.ok, true);
    assert.equal(konten.aktive().length, 1);
    assert.equal(tokens.alle().find((x) => x.token === k.token)!.gesperrt, undefined);
  });

  test('meldet ein unbekanntes Konto', () => {
    assert.equal(konten.loeschen('gibtsnicht').ok, false);
    assert.equal(konten.wiederherstellen('gibtsnicht').ok, false);
  });
});
