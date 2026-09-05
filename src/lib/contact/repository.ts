/**
 * Contact requests: public insert + admin list/delete via RPCs.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ContactRequestAdminRow = {
  id: string;
  email: string;
  message: string;
  createdAt: string;
};

type ContactRow = {
  id: string;
  email: string;
  message: string;
  created_at: string;
};

function mapRow(row: ContactRow): ContactRequestAdminRow {
  return {
    id: row.id,
    email: row.email,
    message: row.message,
    createdAt: row.created_at,
  };
}

export async function insertContactRequest(input: {
  email: string;
  message: string;
}): Promise<{ id: string }> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("insert_contact_request", {
    p_email: input.email,
    p_message: input.message,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (typeof data !== "string" || !data) {
    throw new Error("Anfrage konnte nicht gespeichert werden.");
  }
  return { id: data };
}

/** Newest contact requests for the admin inbox. */
export async function loadContactRequestsForAdmin(options?: {
  limit?: number;
}): Promise<ContactRequestAdminRow[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("list_contact_requests_admin", {
    p_limit: options?.limit ?? 500,
  });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ContactRow[]).map(mapRow);
}

export async function deleteContactRequestForAdmin(
  id: string,
): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("delete_contact_request_admin", {
    p_id: id,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data === true;
}
