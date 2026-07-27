// auth.ts — Auth.js v5 (next-auth@5) configuration.
//
// ⚠️ Auth.js v5 is newer than the assistant's training. This is a best-effort
// v5 setup; verify the exact API against https://authjs.dev if anything errors.
// Known v5 shape: NextAuth(config) returns { handlers, auth, signIn, signOut }.
//
// Design decisions here:
// - Credentials provider (email + password) + Google OAuth for the PUBLIC side.
// - Session strategy MUST be "jwt": the Credentials provider does not support
//   database sessions. The user's id + role ride in the token. Google works
//   fine under JWT too — we do NOT use the PrismaAdapter; instead the signIn
//   callback upserts a real User row on first Google login, so a Google user is
//   an ordinary EXPLORER row (moments, rate limits, sessionVersion all apply)
//   and there's still ONE code path minting sessions.
// - Password check uses bcryptjs (pure JS — no native build issues on Windows).
//
// GOOGLE = PUBLIC-SIDE ONLY (see the signIn callback for enforcement):
//   - A staff member MAY sign in with Google on the public site; they get an
//     ordinary public session and can browse/contribute. It does NOT grant
//     admin access — admin pages require a session minted through the admin
//     door (door === "admin", i.e. password + TOTP), which Google never is.
//   - First Google login for a new email creates an EXPLORER. A verified Google
//     email matching an existing account LINKS (both methods work).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyTotp, hashBackupCode } from "@/lib/twofactor";
import { check, recordFailure, reset, LIMITS } from "@/lib/rate-limit";

// COOKIE SCOPE: deliberately NOT shared across subdomains.
//
// No `domain` is set, so the browser scopes the session cookie to the exact host
// that issued it. That gives genuine isolation:
//   - a session created on australiaisbeautiful.com is NOT sent to admin.*
//   - a session created on admin.australiaisbeautiful.com is NOT sent to the
//     public site (the admin credential never rides along on public requests)
// Staff therefore sign in separately on the admin host — which is the point
// (SECURITY.md: the admin surface is its own door, with its own session).
//
// Local dev: http://admin.localhost:3000 gets its own cookie, same as prod.

