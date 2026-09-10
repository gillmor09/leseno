/**
 * Shared PIN hashing / verification (Advent + legacy Meine-Welt PIN).
 * Also used for child login passwords (`hashPassword` / `verifyPassword`).
 * Format: `scrypt$<saltHex>$<hashHex>`.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 32;

function normalizeSecret(value: string): string {
  return value.trim();
}

function hashSecret(value: string): string {
  const normalized = normalizeSecret(value);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalized, salt, KEY_LEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifySecret(value: string, stored: string): boolean {
  const normalized = normalizeSecret(value);
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

/** Hashes a 4–8 digit PIN for durable storage. */
export function hashPin(pin: string): string {
  return hashSecret(pin);
}

/** Constant-time verify against a stored `hashPin` value. */
export function verifyPin(pin: string, stored: string): boolean {
  return verifySecret(pin, stored);
}

/** Hashes a child login password (same storage format as PIN). */
export function hashPassword(password: string): string {
  return hashSecret(password);
}

/** Constant-time verify for child login passwords. */
export function verifyPassword(password: string, stored: string): boolean {
  return verifySecret(password, stored);
}
