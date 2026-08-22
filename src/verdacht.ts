/* =========================================================================
   VERDACHT - dieselbe Punktzahl schon wieder.

   Was bisher geprueft wurde, faengt drei Wege ab:

     Bild-Hash          derselbe Screenshot nochmal
     Bildpruefung       in einem Malprogramm bearbeitet
     Partie-Kennung     dieselbe Lobby-Runde nochmal, auch mit anderem Bild

   Ein Weg blieb offen, und es ist der geduldige: jemand faelscht immer
   wieder SEINE EIGENE Zeile auf denselben Wert, spielt aber echte
   Runden mit wechselnden Mitspielern. Jede Partie-Kennung ist dann
   anders, jedes Bild ist frisch aufgenommen, jeder Hash neu - und
   trotzdem steht dreimal exakt 11 714 in der Liste.

   Zwei Punktzahlen ueber 1000 werden nicht zufaellig gleich. Genau da
   setzt diese Pruefung an.

   -------------------------------------------------------------------------
   WORAN DIE PERSON ERKANNT WIRD

   Am beanspruchten INGAME-NAMEN, nicht am Absendernamen und nicht am
   Token. Der Ingame-Name ist ueber alle Konten eindeutig (siehe
   konten.ts) und entscheidet, welche Zeile gewertet wird - er ist
   also genau das, was jemand nicht mal eben wechseln kann. Ein neuer
   Token oder ein geaenderter Anzeigename fuehren nicht an dieser
   Pruefung vorbei.

   -------------------------------------------------------------------------
   WAS DABEI NICHT PASSIERT

   Nichts wird automatisch abgelehnt. Der Verdacht sorgt dafuer, dass die
   Runde bei DIR landet statt durchzulaufen, und dass das Bild
   aufgehoben wird. Entschieden wird von Hand - es gibt harmlose Gruende
   fuer eine Wiederholung, und ein Automat, der ehrliche Leute
   aussperrt, waere schlimmer als der Betrug.
   ========================================================================= */

import { nameKey } from './namen.js';
import type { RohZeile } from './parse.js';
import type { OffeneRunde } from './freigabe.js';

/**
 * Ab welcher Punktzahl eine Wiederholung auffaellig ist.
 *
 * Darunter wiederholen sich Werte ehrlich - wer eine Runde frueh
 * verlaesst, hat oft dieselbe kleine Zahl. Und mit Kleinkram kommt in
 * der Wertung ohnehin niemand weit, das Faelschen lohnt dort nicht.
 */
export const VERDACHT_AB_PUNKTEN = Number(process.env.MC_VERDACHT_AB || 1000);

/** Wie weit zurueckgeschaut wird. */
export const VERDACHT_TAGE = Number(process.env.MC_VERDACHT_TAGE || 30);

export interface Verdachtsfall {
  /** true, wenn die Runde deshalb zur Pruefung soll. */
  readonly geflaggt: boolean;
  /** Verstaendliche Begruendungen - sie stehen so auf der Freigabekarte. */
  readonly gruende: readonly string[];
  /**
   * Die Runden, mit denen verglichen wurde.
   *
   * Ein Satz wie "3. Mal mit exakt 11714 Punkten" ist eine Behauptung -
   * pruefen kann man sie erst, wenn die alten Bilder danebenliegen.
   * Deshalb kommen die Runden selbst mit zurueck und nicht nur der Text.
   */
  readonly treffer: readonly OffeneRunde[];
}

/** Was von einer Runde fuer die Pruefung gebraucht wird. */
export interface Einreichung {
  readonly zeilen: readonly RohZeile[];
  /** Normalisierte Namen der Zeilen, die gewertet werden sollen. */
  readonly beansprucht?: readonly string[] | undefined;
}

function tageHer(von: number, bis: number): number {
  return Math.round((bis - von) / (24 * 60 * 60 * 1000));
}

function alter(von: number, bis: number): string {
  const tage = tageHer(von, bis);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  return 'vor ' + tage + ' Tagen';
}

/**
 * Sucht nach Wiederholungen derselben Punktzahl.
 *
 * frueher sind die bereits abgelegten Runden - abgelehnte zaehlen
 * ausdruecklich mit. Wer schon einmal abgelehnt wurde und es erneut
 * versucht, ist der Fall, um den es hier geht.
 */
