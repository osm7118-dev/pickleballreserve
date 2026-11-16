import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, issueToken, verifyToken } from "@/server/auth/token";
import { maskPhone, normalizePhone } from "@/lib/phone";

describe("session token", () => {
  const secret = "test-secret-0123456789";
  it("round-trips and rejects tampering", () => {
    const t = issueToken("user-1", secret);
    expect(verifyToken(t, secret)).toBe("user-1");
    expect(verifyToken(t.replace("user-1", "user-2"), secret)).toBeNull();
    expect(verifyToken(t, "other-secret-0123456789")).toBeNull();
    expect(verifyToken(undefined, secret)).toBeNull();
  });
  it("expires", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const t = issueToken("u", secret, issued);
    expect(verifyToken(t, secret, new Date(issued.getTime() + SESSION_TTL_MS + 1))).toBeNull();
  });
});

describe("phone", () => {
  it("masks the middle", () => {
    expect(maskPhone("01012345678")).toBe("010-****-5678");
    expect(maskPhone(null)).toBe("-");
  });
  it("normalizes Korean mobile numbers", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("02-123-4567")).toBeNull();
  });
});
