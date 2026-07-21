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

// The session cookie is scoped to the PARENT domain so it's valid on both the
// public site and the admin subdomain (admin.* is where the moderation queue
// lives; the cookie set on the apex must be sent there too). A leading dot means
// "this domain and all subdomains".
//   dev:  .localhost   → localhost + admin.localhost
//   prod: .australiaisbeautiful.com → apex + admin subdomain
// Configurable via AUTH_COOKIE_DOMAIN; falls back sensibly by NODE_ENV.
const cookieDomain =
  process.env.AUTH_COOKIE_DOMAIN ??
  (process.env.NODE_ENV === "production"
    ? ".australiaisbeautiful.com"
    : ".localhost");

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin", // our custom sign-in page
  },
  // Share the session cookie across subdomains (public + admin).
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
        domain: cookieDomain,
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
