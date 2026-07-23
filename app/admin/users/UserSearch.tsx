"use client";

// app/admin/users/UserSearch.tsx — look up an account by email.
//
// Search, not browse: the product has no concept of viewing users, and listing
// every contributor with their email would be a privacy problem for no benefit.
// You search for the specific person you're about to act on.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    router.push(trimmed ? `/users?q=${encodeURIComponent(trimmed)}` : "/users");
  };

  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="email address"
        className="admin-input flex-1"
      />
      <button type="submit" className="admin-btn admin-btn-quiet">
        Search
      </button>
    </form>
  );
}
