// app/api/auth/[...nextauth]/route.ts — Auth.js v5 route handler.
// Re-exports the GET/POST handlers from the root auth config. This is the
// standard v5 pattern; verify against authjs.dev if it errors.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
