/**
 * Supabase Send Email hook — Registrierung (signup).
 * Configure Auth → Hooks → HTTP → this URL.
 */

import {
  handleAuthEmailHookGet,
  handleAuthEmailHookPost,
} from "@/lib/auth/email-hook-handler";

export async function GET() {
  return handleAuthEmailHookGet("register");
}

export async function POST(request: Request) {
  return handleAuthEmailHookPost("register", request);
}
