// app/api/auth/needs-code/route.ts — does this account need a 2FA code?
//
// Auth.js turns any failed authorize() into one generic error, so "wrong
// password" and "correct password, code required" look identical to the sign-in
// page. That's unhelpful: the user needs to be asked for a code, not told their
// password is wrong.
//
// This endpoint answers ONLY after verifying the password. That matters — it
// must not become an oracle that reveals which accounts have 2FA to anyone who
// can type an email address.
//
// It deliberately does NOT establish a session. It's a question, not a login.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      return NextResponse.json({ needsCode: false });
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { password: true, status: true, totpEnabled: true },
    });

    // Same answer for "no such user" and "wrong password" — no enumeration.
    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json({ needsCode: false });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return NextResponse.json({ needsCode: false });
    }

    return NextResponse.json({ needsCode: user.totpEnabled });
  } catch {
    return NextResponse.json({ needsCode: false });
  }
}
