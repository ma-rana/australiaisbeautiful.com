// app/admin/security/page.tsx — your account security.
//
// Where staff turn on two-factor. Presented as REQUIRED even while enforcement
// is staged: staff should treat it as expected, not optional, and the copy says
// so plainly.

import { db } from "@/lib/db";
import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";
import { TwoFactorPanel } from "./TwoFactorPanel";

export default async function SecurityPage() {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;

  const account = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { totpEnabled: true, totpEnrolledAt: true },
  });

  const unusedCodes = account?.totpEnabled
    ? await db.backupCode.count({ where: { userId: ctx.userId, usedAt: null } })
    : 0;

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/security"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Your security"
      subtitle={ctx.email}
    >
      <div className="max-w-xl">
        <TwoFactorPanel
          enabled={account?.totpEnabled ?? false}
          enrolledAt={account?.totpEnrolledAt?.toISOString() ?? null}
          unusedBackupCodes={unusedCodes}
        />
      </div>
    </AdminShell>
  );
}
