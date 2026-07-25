"use server";

// app/signup/actions.ts — create an explorer account.
//
// The whole public side funnels here eventually: the Phase 2 exit question is
// "will a stranger upload?", and until this action existed a stranger
// couldn't even get in the door.
//
// What signup deliberately does NOT collect: a name, a handle, an avatar.
// A User is an email and a password (D23 — no public identities). What it
// deliberately does NOT create: anything but an EXPLORER. Staff roles are
// granted by an admin, audited, never self-selected.
//
// The action only CREATES the account. The client then signs in through the
// normal Auth.js credentials flow — one code path for session creation, not
// two to keep in sync.

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { consume, LIMITS } from "@/lib/rate-limit";
import { SignUpSchema } from "@/lib/schemas/auth";

export type SignUpResult = { ok: true } | { ok: false; error: string };

export async function createAccount(input: {
  email: string;
  password: string;
}): Promise<SignUpResult> {
  // Zod at the boundary — also lowercases the email (see the schema note).
  const parsed = SignUpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check your details.",
    };
  }
  const { email, password } = parsed.data;

  // Per-IP ceiling (SECURITY.md §11). Behind Nginx the client rides in
  // x-forwarded-for; first hop is the real one.
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const rl = consume(`signup:${ip}`, LIMITS.SIGNUP_IP);
  if (!rl.ok) {
    return {
      ok: false,
      error: "A lot of new accounts from your connection — try again later.",
    };
  }

  // NOTE ON ENUMERATION: "already has an account — sign in instead" does
  // reveal the email exists. That's a deliberate trade, and the standard one:
  // hiding it here means a confused person who forgot they have an account
  // gets a dead end, while an attacker can learn the same fact from the
  // login timing anyway. The lockout limits how fast anyone can farm it.
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "That email already has an account — sign in instead.",
    };
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    await db.user.create({
      data: { email, password: hash }, // role/status default: EXPLORER, ACTIVE
    });
  } catch {
    // The unique constraint races the check above if two signups collide;
    // whichever loses lands here. Same answer as the check.
    return {
      ok: false,
      error: "That email already has an account — sign in instead.",
    };
  }

  return { ok: true };
}
