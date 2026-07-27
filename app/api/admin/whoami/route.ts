// app/api/admin/whoami/route.ts — returns the current admin-door session's role.
//
// Used by the admin sign-in page to confirm a just-signed-in account is staff
// before letting them into the admin area. Returns only the role (nothing
// sensitive). Not a security boundary itself — the real gate is
// requireModerator()/requireAdmin() on every admin page + action.
//
// DOOR-AWARE: reports a role only for a session minted through the admin door.
// A public/Google session — even a staff member's — reports null here, so this
// endpoint can never make the sign-in flow believe a public session is admitted
// to the admin area. Mirrors the require* guards.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  const role = user && user.door === "admin" ? user.role : null;
  return NextResponse.json({ role });
}
