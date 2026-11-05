/**
 * Inject 2–3 untitled Merksatz boxes into Herstellung (grey pull-quotes)
 * and matching „Merksatz:“ lines into improvedText. Strip K4 generic titles.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-inject-merksaetze.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import {
  parseSachbuchLayoutBlocks,
  summarizeSachbuchLayoutMarkup,
} from "../src/lib/sachbuch/herstellung-markup";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Merk = {
  /** Unique prose snippet that already exists (insert AFTER this para). */
  after: string;
  text: string;
};

/** Chapter 1-based → merksätze (skip K4 — already has three). */
const MERKS: Record<number, Merk[]> = {
  1: [
    {
      after:
        "Der teuerste Konstruktionsfehler auf der Fundamentebene geschieht fast immer zu Beginn eines Vorhabens: Teams sammeln reflexartig alle Daten, die technisch verfügbar sind, anstatt streng vom geschäftl",
      text: "Sammeln Sie Daten erst, wenn ein klares Geschäftsziel sie zwingend braucht — nicht weil sie technisch verfügbar sind.",
    },
    {
      after:
        "Den Kern dieser präventiven Steuerung bildet das Privacy Solution Canvas. Angelehnt an bewährte Vorlagen aus der agilen Produktentwicklung versammelt dieses Werkzeug alle entscheidenden Parameter auf",
      text: "Die Risiko-Ampel beschleunigt Freigaben nur, wenn Grün wirklich Standard ist und Rot Architektur erzwingt — nicht weitere Formulare.",
    },
    {
      after:
        "Bei der KlarNetz AG lag dieser First-Pass-Yield vor der methodischen Umstellung bei mageren 24 Prozent. Das bedeutete im Klartext: Drei von vier digitalen Vorhaben pendelten im Schnitt mehrfach zwisch",
      text: "First-Pass-Yield misst, ob Datenschutz im Fluss sitzt — nicht, wie viele Policies existieren.",
    },
  ],
  2: [
    {
      after:
        "Die ökonomische Hebelwirkung dieser Prävention folgt direkt der im ersten Kapitel eingeführten 1-10-100-Regel der Fehlerkosten, also der Cost-of-Change-Kurve nach Barry Boehm: Für komplexe IT-Architek",
      text: "Risiko für Betroffene und Risiko fürs Geschäft sind keine Gegensätze: was Menschen schadet, trifft früher oder später die Bilanz.",
    },
    {
      after:
        "Schlägt die Risikomatrix im Entwurf oder im FMEA-Stresstest rot an, signalisiert das kein Scheitern der Geschäftsidee und keinen Abbruch der Entwicklung. Es beendet lediglich den untauglichen Versuch,",
      text: "Rot an der Ampel stoppt nicht die Idee — es stoppt den untauglichen Datenweg und erzwingt eine saubere Architektur.",
    },
    {
      after:
        "Um diesen Ansatz in wachsenden Unternehmen ohne personelle Engpässe zu skalieren, braucht es diese standardisierten Triagesysteme und dezentrale Privacy Champions direkt in den Produktteams. Dass Date",
      text: "Frühwarnindikatoren ersetzen Quartals-Panik: wer Drift misst, korrigiert, bevor der Vorfall kommt.",
    },
  ],
  3: [
    {
      after:
        "Wie unbestechlich dieses Zusammenspiel aus Jira-Ticket, YAML-Manifest im Code und automatisierter Release-Pipeline im Alltag Risiken entschärft, zeigte sich bei der KlarNetz AG während eines wichtigen Software-Releases für das Self-Service-Kundenportal an zwei komplementären Prüfpunkten.",
      text: "Nachweisbarkeit entsteht im Ticket und im Code-Gate — nicht in der Excel-Liste kurz vor dem Audit.",
    },
    {
      after:
        "In einem traditionell geführten Unternehmen wären diese undokumentierte Datenbankspalte und die neue externe Datenübertragung unbemerkt auf die Produktionsserver gelangt – ein klassischer Fall von Konfigurationsdrift, der erst Monate später bei einer Datenpanne oder im nächsten Kunden-Audit aufgefallen wäre.",
      text: "Die Drei-Fragen-Triage entscheidet in Minuten, ob ein Vorhaben Fast-Track, Vertiefung oder Architektur-Umbau braucht.",
    },
    {
      after:
        "Auf dieser stabilen Architektur kann nun die nächste Station des Motors ihre volle kaufmännische Kraft entfalten: die methodische Verschlankung der Datenbestände durch konsequente Datenminimierung und automatisierte Speicherbegrenzung direkt im laufenden Arbeitsfluss.",
      text: "Rollen ohne Silodenken: Champions triageieren, Architektur baut Schranken, der Vorstand steuert an wenigen KPIs.",
    },
  ],
  5: [
    {
      after:
        "Speichern wirkt in der modernen IT-Infrastruktur auf den ersten Blick spottbillig, während das gezielte Löschen von Informationen als mühsam, technisch riskant und organisatorisch undankbar gilt. Dies",
      text: "Löschen ist eine Betriebsfähigkeit — keine Ausnahmeaktion vor dem nächsten Audit.",
    },
    {
      after:
        "Diese konsequente Bereinigung gewinnt im Zeitalter generativer künstlicher Intelligenz eine völlig neue strategische Dringlichkeit. Wer keine stabilen, automatisierten Löschroutinen für personenbezoge",
      text: "Ohne Lösch-Architektur halluziniert KI auf Altlasten und teilt intern, was längst hätte verschwinden müssen.",
    },
    {
      after:
        "Wie aber gelingt der Einstieg in die Bereinigung, wenn Testbarkeit zum zentralen Kriterium jedes Datenlebenszyklus erhoben wird? Wenn die Entsorgung von Informationen zur standardisierten Betriebsfähi",
      text: "Kanarien-Löschung macht Bereinigung testbar: erst beobachten, dann skalieren.",
    },
  ],
  6: [
    {
      after:
        "In vielen Unternehmen wird das Prinzip der Datenrichtigkeit noch immer als juristische Pflichtübung missverstanden. Man speichert Datensätze ab, vertraut blind auf deren Gültigkeit und reagiert erst,",
      text: "Nachträgliche Korrektur ist das teuerste Qualitätsmodell — Fehler gehören an der Quelle gestoppt.",
    },
    {
      after:
        "An diesem Punkt wandelt sich der Blick auf verbleibende Kundenreklamationen und Korrekturbitten grundlegend. Für den laufenden Lebenszyklus von Bestandsdaten trennt unsere Systematik sauber zwischen z",
      text: "Reklamationen sind Frühwarnsignale der Architektur, keine Ticket-Statistik für den Support.",
    },
    {
      after:
        "Selbst die eleganteste technische Architektur und strengste Eingabevalidierung laufen jedoch ins Leere, wenn im Schatten der Kernsysteme ein unbemerktes Eigenleben wuchert. Der hartnäckigste Gegenspie",
      text: "Lokale Exporte erzeugen eine Doppelwelt: was im CRM korrekt ist, wird in der Schattenkopie falsch.",
    },
  ],
  7: [
    {
      after:
        "Transparenz bemisst sich jedoch niemals an der Wortanzahl eines Dokuments, sondern ausschließlich am Empfängerhorizont: Hat der Kunde tatsächlich verstanden, was mit seinen Daten geschieht? Wer Nutzer",
      text: "Verständlich ist, was der Kunde versteht — nicht, was die Rechtsabteilung abgehakt hat.",
    },
    {
      after:
        "Um den Konflikt zwischen rechtlicher Vollständigkeit und menschlicher Aufnahmefähigkeit an der Schnittstelle von Kundenerlebnis und Datenarchitektur aufzulösen, darf Datenschutz nicht länger als passi",
      text: "Layered Notice und Design-Gates im Sprint verhindern, dass Transparenz zur nachträglichen Broschüre wird.",
    },
    {
      after:
        "Wenn die erste Hürde im Onboarding und in den Sprints gemeistert ist, begehen viele Organisationen jedoch einen folgenschweren Denkfehler: Sie betrachten Transparenz als einmaligen Übergangsritus bei",
      text: "Self-Service und Changelog halten Einwilligung und Realität synchron — Papier allein tut das nicht.",
    },
  ],
  8: [
    {
      after:
        "Ein wertorientiertes Datenschutzverständnis korrigiert diesen Denkfehler an der Wurzel. Der Grundsatz von Treu und Glauben bedeutet keineswegs, die unternehmerische Verantwortung für rechtskonforme, s",
      text: "Fairness beginnt an der Datensparsamkeit der Wurzel — nicht beim Cookie-Banner.",
    },
    {
      after:
        "Der richtige methodische Hebel zur Kundenbindung liegt nicht in der Blockade, sondern in einer nachgelagerten Architektur auf der Bestätigungsseite. Klickt der Nutzer auf den Abmeldelink, führt ihn da",
      text: "Ein Präferenz-Center ersetzt Blockade: Widerruf muss zur gleichen Taktung greifen wie die Optimierung.",
    },
    {
      after:
        "Am konkreten Touchpoint und Entwurf greift anschließend der Sechs-Fragen-Prozesskompass als festes Akzeptanzkriterium in der Definition of Done der zweiwöchigen Sprint-Reviews. Als präventive Prozesss",
      text: "Sechs Fragen am Prozess ersetzen sechs neue Policies: wer den Fluss prüft, findet die unfairen Hebel.",
    },
  ],
  9: [
    {
      after:
        "Um diesen Anspruch von einer strategischen Absichtserklärung in den operativen Maschinenraum zu übertragen, benötigen Ingenieure, Data Scientists und Produktverantwortliche verlässliche Werkzeuge. Mit",
      text: "Jede KI-Pipeline braucht vier Schleusen — sonst wird Autonomie zur unkontrollierten Datenweitergabe.",
    },
    {
      after:
        "Die größte Gefahr für die Datensicherheit im Zeitalter generativer Sprachmodelle geht in den seltensten Fällen von kriminellen externen Hackern aus. Sie entsteht mitten im eigenen Haus aus einem zutie",
      text: "Schatten-KI trocknet man mit Enablement und freigegebenen Wegen, nicht mit Verboten allein.",
    },
    {
      after:
        "Erst diese enge Verbindung aus technischer Fehlersicherung am Gateway und administrativer Schnelligkeit legt die Schatten-KI nachhaltig trocken. Bei der KlarNetz AG lieferten die Netzwerk- und Nutzung",
      text: "Der 90-Tage-Rollout misst Fundament, Motor und Kundenergebnis — nicht nur abgeschlossene Tickets.",
    },
  ],
};

