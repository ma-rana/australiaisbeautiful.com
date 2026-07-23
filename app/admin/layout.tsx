// app/admin/layout.tsx — the admin surface's shared layout.
//
// force-dynamic is a SECURITY setting here, not a performance one.
//
// Server components are cached by default. On an authenticated surface that
// means a page rendered while signed IN can be served again after sign-OUT
// without re-running the auth gate — the page looks accessible even though the
// session is gone. The data behind it is still protected (any action re-checks),
// but showing an admin screen to someone signed out is unacceptable on its own.
//
// Forcing dynamic rendering makes every request re-execute the page, which means
// requireCurator/requireModerator/requireAdmin actually run every time.
//
// noStore() additionally opts out of the data cache for anything fetched here.

import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();
  return <>{children}</>;
}
