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

import { unstable_noStore as noStore } from "next/cache";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./admin.css";

// The portal's own faces — a utility sans for the interface, mono for anything
// scanned rather than read. Deliberately not the public site's display serif:
// this is a workbench, not a magazine.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();
  return (
    <div className={`${plexSans.variable} ${plexMono.variable}`}>{children}</div>
  );
}
