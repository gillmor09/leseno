/**
 * Unified app identity: parent (Supabase Auth) or child (cookie session).
 */

import type { User } from "@supabase/supabase-js";
import {
  clearChildSessionCookie,
  readChildSessionCookie,
  type ChildSessionPayload,
} from "@/lib/auth/child-session";
import { getCurrentUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

export type ParentAppSession = {
  kind: "parent";
  user: User;
};

export type ChildAppSession = {
  kind: "child";
  parentUserId: string;
  profileId: string;
  displayName: string;
  loginCode: string;
};

export type AppSession = ParentAppSession | ChildAppSession;

/**
 * Active session for page gates and actions.
 * Parent Auth wins over a stale child cookie (and clears it).
 */
export async function getAppSession(): Promise<AppSession | null> {
  const user = await getCurrentUser();
  if (user) {
    const child = await readChildSessionCookie();
    if (child) {
      await clearChildSessionCookie();
    }
    return { kind: "parent", user };
  }

  const child = await readChildSessionCookie();
  if (!child) return null;

  return {
    kind: "child",
    parentUserId: child.parentUserId,
    profileId: child.profileId,
    displayName: child.displayName,
    loginCode: child.loginCode,
  };
}

/** Parent Auth user id, or parent account behind a child session. */
export async function getBillingUserId(): Promise<string | null> {
  const session = await getAppSession();
  if (!session) return null;
  return session.kind === "parent" ? session.user.id : session.parentUserId;
}

/**
 * Membership role for package features (parent Auth metadata, or parent's role
 * when a child is logged in).
 */
export async function getSessionMembershipRole(): Promise<string> {
  const session = await getAppSession();
  if (!session) return "";

  if (session.kind === "parent") {
    return typeof session.user.app_metadata?.role === "string"
      ? session.user.app_metadata.role
      : "";
  }

  try {
    const supabase = createServiceClient(null);
    const { data, error } = await supabase.auth.admin.getUserById(
      session.parentUserId,
    );
    if (error || !data.user) return "";
    return typeof data.user.app_metadata?.role === "string"
      ? data.user.app_metadata.role
      : "";
  } catch {
    return "";
  }
}

export type { ChildSessionPayload };
