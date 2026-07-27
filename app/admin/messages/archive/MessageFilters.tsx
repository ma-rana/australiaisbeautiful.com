"use client";

// app/admin/messages/archive/MessageFilters.tsx — the search + filter bar for
// the message archive.
//
// URL-driven, like UserSearch: every filter is a query param, so an archive
// view is a shareable/bookmarkable link and the back button works. The server
// page reads the params and queries; this component only edits the URL.
//
// Text search runs on submit (a keystroke-per-query would hammer the DB);
// category and status apply immediately (they're cheap, discrete choices).

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { value: "", label: "All kinds" },
  { value: "BUG", label: "Bugs" },
  { value: "HELP", label: "Help" },
  { value: "CONTENT_REPORT", label: "Content reports" },
];

const STATUSES = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
];

export function MessageFilters({
  q,
  category,
  status,
}: {
  q: string;
  category: string;
  status: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(q);

  // Rebuild the query string with one param changed, dropping empties so the
  // URL stays clean (no ?q=&category=&status=).
  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    return `/messages/archive${next.toString() ? `?${next.toString()}` : ""}`;
  };

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(withParam("q", text.trim()));
  };

  return (
    <div className="admin-panel px-4 py-3.5">
      <form onSubmit={submitText} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search messages and emails…"
          className="admin-input flex-1"
        />
        <button type="submit" className="admin-btn admin-btn-quiet">
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Kind
          <select
            value={category}
            onChange={(e) => router.push(withParam("category", e.target.value))}
            className="admin-select"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Status
          <select
            value={status}
            onChange={(e) => router.push(withParam("status", e.target.value))}
            className="admin-select"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {(q || category || status) && (
          <button
            onClick={() => router.push("/messages/archive")}
            className="text-xs text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
