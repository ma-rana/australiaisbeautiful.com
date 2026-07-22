// lib/media/storage.ts — media storage driver (interface + local-disk impl).
//
// One interface, swappable impls (MEDIA.md). Phase 1 is local disk on the VPS;
// S3/R2 later without touching calling code. If a swap ever requires changing a
// caller, the interface leaked.
//
// Keys are server-generated, opaque, and NEVER built from user strings
// (path-traversal defence, SECURITY.md §4). Format:
//   moments/<yyyy>/<mm>/<momentCuid>/<variant>.webp

import { promises as fs } from "node:fs";
import path from "node:path";

export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// Build a safe storage key. All components are server-controlled: date + the
// DB-issued cuid + a fixed variant name. No user input touches the path.
export function mediaKey(momentCuid: string, variant: "display" | "thumb"): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `moments/${yyyy}/${mm}/${momentCuid}/${variant}.webp`;
}

// Storage key for a curator-uploaded LOCATION COVER. Kept in its own prefix so
// covers are distinguishable from community moment media at the storage layer
// (useful for audits, and for the serving route's prefix allowlist).
export function coverKey(
  locationSlug: string,
  variant: "display" | "thumb",
): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  // The slug is server-generated (slugify strips anything path-ish), and a
  // timestamp keeps re-uploads from colliding with a cached old file.
  const safe = locationSlug.replace(/[^a-z0-9-]/g, "").slice(0, 80);
  return `covers/${safe}/${stamp}-${variant}.webp`;
}

// --- Local disk driver -------------------------------------------------------
// Root is MEDIA_LOCAL_PATH, OUTSIDE the Next public dir and the repo (MEDIA.md).
// A guard rejects any key that would escape the root (defence in depth — keys
// are already server-generated, but never assume).

class LocalDiskStorage implements MediaStorage {
  constructor(private root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    // Escape guard: the resolved path must stay inside root.
    const rootResolved = path.resolve(this.root);
    if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
      throw new Error("Refusing to access a path outside the media root.");
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // Already gone is fine — deletion is idempotent (the sweep reconciles).
    }
  }
}

// Driver selection. Phase 1: local only. S3/R2 slots in here later.
let storage: MediaStorage | null = null;

export function getStorage(): MediaStorage {
  if (storage) return storage;

  const driver = process.env.MEDIA_STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    const root = process.env.MEDIA_LOCAL_PATH;
    if (!root) {
      throw new Error("MEDIA_LOCAL_PATH is not set (required for local driver).");
    }
    storage = new LocalDiskStorage(root);
    return storage;
  }

  // } else if (driver === "s3") { ... R2/S3 impl later ... }
  throw new Error(`Unknown MEDIA_STORAGE_DRIVER: ${driver}`);
}
