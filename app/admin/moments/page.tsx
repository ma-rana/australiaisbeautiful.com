// app/admin/moments/page.tsx — the moment review list.
//
// MODERATION MODEL: moments publish IMMEDIATELY on approved places. The
// editorial gate is on WHICH PLACES EXIST (location requests are reviewed), not
// on contributions to places that are already live. So this is NOT a gate-queue
// — it's a POST-publication review list: what has recently gone live, newest
// first, so a moderator can spot and remove anything that shouldn't be there.
//
// Shows CONTENT, not the contributor (MODERATION.md §2) — no email, no "all
// uploads by this user".
//
// Gated by requireModerator(). Staff sign in on the admin host only.

import { db } from "@/lib/db";
import { requireModerator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { ReviewCard, type QueueMoment } from "./ReviewCard";
import { AdminSignOut } from "../AdminSignOut";
import { redirect } from "next/navigation";

export default async function ModerationQueue() {
  // The real gate. Unauthenticated → admin sign-in. Authenticated-but-not-staff
  // → a plain not-authorised state (they have an account, just not the access).
  try {
    await requireModerator();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      // On the admin host, /signin IS the admin sign-in (middleware maps it to
      // app/admin/signin). No /admin prefix in URLs — the host is the boundary.
      redirect("/signin");
    }
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-neutral-500">
            This account doesn&apos;t have moderator access.
          </p>
        </main>
      );
    }
    throw e;
  }

  // Recently published moments — newest first, because the point is to catch
  // what just went live. Deliberately NO user include (content, not contributor).
  const moments = await db.moment.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      location: { select: { name: true, suburb: true, state: true, slug: true } },
      media: { orderBy: { position: "asc" } },
    },
  });

  const queue: QueueMoment[] = moments.map((m) => ({
    id: m.id,
    caption: m.caption,
    createdAt: m.createdAt.toISOString(),
    location: {
      name: m.location.name,
      place: [m.location.suburb, m.location.state].filter(Boolean).join(", "),
    },
    media: m.media.map((mm) => ({ id: mm.id, src: mm.mediaKey })),
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Recently published</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {queue.length} live · newest first · remove anything that
            shouldn&apos;t be here
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AdminSignOut />
        </div>
      </header>

      {queue.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">Nothing published yet</p>
          <p className="mt-1 text-neutral-500">
            Contributions appear here as soon as they go live.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-6">
          {queue.map((m) => (
            <li key={m.id}>
              <ReviewCard moment={m} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
