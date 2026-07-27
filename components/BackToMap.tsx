// components/BackToMap.tsx — the quiet way home.
//
// Pages that render without the SiteHeader (/request, /contributions — see the
// note in SiteHeader for why) still need a route back to the map. This is it:
// one specimen-label line, top-left, same device AuthShell uses on the sign-in
// threshold and location pages use for "← All places". One component so the
// wording and treatment can't drift between pages.

import Link from "next/link";
import { ArrowLeft } from "@/components/icons";

export function BackToMap() {
  return (
    <Link
      href="/"
      className="specimen-label inline-flex items-center gap-1.5 transition-colors hover:text-[var(--ink)] focus-visible:text-[var(--ink)] focus-visible:outline-none"
    >
      <ArrowLeft size={15} strokeWidth={2.4} />
      Back to the map
    </Link>
  );
}
