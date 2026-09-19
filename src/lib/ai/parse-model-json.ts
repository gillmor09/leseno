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
    slice += '"';
  }
  slice = slice.replace(/,\s*$/g, "");
  while (stack.length) {
    slice += stack.pop();
  }
  return slice;
}

/**
 * Parse the first JSON object from model text. Returns null if unrecoverable.
 */
export function tryParseModelJsonObject(
  raw: string,
): Record<string, unknown> | null {
  const cleaned = stripFence(raw);
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
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
        return parsed[0] as Record<string, unknown>;
      }
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
