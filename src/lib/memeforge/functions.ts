import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { readMarket, readMint, readSolanaBoosts, verifyDevnetMemo } from "./chain.server";
import {
  CHANNELS,
  buildMemo,
  clip,
  isHttpsUrl,
  isMintAddress,
  newId,
  parseChannels,
  randomKey,
  sha256Hex,
} from "./core";
import { db, ensureProfile, iso, logActivity, rateLimit, sha256 } from "./db.server";

type Fail = { ok: false; error: string };
type Ok<T> = { ok: true } & T;

function fail(error: string): Fail {
  return { ok: false, error };
}

async function gate(userId: string, bucket: string, limit: number, windowMs: number) {
  const sql = await db();
  const profile = await ensureProfile(sql, userId);
  const allowed = await rateLimit(sql, `${bucket}:${userId}`, limit, windowMs);
  return { sql, profile, allowed };
}

export const getSessionProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    const admins = await sql<{ n: number }>`select count(*)::int as n from profiles where role = 'admin'`;
    return {
      role: profile.role,
      wallet: profile.wallet_pubkey,
      displayName: profile.display_name,
      operatorExists: Number(admins[0]?.n ?? 0) > 0,
    };
  });

export const claimOperator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<{ role: string }> | Fail> => {
    const { sql, profile } = await gate(context.userId, "claim", 5, 60 * 60_000);
    if (profile.role === "admin") return { ok: true, role: "admin" };
    const admins = await sql<{ n: number }>`select count(*)::int as n from profiles where role = 'admin'`;
    if (Number(admins[0]?.n ?? 0) > 0) return fail("An operator already exists.");
    await sql`update profiles set role = 'admin' where user_id = ${context.userId}`;
    await logActivity(sql, context.userId, "operator.claim", context.userId, "first operator");
    return { ok: true, role: "admin" };
  });

export const lookupToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { mint: string }) => ({ mint: String(input?.mint ?? "").trim() }))
  .handler(async ({ context, data }): Promise<
    | Ok<{
        token: {
          mint: string;
          onChain: {
            found: boolean;
            decimals: number | null;
            supplyUi: string | null;
            supplyRaw: string | null;
            mintAuthority: string | null;
            freezeAuthority: string | null;
            ownerProgram: string | null;
            source: string;
          };
          market: Awaited<ReturnType<typeof readMarket>>;
          fetchedAt: string;
        };
      }>
    | Fail
  > => {
    if (!isMintAddress(data.mint)) return fail("That is not a Solana mint address.");
    const { sql, allowed } = await gate(context.userId, "lookup", 30, 60 * 60_000);
    if (!allowed) return fail("Lookup limit reached. Try again in an hour.");
    let chain;
    try {
      chain = await readMint(data.mint);
    } catch (error) {
      const message = error instanceof Error ? error.message : "RPC failed";
      if (message === "NOT_MINT") return fail("That account exists, but it is not an SPL token mint.");
      return fail(`Chain read failed: ${message}`);
    }
    if (!chain.found) return fail("No account at that address on mainnet. Nothing was invented.");
    const market = await readMarket(data.mint);
    const fetchedAt = new Date().toISOString();
    await sql`
      insert into token_lookups (
        mint, name, symbol, decimals, supply_raw, supply_ui, mint_authority, freeze_authority,
        owner_program, price_usd, market_cap_usd, liquidity_usd, volume_24h_usd, market_pair_url,
        market_source, chain_source, fetched_at, fetched_by
      ) values (
        ${data.mint}, ${market.name}, ${market.symbol}, ${chain.decimals}, ${chain.supplyRaw},
        ${chain.supplyUi}, ${chain.mintAuthority}, ${chain.freezeAuthority}, ${chain.ownerProgram},
        ${market.priceUsd}, ${market.marketCapUsd}, ${market.liquidityUsd}, ${market.volume24hUsd},
        ${market.pairUrl}, ${market.available ? market.source : null}, ${chain.source}, now(), ${context.userId}
      )
      on conflict (mint) do update set
        name = excluded.name,
        symbol = excluded.symbol,
        decimals = excluded.decimals,
        supply_raw = excluded.supply_raw,
        supply_ui = excluded.supply_ui,
        mint_authority = excluded.mint_authority,
        freeze_authority = excluded.freeze_authority,
        owner_program = excluded.owner_program,
        price_usd = excluded.price_usd,
        market_cap_usd = excluded.market_cap_usd,
        liquidity_usd = excluded.liquidity_usd,
        volume_24h_usd = excluded.volume_24h_usd,
        market_pair_url = excluded.market_pair_url,
        market_source = excluded.market_source,
        chain_source = excluded.chain_source,
        fetched_at = now(),
        fetched_by = excluded.fetched_by`;
    await logActivity(sql, context.userId, "token.lookup", data.mint, market.symbol);
    return {
      ok: true,
      token: {
        mint: data.mint,
        onChain: {
          found: true,
          decimals: chain.decimals,
          supplyUi: chain.supplyUi,
          supplyRaw: chain.supplyRaw,
          mintAuthority: chain.mintAuthority,
          freezeAuthority: chain.freezeAuthority,
          ownerProgram: chain.ownerProgram,
          source: chain.source,
        },
        market,
        fetchedAt,
      },
    };
  });

