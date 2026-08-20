/* =========================================================================
   MECCHA RANKED - das Fenster

   Aufbau nach Absprache:
     - ein Fenster, nichts versteckt: Status oben, letzte Runden darunter
     - Einstellungen als eigener Dialog hinter dem Zahnrad
     - X legt das Programm neben die Uhr, es laeuft weiter
     - Beenden ueber den Knopf unten oder per Rechtsklick auf das Symbol

   Alle sichtbaren Texte laufen durch Sprache.T(). Der deutsche Satz ist
   dabei der Schluessel - siehe Sprache.cs.

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
        Label statusZeile, serverZeile, fussZeile;
        ListView verlauf;
        Label infoKasten;
        Button knopfSenden, knopfEinstellungen, knopfAktualisieren, knopfBeenden;
        ToolStripItem punktZeigen, punktBeenden;
        TextBox feldToken;
        Button knopfTokenAendern;
        ComboBox feldSprache;
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
            /* Vor dem ersten Aufbau setzen, sonst entsteht das Fenster
               auf Englisch und wechselt sichtbar nach. */
            Sprache.Aktuell = e.Sprache;
            gewaehlterSchirm = e.Bildschirm;

            BaueFenster();
            BaueSymbol();
            /* Erst hier: Beschriften fasst auch das Symbolmenue an, und
               das entsteht in BaueSymbol. */
            Beschriften();
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
            BackColor = Farben.Grund;
            ForeColor = Farben.Text;
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
                ForeColor = Farben.Leise
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
                BackColor = Farben.Kante,
                Font = new Font("Segoe UI Symbol", 12f)
            };
            knopfEinstellungen.Click += (a, b) => ZeigeEinstellungen(true);

            /* Der Info-Kasten ueber der Liste: was von MIR gerade noch
               offen ist und was zuletzt abgelehnt wurde.

               Die Liste zeigt alles der Reihe nach; genau darin geht die
               eine Frage unter, die einen Zuschauer wirklich umtreibt -
               "haengt bei mir noch was?". Der Kasten beantwortet sie,
               ohne dass man scrollt. Er verschwindet, wenn es nichts zu
               sagen gibt: ein dauerhaft leerer Kasten waere nur
               weggenommene Hoehe. */
            infoKasten = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = false,
                Height = 0,
                Visible = false,
                Padding = new Padding(14, 8, 14, 8),
                BackColor = Farben.Kante,
                ForeColor = Farben.Text,
                TextAlign = ContentAlignment.MiddleLeft
            };

            verlauf = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                GridLines = false,
                BackColor = Farben.Tiefe,
                ForeColor = Farben.Text,
                BorderStyle = BorderStyle.None
            };
            // Beschriftet werden sie in Beschriften() - hier nur der Platz.
            verlauf.Columns.Add("", 60);
            verlauf.Columns.Add("", 26);
            verlauf.Columns.Add("", 300);
            verlauf.Columns.Add("", 90, HorizontalAlignment.Right);
            /* Klick klappt auf und zu. Nicht DoubleClick: den findet
               niemand von selbst, und der Pfeil vor der Uhrzeit laedt
               zum einfachen Klick ein. */
            verlauf.Click += (a, b) => KlappeUm();

            knopfSenden = new Button
            {
                Dock = DockStyle.Bottom,
                Height = 38,
                FlatStyle = FlatStyle.Flat,
                BackColor = Farben.Blau,
                Cursor = Cursors.Hand
            };
            knopfSenden.FlatAppearance.BorderSize = 0;
            knopfSenden.Click += (a, b) => EineRunde();

            /*
               Beenden gehoert ins Fenster.

               Das X legt das Programm absichtlich nur neben die Uhr - so
               laeuft die Tastenueberwachung weiter, auch wenn jemand aus
               Gewohnheit zuklickt. Der einzige Weg zurueck war bisher der
               Rechtsklick auf das Symbol, und den findet niemand von
               selbst. Also hier ein sichtbarer Knopf.
            */
            fussZeile = new Label
            {
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Farben.Sehrleise,
                Padding = new Padding(14, 0, 0, 0)
            };

            knopfBeenden = new Button
            {
                Dock = DockStyle.Right,
                Width = 110,
                FlatStyle = FlatStyle.Flat,
                BackColor = Farben.RotFlaeche,
                ForeColor = Farben.Rot,
                Cursor = Cursors.Hand
            };
            knopfBeenden.FlatAppearance.BorderSize = 0;
            knopfBeenden.Click += (a, b) => Beenden();

            /* Nachsehen, ohne auf den Minutentakt zu warten - nach einer
               Einreichung will man gleich wissen, ob sie durch ist. */
            knopfAktualisieren = new Button
            {
                Dock = DockStyle.Right,
                Width = 120,
                FlatStyle = FlatStyle.Flat,
                BackColor = Farben.Kante,
                Cursor = Cursors.Hand
            };
            knopfAktualisieren.FlatAppearance.BorderSize = 0;
            knopfAktualisieren.Click += (a, b) =>
            {
                HoleAuskunft();
                HoleRueckmeldungen();
                Nachreichen();
                Melde(Sprache.T("Wird nachgesehen …"));
            };

            Panel fussLeiste = new Panel { Dock = DockStyle.Bottom, Height = 30 };
            // Reihenfolge zaehlt: das zuletzt hinzugefuegte dockt zuerst.
            fussLeiste.Controls.Add(fussZeile);
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
            Controls.Add(infoKasten);
            Controls.Add(knopfSenden);
            Controls.Add(fussLeiste);
            Controls.Add(kopfLeiste);

            FormClosing += BeimSchliessen;
        }

        void BaueSymbol()
        {
            ContextMenuStrip menue = new ContextMenuStrip();
            punktZeigen = menue.Items.Add("", null, (a, b) => ZeigeFenster());
            menue.Items.Add(new ToolStripSeparator());
            punktBeenden = menue.Items.Add("", null, (a, b) => { wirklichBeenden = true; Close(); });

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
                        ? Farben.Blau
                        : Farben.Kante,
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

        /* ============================================== EINSTELLUNGEN

           Ein eigenes Fenster, das bei jedem Oeffnen frisch entsteht.

           Vorher war es ein Panel, das ins Hauptfenster gehoerte und zum
           Anzeigen in einen Dialog umzog. Das sparte Code, hatte aber
           zwei Haken: der Bereich musste danach wieder zurueckgeholt
           werden - vergisst man das, ist er beim naechsten Mal weg - und
           beim Sprachwechsel haetten alle Beschriftungen nachgezogen
           werden muessen. Frisch bauen ist ein paar Zeilen mehr und
           dafuer eine Sorge weniger.

           Gegliedert nach dem, was man tut: erst der Zugang, dann die
           Aufnahme, dann die Sprache. Vorher standen Token, Bildschirm
           und Taste ohne Trennung untereinander, und der Speichern-Knopf
           schwamm irgendwo dazwischen mit. Jetzt sitzt er unten in einer
           festen Leiste, wo er in jedem Dialog sitzt.
        */
        Form einstellungsFenster;

        static Label Ueberschrift(string text)
        {
            /* Gesperrt gesetzt und klein: eine Abschnittsmarke soll den
               Blick fuehren, nicht um Aufmerksamkeit mit dem Inhalt
               konkurrieren. */
            return new Label
            {
                Text = string.Join(" ", Sprache.T(text).ToUpperInvariant().ToCharArray()),
                Dock = DockStyle.Top,
                Height = 20,
                ForeColor = Farben.BlauText,
                Font = new Font("Segoe UI", 7.5f, FontStyle.Bold)
            };
        }

        static Label Hilfe(string text)
        {
            return new Label
            {
                Text = Sprache.T(text),
                Dock = DockStyle.Top,
                Height = 32,
                ForeColor = Farben.Sehrleise,
                Padding = new Padding(0, 1, 0, 0)
            };
        }

        static Panel Trenner()
        {
            Panel aussen = new Panel { Dock = DockStyle.Top, Height = 21 };
            aussen.Controls.Add(new Panel
            {
                Dock = DockStyle.Bottom, Height = 1, BackColor = Farben.Kante
            });
            return aussen;
        }

        static Panel Luft(int hoehe)
        {
            return new Panel { Dock = DockStyle.Top, Height = hoehe };
        }

        static Button Knopf(string text, int hoehe, Color hintergrund, Color vordergrund)
        {
            Button b = new Button
            {
                Text = Sprache.T(text),
                Height = hoehe,
                FlatStyle = FlatStyle.Flat,
                BackColor = hintergrund,
                ForeColor = vordergrund,
                Cursor = Cursors.Hand
            };
            b.FlatAppearance.BorderSize = 0;
            return b;
        }

        void ZeigeEinstellungen(bool an)
        {
            if (!an)
            {
                if (einstellungsFenster != null) einstellungsFenster.Close();
                return;
            }
            if (einstellungsFenster != null) { einstellungsFenster.Activate(); return; }

            einstellungsFenster = new Form
            {
                Text = Info.Projekt + " – " + Sprache.T("Einstellungen"),
                Width = 640,
                Height = 600,
                StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MinimizeBox = false,
                MaximizeBox = false,
                ShowInTaskbar = false,
                BackColor = Farben.Grund,
                ForeColor = Farben.Text,
                Font = Font
            };

            /* -------------------------------------------------- Zugang */
            feldToken = new TextBox
            {
                Dock = DockStyle.Fill,
                Text = e.Token,
                BorderStyle = BorderStyle.FixedSingle
            };

            knopfTokenAendern = Knopf("Ändern", 24, Farben.Kante, Farben.Text);
            knopfTokenAendern.Dock = DockStyle.Fill;
            knopfTokenAendern.Margin = new Padding(8, 0, 0, 0);
            knopfTokenAendern.Click += (a, b) => TokenFreigeben();

            TableLayoutPanel tokenZeile = new TableLayoutPanel
            {
                Dock = DockStyle.Top, Height = 26, ColumnCount = 3, RowCount = 1,
                Margin = new Padding(0)
            };
            tokenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
            tokenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            tokenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96));
            tokenZeile.Controls.Add(new Label
            {
                Text = Sprache.T("Token"), Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft
            }, 0, 0);
            tokenZeile.Controls.Add(feldToken, 1, 0);
            tokenZeile.Controls.Add(knopfTokenAendern, 2, 0);

            TokenSperren();

            /* Der Weg zum Token, ohne dass jemand eine Adresse kennen muss.

               Die Serveradresse steht fest in der .exe und wird bewusst
               nirgends angezeigt - also kann der Zuschauer die Kontoseite
               auch nicht selbst aufrufen. Dieser Knopf oeffnet sie im
               Browser: dort meldet er sich ueber Steam an, traegt seinen
               Ingame-Namen ein und kopiert den Token hierher. */
            Button zugang = Knopf("Zugang holen  –  Anmeldung über Steam", 32,
                                  Farben.BlauLeise, Farben.BlauText);
            zugang.Dock = DockStyle.Top;
            zugang.Click += (a, b) => OeffneKontoseite();

            /* ------------------------------------------------ Aufnahme */
            schirmLeiste = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 128,
                AutoScroll = true,
                WrapContents = false
            };

            Button erneuern = Knopf("Vorschau erneuern", 26, Farben.Kante, Farben.Leise);
            erneuern.Dock = DockStyle.Top;
            erneuern.Click += (a, b) => BaueSchirme();

            feldTaste = new ComboBox
            {
                Dock = DockStyle.Fill,
                DropDownStyle = ComboBoxStyle.DropDownList,
                FlatStyle = FlatStyle.Flat
            };
            feldTaste.Items.AddRange(Tasten.Namen);
            feldTaste.SelectedItem = e.Taste;
            if (feldTaste.SelectedIndex < 0) feldTaste.SelectedItem = "F9";

            TableLayoutPanel tastenZeile = new TableLayoutPanel
            {
                Dock = DockStyle.Top, Height = 26, ColumnCount = 3, RowCount = 1,
                Margin = new Padding(0)
            };
            tastenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
            tastenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
            tastenZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            tastenZeile.Controls.Add(new Label
            {
                Text = Sprache.T("Taste"), Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft
            }, 0, 0);
            tastenZeile.Controls.Add(feldTaste, 1, 0);

            /* ------------------------------------------------- Sprache */
            feldSprache = new ComboBox
            {
                Dock = DockStyle.Fill,
                DropDownStyle = ComboBoxStyle.DropDownList,
                FlatStyle = FlatStyle.Flat
            };
            feldSprache.Items.AddRange(Sprache.Namen);
            /* Ueber den Index, nicht ueber den angezeigten Namen: gesucht
               wird die Kennung ("en"), und die steht nicht im Feld. Eine
               Suche nach dem Namen haette bei jeder Umbenennung still auf
               den ersten Eintrag zurueckgesetzt. */
            feldSprache.SelectedIndex = 0;
            for (int i = 0; i < Sprache.Kennungen.Length; i++)
                if (Sprache.Kennungen[i] == e.Sprache) feldSprache.SelectedIndex = i;

            TableLayoutPanel sprachZeile = new TableLayoutPanel
            {
                Dock = DockStyle.Top, Height = 26, ColumnCount = 3, RowCount = 1,
                Margin = new Padding(0)
            };
            sprachZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
            sprachZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
            sprachZeile.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            sprachZeile.Controls.Add(new Label
            {
                Text = Sprache.T("Sprache"), Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft
            }, 0, 0);
            sprachZeile.Controls.Add(feldSprache, 1, 0);

            /* ---------------------------------------------------- Fuss */
            Button speichern = Knopf("Speichern", 32, Farben.Blau, Farben.Text);
            speichern.Dock = DockStyle.Right;
            speichern.Width = 130;
            speichern.Click += (a, b) => Speichern();

            Button abbrechen = Knopf("Abbrechen", 32, Farben.Kante, Farben.Leise);
            abbrechen.Dock = DockStyle.Right;
            abbrechen.Width = 110;
            abbrechen.Margin = new Padding(0, 0, 8, 0);
            abbrechen.Click += (a, b) => ZeigeEinstellungen(false);

            Panel fussInnen = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 10, 0, 0) };
            // Zuletzt hinzugefuegt dockt zuerst - Speichern soll ganz rechts stehen.
            fussInnen.Controls.Add(new Panel { Dock = DockStyle.Right, Width = 8 });
            fussInnen.Controls.Add(abbrechen);
            fussInnen.Controls.Add(new Panel { Dock = DockStyle.Right, Width = 8 });
            fussInnen.Controls.Add(speichern);

            Panel fuss = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 56,
                Padding = new Padding(20, 0, 20, 12),
                BackColor = Farben.Flaeche
            };
            fuss.Controls.Add(fussInnen);

            /* --------------------------------------------- zusammenbauen

               Dock=Top heisst: das zuletzt Hinzugefuegte sitzt oben.
               Deshalb steht die Liste hier von unten nach oben. */
            Panel inhalt = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(20, 14, 20, 6),
                AutoScroll = true
            };
            inhalt.Controls.Add(sprachZeile);
            inhalt.Controls.Add(Ueberschrift("Sprache"));
            inhalt.Controls.Add(Trenner());
            inhalt.Controls.Add(Hilfe("Diese Taste löst die Aufnahme aus. Das Spiel bekommt sie weiterhin."));
            inhalt.Controls.Add(tastenZeile);
            inhalt.Controls.Add(Luft(10));
            inhalt.Controls.Add(erneuern);
            inhalt.Controls.Add(schirmLeiste);
            inhalt.Controls.Add(Hilfe("Auf welchem Bildschirm läuft Meccha?"));
            inhalt.Controls.Add(Ueberschrift("Aufnahme"));
            inhalt.Controls.Add(Trenner());
            inhalt.Controls.Add(zugang);
            inhalt.Controls.Add(Luft(10));
            inhalt.Controls.Add(tokenZeile);
            inhalt.Controls.Add(Hilfe("Dein Zugang zum Server. Steht auf der Kontoseite."));
            inhalt.Controls.Add(Ueberschrift("Zugang"));

            einstellungsFenster.Controls.Add(inhalt);
            einstellungsFenster.Controls.Add(fuss);

            /* Beim ersten Start geht dieser Dialog von allein auf, und
               dann steht der Zuschauer vor drei Abschnitten ohne zu
               wissen, welche er ausfuellen muss. Der Streifen sagt es -
               und verschwindet, sobald es eingerichtet ist. */
            if (!e.Vollstaendig)
            {
                Label wink = new Label
                {
                    Text = Sprache.T("Beides muss eingetragen sein, sonst wird nichts gesendet: " +
                                     "der Token sagt, wer du bist, der Bildschirm, wo Meccha läuft."),
                    Dock = DockStyle.Top,
                    Height = 46,
                    Padding = new Padding(20, 9, 20, 0),
                    BackColor = Farben.BlauLeise,
                    ForeColor = Farben.BlauText
                };
                einstellungsFenster.Controls.Add(wink);
                einstellungsFenster.Height += wink.Height;
            }

            BaueSchirme();

            einstellungsFenster.FormClosed += (a, b) => { einstellungsFenster = null; };
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
            feldToken.BackColor = hat ? Farben.Flaeche : Color.White;
            feldToken.ForeColor = hat ? Farben.Leise : Color.Black;
            knopfTokenAendern.Enabled = hat;
        }

        void TokenFreigeben()
        {
            /* Bewusst mit Rueckfrage und mit "Nein" als Vorgabe: das hier
               ist der einzige Weg zurueck, wenn jemand seinen Token
               weggeworfen hat, und dann braucht er einen neuen vom
               Streamer. Ein Fehlklick soll das nicht ausloesen. */
            DialogResult r = MessageBox.Show(
                Sprache.T("Deinen Zugang wirklich ändern?") +
                Environment.NewLine + Environment.NewLine +
                Sprache.T("Der eingetragene Token wird dabei entfernt. Du brauchst " +
                          "dann einen neuen von der Kontoseite - ohne ihn kannst du " +
                          "nichts mehr einreichen."),
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
                MessageBox.Show(
                    Sprache.T("Trag zuerst deinen Token ein. Den bekommst du auf der Kontoseite."),
                    Info.Projekt, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            e.Token = token;
            e.Bildschirm = gewaehlterSchirm;
            e.Taste = (feldTaste.SelectedItem ?? "F9").ToString();

            /* Sprache erst hier uebernehmen: waehrend der Dialog offen
               ist, soll er nicht mitten unter der Hand umspringen. */
            int i = feldSprache != null ? feldSprache.SelectedIndex : -1;
            if (i >= 0 && i < Sprache.Kennungen.Length) e.Sprache = Sprache.Kennungen[i];
            bool andereSprache = Sprache.Aktuell != e.Sprache;
            Sprache.Aktuell = e.Sprache;

            e.Speichern(einstellungenDatei);

            TokenSperren();
            SetzeTaste();
            ZeigeEinstellungen(false);
            if (andereSprache) Beschriften();
            auskunft = null;
            Aktualisiere();
            HoleAuskunft();
            HoleRueckmeldungen();
            Melde(Sprache.T("Gespeichert."));
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
                Melde(Sprache.T("Erst den Token eintragen."));
                ZeigeEinstellungen(true);
                return;
            }

            laeuft = true;
            knopfSenden.Enabled = false;
            statusZeile.Text = Sprache.T("Nehme auf und sende …");

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
                Fertig(false, Sprache.T("Aufnahme fehlgeschlagen: {0}", ex.Message), null);
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
                        : (a.Nochmal ? a.Hinweis + " – " + Sprache.T("liegt in der Warteschlange")
                          : a.ZuWenige ? a.Hinweis   // eigener Satz, kein "Abgelehnt:"
                                     : Sprache.T("Abgelehnt: {0}", a.Hinweis)), a);
                });
            });
        }

        void Fertig(bool ok, string text, Antwort a)
        {
            laeuft = false;
            knopfSenden.Enabled = true;
            // Die frische Einreichung soll sofort in der Liste stehen.
            if (ok) HoleRueckmeldungen();

            /* Drei Zustaende, drei Farben: gruen angenommen, gelb "zaehlt
               nicht" (Lobby zu klein - kein Fehler des Zuschauers), rot
               abgelehnt. Das Zeichen in der zweiten Spalte zieht mit. */
            bool zuWenige = a != null && a.ZuWenige;
            ListViewItem eintrag = new ListViewItem(DateTime.Now.ToString("HH:mm"));
            eintrag.SubItems.Add(ok ? "OK" : (zuWenige ? "–" : "!"));
            eintrag.SubItems.Add(text);
            eintrag.SubItems.Add("");
            eintrag.ForeColor = ok ? Farben.Gruen : (zuWenige ? Farben.Gelb : Farben.Rot);
            /* Eine erfolgreiche Einreichung gehoert zum STAND: beim
               naechsten Aktualisieren ersetzt sie die Zeile vom Server
               ("wartet auf Pruefung" bzw. "zaehlt"). Sonst stuende die
               Runde doppelt da - einmal als "eingereicht", einmal mit
               ihrem tatsaechlichen Ausgang.

               Fehlschlaege bleiben stehen: zu ihnen gibt es keine Runde
               beim Server, und sie sollen nicht lautlos verschwinden. */
            Zeilendaten frisch = new Zeilendaten();
            frisch.Art = ok ? "runde" : "senden";
            eintrag.Tag = frisch;
            verlauf.Items.Insert(0, eintrag);

            /* Hier wurden frueher ALLE gelesenen Zeilen flach in die
               Liste geschuettet - eine je Mitspieler, ohne Einrueckung,
               ohne Bezug zur Runde darueber. Bei einer 13er-Lobby waren
               das dreizehn namenlose Zeilen zwischen den eigenen Runden.

               Die Absicht war richtig - man soll sehen, was gelesen
               wurde -, nur der Ort war falsch. Das steht jetzt unter der
               Runde, beim Aufklappen, und beschraenkt auf die eigene
               Zeile: fremde Namen helfen beim Nachpruefen nicht. */

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
                        Melde(Sprache.T("{0} Runde(n) nachgereicht.", raus));
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
        /// <summary>Merkt sich, was hinter einer Verlaufszeile steckt.</summary>
        class Zeilendaten
        {
            /// <summary>"runde" vom Server, "senden" aus dieser Sitzung, "detail" aufgeklappt.</summary>
            public string Art = "runde";
            /// <summary>Null bei reinen Sende-Meldungen.</summary>
            public MeineRunde Runde;
            public bool Offen;
        }

        const string PfeilZu = "▸ ";     // kleines Dreieck nach rechts
        const string PfeilAuf = "▾ ";    // kleines Dreieck nach unten

        void ZeigeRueckmeldungen(List<MeineRunde> runden)
        {
            long gesehen = LiesGesehen();
            long neuestes = gesehen;

            /*
               Die Liste zeigt den STAND der letzten Einreichungen, nicht
               eine Ereignisfolge - deshalb wird sie jedes Mal neu gebaut.
               Nur die eigenen Sende-Meldungen aus dieser Sitzung bleiben
               oben stehen, die haengen an keiner Runde.

                 gruen  zaehlt gerade
                 grau   freigegeben, aber aus dem Fenster der letzten zehn
                        gefallen - nicht "weg", nur nicht mehr in der Wertung
                 rot    abgelehnt, mit Grund
                 gelb   wartet noch auf die Pruefung

               Aufgeklappte Zeilen gehen dabei zu. Das ist Absicht: nach
               einer Aktualisierung kann dieselbe Runde einen anderen
               Ausgang haben, und eine offene Detailzeile mit veralteten
               Angaben waere schlimmer als eine geschlossene.
            */
            for (int i = verlauf.Items.Count - 1; i >= 0; i--)
            {
                Zeilendaten d = verlauf.Items[i].Tag as Zeilendaten;
                if (d == null || d.Art == "runde" || d.Art == "detail")
                {
                    verlauf.Items.RemoveAt(i);
                }
            }

            int offene = 0;
            string letzteAblehnung = "";

            foreach (MeineRunde m in runden)
            {
                string text;
                Color farbe;

                if (m.Status == "freigegeben" && m.Zaehlt)
                {
                    text = Sprache.T("Zählt");
                    farbe = Farben.Gruen;
                }
                else if (m.Status == "freigegeben")
                {
                    text = Sprache.T("Zählt nicht mehr (aus den letzten 10 gefallen)");
                    farbe = Farben.Grau;
                }
                else if (m.Status == "abgelehnt")
                {
                    text = Sprache.T("Abgelehnt: {0}",
                        m.Grund.Length > 0 ? m.Grund : Sprache.T("ohne Angabe"));
                    farbe = Farben.Rot;
                    if (letzteAblehnung.Length == 0) letzteAblehnung = text;
                }
                else
                {
                    text = Sprache.T("Wartet auf Prüfung");
                    farbe = Farben.Gelb;
                    offene++;
                }

                long zeit = m.BearbeitetAm > 0 ? m.BearbeitetAm : m.Eingegangen;
                ListViewItem eintrag = new ListViewItem(PfeilZu + Uhrzeit(zeit));
                eintrag.SubItems.Add(m.Status == "freigegeben" ? (m.Zaehlt ? "OK" : "–")
                    : (m.Status == "abgelehnt" ? "!" : "…"));
                eintrag.SubItems.Add(text);
                eintrag.SubItems.Add(m.Punkte);
                eintrag.ForeColor = farbe;

                Zeilendaten daten = new Zeilendaten();
                daten.Art = "runde";
                daten.Runde = m;
                eintrag.Tag = daten;
                verlauf.Items.Add(eintrag);

                /* Eine frische Ablehnung soll auffallen, auch wenn das
                   Fenster zu ist - aber nur einmal. */
                if (m.Status == "abgelehnt" && m.BearbeitetAm > gesehen) Melde(text);
                if (m.BearbeitetAm > neuestes) neuestes = m.BearbeitetAm;
            }

            ZeigeInfoKasten(offene, letzteAblehnung);
            if (neuestes > gesehen) SchreibeGesehen(neuestes);
        }

        /// <summary>
        /// Der Kasten ueber der Liste: was von MIR gerade noch offen ist.
        ///
        /// Die Liste zeigt alles der Reihe nach, und genau darin geht die
        /// eine Frage unter, die einen Zuschauer wirklich umtreibt -
        /// "haengt bei mir noch was?". Ist nichts offen und nichts
        /// abgelehnt, verschwindet der Kasten: dauerhaft leere Flaeche
        /// waere nur weggenommene Hoehe.
        /// </summary>
        void ZeigeInfoKasten(int offene, string letzteAblehnung)
        {
            List<string> saetze = new List<string>();

            if (offene == 1) saetze.Add(Sprache.T("1 Runde wartet auf Prüfung"));
            else if (offene > 1) saetze.Add(Sprache.T("{0} Runden warten auf Prüfung", offene.ToString()));

            if (letzteAblehnung.Length > 0) saetze.Add(Sprache.T("Zuletzt {0}", letzteAblehnung));

            if (saetze.Count == 0)
            {
                infoKasten.Visible = false;
                infoKasten.Height = 0;
                return;
            }

            infoKasten.Text = string.Join(Environment.NewLine, saetze.ToArray());
            infoKasten.Height = 16 + saetze.Count * 18;
            infoKasten.ForeColor = letzteAblehnung.Length > 0 ? Farben.Rot : Farben.Gelb;
            infoKasten.Visible = true;
        }

        /// <summary>
        /// Klappt die angeklickte Runde auf oder zu.
        ///
        /// Eine ListView kann das nicht von Haus aus. Der Trick ist
        /// schlicht: die Detailzeilen werden direkt hinter der Runde
        /// eingefuegt und beim Zuklappen wieder entfernt. Sie tragen die
        /// Art "detail" und fliegen beim naechsten Aufbau ohnehin raus.
        /// </summary>
        void KlappeUm()
        {
            if (verlauf.SelectedItems.Count == 0) return;
            ListViewItem gewaehlt = verlauf.SelectedItems[0];

            Zeilendaten d = gewaehlt.Tag as Zeilendaten;
            if (d == null || d.Runde == null) return;   // Sende-Meldung, nichts zu zeigen

            int wo = gewaehlt.Index;

            if (d.Offen)
            {
                while (wo + 1 < verlauf.Items.Count)
                {
                    Zeilendaten n = verlauf.Items[wo + 1].Tag as Zeilendaten;
                    if (n == null || n.Art != "detail") break;
                    verlauf.Items.RemoveAt(wo + 1);
                }
                d.Offen = false;
                gewaehlt.Text = PfeilZu + gewaehlt.Text.Substring(PfeilAuf.Length);
                return;
            }

            int eingefuegt = 0;
            foreach (string[] paar in Auskuenfte(d.Runde))
            {
                ListViewItem zeile = new ListViewItem("");
                zeile.SubItems.Add("");
                zeile.SubItems.Add("    " + paar[0]);
                zeile.SubItems.Add(paar[1]);
                zeile.ForeColor = Farben.Leise;
                Zeilendaten dd = new Zeilendaten();
                dd.Art = "detail";
                zeile.Tag = dd;
                verlauf.Items.Insert(wo + 1 + eingefuegt, zeile);
                eingefuegt++;
            }

            d.Offen = true;
            gewaehlt.Text = PfeilAuf + gewaehlt.Text.Substring(PfeilZu.Length);
        }

        /// <summary>
        /// Was unter einer aufgeklappten Runde steht.
        ///
        /// Ausdruecklich OHNE die Namen der Mitspieler - die Lobbygroesse
        /// als Zahl genuegt. Der eigene ROHNAME dagegen steht ganz oben:
        /// an ihm sieht man, wie der Leser einen verstanden hat, und wer
        /// sich beim Ingame-Namen vertippt hat, erkennt es hier und
        /// nirgends sonst.
        /// </summary>
        List<string[]> Auskuenfte(MeineRunde m)
        {
            List<string[]> raus = new List<string[]>();

            raus.Add(new string[] {
                Sprache.T("Gelesen als"),
                m.RohName.Length > 0 ? m.RohName : Sprache.T("deine Zeile wurde nicht gefunden")
            });

            if (m.Lobby > 0)
            {
                raus.Add(new string[] {
                    Sprache.T("Lobby"),
                    m.Rang > 0
                        ? Sprache.T("{0} Verstecker, du auf Rang {1}",
                            m.Lobby.ToString(), m.Rang.ToString())
                        : Sprache.T("{0} Verstecker", m.Lobby.ToString())
                });
            }

            raus.Add(new string[] { Sprache.T("Eingereicht"), Uhrzeit(m.Eingegangen) });

            if (m.BearbeitetAm > 0)
            {
                string wer = m.BearbeitetVon.Length > 0
                    ? Uhrzeit(m.BearbeitetAm) + "  ·  " + m.BearbeitetVon
                    : Uhrzeit(m.BearbeitetAm);
                raus.Add(new string[] {
                    m.Status == "abgelehnt" ? Sprache.T("Abgelehnt am") : Sprache.T("Freigegeben am"),
                    wer
                });
            }

            if (m.Status == "abgelehnt" && m.Grund.Length > 0)
                raus.Add(new string[] { Sprache.T("Grund"), m.Grund });

            if (m.Status == "offen")
                raus.Add(new string[] { Sprache.T("Stand"),
                    Sprache.T("wartet auf die Prüfung durch einen Mod") });

            if (m.Status == "freigegeben")
                raus.Add(new string[] { Sprache.T("Wertung"),
                    m.Zaehlt ? Sprache.T("zählt in den letzten 10")
                             : Sprache.T("aus den letzten 10 gefallen") });

            return raus;
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
                statusZeile.Text = Sprache.T("Noch nicht eingerichtet");
                serverZeile.Text = Sprache.T("Öffne oben rechts das Zahnrad und trag Token und Bildschirm ein.");
                return;
            }

            int w = sender.Wartend;
            statusZeile.Text = Sprache.T("Bereit  –  {0} drücken", e.Taste) +
                (w > 0 ? "   " + Sprache.T("({0} in der Warteschlange)", w) : "");
            /* Die Serveradresse steht hier bewusst NICHT mehr. Sie ist
               fest eingebaut, und niemand soll sie abschreiben und
               anderswo hinschicken muessen oder koennen.

               Stattdessen steht hier, WER man ist - der Ingame-Name
               entscheidet, welche Zeile aus dem Bild gewertet wird, und
               ist das Einzige, was der Zuschauer nachpruefen kann. */
            string wer;
            if (auskunft == null) wer = Sprache.T("Zugang wird geprüft …");
            else if (auskunft.Gesperrt)
                wer = Sprache.T("Zugang GESPERRT") +
                      (auskunft.Sperrgrund.Length > 0 ? ": " + auskunft.Sperrgrund : "");
            else if (!auskunft.Ok)
                wer = auskunft.Fehler.Length > 0 ? auskunft.Fehler : Sprache.T("Zugang unklar");
            else if (auskunft.GanzeLobby)
                wer = auskunft.Name + " · " + Sprache.T("ganze Lobby");
            else wer = Sprache.T("Im Spiel: {0}", auskunft.IngameName.Length > 0
                ? auskunft.IngameName
                : Sprache.T("kein Name hinterlegt"));

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
                ? Sprache.T("in der Wertung")
                : Sprache.T("{0}/{1} bis zur Wertung", wert.Gewertet, wert.Voll);

            serverZeile.Text = wer + "   ·   " + stand +
                "   ·   " + Sprache.T("Bildschirm {0}", e.Bildschirm) +
                " (" + Schirme.Beschriftung(e.Bildschirm) + ")" +
                (veraltet ? "   ·   " + Sprache.T(
                    "NEUE FASSUNG {0} verfügbar – „Zugang holen\" öffnet die Seite",
                    auskunft.NeuesteVersion) : "");

            if (veraltet)
                serverZeile.ForeColor = Farben.Gelb;
            else if (auskunft != null && (auskunft.Gesperrt || !auskunft.Ok))
                serverZeile.ForeColor = Farben.Rot;
            else
                serverZeile.ForeColor = Farben.Leise;
        }

        /// <summary>Oeffnet die Kontoseite des Servers im Browser.</summary>
        void OeffneKontoseite()
        {
            string adresse = e.Server.TrimEnd('/') + "/konto";
            try
            {
                System.Diagnostics.Process.Start(adresse);
                Melde(Sprache.T("Kontoseite im Browser geöffnet. Dort Token kopieren."));
            }
            catch (Exception ex)
            {
                /* Kein Standardbrowser eingerichtet oder abgeschaltet -
                   dann wenigstens die Adresse zeigen, damit man sie
                   abtippen kann. */
                MessageBox.Show(
                    Sprache.T("Der Browser ließ sich nicht öffnen ({0}).", ex.Message) +
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
                Sprache.T("Meccha Ranked beenden?") +
                Environment.NewLine + Environment.NewLine +
                Sprache.T("Danach reagiert {0} nicht mehr, und Runden werden " +
                          "nicht mehr verschickt.", e.Taste),
                Info.Projekt, MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (r != DialogResult.Yes) return;
            wirklichBeenden = true;
            Close();
        }

        /* Alle festen Beschriftungen an einer Stelle.

           Beim Sprachwechsel wird sie erneut gerufen - haetten die Texte
           weiterhin bei ihren Steuerelementen gestanden, muesste man dazu
           das ganze Fenster neu bauen und verloere den Verlauf. */
        void Beschriften()
        {
            Text = Info.Projekt;
            knopfSenden.Text = Sprache.T("Jetzt aufnehmen und senden");
            knopfAktualisieren.Text = Sprache.T("Aktualisieren");
            knopfBeenden.Text = Sprache.T("Beenden");
            fussZeile.Text = Info.Projekt + " " + Info.Version + "   ·   " +
                             Sprache.T("von {0}", Info.Entwickler);

            verlauf.Columns[0].Text = Sprache.T("Zeit");
            verlauf.Columns[2].Text = Sprache.T("Was");
            verlauf.Columns[3].Text = Sprache.T("Punkte");

            if (punktZeigen != null) punktZeigen.Text = Sprache.T("Fenster zeigen");
            if (punktBeenden != null) punktBeenden.Text = Sprache.T("Beenden");
            if (symbol != null) symbol.Text = Info.Projekt;
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
                Melde(Sprache.T(
                    "Läuft weiter. {0} funktioniert. Beenden per Rechtsklick auf das Symbol.",
                    e.Taste));
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

            /* ------------------------------------------------------ TLS

               .NET Framework 4 spricht von sich aus SSL 3.0 und TLS 1.0.
               Beides nimmt kein Server mehr an - nginx laesst nur noch
               TLS 1.2 und 1.3 zu. Ohne diese Zeilen scheitert schon der
               Verbindungsaufbau, und der Client meldet stumpf "Server
               nicht erreichbar", obwohl der Server tadellos laeuft.

               Solange die Adresse auf http://localhost zeigte, fiel das
               nicht auf - da gab es keine Verschluesselung. Erst mit dem
               Umzug auf https wurde daraus ein Totalausfall.

               Die Zahlen statt der Namen: SecurityProtocolType.Tls12 und
               .Tls13 gibt es im Enum von .NET 4.0 noch nicht. Die Werte
               wirken trotzdem, weil auf jedem Windows 10 laengst .NET
               4.5+ als Ersatz derselben Dateien liegt. */
            try
            {
                System.Net.ServicePointManager.SecurityProtocol =
                    (System.Net.SecurityProtocolType)3072 |    // TLS 1.2
                    (System.Net.SecurityProtocolType)12288;    // TLS 1.3
            }
            catch
            {
                /* Aeltere Maschine, die TLS 1.3 nicht kennt: dann
                   wenigstens 1.2 - damit kommt man ueberall durch. */
                try
                {
                    System.Net.ServicePointManager.SecurityProtocol =
                        (System.Net.SecurityProtocolType)3072;
                }
                catch { /* dann bleibt es bei der Vorgabe */ }
            }

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
