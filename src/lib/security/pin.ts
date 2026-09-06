/**
 * Shared PIN hashing / verification (Advent + Meine-Welt parent PIN).
 * Format: `scrypt$<saltHex>$<hashHex>`.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 32;

function normalizePin(pin: string): string {
  return pin.trim();
}

/** Hashes a 4–8 digit PIN for durable storage. */
export function hashPin(pin: string): string {
  const normalized = normalizePin(pin);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalized, salt, KEY_LEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/** Constant-time verify against a stored `hashPin` value. */
export function verifyPin(pin: string, stored: string): boolean {
  const normalized = normalizePin(pin);
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const actual = scryptSync(normalized, salt, KEY_LEN);
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
