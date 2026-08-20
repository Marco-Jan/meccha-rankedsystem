/* =========================================================================
   NAMENSABGLEICH - welche Zeile im Scoreboard gehoert zu welchem Konto.

   Das ist das heikelste Stueck des ganzen Projekts. Der Leser liefert
   Rohnamen, wie sie aus dem Bild kommen: "N0rikoTv" statt "NorikoTv",
   "Ba1oou" statt "Baloou". Wuerden die ungeprueft gewertet, bekaeme
   entweder der Falsche die Punkte oder niemand.

   Deshalb wird hier VOR dem Eintragen zugeordnet, und alles Unsichere
   geht in die Rueckfrage statt in die Wertung. Im Zweifel lieber
   nachfragen - eine falsche Zuordnung faellt niemandem auf, eine
   Rueckfrage schon.

   Verglichen wird gegen die INGAME-NAMEN der angemeldeten Konten
   (konten.ts). Wer nicht angemeldet ist, wird nicht gewertet - das ist
   die Regel, nicht ein Mangel.

   -------------------------------------------------------------------------
   ACHTUNG, zwei verschiedene Normalformen - das ist Absicht:

   1) nameKey()  ist die milde Form: trim + lowercase + Leerzeichen
      zusammenziehen. Satzzeichen, Unterstriche und Emoji bleiben stehen.
      Zeichengleich zu ingameSchluessel() in konten.ts - dort entscheidet
      sie darueber, ob ein Ingame-Name schon vergeben ist. Laufen die zwei
      auseinander, koennten sich zwei Konten denselben Namen teilen und
      beide dieselbe Zeile beanspruchen.

   2) hartNormalisiert() ist die aggressive Form. Sie wirft alles weg, was
      kein Buchstabe und keine Ziffer ist, und dient nur dazu, Kandidaten
      zu FINDEN ("Baloou!" soll "Baloou" treffen). Sie wird nie
      gespeichert und nie angezeigt.
   ========================================================================= */

/**
 * Milde Vergleichsform. Zeichengleich zu ingameSchluessel() in konten.ts.
 * Nicht "verbessern" - die Gleichheit ist der ganze Zweck.
 */