export const recentLookups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    await ensureProfile(sql, context.userId);
    const rows = await sql<{
      mint: string;
      name: string | null;
      symbol: string | null;
      supply_ui: string | null;
      price_usd: string | null;
      fetched_at: unknown;
    }>`
      select mint, name, symbol, supply_ui, price_usd, fetched_at
      from token_lookups
      where fetched_by = ${context.userId}
      order by fetched_at desc
      limit 8`;
    return rows.map((row) => ({
      mint: row.mint,
      name: row.name,
      symbol: row.symbol,
      supplyUi: row.supply_ui,
      priceUsd: row.price_usd,
      fetchedAt: iso(row.fetched_at),
    }));
  });

const trendsCache = globalThis as typeof globalThis & {
  __mfTrends?: { at: number; body: Awaited<ReturnType<typeof readSolanaBoosts>> };
};

export const loadTrends = createServerFn({ method: "GET" }).handler(async () => {
  const hit = trendsCache.__mfTrends;
  if (hit && Date.now() - hit.at < 120_000) return hit.body;
  const body = await readSolanaBoosts();
  if (body.ok) trendsCache.__mfTrends = { at: Date.now(), body };
  return body;
});

type Concept = { headline: string; body: string; cta: string; visual: string };

export const draftCopy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { mint: string; angle: string }) => ({
    mint: String(input?.mint ?? "").trim(),
    angle: clip(String(input?.angle ?? ""), 200),
  }))
  .handler(async ({ context, data }): Promise<Ok<{ concepts: Concept[]; notice: string }> | Fail> => {
    if (!isMintAddress(data.mint)) return fail("Look up a real mint before drafting copy.");
    const { sql, allowed } = await gate(context.userId, "ai-copy", 8, 60 * 60_000);
    if (!allowed) return fail("Copy generation limit reached for this hour.");
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return fail("AI is not available in this environment.");
    const tokens = await sql<{ name: string | null; symbol: string | null }>`
      select name, symbol from token_lookups where mint = ${data.mint}`;
    if (!tokens[0]) return fail("Read this mint from chain before asking for copy.");
    const facts = tokens[0];
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content:
              "Write 3 short ad concepts for a Solana token. Do not invent price, market cap, supply, or partnership claims. " +
              "Do not promise returns. Return JSON only: {\"concepts\":[{\"headline\":\"\",\"body\":\"\",\"cta\":\"\",\"visual\":\"\"}]}. " +
              `Facts: name=${facts.name ?? "unknown"}, symbol=${facts.symbol ?? "unknown"}, mint=${data.mint}. ` +
              `Angle: ${data.angle || "bold and plain"}. Channels available: ${CHANNELS.join(", ")}. ` +
              "Say the ad only runs on DYNamiQ and approved partners if you mention distribution.",
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return fail(`Copy model returned HTTP ${res.status}. Nothing was saved.`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fail("The model did not return concepts.");
    let concepts: Concept[] = [];
    try {
      const parsed = JSON.parse(match[0]) as { concepts?: Concept[] };
      concepts = (parsed.concepts ?? []).slice(0, 3).map((item) => ({
        headline: clip(String(item.headline ?? ""), 90),
        body: clip(String(item.body ?? ""), 280),
        cta: clip(String(item.cta ?? "See campaign"), 32),
        visual: clip(String(item.visual ?? ""), 200),
      }));
    } catch {
      return fail("The model returned unreadable JSON.");
    }
    if (concepts.length === 0) return fail("No concepts came back.");
    await logActivity(sql, context.userId, "studio.copy", data.mint, String(concepts.length));
    return {
      ok: true,
      concepts,
      notice: "Generated draft. Not on-chain. Not a forecast of impressions or price.",
    };
  });

function imageOk(value: string | null): boolean {
  if (!value) return true;
  if (value.length > 450_000) return false;
  if (value.startsWith("data:image/png;") || value.startsWith("data:image/jpeg;")) return true;
  return isHttpsUrl(value);
}

export const saveCreative = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { kind: string; title: string; copyText: string; imageData: string | null; prompt: string }) => ({
      kind: input?.kind === "copy" || input?.kind === "graphic" ? input.kind : "meme",
      title: clip(String(input?.title ?? ""), 80),
      copyText: clip(String(input?.copyText ?? ""), 280),
      imageData: input?.imageData ? String(input.imageData) : null,
      prompt: clip(String(input?.prompt ?? ""), 500),
    }),
  )
  .handler(async ({ context, data }): Promise<Ok<{ id: string }> | Fail> => {
    if (!data.title) return fail("Title is required.");
    if (!data.copyText && !data.imageData) return fail("Add copy or an image.");
    if (!imageOk(data.imageData)) return fail("Image must be a PNG, JPEG, or https URL under the size cap.");
    const { sql } = await gate(context.userId, "creative", 40, 60 * 60_000);
    const id = newId("cr");
    await sql`
      insert into creatives (id, user_id, kind, title, prompt, copy_text, image_data)
      values (${id}, ${context.userId}, ${data.kind}, ${data.title}, ${data.prompt || null}, ${data.copyText || null}, ${data.imageData})`;
    await logActivity(sql, context.userId, "creative.save", id, data.kind);
    return { ok: true, id };
  });

