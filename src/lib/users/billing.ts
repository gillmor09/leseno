/**
 * Credits + package booking access via public RPCs (service role).
 * Avoids PostgREST `.schema("leseno")` which fails when the schema is not exposed.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { getPackageMonthlyPrice } from "@/lib/users/package-repository";
import {
  isUserPackageId,
  USER_PACKAGE_MONTHLY_PRICE_EUR,
  type UserPackageBooking,
  type UserPackageId,
} from "@/lib/users/packages";

type BookingRow = {
  id: string;
  user_id: string;
  package_id: string;
  started_at: string;
  ended_at: string | null;
  monthly_price: number | string;
  actual_price: number | string;
  notes: string;
  created_at: string;
};

function mapBooking(row: BookingRow): UserPackageBooking {
  const packageId = isUserPackageId(row.package_id)
    ? row.package_id
    : "basis";
  return {
    id: row.id,
    userId: row.user_id,
    packageId,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    monthlyPrice: Number(row.monthly_price),
    actualPrice: Number(row.actual_price),
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

/** Credits balance for one user (0 if profile missing). */
export async function getUserCredits(userId: string): Promise<number> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_user_credits", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : 0;
}

/** Map of userId → credits for admin list. */
export async function loadCreditsByUserIds(
  userIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;

  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_user_credits", {
    p_user_ids: userIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    map.set(
      row.user_id as string,
      typeof row.credits === "number" ? row.credits : 0,
    );
  }
  return map;
}

/**
 * Starts a package booking; ends any currently active booking for the user.
 * `actualPrice` defaults to the list monthly price.
 */
export async function startPackageBooking(input: {
  userId: string;
  packageId: UserPackageId;
  monthlyPrice?: number;
  actualPrice?: number;
  notes?: string;
  startedAt?: string;
}): Promise<UserPackageBooking> {
  const supabase = createServiceClient(null);
  const monthly =
    input.monthlyPrice ??
    (await getPackageMonthlyPrice(input.packageId).catch(
      () => USER_PACKAGE_MONTHLY_PRICE_EUR[input.packageId],
    ));
  const actual = input.actualPrice ?? monthly;
  const startedAt = input.startedAt ?? new Date().toISOString();

  const { data, error } = await supabase.rpc("admin_start_package_booking", {
    p_user_id: input.userId,
    p_package_id: input.packageId,
    p_monthly_price: monthly,
    p_actual_price: actual,
    p_notes: input.notes ?? "",
    p_started_at: startedAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Buchung konnte nicht angelegt werden.");
  }

  return mapBooking(row as BookingRow);
}

export async function listPackageBookingsForUser(
  userId: string,
): Promise<UserPackageBooking[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_package_bookings", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as BookingRow[]).map((row) => mapBooking(row));
}
