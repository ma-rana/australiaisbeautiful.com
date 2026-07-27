"use client";

// app/admin/messages/MessageCard.tsx — one support message in the inbox.
//
// Shows the message and the debugging context that came with it (which page,
// which browser, whether the sender left an email). Resolving takes an optional
// internal note ("fixed in a1b2c3", "replied by email"). One-way: there is no
// reply box here — if the sender left an email and it needs an answer, that
// happens out of band. A resolved card can be reopened.

import { useState, useTransition } from "react";
import { resolveMessage, reopenMessage } from "./actions";

export type QueueMessage = {
  id: string;
  category: "BUG" | "HELP" | "CONTENT_REPORT";
  body: string;
  email: string | null;
  path: string | null;
  userAgent: string | null;
  status: "OPEN" | "RESOLVED";
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  fromMember: boolean;
};

const CATEGORY: Record<
  QueueMessage["category"],
  { label: string; tone: "action" | "attention" }
> = {
  BUG: { label: "Bug", tone: "attention" },
  HELP: { label: "Help", tone: "action" },
  CONTENT_REPORT: { label: "Content report", tone: "attention" },
};

export function MessageCard({ message }: { message: QueueMessage }) {
  const [isPending, startTransition] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolved = message.status === "RESOLVED";

  const cat = CATEGORY[message.category];

  const doResolve = () => {
    setError(null);
    startTransition(async () => {
      const res = await resolveMessage(message.id, note);
      if (!res.ok) setError(res.error);
      else setResolving(false);
    });
  };

  const doReopen = () => {
    setError(null);
    startTransition(async () => {
      const res = await reopenMessage(message.id);
      if (!res.ok) setError(res.error);
    });
  };

  const when = new Date(message.createdAt).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={`admin-panel px-4 py-3.5 ${resolved ? "opacity-70" : ""}`}>
      {/* Header row — category tag, when, and origin context. */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide"
          style={{
            color: "#fff",
            background:
              cat.tone === "attention" ? "var(--attention)" : "var(--action)",
          }}
        >
          {cat.label}
        </span>
        <span className="admin-data text-xs text-[var(--muted)]">{when}</span>
        <span className="text-xs text-[var(--muted)]">
          · {message.fromMember ? "signed-in sender" : "anonymous"}
        </span>
        {resolved && (
          <span
            className="ml-auto text-xs font-medium"
            style={{ color: "var(--action)" }}
          >
            Resolved
          </span>
        )}
      </div>

      {/* The message. */}
      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">
        {message.body}
      </p>

      {/* Debugging context — the details that make a bug reproducible. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        {message.path && (
          <span>
            On page: <span className="admin-data">{message.path}</span>
          </span>
        )}
        {message.email && (
          <span>
            Reply to:{" "}
            <a
              href={`mailto:${message.email}`}
              className="admin-data underline underline-offset-2 hover:text-[var(--ink)]"
            >
              {message.email}
            </a>
          </span>
        )}
      </div>
      {message.userAgent && (
        <p className="admin-data mt-1 truncate text-[0.68rem] text-[var(--muted)]/70" title={message.userAgent}>
          {message.userAgent}
        </p>
      )}

      {/* Resolution note, once resolved. */}
      {resolved && message.resolutionNote && (
        <p className="mt-2 rounded px-2 py-1.5 text-xs" style={{ background: "var(--sunken)" }}>
          <span className="text-[var(--muted)]">Note: </span>
          {message.resolutionNote}
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      {/* Actions. */}
      <div className="mt-3">
        {resolved ? (
          <button
            onClick={doReopen}
            disabled={isPending}
            className="admin-btn admin-btn-quiet"
          >
            Reopen
          </button>
        ) : resolving ? (
          <div className="rounded px-3 py-3" style={{ background: "var(--sunken)" }}>
            <label htmlFor={`note-${message.id}`} className="text-xs font-medium">
              How was this handled? (optional, internal)
            </label>
            <input
              id={`note-${message.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Fixed in a1b2c3 · replied by email · duplicate…"
              className="admin-input mt-1.5 w-full"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={doResolve}
                disabled={isPending}
                className="admin-btn admin-btn-primary"
              >
                {isPending ? "…" : "Mark resolved"}
              </button>
              <button
                onClick={() => {
                  setResolving(false);
                  setNote("");
                  setError(null);
                }}
                className="admin-btn admin-btn-quiet"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setResolving(true)}
            disabled={isPending}
            className="admin-btn admin-btn-primary"
          >
            Resolve
          </button>
        )}
      </div>
    </div>
  );
}