export const generateImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { title: string; prompt: string }) => ({
    title: clip(String(input?.title ?? "Meme"), 80),
    prompt: clip(String(input?.prompt ?? ""), 500),
  }))
  .handler(async ({ context, data }): Promise<Ok<{ id: string; image: string }> | Fail> => {
    if (data.prompt.length < 8) return fail("Describe the image in a sentence.");
    const { sql, allowed } = await gate(context.userId, "ai-image", 4, 60 * 60_000);
    if (!allowed) return fail("Image generation limit reached for this hour.");
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return fail("AI image generation is not available in this environment.");
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt:
          data.prompt +
          " Original poster, no celebrity likeness, no other brand logos, no price chart, no guaranteed-returns language.",
        n: 1,
        response_format: "url",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return fail(`Image model returned HTTP ${res.status}.`);
    const body = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
    const first = body.data?.[0];
    let image = first?.url ?? null;
    if (!image && first?.b64_json) image = `data:image/jpeg;base64,${first.b64_json}`;
    if (!image || !imageOk(image)) return fail("The image came back empty or too large to store.");
    const id = newId("cr");
    await sql`
      insert into creatives (id, user_id, kind, title, prompt, copy_text, image_data)
      values (${id}, ${context.userId}, 'graphic', ${data.title}, ${data.prompt}, ${null}, ${image})`;
    await logActivity(sql, context.userId, "studio.image", id, null);
    return { ok: true, id, image };
  });

export const listCreatives = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<{
      id: string;
      kind: string;
      title: string;
      copy_text: string | null;
      review_status: string;
      created_at: unknown;
      has_image: boolean;
    }>`
      select id, kind, title, copy_text, review_status, created_at, (image_data is not null) as has_image
      from creatives where user_id = ${context.userId}
      order by created_at desc limit 40`;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      copyText: row.copy_text,
      reviewStatus: row.review_status,
      createdAt: iso(row.created_at),
      hasImage: Boolean(row.has_image),
    }));
  });

