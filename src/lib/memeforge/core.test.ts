import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMemo,
  decodeBase58,
  decodeMintAccount,
  encodeBase58,
  formatSupply,
  isHttpsUrl,
  isMintAddress,
  isServable,
  parseChannels,
  parseMemo,
} from "./core.ts";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_ACCOUNT =
  "AQAAAJj+huiNm+Lqi8HMpIeLKYjCQPUrhCS/tA7Rot3LXhmbP2r1psV2GgAGAQEAAABicKqKWcWUBbRShshncubNEm6bil06OFNtN/e0FOi2Zw==";

test("base58 round-trips 32 bytes and rejects junk", () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const encoded = encodeBase58(bytes);
  assert.deepEqual(decodeBase58(encoded), bytes);
  assert.equal(decodeBase58("0OIl"), null);
  assert.equal(isMintAddress(USDC), true);
  assert.equal(isMintAddress("not-a-mint"), false);
  assert.equal(encodeBase58(Uint8Array.from([0, 0, 1])), "112");
});

test("decodes an SPL mint account (USDC fixture)", () => {
  const raw = Uint8Array.from(Buffer.from(USDC_ACCOUNT, "base64"));
  assert.equal(raw.length, 82);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const decoded = decodeMintAccount(raw);
  assert.ok(decoded);
  assert.equal(decoded.decimals, raw[44]);
  assert.equal(decoded.decimals, 6);
  assert.equal(decoded.isInitialized, true);
  assert.equal(decoded.supplyRaw, view.getBigUint64(36, true));
  assert.equal(decoded.mintAuthority, encodeBase58(raw.slice(4, 36)));
  assert.equal(formatSupply(1_500_000n, 6), "1.5");
  assert.equal(formatSupply(100n, 0), "100");
  assert.equal(decodeMintAccount(raw.slice(0, 10)), null);
});

test("memo payload is stable and parseable", () => {
  const memo = buildMemo({
    id: "dq_abc",
    mint: USDC,
    creativeHash: "ab".repeat(32),
    owner: USDC,
    state: "live",
  });
  const parsed = parseMemo(memo);
  assert.equal(parsed?.id, "dq_abc");
  assert.equal(parsed?.state, "live");
  assert.equal(parseMemo("nope"), null);
  assert.ok(memo.length < 400);
});

test("ad serving eligibility does not treat chain proof as approval", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(
    isServable({
      status: "live",
      reviewStatus: "approved",
      startsAt: null,
      endsAt: null,
      now,
    }),
    true,
  );
  assert.equal(
    isServable({
      status: "draft",
      reviewStatus: "approved",
      startsAt: null,
      endsAt: null,
      now,
    }),
    false,
  );
  assert.equal(
    isServable({
      status: "live",
      reviewStatus: "pending",
      startsAt: null,
      endsAt: null,
      now,
    }),
    false,
  );
  assert.equal(
    isServable({
      status: "live",
      reviewStatus: "approved",
      startsAt: new Date("2026-10-29T13:00:00Z"),
      endsAt: null,
      now,
    }),
    false,
  );
  assert.equal(
    isServable({
      status: "live",
      reviewStatus: "approved",
      startsAt: null,
      endsAt: new Date("2026-10-29T11:00:00Z"),
      now,
    }),
    false,
  );
});

test("urls and channels", () => {
  assert.equal(isHttpsUrl("https://partner.example/ads"), true);
  assert.equal(isHttpsUrl("http://partner.example"), false);
  assert.equal(isHttpsUrl("javascript:alert(1)"), false);
  assert.deepEqual(parseChannels(["x", "x", "email", "telegram"]), ["x", "telegram"]);
});
