// app/admin/users/page.tsx — accounts and roles.
//
// ADMIN ONLY. This is where staff are made and unmade, and it's the most
// sensitive screen in the product: a role grant is how a compromised account
// becomes a more dangerous compromised account.
//
// Deliberately NOT a browsable directory of everyone. It's a search tool — you
// look up a specific person you're about to act on. Listing every contributor
// with their email would be a privacy problem and serves no purpose; the product
// has no concept of browsing users.

import { db } from "@/lib/db";
import {
  requireAdmin,
  getSessionUser,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "../AdminNav";
import { UserRow, type ManagedUser } from "./UserRow";
import { UserSearch } from "./UserSearch";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-neutral-500">
            Only administrators manage accounts and roles.
          </p>
        </main>
      );
    }
    throw e;
  }

  const me = await getSessionUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // Staff are always shown — you need to see who has access without hunting.
  const staff = await db.user.findMany({
    where: { role: { in: ["CURATOR", "MODERATOR", "ADMIN"] } },
    orderBy: [{ role: "desc" }, { email: "asc" }],
    select: { id: true, email: true, role: true, status: true, createdAt: true },
  });

  // Everyone else only appears via explicit search.
  const found = query
    ? await db.user.findMany({
        where: {
          email: { contains: query, mode: "insensitive" },
          role: "EXPLORER",
        },
        orderBy: { email: "asc" },
        take: 20,
        select: { id: true, email: true, role: true, status: true, createdAt: true },
      })
    : [];

  const toManaged = (u: (typeof staff)[number]): ManagedUser => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    isSelf: u.id === me?.id,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {staff.length} with staff access
          </p>
        </div>
        <AdminNav role="ADMIN" current="/users" />
      </header>

      {/* Staff — always visible */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Staff
        </h2>
        <ul className="mt-3 space-y-3">
          {staff.map((u) => (
            <li key={u.id}>
              <UserRow user={toManaged(u)} />
            </li>
          ))}
        </ul>
      </section>

      {/* Search — for granting access to an existing contributor */}
      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Find an account
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Search by email to grant staff access or suspend an account. Accounts
          aren&apos;t browsable — look up the person you mean to act on.
        </p>
        <UserSearch initial={query} />

        {query && (
          <ul className="mt-4 space-y-3">
            {found.length === 0 ? (
              <li className="text-sm text-neutral-500">
                No account matching &ldquo;{query}&rdquo;.
              </li>
            ) : (
              found.map((u) => (
                <li key={u.id}>
                  <UserRow user={toManaged(u)} />
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      <p className="mt-12 rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
        Granting staff access changes where someone signs in: staff credentials
        work on this admin site and stop working on the public one. Demoting
        reverses it.
      </p>
    </main>
  );
}
