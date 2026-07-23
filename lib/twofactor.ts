// lib/twofactor.ts — TOTP two-factor authentication.
//
// WHY (SECURITY.md §13d): a staff account is the highest-value target on the
// platform — it can remove places, delete content, and grant roles. A password
// alone is one phishing email away from handing that over. The separate admin
// door is structure; 2FA is what gives it teeth.
//
// TOTP (RFC 6238) is the pragmatic choice: works with any authenticator app,
// needs no SMS (which is phishable and costs money), and no hardware.
//
// ROLLOUT (deliberately staged):
//   Phase 1 — enrolment works, staff are told it's required, but sign-in doesn't
//             block. This proves the flow without locking the only admin out of
//             their own portal if something's wrong.
//   Phase 2 — set STAFF_2FA_REQUIRED=true. Staff without 2FA can sign in but
//             land on enrolment and can't reach anything else until they finish.
//
// Backup codes are not optional garnish: without them a lost phone means an
// admin who cannot get back in except through direct database access.
//
// NOTE: otplib's API here is the functional one (generateSecret/generateURI/
// verify), and verify is ASYNC. Written against the installed version's types.

import { generateSecret, generateURI, verify } from "otplib";
import { randomBytes, createHash } from "node:crypto";

// PHASE SWITCH. Set true once staff have enrolled (see the note above).
export const STAFF_2FA_REQUIRED = process.env.STAFF_2FA_REQUIRED === "true";

// The label shown in the authenticator app.
const ISSUER = "Australia Is Beautiful";

export function generateTotpSecret(): string {
  return generateSecret();
}

// The otpauth:// URI an authenticator app scans.
export function totpUri(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

// Verify a 6-digit code. Async — the crypto is promise-based in this version.
//
// epochTolerance of 30s allows one step either side of now: clocks drift and
// people type slowly. Wider than this starts meaningfully extending a code's
// usable life.
export async function verifyTotp(
  secret: string,
  token: string,
): Promise<boolean> {
  const cleaned = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = await verify({
      secret,
      token: cleaned,
      epochTolerance: 30,
    });
    return result.valid;
  } catch {
    return false;
  }
}

// --- Backup codes ---------------------------------------------------------

const BACKUP_CODE_COUNT = 10;

// Human-transcribable: no ambiguous characters (0/O, 1/I/L), grouped for
// reading. These get written on paper, so legibility matters.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(10);
    let code = "";
    for (let j = 0; j < 10; j++) {
      code += ALPHABET[bytes[j] % ALPHABET.length];
    }
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

// Backup codes are password-like — we only ever check a presented value, so
// they're hashed. SHA-256 is fine here (unlike a password): these are long,
// random, and single-use, so there's nothing to brute-force cheaply.
export function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");
}

export function normaliseBackupCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}
