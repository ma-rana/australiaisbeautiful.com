// app/contributions/page.tsx — your own contributions.
//
// PRIVATE. Only you see this. It is not a profile and never becomes one — no
// other user can view it, and there's no public equivalent (D23: everyone is an
// anonymous Explorer on the pages themselves).
//
// Shows both kinds of contribution:
//   - MOMENTS you've shared, with their status and controls
//   - PLACES you've suggested, and what happened to them

import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { MomentRow, type OwnMoment } from "./MomentRow";

export default async function ContributionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?callbackUrl=/contributions");

  const moments = await db.moment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      location: { select: { name: true, slug: true, suburb: true, state: true } },
      media: { orderBy: { position: "asc" }, select: { id: true, thumbKey: true, mediaKey: true, status: true } },
    },
  });

  const own: OwnMoment[] = moments.map((m) => ({
    id: m.id,
    caption: m.caption,
    status: m.status,
    isPublic: m.isPublic,
    reactionCount: m.reactionCount,
    createdAt: m.createdAt.toISOString(),
    rejectionReason: m.rejectionReason,
    location: {
      name: m.location.name,
      slug: m.location.slug,
      place: [m.location.suburb, m.location.state].filter(Boolean).join(", "),
    },
    media: m.media.map((mm) => ({
      id: mm.id,
      src: resolveMediaSrc(mm.thumbKey ?? mm.mediaKey) ?? "",
    })),
  }));

  // Places you've suggested. A request row is per-cluster, so read them through
  // the requests you created... but requests have no userId in the schema, so
  // this is intentionally limited: we show clusters you can't be linked to.
  // (Left out until requests carry an author — see the note below.)

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1
        className="text-3xl text-[var(--ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Your contributions
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Only you can see this page. Your photos appear on the places themselves
        as &ldquo;shared by an Explorer&rdquo; — never under your name.
      </p>

      {own.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
          <p
            className="text-xl text-[var(--ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Nothing shared yet
          </p>
          <p className="mt-2 text-[var(--muted)]">
            Been somewhere worth knowing about? Add your photos and what you
            learned.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md border border-[var(--border)] px-4 py-2 text-sm"
          >
            Browse places
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-5">
          {own.map((m) => (
            <li key={m.id}>
              <MomentRow moment={m} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
