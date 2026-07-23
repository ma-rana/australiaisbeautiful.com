"use server";

// app/admin/users/actions.ts — granting roles and suspending accounts.
//
// ADMIN ONLY. Role grants are the highest-risk action on the platform: it is how
// a compromised moderator account becomes a compromised admin account. Every one
// is audited.
//
// GUARDRAILS (each exists because of a specific way this goes wrong):
//   - Roles are ADMIN-GRANTED, never self-serve. There is no "apply to be a
//     moderator" path anywhere in the product.
//   - You cannot change your OWN role. Otherwise a compromised admin session can
//     entrench itself, and an admin can't accidentally demote themselves out of
//     the ability to fix it.
//   - You cannot suspend yourself, for the same reason.
//   - The LAST remaining admin cannot be demoted or suspended. A platform with
//     zero admins has no way back except direct database access.
//
// Note on the door separation (auth.ts): granting someone a staff role means
// their credentials STOP working on the public site and start working on the
// admin host. Demoting reverses that. The UI says so, because it's surprising
// otherwise.

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type UserActionResult = { ok: true } | { ok: false; error: string };

type Role = "EXPLORER" | "CURATOR" | "MODERATOR" | "ADMIN";
const ROLES: Role[] = ["EXPLORER", "CURATOR", "MODERATOR", "ADMIN"];

// Would this change leave the platform with no admins?
async function wouldStrandPlatform(userId: string): Promise<boolean> {
  const admins = await db.user.count({
    where: { role: "ADMIN", status: "ACTIVE" },
  });
  if (admins > 1) return false;
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  return target?.role === "ADMIN" && target.status === "ACTIVE";
}

export async function setUserRole(
  userId: string,
  role: string,
): Promise<UserActionResult> {
  const actor = await requireAdmin();

  if (!ROLES.includes(role as Role)) {
    return { ok: false, error: "Unknown role." };
  }
  if (userId === actor.id) {
    return {
      ok: false,
      error:
        "You can't change your own role. Ask another administrator if you need this.",
    };
  }
  if (role !== "ADMIN" && (await wouldStrandPlatform(userId))) {
    return {
      ok: false,
      error:
        "This is the only active administrator. Promote someone else first — a platform with no admins can't be fixed from inside.",
    };
  }

  try {
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!target) return { ok: false, error: "That account no longer exists." };
    if (target.role === role) return { ok: true }; // no-op

    const promoting =
      ROLES.indexOf(role as Role) > ROLES.indexOf(target.role as Role);

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { role: role as never } });
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: promoting ? "ROLE_GRANT" : "ROLE_REVOKE",
          targetType: "USER",
          targetId: userId,
          note: `${target.email}: ${target.role} → ${role}`,
        },
      });
    });

    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setUserStatus(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<UserActionResult> {
  const actor = await requireAdmin();

  if (userId === actor.id) {
    return { ok: false, error: "You can't suspend your own account." };
  }
  if (status === "SUSPENDED" && (await wouldStrandPlatform(userId))) {
    return {
      ok: false,
      error: "This is the only active administrator — suspending them locks everyone out.",
    };
  }

  try {
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true },
    });
    if (!target) return { ok: false, error: "That account no longer exists." };

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: status === "SUSPENDED" ? "USER_SUSPEND" : "USER_REINSTATE",
          targetType: "USER",
          targetId: userId,
          note: `${target.email}: ${target.status} → ${status}`,
        },
      });
    });

    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