export const { handlers, auth, signIn, signOut } = NextAuth({
  // SESSION LIFETIME. Staff sessions on an admin surface shouldn't last weeks.
  // Auth.js's default is 30 days, which is fine for a reading site and far too
  // loose for a portal that can remove content and grant roles.
  //
  // 8 hours absolute, refreshed at most hourly: roughly a working day, so a
  // forgotten browser stops being authenticated overnight rather than next
  // month. `updateAge` means the token is only rewritten when it's older than an
  // hour, so this isn't a sliding window that never expires.
  //
  // NOTE: this applies to BOTH doors. A public contributor is logged out daily
  // too, which is a small cost for one clear rule rather than two session
  // policies to keep straight.
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60, // refresh at most once an hour
  },
  pages: {
    signIn: "/signin", // public sign-in; the admin host has its own at /signin
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // NO `domain` — host-scoped by design (see the note above). Each host
        // (public / admin) gets its own isolated session cookie.
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Which door this sign-in came through: "public" or "admin".
        // Sent by the sign-in pages; enforced below.
        door: { label: "Door", type: "text" },
        // TOTP code or backup code, when the account has 2FA on.
        totp: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        // Lowercased to match signup's normalization (lib/schemas/auth.ts) —
        // emails are compared case-insensitively everywhere or nowhere.
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        const door = (credentials?.door as string | undefined) ?? "public";
        const totp = (credentials?.totp as string | undefined) ?? "";
        if (!email || !password) return null;

        // RATE LIMIT (SECURITY.md §11): only FAILURES count, per email — the
        // thing being protected is the account, and an attacker rotates IPs
        // anyway. While the key is over the limit, even a CORRECT password is
        // refused: that's what makes it a lockout rather than a speed bump.
        // Auth.js collapses this into its one generic error, which is fine —
        // "didn't match" and "locked out" should look identical to a guesser.
        const rlKey = `login:${email.toLowerCase()}`;
        if (!check(rlKey, LIMITS.LOGIN_EMAIL).ok) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          // Unknown emails burn budget too — otherwise enumeration is free.
          recordFailure(rlKey, LIMITS.LOGIN_EMAIL);
          return null;
        }
        if (user.status !== "ACTIVE") return null; // suspended/deleted can't log in

        // GOOGLE-ONLY ACCOUNTS have an empty stored password (see the signIn
        // callback). bcrypt.compare(anything, "") is always false, so this can't
        // be bypassed — but we reject explicitly and early rather than trust that
        // incidental behaviour, and so the failure budget still gets charged.
        // A person with a Google-only account who tries the password form should
        // use "Continue with Google"; the generic failure nudges them there.
        if (!user.password) {
          recordFailure(rlKey, LIMITS.LOGIN_EMAIL);
          return null;
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          recordFailure(rlKey, LIMITS.LOGIN_EMAIL);
          return null;
        }

        // DOOR SEPARATION (hard): staff credentials work ONLY on the admin
        // subdomain; explorer credentials work ONLY on the public site.
        //
        // Why: a stolen/phished staff password is useless against the public
        // login surface, and staff are never habituated to typing operational
        // credentials into the public form. Staff accounts are OPERATIONAL
        // accounts — a staff member who also wants to contribute photos keeps a
        // separate explorer account, deliberately.
        const isStaff =
          user.role === "CURATOR" ||
          user.role === "MODERATOR" ||
          user.role === "ADMIN";

        if (door === "admin" && !isStaff) return null; // explorer at the staff door
        if (door === "public" && isStaff) return null; // staff at the public door

        // SECOND FACTOR. Password alone is not enough for an account with 2FA on.
        // Accepts either a current TOTP code or a single-use backup code.
        if (user.totpEnabled && user.totpSecret) {
          const presented = totp.trim();
          if (!presented) {
            // Signals to the sign-in page that a code is needed. Auth.js turns a
            // null return into a generic failure, so the page asks for a code
            // whenever the password was accepted but no code was supplied — see
            // the needsCode probe in the sign-in flow.
            return null;
          }

          const totpOk = await verifyTotp(user.totpSecret, presented);

          if (!totpOk) {
            // Try it as a backup code. Single use: consumed on success.
            const hash = hashBackupCode(presented);
            const backup = await db.backupCode.findFirst({
              where: { userId: user.id, codeHash: hash, usedAt: null },
              select: { id: true },
            });
            if (!backup) {
              // A wrong second factor is a failed attempt like any other —
              // otherwise a stolen password gets unlimited free code guesses.
              recordFailure(rlKey, LIMITS.LOGIN_EMAIL);
              return null;
            }
            await db.backupCode.update({
              where: { id: backup.id },
              data: { usedAt: new Date() },
            });
          }
        }

        // Success: clear the failure budget so a legitimate user's earlier
        // typos don't linger against them.
        reset(rlKey);

        // What we return becomes the basis of the JWT (see callbacks).
        // sessionVersion is stamped in so a later suspend/demote/password
        // change can invalidate this exact token (lib/auth getSessionUser).
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
          // Which door this session was minted through. The admin guards
          // (lib/auth require*) require door === "admin", so a public/Google
          // session can never satisfy an admin page even if its cookie somehow
          // reached the admin host (a dev cookie-domain quirk). Belt to the
          // host-scoping braces.
          door,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // We only want the identity, nothing else. Default scopes (openid email
      // profile) are enough; we read email + email_verified in signIn().
      //
      // allowDangerousEmailAccountLinking is NOT set (defaults false). It
      // wouldn't do the right thing here anyway — our linking rule (verified
      // email, EXPLORER only, staff refused) lives in the signIn callback where
      // we can enforce all three conditions, not in a blanket provider flag.
    }),
  ],
  callbacks: {
    // GATE + LINK for OAuth (Google). Credentials sign-ins already did all their
    // checking in authorize(), so they pass straight through. This callback is
    // where Google's identity meets our rules:
    //
    //   1. email_verified — Google must assert the person controls the inbox.
    //      Without it, linking would let anyone who can make a Google profile
    //      claiming someone's address walk into that account. Google sends this
    //      reliably; if it's ever false, we refuse.
    //   2. LINK or CREATE — a verified Google email that matches an existing
    //      account logs into that same account; a new email creates a fresh
    //      EXPLORER. Either way the result is a real User row, so the rest of
    //      the app (moments, limits, sessionVersion) is unchanged.
    //
    // ON STAFF + GOOGLE (deliberate, see SECURITY/door separation): Google is a
    // PUBLIC-side convenience. A staff member MAY sign in with Google on the
    // public site — they simply get an ordinary public session and can browse
    // and contribute like anyone else. This does NOT grant admin access: the
    // session cookie is host-scoped (no `domain` set), so a session minted on
    // australiaisbeautiful.com is never sent to admin.australiaisbeautiful.com.
    // The admin surface therefore never sees this session at all — staff must
    // still sign in at the admin door with password + TOTP (door: "admin",
    // enforced in authorize()). The cookie scope IS the door; Google can't
    // cross it. So we do NOT refuse staff here — that only broke the public
    // login without adding any protection the cookie scope wasn't already
    // giving us.
    //
    // We mutate `user.id` to the DB row's id so the jwt callback stamps the
    // right subject — Auth.js otherwise uses Google's opaque profile id, which
    // is not our primary key.
    async signIn({ user, account, profile }) {
      // Not Google → credentials, already fully vetted in authorize().
      if (account?.provider !== "google") return true;

      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      // (1) Google must vouch for the address. `profile.email_verified` is the
      // OIDC claim; be strict — only an explicit true passes.
      const verified = (profile as { email_verified?: boolean } | null)
        ?.email_verified;
      if (verified !== true) return false;

      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });

      if (existing) {
        // Suspended/deleted can't sign in, same as the password path. (Role is
        // NOT checked — staff get a normal public session here; see the note
        // above on why that's safe.)
        if (existing.status !== "ACTIVE") return false;

        // LINK: point the session at the existing account row.
        user.id = existing.id;
        return true;
      }

      // CREATE: brand-new EXPLORER. No password (Google is the credential).
      // Mirrors signup/actions.ts: only ever mints EXPLORER, collects no
      // identity beyond the email.
      const created = await db.user.create({
        data: { email, password: "" }, // role/status default EXPLORER/ACTIVE
        select: { id: true },
      });
      user.id = created.id;
      return true;
    },

    // Keep redirects on the host the request came from. Auth.js validates
    // callbackUrl against its base URL and will otherwise bounce a signing-out
    // admin (on admin.*) back to the public site. We allow any URL whose origin
    // matches the request's own origin, plus the two known hosts.
    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl);
        const allowedHosts = new Set([
          new URL(baseUrl).host,
          "admin.australiaisbeautiful.com",
          "australiaisbeautiful.com",
          "admin.localhost:3000",
          "localhost:3000",
        ]);
        if (allowedHosts.has(target.host)) return target.toString();
      } catch {
        // fall through to baseUrl
      }
      return baseUrl;
    },
    // Put id + role + sessionVersion into the token on sign-in, so
    // getSessionUser can identify the user and validate the token's freshness.
    // (getSessionUser re-reads role/status from the DB; the token's copies are
    // just the starting point, and `sv` is the invalidation check.)
    //
    // Two sign-in shapes reach here:
    //   - Credentials: `user` is exactly what authorize() returned (id, role,
    //     sessionVersion present).
    //   - Google: `user.id` was set to the DB row id in signIn(), but role and
    //     sessionVersion aren't on it — so we read them from the row. One extra
    //     query, only on the login request (when `user` is present), never on
    //     subsequent requests.
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        const maybeRole = (user as { role?: string }).role;
        const maybeSv = (user as { sessionVersion?: number }).sessionVersion;
        if (maybeRole !== undefined && maybeSv !== undefined) {
          token.role = maybeRole;
          token.sv = maybeSv;
        } else {
          // Google path: fill role + sessionVersion from the DB row.
          const row = await db.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, sessionVersion: true },
          });
          token.role = row?.role ?? "EXPLORER";
          token.sv = row?.sessionVersion ?? 0;
        }
        // The door this session came through. Credentials pass their own
        // ("public" or "admin"); Google is a public-only provider, so any
        // session without an explicit door is "public" by definition.
        token.door = (user as { door?: string }).door ?? "public";
      }
      return token;
    },
    // Expose id + role + sv + door on the session object.
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { sv?: number }).sv = token.sv as number;
        (session.user as { door?: string }).door = token.door as string;
      }
      return session;
    },
  },
});
