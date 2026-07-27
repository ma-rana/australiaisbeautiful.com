// app/admin/messages/archive/page.tsx — the searchable message archive.
//
// The inbox (../page.tsx) is for what needs doing now: open messages, plus a
// short tail of recent resolved. THIS page is for looking back — every message
// ever, searchable by text and filterable by kind and status. Nothing is
// deleted (resolving only flips status), so the archive is the full history.
//
// URL-driven (see MessageFilters): ?q=&category=&status= — a filtered view is a
// shareable link. Moderator+, same as the inbox.

import { db } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireModerator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCard, type QueueMessage } from "../MessageCard";
import { MessageFilters } from "./MessageFilters";
import { AdminShell } from "../../AdminShell";
import { getAdminContext } from "../../context";

const CATEGORIES = ["BUG", "HELP", "CONTENT_REPORT"] as const;
const STATUSES = ["OPEN", "RESOLVED"] as const;

export default async function MessageArchive({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  try {
    await requireModerator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            The support archive is a moderator&apos;s job.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  // Validate the enum params — an unknown value is ignored rather than trusted
  // into the query.
  const category = CATEGORIES.includes(sp.category as never)
    ? (sp.category as (typeof CATEGORIES)[number])
    : "";
  const status = STATUSES.includes(sp.status as never)
    ? (sp.status as (typeof STATUSES)[number])
    : "";

  // Build the where-clause from whatever filters are set.
  const where: Prisma.SupportMessageWhereInput = {
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { body: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { resolutionNote: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const messages = await db.supportMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const toQueue = (m: (typeof messages)[number]): QueueMessage => ({
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
    fromMember: Boolean(m.userId),
  });

  const filtered = Boolean(q || category || status);

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/messages"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Message archive"
      subtitle="Every message, searchable. Nothing here is deleted."
      actions={
        <Link
          href="/messages"
          className="rounded border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
        >
          ← Back to inbox
        </Link>
      }
    >
      <MessageFilters q={q} category={category} status={status} />

      <p className="mt-4 text-xs text-[var(--muted)]">
        {messages.length === 100
          ? "Showing the first 100 matches — narrow the search to see more."
          : `${messages.length} ${messages.length === 1 ? "message" : "messages"}${
              filtered ? " match" : ""
            }`}
      </p>

      {messages.length === 0 ? (
        <div className="admin-panel mt-3 px-5 py-12 text-center">
          <p className="text-sm font-medium">Nothing found</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filtered
              ? "No messages match these filters. Try broadening the search."
              : "No messages yet. They'll appear here as the public sends them."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-4">
          {messages.map((m) => (
            <li key={m.id}>
              <MessageCard message={toQueue(m)} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