function parseTime(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      name: string;
      mint: string;
      channels: string[];
      headline: string;
      body: string;
      cta: string;
      destinationUrl: string;
      creativeId: string;
      startsAt: string | null;
      endsAt: string | null;
      note: string;
      slots: string[];
    }) => ({
      name: clip(String(input?.name ?? ""), 80),
      mint: String(input?.mint ?? "").trim(),
      channels: parseChannels(Array.isArray(input?.channels) ? input.channels.map(String) : []),
      headline: clip(String(input?.headline ?? ""), 90),
      body: clip(String(input?.body ?? ""), 280),
      cta: clip(String(input?.cta ?? ""), 32),
      destinationUrl: clip(String(input?.destinationUrl ?? ""), 400),
      creativeId: String(input?.creativeId ?? "").trim(),
      startsAt: input?.startsAt ? String(input.startsAt) : null,
      endsAt: input?.endsAt ? String(input.endsAt) : null,
      note: clip(String(input?.note ?? ""), 300),
      slots: (Array.isArray(input?.slots) ? input.slots : [])
        .map((slot) => clip(String(slot), 24))
        .filter(Boolean)
        .slice(0, 4),
    }),
  )
  .handler(async ({ context, data }): Promise<Ok<{ id: string }> | Fail> => {
    if (!data.name || !data.headline || !data.body || !data.cta) return fail("Name, headline, body, and CTA are required.");
    if (!isMintAddress(data.mint)) return fail("Mint address is invalid.");
    if (data.channels.length === 0) return fail("Pick at least one channel. This is a plan, not an auto-post.");
    if (data.destinationUrl && !isHttpsUrl(data.destinationUrl)) return fail("Destination must be an https URL.");
    const starts = parseTime(data.startsAt);
    const ends = parseTime(data.endsAt);
    if (data.startsAt && !starts) return fail("Start time is invalid.");
    if (data.endsAt && !ends) return fail("End time is invalid.");
    if (starts && ends && ends <= starts) return fail("End must be after start.");
    const { sql } = await gate(context.userId, "campaign", 30, 60 * 60_000);
    const known = await sql<{ mint: string }>`select mint from token_lookups where mint = ${data.mint}`;
    if (!known[0]) return fail("Verify this mint on the Verify page before creating a campaign.");
    const creative = await sql<{ id: string }>`
      select id from creatives where id = ${data.creativeId} and user_id = ${context.userId}`;
    if (!creative[0]) return fail("Choose one of your creatives.");
    const id = newId("dq");
    const targeting = JSON.stringify({ note: data.note, slots: data.slots });
    await sql`
      insert into campaigns (
        id, user_id, name, mint, channels, headline, body, cta, destination_url, targeting,
        creative_id, starts_at, ends_at
      ) values (
        ${id}, ${context.userId}, ${data.name}, ${data.mint}, ${data.channels.join(",")},
        ${data.headline}, ${data.body}, ${data.cta}, ${data.destinationUrl || null}, ${targeting},
        ${data.creativeId}, ${starts}, ${ends}
      )`;
    await logActivity(sql, context.userId, "campaign.create", id, data.mint);
    return { ok: true, id };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<{
      id: string;
      name: string;
      mint: string;
      status: string;
      headline: string;
      onchain_verified_at: unknown;
      updated_at: unknown;
      symbol: string | null;
    }>`
      select c.id, c.name, c.mint, c.status, c.headline, c.onchain_verified_at, c.updated_at, t.symbol
      from campaigns c
      left join token_lookups t on t.mint = c.mint
      where c.user_id = ${context.userId}
      order by c.updated_at desc`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      mint: row.mint,
      symbol: row.symbol,
      status: row.status,
      headline: row.headline,
      onchainVerified: Boolean(row.onchain_verified_at),
      updatedAt: iso(row.updated_at),
    }));
  });

export const getCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    const rows = await sql<{
      id: string;
      user_id: string;
      name: string;
      mint: string;
      channels: string;
      headline: string;
      body: string;
      cta: string;
      destination_url: string | null;
      targeting: string;
      status: string;
      creative_id: string | null;
      starts_at: unknown;
      ends_at: unknown;
      onchain_cluster: string | null;
      onchain_memo: string | null;
      onchain_signature: string | null;
      onchain_verified_at: unknown;
      review_note: string | null;
      symbol: string | null;
      token_name: string | null;
      image_data: string | null;
      copy_text: string | null;
      review_status: string | null;
      creative_title: string | null;
    }>`
      select c.*, t.symbol, t.name as token_name, cr.image_data, cr.copy_text, cr.review_status, cr.title as creative_title
      from campaigns c
      left join token_lookups t on t.mint = c.mint
      left join creatives cr on cr.id = c.creative_id
      where c.id = ${data.id}`;
    const row = rows[0];
    if (!row) return fail("Campaign not found.");
    if (row.user_id !== context.userId && profile.role !== "admin") return fail("Campaign not found.");
    return {
      ok: true as const,
      campaign: {
        id: row.id,
        owned: row.user_id === context.userId,
        name: row.name,
        mint: row.mint,
        symbol: row.symbol,
        tokenName: row.token_name,
        channels: row.channels.split(",").filter(Boolean),
        headline: row.headline,
        body: row.body,
        cta: row.cta,
        destinationUrl: row.destination_url,
        targeting: row.targeting,
        status: row.status,
        creativeId: row.creative_id,
        creativeTitle: row.creative_title,
        image: row.image_data,
        copyText: row.copy_text,
        reviewStatus: row.review_status,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        onchainCluster: row.onchain_cluster,
        onchainMemo: row.onchain_memo,
        onchainSignature: row.onchain_signature,
        onchainVerifiedAt: iso(row.onchain_verified_at),
        reviewNote: row.review_note,
      },
    };
  });

