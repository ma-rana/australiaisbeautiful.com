// app/admin/users/page.tsx — accounts and roles.
//
// ADMIN ONLY. The most sensitive screen in the product: a role grant is how a
// compromised account becomes a more dangerous compromised account.
//
// Deliberately NOT a browsable directory. Staff are listed because you need to
// see who has access; everyone else is search-only. Listing every contributor
// with their email would be a privacy problem serving no purpose — the product
// has no concept of browsing users.

import { db } from "@/lib/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserRow, type ManagedUser } from "./UserRow";
import { UserSearch } from "./UserSearch";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

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
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only administrators manage accounts and roles.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const staff = await db.user.findMany({
    where: { role: { in: ["CURATOR", "MODERATOR", "ADMIN"] } },
    orderBy: [{ role: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      totpEnabled: true,
    },
  });

  const found = query
    ? await db.user.findMany({
        where: {
          email: { contains: query, mode: "insensitive" },
          role: "EXPLORER",
        },
        orderBy: { email: "asc" },
        take: 20,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          totpEnabled: true,
        },
      })
    : [];

  const toManaged = (u: (typeof staff)[number]): ManagedUser => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    twoFactorOn: u.totpEnabled,
    isSelf: u.id === ctx.userId,
  });

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/users"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Accounts"
      subtitle={`${staff.length} with staff access`}
    >
      <section>
        <p className="admin-eyebrow">Staff</p>
        <ul className="mt-3 space-y-3">
          {staff.map((u) => (
            <li key={u.id}>
              <UserRow user={toManaged(u)} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <p className="admin-eyebrow">Find an account</p>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Search by email to grant staff access or suspend an account.
        </p>
        <UserSearch initial={query} />

        {query && (
          <ul className="mt-4 space-y-3">
            {found.length === 0 ? (
              <li className="admin-panel px-4 py-6 text-center text-sm text-[var(--muted)]">
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

      <p className="mt-10 text-sm text-[var(--muted)]">
        Granting staff access changes where someone signs in: staff credentials
        work on this admin site and stop working on the public one. Demoting
        reverses it.
      </p>
    </AdminShell>
  );
}
