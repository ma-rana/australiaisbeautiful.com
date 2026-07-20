// app/admin/moments/page.tsx — the moment moderation queue.
//
// MODERATION.md: the queue shows CONTENT, not the contributor (§2) — no email,
// no "all uploads by this user", userId hidden by default. A moderator reviews
// what was uploaded and decides whether the public sees it.
//
// Gated by requireModerator() (§2). Currently satisfied by the temporary dev
// actor; when real auth lands, this page is protected automatically with no
// change here.

import { db } from "@/lib/db";
import { requireModerator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { ReviewCard, type QueueMoment } from "./ReviewCard";
import Link from "next/link";

export default async function ModerationQueue() {
  // The real gate. If it throws, show a plain not-authorised state rather than
  // a stack trace.
  try {
    await requireModerator();
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-neutral-500">
            You need moderator access to review the queue.
          </p>
        </main>
      );
    }
    throw e;
  }

  // The queue: pending moments, oldest first (fairness — first in, first
  // reviewed), with their pending media and the location they belong to.
  // Deliberately NO user include — content, not contributor (§2).
  const moments = await db.moment.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
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
          <h1 className="text-2xl font-semibold">Moment queue</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {queue.length} awaiting review · oldest first
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          ← Site
        </Link>
      </header>

      {queue.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">Queue clear</p>
          <p className="mt-1 text-neutral-500">
            Nothing waiting. New uploads appear here for review.
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
