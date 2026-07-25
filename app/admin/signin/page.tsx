// app/admin/signin/page.tsx — the staff door's SERVER half.
//
// Distinct from the public /signin. This is the staff door: only staff roles
// pass (auth.ts door separation), and it lives on the admin surface — the
// admin subdomain in production, admin.localhost in dev.
//
// THE GUARD: a staff member with a live session who lands back on this page
// (bookmark, back button, typed URL) is bounced straight to the dashboard —
// same pattern and reasoning as the public /signin (see app/signin/page.tsx).
//
// The guard checks the ROLE, not just the session. The session cookie is
// host-scoped, so the session read here is the admin host's own — but if a
// non-staff session ever does appear on this host (a dev cookie-domain
// misconfiguration is the realistic way), redirecting it to "/" would bounce
// it into the admin layout's own rejection and could loop. A non-staff
// session gets the form, where the admin door will refuse it with the honest
// message.
//
// Redirect target is "/" — on the admin host the middleware rewrites that to
// the app/admin dashboard, which is where a signed-in staff member belongs.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminSignInForm } from "./AdminSignInForm";

export default async function AdminSignInPage() {
  const user = await getSessionUser();
  const isStaff =
    user?.role === "CURATOR" ||
    user?.role === "MODERATOR" ||
    user?.role === "ADMIN";

  if (isStaff) redirect("/");

  return <AdminSignInForm />;
}
