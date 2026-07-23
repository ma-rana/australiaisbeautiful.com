"use client";

// app/admin/security/TwoFactorPanel.tsx — enrol in, or turn off, two-factor.
//
// The enrolment flow is: generate → scan → PROVE a code → enabled + backup
// codes. The proof step matters: enabling on generation alone is how people lock
// themselves out, having stored a secret they never actually scanned.
//
// Backup codes are shown exactly once. The UI is emphatic about that because
// it's true — they're hashed on save and nobody, including an admin, can get
// them back.

import { useState, useTransition } from "react";
import {
  startEnrolment,
  confirmEnrolment,
  disableTwoFactor,
  regenerateBackupCodes,
} from "./actions";

export function TwoFactorPanel({
  enabled,
  enrolledAt,
  unusedBackupCodes,
}: {
  enabled: boolean;
  enrolledAt: string | null;
  unusedBackupCodes: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isOn, setIsOn] = useState(enabled);

  // Enrolment state
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);

  // Disable / regenerate state
  const [mode, setMode] = useState<"idle" | "disable" | "regen">("idle");
  const [confirmToken, setConfirmToken] = useState("");

  const begin = () => {
    setError(null);
    startTransition(async () => {
      const res = await startEnrolment();
      if (res.ok) {
        setUri(res.uri);
        setSecret(res.secret);
      } else setError(res.error);
    });
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await confirmEnrolment(token);
      if (res.ok) {
        setCodes(res.backupCodes);
        setIsOn(true);
        setUri(null);
        setToken("");
      } else setError(res.error);
    });
  };

  const doDisable = () => {
    setError(null);
    startTransition(async () => {
      const res = await disableTwoFactor(confirmToken);
      if (res.ok) {
        setIsOn(false);
        setMode("idle");
        setConfirmToken("");
      } else setError(res.error);
    });
  };

  const doRegen = () => {
    setError(null);
    startTransition(async () => {
      const res = await regenerateBackupCodes(confirmToken);
      if (res.ok) {
        setCodes(res.backupCodes);
        setCodesAcknowledged(false);
        setMode("idle");
        setConfirmToken("");
      } else setError(res.error);
    });
  };

  const input =
    "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-center text-lg tracking-[0.3em] dark:border-neutral-700";

  // Backup codes just issued — show once, insist they're saved.
  if (codes && !codesAcknowledged) {
    return (
      <section className="mt-8 rounded-lg border-2 border-amber-400 bg-amber-50 p-6 dark:border-amber-600 dark:bg-amber-950/30">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Save these recovery codes now
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300/90">
          This is the only time they&apos;ll be shown. If you lose your phone,
          these are the only way back into your account — without them you&apos;d
          need someone with database access to let you in. Write them down or put
          them in a password manager.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {codes.map((c) => (
            <li
              key={c}
              className="rounded border border-amber-300 bg-white px-3 py-2 text-center dark:border-amber-800 dark:bg-neutral-900"
            >
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-300/80">
          Each code works once.
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
          <input
            type="checkbox"
            checked={codesAcknowledged}
            onChange={(e) => setCodesAcknowledged(e.target.checked)}
            className="mt-1"
          />
          I&apos;ve saved these somewhere safe
        </label>
        <button
          onClick={() => setCodesAcknowledged(true)}
          disabled={!codesAcknowledged}
          className="mt-3 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Done
        </button>
      </section>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {/* The requirement, stated plainly whether or not it's enforced yet. */}
      {!isOn && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800/60 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Two-factor authentication is required for staff accounts
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
            Your account can change what the public sees. A password alone
            isn&apos;t enough protection for that — one phishing email and
            someone else has the same access you do. Set this up now.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Authenticator app</h2>
          <span
            className={`text-sm ${
              isOn
                ? "text-green-700 dark:text-green-400"
                : "text-neutral-500"
            }`}
          >
            {isOn ? "On" : "Off"}
          </span>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {isOn ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Enabled
              {enrolledAt &&
                ` on ${new Date(enrolledAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`}
              . {unusedBackupCodes} recovery{" "}
              {unusedBackupCodes === 1 ? "code" : "codes"} unused.
            </p>

            {unusedBackupCodes <= 3 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                You&apos;re running low on recovery codes. Generate a new set.
              </p>
            )}

            {mode === "idle" ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setMode("regen")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
                >
                  New recovery codes
                </button>
                <button
                  onClick={() => setMode("disable")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-red-600 dark:border-neutral-700 dark:text-red-400"
                >
                  Turn off
                </button>
              </div>
            ) : (
              <div className="rounded-md bg-neutral-100 p-4 dark:bg-neutral-900">
                <p className="text-sm font-medium">
                  {mode === "disable"
                    ? "Enter a current code to turn two-factor off"
                    : "Enter a current code to issue new recovery codes"}
                </p>
                <input
                  value={confirmToken}
                  onChange={(e) => setConfirmToken(e.target.value)}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  className={input + " mt-2"}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={mode === "disable" ? doDisable : doRegen}
                    disabled={isPending}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                      mode === "disable" ? "bg-red-600" : "bg-neutral-900 dark:bg-neutral-700"
                    }`}
                  >
                    {isPending ? "…" : mode === "disable" ? "Turn off" : "Generate"}
                  </button>
                  <button
                    onClick={() => {
                      setMode("idle");
                      setConfirmToken("");
                      setError(null);
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : uri ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-medium">1. Scan this with your app</p>
              <p className="mt-1 text-xs text-neutral-500">
                Google Authenticator, Authy, 1Password — any TOTP app.
              </p>
              {/* QR rendered by a public API-free approach: the otpauth URI as a
                  QR via an inline SVG service would need a dependency, so we
                  show the URI and the manual key. Most apps accept either. */}
              <div className="mt-3 rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`}
                  alt="Two-factor QR code"
                  width={200}
                  height={200}
                  className="mx-auto"
                />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-neutral-500">
                  Can&apos;t scan? Enter this key manually
                </summary>
                <code className="mt-2 block break-all rounded bg-neutral-100 px-3 py-2 font-mono text-xs dark:bg-neutral-900">
                  {secret}
                </code>
              </details>
            </div>

            <div>
              <p className="text-sm font-medium">
                2. Enter the 6-digit code it shows
              </p>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className={input + " mt-2"}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={confirm}
                disabled={isPending || token.length < 6}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {isPending ? "Checking…" : "Turn on two-factor"}
              </button>
              <button
                onClick={() => {
                  setUri(null);
                  setToken("");
                  setError(null);
                }}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={begin}
            disabled={isPending}
            className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isPending ? "…" : "Set up two-factor"}
          </button>
        )}
      </section>
    </div>
  );
}
