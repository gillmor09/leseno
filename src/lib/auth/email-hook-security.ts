/**
 * SMTP delivery + Standard Webhooks verification for Auth Send Email hooks.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

/**
 * True when SMTP env is complete enough to send.
 */
export function hasSmtpConfig(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_FROM?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

/**
 * Parses `SMTP_FROM` into address + brand display name `leseno`.
 * Accepts a bare address or an existing `Name <addr>` value.
 */
export function parseSmtpFrom(fromEnv: string): {
  name: string;
  address: string;
} {
  const match = fromEnv.match(/<([^>]+)>/);
  const address = (match?.[1] ?? fromEnv).trim();
  return { name: "leseno", address };
}

/**
 * Sends one HTML email via SMTP (`SMTP_*` env).
 */
export async function sendSmtpHtmlEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const fromRaw = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "587");

  if (!host || !fromRaw || !user || !pass) {
    throw new Error(
      "SMTP ist nicht konfiguriert (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).",
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const from = parseSmtpFrom(fromRaw);

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  } catch (error) {
    console.error("[sendSmtpHtmlEmail]", {
      host,
      port,
      from,
      to: input.to,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Verifies Supabase Auth Hook (Standard Webhooks) signatures.
 * Secret may be `v1,whsec_…` (dashboard form) or raw base64 after `whsec_`.
 */
export function verifyAuthEmailHookRequest(input: {
  rawBody: string;
  headers: Headers;
}): { ok: true } | { ok: false; error: string } {
  const secretRaw = process.env.AUTH_EMAIL_HOOK_SECRET?.trim();
  if (!secretRaw) {
    return {
      ok: false,
      error: "AUTH_EMAIL_HOOK_SECRET fehlt in der App-Umgebung.",
    };
  }

  const webhookId = input.headers.get("webhook-id");
  const webhookTimestamp = input.headers.get("webhook-timestamp");
  const webhookSignature = input.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, error: "Webhook-Signatur-Header fehlen." };
  }

  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, error: "Ungültiger webhook-timestamp." };
  }
  const skewSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skewSec > 5 * 60) {
    return { ok: false, error: "Webhook-Timestamp zu alt oder in der Zukunft." };
  }

  let secretPart = secretRaw;
  if (secretPart.startsWith("v1,")) {
    secretPart = secretPart.slice(3);
  }
  if (secretPart.startsWith("whsec_")) {
    secretPart = secretPart.slice("whsec_".length);
  }

  let key: Buffer;
  try {
    key = Buffer.from(secretPart, "base64");
  } catch {
    return { ok: false, error: "AUTH_EMAIL_HOOK_SECRET ist ungültig." };
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");

  const candidates = webhookSignature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [, sig] = part.split(",", 2);
      return sig ?? part;
    });

  const expectedBuf = Buffer.from(expected);
  const match = candidates.some((sig) => {
    try {
      const got = Buffer.from(sig);
      return (
        got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)
      );
    } catch {
      return false;
    }
  });

  if (!match) {
    return { ok: false, error: "Webhook-Signatur ungültig." };
  }

  return { ok: true };
}
