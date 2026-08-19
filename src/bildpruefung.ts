/* =========================================================================
   BILDPRUEFUNG - sieht das nach einer echten Bildschirmaufnahme aus?

   Kein Echtheitsbeweis, sondern eine Huerde. Wichtig zu verstehen, warum
   es keinen Beweis geben kann: der Client laeuft auf dem Rechner des
   Zuschauers. Wer will, umgeht ihn und schickt mit curl irgendein Bild.
   Ein Programm auf fremder Hardware kann fuer nichts buergen.

   Was trotzdem geht: erkennen, ob ein Bild NEU KODIERT wurde. Jede
   Bearbeitung - Paint, GIMP, Photoshop, auch nur neu abspeichern - muss
   das PNG neu schreiben, und jeder Kodierer hinterlaesst eine andere
   Signatur. Gemessen an einem echten Screenshot:

     Bildschirmaufnahme  IHDR sRGB gAMA pHYs IDAT(65445) IDAT(65524) ...
     neu abgespeichert   IHDR                IDAT(65536) IDAT(65536) ...

   Die Metadaten-Bloecke fehlen, und die Datenbloecke haben eine andere
   Groesse. Das ist ohne Weiteres zu sehen.

   WICHTIG: Auffaelligkeiten fuehren NICHT zur Ablehnung, sondern zu einem
   Hinweis auf der Freigabeseite. Ein anderer Windows-Stand oder ein
   anderes Aufnahmewerkzeug kodiert anders, ohne dass jemand betrogen
   hat - eine automatische Ablehnung wuerde ehrliche Leute aussperren.
   Die Entscheidung bleibt beim Menschen, so wie die ganze Freigabe.
   ========================================================================= */

export interface Bildbefund {
  /** Wie das Bild aussieht: PNG-Blocktypen in Reihenfolge. */
  readonly bloecke: readonly string[];
  /** true, wenn es aussieht wie eine frische Aufnahme. */
  readonly wirktEcht: boolean;
  /** Was aufgefallen ist - leer, wenn nichts. */
  readonly auffaelligkeiten: readonly string[];
}

/*
   Die Blocktypen, die eine Aufnahme ueber System.Drawing (so nimmt
   screenshot.ts auf) erzeugt. Fehlen sie, wurde das Bild von etwas
   anderem geschrieben.
*/
const ERWARTETE_METADATEN = ['sRGB', 'gAMA', 'pHYs'];

/*
   Groesster Datenblock, den eine Aufnahme ueber System.Drawing schreibt.
   Sie stueckelt die Bilddaten in Bloecke von hoechstens 64 KB - gemessen
   an einem echten Screenshot: 36 Bloecke, groesster 65524.

   Ein einzelner grosser Block heisst: ein anderer Kodierer hat das Bild
   geschrieben. Das ist das staerkere Signal gegenueber den Metadaten,
   weil Metadatenbloecke leicht zu ergaenzen sind, die Stueckelung aber
   tief im Kodierer sitzt.

   Aufgefallen ist das an einer echten Faelschung: dort stand EIN Block
   mit 1 651 840 Byte, wo die Aufnahme 36 Bloecke hat.
*/
export const MAX_IDAT = 65536;

/** Zerlegt ein PNG in seine Bloecke, ohne es zu dekodieren. */
export function pngBloecke(bild: Buffer): { typ: string; laenge: number }[] {
  const signatur = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bild.length < 8 || !bild.subarray(0, 8).equals(signatur)) return [];

  const bloecke: { typ: string; laenge: number }[] = [];
  let i = 8;
  // Obergrenze gegen ein absichtlich kaputtes Bild, das uns in eine
  // Endlosschleife schicken soll.
  while (i + 8 <= bild.length && bloecke.length < 10000) {
    const laenge = bild.readUInt32BE(i);
    const typ = bild.toString('ascii', i + 4, i + 8);
    bloecke.push({ typ, laenge });
    if (typ === 'IEND') break;
    // 4 Byte Laenge + 4 Byte Typ + Daten + 4 Byte Pruefsumme
    i += 12 + laenge;
  }
  return bloecke;
}

/**
 * Beurteilt, ob ein Bild wie eine frische Aufnahme aussieht.
 *
 * Nur fuer PNG. JPEG wird durchgewinkt: es ist von Natur aus neu kodiert,
 * da gibt es nichts zu unterscheiden.
 */
export function pruefeBild(bild: Buffer, medienTyp: string): Bildbefund {
  if (!medienTyp.includes('png')) {
    return {
      bloecke: [],
      wirktEcht: true,
      auffaelligkeiten: []
    };
  }

  const bloecke = pngBloecke(bild);
  const typen = bloecke.map((b) => b.typ);
  const auffaellig: string[] = [];

  if (bloecke.length === 0) {
    return {
      bloecke: [],
      wirktEcht: false,
      auffaelligkeiten: ['Keine gueltige PNG-Struktur']
    };
  }

  const fehlend = ERWARTETE_METADATEN.filter((m) => !typen.includes(m));
  if (fehlend.length === ERWARTETE_METADATEN.length) {
    // Alle drei fehlen: klassisches Muster fuer "neu abgespeichert".
    auffaelligkeiten_hinzu(auffaellig,
      'Alle Metadaten-Bloecke fehlen (' + ERWARTETE_METADATEN.join(', ') +
      ') - typisch fuer ein neu abgespeichertes Bild');
  } else if (fehlend.length > 0) {
    auffaelligkeiten_hinzu(auffaellig,
      'Metadaten-Bloecke fehlen: ' + fehlend.join(', '));
  }

  /*
     Stueckelung der Bilddaten. Siehe MAX_IDAT - das ist der Befund, an
     dem eine Faelschung am zuverlaessigsten haengenbleibt.
  */
  const idat = bloecke.filter((b) => b.typ === 'IDAT');
  const groesster = idat.reduce((m, b) => Math.max(m, b.laenge), 0);
  if (groesster > MAX_IDAT) {
    auffaelligkeiten_hinzu(auffaellig,
      'Datenblock mit ' + groesster.toLocaleString('de-DE') + ' Byte - eine Aufnahme ' +
      'stueckelt in Bloecke bis ' + MAX_IDAT.toLocaleString('de-DE') + ' Byte. ' +
      'Das Bild wurde von einem anderen Programm geschrieben.');
  }

  /*
     Bildbearbeitungsprogramme schreiben oft eigene Textbloecke mit dem
     Programmnamen. Ein Screenshot hat die nicht.
  */
  for (const verraeterisch of ['tEXt', 'iTXt', 'zTXt']) {
    if (typen.includes(verraeterisch)) {
      auffaelligkeiten_hinzu(auffaellig,
        'Textblock ' + verraeterisch + ' vorhanden - Bearbeitungsprogramme schreiben so etwas');
    }
  }

  return {
    bloecke: typen,
    wirktEcht: auffaellig.length === 0,
    auffaelligkeiten: auffaellig
  };
}

function auffaelligkeiten_hinzu(liste: string[], text: string): void {
  if (!liste.includes(text)) liste.push(text);
}
