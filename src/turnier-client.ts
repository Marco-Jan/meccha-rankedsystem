/* =========================================================================
   ANBINDUNG AN DEN TURNIER-SERVER

   Der Feeder hat keine eigene Datenbank und keine eigene Rangliste. Er
   liest die Kartei aus dem Turnier-Server und traegt Punkte dort ein. Die
   Wertung (Schnitt der letzten 10, Wertung/Anwaerter) macht listen.js
   dort schon, das Overlay ebenso.

   Genutzt werden genau zwei Endpunkte:
     GET  /api/state    -> kartei[] und listen.spiele[]
     POST /api/action   -> { type: 'liste.entry.add', gameId, name, points }
   ========================================================================= */

import { TURNIER_URL, TURNIER_KEY, SPIEL_NAME, TURNIER_TIMEOUT_MS } from './config.js';
import type { KarteiPerson } from './namen.js';

/**
 * Ein Eintrag, wie er in der Punkteliste steht.
 *
 * Der Turnier-Server schickt die letzten 30 je Liste ohnehin mit
 * (listen.js:250) - der Feeder hat sie bisher nur weggeworfen. Im
 * Dashboard sind sie die Gegenprobe: hier siehst du, was WIRKLICH
 * angekommen ist, statt es im Turnier-Admin nachschlagen zu muessen.
 */
export interface Listeneintrag {
  readonly id: string;
  /** Der Name der Karteiperson, nicht der Ingame-Name. */
  readonly name: string;
  readonly punkte: number;
  readonly zeit: number;
}

export interface Spiel {
  readonly id: string;
  readonly name: string;
  readonly eintraege: number;
  /** Die juengsten Eintraege, neueste zuerst. Leer bei aelteren Servern. */
  readonly letzte?: readonly Listeneintrag[];
}

export interface TurnierZustand {
  readonly kartei: readonly KarteiPerson[];
  readonly spiele: readonly Spiel[];
  /** Groesse des Wertungsfensters, wie der Server sie meldet. */
  readonly fenster: number;
  /**
   * Ab so vielen Eintraegen ist man IN DER WERTUNG (listen.js:30).
   * Darunter steht man als Anwaerter in der Liste - das ist der Grund,
   * warum jemand nach drei Runden noch nirgends auftaucht.
   */
  readonly voll: number;
}

export class TurnierNichtErreichbar extends Error {
  constructor(url: string, grund: string) {
    super('Turnier-Server nicht erreichbar (' + url + '): ' + grund);
    this.name = 'TurnierNichtErreichbar';
  }
}

export class TurnierAbgelehnt extends Error {
  constructor(grund: string) {
    super('Turnier-Server hat abgelehnt: ' + grund);
    this.name = 'TurnierAbgelehnt';
  }
}

/* --------------------------------------------------------------------- lesen */

export async function ladeZustand(basis = TURNIER_URL): Promise<TurnierZustand> {
  let res: Response;
  try {
    res = await fetch(basis + '/api/state', { signal: AbortSignal.timeout(TURNIER_TIMEOUT_MS) });
  } catch (err) {
    throw new TurnierNichtErreichbar(basis, (err as Error).message);
  }
  if (!res.ok) throw new TurnierNichtErreichbar(basis, 'HTTP ' + res.status);

  const daten = (await res.json()) as {
    kartei?: Array<{ id: string; name: string; aliases?: unknown }>;
    listen?: {
      fenster?: number;
      voll?: number;
      spiele?: Array<{
        id: string; name: string; eintraege: number;
        letzte?: Array<{ id: string; name: string; points: number; ts: number }>;
      }>;
    };
  };

  /*
     aliases liefert der Server erst seit der Ergaenzung in
     tournament.js:770. Laeuft dort noch eine aeltere Fassung, fehlt das
     Feld - dann arbeiten wir ohne Aliase weiter, statt abzustuerzen. Der
     Abgleich findet dann nur Hauptnamen, was die alte Lage ist.
  */
  const kartei = (daten.kartei ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    aliases: Array.isArray(p.aliases) ? p.aliases.filter((a): a is string => typeof a === 'string') : []
  }));

  /*
     points/ts heissen hier punkte/zeit - im ganzen Projekt sind die
     Feldnamen deutsch, und die Umbenennung gehoert an die Naht zum
     Server, nicht in jede Anzeige.
  */
  const spiele: Spiel[] = (daten.listen?.spiele ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    eintraege: s.eintraege,
    letzte: (Array.isArray(s.letzte) ? s.letzte : []).map((e) => ({
      id: String(e.id),
      name: String(e.name),
      punkte: Number(e.points),
      zeit: Number(e.ts)
    }))
  }));

  return {
    kartei,
    spiele,
    fenster: daten.listen?.fenster ?? 10,
    voll: daten.listen?.voll ?? 10
  };
}

/**
 * Sucht die gameId zur konfigurierten Punkteliste.
 *
 * Ueber den Namen und nicht ueber eine fest eingetragene ID, damit ein
 * Umbenennen im Admin nichts kaputt macht. Wird die Liste nicht gefunden,
 * ist das ein harter Fehler - wir legen sie NICHT selbst an, weil eine
 * versehentlich erzeugte zweite Liste "Meccha 2026 " (mit Leerzeichen)
 * die Wertung stillschweigend spalten wuerde.
 */
