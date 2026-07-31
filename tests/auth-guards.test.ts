// tests/auth-guards.test.ts — the authorization guards (PLAN.md Phase 1 exit
// criterion: "each require* allows/denies correctly. Run them.").
//
// These are THE security-critical checks. A bug here is not a cosmetic bug —
// it's a demoted admin keeping power, or a public/Google session reaching the
// moment queue. So the suite is deliberately exhaustive across the two axes
// that matter: RANK (is the role high enough?) and DOOR (was the session
// minted through the admin door?).
//
// HOW THE SEAM WORKS: getSessionUser does two lazy imports — `@/auth` for the
// raw session (token) and `@/lib/db` for the LIVE row it re-reads (the row is
// the authority, never the token — see lib/auth.ts). We mock both. That lets a
// test say "the token claims ADMIN but the live row is EXPLORER" and assert the
// row wins — the exact suspend/demote-mid-session case the design exists for.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock the two seams getSessionUser reaches through -------------------

// The raw Auth.js session (the TOKEN). Shape mirrors what the jwt callback
// stamps: id, email, role, sv (sessionVersion), door.
const authMock = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => authMock(),
}));

// The LIVE user row. getSessionUser trusts THIS for role/status/version.
const findUniqueMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: () => findUniqueMock() } },
}));

import {
  getSessionUser,
  requireUser,
  requireCurator,
  requireModerator,
  requireAdmin,
  requireOwner,
  UnauthorizedError,
  ForbiddenError,
  type Role,
} from "@/lib/auth";

// A signed-in session is the pair (token, liveRow). These helpers build a
// consistent pair so a test only states what it's varying.
function setSession(opts: {
  id?: string;
  role: Role;
  door: "admin" | "public";
  status?: "ACTIVE" | "SUSPENDED";
  sv?: number;
  rowSv?: number;
  rowRole?: Role; // when the live row's role differs from the token's
  rowMissing?: boolean;
}) {
  const id = opts.id ?? "user_1";
  const sv = opts.sv ?? 1;
  authMock.mockResolvedValue({
    user: { id, email: "x@example.com", role: opts.role, sv, door: opts.door },
  });
  if (opts.rowMissing) {
    findUniqueMock.mockResolvedValue(null);
    return;
  }
  findUniqueMock.mockResolvedValue({
    id,
    email: "x@example.com",
    role: opts.rowRole ?? opts.role,
    status: opts.status ?? "ACTIVE",
    sessionVersion: opts.rowSv ?? sv,
  });
}

function setSignedOut() {
  authMock.mockResolvedValue(null);
  findUniqueMock.mockResolvedValue(null);
}

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
});

describe("getSessionUser — the live row is the authority, not the token", () => {
  it("returns null when signed out", async () => {
    setSignedOut();
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when the row is gone (deleted mid-session)", async () => {
    setSession({ role: "ADMIN", door: "admin", rowMissing: true });
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when the row is SUSPENDED, whatever the token claims", async () => {
    setSession({ role: "ADMIN", door: "admin", status: "SUSPENDED" });
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when sessionVersion no longer matches (logged out everywhere)", async () => {
    setSession({ role: "ADMIN", door: "admin", sv: 1, rowSv: 2 });
    expect(await getSessionUser()).toBeNull();
  });

  it("takes ROLE from the live row, not the token (demotion takes hold immediately)", async () => {
    // Token still says ADMIN; the row has been demoted to EXPLORER.
    setSession({ role: "ADMIN", door: "admin", rowRole: "EXPLORER" });
    const u = await getSessionUser();
    expect(u?.role).toBe("EXPLORER");
  });

  it("defaults door to 'public' when the token lacks the field", async () => {
    authMock.mockResolvedValue({
      user: { id: "user_1", email: "x@example.com", role: "ADMIN", sv: 1 },
    });
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "x@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      sessionVersion: 1,
    });
    const u = await getSessionUser();
    expect(u?.door).toBe("public");
  });
});

