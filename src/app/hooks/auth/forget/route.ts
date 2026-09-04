/**
 * Supabase Send Email hook — Passwort vergessen (recovery).
 * Configure Auth → Hooks → HTTP → this URL.
 */

import {
  handleAuthEmailHookGet,
  handleAuthEmailHookPost,
} from "@/lib/auth/email-hook-handler";

export async function GET() {
  return handleAuthEmailHookGet("forget");
}

export async function POST(request: Request) {
  return handleAuthEmailHookPost("forget", request);
}
