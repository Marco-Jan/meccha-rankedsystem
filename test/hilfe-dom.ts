/* =========================================================================
   EIN WINZIGES DOM, damit die Kontoseite wirklich LAEUFT.

   Der Grund steht in zwei Fehlern, die beide durchgerutscht sind:

     - "kein Element mit id ..." - ein Zugriff auf etwas, das im HTML
       gar nicht steht
     - kopfDaten.voll in einer Funktion, in der es kopfDaten nicht gibt

   Beide waren syntaktisch tadellos. Der Typecheck sieht in die
   Zeichenkette nicht hinein, und Tests, die im Quelltext nach Mustern
   suchen, koennen so etwas nicht finden - sie pruefen, DASS etwas
   dasteht, nicht ob es funktioniert.

   Ein echtes DOM waere eine Abhaengigkeit (jsdom), und dieses Projekt
   hat bewusst keine. Also das Wenige selbst: was das Skript
   tatsaechlich anfasst, mehr nicht. Es muss nicht schoen sein, es muss
   einen ReferenceError ausloesen, wenn einer drin ist.
   ========================================================================= */

/** Ein Knoten. Genug fuer alles, was die Seite baut. */
export class Knoten {
  readonly kinder: Knoten[] = [];
  className = '';
  id = '';
  href = '';
  value = '';
  title = '';
  type = '';
  checked = false;
  disabled = false;
  loading = '';
  alt = '';
  src = '';
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  private eigenText = '';
  private attribute: Record<string, string> = {};
  elternteil: Knoten | null = null;

  constructor(public readonly tagName: string, private readonly seite?: Seite) {}

  /** Wie im Browser: setzen ersetzt alles, lesen fasst zusammen. */
  get textContent(): string {
    if (this.kinder.length === 0) return this.eigenText;
    return this.eigenText + this.kinder.map((k) => k.textContent).join('');
  }
  set textContent(t: string) {
    this.kinder.length = 0;
    this.eigenText = String(t);
  }

  set innerHTML(t: string) {
    this.kinder.length = 0;
    this.eigenText = '';
    if (t) this.eigenText = String(t);
  }
  get innerHTML(): string { return this.textContent; }

  appendChild(k: Knoten): Knoten {
    k.elternteil = this;
    this.kinder.push(k);
    if (k.id && this.seite) this.seite.merke(k);
    return k;
  }

  insertBefore(neu: Knoten, vor: Knoten | null): Knoten {
    const i = vor ? this.kinder.indexOf(vor) : -1;
    if (i < 0) return this.appendChild(neu);
    neu.elternteil = this;
    this.kinder.splice(i, 0, neu);
    return neu;
  }

  remove(): void {
    if (!this.elternteil) return;
    const i = this.elternteil.kinder.indexOf(this);
    if (i >= 0) this.elternteil.kinder.splice(i, 1);
    this.elternteil = null;
  }

  setAttribute(name: string, wert: string): void { this.attribute[name] = String(wert); }
  getAttribute(name: string): string | null { return this.attribute[name] ?? null; }
  removeAttribute(name: string): void { delete this.attribute[name]; }

  addEventListener(): void { /* Klicks pruefen wir hier nicht */ }
  removeEventListener(): void { /* dito */ }
  focus(): void { /* dito */ }
  select(): void { /* dito */ }
  closest(): Knoten | null { return null; }

  /** Nur die zwei Formen, die die Seite benutzt: '#id' und 'tag' bzw. '.klasse'. */
  querySelectorAll(wahl: string): Knoten[] {
    const treffer: Knoten[] = [];
    const passt = (k: Knoten): boolean => {
      if (wahl.startsWith('.')) return k.className.split(/\s+/).includes(wahl.slice(1));
      if (wahl.startsWith('[')) {
        const name = wahl.slice(1, -1).split('=')[0]!;
        return k.getAttribute(name) !== null;
      }
      if (wahl.includes(' ')) {
        // "#reiter button" o.ae. - auf den letzten Teil reduzieren
        return passtAufTag(k, wahl.split(/\s+/).pop()!);
      }
      return passtAufTag(k, wahl);
    };
    const lauf = (k: Knoten): void => {
      for (const kind of k.kinder) {
        if (passt(kind)) treffer.push(kind);
        lauf(kind);
      }
    };
    lauf(this);
    return treffer;
  }

  querySelector(wahl: string): Knoten | null {
    return this.querySelectorAll(wahl)[0] ?? null;
  }

  /** Tabellen: das Skript spricht tBodies[0] an. */
  get tBodies(): Knoten[] {
    return this.kinder.filter((k) => k.tagName === 'tbody');
  }
}

function passtAufTag(k: Knoten, wahl: string): boolean {
  if (wahl.startsWith('.')) return k.className.split(/\s+/).includes(wahl.slice(1));
  return k.tagName === wahl.toLowerCase();
}

