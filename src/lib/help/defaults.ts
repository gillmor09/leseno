/**
 * Built-in help copy for member pages (easy German explanations).
 * Used when a slot has no DB row yet; Admin → Hilfe can override.
 */

import {
  HELP_PAGES,
  getHelpSlot,
  type HelpPageId,
} from "@/lib/help/catalog";

export type HelpDefault = {
  title: string;
  htmlBody: string;
};

function html(...blocks: string[]): string {
  return blocks.join("");
}

function p(text: string): string {
  return `<p>${text}</p>`;
}

function ul(...items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

/** Default title + HTML for one catalog slot, or null if unknown. */
export function getHelpDefault(
  pageId: HelpPageId,
  slotId: string,
): HelpDefault | null {
  const body = HELP_DEFAULT_BODIES[pageId]?.[slotId];
  if (!body?.trim()) return null;
  const slot = getHelpSlot(pageId, slotId);
  return {
    title: slot?.defaultTitle ?? "Hilfe",
    htmlBody: body.trim(),
  };
}

/** All catalog slots with default copy (for seed / admin prefill). */
export function listHelpDefaults(): Array<{
  pageId: HelpPageId;
  slotId: string;
  title: string;
  htmlBody: string;
}> {
  const rows: Array<{
    pageId: HelpPageId;
    slotId: string;
    title: string;
    htmlBody: string;
  }> = [];
  for (const page of HELP_PAGES) {
    for (const slot of page.slots) {
      const def = getHelpDefault(page.id, slot.id);
      if (!def) continue;
      rows.push({
        pageId: page.id,
        slotId: slot.id,
        title: def.title,
        htmlBody: def.htmlBody,
      });
    }
  }
  return rows;
}

const HELP_DEFAULT_BODIES: Record<
  HelpPageId,
  Partial<Record<string, string>>
> = {
  geschichte: {
    page: html(
      p(
        "Hier entsteht deine eigene Geschichte. Du wählst aus, für wen sie ist, wie schwer der Text sein darf und worum es gehen soll — dann startest du mit Credits.",
      ),
      ul(
        "Mit einem Kinder-Profil wird die Geschichte persönlich (Name, Freunde, Interessen …).",
        "Ohne Profil nutzt du „Freies lesen“ mit Thema und Schulstufe.",
        "Fertige Geschichten findest du danach in Meine Bücherei (je nach Paket).",
      ),
    ),
    credits: html(
      p(
        "Oben siehst du dein Paket und deine Credits. Jede neue Geschichte kostet Credits.",
      ),
      ul(
        "Der Zähler zeigt, wie viele Credits du gerade hast.",
        "Wenn Credits fehlen, kannst du je nach Einstellung welche nachkaufen.",
        "Die genauen Kosten siehst du direkt über dem Start-Button.",
      ),
    ),
    einladen: html(
      p(
        "Lade Freunde zu leseno ein. Mit deinem Link können sie sich anmelden und mitlesen oder selbst Geschichten starten.",
      ),
    ),
    leser: html(
      p(
        "Hier entscheidest du, für wen die Geschichte ist.",
      ),
      ul(
        "<strong>Freies lesen</strong> — ohne Profil: du wählst Thema und Schulstufe selbst.",
        "<strong>Kinder-Profil</strong> — die Geschichte nutzt Name, Freunde und Vorlieben aus Meine Welt.",
        "Profile legst du unter Meine Welt an. Fehlt noch eines, siehst du hier einen Hinweis.",
      ),
    ),
    schulstufe: html(
      p(
        "Die Schulstufe steuert Sprache und Schwierigkeit. So passt der Text besser zum Leseniveau.",
      ),
      p(
        "Jüngere Stufen: kürzere Sätze und einfachere Wörter. Höhere Stufen: mehr Tempo und komplexere Geschichten.",
      ),
    ),
    hauptthema: html(
      p(
        "Das Hauptthema ist der Rahmen der Geschichte — z. B. Weltall, Detektiv oder Dschungel.",
      ),
      p(
        "Tippe auf ein Thema. Mit „Mehr“ siehst du weitere Vorschläge. Das gewählte Thema bleibt gelb markiert.",
      ),
    ),
    "mehr-tiefgang": html(
      p(
        "Mit Mehr Tiefgang werden Gefühle und Konflikte realistischer: Figuren vertragen sich nicht sofort, und Emotionen bleiben spürbar.",
      ),
      ul(
        "Schalter an: Tiefgang ist aktiv.",
        "Optional kannst du ein Nebenthema wählen und festlegen, wie beide Themen sich mischen.",
        "Bei persönlichen Geschichten gibt es Tiefgang ohne zweites Thema.",
      ),
    ),
    textlaenge: html(
      p(
        "Die Textlänge bestimmt, wie lang die Geschichte ungefähr wird — von kurz bis sehr ausführlich.",
      ),
      p(
        "Längere Geschichten brauchen meist mehr Credits. Du kannst die Länge jederzeit vor dem Start ändern.",
      ),
    ),
    stimmung: html(
      p(
        "Die Art der Geschichte legt die Stimmung fest — z. B. spannend, lustig oder motivierend.",
      ),
      p(
        "Wähle die Stimmung, die gerade passt. Bei einem Profil ist hier oft schon ein Standard hinterlegt.",
      ),
    ),
    starten: html(
      p(
        "Mit dem orangenen Button startest du die Erzeugung. Solange die Geschichte entsteht, siehst du einen Wartedialog.",
      ),
      ul(
        "Prüfe vorher Auswahl und Credits.",
        "Reicht das Guthaben nicht, bleibt der Button ausgegraut.",
        "Danach erscheint die fertige Geschichte zum Lesen und Weiterarbeiten.",
      ),
    ),
    ergebnis: html(
      p(
        "Hier liegt deine fertige Geschichte. Je nach Paket kannst du vorlesen lassen, als PDF speichern, Fakten nachlesen oder weiterschreiben.",
      ),
      ul(
        "Vorlesen / Markierung — wenn freigeschaltet.",
        "Lesemodus — großer Lesebildschirm mit Schrift-Einstellungen.",
        "Fortsetzung — die Geschichte kann weitergehen (je nach Paket).",
      ),
    ),
  },

  "meine-welt": {
    page: html(
      p(
        "Meine Welt ist die Zentrale für Kinder-Profile. Hier hinterlegst du alles, was persönliche Geschichten besonders macht.",
      ),
      ul(
        "Name, Schulstufe, Länge und Stimmung als Standard",
        "Freunde, Interessen, Wünsche und Ängste",
        "Extras wie Bilder oder Vorlesen — und optional Kind-Login",
      ),
    ),
    profil: html(
      p(
        "Oben wechselst du zwischen den Profilen. Mit „Kind hinzufügen“ legst du ein weiteres Profil an (Familie-Paket).",
      ),
      p(
        "Das gelbe Profil ist gerade aktiv. „Standard“ bedeutet: Meine Geschichte startet damit statt mit „Freies lesen“.",
      ),
    ),
    name: html(
      p(
        "Unter diesem Namen erscheint dein Kind als Hauptfigur in persönlichen Geschichten.",
      ),
      ul(
        "Änderungen werden automatisch gespeichert.",
        "Standardprofil: nur eines gleichzeitig — die Geschichten-Seite startet damit.",
      ),
    ),
    schulstufe: html(
      p(
        "Die Schulstufe gilt als Standard für dieses Profil und steuert Sprache und Schwierigkeit.",
      ),
      p(
        "Auf der Geschichten-Seite kannst du die Stufe für einzelne Geschichten trotzdem anpassen.",
      ),
    ),
    textlaenge: html(
      p(
        "Hier legst du die bevorzugte Textlänge für dieses Profil fest.",
      ),
      p(
        "Beim Erzählen kannst du die Länge noch einmal ändern — der Profil-Standard bleibt erhalten.",
      ),
    ),
    stimmung: html(
      p(
        "Die Art der Geschichte ist der Standard-Ton für dieses Profil (spannend, lustig, motivierend …).",
      ),
      p(
        "Pro Geschichte kannst du die Stimmung später noch wechseln.",
      ),
    ),
    freunde: html(
      p(
        "Trage Freunde oder Spitznamen ein, die in persönlichen Geschichten mitspielen dürfen.",
      ),
      p(
        "Namen tippen und hinzufügen. Mit dem × entfernst du einen Eintrag wieder.",
      ),
    ),
    interessen: html(
      p(
        "Was mag dein Kind besonders? Interessen fließen in Themen und Details der Geschichte ein.",
      ),
      p(
        "Beispiele: Dinosaurier, Fußball, Weltall, Pferde, Basteln …",
      ),
    ),
    wuensche: html(
      p(
        "Hier gehören Wünsche und Träume hin — Dinge, die dein Kind gerne erleben würde.",
      ),
      p(
        "Nicht schon Erlebtes, sondern Ideen für Abenteuer in der Geschichte.",
      ),
    ),
    aengste: html(
      p(
        "Ängste werden standardmäßig in Geschichten vermieden, damit Lesen sich sicher anfühlt.",
      ),
      p(
        "Optional „Sanft einbauen“: Bei Abenteuer- oder Motivierend-Geschichten kann eine Angst ganz leicht und behutsam vorkommen.",
      ),
    ),
    extras: html(
      p(
        "Extras schalten Zusatzfunktionen für Geschichten mit diesem Profil ein — je nachdem, was dein Paket erlaubt.",
      ),
      ul(
        "Bilder — Illustrationen in der Geschichte",
        "Silbenhilfe — Silben farblich markiert",
        "Wort-Markierung — beim Vorlesen das aktuelle Wort",
        "Vorlesbar — Play-Button und Tempo",
      ),
    ),
    lesemodus: html(
      p(
        "Im Lesemodus liest du die Geschichte groß und ruhig. Hier stellst du Schrift und Darstellung für dieses Profil ein.",
      ),
      p(
        "Ohne eigene Werte gilt der Admin-Standard zur Schulstufe. „Auf Standard zurücksetzen“ holt diese Werte zurück.",
      ),
    ),
    "kind-login": html(
      p(
        "Mit Kennung und Passwort kann sich dein Kind selbst anmelden — ohne E-Mail und ohne Zugriff auf Meine Welt.",
      ),
      ul(
        "Kennung vergeben (muss frei sein) und Passwort setzen.",
        "Ohne Passwort bleibt der Kind-Login aus.",
        "Das Kind landet direkt bei Meine Geschichte mit dem eigenen Profil.",
      ),
    ),
  },

  "mein-buchclub": {
    page: html(
      p(
        "Im Buchclub verbindest du dich mit Freunden, teilst Geschichten und liest, was andere freigeben.",
      ),
      ul(
        "Eigene Freundschaftskennung vergeben und teilen",
        "Freunde per Kennung anfragen oder per E-Mail einladen",
        "Freigegebene Geschichten lesen, liken und je nach Paket als PDF speichern",
      ),
    ),
    "freunde-aktionen": html(
      p(
        "In dieser Karte erledigst du alles rund um Freunde: Kennung, Anfragen, Liste und Einladungen.",
      ),
      p(
        "Tippe auf einen Chip, um den passenden Dialog zu öffnen.",
      ),
    ),
    freundschaftskennung: html(
      p(
        "Deine Freundschaftskennung ist dein Name im Buchclub. Freunde finden dich damit.",
      ),
      p(
        "Vergib eine Kennung, speichere sie und teile sie — z. B. in der Familie oder Klasse.",
      ),
    ),
    "freund-hinzufuegen": html(
      p(
        "Gib die Kennung eines Freundes ein und sende eine Anfrage. Erst nach Bestätigung seid ihr verbunden.",
      ),
    ),
    freundesliste: html(
      p(
        "Hier siehst du offene Anfragen und bestätigte Freunde.",
      ),
      ul(
        "Eingehende Anfragen kannst du bestätigen oder ablehnen.",
        "Ausgehende Anfragen kannst du zurückziehen.",
        "Bestätigte Freunde lassen sich wieder entfernen.",
      ),
    ),
    einladen: html(
      p(
        "Lade jemanden per E-Mail zu leseno ein. Die Person erhält einen Link zur Registrierung.",
      ),
      p(
        "Danach könnt ihr euch im Buchclub per Kennung verbinden.",
      ),
    ),
    freundegeschichten: html(
      p(
        "Hier erscheinen Geschichten von Freunden und öffentliche Freigaben aus Buchclubs.",
      ),
      ul(
        "Tippe auf einen Titel zum Lesen.",
        "Du kannst liken.",
        "Je nach Paket kannst du Geschichten als PDF speichern.",
      ),
    ),
  },

  "meine-buecherei": {
    page: html(
      p(
        "In der Bücherei liegen alle Geschichten, die du erzeugt hast — automatisch gespeichert.",
      ),
      ul(
        "Titel antippen zum Lesen",
        "Favorit und Gelesen markieren",
        "Optional: Adventskalenderbücher und Freigabe für den Buchclub",
      ),
    ),
    advent: html(
      p(
        "Adventskalenderbücher sind Geschichten mit 24 Tagen. Hier öffnest du vorhandene Bücher oder legst ein neues an.",
      ),
      p(
        "Der Status zeigt, ob das Buch fertig, in Arbeit oder unterbrochen ist.",
      ),
    ),
    filter: html(
      p(
        "Mit den Filtern siehst du nur bestimmte Geschichten.",
      ),
      ul(
        "<strong>Alle</strong> — die ganze Bücherei",
        "<strong>Freies lesen</strong> — ohne Kinder-Profil",
        "Oder ein bestimmtes Profil — nur dessen Geschichten",
      ),
    ),
    "story-aktionen": html(
      p(
        "Rechts an jeder Geschichte findest du Aktionen: Vorlesen (wenn vorhanden), Freigabe, Gelesen, Favorit und Löschen.",
      ),
      p(
        "Welche Buttons sichtbar sind, hängt von deinem Paket und der Geschichte ab.",
      ),
    ),
    "buchclub-freigabe": html(
      p(
        "Über die Freigabe entscheidest du, wer die Geschichte im Buchclub sehen darf.",
      ),
      ul(
        "Nicht teilen — nur bei dir in der Bücherei",
        "Mit Freunden — sichtbare Freunde im Buchclub",
        "Öffentlich — für Buchclub-Mitglieder sichtbar",
      ),
    ),
    favorit: html(
      p(
        "Mit dem Stern markierst du Lieblingsgeschichten. Favoriten erscheinen weiter oben in der Liste.",
      ),
      p(
        "Nochmal tippen entfernt die Markierung.",
      ),
    ),
    gelesen: html(
      p(
        "Mit „Gelesen“ behältst du den Überblick, was ihr schon gelesen habt. Gelesene Titel wirken etwas zurückhaltender.",
      ),
      p(
        "Nochmal tippen setzt den Status zurück auf ungelesen.",
      ),
    ),
  },
};
