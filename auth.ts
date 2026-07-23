// auth.ts — Auth.js v5 (next-auth@5) configuration.
//
// ⚠️ Auth.js v5 is newer than the assistant's training. This is a best-effort
// v5 setup; verify the exact API against https://authjs.dev if anything errors.
// Known v5 shape: NextAuth(config) returns { handlers, auth, signIn, signOut }.
//
// Design decisions here:
// - Credentials provider (email + password) for phase 1. Google added later.
// - Session strategy MUST be "jwt": the Credentials provider does not support
//   database sessions. The user's id + role ride in the token.
// - We do NOT use the PrismaAdapter with credentials+jwt (the adapter is for
//   OAuth/database sessions). We verify the password ourselves in authorize()
//   and put id/role into the JWT. When we add Google later, the adapter comes in
//   for that provider.
// - Password check uses bcryptjs (pure JS — no native build issues on Windows).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyTotp, hashBackupCode } from "@/lib/twofactor";

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
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const door = (credentials?.door as string | undefined) ?? "public";
        const totp = (credentials?.totp as string | undefined) ?? "";
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.status !== "ACTIVE") return null; // suspended/deleted can't log in

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

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
            if (!backup) return null;
            await db.backupCode.update({
              where: { id: backup.id },
              data: { usedAt: new Date() },
            });
          }
        }

        // What we return becomes the basis of the JWT (see callbacks).
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
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
    // Put id + role into the token on sign-in, so getSessionUser can read them
    // without a DB hit on every request.
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    // Expose id + role on the session object.
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
