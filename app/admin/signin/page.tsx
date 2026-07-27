// app/admin/signin/page.tsx — the staff door's SERVER half.
//
// Distinct from the public /signin. This is the staff door: only staff roles
// pass (auth.ts door separation), and it lives on the admin surface — the
// admin subdomain in production, admin.localhost in dev.
//
// THE GUARD: a staff member ALREADY signed in through the admin door who lands
// back on this page (bookmark, back button, typed URL) is bounced straight to
// the dashboard — same pattern and reasoning as the public /signin.
//
// The check is role AND door: only a session minted through the admin door
// (door === "admin") counts as "already in here". A staff member who merely
// has a public/Google session (e.g. they signed into the public site too) is
// NOT bounced — they still need to authenticate at this door, which is the
// whole point. getSessionUser exposes the door; the admin guards enforce it.
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

  // Only an admin-door session belongs past this page. A public session — even
  // a staff member's — gets the form, because it can't satisfy the admin guards.
  if (isStaff && user?.door === "admin") redirect("/");

  return <AdminSignInForm />;
}
