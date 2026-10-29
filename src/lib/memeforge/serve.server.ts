import { isServable } from "./core";
import { db, rateLimit, sha256 } from "./db.server";

export type ServedAd = {
  id: string;
  headline: string;
  body: string;
  cta: string;
  destinationUrl: string | null;
  image: string | null;
  mint: string;
  symbol: string | null;
  name: string | null;
  onchainVerified: boolean;
  channels: string[];
};

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, ...extra },
  });
}

export const PARTNER_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-dynamiq-key",
};

function clientBucket(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return sha256(fwd).slice(0, 16);
}

type Row = {
  id: string;
  headline: string;
  body: string;
  cta: string;
  destination_url: string | null;
  image_data: string | null;
  mint: string;
  symbol: string | null;
  token_name: string | null;
  onchain_verified_at: unknown;
  channels: string;
  status: string;
  review_status: string | null;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
  targeting: string;
};

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function eligibleAds(slot: string | null): Promise<ServedAd[]> {
  const sql = await db();
  const rows = await sql<Row>`
    select c.id, c.headline, c.body, c.cta, c.destination_url, cr.image_data, c.mint,
           t.symbol, t.name as token_name, c.onchain_verified_at, c.channels, c.status,
           cr.review_status, c.starts_at, c.ends_at, c.targeting
    from campaigns c
    join creatives cr on cr.id = c.creative_id
    left join token_lookups t on t.mint = c.mint
    where c.status = 'live' and cr.review_status = 'approved'`;
  const now = new Date();
  const ads: ServedAd[] = [];
  for (const row of rows) {
    if (
      !isServable({
        status: row.status,
        reviewStatus: row.review_status,
        startsAt: toDate(row.starts_at),
        endsAt: toDate(row.ends_at),
        now,
      })
    ) {
      continue;
    }
    let slots: string[] = [];
    try {
      const targeting = JSON.parse(row.targeting) as { slots?: unknown };
      if (Array.isArray(targeting.slots)) {
        slots = targeting.slots.filter((s): s is string => typeof s === "string");
      }
    } catch {
      slots = [];
    }
    if (slot && slots.length > 0 && !slots.includes(slot)) continue;
    ads.push({
      id: row.id,
      headline: row.headline,
      body: row.body,
      cta: row.cta,
      destinationUrl: row.destination_url,
      image: row.image_data,
      mint: row.mint,
      symbol: row.symbol,
      name: row.token_name,
      onchainVerified: Boolean(row.onchain_verified_at),
      channels: row.channels.split(",").filter(Boolean),
    });
    if (ads.length >= 6) break;
  }
  return ads;
}

export async function recordEvent(
  campaignId: string,
  partnerId: string | null,
  surface: "property" | "partner",
  eventType: "impression" | "click",
  slot: string | null,
) {
  const sql = await db();
  await sql`
    insert into analytics_events (campaign_id, partner_id, surface, event_type, slot)
    values (${campaignId}, ${partnerId}, ${surface}, ${eventType}, ${slot})`;
}

export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export async function handleProperty(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return json(
      { error: "DYNamiQ property ads are same-origin only. Partners must use an API key." },
      403,
    );
  }
  const url = new URL(request.url);
  const slot = url.searchParams.get("slot");
  const record = url.searchParams.get("record") === "1";
  const sql = await db();
  const allowed = await rateLimit(sql, `prop:${clientBucket(request)}`, 40, 60_000);
  if (!allowed) return json({ error: "Rate limit" }, 429);
  const ads = await eligibleAds(slot);
  if (record) {
    for (const ad of ads) await recordEvent(ad.id, null, "property", "impression", slot);
  }
  return json({
    surface: "dynamiq-property",
    recorded: record,
    disclaimer:
      "Served only on this DYNamiQ property. These ads are not placed on every Solana marketplace.",
    dataClass: "Off-chain registry. onchainVerified is a separate devnet memo check.",
    ads,
  });
}

export async function handlePartnerAds(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = request.headers.get("x-dynamiq-key") || url.searchParams.get("key") || "";
  const slot = url.searchParams.get("slot");
  const record = url.searchParams.get("record") === "1";
  if (!key.startsWith("dq_")) {
    return json({ error: "Missing partner API key" }, 401, PARTNER_CORS);
  }
  const sql = await db();
  const hash = sha256(key);
  const partners = await sql<{ id: string; status: string }>`
    select id, status from partners where api_key_hash = ${hash}`;
  const partner = partners[0];
  if (!partner || partner.status !== "active") {
    return json({ error: "Partner key is unknown or not active" }, 403, PARTNER_CORS);
  }
  const allowed = await rateLimit(sql, `ad:${hash.slice(0, 16)}`, 60, 60_000);
  if (!allowed) return json({ error: "Rate limit" }, 429, PARTNER_CORS);
  const ads = await eligibleAds(slot);
  if (record) {
    for (const ad of ads) await recordEvent(ad.id, partner.id, "partner", "impression", slot);
  }
  return json(
    {
      surface: "partner",
      recorded: record,
      disclaimer:
        "Eligible DYNamiQ campaigns for this approved partner only. Not a network-wide Solana placement.",
      dataClass: "Off-chain registry. onchainVerified is a separate devnet memo check.",
      ads,
    },
    200,
    PARTNER_CORS,
  );
}

export async function handleClick(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("campaign") || "";
  const slot = url.searchParams.get("slot");
  const key = url.searchParams.get("key") || "";
  const surface = url.searchParams.get("surface") === "property" ? "property" : "partner";
  const sql = await db();
  let partnerId: string | null = null;
  if (surface === "property") {
    if (!sameOrigin(request)) return json({ error: "Same-origin only" }, 403);
  } else {
    if (!key.startsWith("dq_")) return json({ error: "Missing partner API key" }, 401);
    const partners = await sql<{ id: string; status: string }>`
      select id, status from partners where api_key_hash = ${sha256(key)}`;
    if (!partners[0] || partners[0].status !== "active") return json({ error: "Partner not active" }, 403);
    partnerId = partners[0].id;
  }
  const ads = await eligibleAds(slot);
  const ad = ads.find((item) => item.id === id);
  if (!ad) return json({ error: "Campaign is not eligible to serve" }, 404);
  const allowed = await rateLimit(sql, `click:${clientBucket(request)}:${id}`, 30, 60_000);
  if (!allowed) return json({ error: "Rate limit" }, 429);
  await recordEvent(id, partnerId, surface, "click", slot);
  if (!ad.destinationUrl) {
    return json({
      ok: true,
      recorded: true,
      note: "Click recorded. This campaign has no https destination.",
    });
  }
  return Response.redirect(ad.destinationUrl, 302);
}
