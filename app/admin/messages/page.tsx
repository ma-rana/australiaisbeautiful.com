// app/admin/messages/page.tsx — the public support / help / bug inbox.
//
// The user-facing side of keeping the platform healthy: bugs to fix, questions
// to answer, content complaints to act on. Moderator+ work, same rank as the
// moment queue.
//
// OPEN first (the work), then a tail of recently RESOLVED for context. One-way:
// there's no reply box — a message is handled by fixing the thing, or replying
// by email out of band if the sender left one. See docs/AUTH.md / the
// SupportMessage model for the reasoning.

import { db } from "@/lib/db";
import { requireModerator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MessageCard, type QueueMessage } from "./MessageCard";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

export default async function MessagesQueue() {
  try {
    await requireModerator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            The support inbox is a moderator&apos;s job.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;

  // OPEN first (newest first — a fresh bug report is usually the urgent one),
  // then a short tail of recently resolved for context and un-resolving.
  const [open, resolved] = await Promise.all([
    db.supportMessage.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.supportMessage.findMany({
      where: { status: "RESOLVED" },
      orderBy: { resolvedAt: "desc" },
      take: 15,
    }),
  ]);

  const toQueue = (m: (typeof open)[number]): QueueMessage => ({
    id: m.id,
    category: m.category,
    body: m.body,
    email: m.email,
    path: m.path,
    userAgent: m.userAgent,
    status: m.status,
    resolutionNote: m.resolutionNote,
    createdAt: m.createdAt.toISOString(),
    resolvedAt: m.resolvedAt?.toISOString() ?? null,
    // Whether the sender was signed in — shown as context, never as an
    // identity. The message is the thing; who sent it is secondary.
    fromMember: Boolean(m.userId),
  });

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/messages"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Messages"
      subtitle="Bugs, help requests and content reports from the public. Resolve each once it's handled."
    >
      {open.length === 0 ? (
        <div className="admin-panel px-5 py-12 text-center">
          <p className="text-sm font-medium">Inbox clear</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            No open messages. New ones from the public help form land here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {open.map((m) => (
            <li key={m.id}>
              <MessageCard message={toQueue(m)} />
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <section className="mt-10">
          <p className="admin-eyebrow">Recently resolved</p>
          <ul className="mt-3 space-y-3">
            {resolved.map((m) => (
              <li key={m.id}>
                <MessageCard message={toQueue(m)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
