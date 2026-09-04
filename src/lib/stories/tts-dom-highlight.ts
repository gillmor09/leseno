/**
 * Client-only helpers: wrap story words for TTS highlight and drive active class.
 * Compatible with Silbenhilfe (`.silbe` groups wrapped as one word).
 * Walk is iterative per sibling list (no per-word recursion — avoids max stack).
 *
 * Highlight sync uses a wall-clock media clock (`TtsMediaClock`) so word
 * timings stay aligned when `HTMLAudioElement.playbackRate` changes.
 */

export const TTS_WORD_CLASS = "tts-word";
export const TTS_WORD_ACTIVE_CLASS = "tts-word--active";
export const TTS_WORD_ATTR = "data-tts-i";

type Counter = { i: number };

/**
 * Media-time clock tied to wall clock × playback rate.
 * Avoids drift when browsers advance `currentTime` inconsistently with rate.
 */
export type TtsMediaClock = {
  anchorWallMs: number;
  anchorMediaSec: number;
  rate: number;
  running: boolean;
};

export function createTtsMediaClock(rate = 1): TtsMediaClock {
  return {
    anchorWallMs: performance.now(),
    anchorMediaSec: 0,
    rate,
    running: false,
  };
}

/** Pin the clock to a known media position (play, pause, seek, rate change). */
export function reanchorTtsMediaClock(
  clock: TtsMediaClock,
  mediaSec: number,
  rate = clock.rate,
  running = clock.running,
): void {
  clock.anchorWallMs = performance.now();
  clock.anchorMediaSec = Math.max(0, mediaSec);
  clock.rate = rate;
  clock.running = running;
}

/** Current media seconds for Whisper word lookup. */
export function readTtsMediaClock(clock: TtsMediaClock): number {
  if (!clock.running) {
    return clock.anchorMediaSec;
  }
  const elapsedSec = (performance.now() - clock.anchorWallMs) / 1000;
  return Math.max(0, clock.anchorMediaSec + elapsedSec * clock.rate);
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isSilbe(el: Element): boolean {
  return el.classList.contains("silbe");
}

function wrapNodesAsWord(nodes: Node[], index: number): void {
  if (nodes.length === 0) return;
  const parent = nodes[0]?.parentNode;
  if (!parent) return;

  const span = document.createElement("span");
  span.className = TTS_WORD_CLASS;
  span.setAttribute(TTS_WORD_ATTR, String(index));
  parent.insertBefore(span, nodes[0]!);
  for (const node of nodes) {
    span.appendChild(node);
  }
}

/**
 * Splits a text node into whitespace + word spans (`tts-word`).
 */
function wrapTextNode(textNode: Text, counter: Counter): void {
  const value = textNode.nodeValue ?? "";
  if (!value || !value.trim()) return;

  const parent = textNode.parentNode;
  if (!parent) return;

  const frag = document.createDocumentFragment();
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const part = match[0]!;
    if (/^[\p{L}\p{N}]/u.test(part)) {
      const span = document.createElement("span");
      span.className = TTS_WORD_CLASS;
      span.setAttribute(TTS_WORD_ATTR, String(counter.i));
      span.textContent = part;
      frag.appendChild(span);
      counter.i += 1;
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  }

  parent.replaceChild(frag, textNode);
}

/**
 * Walks an element's children left-to-right. Recurses only into nested elements
 * (DOM depth), never restarts the whole walk per word.
 */
function wrapElementChildren(el: Element, counter: Counter): void {
  let child: ChildNode | null = el.firstChild;
  while (child) {
    const nextSibling = child.nextSibling;

    if (isElement(child)) {
      if (child.tagName === "IMG" || child.classList.contains(TTS_WORD_CLASS)) {
        child = nextSibling;
        continue;
      }
      if (isSilbe(child)) {
        const group: Node[] = [child];
        let cursor: ChildNode | null = child.nextSibling;
        while (cursor && isElement(cursor) && isSilbe(cursor)) {
          group.push(cursor);
          cursor = cursor.nextSibling;
        }
        wrapNodesAsWord(group, counter.i);
        counter.i += 1;
        child = cursor;
        continue;
      }
      wrapElementChildren(child, counter);
      child = nextSibling;
      continue;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      const value = (child as Text).nodeValue ?? "";
      if (value.trim()) {
        wrapTextNode(child as Text, counter);
      }
      child = nextSibling;
      continue;
    }

    child = nextSibling;
  }
}

/**
 * Wraps every spoken word under `root` with `data-tts-i`. Returns word count.
 * Idempotent if already wrapped (no-op when `.tts-word` present).
 */
export function wrapStoryWordsForTts(root: HTMLElement): number {
  if (root.querySelector(`.${TTS_WORD_CLASS}`)) {
    return root.querySelectorAll(`.${TTS_WORD_CLASS}`).length;
  }
  const counter: Counter = { i: 0 };
  wrapElementChildren(root, counter);
  return counter.i;
}

/**
 * Removes highlight class from all words under root.
 */
export function clearActiveTtsWord(root: HTMLElement | null): void {
  if (!root) return;
  root
    .querySelectorAll(`.${TTS_WORD_ACTIVE_CLASS}`)
    .forEach((node) => node.classList.remove(TTS_WORD_ACTIVE_CLASS));
}

/**
 * Sets the active word by global index; scrolls it into view lightly.
 */
export function setActiveTtsWord(
  root: HTMLElement | null,
  index: number | null,
): void {
  if (!root) return;
  clearActiveTtsWord(root);
  if (index === null || index < 0) return;
  const el = root.querySelector(
    `.${TTS_WORD_CLASS}[${TTS_WORD_ATTR}="${index}"]`,
  );
  if (!el) return;
  el.classList.add(TTS_WORD_ACTIVE_CLASS);
  if ("scrollIntoView" in el) {
    el.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
}

/**
 * Picks the active word index for the current chunk audio time.
 */
export function findActiveWordIndex(
  words: { index: number; start: number; end: number }[],
  timeSec: number,
): number | null {
  if (words.length === 0) return null;
  for (const word of words) {
    if (timeSec >= word.start && timeSec < word.end) {
      return word.index;
    }
  }
  let last: number | null = null;
  for (const word of words) {
    if (timeSec >= word.start) {
      last = word.index;
    } else {
      break;
    }
  }
  return last;
}
