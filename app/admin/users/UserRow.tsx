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
  twoFactorOn: boolean;
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
    <div className="admin-panel px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {user.email}
            {user.isSelf && (
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                you
              </span>
            )}
          </p>
          <p className="admin-data mt-0.5 text-xs text-[var(--muted)]">
            {role.toLowerCase()}
            {status !== "ACTIVE" && (
              <span style={{ color: "var(--attention)" }}>
                {" · "}
                {status.toLowerCase()}
              </span>
            )}
            {isStaff && !user.twoFactorOn && (
              <span style={{ color: "var(--attention)" }}> · no 2FA</span>
            )}
            {" · "}
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
            className="admin-btn admin-btn-quiet"
          >
            {status === "ACTIVE" ? "Suspend" : "Reinstate"}
          </button>
        )}
      </div>

      {note && (
        <p className="mt-2 text-sm" style={{ color: "var(--action)" }}>
          {note}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {/* Role controls — hidden on your own row. */}
      {!user.isSelf && (
        <div className="mt-3">
          {pendingRole ? (
            <div className="rounded px-3 py-3 text-sm" style={{ background: "var(--sunken)" }}>
              <p className="font-medium">
                Change {user.email} to {pendingRole.toLowerCase()}?
              </p>
              <p className="mt-1 text-[var(--muted)]">
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
                  className="admin-btn admin-btn-primary"
                >
                  {isPending ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => setPendingRole(null)}
                  className="admin-btn admin-btn-quiet"
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
                  data-on={r.value === role}
                  className="admin-chip"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
