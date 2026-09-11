/**
 * Help text catalog: stable page + slot ids for member areas.
 * Admin UI lists these slots; DB rows are created on first save.
 */

export const HELP_PAGE_IDS = [
  "geschichte",
  "meine-welt",
  "mein-buchclub",
  "meine-buecherei",
] as const;

export type HelpPageId = (typeof HELP_PAGE_IDS)[number];

export type HelpSlotKind = "page" | "card";

export type HelpSlotDef = {
  id: string;
  label: string;
  kind: HelpSlotKind;
  /** Default dialog title when no DB row exists yet. */
  defaultTitle: string;
};

export type HelpPageDef = {
  id: HelpPageId;
  label: string;
  route: string;
  slots: readonly HelpSlotDef[];
};

function pageSlot(label: string): HelpSlotDef {
  return {
    id: "page",
    label: "Seitenhilfe",
    kind: "page",
    defaultTitle: label,
  };
}

function cardSlot(id: string, label: string): HelpSlotDef {
  return {
    id,
    label,
    kind: "card",
    defaultTitle: label,
  };
}

export const HELP_PAGES: readonly HelpPageDef[] = [
  {
    id: "geschichte",
    label: "Meine Geschichte",
    route: "/geschichte",
    slots: [
      pageSlot("Hilfe — Meine Geschichte"),
      cardSlot("credits", "Paket & Credits"),
      cardSlot("einladen", "Freunde einladen"),
      cardSlot("leser", "Für wen? / Leser"),
      cardSlot("schulstufe", "Schulstufe"),
      cardSlot("hauptthema", "Hauptthema"),
      cardSlot("mehr-tiefgang", "Mehr Tiefgang"),
      cardSlot("textlaenge", "Textlänge"),
      cardSlot("stimmung", "Art der Geschichte"),
      cardSlot("starten", "Geschichte starten"),
      cardSlot("ergebnis", "Ergebnis & Lesewerkzeuge"),
    ],
  },
  {
    id: "meine-welt",
    label: "Meine Welt",
    route: "/meine-welt",
    slots: [
      pageSlot("Hilfe — Meine Welt"),
      cardSlot("profil", "Profile verwalten"),
      cardSlot("name", "Name des Kindes"),
      cardSlot("schulstufe", "Schulstufe"),
      cardSlot("textlaenge", "Textlänge"),
      cardSlot("stimmung", "Art der Geschichte"),
      cardSlot("freunde", "Freundesliste"),
      cardSlot("interessen", "Interessen"),
      cardSlot("wuensche", "Das möchte ich mal erleben"),
      cardSlot("aengste", "Davor habe ich Angst"),
      cardSlot("extras", "Extras"),
      cardSlot("lesemodus", "Lesemodus"),
      cardSlot("kind-login", "Kind-Login"),
    ],
  },
  {
    id: "mein-buchclub",
    label: "Mein Buchclub",
    route: "/mein-buchclub",
    slots: [
      pageSlot("Hilfe — Mein Buchclub"),
      cardSlot("freunde-aktionen", "Meine Freunde"),
      cardSlot("freundschaftskennung", "Freundschaftskennung"),
      cardSlot("freund-hinzufuegen", "Freund hinzufügen"),
      cardSlot("freundesliste", "Freundesliste & Anfragen"),
      cardSlot("einladen", "Per E-Mail einladen"),
      cardSlot("freundegeschichten", "Geschichten von Freunden"),
    ],
  },
  {
    id: "meine-buecherei",
    label: "Meine Bücherei",
    route: "/meine-buecherei",
    slots: [
      pageSlot("Hilfe — Meine Bücherei"),
      cardSlot("advent", "Adventskalenderbücher"),
      cardSlot("filter", "Profilfilter"),
      cardSlot("story-aktionen", "Geschichten-Aktionen"),
      cardSlot("buchclub-freigabe", "Buchclub-Freigabe"),
      cardSlot("favorit", "Favorit"),
      cardSlot("gelesen", "Gelesen"),
    ],
  },
] as const;

export function isHelpPageId(value: string): value is HelpPageId {
  return (HELP_PAGE_IDS as readonly string[]).includes(value);
}

export function getHelpPage(pageId: HelpPageId): HelpPageDef {
  const page = HELP_PAGES.find((entry) => entry.id === pageId);
  if (!page) throw new Error(`Unbekannte Hilfe-Seite „${pageId}“.`);
  return page;
}

export function getHelpSlot(
  pageId: HelpPageId,
  slotId: string,
): HelpSlotDef | null {
  return (
    getHelpPage(pageId).slots.find((slot) => slot.id === slotId) ?? null
  );
}

export function isValidHelpSlot(pageId: HelpPageId, slotId: string): boolean {
  return getHelpSlot(pageId, slotId) !== null;
}
