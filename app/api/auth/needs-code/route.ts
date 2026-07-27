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
//
// RATE LIMITED per IP (SECURITY.md §11): this route runs bcrypt.compare on
// attacker-supplied input, which makes it (a) a password-guessing oracle and
// (b) a cheap way to burn our CPU. Failed attempts also count against the same
// per-email budget the real login uses, so probing here spends the same
// allowance as failing at the front door.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { check, consume, recordFailure, LIMITS } from "@/lib/rate-limit";

function clientIp(req: NextRequest): string {
  // Behind Nginx, the client is in x-forwarded-for; first hop is the real one.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  try {
    // Per-IP ceiling on probes. 429 with Retry-After, no information leaked.
    const ip = clientIp(req);
    const rl = consume(`needs-code:${ip}`, LIMITS.NEEDS_CODE_IP);
    if (!rl.ok) {
      return NextResponse.json(
        { needsCode: false },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const { email: rawEmail, password } = (await req.json()) as {
      email?: string;
      password?: string;
    };
    // Lowercased to match signup + authorize — one normalization everywhere.
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !password) {
      return NextResponse.json({ needsCode: false });
    }

    // If this email is already locked out at the front door, don't run the
    // compare at all — same generic answer, no oracle.
    const emailKey = `login:${email}`;
    if (!check(emailKey, LIMITS.LOGIN_EMAIL).ok) {
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
    // Google-only account (empty stored password): there's no password to need
    // a code for. Same generic answer — the sign-in form will fail the password
    // step and the user takes the Google button instead.
    if (!user.password) {
      return NextResponse.json({ needsCode: false });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      // A wrong password here is the same event as a wrong password at login.
      recordFailure(emailKey, LIMITS.LOGIN_EMAIL);
      return NextResponse.json({ needsCode: false });
    }

    return NextResponse.json({ needsCode: user.totpEnabled });
  } catch {
    return NextResponse.json({ needsCode: false });
  }
}
