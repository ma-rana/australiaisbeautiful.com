"use client";

// app/admin/users/UserRow.tsx — one account, with role and status controls.
//
// Role changes are confirmed explicitly, because the consequences aren't
// obvious: granting staff access moves where that person can sign in, and
// promoting to admin hands over the keys.
//
// Your own row shows no controls. You can't change your own role or suspend
// yourself — both are enforced server-side too; this just doesn't offer it.

import { useState, useTransition } from "react";
import { setUserRole, setUserStatus } from "./actions";

export type ManagedUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  isSelf: boolean;
};

const ROLES = [
  { value: "EXPLORER", label: "Explorer", blurb: "Contributes on the public site" },
  { value: "CURATOR", label: "Curator", blurb: "Approves and writes up places" },
  { value: "MODERATOR", label: "Moderator", blurb: "Also reviews published photos" },
  { value: "ADMIN", label: "Admin", blurb: "Full access, including takedowns and roles" },
];

export function UserRow({ user }: { user: ManagedUser }) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const applyRole = (next: string) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const res = await setUserRole(user.id, next);
      if (res.ok) {
        setRole(next);
        setPendingRole(null);
        setNote(`Now a ${next.toLowerCase()}.`);
      } else {
        setError(res.error);
        setPendingRole(null);
      }
    });
  };

  const toggleStatus = () => {
    setError(null);
    setNote(null);
    const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    startTransition(async () => {
      const res = await setUserStatus(user.id, next);
      if (res.ok) {
        setStatus(next);
        setNote(next === "SUSPENDED" ? "Account suspended." : "Account reinstated.");
      } else setError(res.error);
    });
  };

  const isStaff = role !== "EXPLORER";

  return (
    <div className="rounded-lg border border-neutral-200 px-5 py-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium">
            {user.email}
            {user.isSelf && (
              <span className="ml-2 text-xs font-normal text-neutral-500">(you)</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {role.toLowerCase()}
            {status !== "ACTIVE" && ` · ${status.toLowerCase()}`}
            {" · joined "}
            {new Date(user.createdAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        {!user.isSelf && (
          <button
            onClick={toggleStatus}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            {status === "ACTIVE" ? "Suspend" : "Reinstate"}
          </button>
        )}
      </div>

      {note && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">{note}</p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Role controls — hidden on your own row. */}
      {!user.isSelf && (
        <div className="mt-3">
          {pendingRole ? (
            <div className="rounded-md bg-neutral-100 px-3 py-3 text-sm dark:bg-neutral-900">
              <p className="font-medium">
                Change {user.email} to {pendingRole.toLowerCase()}?
              </p>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {pendingRole === "EXPLORER"
                  ? "They lose staff access and will sign in on the public site again."
                  : role === "EXPLORER"
                    ? "They gain staff access. Their credentials will stop working on the public site and start working here."
                    : `Their access changes to ${pendingRole.toLowerCase()}.`}
                {pendingRole === "ADMIN" &&
                  " Admins can grant roles and remove places — this hands over the keys."}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => applyRole(pendingRole)}
                  disabled={isPending}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  {isPending ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => setPendingRole(null)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setPendingRole(r.value)}
                  disabled={isPending || r.value === role}
                  title={r.blurb}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    r.value === role
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isStaff && !user.isSelf && (
        <p className="mt-2 text-xs text-neutral-400">
          Signs in at the admin site only.
        </p>
      )}
    </div>
  );
}
