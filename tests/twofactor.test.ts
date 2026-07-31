// tests/twofactor.test.ts — TOTP + backup codes (SECURITY.md §13d).
//
// 2FA is what gives the separate admin door teeth. The verify path is the one
// that decides whether a code opens a staff account, so its rejection cases
// (malformed input, wrong length, non-digits) matter as much as the happy
// path. The backup-code helpers are tested for the properties the security
// rests on: unpredictability, single-form hashing, and human legibility.
//
// The real TOTP crypto (otplib) is exercised end-to-end here — generate a
// secret, derive the current code with the same library, and confirm verify
// accepts it. That proves our wrapper wires the library correctly rather than
// re-testing otplib itself.

import { describe, it, expect } from "vitest";
import { generate as generateTotp } from "otplib";
import {
  generateTotpSecret,
  totpUri,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  normaliseBackupCode,
} from "@/lib/twofactor";

describe("generateTotpSecret", () => {
  it("produces a non-empty base32 secret", () => {
    const s = generateTotpSecret();
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("produces a different secret each time", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe("totpUri", () => {
  it("is a scannable otpauth URI carrying issuer, label, and secret", () => {
    const secret = generateTotpSecret();
    const uri = totpUri(secret, "staff@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    // The label (email) is url-encoded in the URI: '@' becomes '%40'.
    expect(uri).toContain("staff%40example.com");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("Australia%20Is%20Beautiful"); // issuer, url-encoded
  });
});

describe("verifyTotp", () => {
  it("accepts the current code derived from the same secret", async () => {
    const secret = generateTotpSecret();
    const code = await generateTotp({ secret });
    expect(await verifyTotp(secret, code)).toBe(true);
  });

  it("tolerates whitespace in the typed code", async () => {
    const secret = generateTotpSecret();
    const code = await generateTotp({ secret });
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(await verifyTotp(secret, spaced)).toBe(true);
  });

  it("rejects a wrong 6-digit code", async () => {
    const secret = generateTotpSecret();
    const right = await generateTotp({ secret });
    // Flip it to a definitely-different 6-digit string.
    const wrong = right === "000000" ? "111111" : "000000";
    expect(await verifyTotp(secret, wrong)).toBe(false);
  });

  it("rejects malformed input without throwing (too short, non-digit, empty)", async () => {
    const secret = generateTotpSecret();
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34"]) {
      expect(await verifyTotp(secret, bad)).toBe(false);
    }
  });
});

describe("generateBackupCodes", () => {
  it("generates ten codes", () => {
    expect(generateBackupCodes()).toHaveLength(10);
  });

  it("formats each as two 5-char groups from the legible alphabet", () => {
    // No ambiguous characters (0/O, 1/I/L) — they get written on paper.
    const legible = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
    for (const code of generateBackupCodes()) {
      expect(code).toMatch(legible);
    }
  });

  it("produces distinct codes within a batch", () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("produces different batches across calls (randomness sanity)", () => {
    const a = new Set(generateBackupCodes());
    const b = generateBackupCodes();
    // Overlap between two independent 10-code batches should be nil.
    expect(b.some((c) => a.has(c))).toBe(false);
  });
});

describe("hashBackupCode / normaliseBackupCode", () => {
  it("hashes to hex SHA-256 (64 chars)", () => {
    expect(hashBackupCode("ABCDE-FGHJK")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across the presentation variations a human might type", () => {
    // Same code with/without dash, spacing, and case must hash identically —
    // otherwise a correct backup code gets rejected on a formatting nicety.
    const canonical = hashBackupCode("ABCDE-FGHJK");
    expect(hashBackupCode("abcde-fghjk")).toBe(canonical);
    expect(hashBackupCode("ABCDEFGHJK")).toBe(canonical);
    expect(hashBackupCode(" ABCDE FGHJK ")).toBe(canonical);
  });

  it("different codes hash differently", () => {
    expect(hashBackupCode("ABCDE-FGHJK")).not.toBe(hashBackupCode("ABCDE-FGHJM"));
  });

  it("normaliseBackupCode strips separators and upper-cases", () => {
    expect(normaliseBackupCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
  });
});
