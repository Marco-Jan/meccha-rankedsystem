/* =========================================================================
   MECCHA RANKED - das Fenster

   Aufbau nach Absprache:
     - ein Fenster, nichts versteckt: Status oben, letzte Runden darunter
     - Einstellungen klappen ueber einen Knopf auf
     - X legt das Programm neben die Uhr, es laeuft weiter
     - Beenden per Rechtsklick auf das Symbol

   Die Bildschirmauswahl zeigt Vorschaubilder nebeneinander. Das ist der
   wichtigste Teil der Einrichtung: an geratenen Bildschirmnummern ist
   der erste Testlauf eine Stunde lang gescheitert. Die Nummern hier sind
   NICHT die aus den Windows-Anzeigeeinstellungen, deshalb muss man sehen
   koennen, was man waehlt.
   ========================================================================= */

using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace MecchaRanked
{
    class Fenster : Form
    {
        readonly string einstellungenDatei;
        readonly Sender sender;
        Einstellungen e;

        NotifyIcon symbol;
        Label statusZeile, serverZeile;
        ListView verlauf;
        Button knopfSenden, knopfEinstellungen;
        Panel einstellungsBereich;
        TextBox feldToken;
        Button knopfTokenAendern;
        /* Der echte Token, solange im Feld nur die Maske steht. Ohne den
           wuerde ein Speichern die Maske als Token uebernehmen. */
        string tokenGemerkt = "";
        /* Was der Server ueber diesen Zugang sagt. Steht in der Kopfzeile,
           damit der Zuschauer seinen Ingame-Namen ueberhaupt einmal zu
           sehen bekommt. */
        Auskunft auskunft;
        ComboBox feldTaste;
        FlowLayoutPanel schirmLeiste;
        int gewaehlterSchirm;

        // Ausdruecklich der Timer aus WinForms: der aus System.Threading
        // laeuft in einem eigenen Faden und duerfte die Oberflaeche gar
        // nicht anfassen.
        readonly System.Windows.Forms.Timer tastenUhr = new System.Windows.Forms.Timer();
        int tastenCode = -1;
        bool warGedrueckt;
        bool laeuft;
        bool wirklichBeenden;

        public Fenster(string datei, Sender s)
        {
            einstellungenDatei = datei;
            sender = s;
            e = Einstellungen.Laden(datei);
            gewaehlterSchirm = e.Bildschirm;

            BaueFenster();
            BaueSymbol();
            SetzeTaste();

            /* Beim Start zeigen, was zu tun ist: fehlt etwas, geht der
               Einstellungsbereich gleich auf. */
            if (!e.Vollstaendig) ZeigeEinstellungen(true);
            Aktualisiere();
            HoleAuskunft();

            System.Windows.Forms.Timer nachreichen = new System.Windows.Forms.Timer();
            nachreichen.Interval = 60000;
            nachreichen.Tick += (a, b) => { Nachreichen(); HoleRueckmeldungen(); };
            nachreichen.Start();
            Nachreichen();
            HoleRueckmeldungen();
        }

        /* ------------------------------------------------------ Aufbau */

        void BaueFenster()
        {
            Text = Info.Projekt;
            Width = 560;
            Height = 620;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(480, 480);
            BackColor = Color.FromArgb(32, 34, 40);
            ForeColor = Color.FromArgb(230, 233, 239);
            Font = new Font("Segoe UI", 9.5f);

            statusZeile = new Label
            {
                Text = "…",
                Dock = DockStyle.Top,
                Height = 34,
                Padding = new Padding(14, 8, 14, 0),
                Font = new Font("Segoe UI", 11f, FontStyle.Bold)
            };

            serverZeile = new Label
            {
                Text = "",
                Dock = DockStyle.Top,
                Height = 24,
                Padding = new Padding(14, 0, 14, 0),
                ForeColor = Color.FromArgb(150, 158, 172)
            };

            /* Ein Zahnrad rechts oben statt eines Streifens, der das
               Fenster aufklappt. Einstellungen sind etwas, das man selten
               anfasst - sie sollen den Blick auf den Verlauf nicht
               dauerhaft verkleinern. */
            knopfEinstellungen = new Button
            {
                Text = "⚙",
                Width = 42,
                Height = 30,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(44, 48, 57),
                Font = new Font("Segoe UI Symbol", 12f)
            };
            knopfEinstellungen.Click += (a, b) => ZeigeEinstellungen(true);

            /* Der Bereich wird gebaut, aber NICHT ins Fenster gehaengt -
               er zieht beim Klick in einen eigenen Dialog um. */
            einstellungsBereich = BaueEinstellungsBereich();

            verlauf = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                GridLines = false,
                BackColor = Color.FromArgb(26, 28, 34),
                ForeColor = Color.FromArgb(230, 233, 239),
                BorderStyle = BorderStyle.None
            };
            verlauf.Columns.Add("Zeit", 60);
            verlauf.Columns.Add("", 26);
            verlauf.Columns.Add("Was", 300);
            verlauf.Columns.Add("Punkte", 90, HorizontalAlignment.Right);

            knopfSenden = new Button
            {
                Text = "Jetzt aufnehmen und senden",
                Dock = DockStyle.Bottom,
                Height = 38,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(38, 78, 130)
            };
            knopfSenden.Click += (a, b) => EineRunde();

            /*
               Beenden gehoert ins Fenster.

               Das X legt das Programm absichtlich nur neben die Uhr - so
               laeuft die Tastenueberwachung weiter, auch wenn jemand aus
               Gewohnheit zuklickt. Der einzige Weg zurueck war bisher der
               Rechtsklick auf das Symbol, und den findet niemand von
               selbst. Also hier ein sichtbarer Knopf.
            */
            Label fuss = new Label
            {
                Text = Info.Projekt + " " + Info.Version + "   ·   von " + Info.Entwickler,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Color.FromArgb(120, 128, 142),
                Padding = new Padding(14, 0, 0, 0)
            };

            Button knopfBeenden = new Button
            {
                Text = "Beenden",
                Dock = DockStyle.Right,
                Width = 110,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(58, 42, 46),
                ForeColor = Color.FromArgb(232, 150, 145)
            };
            knopfBeenden.Click += (a, b) => Beenden();

            /* Nachsehen, ohne auf den Minutentakt zu warten - nach einer
               Einreichung will man gleich wissen, ob sie durch ist. */
            Button knopfAktualisieren = new Button
            {
                Text = "Aktualisieren",
                Dock = DockStyle.Right,
                Width = 120,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(44, 48, 57)
            };
            knopfAktualisieren.Click += (a, b) =>
            {
                HoleAuskunft();
                HoleRueckmeldungen();
                Nachreichen();
                Melde("Wird nachgesehen …");
            };

            Panel fussLeiste = new Panel { Dock = DockStyle.Bottom, Height = 30 };
            // Reihenfolge zaehlt: das zuletzt hinzugefuegte dockt zuerst.
            fussLeiste.Controls.Add(fuss);
            fussLeiste.Controls.Add(knopfAktualisieren);
            fussLeiste.Controls.Add(knopfBeenden);

            /* Das Zahnrad sitzt rechts neben der Statuszeile - dort, wo
               man es erwartet, und ohne eigene Zeile zu verbrauchen. */
            Panel kopfLeiste = new Panel { Dock = DockStyle.Top, Height = 62 };
            knopfEinstellungen.Location = new Point(0, 0);
            knopfEinstellungen.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            Panel zahnradPlatz = new Panel { Dock = DockStyle.Right, Width = 54, Padding = new Padding(6, 10, 12, 0) };
            knopfEinstellungen.Dock = DockStyle.Top;
            zahnradPlatz.Controls.Add(knopfEinstellungen);

            Panel texte = new Panel { Dock = DockStyle.Fill };
            texte.Controls.Add(serverZeile);
            texte.Controls.Add(statusZeile);

            kopfLeiste.Controls.Add(texte);
            kopfLeiste.Controls.Add(zahnradPlatz);

            Controls.Add(verlauf);
            Controls.Add(knopfSenden);
            Controls.Add(fussLeiste);
            Controls.Add(kopfLeiste);

            FormClosing += BeimSchliessen;
        }

        Panel BaueEinstellungsBereich()
        {
            /* Hoehe muss zur Summe der Kinder passen: Hinweis 22 +
               Vorschau 130 + Erneuern 26 + Felder 96 + Speichern 34,
               dazu Innenabstand. Zu knapp bemessen, und der
               Speichern-Knopf verschwindet unter der Tabelle - genau das
               ist passiert. */
            Panel p = new Panel
            {
                Dock = DockStyle.Top,
                Height = 340,
                Visible = false,
                Padding = new Padding(14, 6, 14, 10),
                BackColor = Color.FromArgb(38, 41, 49)
            };

            Label hinweis = new Label
            {
                Text = "Auf welchem Bildschirm läuft Meccha?",
                Dock = DockStyle.Top,
                Height = 22
            };

            schirmLeiste = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 130,
                AutoScroll = true,
                WrapContents = false
            };

            Button erneuern = new Button
            {
                Text = "Vorschau erneuern",
                Dock = DockStyle.Top,
                Height = 26,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(52, 56, 66)
            };
            erneuern.Click += (a, b) => BaueSchirme();

            TableLayoutPanel felder = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 66,
                ColumnCount = 2,
                RowCount = 2
            };
            felder.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
            felder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            feldToken = new TextBox { Dock = DockStyle.Fill, Text = e.Token };
            feldTaste = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
            feldTaste.Items.AddRange(Tasten.Namen);
            feldTaste.SelectedItem = e.Taste;
            if (feldTaste.SelectedIndex < 0) feldTaste.SelectedItem = "F9";

            /*
               Der Token steht nicht einfach so zum Ueberschreiben da.
               Ist einer eingetragen, zeigt das Feld nur eine Maske, ist
               gesperrt und ausgegraut - aendern geht ueber den Knopf
               daneben, mit Rueckfrage. Ein Zuschauer soll seinen Zugang
               nicht mit einem Tastendruck loeschen, waehrend er
               eigentlich die Taste umstellen wollte.
            */
            knopfTokenAendern = new Button
            {
                Text = "Ändern",
                Dock = DockStyle.Fill,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(52, 56, 66),
                Margin = new Padding(6, 0, 0, 0)
            };
            knopfTokenAendern.Click += (a, b) => TokenFreigeben();

            TableLayoutPanel tokenZeile = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = new Padding(0)
            };
            tokenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            tokenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 84));
            tokenZeile.Controls.Add(feldToken, 0, 0);
            tokenZeile.Controls.Add(knopfTokenAendern, 1, 0);

            felder.Controls.Add(new Label { Text = "Token", Dock = DockStyle.Fill }, 0, 0);
            felder.Controls.Add(tokenZeile, 1, 0);
            felder.Controls.Add(new Label { Text = "Taste", Dock = DockStyle.Fill }, 0, 1);
            felder.Controls.Add(feldTaste, 1, 1);

            TokenSperren();

            /*
               Der Weg zum Token, ohne dass jemand eine Adresse kennen muss.

               Die Serveradresse steht fest in der .exe und wird bewusst
               nirgends angezeigt - also kann der Zuschauer die Kontoseite
               auch nicht selbst aufrufen. Dieser Knopf oeffnet sie im
               Browser: dort meldet er sich ueber Steam an, traegt seinen
               Ingame-Namen ein und kopiert den Token hierher.
            */
            Button zugang = new Button
            {
                Text = "Zugang holen  –  Anmeldung über Steam",
                Dock = DockStyle.Top,
                Height = 30,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(40, 56, 74),
                ForeColor = Color.FromArgb(150, 195, 245)
            };
            zugang.Click += (a, b) => OeffneKontoseite();

            Button speichern = new Button
            {
                Text = "Speichern",
                Dock = DockStyle.Top,
                Height = 34,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(38, 78, 130)
            };
            speichern.Click += (a, b) => Speichern();

            p.Controls.Add(new Panel { Dock = DockStyle.Top, Height = 6 });
            p.Controls.Add(speichern);
            p.Controls.Add(zugang);
            p.Controls.Add(felder);
            p.Controls.Add(erneuern);
            p.Controls.Add(schirmLeiste);
            p.Controls.Add(hinweis);
            return p;
        }

        void BaueSymbol()
        {
            ContextMenuStrip menue = new ContextMenuStrip();
            menue.Items.Add("Fenster zeigen", null, (a, b) => ZeigeFenster());
            menue.Items.Add(new ToolStripSeparator());
            menue.Items.Add("Beenden", null, (a, b) => { wirklichBeenden = true; Close(); });

            symbol = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = Info.Projekt,
                Visible = true,
                ContextMenuStrip = menue
            };
            symbol.DoubleClick += (a, b) => ZeigeFenster();
        }

        /* ------------------------------------------- Bildschirmvorschau */

        void BaueSchirme()
        {
            schirmLeiste.Controls.Clear();

            for (int i = 1; i <= Schirme.Anzahl; i++)
            {
                int nummer = i;
                Panel karte = new Panel
                {
                    Width = 180,
                    Height = 118,
                    Margin = new Padding(0, 0, 8, 0),
                    BackColor = (nummer == gewaehlterSchirm)
                        ? Color.FromArgb(38, 78, 130)
                        : Color.FromArgb(52, 56, 66),
                    Padding = new Padding(2)
                };

                PictureBox bild = new PictureBox
                {
                    Dock = DockStyle.Fill,
                    SizeMode = PictureBoxSizeMode.Zoom,
                    BackColor = Color.Black
                };
                try
                {
                    using (Bitmap voll = Schirme.NimmAuf(nummer))
                    {
                        // Verkleinert ablegen: das Vollbild im Speicher zu
                        // halten waere bei drei Schirmen unnoetig teuer.
                        bild.Image = new Bitmap(voll, new Size(176, 99));
                    }
                }
                catch { /* Bildschirm gerade nicht lesbar - Kachel bleibt schwarz */ }

                Label bez = new Label
                {
                    Text = nummer + ":  " + Schirme.Beschriftung(nummer),
                    Dock = DockStyle.Bottom,
                    Height = 18,
                    TextAlign = ContentAlignment.MiddleCenter
                };

                EventHandler klick = (a, b) => { gewaehlterSchirm = nummer; BaueSchirme(); };
                karte.Click += klick;
                bild.Click += klick;
                bez.Click += klick;

                karte.Controls.Add(bild);
                karte.Controls.Add(bez);
                schirmLeiste.Controls.Add(karte);
            }
        }

        /* --------------------------------------------------- Bedienung */

        /* Einstellungen als eigenes Fenster.

           Der Bereich zieht dafuer in einen Dialog um und danach wieder
           zurueck - so gibt es ihn nur einmal, mit allen Feldern und
           ihrem Zustand. Ein zweiter Aufbau waere eine zweite Stelle,
           die man beim Aendern vergessen kann. */
        Form einstellungsFenster;

        void ZeigeEinstellungen(bool an)
        {
            if (!an) { if (einstellungsFenster != null) einstellungsFenster.Close(); return; }
            if (einstellungsFenster != null) { einstellungsFenster.Activate(); return; }

            einstellungsBereich.Dock = DockStyle.Fill;
            einstellungsBereich.Visible = true;

            einstellungsFenster = new Form
            {
                Text = Info.Projekt + " – Einstellungen",
                Width = 540,
                Height = 430,
                StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MinimizeBox = false,
                MaximizeBox = false,
                ShowInTaskbar = false,
                BackColor = Color.FromArgb(38, 41, 49),
                ForeColor = Color.FromArgb(230, 233, 239),
                Font = Font
            };

            einstellungsFenster.Controls.Add(einstellungsBereich);
            BaueSchirme();

            einstellungsFenster.FormClosed += (a, b) =>
            {
                // Den Bereich zurueckholen, sonst ist er beim naechsten
                // Oeffnen mit dem Dialog verschwunden.
                einstellungsFenster.Controls.Remove(einstellungsBereich);
                einstellungsBereich.Visible = false;
                einstellungsFenster = null;
            };

            einstellungsFenster.ShowDialog(this);
        }

        /* --------------------------------------------------- Token

           Ist ein Token eingetragen, steht im Feld nur noch eine Maske,
           es ist gesperrt und grau. So kann er weder aus Versehen
           ueberschrieben noch mit Strg+A und Entf geloescht werden.
        */

        static string Maske(string token)
        {
            if (string.IsNullOrEmpty(token)) return "";
            if (token.Length <= 10) return new string('•', token.Length);
            return token.Substring(0, 4) + new string('•', 8) + token.Substring(token.Length - 4);
        }

        void TokenSperren()
        {
            tokenGemerkt = e.Token ?? "";
            bool hat = tokenGemerkt.Length > 0;

            feldToken.ReadOnly = hat;
            feldToken.Text = hat ? Maske(tokenGemerkt) : "";
            feldToken.BackColor = hat ? Color.FromArgb(38, 41, 49) : Color.White;
            feldToken.ForeColor = hat ? Color.FromArgb(150, 158, 172) : Color.Black;
            knopfTokenAendern.Enabled = hat;
        }

        void TokenFreigeben()
        {
            /* Bewusst mit Rueckfrage und mit "Nein" als Vorgabe: das hier
               ist der einzige Weg zurueck, wenn jemand seinen Token
               weggeworfen hat, und dann braucht er einen neuen vom
               Streamer. Ein Fehlklick soll das nicht ausloesen. */
            DialogResult r = MessageBox.Show(
                "Deinen Zugang wirklich ändern?\r\n\r\n" +
                "Der eingetragene Token wird dabei entfernt. Du brauchst " +
                "dann einen neuen von der Kontoseite - ohne ihn kannst du " +
                "nichts mehr einreichen.",
                Info.Projekt, MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);

            if (r != DialogResult.Yes) return;

            tokenGemerkt = "";
            feldToken.ReadOnly = false;
            feldToken.Text = "";
            feldToken.BackColor = Color.White;
            feldToken.ForeColor = Color.Black;
            knopfTokenAendern.Enabled = false;
            feldToken.Focus();
        }

        void Speichern()
        {
            /* Steht die Maske im Feld, bleibt der gemerkte Token stehen -
               sonst wuerde ein Speichern nach dem Umstellen der Taste die
               Punkte statt des Zugangs eintragen. */
            string token = feldToken.ReadOnly ? tokenGemerkt : (feldToken.Text ?? "").Trim();

            if (token.Length == 0)
            {
                MessageBox.Show("Trag zuerst deinen Token ein. Den bekommst du auf der Kontoseite.",
                    Info.Projekt, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            e.Token = token;
            e.Bildschirm = gewaehlterSchirm;
            e.Taste = (feldTaste.SelectedItem ?? "F9").ToString();
            e.Speichern(einstellungenDatei);

            TokenSperren();
            SetzeTaste();
            ZeigeEinstellungen(false);
            auskunft = null;
            Aktualisiere();
            HoleAuskunft();
            Melde("Gespeichert.");
        }

        void SetzeTaste()
        {
            tastenUhr.Stop();
            tastenCode = Tasten.Code(e.Taste);
            warGedrueckt = false;
            if (tastenCode < 0) return;

            /* 40 Millisekunden: schnell genug, dass kein Tastendruck
               durchrutscht, langsam genug um nicht aufzufallen. */
            tastenUhr.Interval = 40;
            tastenUhr.Tick -= TastenTick;
            tastenUhr.Tick += TastenTick;
            tastenUhr.Start();
        }

        void TastenTick(object a, EventArgs b)
        {
            bool jetzt = Tasten.Gedrueckt(tastenCode);
            /* Nur die FLANKE zaehlt - sonst feuert Gedrueckthalten
               hundertfach. */
            if (jetzt && !warGedrueckt) EineRunde();
            warGedrueckt = jetzt;
        }

        /* ------------------------------------------------- eine Runde */

        void EineRunde()
        {
            if (laeuft) return;
            if (!e.Vollstaendig)
            {
                Melde("Erst den Token eintragen.");
                ZeigeEinstellungen(true);
                return;
            }

            laeuft = true;
            knopfSenden.Enabled = false;
            statusZeile.Text = "Nehme auf und sende …";

            byte[] bild;
            try
            {
                using (Bitmap b = Schirme.NimmAuf(e.Bildschirm))
                {
                    bild = Schirme.AlsPng(b);
                }
            }
            catch (Exception ex)
            {
                Fertig(false, "Aufnahme fehlgeschlagen: " + ex.Message, null);
                return;
            }

            /* In einem eigenen Faden, damit das Fenster waehrend des
               Sendens bedienbar bleibt - der Server braucht ein paar
               Sekunden zum Lesen. */
            Einstellungen kopie = e;
            ThreadPool.QueueUserWorkItem(delegate
            {
                Antwort a = sender.Senden(bild, kopie);
                if (!a.Ok && a.Nochmal) sender.Zurueckstellen(bild);

                BeginInvoke((MethodInvoker)delegate
                {
                    Fertig(a.Ok, a.Ok ? a.Hinweis
                        : (a.Nochmal ? a.Hinweis + " – liegt in der Warteschlange"
                                     : "Abgelehnt: " + a.Hinweis), a);
                });
            });
        }

        void Fertig(bool ok, string text, Antwort a)
        {
            laeuft = false;
            knopfSenden.Enabled = true;
            // Die frische Einreichung soll sofort in der Liste stehen.
            if (ok) HoleRueckmeldungen();

            ListViewItem eintrag = new ListViewItem(DateTime.Now.ToString("HH:mm"));
            eintrag.SubItems.Add(ok ? "OK" : "!");
            eintrag.SubItems.Add(text);
            eintrag.SubItems.Add("");
            eintrag.ForeColor = ok ? Color.FromArgb(120, 210, 150) : Color.FromArgb(232, 130, 120);
            /* Eine erfolgreiche Einreichung gehoert zum STAND: beim
               naechsten Aktualisieren ersetzt sie die Zeile vom Server
               ("wartet auf Pruefung" bzw. "zaehlt"). Sonst stuende die
               Runde doppelt da - einmal als "eingereicht", einmal mit
               ihrem tatsaechlichen Ausgang.

               Fehlschlaege bleiben stehen: zu ihnen gibt es keine Runde
               beim Server, und sie sollen nicht lautlos verschwinden. */
            eintrag.Tag = ok ? "runde" : "senden";
            verlauf.Items.Insert(0, eintrag);

            if (a != null)
            {
                foreach (string z in a.Zeilen)
                {
                    string[] teile = z.Split('\t');
                    ListViewItem zeile = new ListViewItem("");
                    zeile.SubItems.Add("");
                    zeile.SubItems.Add(teile.Length > 0 ? teile[0] : "");
                    zeile.SubItems.Add(teile.Length > 1 ? teile[1] : "");
                    verlauf.Items.Insert(1, zeile);
                }
            }

            while (verlauf.Items.Count > 60) verlauf.Items.RemoveAt(verlauf.Items.Count - 1);
            Aktualisiere();
        }

        void Nachreichen()
        {
            if (!e.Vollstaendig || sender.Wartend == 0) return;
            Einstellungen kopie = e;
            ThreadPool.QueueUserWorkItem(delegate
            {
                int raus = sender.Nachreichen(kopie);
                if (raus > 0)
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        Melde(raus + " Runde(n) nachgereicht.");
                        Aktualisiere();
                    });
                }
            });
        }

        /* ------------------------------------------- Rueckmeldungen

           Was aus den eigenen Einreichungen geworden ist. Vorher endete
           es bei "zur Freigabe eingereicht": wurde etwas abgelehnt,
           erfuhr der Zuschauer es nie und schickte dasselbe nochmal.

           Der Zeitpunkt der zuletzt gemeldeten Entscheidung liegt in
           einer kleinen Datei - sonst wuerde nach jedem Neustart alles
           erneut aufpoppen.
        */

        string GesehenDatei
        {
            get { return Path.Combine(Path.GetDirectoryName(einstellungenDatei) ?? ".",
                                      "mc-ranked-daten", "gesehen.txt"); }
        }

        long LiesGesehen()
        {
            try
            {
                long wert;
                if (long.TryParse(File.ReadAllText(GesehenDatei).Trim(), out wert)) return wert;
            }
            catch { /* gibt es noch nicht */ }
            return 0;
        }

        void SchreibeGesehen(long wert)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(GesehenDatei));
                File.WriteAllText(GesehenDatei, wert.ToString());
            }
            catch { /* nicht schlimm, dann meldet er es einmal doppelt */ }
        }

        void HoleRueckmeldungen()
        {
            if (!e.Vollstaendig) return;

            Einstellungen kopie = e;
            ThreadPool.QueueUserWorkItem(delegate
            {
                List<MeineRunde> runden = sender.MeineRunden(kopie);
                BeginInvoke((MethodInvoker)delegate { ZeigeRueckmeldungen(runden); });
            });
        }

        /* Beim ersten Abruf nach dem Start wird der STAND gezeigt, danach
           nur noch, was neu entschieden wurde.

           Ohne das faengt die Liste nach jedem Neustart bei null an, und
           die Frage "was ist eigentlich freigegeben?" liesse sich im
           Client gar nicht beantworten. */
        void ZeigeRueckmeldungen(List<MeineRunde> runden)
        {
            long gesehen = LiesGesehen();
            long neuestes = gesehen;

            /*
               Die Liste zeigt den STAND der letzten 15 Einreichungen, nicht
               eine Ereignisfolge - deshalb wird sie jedes Mal neu gebaut.
               Nur die eigenen Sende-Meldungen aus dieser Sitzung bleiben
               oben stehen, die haengen an keiner Runde.

                 gruen  zaehlt gerade
                 grau   freigegeben, aber aus dem Fenster der letzten zehn
                        gefallen - nicht "weg", nur nicht mehr in der Wertung
                 rot    abgelehnt, mit Grund
                 gelb   wartet noch auf die Pruefung
            */
            for (int i = verlauf.Items.Count - 1; i >= 0; i--)
            {
                if (verlauf.Items[i].Tag as string == "runde") verlauf.Items.RemoveAt(i);
            }

            foreach (MeineRunde m in runden)
            {
                string text;
                Color farbe;

                if (m.Status == "freigegeben" && m.Zaehlt)
                {
                    text = "Zählt";
                    farbe = Color.FromArgb(120, 210, 150);
                }
                else if (m.Status == "freigegeben")
                {
                    text = "Zählt nicht mehr (aus den letzten 10 gefallen)";
                    farbe = Color.FromArgb(130, 138, 152);
                }
                else if (m.Status == "abgelehnt")
                {
                    text = "Abgelehnt: " + (m.Grund.Length > 0 ? m.Grund : "ohne Angabe");
                    farbe = Color.FromArgb(232, 130, 120);
                }
                else
                {
                    text = "Wartet auf Prüfung";
                    farbe = Color.FromArgb(240, 180, 65);
                }

                long zeit = m.BearbeitetAm > 0 ? m.BearbeitetAm : m.Eingegangen;
                ListViewItem eintrag = new ListViewItem(Uhrzeit(zeit));
                eintrag.SubItems.Add(m.Status == "freigegeben" ? (m.Zaehlt ? "OK" : "–")
                    : (m.Status == "abgelehnt" ? "!" : "…"));
                eintrag.SubItems.Add(text);
                eintrag.SubItems.Add(m.Punkte);
                eintrag.ForeColor = farbe;
                eintrag.Tag = "runde";
                verlauf.Items.Add(eintrag);

                /* Eine frische Ablehnung soll auffallen, auch wenn das
                   Fenster zu ist - aber nur einmal. */
                if (m.Status == "abgelehnt" && m.BearbeitetAm > gesehen) Melde(text);
                if (m.BearbeitetAm > neuestes) neuestes = m.BearbeitetAm;
            }

            if (neuestes > gesehen) SchreibeGesehen(neuestes);
        }

        /// <summary>Zeitstempel des Servers als Uhrzeit, notfalls jetzt.</summary>
        static string Uhrzeit(long ms)
        {
            if (ms <= 0) return DateTime.Now.ToString("HH:mm");
            DateTime t = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(ms);
            return t.ToLocalTime().ToString("HH:mm");
        }

        /// <summary>Fragt im Hintergrund, wer hinter dem Token steckt.</summary>
        void HoleAuskunft()
        {
            if (!e.Vollstaendig) return;

            Einstellungen kopie = e;
            ThreadPool.QueueUserWorkItem(delegate
            {
                Auskunft a = sender.WerBinIch(kopie);
                BeginInvoke((MethodInvoker)delegate
                {
                    auskunft = a;
                    Aktualisiere();
                });
            });
        }

        void Aktualisiere()
        {
            if (!e.Vollstaendig)
            {
                statusZeile.Text = "Noch nicht eingerichtet";
                serverZeile.Text = "Token eintragen, dann Bildschirm wählen.";
                return;
            }

            int w = sender.Wartend;
            statusZeile.Text = "Bereit  –  " + e.Taste + " drücken" +
                (w > 0 ? "   (" + w + " in der Warteschlange)" : "");
            /* Die Serveradresse steht hier bewusst NICHT mehr. Sie ist
               fest eingebaut, und niemand soll sie abschreiben und
               anderswo hinschicken muessen oder koennen.

               Stattdessen steht hier, WER man ist - der Ingame-Name
               entscheidet, welche Zeile aus dem Bild gewertet wird, und
               ist das Einzige, was der Zuschauer nachpruefen kann. */
            string wer;
            if (auskunft == null) wer = "Zugang wird geprüft …";
            else if (auskunft.Gesperrt)
                wer = "Zugang GESPERRT" +
                      (auskunft.Sperrgrund.Length > 0 ? ": " + auskunft.Sperrgrund : "");
            else if (!auskunft.Ok)
                wer = auskunft.Fehler.Length > 0 ? auskunft.Fehler : "Zugang unklar";
            else if (auskunft.GanzeLobby) wer = auskunft.Name + " · ganze Lobby";
            else wer = "Im Spiel: " + (auskunft.IngameName.Length > 0
                ? auskunft.IngameName
                : "kein Name hinterlegt");

            /* Veraltete Fassung deutlich sagen: nach einem Serverumzug
               ist die Adresse in der alten .exe falsch, und der Zuschauer
               wuerde ewig auf Antworten warten, die nie kommen. */
            bool veraltet = auskunft != null && auskunft.Ok &&
                auskunft.NeuesteVersion.Length > 0 &&
                auskunft.NeuesteVersion != Info.Version;

            /* Wie weit bis zur Wertung. turnier fuehrt jeden erst ab zehn
               Eintraegen in der Liste - ohne diesen Hinweis wundert sich
               ein Neuer, warum seine Runden zaehlen, er aber nirgends
               auftaucht. */
            Wertung wert = sender.LetzteWertung;
            string stand = wert.Gewertet >= wert.Voll
                ? "in der Wertung"
                : wert.Gewertet + "/" + wert.Voll + " bis zur Wertung";

            serverZeile.Text = wer + "   ·   " + stand +
                "   ·   Bildschirm " + e.Bildschirm +
                " (" + Schirme.Beschriftung(e.Bildschirm) + ")" +
                (veraltet ? "   ·   NEUE FASSUNG " + auskunft.NeuesteVersion +
                            " verfügbar – „Zugang holen\" öffnet die Seite" : "");

            if (veraltet)
                serverZeile.ForeColor = Color.FromArgb(240, 180, 65);
            else if (auskunft != null && (auskunft.Gesperrt || !auskunft.Ok))
                serverZeile.ForeColor = Color.FromArgb(232, 130, 120);
            else
                serverZeile.ForeColor = Color.FromArgb(150, 158, 172);
        }

        /// <summary>Oeffnet die Kontoseite des Servers im Browser.</summary>
        void OeffneKontoseite()
        {
            string adresse = e.Server.TrimEnd('/') + "/konto";
            try
            {
                System.Diagnostics.Process.Start(adresse);
                Melde("Kontoseite im Browser geöffnet. Dort Token kopieren.");
            }
            catch (Exception ex)
            {
                /* Kein Standardbrowser eingerichtet oder abgeschaltet -
                   dann wenigstens die Adresse zeigen, damit man sie
                   abtippen kann. */
                MessageBox.Show(
                    "Der Browser ließ sich nicht öffnen (" + ex.Message + ")." +
                    Environment.NewLine + Environment.NewLine + adresse,
                    Info.Projekt, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        void Beenden()
        {
            /* Mit Rueckfrage: waehrend des Streams beendet zu haben und es
               erst zu merken, wenn drei Runden nicht angekommen sind, ist
               aergerlicher als ein Klick zu viel. */
            DialogResult r = MessageBox.Show(
                "Meccha Ranked beenden?" + Environment.NewLine + Environment.NewLine +
                "Danach reagiert " + e.Taste + " nicht mehr, und Runden werden " +
                "nicht mehr verschickt.",
                Info.Projekt, MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (r != DialogResult.Yes) return;
            wirklichBeenden = true;
            Close();
        }

        void Melde(string text)
        {
            symbol.BalloonTipTitle = Info.Projekt;
            symbol.BalloonTipText = text;
            symbol.ShowBalloonTip(3000);
        }

        /* -------------------------------------------------- Schliessen */

        void ZeigeFenster()
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        void BeimSchliessen(object a, FormClosingEventArgs b)
        {
            /* X legt das Programm nur weg. Sonst wuerde ein
               versehentliches Zumachen mitten im Spiel die Aufnahme
               abschalten, ohne dass es jemand merkt. */
            if (b.CloseReason == CloseReason.UserClosing && !wirklichBeenden)
            {
                b.Cancel = true;
                Hide();
                Melde("Läuft weiter. " + e.Taste + " funktioniert. Beenden per Rechtsklick auf das Symbol.");
                return;
            }
            tastenUhr.Stop();
            symbol.Visible = false;
        }
    }

    static class Start
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            /* Die Einstellungen liegen NEBEN der Datei, nicht im
               Arbeitsverzeichnis - der Zuschauer legt das Programm
               irgendwohin und erwartet sie daneben. */
            string ordner = Path.GetDirectoryName(Application.ExecutablePath);
            string datei = Path.Combine(ordner, "client.json");
            Sender sender = new Sender(Path.Combine(ordner, "mc-ranked-daten"));

            Application.Run(new Fenster(datei, sender));
        }
    }
}