export function nameKey(name: string): string {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

/*
   \p{L} laesst ausdruecklich Umlaute und nichtlateinische Schriften
   stehen: "Mueller" darf nicht zu "mller" werden, und japanische Namen
   sollen ueberleben. Weg muss die Deko, die niemand zweimal gleich
   tippt und die OCR ohnehin unzuverlaessig liest - xX_ _Xx, Klammern,
   Emoji, Punkte.
*/
const NUR_BUCHSTABEN_UND_ZIFFERN = /[^\p{L}\p{N}]/gu;

/** Aggressive Vergleichsform, nur fuer die Kandidatensuche. */
export function hartNormalisiert(name: string): string {
  return String(name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(NUR_BUCHSTABEN_UND_ZIFFERN, '');
}

/* ------------------------------------------------------------- Levenshtein */

/**
 * Editierdistanz mit Obergrenze.
 *
 * Bricht ab, sobald die Grenze ueberschritten ist - bei ~50 Karteinamen
 * ist das nicht noetig, macht die Absicht aber deutlich: uns interessiert
 * nur, OB es nah ist, nicht wie fern es genau liegt.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let vorige: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let aktuelle: number[] = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    aktuelle[0] = i;
    let zeilenMin = i;

    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      const wert = Math.min(
        (aktuelle[j - 1] ?? 0) + 1,        // einfuegen
        (vorige[j] ?? 0) + 1,              // loeschen
        (vorige[j - 1] ?? 0) + kosten      // ersetzen
      );
      aktuelle[j] = wert;
      if (wert < zeilenMin) zeilenMin = wert;
    }

    // Keine Zelle der Zeile liegt noch unter der Grenze: es kann nur
    // schlimmer werden, also aufhoeren.
    if (zeilenMin > max) return max + 1;

    const tausch = vorige;
    vorige = aktuelle;
    aktuelle = tausch;
  }

  return vorige[b.length] ?? 0;
}

/* ---------------------------------------------------------------- Zuordnung */

export interface Spieler {
  /** Die Kennung des Kontos (konten.ts), an der die Wertung haengt. */
  readonly id: string;
  /** Der Ingame-Name - genau so, wie er im Scoreboard steht. */
  readonly name: string;
  /**
   * Weitere Schreibweisen, die ebenfalls auf diese Person zeigen sollen.
   *
   * Heute vergibt niemand welche: jeder traegt seinen Ingame-Namen auf
   * der Kontoseite selbst ein, und der ist ueber alle Konten eindeutig.
   * Das Feld bleibt trotzdem, weil der Abgleich es ohnehin mitliest -
   * sollte ein Spieler im Spiel je unter zwei Namen auftauchen, ist es
   * ein Eintrag am Konto und keine Aenderung hier.
   *
   * Wichtig, falls es je benutzt wird: die Formen stehen SCHON in
   * nameKey-Form ("baloou", nicht "Baloou") und duerfen nicht noch
   * einmal hindurch.
   */
  readonly aliases?: readonly string[];
}

/** nameKey-Formen, unter denen eine Person zu finden ist. */
function alleSchluessel(person: Spieler): string[] {
  return [nameKey(person.name), ...(person.aliases ?? [])];
}

/** Hart normalisierte Formen aller Namen einer Person. */
function alleHartformen(person: Spieler): string[] {
  return alleSchluessel(person).map(hartNormalisiert).filter((h) => h.length > 0);
}

export type Zuordnung =
  /** nameKey-Treffer. So sicher wie es geht. */
  | { readonly art: 'exakt'; readonly person: Spieler; readonly confidence: 1 }
  /** Gleich nach Wegwerfen der Deko ("Baloou!" -> "Baloou"). */
  | { readonly art: 'normalisiert'; readonly person: Spieler; readonly confidence: number }
  /** Nah dran und eindeutig. */
  | { readonly art: 'fuzzy'; readonly person: Spieler; readonly confidence: number; readonly distanz: number }
  /** Mehrere gleich nahe Kandidaten - darf NICHT geraten werden. */
  | { readonly art: 'mehrdeutig'; readonly kandidaten: readonly Spieler[] }
  /** Niemand ist nahe genug. Neuer Spieler oder OCR-Muell. */
  | { readonly art: 'unbekannt' };

/** Zuordnungen mit dieser Art dürfen automatisch eingetragen werden. */
const SICHER = new Set(['exakt', 'normalisiert', 'fuzzy']);

export function istSicher(z: Zuordnung): boolean {
  return SICHER.has(z.art);
}

/*
   Wie viel Abweichung noch als "derselbe Name" gilt - abhaengig von der
   Laenge, weil es um den ANTEIL geht, nicht um die absolute Zahl.

   Bei bis zu 4 Zeichen ist gar keine Abweichung erlaubt: "Tom" und "Tim"
   liegen nur 1 auseinander und sind trotzdem verschiedene Leute. Kurze
   Namen gehen bei einem Lesefehler also in die Rueckfrage - genau richtig,
   denn eine falsche Zuordnung waere hier besonders wahrscheinlich.

   Ab 9 Zeichen sind 2 harmlos: da reicht ein verlesenes l/1 plus ein O/0,
   und die Wahrscheinlichkeit, dass zwei echte Namen so nah liegen, ist
   verschwindend.
*/
function maxDistanz(laenge: number): number {
  if (laenge <= 4) return 0;
  if (laenge <= 8) return 1;
  return 2;
}

/**
 * Ordnet einen von OCR gelesenen Namen einer Person aus der Kartei zu.
 *
 * Reihenfolge ist bewusst: erst das Sichere, dann das Wahrscheinliche.
 * Sobald eine Stufe eindeutig trifft, wird nicht weitergesucht.
 */
export function ordneZu(ocrName: string, kartei: readonly Spieler[]): Zuordnung {
  const key = nameKey(ocrName);

  /*
     Stufe 1: exakt, genau wie kartei.findByName() im Server - und das
     prueft ausdruecklich auch die Aliase. Waere das hier nur der
     Hauptname, wuerde der Feeder einen verknuepften Ingame-Namen abweisen,
     den der Server anschliessend problemlos aufgeloest haette.
  */
  for (const person of kartei) {
    if (alleSchluessel(person).includes(key)) {
      return { art: 'exakt', person, confidence: 1 };
    }
  }

  const hart = hartNormalisiert(ocrName);
  // Ein Name, der nur aus Deko besteht, ist nach dem Wegwerfen leer. Damit
  // laesst sich nichts vergleichen - das ist ein Fall fuer die Rueckfrage.
  if (hart.length === 0) return { art: 'unbekannt' };

  // Stufe 2: gleich, sobald die Deko weg ist - Aliase eingeschlossen.
  const hartTreffer = kartei.filter((p) => alleHartformen(p).includes(hart));
  if (hartTreffer.length === 1) {
    const person = hartTreffer[0]!;
    return { art: 'normalisiert', person, confidence: 0.95 };
  }
  if (hartTreffer.length > 1) {
    // Zwei Karteinamen, die sich nur in der Deko unterscheiden. Raten
    // waere hier besonders schaedlich, weil beide plausibel sind.
    return { art: 'mehrdeutig', kandidaten: hartTreffer };
  }

  // Stufe 3: nah dran. Nur eindeutige Treffer zaehlen.
  const grenze = maxDistanz(hart.length);
  let beste = grenze + 1;
  let nahe: Spieler[] = [];

  for (const person of kartei) {
    // Die beste Distanz ueber alle Namen dieser Person - ein Alias darf
    // genauso treffen wie der Hauptname.
    let d = grenze + 1;
    for (const form of alleHartformen(person)) {
      d = Math.min(d, levenshtein(hart, form, grenze));
    }
    if (d > grenze) continue;
    if (d < beste) {
      beste = d;
      nahe = [person];
    } else if (d === beste) {
      nahe.push(person);
    }
  }

  if (nahe.length === 1) {
    const person = nahe[0]!;
    // Je naeher, desto sicherer - bleibt aber immer unter dem
    // normalisierten Treffer, weil hier wirklich geraten wird.
    const confidence = beste === 1 ? 0.85 : 0.7;
    return { art: 'fuzzy', person, confidence, distanz: beste };
  }
  if (nahe.length > 1) {
    return { art: 'mehrdeutig', kandidaten: nahe };
  }

  return { art: 'unbekannt' };
}