export function findeSpiel(zustand: TurnierZustand, name = SPIEL_NAME): Spiel {
  const gesucht = name.trim().toLowerCase();
  const treffer = zustand.spiele.filter((s) => s.name.trim().toLowerCase() === gesucht);

  if (treffer.length === 1) return treffer[0]!;

  const vorhanden = zustand.spiele.map((s) => s.name).join(', ') || '(keine)';
  if (treffer.length === 0) {
    throw new TurnierAbgelehnt(
      'Punkteliste "' + name + '" gibt es nicht. Vorhanden: ' + vorhanden +
      '. Im Admin anlegen oder MC_SPIEL anders setzen.'
    );
  }
  throw new TurnierAbgelehnt(
    'Punkteliste "' + name + '" gibt es mehrfach. Im Admin eindeutig benennen.'
  );
}

/* -------------------------------------------------------------------- eintragen */

export interface Eintrag {
  /** Der Name, wie er in der Kartei steht - nicht der OCR-Rohname. */
  readonly name: string;
  readonly punkte: number;
}

/**
 * Traegt einen Eintrag in die Punkteliste ein.
 *
 * WICHTIG: hier gehoert immer der Kartei-Name hin, den namen.ts zugeordnet
 * hat, niemals der Rohname von OCR. Sonst legt ensurePerson() im Server
 * eine neue Person an und die Punkte landen bei einem Phantom.
 */
export async function trageEin(
  gameId: string,
  eintrag: Eintrag,
  basis = TURNIER_URL
): Promise<void> {
  const kopf: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TURNIER_KEY) kopf['x-admin-key'] = TURNIER_KEY;

  let res: Response;
  try {
    res = await fetch(basis + '/api/action', {
      method: 'POST',
      headers: kopf,
      body: JSON.stringify({
        type: 'liste.entry.add',
        gameId,
        name: eintrag.name,
        points: eintrag.punkte
      }),
      signal: AbortSignal.timeout(TURNIER_TIMEOUT_MS)
    });
  } catch (err) {
    throw new TurnierNichtErreichbar(basis, (err as Error).message);
  }

  if (res.status === 401) {
    throw new TurnierAbgelehnt('Falscher Admin-Key - stimmt TURNIER_KEY in der START.bat?');
  }

  const antwort = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

  if (!res.ok || !antwort || antwort.ok === false) {
    throw new TurnierAbgelehnt(antwort?.error || 'HTTP ' + res.status);
  }
}

/* ----------------------------------------------------------------- Verknuepfen

   Der Ingame-Name und der Name in der Kartei sind meist NICHT gleich: die
   Kartei fuehrt "theRealBaloou", im Spiel steht "Baloou". Levenshtein hilft
   da nicht (Distanz 7), das muss einmal von Hand verknuepft werden.

   Dafuer braucht es keine neue Datenstruktur - turnier/kartei.js:47 sucht
   schon ueber  p.key === key || p.aliases.includes(key). Und beim
   Zusammenfuehren wandern alle Schluessel der aufgeloesten Person in die
   Aliase (kartei.js:119). Also:

     1. kartei.add mit dem Ingame-Namen   -> neue Person "Baloou"
     2. kartei.merge in die echte Person  -> "baloou" wird deren Alias

   Ab dann findet liste.entry.add mit "Baloou" direkt theRealBaloou.
   ---------------------------------------------------------------------- */

/** Schickt eine beliebige Action und prueft die Antwort. */
async function sendeAction(
  action: Record<string, unknown>,
  basis: string
): Promise<void> {
  const kopf: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TURNIER_KEY) kopf['x-admin-key'] = TURNIER_KEY;

  let res: Response;
  try {
    res = await fetch(basis + '/api/action', {
      method: 'POST', headers: kopf, body: JSON.stringify(action),
      signal: AbortSignal.timeout(TURNIER_TIMEOUT_MS)
    });
  } catch (err) {
    throw new TurnierNichtErreichbar(basis, (err as Error).message);
  }

  if (res.status === 401) {
    throw new TurnierAbgelehnt('Falscher Admin-Key - stimmt TURNIER_KEY in der START.bat?');
  }

  const antwort = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !antwort || antwort.ok === false) {
    throw new TurnierAbgelehnt(antwort?.error || 'HTTP ' + res.status);
  }
}

/** Legt eine Person in der Kartei an (kartei.add). */
export async function legeKarteiAn(name: string, basis = TURNIER_URL): Promise<void> {
  await sendeAction({ type: 'kartei.add', name }, basis);
}

/**
 * Fuehrt zwei Karteipersonen zusammen (kartei.merge).
 *
 * fromId verschwindet, ihre Schluessel werden Aliase von intoId. Die
 * Richtung ist also wichtig: der INGAME-Name ist das from, die echte
 * Person das into - sonst heisst der Spieler hinterher "Baloou" statt
 * "theRealBaloou".
 */
export async function verknuepfe(
  ingameId: string,
  echtePersonId: string,
  basis = TURNIER_URL
): Promise<void> {
  await sendeAction({ type: 'kartei.merge', fromId: ingameId, intoId: echtePersonId }, basis);
}
