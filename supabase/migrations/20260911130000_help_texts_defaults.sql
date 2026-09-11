-- Help texts: return all rows for a page (empty bodies = intentionally cleared).
-- Member UI falls back to built-in defaults when a slot row is missing.
-- Seed below pre-fills Admin → Hilfe (ON CONFLICT DO NOTHING).

create or replace function public.list_help_texts_for_page(p_page_id text)
returns table (
  page_id text,
  slot_id text,
  title text,
  html_body text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    t.page_id,
    t.slot_id,
    t.title,
    t.html_body,
    t.updated_at
  from leseno.help_texts t
  where t.page_id = p_page_id
  order by t.slot_id asc;
$$;

revoke all on function public.list_help_texts_for_page(text) from public;
grant execute on function public.list_help_texts_for_page(text) to service_role;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'page', 'Hilfe — Meine Geschichte', '<p>Hier entsteht deine eigene Geschichte. Du wählst aus, für wen sie ist, wie schwer der Text sein darf und worum es gehen soll — dann startest du mit Credits.</p><ul><li>Mit einem Kinder-Profil wird die Geschichte persönlich (Name, Freunde, Interessen …).</li><li>Ohne Profil nutzt du „Freies lesen“ mit Thema und Schulstufe.</li><li>Fertige Geschichten findest du danach in Meine Bücherei (je nach Paket).</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'credits', 'Paket & Credits', '<p>Oben siehst du dein Paket und deine Credits. Jede neue Geschichte kostet Credits.</p><ul><li>Der Zähler zeigt, wie viele Credits du gerade hast.</li><li>Wenn Credits fehlen, kannst du je nach Einstellung welche nachkaufen.</li><li>Die genauen Kosten siehst du direkt über dem Start-Button.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'einladen', 'Freunde einladen', '<p>Lade Freunde zu leseno ein. Mit deinem Link können sie sich anmelden und mitlesen oder selbst Geschichten starten.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'leser', 'Für wen? / Leser', '<p>Hier entscheidest du, für wen die Geschichte ist.</p><ul><li><strong>Freies lesen</strong> — ohne Profil: du wählst Thema und Schulstufe selbst.</li><li><strong>Kinder-Profil</strong> — die Geschichte nutzt Name, Freunde und Vorlieben aus Meine Welt.</li><li>Profile legst du unter Meine Welt an. Fehlt noch eines, siehst du hier einen Hinweis.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'schulstufe', 'Schulstufe', '<p>Die Schulstufe steuert Sprache und Schwierigkeit. So passt der Text besser zum Leseniveau.</p><p>Jüngere Stufen: kürzere Sätze und einfachere Wörter. Höhere Stufen: mehr Tempo und komplexere Geschichten.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'hauptthema', 'Hauptthema', '<p>Das Hauptthema ist der Rahmen der Geschichte — z. B. Weltall, Detektiv oder Dschungel.</p><p>Tippe auf ein Thema. Mit „Mehr“ siehst du weitere Vorschläge. Das gewählte Thema bleibt gelb markiert.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'mehr-tiefgang', 'Mehr Tiefgang', '<p>Mit Mehr Tiefgang werden Gefühle und Konflikte realistischer: Figuren vertragen sich nicht sofort, und Emotionen bleiben spürbar.</p><ul><li>Schalter an: Tiefgang ist aktiv.</li><li>Optional kannst du ein Nebenthema wählen und festlegen, wie beide Themen sich mischen.</li><li>Bei persönlichen Geschichten gibt es Tiefgang ohne zweites Thema.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'textlaenge', 'Textlänge', '<p>Die Textlänge bestimmt, wie lang die Geschichte ungefähr wird — von kurz bis sehr ausführlich.</p><p>Längere Geschichten brauchen meist mehr Credits. Du kannst die Länge jederzeit vor dem Start ändern.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'stimmung', 'Art der Geschichte', '<p>Die Art der Geschichte legt die Stimmung fest — z. B. spannend, lustig oder motivierend.</p><p>Wähle die Stimmung, die gerade passt. Bei einem Profil ist hier oft schon ein Standard hinterlegt.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'starten', 'Geschichte starten', '<p>Mit dem orangenen Button startest du die Erzeugung. Solange die Geschichte entsteht, siehst du einen Wartedialog.</p><ul><li>Prüfe vorher Auswahl und Credits.</li><li>Reicht das Guthaben nicht, bleibt der Button ausgegraut.</li><li>Danach erscheint die fertige Geschichte zum Lesen und Weiterarbeiten.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('geschichte', 'ergebnis', 'Ergebnis & Lesewerkzeuge', '<p>Hier liegt deine fertige Geschichte. Je nach Paket kannst du vorlesen lassen, als PDF speichern, Fakten nachlesen oder weiterschreiben.</p><ul><li>Vorlesen / Markierung — wenn freigeschaltet.</li><li>Lesemodus — großer Lesebildschirm mit Schrift-Einstellungen.</li><li>Fortsetzung — die Geschichte kann weitergehen (je nach Paket).</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'page', 'Hilfe — Meine Welt', '<p>Meine Welt ist die Zentrale für Kinder-Profile. Hier hinterlegst du alles, was persönliche Geschichten besonders macht.</p><ul><li>Name, Schulstufe, Länge und Stimmung als Standard</li><li>Freunde, Interessen, Wünsche und Ängste</li><li>Extras wie Bilder oder Vorlesen — und optional Kind-Login</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'profil', 'Profile verwalten', '<p>Oben wechselst du zwischen den Profilen. Mit „Kind hinzufügen“ legst du ein weiteres Profil an (Familie-Paket).</p><p>Das gelbe Profil ist gerade aktiv. „Standard“ bedeutet: Meine Geschichte startet damit statt mit „Freies lesen“.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'name', 'Name des Kindes', '<p>Unter diesem Namen erscheint dein Kind als Hauptfigur in persönlichen Geschichten.</p><ul><li>Änderungen werden automatisch gespeichert.</li><li>Standardprofil: nur eines gleichzeitig — die Geschichten-Seite startet damit.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'schulstufe', 'Schulstufe', '<p>Die Schulstufe gilt als Standard für dieses Profil und steuert Sprache und Schwierigkeit.</p><p>Auf der Geschichten-Seite kannst du die Stufe für einzelne Geschichten trotzdem anpassen.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'textlaenge', 'Textlänge', '<p>Hier legst du die bevorzugte Textlänge für dieses Profil fest.</p><p>Beim Erzählen kannst du die Länge noch einmal ändern — der Profil-Standard bleibt erhalten.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'stimmung', 'Art der Geschichte', '<p>Die Art der Geschichte ist der Standard-Ton für dieses Profil (spannend, lustig, motivierend …).</p><p>Pro Geschichte kannst du die Stimmung später noch wechseln.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'freunde', 'Freundesliste', '<p>Trage Freunde oder Spitznamen ein, die in persönlichen Geschichten mitspielen dürfen.</p><p>Namen tippen und hinzufügen. Mit dem × entfernst du einen Eintrag wieder.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'interessen', 'Interessen', '<p>Was mag dein Kind besonders? Interessen fließen in Themen und Details der Geschichte ein.</p><p>Beispiele: Dinosaurier, Fußball, Weltall, Pferde, Basteln …</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'wuensche', 'Das möchte ich mal erleben', '<p>Hier gehören Wünsche und Träume hin — Dinge, die dein Kind gerne erleben würde.</p><p>Nicht schon Erlebtes, sondern Ideen für Abenteuer in der Geschichte.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'aengste', 'Davor habe ich Angst', '<p>Ängste werden standardmäßig in Geschichten vermieden, damit Lesen sich sicher anfühlt.</p><p>Optional „Sanft einbauen“: Bei Abenteuer- oder Motivierend-Geschichten kann eine Angst ganz leicht und behutsam vorkommen.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'extras', 'Extras', '<p>Extras schalten Zusatzfunktionen für Geschichten mit diesem Profil ein — je nachdem, was dein Paket erlaubt.</p><ul><li>Bilder — Illustrationen in der Geschichte</li><li>Silbenhilfe — Silben farblich markiert</li><li>Wort-Markierung — beim Vorlesen das aktuelle Wort</li><li>Vorlesbar — Play-Button und Tempo</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'lesemodus', 'Lesemodus', '<p>Im Lesemodus liest du die Geschichte groß und ruhig. Hier stellst du Schrift und Darstellung für dieses Profil ein.</p><p>Ohne eigene Werte gilt der Admin-Standard zur Schulstufe. „Auf Standard zurücksetzen“ holt diese Werte zurück.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-welt', 'kind-login', 'Kind-Login', '<p>Mit Kennung und Passwort kann sich dein Kind selbst anmelden — ohne E-Mail und ohne Zugriff auf Meine Welt.</p><ul><li>Kennung vergeben (muss frei sein) und Passwort setzen.</li><li>Ohne Passwort bleibt der Kind-Login aus.</li><li>Das Kind landet direkt bei Meine Geschichte mit dem eigenen Profil.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'page', 'Hilfe — Mein Buchclub', '<p>Im Buchclub verbindest du dich mit Freunden, teilst Geschichten und liest, was andere freigeben.</p><ul><li>Eigene Freundschaftskennung vergeben und teilen</li><li>Freunde per Kennung anfragen oder per E-Mail einladen</li><li>Freigegebene Geschichten lesen, liken und je nach Paket als PDF speichern</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'freunde-aktionen', 'Meine Freunde', '<p>In dieser Karte erledigst du alles rund um Freunde: Kennung, Anfragen, Liste und Einladungen.</p><p>Tippe auf einen Chip, um den passenden Dialog zu öffnen.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'freundschaftskennung', 'Freundschaftskennung', '<p>Deine Freundschaftskennung ist dein Name im Buchclub. Freunde finden dich damit.</p><p>Vergib eine Kennung, speichere sie und teile sie — z. B. in der Familie oder Klasse.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'freund-hinzufuegen', 'Freund hinzufügen', '<p>Gib die Kennung eines Freundes ein und sende eine Anfrage. Erst nach Bestätigung seid ihr verbunden.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'freundesliste', 'Freundesliste & Anfragen', '<p>Hier siehst du offene Anfragen und bestätigte Freunde.</p><ul><li>Eingehende Anfragen kannst du bestätigen oder ablehnen.</li><li>Ausgehende Anfragen kannst du zurückziehen.</li><li>Bestätigte Freunde lassen sich wieder entfernen.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'einladen', 'Per E-Mail einladen', '<p>Lade jemanden per E-Mail zu leseno ein. Die Person erhält einen Link zur Registrierung.</p><p>Danach könnt ihr euch im Buchclub per Kennung verbinden.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('mein-buchclub', 'freundegeschichten', 'Geschichten von Freunden', '<p>Hier erscheinen Geschichten von Freunden und öffentliche Freigaben aus Buchclubs.</p><ul><li>Tippe auf einen Titel zum Lesen.</li><li>Du kannst liken.</li><li>Je nach Paket kannst du Geschichten als PDF speichern.</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'page', 'Hilfe — Meine Bücherei', '<p>In der Bücherei liegen alle Geschichten, die du erzeugt hast — automatisch gespeichert.</p><ul><li>Titel antippen zum Lesen</li><li>Favorit und Gelesen markieren</li><li>Optional: Adventskalenderbücher und Freigabe für den Buchclub</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'advent', 'Adventskalenderbücher', '<p>Adventskalenderbücher sind Geschichten mit 24 Tagen. Hier öffnest du vorhandene Bücher oder legst ein neues an.</p><p>Der Status zeigt, ob das Buch fertig, in Arbeit oder unterbrochen ist.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'filter', 'Profilfilter', '<p>Mit den Filtern siehst du nur bestimmte Geschichten.</p><ul><li><strong>Alle</strong> — die ganze Bücherei</li><li><strong>Freies lesen</strong> — ohne Kinder-Profil</li><li>Oder ein bestimmtes Profil — nur dessen Geschichten</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'story-aktionen', 'Geschichten-Aktionen', '<p>Rechts an jeder Geschichte findest du Aktionen: Vorlesen (wenn vorhanden), Freigabe, Gelesen, Favorit und Löschen.</p><p>Welche Buttons sichtbar sind, hängt von deinem Paket und der Geschichte ab.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'buchclub-freigabe', 'Buchclub-Freigabe', '<p>Über die Freigabe entscheidest du, wer die Geschichte im Buchclub sehen darf.</p><ul><li>Nicht teilen — nur bei dir in der Bücherei</li><li>Mit Freunden — sichtbare Freunde im Buchclub</li><li>Öffentlich — für Buchclub-Mitglieder sichtbar</li></ul>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'favorit', 'Favorit', '<p>Mit dem Stern markierst du Lieblingsgeschichten. Favoriten erscheinen weiter oben in der Liste.</p><p>Nochmal tippen entfernt die Markierung.</p>')
on conflict (page_id, slot_id) do nothing;

insert into leseno.help_texts (page_id, slot_id, title, html_body)
values ('meine-buecherei', 'gelesen', 'Gelesen', '<p>Mit „Gelesen“ behältst du den Überblick, was ihr schon gelesen habt. Gelesene Titel wirken etwas zurückhaltender.</p><p>Nochmal tippen setzt den Status zurück auf ungelesen.</p>')
on conflict (page_id, slot_id) do nothing;
