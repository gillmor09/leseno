/**
 * Loads and saves the signed-in user's "Meine Welt" via public RPCs.
 */

import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_USER_WORLD,
  type UserWorldProfile,
} from "@/lib/world/catalog";

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

/**
 * Returns the current user's world profile, creating an empty row if needed.
 */
export async function loadMyWorld(): Promise<UserWorldProfile> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_world");

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return EMPTY_USER_WORLD;
  }

  return {
    displayName:
      typeof row.display_name === "string" ? row.display_name.trim() : "",
    friends: asStringList(row.friends),
    interests: asStringList(row.interests),
    experiences: asStringList(row.experiences),
  };
}

/**
 * Persists the signed-in user's world profile.
 */
export async function saveMyWorld(profile: UserWorldProfile): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("upsert_my_world", {
    p_display_name: profile.displayName,
    p_friends: profile.friends,
    p_interests: profile.interests,
    p_experiences: profile.experiences,
  });

  if (error) {
    throw new Error(error.message);
  }
}