export function pruefeVerdacht(
  frueher: readonly OffeneRunde[],
  neu: Einreichung,
  jetzt = Date.now()
): Verdachtsfall {

  const grenze = jetzt - VERDACHT_TAGE * 24 * 60 * 60 * 1000;
  const gruende: string[] = [];
  const alleTreffer: OffeneRunde[] = [];

  // Nur die Zeilen, die dieser Absender fuer sich beansprucht. Die
  // Punktzahlen der Mitspieler gehoeren ihm nicht.
  const meine = neu.zeilen.filter((z) => {
    if (z.punkte === null) return false;
    if (z.punkte.punkte < VERDACHT_AB_PUNKTEN) return false;
    if (neu.beansprucht === undefined) return true;
    return neu.beansprucht.includes(nameKey(z.rohName));
  });

  for (const zeile of meine) {
    const punkte = zeile.punkte!.punkte;
    const wer = nameKey(zeile.rohName);

    /* Dieselbe Person, dieselbe Punktzahl, innerhalb des Fensters. Die
       Person haengt am Ingame-Namen, nicht am Absender - siehe Kopf. */
    const treffer = frueher.filter((r) => {
      if (r.eingegangen < grenze) return false;
      return r.zeilen.some((z) =>
        z.punkte !== null &&
        z.punkte.punkte === punkte &&
        nameKey(z.rohName) === wer &&
        (r.beansprucht === undefined || r.beansprucht.includes(wer))
      );
    });

    if (treffer.length === 0) continue;
    for (const t of treffer) if (!alleTreffer.includes(t)) alleTreffer.push(t);

    // Der juengste Treffer ist der aussagekraeftigste - er steht im Text.
    const letzter = treffer.reduce((a, b) => (a.eingegangen > b.eingegangen ? a : b));
    const wieOft = treffer.length + 1;

    gruende.push(
      wieOft + '. Mal mit exakt ' + punkte + ' Punkten fuer ' + zeile.rohName +
      ' - zuletzt ' + alter(letzter.eingegangen, jetzt) +
      ' (' + statusWort(letzter.status) + ')'
    );
  }

  return { geflaggt: gruende.length > 0, gruende, treffer: alleTreffer };
}

function statusWort(s: OffeneRunde['status']): string {
  if (s === 'freigegeben') return 'freigegeben';
  if (s === 'abgelehnt') return 'damals abgelehnt';
  return 'noch offen';
}

/**
 * Frueher abgelehnte Einreichungen derselben Person.
 *
 * Kein eigener Flag-Grund - sonst haenge jemandem ein einzelner
 * Fehlgriff dauerhaft an. Aber es gehoert auf die Karte, damit eine
 * Ablehnung nicht in der Historie versinkt und beim naechsten Mal
 * niemand mehr davon weiss.
 */
export function fruehereAblehnungen(
  frueher: readonly OffeneRunde[],
  beansprucht: readonly string[] | undefined,
  jetzt = Date.now()
): string | null {

  if (beansprucht === undefined || beansprucht.length === 0) return null;
  const grenze = jetzt - VERDACHT_TAGE * 24 * 60 * 60 * 1000;

  const abgelehnt = frueher.filter((r) =>
    r.status === 'abgelehnt' &&
    r.eingegangen >= grenze &&
    (r.beansprucht ?? []).some((n) => beansprucht.includes(n))
  );

  if (abgelehnt.length === 0) return null;
  return abgelehnt.length === 1
    ? 'Von dieser Person wurde schon einmal eine Runde abgelehnt'
    : 'Von dieser Person wurden schon ' + abgelehnt.length + ' Runden abgelehnt';
}

/* =========================================================================
   DER VERLAUF EINER PERSON

   Fuer die Freigabekarte: was hat diese Person zuletzt eingereicht, und
   was ist daraus geworden? Beim Entscheiden ist das die Frage, die man
   sonst von Hand in der Historie nachschlaegt - "sind 11 714 fuer den
   plausibel, oder lag der bisher immer bei 400?".

   Bewusst die EIGENEN Einreichungen und nicht die Eintraege aus der
   Punkteliste: hier stehen auch die abgelehnten und die noch offenen
   drin, und genau die fehlen drueben.
   ========================================================================= */

export interface Verlaufseintrag {
  readonly punkte: number;
  readonly status: OffeneRunde['status'];
  readonly eingegangen: number;
}

