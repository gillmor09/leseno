import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const finds = [
  [3, "parallel zum späteren unternehmensweiten 90-Tage-Rollout aus Kapitel 9"],
  [3, "bilanzieren wir erst in Kapitel 9, wenn Fairness an der Kundenschnittstelle (Kapitel 8)"],
  [6, "(Dass weniger Felder den Durchsatz heben, ist Kapitel 4; hier geht es um die Richtigkeit dessen, was dennoch erfasst wird.)"],
  [6, "Hohe Stammdatenqualität ist kein Durchsatz-Gegner aus Kapitel 4"],
  [8, "(das war Kapitel 4), sondern vor unfairer Wahlarchitektur"],
  [8, "Das digitale Vertrauensportal aus Kapitel 3 automatisiert Nachweise"],
  [5, "noch vor dem unternehmensweiten 90-Tage-Rollout aus Kapitel 9"],
  [5, "der unternehmensweite 90-Tage-Rollout folgt erst in Kapitel 9"],
  [5, "eine Blaupause, keine Konkurrenz zum späteren Gesamt-Rollout"],
  [5, "noch bevor Kapitel 9 das buchweite Transformationsprogramm"],
  [5, "parallel zur etablierten Governance aus Kapitel 3"],
  [5, "die wir in Kapitel 3 als operative Basis unserer VDP-Pyramide eingeführt haben"],
  [5, "exakt im Sinne des in Kapitel 3 eingeführten fünfstufigen Nachweissystems"],
  [9, "Sales Cycle Velocity nieder: Der gesamte Vertriebs- und Auditzyklus bei sicherheitskritischen"],
  [9, "Was Kapitel 3 auf Stunden-Vorbereitung gebracht hatte"],
  [9, "Poka-Yoke und die 5S-Kriterien aus Kapitel 5 direkt"],
  [4, "Im Lean Management existiert dafür der Gemba Walk"],
  [4, "im Sinne der bereits eingeführten Verschwendungskategorien (Muda)"],
  [5, "sondern die 5S-Methode als operatives Betriebssystem"],
  [6, "Im klassischen Produktions- und Lean-Management entspricht dies"],
  [6, "Poka-Yoke als Schnittstellen-Validierung"],
  [7, "klassische Prozessverschwendung (Muda)"],
  [2, "den Unterbau unserer VDP-Pyramide"],
  [2, "Fundament der VDP-Pyramide geschlossen"],
  [8, "Das Zusammenspiel aus Privacy Value Thinking und Value-Driven Privacy"],
  [8, "Sicherheits- und Datenschutzprüfungen zur Sicherheit der Verarbeitung"],
] as const;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  let miss = 0;
  for (const [kap, find] of finds) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    const ok = t.includes(find);
    console.log(ok ? "OK" : "MISS", `K${kap}`, find.slice(0, 70));
    if (!ok) miss += 1;
  }
  console.log("misses:", miss);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
