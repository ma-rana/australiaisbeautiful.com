// app/admin/moments/page.tsx — what's recently gone live.
//
// Moments publish immediately (the editorial gate is on which places exist, not
// on contributions to places that already do). So this isn't a gate-queue — it's
// a post-publication review list: what's live, newest first, so a moderator can
// spot and remove anything that shouldn't be there.
//
// Shows CONTENT, not the contributor.

import { db } from "@/lib/db";
import { requireModerator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { ReviewCard, type QueueMoment } from "./ReviewCard";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

export default async function ModerationQueue() {
  try {
    await requireModerator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Reviewing published photos is a moderator&apos;s job.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;

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
    media: m.media.map((mm) => ({
      id: mm.id,
      src: resolveMediaSrc(mm.thumbKey ?? mm.mediaKey) ?? "",
    })),
  }));

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/moments"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Moments"
      subtitle="Live now, newest first. Remove anything that shouldn't be here."
    >
      {queue.length === 0 ? (
        <div className="admin-panel px-5 py-12 text-center">
          <p className="text-sm font-medium">Nothing published yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Contributions appear here as soon as they go live.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {queue.map((m) => (
            <li key={m.id}>
              <ReviewCard moment={m} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
