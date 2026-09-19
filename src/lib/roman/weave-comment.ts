/**
 * Shared instructions for commented critique→document weave
 * (Idee, Welt, Exposé, Szenenplot, Manuskript).
 */

export type WeaveDocKind =
  | "idee"
  | "welt"
  | "expose"
  | "szenenplot"
  | "manuskript";

/**
 * Author comment or soft default when the field is empty.
 * Empty = author accepts sensible suggestions without fine-grained filter.
 */
export function resolveAuthorWeaveComment(raw: string): {
  comment: string;
  hasExplicitComment: boolean;
} {
  const trimmed = raw.trim();
  if (trimmed) {
    return { comment: trimmed.slice(0, 8_000), hasExplicitComment: true };
  }
  return {
    comment:
      "(kein Kommentar — alle sinnvollen, passenden Vorschläge übernehmen; unpassende oder widersprüchliche weglassen)",
    hasExplicitComment: false,
  };
}

function docLabel(kind: WeaveDocKind): string {
  switch (kind) {
    case "idee":
      return "Ideendokumentation";
    case "welt":
      return "Welt";
    case "expose":
      return "Exposé";
    case "szenenplot":
      return "Szenenplot";
    case "manuskript":
      return "Manuskript";
  }
}

/**
 * Decision rules placed high in the user prompt (before critique text).
 * When the author wrote a comment, it outranks the critique list.
 */
export function buildCommentedWeaveRules(input: {
  kind: WeaveDocKind;
  hasExplicitComment: boolean;
}): string {
  const doc = docLabel(input.kind);

  const priority = input.hasExplicitComment
    ? `PRIORITÄT (verbindlich):
1. Der Kommentar der Autor:in entscheidet, was gilt.
2. Die Kritik/Vorschlagsliste ist nur Material — nicht automatisch alles übernehmen.
3. Bei Widerspruch gewinnt immer der Kommentar.`
    : `PRIORITÄT:
Kein detaillierter Kommentar — übernehme sinnvolle Vorschläge, lass Unpassendes weg.
Erfinde keine neuen Großänderungen, die nicht in der Kritik stehen.`;

  return `${priority}

Entscheidungsregel je nummeriertem Vorschlag:
- Im Kommentar klar gewünscht / „alle“ / „übernehmen“ → einweben (ggf. angepasst an die Formulierung im Kommentar).
- Im Kommentar abgelehnt / relativiert / umgedeutet → so umsetzen wie kommentiert, nicht wie in der Kritik.
- Im Kommentar nicht erwähnt → nur übernehmen, wenn er klar zur ${doc} passt und nichts widerspricht; sonst weglassen.
- Nie Vorschläge nur anhängen — inhaltlich in die bestehende ${doc} verweben.
- Brauchbare Alt-Inhalte behalten; keine Meta-Sätze („laut Kritik…“, „übernommen…“) im Ergebnistext.`;
}

/**
 * System addendum that overrides Ideen-Redakteur’s default „nur ideeKurz-JSON“.
 */
export function buildWeaveSystemAddendum(input: {
  kind: WeaveDocKind;
  outputFormatHint: string;
}): string {
  const label =
    input.kind === "idee"
      ? "Ideen-Kritik einweben"
      : input.kind === "welt"
        ? "Welt-Kritik einweben"
        : input.kind === "expose"
          ? "Exposé-Kritik einweben"
          : input.kind === "szenenplot"
            ? "Szenenplot-Kritik einweben"
            : "Manuskript-Kritik einweben";

  return `Zusatzauftrag ${label}:
Die Autor:in übernimmt kommentiert — ihr Kommentar ist die verbindliche Leitplanke.
WICHTIG: Für DIESE Antwort gilt NICHT die Standard-Ausgabe {"ideeKurz":…}, sondern genau:
${input.outputFormatHint}
Kein Meta-Kommentar, kein Protokoll im Ergebnistext.`;
}
