// lib/schemas/auth.ts — Zod at the account boundaries.
//
// Deliberately spare. No display name, no handle, no avatar upload — a User
// here is an email and a password, full stop (D23: there are no public
// identities, so signup collects nothing that could become one).

import { z } from "zod";

export const SignUpSchema = z.object({
  // Emails are STORED AND COMPARED lowercase. Case-insensitive local parts are
  // the near-universal reality, and "Foo@x.com can sign up but not sign in"
  // is the bug normalization prevents. Normalize here AND in authorize().
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That doesn't look like an email address.")
    .max(254),
  // Length is the only requirement. Composition rules (one symbol, one
  // digit...) push people toward Password1! patterns and are out of step with
  // current guidance (NIST 800-63B): length + a breach-aware limit beats
  // complexity theatre. 8 is the floor; the max stops bcrypt DoS via
  // megabyte "passwords".
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200, "That's too long — 200 characters is plenty."),
});

export type SignUpInput = z.infer<typeof SignUpSchema>;