/* --------------------------------------------------------------- Seite */

export interface Antworten {
  [pfad: string]: unknown;
}

/**
 * Eine Seite: das gefaelschte DOM plus die gefaelschten Serverantworten.
 *
 * Die Antworten kommen als einfache Objekte herein - genau das, was der
 * echte Server als JSON schicken wuerde. Damit prueft der Test die Naht
 * zwischen API und Anzeige, und nicht bloss die Anzeige gegen sich
 * selbst.
 */
export class Seite {
  readonly koerper = new Knoten('body', this);
  private nachId = new Map<string, Knoten>();
  readonly gerufen: string[] = [];
  /** Was setInterval bekommen hat - zum Nachsehen, ob ein Takt laeuft. */
  readonly takte: Array<{ ms: number; fn: () => void }> = [];

  constructor(
    private readonly antworten: Antworten,
    idsAusHtml: readonly string[] = []
  ) {
    // Die Elemente, die im HTML stehen, gibt es von Anfang an.
    for (const id of idsAusHtml) {
      const k = new Knoten('div', this);
      k.id = id;
      this.nachId.set(id, k);
      this.koerper.kinder.push(k);
    }
  }

  merke(k: Knoten): void {
    if (k.id) this.nachId.set(k.id, k);
  }

  hole(id: string): Knoten | null {
    return this.nachId.get(id) ?? null;
  }

  /** Alles, was das Skript als Umgebung braucht. */
  umgebung(): Record<string, unknown> {
    const seite = this;

    const dokument = {
      hidden: false,
      documentElement: { lang: 'de' },
      body: this.koerper,
      createElement: (tag: string) => new Knoten(String(tag).toLowerCase(), seite),
      getElementById: (id: string) => seite.hole(id),
      querySelectorAll: (w: string) => seite.koerper.querySelectorAll(w),
      querySelector: (w: string) => seite.koerper.querySelector(w),
      addEventListener: () => { /* visibilitychange u.ae. */ }
    };

    const speicher = new Map<string, string>();

    return {
      document: dokument,
      localStorage: {
        getItem: (k: string) => speicher.get(k) ?? null,
        setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
        removeItem: (k: string) => { speicher.delete(k); }
      },
      location: { href: 'https://meccha-ranked.com/', search: '', assign: () => {} },
      navigator: { language: 'de-DE' },
      history: { replaceState: () => {}, pushState: () => {} },
      setInterval: (fn: () => void, ms: number) => { seite.takte.push({ ms, fn }); return 1; },
      clearInterval: () => {},
      setTimeout: (fn: () => void) => { fn(); return 1; },
      alert: () => {},
      confirm: () => true,

      /*
         Der gefaelschte Server. Unbekannte Pfade sind ein FEHLER und
         keine leere Antwort: ruft die Seite etwas auf, das es nicht
         gibt, soll der Test das sagen und nicht stillschweigend nichts
         anzeigen - genau so ist ein Fehler schon einmal durchgerutscht.
      */
      fetch: (pfad: string) => {
        const nur = String(pfad).split('?')[0]!;
        seite.gerufen.push(nur);
        if (!(nur in seite.antworten)) {
          return Promise.reject(new Error('Kein Testeintrag fuer ' + nur));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(seite.antworten[nur])
        });
      }
    };
  }
}

/**
 * Fuehrt das Skript der Kontoseite aus.
 *
 * Wirft es einen Fehler - etwa weil eine Variable ausserhalb ihres
 * Gueltigkeitsbereichs benutzt wird -, kommt der hier heraus und der
 * Test faellt. Genau das ist der Zweck.
 */
export async function fuehreAus(html: string, seite: Seite): Promise<void> {
  const anfang = html.indexOf('<script>');
  const ende = html.lastIndexOf('</script>');
  if (anfang < 0 || ende < 0) throw new Error('kein <script> in der Seite');

  const code = html.slice(anfang + '<script>'.length, ende);
  const umgebung = seite.umgebung();
  const namen = Object.keys(umgebung);

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(...namen, '"use strict";\n' + code);
  fn(...namen.map((n) => umgebung[n]));

  /* Die Seite laedt ueber Versprechen. Ein paar Runden der
     Ereignisschleife abwarten, sonst prueft man den Zustand von vor dem
     ersten fetch. */
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise((f) => setTimeout(f, 0));
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

/** Alle ids, die im HTML stehen - damit getElementById sie findet. */
export function idsAus(html: string): string[] {
  const raus: string[] = [];
  const muster = /\bid="([^"]+)"/g;
  let t: RegExpExecArray | null;
  while ((t = muster.exec(html)) !== null) raus.push(t[1]!);
  return raus;
}
