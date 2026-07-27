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
  // Whether the account has a password at all. A Google-only account has none,
  // and can't be promoted to staff without the admin setting an initial one
  // (the admin door has no Google button). Only the boolean crosses the wire.
  hasPassword: boolean;
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
  const [initialPassword, setInitialPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Promoting TO a staff role opens the password affordance. Two cases:
  //   - passwordless account (Google-only): a password is REQUIRED, because the
  //     admin door has no Google button (server enforces this too).
  //   - existing-password account: the field is OPTIONAL — leave it blank to
  //     keep their current password, or fill it to set/reset one at the same
  //     time as the promotion.
  const promotingToStaff = pendingRole !== null && pendingRole !== "EXPLORER";
  const passwordRequired = promotingToStaff && !user.hasPassword;

  const applyRole = (next: string) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const toStaff = next !== "EXPLORER";
      const pw = initialPassword.trim();
      const res = await setUserRole(
        user.id,
        next,
        // Send the password only when promoting to staff and one was entered.
        // Blank on an existing-password account = keep current password.
        toStaff && pw.length > 0 ? pw : undefined,
      );
      if (res.ok) {
        setRole(next);
        setPendingRole(null);
        setInitialPassword("");
        setNote(`Now a ${next.toLowerCase()}.`);
      } else {
        setError(res.error);
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

              {/* Promoting to staff → set the password they'll sign in with at
                  the admin door. Required for a Google-only account (no
                  password yet); optional otherwise (blank keeps the current
                  one). */}
              {promotingToStaff && (
                <div className="mt-3">
                  <label
                    htmlFor={`pw-${user.id}`}
                    className="block text-xs font-medium"
                  >
                    {passwordRequired
                      ? "Set an initial password"
                      : "Set or reset password (optional)"}
                  </label>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {passwordRequired ? (
                      <>
                        This account signs in with Google and has no password.
                        Staff sign in at the admin door with a password, so set
                        a temporary one (8+ characters) to share securely —
                        they can change it and enrol two-factor after their
                        first sign-in.
                      </>
                    ) : (
                      <>
                        Leave blank to keep their current password, or set a new
                        one (8+ characters) — useful if they need a fresh
                        credential for the admin door.
                      </>
                    )}
                  </p>
                  <input
                    id={`pw-${user.id}`}
                    type="text"
                    value={initialPassword}
                    onChange={(e) => setInitialPassword(e.target.value)}
                    autoComplete="off"
                    placeholder={
                      passwordRequired
                        ? "At least 8 characters"
                        : "Leave blank to keep current password"
                    }
                    className="admin-input mt-1.5 w-full"
                  />
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => applyRole(pendingRole)}
                  disabled={
                    isPending ||
                    // Required case: need 8+ chars. Optional case: either blank
                    // (keep current) or 8+ chars — block a too-short partial.
                    (passwordRequired &&
                      initialPassword.trim().length < 8) ||
                    (promotingToStaff &&
                      !passwordRequired &&
                      initialPassword.trim().length > 0 &&
                      initialPassword.trim().length < 8)
                  }
                  className="admin-btn admin-btn-primary"
                >
                  {isPending ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => {
                    setPendingRole(null);
                    setInitialPassword("");
                    setError(null);
                  }}
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
