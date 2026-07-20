// lib/auth.ts — auth contract (STUB — implement fully in Phase 1)
//
// This project has FOUR tiers, unlike the single-admin template it came from:
//   EXPLORER  — any signed-up contributor (uploads moments, rates, chats)
//   CURATOR   — approves LOCATIONS only. Never sees the moment queue.
//   MODERATOR — the moment + report queues. Also has CURATOR's powers.
//   ADMIN     — full control
//
// Why CURATOR exists (see docs/MODERATION.md):
// Approving a location is editorial judgement about what belongs on the map.
// Approving a photo means looking at whatever a stranger uploaded, and it
// carries a trust boundary the location queue doesn't have. Different jobs,
// different risk, different people — so a curator can shape the map without
// ever being handed the moment queue. Not splitting these means every regional
// curator you recruit gets access to every unreviewed photo on the platform.
//
// The tiers are ORDERED, and that ordering lives in ROLE_RANK below. Do not
// re-derive it with ad-hoc `role === "X" || role === "Y"` checks at call sites —
// that's how a new role silently gains or loses access.
//
// CRITICAL (see docs/SECURITY.md): these are the REAL authorization checks.
// They must run inside every protected action / route — NOT in middleware.
// middleware.ts only routes the admin subdomain; it is NOT a security boundary.
//
// Phase 1: implement with the chosen auth library (see docs/DECISIONS.md).

export type Role = "EXPLORER" | "CURATOR" | "MODERATOR" | "ADMIN";

// The single source of truth for tier ordering.
const ROLE_RANK: Record<Role, number> = {
  EXPLORER: 0,
  CURATOR: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

// Returns the session user or null. Never throws — for optional-auth pages
// (e.g. a location page renders for signed-out visitors too).
export async function getSessionUser(): Promise<SessionUser | null> {
  // --- TEMPORARY DEV ACTOR (delete when real auth lands) ---------------------
  // Lets moderation be built + used before auth exists. Engineered so it CANNOT
  // run in production: it hard-throws if NODE_ENV is production, and it's off
  // unless DEV_ADMIN=1 is explicitly set. This is a scaffold, not a login.
  const devActor = maybeDevActor();
  if (devActor) return devActor;
  // ---------------------------------------------------------------------------

  // TODO Phase 1: read + verify the session cookie, load the user.
  //   const session = await auth();
  //   if (!session?.user) return null;
  //   return { id, email, role };
  return null; // safe default
}

// TEMPORARY. Returns a hardcoded ADMIN dev actor ONLY when:
//   - NODE_ENV is NOT production (hard-throws if it somehow is), AND
//   - DEV_ADMIN=1 is set in the environment (explicit opt-in).
// Delete this entire function the moment real auth exists. If you ever see the
// warning below in a real deployment, something is very wrong — stop and fix it.
function maybeDevActor(): SessionUser | null {
  if (process.env.DEV_ADMIN !== "1") return null;

  if (process.env.NODE_ENV === "production") {
    // Refuse, loudly. A dev backdoor in production is a critical failure.
    throw new Error(
      "DEV_ADMIN is set in production. This is a security backdoor and must " +
        "never run in prod. Unset DEV_ADMIN and implement real auth.",
    );
  }

  console.warn(
    "\n\x1b[33m[DEV_ADMIN] Using a fake ADMIN actor — no real authentication. " +
      "For local development only.\x1b[0m\n",
  );

  return {
    id: "dev-admin",
    email: "dev@localhost",
    role: "ADMIN",
  };
}

// Any authenticated explorer. Use for: uploading a moment, rating, chatting.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// The one place tier comparison happens.
async function requireRank(min: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[min]) throw new ForbiddenError();
  return user;
}

// CURATOR+. Use for: approving/rejecting LOCATIONS, editing location details.
export async function requireCurator(): Promise<SessionUser> {
  return requireRank("CURATOR");
}

// MODERATOR+. Use for: the moment queue, chat moderation, resolving reports.
// NOT for locations — a curator can do those, so use requireCurator there or
// you've locked out the people hired to do exactly that job.
export async function requireModerator(): Promise<SessionUser> {
  return requireRank("MODERATOR");
}

// ADMIN only. Use for: partners, user roles, verification grants, config,
// escalation resolution.
// ROLE_GRANT is the highest-risk action on the platform — it is how a
// compromised moderator account becomes a compromised admin account. Audit it.
export async function requireAdmin(): Promise<SessionUser> {
  return requireRank("ADMIN");
}

// Ownership check for the private Explorer Dashboard. A user may manage ONLY
// their own contributions. There is no public profile, so there is no case
// where one user reads another user's contribution list — if you find yourself
// needing that, stop: it contradicts the product (see CLAUDE.md).
//
// NOTE: this is deliberately NOT rank-based. A moderator is not an owner.
// Staff act on content through the moderation actions (which are audited),
// never through the owner path (which is not).
export async function requireOwner(ownerId: string | null): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user; // admins can act on any content
  if (ownerId === null || ownerId !== user.id) throw new ForbiddenError();
  return user;
}
