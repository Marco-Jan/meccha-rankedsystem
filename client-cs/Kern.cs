/* =========================================================================
   MECCHA RANKED - Client fuer Zuschauer, Kernteil

   Gegen .NET Framework 4 uebersetzt, das auf jedem Windows liegt. Die
   fertige Datei braucht deshalb keine Installation und ist rund 50 KB
   gross.

   Vorher gab es einen Client aus Node mit Browseroberflaeche. Der
   funktionierte, hatte aber drei Nachteile, die erst im Betrieb
   auffielen: 77 MB gross, man konnte ihn nicht ordentlich schliessen,
   und weil er fensterlos lief, sprangen staendig PowerShell-Fenster in
   den Vordergrund. Hier gibt es all das nicht - Bildschirmaufnahme und
   Tastenabfrage sind in Windows eingebaut.
   ========================================================================= */

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace MecchaRanked
{
    static class Info
    {
        public const string Projekt = "Meccha Ranked";
        public const string Version = "0.3.0";
        public const string Entwickler = "Baloou";

        /* Wird beim Bauen ersetzt - siehe baue.ps1 und
           config/verteilung.json. Damit braucht ein Serverumzug keine
           Codeaenderung, nur einen Neubau. */
        public const string VorgabeServer = "http://localhost:8790";
    }

    /* ==================================================================
       EINSTELLUNGEN

       Dieselbe client.json wie beim alten Client - wer schon eine hat,
       kann sie behalten. Das JSON wird von Hand gelesen: fuer vier
       Felder lohnt keine Bibliothek, und so bleibt das Programm ohne
       Verweise auf Fremdbestandteile.
       ================================================================== */
    class Einstellungen
    {
        /*
           Die Serveradresse wird NICHT mehr aus client.json gelesen und
           auch nicht dorthin geschrieben. Sie steht fest in der .exe und
           kommt beim Bauen aus config/verteilung.json.

           Grund: der Zuschauer soll seine Runden nicht versehentlich -
           oder absichtlich - woandershin schicken koennen. Ein Umzug des
           Servers ist damit eine neue .exe und keine Bitte an alle,
           bitte mal eine Zeile in einer Datei zu aendern.
        */
        public readonly string Server = Info.VorgabeServer;
        public string Token = "";
        public int Bildschirm = 0;
        public string Taste = "F9";

        public bool Vollstaendig
        {
            // Der Server steht fest - einzurichten ist nur noch der Token.
            get { return !string.IsNullOrEmpty(Token); }
        }

        static string LiesFeld(string quelle, string name)
        {
            string marke = "\"" + name + "\"";
            int i = quelle.IndexOf(marke, StringComparison.Ordinal);
            if (i < 0) return null;
            i = quelle.IndexOf(':', i + marke.Length);
            if (i < 0) return null;
            i++;
            while (i < quelle.Length && char.IsWhiteSpace(quelle[i])) i++;
            if (i >= quelle.Length) return null;

            if (quelle[i] == '"')
            {
                int ende = quelle.IndexOf('"', i + 1);
                if (ende < 0) return null;
                return quelle.Substring(i + 1, ende - i - 1);
            }
            int stop = i;
            while (stop < quelle.Length && (char.IsDigit(quelle[stop]) || quelle[stop] == '-')) stop++;
            return quelle.Substring(i, stop - i);
        }

        public static Einstellungen Laden(string datei)
        {
            Einstellungen e = new Einstellungen();
            try
            {
                if (!File.Exists(datei)) return e;
                string roh = File.ReadAllText(datei, Encoding.UTF8);

                string token = LiesFeld(roh, "token");
                string schirm = LiesFeld(roh, "bildschirm");
                string taste = LiesFeld(roh, "taste");

                /* Platzhalter aus alten Vorlagen nicht als echte Werte
                   uebernehmen - sonst startet das Programm scheinbar
                   eingerichtet und scheitert erst beim Senden.

                   Ein "server" in einer alten client.json wird still
                   uebergangen: die Adresse steckt jetzt in der .exe. */
                if (!string.IsNullOrEmpty(token) && token.IndexOf("HIER-", StringComparison.Ordinal) < 0)
                    e.Token = token;
                if (!string.IsNullOrEmpty(taste)) e.Taste = taste.ToUpperInvariant();

                int n;
                if (int.TryParse(schirm, out n)) e.Bildschirm = n;
            }
            catch
            {
                /* Kaputte Datei: mit Vorgaben weitermachen, statt den
                   Zuschauer vor eine Fehlermeldung zu setzen. */
            }
            return e;
        }

        public void Speichern(string datei)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"token\": \"" + Fluchten(Token) + "\",");
            sb.AppendLine("  \"bildschirm\": " + Bildschirm + ",");
            sb.AppendLine("  \"taste\": \"" + Fluchten(Taste) + "\"");
            sb.AppendLine("}");
            File.WriteAllText(datei, sb.ToString(), new UTF8Encoding(false));
        }

        static string Fluchten(string s)
        {
            return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }

    /* ==================================================================
       BILDSCHIRME
       ================================================================== */
    static class Schirme
    {
        /// <summary>Nimmt einen Bildschirm auf. 0 = der primaere.</summary>
        public static Bitmap NimmAuf(int nummer)
        {
            Screen[] alle = Screen.AllScreens;
            Screen s = (nummer >= 1 && nummer <= alle.Length)
                ? alle[nummer - 1]
                : Screen.PrimaryScreen;

            Rectangle b = s.Bounds;
            Bitmap bild = new Bitmap(b.Width, b.Height, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bild))
            {
                g.CopyFromScreen(b.Location, Point.Empty, b.Size);
            }
            return bild;
        }

        public static byte[] AlsPng(Bitmap bild)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                bild.Save(ms, ImageFormat.Png);
                return ms.ToArray();
            }
        }

        public static string Beschriftung(int nummer)
        {
            Screen[] alle = Screen.AllScreens;
            if (nummer < 1 || nummer > alle.Length) return "primärer Bildschirm";
            Screen s = alle[nummer - 1];
            return s.Bounds.Width + "×" + s.Bounds.Height + (s.Primary ? "  (primär)" : "");
        }

        public static int Anzahl { get { return Screen.AllScreens.Length; } }
    }

    /* ==================================================================
       TASTENABFRAGE

       GetAsyncKeyState statt RegisterHotKey: RegisterHotKey wuerde die
       Taste global belegen und dem Spiel wegnehmen. So wird sie nur
       beobachtet - Meccha bekommt sie weiterhin.
       ================================================================== */
    static class Tasten
    {
        [DllImport("user32.dll")]
        static extern short GetAsyncKeyState(int vKey);

        static readonly Dictionary<string, int> Bekannt = new Dictionary<string, int>
        {
            { "F1", 0x70 }, { "F2", 0x71 }, { "F3", 0x72 }, { "F4", 0x73 },
            { "F5", 0x74 }, { "F6", 0x75 }, { "F7", 0x76 }, { "F8", 0x77 },
            { "F9", 0x78 }, { "F10", 0x79 }, { "F11", 0x7A }, { "F12", 0x7B },
            { "DRUCK", 0x2C }, { "ENDE", 0x23 }, { "POS1", 0x24 }, { "EINFG", 0x2D },
            { "NUM0", 0x60 }, { "NUM1", 0x61 }, { "NUM2", 0x62 }, { "NUM3", 0x63 },
            { "NUM4", 0x64 }, { "NUM5", 0x65 }, { "NUM6", 0x66 }, { "NUM7", 0x67 },
            { "NUM8", 0x68 }, { "NUM9", 0x69 }
        };

        public static string[] Namen
        {
            get { return Bekannt.Keys.ToArray(); }
        }

        public static int Code(string name)
        {
            int c;
            return Bekannt.TryGetValue((name ?? "").ToUpperInvariant(), out c) ? c : -1;
        }

        public static bool Gedrueckt(int code)
        {
            return code >= 0 && (GetAsyncKeyState(code) & 0x8000) != 0;
        }
    }

    /* ==================================================================
       SENDEN

       Nach bestaetigter Annahme wird das Bild geloescht - es bleibt nur
       auf dem Server, dort 24 Stunden. Geht das Senden schief, wandert
       es in die Warteschlange statt verloren zu gehen. Die Reihenfolge
       ist wichtig: erst bestaetigt, dann geloescht.
       ================================================================== */
    class Antwort
    {
        public bool Ok;
        public bool Nochmal;
        public string Hinweis = "";
        public List<string> Zeilen = new List<string>();
    }

    /* ==================================================================
       AUSKUNFT - wer bin ich?

       Der Zuschauer sieht seinen Ingame-Namen sonst nirgends: im Spiel
       ist die eigene Zeile in der Rangliste nicht hervorgehoben, und
       hier steht nur ein Token. Ohne diese Auskunft merkt er einen
       Tippfehler im Namen erst daran, dass nie etwas ankommt.
       ================================================================== */
    class Auskunft
    {
        public bool Ok;
        public string Name = "";
        public string IngameName = "";
        public bool GanzeLobby;
        public bool BrauchtFreigabe;
        public bool Gesperrt;
        public string Sperrgrund = "";
        public string Fehler = "";
        /* Welche Fassung der Server ausliefert. Weicht sie von der
           eigenen ab, laeuft hier eine alte .exe - nach einem
           Serverumzug wuerde sie sonst schweigend ins Leere senden. */
        public string NeuesteVersion = "";
    }

    /* ==================================================================
       MEINE RUNDEN - was aus den Einreichungen geworden ist.
       ================================================================== */
    class MeineRunde
    {
        public string Id = "";
        public long Eingegangen;
        public string Status = "";
        public string Punkte = "";
        public string Grund = "";
        public long BearbeitetAm;
        /* Zaehlt diese Runde noch? turnier wertet je Person die letzten
           zehn Eintraege - aeltere fallen aus dem Fenster. */
        public bool Zaehlt;
    }

    /// <summary>Wie weit jemand von der Wertung entfernt ist.</summary>
    class Wertung
    {
        public int Gewertet;
        public int Voll = 10;
    }

    class Sender
    {
        readonly string ordner;

        public Sender(string ordner)
        {
            this.ordner = ordner;
            Directory.CreateDirectory(ordner);
        }

        public int Wartend
        {
            get
            {
                try { return Directory.GetFiles(ordner, "offen-*.png").Length; }
                catch { return 0; }
            }
        }

        /// <summary>Fragt den Server, wer hinter dem Token steckt.</summary>
        public Auskunft WerBinIch(Einstellungen e)
        {
            Auskunft a = new Auskunft();
            try
            {
                HttpWebRequest anfrage = (HttpWebRequest)WebRequest.Create(
                    e.Server.TrimEnd('/') + "/api/wer");
                anfrage.Method = "GET";
                anfrage.Headers["X-MC-Token"] = e.Token;
                anfrage.Timeout = 15000;

                string koerper;
                using (HttpWebResponse antwort = (HttpWebResponse)anfrage.GetResponse())
                using (StreamReader leser = new StreamReader(antwort.GetResponseStream()))
                {
                    koerper = leser.ReadToEnd();
                }

                a.Ok = koerper.IndexOf("\"ok\":true", StringComparison.Ordinal) >= 0;
                a.Name = Feld(koerper, "name") ?? "";
                a.IngameName = Feld(koerper, "ingameName") ?? "";
                a.Sperrgrund = Feld(koerper, "sperrgrund") ?? "";
                a.NeuesteVersion = Feld(koerper, "neuesteVersion") ?? "";
                a.GanzeLobby = koerper.IndexOf("\"ganzeLobby\":true", StringComparison.Ordinal) >= 0;
                a.BrauchtFreigabe = koerper.IndexOf("\"brauchtFreigabe\":true", StringComparison.Ordinal) >= 0;
                a.Gesperrt = koerper.IndexOf("\"gesperrt\":true", StringComparison.Ordinal) >= 0;
            }
            catch (WebException wex)
            {
                HttpWebResponse r = wex.Response as HttpWebResponse;
                a.Fehler = (r != null && (int)r.StatusCode == 401)
                    ? "Dieser Token gilt nicht (mehr)."
                    : "Server nicht erreichbar.";
            }
            catch (Exception ex)
            {
                a.Fehler = ex.Message;
            }
            return a;
        }

        /// <summary>Holt die eigenen Runden samt Ausgang und Grund.</summary>
        /* Aus demselben Abruf wie die Runden - turnier wertet erst ab
           zehn Eintraegen, davor steht man als Anwaerter in der Liste. */
        public Wertung LetzteWertung = new Wertung();

        public List<MeineRunde> MeineRunden(Einstellungen e)
        {
            List<MeineRunde> raus = new List<MeineRunde>();
            try
            {
                HttpWebRequest anfrage = (HttpWebRequest)WebRequest.Create(
                    e.Server.TrimEnd('/') + "/api/meine");
                anfrage.Method = "GET";
                anfrage.Headers["X-MC-Token"] = e.Token;
                anfrage.Timeout = 15000;

                string koerper;
                using (HttpWebResponse antwort = (HttpWebResponse)anfrage.GetResponse())
                using (StreamReader leser = new StreamReader(antwort.GetResponseStream()))
                {
                    koerper = leser.ReadToEnd();
                }

                Wertung w = new Wertung();
                w.Gewertet = (int)Zahl(koerper, "gewertet");
                long v = Zahl(koerper, "voll");
                if (v > 0) w.Voll = (int)v;
                LetzteWertung = w;

                /* Von Hand geparst wie ueberall hier - fuer sechs Felder
                   lohnt keine Bibliothek in einer 27-KB-Datei. */
                int pos = 0;
                while (true)
                {
                    int i = koerper.IndexOf("\"id\"", pos, StringComparison.Ordinal);
                    if (i < 0) break;
                    string teil = koerper.Substring(i);

                    MeineRunde m = new MeineRunde();
                    m.Id = Feld(teil, "id") ?? "";
                    m.Status = Feld(teil, "status") ?? "";
                    m.Grund = Feld(teil, "grund") ?? "";
                    m.Eingegangen = Zahl(teil, "eingegangen");
                    m.BearbeitetAm = Zahl(teil, "bearbeitetAm");
                    long p = Zahl(teil, "punkte");
                    m.Punkte = p > 0 ? p.ToString() : "";

                    /* Nur bis zum naechsten Eintrag suchen, sonst faende
                       "zaehlt":true der Folgerunde auch hier einen Treffer. */
                    int naechster = teil.IndexOf("\"id\"", 4, StringComparison.Ordinal);
                    string abschnitt = naechster > 0 ? teil.Substring(0, naechster) : teil;
                    m.Zaehlt = abschnitt.IndexOf("\"zaehlt\":true", StringComparison.Ordinal) >= 0;

                    raus.Add(m);
                    pos = i + 4;
                }
            }
            catch
            {
                /* Server weg oder Token ungueltig - die Rueckmeldung ist
                   eine Zugabe, sie darf nichts kaputtmachen. */
            }
            return raus;
        }

        static long Zahl(string json, string name)
        {
            string marke = "\"" + name + "\"";
            int i = json.IndexOf(marke, StringComparison.Ordinal);
            if (i < 0) return 0;
            i = json.IndexOf(':', i + marke.Length);
            if (i < 0) return 0;
            i++;
            while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
            int stop = i;
            while (stop < json.Length && char.IsDigit(json[stop])) stop++;
            long wert;
            return long.TryParse(json.Substring(i, stop - i), out wert) ? wert : 0;
        }

        public Antwort Senden(byte[] bild, Einstellungen e)
        {
            Antwort a = new Antwort();
            try
            {
                HttpWebRequest anfrage = (HttpWebRequest)WebRequest.Create(
                    e.Server.TrimEnd('/') + "/api/runde");
                anfrage.Method = "POST";
                anfrage.ContentType = "image/png";
                anfrage.Headers["X-MC-Token"] = e.Token;
                anfrage.Timeout = 120000;
                anfrage.ReadWriteTimeout = 120000;
                anfrage.ContentLength = bild.Length;

                using (Stream s = anfrage.GetRequestStream())
                {
                    s.Write(bild, 0, bild.Length);
                }

                using (HttpWebResponse antwort = (HttpWebResponse)anfrage.GetResponse())
                using (StreamReader leser = new StreamReader(antwort.GetResponseStream()))
                {
                    Auswerten(a, leser.ReadToEnd(), (int)antwort.StatusCode);
                }
            }
            catch (WebException wex)
            {
                HttpWebResponse r = wex.Response as HttpWebResponse;
                if (r != null)
                {
                    using (StreamReader leser = new StreamReader(r.GetResponseStream()))
                    {
                        Auswerten(a, leser.ReadToEnd(), (int)r.StatusCode);
                    }
                }
                else
                {
                    /* Netz weg, Server aus, Zeitlimit - alles wiederholbar. */
                    a.Ok = false;
                    a.Nochmal = true;
                    a.Hinweis = "Server nicht erreichbar";
                }
            }
            catch (Exception ex)
            {
                a.Ok = false;
                a.Nochmal = false;
                a.Hinweis = ex.Message;
            }
            return a;
        }

        static void Auswerten(Antwort a, string koerper, int code)
        {
            a.Ok = code >= 200 && code < 300 &&
                   koerper.IndexOf("\"ok\":true", StringComparison.Ordinal) >= 0;

            string hinweis = Feld(koerper, "hinweis");
            string fehler = Feld(koerper, "fehler");
            a.Hinweis = a.Ok
                ? (hinweis ?? "Angenommen")
                : (fehler ?? ("HTTP " + code));

            /* Wiederholen lohnt nur bei Serverfehlern. Ein falscher Token
               oder ein unlesbares Bild scheitert beim naechsten Versuch
               genauso - das wuerde nur die Warteschlange fuellen. */
            a.Nochmal = !a.Ok && (code == 429 || code == 502 || code >= 500);

            foreach (string z in Zeilen(koerper)) a.Zeilen.Add(z);
        }

        static string Feld(string json, string name)
        {
            string marke = "\"" + name + "\"";
            int i = json.IndexOf(marke, StringComparison.Ordinal);
            if (i < 0) return null;
            i = json.IndexOf(':', i + marke.Length);
            if (i < 0) return null;
            i = json.IndexOf('"', i);
            if (i < 0) return null;
            int ende = i + 1;
            while (ende < json.Length && json[ende] != '"') ende++;
            return json.Substring(i + 1, ende - i - 1);
        }

        static List<string> Zeilen(string json)
        {
            List<string> raus = new List<string>();
            int i = json.IndexOf("\"zeilen\"", StringComparison.Ordinal);
            if (i < 0) return raus;

            string teil = json.Substring(i);
            int pos = 0;
            while (true)
            {
                int n = teil.IndexOf("\"rohName\"", pos, StringComparison.Ordinal);
                if (n < 0) return raus;

                string name = Feld(teil.Substring(n), "rohName");
                int p = teil.IndexOf("\"rohPunkte\"", n, StringComparison.Ordinal);
                string punkte = (p < 0) ? "" : Feld(teil.Substring(p), "rohPunkte");

                raus.Add((name ?? "?") + "\t" + (punkte ?? ""));
                pos = n + 9;
            }
        }

        public void Zurueckstellen(byte[] bild)
        {
            /* Zufallsanhang, weil zwei Runden in derselben Sekunde sonst
               dieselbe Datei bekaemen und eine verlorenginge. */
            string datei = Path.Combine(ordner,
                "offen-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" +
                Guid.NewGuid().ToString("N").Substring(0, 6) + ".png");
            try { File.WriteAllBytes(datei, bild); }
            catch { /* Platte voll oder gesperrt - mehr geht hier nicht */ }
        }

        /// <summary>Schickt Liegengebliebenes erneut, gibt zurueck wie viele durchkamen.</summary>
        public int Nachreichen(Einstellungen e)
        {
            int raus = 0;
            string[] dateien;
            try { dateien = Directory.GetFiles(ordner, "offen-*.png"); }
            catch { return 0; }

            Array.Sort(dateien);
            foreach (string datei in dateien)
            {
                byte[] bild;
                try { bild = File.ReadAllBytes(datei); }
                catch { continue; }

                Antwort a = Senden(bild, e);
                if (a.Ok) { Loesche(datei); raus++; continue; }
                if (a.Nochmal) break;   // Netz weg - der Rest geht jetzt auch nicht
                Loesche(datei);         // dauerhaft abgelehnt: aufheben bringt nichts
            }
            return raus;
        }

        public static void Loesche(string datei)
        {
            try { File.Delete(datei); }
            catch { /* schon weg oder gesperrt */ }
        }
    }
}
