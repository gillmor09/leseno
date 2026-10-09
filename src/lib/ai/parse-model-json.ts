/**
 * Tolerant JSON object parse for LLM replies (fences, smart quotes,
 * trailing commas, raw newlines inside strings, truncated braces).
 */

/** Escape control characters that break JSON.parse when models emit raw newlines in strings. */
export function escapeRawControlsInJsonStrings(raw: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]!;
    if (!inString) {
      if (c === '"') inString = true;
      out += c;
      continue;
    }
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (c === "\\") {
      out += c;
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = false;
      out += c;
      continue;
    }
    if (c === "\n") {
      out += "\\n";
      continue;
    }
    if (c === "\r") {
      out += "\\r";
      continue;
    }
    if (c === "\t") {
      out += "\\t";
      continue;
    }
    out += c;
  }
  return out;
}

function lightJsonRepair(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Close truncated JSON by dropping a broken trailing fragment and appending
 * missing `}` / `]`. Helps when models hit max output tokens mid-object.
 */
export function closeTruncatedJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let slice = raw.slice(start).trimEnd();
  const lastSafe = Math.max(
    slice.lastIndexOf("}"),
    slice.lastIndexOf("]"),
    slice.lastIndexOf('"'),
  );
  if (lastSafe > 0 && lastSafe < slice.length - 1) {
    const tail = slice.slice(lastSafe + 1).trim();
    if (tail && !/^[,}\]]/.test(tail)) {
      slice = slice.slice(0, lastSafe + 1);
    }
  }
  slice = slice.replace(/,\s*$/g, "");

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (let i = 0; i < slice.length; i += 1) {
    const c = slice[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      if (stack.length && stack[stack.length - 1] === c) stack.pop();
    }
  }
  if (inString) {
    // Mid-string cut: drop back to the last complete object/array end.
    const cut = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
    if (cut > 0) {
      slice = slice.slice(0, cut + 1).replace(/,\s*$/g, "");
      return closeTruncatedJsonObject(slice);
    }
    slice += '"';
  }
  slice = slice.replace(/,\s*$/g, "");
  while (stack.length) {
    slice += stack.pop();
  }
  return slice;
}

/**
 * Rebuild a Szenenplot patch envelope from whatever complete scene objects
 * survived in a truncated model reply. Returns null if none are salvageable.
 */
export function salvageSzenenplotPatchJson(
  raw: string,
  chapterNumber: number,
): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const body = raw.slice(start);
  const scenes: unknown[] = [];
  const re = /"scene_id"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const idStart = m.index;
    // Walk left to the scene object's opening brace.
    let brace = -1;
    for (let i = idStart; i >= 0; i -= 1) {
      if (body[i] === "{") {
        brace = i;
        break;
      }
    }
    if (brace < 0) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = brace; i < body.length; i += 1) {
      const c = body[i]!;
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === "\\") {
          esc = true;
          continue;
        }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    try {
      const obj = JSON.parse(
        escapeRawControlsInJsonStrings(lightJsonRepair(body.slice(brace, end + 1))),
      ) as unknown;
      if (obj && typeof obj === "object") scenes.push(obj);
    } catch {
      /* skip incomplete */
    }
  }
  if (!scenes.length) return null;
  return {
    chapters: [{ number: chapterNumber, scenes }],
  };
}

/**
 * Coerce a JSON.parse result into a plain object.
 * Unwraps a JSON-encoded string once (models sometimes return `"…markdown…"`).
 */
function coerceParsedObject(
  parsed: unknown,
  depth: number,
): Record<string, unknown> | null {
  if (typeof parsed === "string") {
    const inner = parsed.trim();
    if (inner.length >= 2 && depth < 2) {
      return tryParseModelJsonObject(inner, depth + 1);
    }
    return null;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
    return parsed[0] as Record<string, unknown>;
  }
  return null;
}

/**
 * Parse the first JSON object from model text. Returns null if unrecoverable.
 */
export function tryParseModelJsonObject(
  raw: string,
  depth = 0,
): Record<string, unknown> | null {
  const cleaned = stripFence(raw);
  if (!cleaned) return null;

  // Whole payload first — catches objects, arrays, and JSON-encoded strings.
  try {
    const whole = coerceParsedObject(JSON.parse(cleaned) as unknown, depth);
    if (whole) return whole;
  } catch {
    /* try slices */
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slices: string[] = [];
  if (start >= 0 && end > start) {
    slices.push(cleaned.slice(start, end + 1));
  }
  if (start >= 0) {
    const closed = closeTruncatedJsonObject(cleaned);
    if (closed) slices.push(closed);
  }

  const candidates: string[] = [];
  for (const slice of slices) {
    candidates.push(
      slice,
      lightJsonRepair(slice),
      escapeRawControlsInJsonStrings(slice),
      lightJsonRepair(escapeRawControlsInJsonStrings(slice)),
    );
  }

  for (const candidate of candidates) {
    try {
      const coerced = coerceParsedObject(
        JSON.parse(candidate) as unknown,
        depth,
      );
      if (coerced) return coerced;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Same as tryParseModelJsonObject but throws with a short German message.
 */
export function parseModelJsonObject(
  raw: string,
  errorLabel = "Antwort",
): Record<string, unknown> {
  const obj = tryParseModelJsonObject(raw);
  if (!obj) {
    const preview = raw.trim().slice(0, 160).replace(/\s+/g, " ");
    throw new Error(
      `${errorLabel} lieferte kein gültiges JSON.${
        preview ? ` Anfang: ${preview}…` : ""
      }`,
    );
  }
  return obj;
}