export const submitCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ context, data}): Promise<{ ok: true } | Fail> => {
    const sql = await db();
    const rows = await sql<{ status: string }>`
      select status from campaigns where id = ${data.id} and user_id = ${context.userId}`;
    if (!rows[0]) return fail("Campaign not found.");
    if (rows[0].status !== "draft" && rows[0].status !== "rejected") {
      return fail("Only a draft or rejected campaign can be submitted.");
    }
    await sql`
      update campaigns set status = 'in_review', updated_at = now(), review_note = null
      where id = ${data.id} and user_id = ${context.userId}`;
    await sql`
      update creatives set review_status = 'pending'
      where id = (select creative_id from campaigns where id = ${data.id}) and user_id = ${context.userId}`;
    await logActivity(sql, context.userId, "campaign.submit", data.id, null);
    return { ok: true };
  });

export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: string }) => ({
    id: String(input?.id ?? ""),
    status: String(input?.status ?? ""),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Fail> => {
    if (data.status !== "paused" && data.status !== "draft") {
      return fail("You can pause a live campaign, or move a paused one back to draft.");
    }
    const sql = await db();
    const rows = await sql<{ status: string }>`
      select status from campaigns where id = ${data.id} and user_id = ${context.userId}`;
    const current = rows[0]?.status;
    if (!current) return fail("Campaign not found.");
    const next =
      data.status === "paused" && current === "live"
        ? "paused"
        : data.status === "draft" && (current === "paused" || current === "rejected")
          ? "draft"
          : "";
    if (!next) return fail("That status change is not available.");
    await sql`update campaigns set status = ${next}, updated_at = now() where id = ${data.id} and user_id = ${context.userId}`;
    await logActivity(sql, context.userId, "campaign.status", data.id, next);
    return { ok: true };
  });

export const prepareChain = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; owner: string }) => ({
    id: String(input?.id ?? ""),
    owner: String(input?.owner ?? "").trim(),
  }))
  .handler(async ({ context, data }): Promise<Ok<{ memo: string; cluster: "devnet" }> | Fail> => {
    if (!isMintAddress(data.owner)) return fail("Connect a Solana wallet public key first.");
    const sql = await db();
    const rows = await sql<{ mint: string; creative_id: string | null; status: string; headline: string }>`
      select mint, creative_id, status, headline from campaigns where id = ${data.id} and user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) return fail("Campaign not found.");
    if (!row.creative_id) return fail("Attach a creative before registering.");
    const hash = await sha256Hex(`${row.creative_id}:${row.headline}`);
    const memo = buildMemo({
      id: data.id,
      mint: row.mint,
      creativeHash: hash,
      owner: data.owner,
      state: row.status,
    });
    await sql`
      update campaigns
      set onchain_memo = ${memo}, onchain_cluster = 'devnet', onchain_signature = null,
          onchain_verified_at = null, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}`;
    await sql`update profiles set wallet_pubkey = ${data.owner} where user_id = ${context.userId}`;
    await logActivity(sql, context.userId, "chain.prepare", data.id, "devnet");
    return { ok: true, memo, cluster: "devnet" };
  });

export const confirmChain = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; signature: string }) => ({
    id: String(input?.id ?? ""),
    signature: String(input?.signature ?? "").trim(),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Fail> => {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(data.signature)) return fail("That does not look like a Solana signature.");
    const { sql, allowed } = await gate(context.userId, "chain", 20, 60 * 60_000);
    if (!allowed) return fail("Too many verification attempts.");
    const rows = await sql<{ onchain_memo: string | null }>`
      select onchain_memo from campaigns where id = ${data.id} and user_id = ${context.userId}`;
    const memo = rows[0]?.onchain_memo;
    if (!memo) return fail("Prepare the devnet memo before verifying.");
    const owner = memo.split("|").find((part) => part.startsWith("owner="))?.slice(6) ?? "";
    const check = await verifyDevnetMemo(data.signature, memo, owner);
    if (!check.ok) return check;
    await sql`
      update campaigns
      set onchain_signature = ${data.signature}, onchain_verified_at = now(), updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}`;
    await logActivity(sql, context.userId, "chain.verify", data.id, data.signature.slice(0, 12));
    return { ok: true };
  });

export const listLiveCampaigns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    await ensureProfile(sql, context.userId);
    const rows = await sql<{ id: string; name: string; headline: string; symbol: string | null }>`
      select c.id, c.name, c.headline, t.symbol
      from campaigns c
      left join token_lookups t on t.mint = c.mint
      where c.status = 'live'
      order by c.updated_at desc limit 40`;
    return rows;
  });

export const submitMission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { campaignId: string; proofUrl: string; note: string }) => ({
    campaignId: String(input?.campaignId ?? ""),
    proofUrl: clip(String(input?.proofUrl ?? ""), 400),
    note: clip(String(input?.note ?? ""), 500),
  }))
  .handler(async ({ context, data }): Promise<Ok<{ id: string }> | Fail> => {
    if (!isHttpsUrl(data.proofUrl)) return fail("Proof link must be https.");
    const { sql, allowed } = await gate(context.userId, "mission", 20, 60 * 60_000);
    if (!allowed) return fail("Submission limit reached.");
    const campaigns = await sql<{ id: string }>`select id from campaigns where id = ${data.campaignId} and status = 'live'`;
    if (!campaigns[0]) return fail("Missions can only be filed against a live campaign.");
    const id = newId("ms");
    await sql`
      insert into missions (id, campaign_id, user_id, proof_url, note)
      values (${id}, ${data.campaignId}, ${context.userId}, ${data.proofUrl}, ${data.note || null})`;
    await logActivity(sql, context.userId, "mission.submit", id, data.campaignId);
    return { ok: true, id };
  });

export const myMissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<{
      id: string;
      campaign_id: string;
      proof_url: string;
      note: string | null;
      status: string;
      review_note: string | null;
      created_at: unknown;
      name: string;
    }>`
      select m.id, m.campaign_id, m.proof_url, m.note, m.status, m.review_note, m.created_at, c.name
      from missions m
      join campaigns c on c.id = m.campaign_id
      where m.user_id = ${context.userId}
      order by m.created_at desc limit 40`;
    return rows.map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      campaignName: row.name,
      proofUrl: row.proof_url,
      note: row.note,
      status: row.status,
      reviewNote: row.review_note,
      createdAt: iso(row.created_at),
    }));
  });

export const reportAbuse = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { campaignId: string; reason: string }) => ({
    campaignId: String(input?.campaignId ?? ""),
    reason: clip(String(input?.reason ?? ""), 300),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Fail> => {
    if (data.reason.length < 8) return fail("Say what is wrong, in a sentence.");
    const { sql, allowed } = await gate(context.userId, "abuse", 10, 60 * 60_000);
    if (!allowed) return fail("Report limit reached.");
    const rows = await sql<{ id: string }>`select id from campaigns where id = ${data.campaignId}`;
    if (!rows[0]) return fail("Campaign not found.");
    await sql`
      insert into abuse_reports (id, user_id, campaign_id, reason)
      values (${newId("ab")}, ${context.userId}, ${data.campaignId}, ${data.reason})`;
    await logActivity(sql, context.userId, "abuse.report", data.campaignId, null);
    return { ok: true };
  });

export const createPartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; siteUrl: string }) => ({
    name: clip(String(input?.name ?? ""), 80),
    siteUrl: clip(String(input?.siteUrl ?? ""), 400),
  }))
  .handler(async ({ context, data }): Promise<Ok<{ id: string; apiKey: string }> | Fail> => {
    if (!data.name) return fail("Name the site.");
    if (!isHttpsUrl(data.siteUrl)) return fail("Site URL must be https.");
    const { sql, allowed } = await gate(context.userId, "partner", 8, 60 * 60_000);
    if (!allowed) return fail("Partner creation limit reached.");
    const apiKey = randomKey();
    const id = newId("pt");
    await sql`
      insert into partners (id, user_id, name, site_url, api_key_hash, api_key_prefix)
      values (${id}, ${context.userId}, ${data.name}, ${data.siteUrl}, ${sha256(apiKey)}, ${apiKey.slice(0, 7)})`;
    await logActivity(sql, context.userId, "partner.create", id, data.siteUrl);
    return { ok: true, id, apiKey };
  });

export const listPartners = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    const rows =
      profile.role === "admin"
        ? await sql<{
            id: string;
            name: string;
            site_url: string;
            api_key_prefix: string;
            status: string;
            created_at: unknown;
            user_id: string;
          }>`select id, name, site_url, api_key_prefix, status, created_at, user_id from partners order by created_at desc`
        : await sql<{
            id: string;
            name: string;
            site_url: string;
            api_key_prefix: string;
            status: string;
            created_at: unknown;
            user_id: string;
          }>`select id, name, site_url, api_key_prefix, status, created_at, user_id from partners where user_id = ${context.userId} order by created_at desc`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      siteUrl: row.site_url,
      prefix: row.api_key_prefix,
      status: row.status,
      createdAt: iso(row.created_at),
      owned: row.user_id === context.userId,
    }));
  });

export const loadAnalytics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    const mine = profile.role === "admin";
    const totals = mine
      ? await sql<{ event_type: string; n: number }>`
          select event_type, count(*)::int as n from analytics_events group by event_type`
      : await sql<{ event_type: string; n: number }>`
          select e.event_type, count(*)::int as n
          from analytics_events e
          join campaigns c on c.id = e.campaign_id
          where c.user_id = ${context.userId}
          group by e.event_type`;
    const byCampaign = mine
      ? await sql<{ id: string; name: string; event_type: string; n: number }>`
          select c.id, c.name, e.event_type, count(*)::int as n
          from analytics_events e
          join campaigns c on c.id = e.campaign_id
          group by c.id, c.name, e.event_type
          order by c.name`
      : await sql<{ id: string; name: string; event_type: string; n: number }>`
          select c.id, c.name, e.event_type, count(*)::int as n
          from analytics_events e
          join campaigns c on c.id = e.campaign_id
          where c.user_id = ${context.userId}
          group by c.id, c.name, e.event_type
          order by c.name`;
    const byDay = mine
      ? await sql<{ day: string; event_type: string; n: number }>`
          select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, event_type, count(*)::int as n
          from analytics_events
          where created_at > now() - interval '14 days'
          group by 1, 2 order by 1`
      : await sql<{ day: string; event_type: string; n: number }>`
          select to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD') as day, e.event_type, count(*)::int as n
          from analytics_events e
          join campaigns c on c.id = e.campaign_id
          where c.user_id = ${context.userId} and e.created_at > now() - interval '14 days'
          group by 1, 2 order by 1`;
    const submissions = mine
      ? await sql<{ n: number }>`select count(*)::int as n from missions`
      : await sql<{ n: number }>`select count(*)::int as n from missions where user_id = ${context.userId}`;
    const impressions = Number(totals.find((row) => row.event_type === "impression")?.n ?? 0);
    const clicks = Number(totals.find((row) => row.event_type === "click")?.n ?? 0);
    const names = new Map<string, { id: string; name: string; impressions: number; clicks: number }>();
    for (const row of byCampaign) {
      const current = names.get(row.id) ?? { id: row.id, name: row.name, impressions: 0, clicks: 0 };
      if (row.event_type === "impression") current.impressions = Number(row.n);
      if (row.event_type === "click") current.clicks = Number(row.n);
      names.set(row.id, current);
    }
    const days = new Map<string, { day: string; impressions: number; clicks: number }>();
    for (const row of byDay) {
      const current = days.get(row.day) ?? { day: row.day, impressions: 0, clicks: 0 };
      if (row.event_type === "impression") current.impressions = Number(row.n);
      if (row.event_type === "click") current.clicks = Number(row.n);
      days.set(row.day, current);
    }
    return {
      scope: mine ? "all campaigns (operator)" : "your campaigns",
      source: "Rows in analytics_events. Off-chain. No estimates.",
      impressions,
      clicks,
      submissions: Number(submissions[0]?.n ?? 0),
      campaigns: [...names.values()],
      days: [...days.values()],
    };
  });

export const adminQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    if (profile.role !== "admin") return fail("Operator only.");
    const campaigns = await sql<{
      id: string;
      name: string;
      status: string;
      mint: string;
      headline: string;
      user_id: string;
      review_note: string | null;
    }>`
      select id, name, status, mint, headline, user_id, review_note
      from campaigns order by updated_at desc limit 50`;
    const missions = await sql<{
      id: string;
      campaign_id: string;
      proof_url: string;
      note: string | null;
      status: string;
      name: string;
    }>`
      select m.id, m.campaign_id, m.proof_url, m.note, m.status, c.name
      from missions m join campaigns c on c.id = m.campaign_id
      order by m.created_at desc limit 40`;
    const reports = await sql<{ id: string; campaign_id: string; reason: string; created_at: string | Date }>`
      select id, campaign_id, reason, created_at from abuse_reports order by created_at desc limit 30`;
    const logs = await sql<{ action: string; target: string | null; detail: string | null; created_at: string | Date }>`
      select action, target, detail, created_at from activity_logs order by id desc limit 30`;
    return {
      ok: true as const,
      campaigns: campaigns.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        mint: row.mint,
        headline: row.headline,
        reviewNote: row.review_note,
      })),
      missions: missions.map((row) => ({
        id: row.id,
        campaignId: row.campaign_id,
        proofUrl: row.proof_url,
        note: row.note,
        status: row.status,
        name: row.name,
      })),
      reports: reports.map((row) => ({
        id: row.id,
        campaignId: row.campaign_id,
        reason: row.reason,
        createdAt: iso(row.created_at),
      })),
      logs: logs.map((row) => ({
        action: row.action,
        target: row.target,
        detail: row.detail,
        createdAt: iso(row.created_at),
      })),
    };
  });

export const moderateCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; decision: string; note: string }) => ({
    id: String(input?.id ?? ""),
    decision: String(input?.decision ?? ""),
    note: clip(String(input?.note ?? ""), 300),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Fail> => {
    if (!["live", "rejected", "paused"].includes(data.decision)) return fail("Unknown decision.");
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    if (profile.role !== "admin") return fail("Operator only.");
    const rows = await sql<{ creative_id: string | null }>`select creative_id from campaigns where id = ${data.id}`;
    if (!rows[0]) return fail("Campaign not found.");
    await sql`
      update campaigns set status = ${data.decision}, review_note = ${data.note || null}, updated_at = now()
      where id = ${data.id}`;
    if (rows[0].creative_id) {
      const review = data.decision === "live" ? "approved" : data.decision === "rejected" ? "rejected" : "pending";
      if (data.decision !== "paused") {
        await sql`update creatives set review_status = ${review}, review_note = ${data.note || null} where id = ${rows[0].creative_id}`;
      }
    }
    await logActivity(sql, context.userId, "campaign.moderate", data.id, data.decision);
    return { ok: true };
  });

export const moderateMission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; decision: string; note: string }) => ({
    id: String(input?.id ?? ""),
    decision: String(input?.decision ?? ""),
    note: clip(String(input?.note ?? ""), 300),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Fail> => {
    if (data.decision !== "accepted" && data.decision !== "rejected") return fail("Unknown decision.");
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    if (profile.role !== "admin") return fail("Operator only.");
    const rows = await sql<{ id: string }>`select id from missions where id = ${data.id}`;
    if (!rows[0]) return fail("Mission not found.");
    await sql`update missions set status = ${data.decision}, review_note = ${data.note || null} where id = ${data.id}`;
    await logActivity(sql, context.userId, "mission.review", data.id, data.decision);
    return { ok: true };
  });

export const setPartnerStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: string }) => ({
    id: String(input?.id ?? ""),
    status: String(input?.status ?? ""),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Fail> => {
    if (!["active", "suspended", "pending"].includes(data.status)) return fail("Unknown status.");
    const sql = await db();
    const profile = await ensureProfile(sql, context.userId);
    if (profile.role !== "admin") return fail("Operator only.");
    const rows = await sql<{ id: string }>`select id from partners where id = ${data.id}`;
    if (!rows[0]) return fail("Partner not found.");
    await sql`update partners set status = ${data.status} where id = ${data.id}`;
    await logActivity(sql, context.userId, "partner.status", data.id, data.status);
    return { ok: true };
  });