function findAnchorEnd(haystack: string, afterPrefix: string): number {
  const idx = haystack.indexOf(afterPrefix);
  if (idx < 0) return -1;
  // Prefer end of paragraph (double newline) after the match start.
  const from = idx + afterPrefix.length;
  const paraEnd = haystack.indexOf("\n\n", from);
  if (paraEnd < 0) return haystack.length;
  return paraEnd;
}

function insertAfterAnchor(
  haystack: string,
  afterPrefix: string,
  insertion: string,
): { text: string; ok: boolean } {
  if (haystack.includes(insertion.trim())) {
    return { text: haystack, ok: true }; // already present
  }
  const end = findAnchorEnd(haystack, afterPrefix);
  if (end < 0) return { text: haystack, ok: false };
  const text =
    haystack.slice(0, end) + "\n\n" + insertion + haystack.slice(end);
  return { text, ok: true };
}

function stripK4MerksatzTitles(h: string): string {
  return h.replace(
    /^<<<BOX\s+merksatz\s+Merksatz für die Praxis\s*>>>\s*$/gim,
    "<<<BOX merksatz>>>",
  );
}

function merksatzBox(text: string): string {
  return `<<<BOX merksatz>>>\n\n${text}\n\n<<<END BOX>>>`;
}

function merksatzProse(text: string): string {
  return `Merksatz: ${text}`;
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Resolve truncated anchors against live herstellung text.
  for (const [chStr, merks] of Object.entries(MERKS)) {
    const ch = Number(chStr);
    const k = book.kapitel[ch - 1]!;
    const h = k.manuscript.herstellungText;
    for (const m of merks) {
      if (!h.includes(m.after)) {
        // Try shorter prefix
        const short = m.after.slice(0, 80);
        if (h.includes(short)) {
          m.after = short;
          console.log(`K${ch} shortened anchor: ${short.slice(0, 60)}…`);
        } else {
          console.log(`K${ch} MISS anchor: ${m.after.slice(0, 80)}`);
        }
      }
    }
  }

  for (let i = 0; i < book.kapitel.length; i++) {
    const ch = i + 1;
    const k = book.kapitel[i]!;
    let h = k.manuscript.herstellungText.trim();
    let improved =
      k.manuscript.improvedText.trim() || sachbuchKapitelBodyText(k);
    let changed = false;

    if (ch === 4) {
      const next = stripK4MerksatzTitles(h);
      if (next !== h) {
        h = next;
        changed = true;
        console.log("K4: stripped Merksatz titles");
      }
    }

    const merks = MERKS[ch] ?? [];
    for (const m of merks) {
      const box = merksatzBox(m.text);
      const prose = merksatzProse(m.text);

      const hRes = insertAfterAnchor(h, m.after, box);
      if (!hRes.ok) {
        console.log(`K${ch} H-MISS: ${m.after.slice(0, 70)}`);
      } else if (hRes.text !== h) {
        h = hRes.text;
        changed = true;
        console.log(`K${ch} H-OK: ${m.text.slice(0, 60)}…`);
      } else {
        console.log(`K${ch} H-skip (exists): ${m.text.slice(0, 50)}…`);
      }

      // improvedText has no <<<H>>> markers — try same prose anchor, else skip.
      const iRes = insertAfterAnchor(improved, m.after, prose);
      if (!iRes.ok) {
        // Heading-only anchors won't exist in improvedText; try body-only inserts via box already in H.
        console.log(`K${ch} I-MISS (ok if heading anchor): ${m.after.slice(0, 50)}`);
      } else if (iRes.text !== improved) {
        improved = iRes.text;
        changed = true;
        console.log(`K${ch} I-OK`);
      }
    }

    if (!changed) continue;

    const notes = summarizeSachbuchLayoutMarkup(h);
    const merksCount = parseSachbuchLayoutBlocks(h).filter(
      (b) => b.type === "box" && b.kind === "merksatz",
    ).length;
    console.log(`K${ch} → merksatz=${merksCount}; notes[0]=${notes[0]}`);

    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: improved,
        herstellungText: h,
        herstellungNotes: notes,
        improvedAt: k.manuscript.improvedAt || now,
      },
      updatedAt: now,
    });
  }

  // Verify
  const after = await getSachbuchKontext(ID);
  if (!after) throw new Error("reload failed");
  for (let i = 0; i < after.kapitel.length; i++) {
    const h = after.kapitel[i]!.manuscript.herstellungText;
    const merks = parseSachbuchLayoutBlocks(h).filter(
      (b) => b.type === "box" && b.kind === "merksatz",
    );
    const titled = merks.filter((b) => b.type === "box" && b.title.trim());
    console.log(
      `verify K${i + 1}: merksatz=${merks.length} titled=${titled.length}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
