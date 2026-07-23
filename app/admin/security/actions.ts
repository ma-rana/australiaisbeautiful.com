"use server";

// app/admin/security/actions.ts — enrolling and removing 2FA.
//
// Enrolment is two steps on purpose: we generate a secret and show the QR, but
// we do NOT enable 2FA until the user proves they can produce a valid code from
// it. Enabling on generation alone is how people lock themselves out — the
// secret gets stored, they never actually scan it, and the next sign-in is a
// wall.
//
// Backup codes are shown exactly once, at the moment of enabling. They're hashed
// immediately; nobody can recover them later, including an admin. That's the
// point — but it means the UI has to be emphatic about writing them down.

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  generateTotpSecret,
  totpUri,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
} from "@/lib/twofactor";
import { revalidatePath } from "next/cache";

export type StartEnrolResult =
  | { ok: true; secret: string; uri: string }
  | { ok: false; error: string };

// Step 1: create a secret and hand back the URI for the QR. Nothing is enabled
// yet — the secret is stored so step 2 can verify against it, but totpEnabled
// stays false until a real code is proven.
export async function startEnrolment(): Promise<StartEnrolResult> {
  const user = await requireUser();

  try {
    const existing = await db.user.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true, email: true },
    });
    if (existing?.totpEnabled) {
      return { ok: false, error: "Two-factor is already on for this account." };
    }

    const secret = generateTotpSecret();
    await db.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, totpEnabled: false },
    });

    return { ok: true, secret, uri: totpUri(secret, user.email) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export type ConfirmEnrolResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

// Step 2: prove the authenticator works, then enable and issue backup codes.
export async function confirmEnrolment(
  token: string,
): Promise<ConfirmEnrolResult> {
  const user = await requireUser();

  try {
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!row?.totpSecret) {
      return { ok: false, error: "Start the setup again — no pending secret." };
    }
    if (row.totpEnabled) {
      return { ok: false, error: "Two-factor is already on." };
    }
    if (!(await verifyTotp(row.totpSecret, token))) {
      return {
        ok: false,
        error: "That code didn't match. Check your app and try the current code.",
      };
    }

    const codes = generateBackupCodes();

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { totpEnabled: true, totpEnrolledAt: new Date() },
      });
      // Clear any old codes, then store the new ones hashed.
      await tx.backupCode.deleteMany({ where: { userId: user.id } });
      await tx.backupCode.createMany({
        data: codes.map((c) => ({ userId: user.id, codeHash: hashBackupCode(c) })),
      });
      await tx.moderationAudit.create({
        data: {
          actorId: user.id,
          action: "EDIT",
          targetType: "USER",
          targetId: user.id,
          note: "Two-factor authentication enabled",
        },
      });
    });

    revalidatePath("/security");
    // Returned once, never retrievable again.
    return { ok: true, backupCodes: codes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

// Turning 2FA off requires a current code — otherwise someone who walks up to an
// unlocked browser can strip the protection off the account.
export async function disableTwoFactor(token: string): Promise<SimpleResult> {
  const user = await requireUser();

  try {
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true, totpEnabled: true, role: true },
    });
    if (!row?.totpEnabled || !row.totpSecret) {
      return { ok: false, error: "Two-factor isn't on for this account." };
    }
    if (!(await verifyTotp(row.totpSecret, token))) {
      return { ok: false, error: "That code didn't match." };
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { totpEnabled: false, totpSecret: null, totpEnrolledAt: null },
      });
      await tx.backupCode.deleteMany({ where: { userId: user.id } });
      await tx.moderationAudit.create({
        data: {
          actorId: user.id,
          action: "EDIT",
          targetType: "USER",
          targetId: user.id,
          note: "Two-factor authentication disabled",
        },
      });
    });

    revalidatePath("/security");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Regenerate backup codes (e.g. after using several). Needs a current code.
export async function regenerateBackupCodes(
  token: string,
): Promise<ConfirmEnrolResult> {
  const user = await requireUser();

  try {
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!row?.totpEnabled || !row.totpSecret) {
      return { ok: false, error: "Two-factor isn't on for this account." };
    }
    if (!(await verifyTotp(row.totpSecret, token))) {
      return { ok: false, error: "That code didn't match." };
    }

    const codes = generateBackupCodes();
    await db.$transaction(async (tx) => {
      await tx.backupCode.deleteMany({ where: { userId: user.id } });
      await tx.backupCode.createMany({
        data: codes.map((c) => ({ userId: user.id, codeHash: hashBackupCode(c) })),
      });
    });

    revalidatePath("/security");
    return { ok: true, backupCodes: codes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
