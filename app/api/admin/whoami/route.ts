// app/api/admin/whoami/route.ts — returns the current session's role.
//
// Used by the admin sign-in page to confirm a just-signed-in account is staff
// before letting them into the admin area. Returns only the role (nothing
// sensitive). Not a security boundary itself — the real gate is
// requireModerator()/requireAdmin() on every admin page + action.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ role: user?.role ?? null });
}
