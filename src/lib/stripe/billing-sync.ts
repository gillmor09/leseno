/**
 * Applies Stripe purchase / subscription outcomes to Leseno profiles & bookings.
 * DB access via public RPCs (PostgREST does not expose schema `leseno`).
 */

import { createServiceClient } from "@/lib/supabase/service";
import { startPackageBooking } from "@/lib/users/billing";
import type { MembershipRoleId, UserRoleId } from "@/lib/users/catalog";
import {
  PACKAGE_TO_MEMBERSHIP_ROLE,
  type PaidMembershipPackageId,
} from "@/lib/stripe/config";
import { loadMembershipPackages } from "@/lib/users/package-repository";
import { logUserActivity } from "@/lib/users/activity";

async function getAuthRole(userId: string): Promise<UserRoleId | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new Error(error?.message ?? "User nicht gefunden.");
  }
  const role = data.user.app_metadata?.role;
  if (typeof role === "string") {
    return role as UserRoleId;
  }
  return null;
}

/**
 * Sets Auth + profile membership role. Never demotes `admin`.
 */
export async function setMembershipRoleForUser(
  userId: string,
  role: MembershipRoleId,
): Promise<void> {
  const current = await getAuthRole(userId);
  if (current === "admin") {
    return;
  }

  const supabase = createServiceClient(null);
  const { data: userData, error: getError } =
    await supabase.auth.admin.getUserById(userId);
  if (getError || !userData.user) {
    throw new Error(getError?.message ?? "User nicht gefunden.");
  }

  const existingMetadata = userData.user.app_metadata ?? {};
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    {
      app_metadata: { ...existingMetadata, role },
    },
  );
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: profileError } = await supabase.rpc(
    "admin_set_user_profile_role",
    {
      p_user_id: userId,
      p_role: role,
    },
  );

  if (profileError) {
    console.warn("[setMembershipRoleForUser] profile", profileError.message);
  }
}

export async function saveStripeCustomerId(
  userId: string,
  customerId: string,
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_set_user_stripe_customer", {
    p_user_id: userId,
    p_customer_id: customerId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function saveStripeSubscriptionId(
  userId: string,
  subscriptionId: string | null,
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_set_user_stripe_subscription", {
    p_user_id: userId,
    p_subscription_id: subscriptionId ?? "",
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function getStripeSubscriptionIdForUser(
  userId: string,
): Promise<string | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_user_stripe_ids", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const id = row?.stripe_subscription_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function getStripeCustomerIdForUser(
  userId: string,
): Promise<string | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_user_stripe_ids", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const id = row?.stripe_customer_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function findUserIdByStripeCustomerId(
  customerId: string,
): Promise<string | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_find_user_by_stripe_customer",
    { p_customer_id: customerId },
  );
  if (error) {
    throw new Error(error.message);
  }
  return typeof data === "string" ? data : null;
}

/** Adds credits (idempotent caller must gate on webhook event id). */
export async function addUserCredits(
  userId: string,
  amount: number,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Credit-Betrag ungültig.");
  }
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_add_user_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : amount;
}

/**
 * Keeps role + Stripe ids in sync. Monthly credits are granted on invoice.paid.
 * Opens a new booking row only when the active package id changes.
 */
export async function syncPaidMembership(input: {
  userId: string;
  packageId: PaidMembershipPackageId;
  customerId: string;
  subscriptionId: string;
  monthlyPrice?: number;
  notes?: string;
}): Promise<void> {
  await saveStripeCustomerId(input.userId, input.customerId);
  await saveStripeSubscriptionId(input.userId, input.subscriptionId);
  await setMembershipRoleForUser(
    input.userId,
    PACKAGE_TO_MEMBERSHIP_ROLE[input.packageId],
  );

  const { listPackageBookingsForUser } = await import("@/lib/users/billing");
  const bookings = await listPackageBookingsForUser(input.userId);
  const active = bookings.find((row) => row.endedAt === null);
  if (!active || active.packageId !== input.packageId) {
    await startPackageBooking({
      userId: input.userId,
      packageId: input.packageId,
      monthlyPrice: input.monthlyPrice,
      notes: input.notes ?? `stripe:${input.subscriptionId}`,
    });
  }
}

/**
 * First activation after Checkout: role + booking.
 * Package credits are granted on `invoice.paid` (billing anniversary), not here —
 * unless `grantPackageCredits` is set for admin/legacy paths.
 */
export async function activatePaidMembership(input: {
  userId: string;
  packageId: PaidMembershipPackageId;
  customerId: string;
  subscriptionId: string;
  monthlyPrice?: number;
  grantPackageCredits?: boolean;
  notes?: string;
}): Promise<void> {
  await syncPaidMembership({
    userId: input.userId,
    packageId: input.packageId,
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    monthlyPrice: input.monthlyPrice,
    notes: input.notes,
  });

  if (input.grantPackageCredits) {
    const packages = await loadMembershipPackages();
    const pkg = packages.find((row) => row.id === input.packageId);
    const credits = pkg?.credits ?? 0;
    if (credits > 0) {
      await addUserCredits(input.userId, credits);
    }
  }

  await logUserActivity({
    userId: input.userId,
    action: "billing.subscription_activated",
    label: input.packageId,
    metadata: {
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
    },
  });
}

/** Ends paid access: role → basis (unless admin), clear subscription id, close booking. */
export async function deactivatePaidMembership(input: {
  userId: string;
  subscriptionId?: string;
}): Promise<void> {
  await setMembershipRoleForUser(input.userId, "basis");
  await saveStripeSubscriptionId(input.userId, null);

  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_end_active_package_bookings", {
    p_user_id: input.userId,
    p_ended_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(error.message);
  }

  await logUserActivity({
    userId: input.userId,
    action: "billing.subscription_ended",
    label: input.subscriptionId ?? "",
    metadata: { subscriptionId: input.subscriptionId ?? null },
  });
}

/** Returns false if this Stripe event was already processed. */
export async function claimStripeWebhookEvent(
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_claim_stripe_webhook_event",
    {
      p_event_id: eventId,
      p_event_type: eventType,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  return data === true;
}

/** Removes a claimed event so Stripe can retry after a handler failure. */
export async function releaseStripeWebhookEvent(eventId: string): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_delete_stripe_webhook_event", {
    p_event_id: eventId,
  });
  if (error) {
    console.warn("[releaseStripeWebhookEvent]", error.message);
  }
}