describe("requireUser — any active session", () => {
  it("throws Unauthorized when signed out", async () => {
    setSignedOut();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("allows a plain explorer through a public door", async () => {
    setSession({ role: "EXPLORER", door: "public" });
    await expect(requireUser()).resolves.toMatchObject({ role: "EXPLORER" });
  });
});

describe("staff guards — RANK axis (via the admin door)", () => {
  // The rank ladder: EXPLORER < CURATOR < MODERATOR < ADMIN.
  const ladder: Role[] = ["EXPLORER", "CURATOR", "MODERATOR", "ADMIN"];

  const cases: {
    guard: () => Promise<unknown>;
    name: string;
    min: Role;
  }[] = [
    { guard: requireCurator, name: "requireCurator", min: "CURATOR" },
    { guard: requireModerator, name: "requireModerator", min: "MODERATOR" },
    { guard: requireAdmin, name: "requireAdmin", min: "ADMIN" },
  ];

  for (const { guard, name, min } of cases) {
    const minRank = ladder.indexOf(min);
    for (const role of ladder) {
      const rank = ladder.indexOf(role);
      const shouldAllow = rank >= minRank;
      it(`${name}: ${role} (admin door) → ${shouldAllow ? "allowed" : "forbidden"}`, async () => {
        setSession({ role, door: "admin" });
        if (shouldAllow) {
          await expect(guard()).resolves.toMatchObject({ role });
        } else {
          await expect(guard()).rejects.toBeInstanceOf(ForbiddenError);
        }
      });
    }
  }
});

describe("staff guards — DOOR axis (the door separation)", () => {
  // A staff-RANKED session is NOT enough. It must have come through the admin
  // door. This is the property that makes a stolen public/Google session
  // useless against the admin surface even for a real admin.
  const staffGuards: { guard: () => Promise<unknown>; name: string }[] = [
    { guard: requireCurator, name: "requireCurator" },
    { guard: requireModerator, name: "requireModerator" },
    { guard: requireAdmin, name: "requireAdmin" },
  ];

  for (const { guard, name } of staffGuards) {
    it(`${name}: ADMIN rank through the PUBLIC door → forbidden`, async () => {
      setSession({ role: "ADMIN", door: "public" });
      await expect(guard()).rejects.toBeInstanceOf(ForbiddenError);
    });
  }

  it("requireUser stays door-agnostic: an ADMIN on the public site is fine", async () => {
    // Contributing on the public site with a staff account is exactly what a
    // public session is for — only the STAFF guards demand the admin door.
    setSession({ role: "ADMIN", door: "public" });
    await expect(requireUser()).resolves.toMatchObject({ role: "ADMIN" });
  });
});

describe("requireOwner — ownership, deliberately NOT rank-based", () => {
  it("allows the owner", async () => {
    setSession({ id: "owner_1", role: "EXPLORER", door: "public" });
    await expect(requireOwner("owner_1")).resolves.toMatchObject({ id: "owner_1" });
  });

  it("forbids a different user", async () => {
    setSession({ id: "someone_else", role: "EXPLORER", door: "public" });
    await expect(requireOwner("owner_1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids on a null ownerId (orphaned content is not 'owned' by anyone)", async () => {
    setSession({ id: "user_1", role: "EXPLORER", door: "public" });
    await expect(requireOwner(null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a MODERATOR is NOT an owner of someone else's content", async () => {
    // Staff act through the audited moderation path, never the owner path.
    setSession({ id: "mod_1", role: "MODERATOR", door: "admin" });
    await expect(requireOwner("owner_1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an ADMIN may act on any content (the one rank exception)", async () => {
    setSession({ id: "admin_1", role: "ADMIN", door: "admin" });
    await expect(requireOwner("owner_1")).resolves.toMatchObject({ role: "ADMIN" });
  });
});
