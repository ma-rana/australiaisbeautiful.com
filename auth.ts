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
  session: { strategy: "jwt" },
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
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.status !== "ACTIVE") return null; // suspended/deleted can't log in

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

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
