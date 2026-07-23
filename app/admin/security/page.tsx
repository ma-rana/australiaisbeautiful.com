// app/admin/security/page.tsx — your account security.
//
// Where staff turn on two-factor. Presented as REQUIRED even while enforcement
// is still staged: staff should treat it as expected, not optional, and the copy
// says so plainly. (The actual sign-in block flips on via STAFF_2FA_REQUIRED —
// see lib/twofactor.ts.)

import { db } from "@/lib/db";
import {
  requireCurator,
  getSessionUser,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav, type AdminRole } from "../AdminNav";
import { TwoFactorPanel } from "./TwoFactorPanel";

export default async function SecurityPage() {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
        </main>
      );
    }
    throw e;
  }

  const me = await getSessionUser();
  const role = (me?.role ?? "CURATOR") as AdminRole;

  const account = await db.user.findUnique({
    where: { id: me!.id },
    select: { email: true, totpEnabled: true, totpEnrolledAt: true },
  });

  const unusedCodes = account?.totpEnabled
    ? await db.backupCode.count({ where: { userId: me!.id, usedAt: null } })
    : 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Your security</h1>
          <p className="mt-1 text-sm text-neutral-500">{account?.email}</p>
        </div>
        <AdminNav role={role} current="/security" />
      </header>

      <TwoFactorPanel
        enabled={account?.totpEnabled ?? false}
        enrolledAt={account?.totpEnrolledAt?.toISOString() ?? null}
        unusedBackupCodes={unusedCodes}
      />
    </main>
  );
}