export function verlaufVon(
  frueher: readonly OffeneRunde[],
  beansprucht: readonly string[] | undefined,
  grenze = 5
): readonly Verlaufseintrag[] {

  if (beansprucht === undefined || beansprucht.length === 0) return [];

  const raus: Verlaufseintrag[] = [];

  for (const r of frueher) {
    const meine = (r.beansprucht ?? []).filter((n) => beansprucht.includes(n));
    if (meine.length === 0) continue;

    for (const z of r.zeilen) {
      if (z.punkte === null) continue;
      if (!meine.includes(nameKey(z.rohName))) continue;
      raus.push({ punkte: z.punkte.punkte, status: r.status, eingegangen: r.eingegangen });
    }
  }

  // Neueste zuerst - beim Pruefen interessiert das Letzte am meisten.
  return raus.sort((a, b) => b.eingegangen - a.eingegangen).slice(0, grenze);
}

/* =========================================================================
   DIESELBE PARTIE, ZWEI VERSCHIEDENE NAMEN AUF DERSELBEN ZEILE

   Das Verfahren hat eine Grenze, die es nicht ueberwinden kann: ein Bild
   vom Bildschirm ist immer echt. Wer seinen Namen VOR der Aufnahme ueber
   eine fremde Zeile legt, liefert eine tadellose PNG-Datei ab - jede
   Pruefung an der Datei geht daran vorbei, und innerhalb des Bildes ist
   nichts widersprüchlich. Genau das ist am 21.08.2026 vorgefuehrt worden.

   Was es doch verraet: die anderen. Zwei Leute aus derselben Lobby sehen
   DASSELBE Scoreboard. Die Partie-Kennung entsteht aus den Punktzahlen
   und ist deshalb bei beiden gleich - aber auf dem einen Bild traegt die
   Zeile mit 1 643 einen anderen Namen als auf dem anderen. Einer der
   beiden hat gefaelscht, und welcher, sieht man daran, dass die uebrigen
   zehn Zeilen uebereinstimmen.

   Das ist kein Verdacht, sondern ein Widerspruch. Trotzdem wird nur
   geflaggt, nicht abgewiesen: welche der beiden Einsendungen die echte
   ist, entscheidet ein Mensch am Bild.

   WARUM UEBER DIE KONTEN UND NICHT UEBER DIE ROHNAMEN

   Die Erkennung verliest Namen staendig - "Hupferli" statt "Hüpferli",
   "B8166u" statt "Baloou". Wer rohe Zeichenketten vergleicht, findet
   Widersprueche, wo nur die Schrift schwer lesbar war. Ein Widerspruch
   zaehlt deshalb nur, wenn beide Namen SICHER auf je ein Konto zeigen -
   und auf zwei verschiedene.
   ========================================================================= */

/**
 * Eine Zeile, wie sie fuer den Vergleich gebraucht wird.
 *
 * punkte ist ein OBJEKT, keine Zahl - RohZeile traegt dort das Ergebnis
 * des Parsens mitsamt "unsicher". Wer das uebersieht, vergleicht eine
 * Zahl mit einem Objekt, und der Test greift nie. Genau so ist es beim
 * ersten Lauf passiert.
 */
interface Vergleichszeile {
  readonly rohName: string;
  readonly punkte: { readonly punkte: number } | null;
}

/**
 * Widerspricht die neue Einsendung einer frueheren derselben Partie?
 *
 * meinePunkte ist die Punktzahl, die der Absender fuer sich beansprucht.
 * Nur um die geht es: was die Mitspieler auf ihren Zeilen haben, ist
 * nicht seine Sache und faellt in beiden Bildern gleich aus.
 */
export function pruefeLobbyWiderspruch(
  frueher: readonly OffeneRunde[],
  meinKontoId: string,
  meinePunkte: number,
  wemGehoert: (rohName: string) => string | null
): string[] {
  const gruende: string[] = [];

  for (const r of frueher) {
    for (const z of (r.zeilen ?? []) as readonly Vergleichszeile[]) {
      if (z.punkte?.punkte !== meinePunkte) continue;

      const anderer = wemGehoert(z.rohName);
      // Nicht zuzuordnen - dann sagt die Zeile nichts. Ein Aussteiger
      // ("?") landet ebenfalls hier, und das ist richtig so.
      if (!anderer || anderer === meinKontoId) continue;

      gruende.push(
        'Widerspruch: dieselbe Partie wurde von ' + r.absender +
        ' eingeschickt, dort gehoert die Zeile mit ' + meinePunkte +
        ' Punkten einem anderen Konto'
      );
      return gruende;      // Einer genuegt - ein Mensch sieht ohnehin hin.
    }
  }
  return gruende;
}
