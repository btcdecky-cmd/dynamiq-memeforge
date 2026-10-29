import {
  DEVNET_RPC,
  MAINNET_RPCS,
  TOKEN_2022,
  TOKEN_PROGRAM,
  decodeMintAccount,
  formatSupply,
  parseMemo,
} from "./core";

type RpcError = { message?: string };

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: RpcError };
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

export type ChainRead = {
  source: string;
  found: boolean;
  ownerProgram: string | null;
  decimals: number | null;
  supplyRaw: string | null;
  supplyUi: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  initialized: boolean;
};

export async function readMint(mint: string): Promise<ChainRead> {
  let lastError = "Solana RPC did not respond";
  for (const url of MAINNET_RPCS) {
    try {
      const result = (await rpc(url, "getAccountInfo", [mint, { encoding: "base64" }])) as {
        value: { data: [string, string]; owner: string } | null;
      } | null;
      const value = result?.value ?? null;
      if (!value) {
        return {
          source: url,
          found: false,
          ownerProgram: null,
          decimals: null,
          supplyRaw: null,
          supplyUi: null,
          mintAuthority: null,
          freezeAuthority: null,
          initialized: false,
        };
      }
      if (value.owner !== TOKEN_PROGRAM && value.owner !== TOKEN_2022) {
        throw new Error("NOT_MINT");
      }
      const raw = Uint8Array.from(Buffer.from(value.data[0] ?? "", "base64"));
      const decoded = decodeMintAccount(raw);
      if (!decoded || !decoded.isInitialized) {
        throw new Error("Mint account could not be decoded");
      }
      return {
        source: url,
        found: true,
        ownerProgram: value.owner,
        decimals: decoded.decimals,
        supplyRaw: decoded.supplyRaw.toString(),
        supplyUi: formatSupply(decoded.supplyRaw, decoded.decimals),
        mintAuthority: decoded.mintAuthority,
        freezeAuthority: decoded.freezeAuthority,
        initialized: true,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_MINT") throw error;
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

export type MarketRead = {
  available: boolean;
  name: string | null;
  symbol: string | null;
  priceUsd: string | null;
  marketCapUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  pairUrl: string | null;
  source: string;
  note: string;
};

export async function readMarket(mint: string): Promise<MarketRead> {
  const empty = (note: string): MarketRead => ({
    available: false,
    name: null,
    symbol: null,
    priceUsd: null,
    marketCapUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    pairUrl: null,
    source: "DexScreener",
    note,
  });
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return empty(`DexScreener HTTP ${res.status}. Prices were not filled in.`);
    const body = (await res.json()) as {
      pairs?: Array<{
        chainId?: string;
        url?: string;
        priceUsd?: string;
        marketCap?: number;
        liquidity?: { usd?: number };
        volume?: { h24?: number };
        baseToken?: { address?: string; name?: string; symbol?: string };
      }>;
    };
    const pairs = (body.pairs ?? []).filter(
      (pair) => pair.chainId === "solana" && pair.baseToken?.address === mint,
    );
    if (pairs.length === 0) {
      return empty("No Solana pair for this mint on DexScreener. Market fields are unknown, not zero.");
    }
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const best = pairs[0];
    const num = (value: number | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? String(value) : null;
    return {
      available: true,
      name: best.baseToken?.name ?? null,
      symbol: best.baseToken?.symbol ?? null,
      priceUsd: best.priceUsd ?? null,
      marketCapUsd: num(best.marketCap),
      liquidityUsd: num(best.liquidity?.usd),
      volume24hUsd: num(best.volume?.h24),
      pairUrl: best.url ?? null,
      source: "DexScreener",
      note: "Off-chain market data from the deepest DexScreener Solana pair. Not a Solana account field.",
    };
  } catch {
    return empty("DexScreener could not be reached. Market fields were left empty.");
  }
}

export type TrendItem = {
  tokenAddress: string;
  url: string;
  description: string | null;
  totalAmount: number | null;
  icon: string | null;
};

export async function readSolanaBoosts(): Promise<{
  ok: true;
  items: TrendItem[];
  fetchedAt: string;
} | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ok: false, error: `DexScreener boosts HTTP ${res.status}` };
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return { ok: false, error: "DexScreener boosts payload was not a list" };
    const items: TrendItem[] = [];
    for (const row of body) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      if (item.chainId !== "solana") continue;
      if (typeof item.tokenAddress !== "string" || typeof item.url !== "string") continue;
      items.push({
        tokenAddress: item.tokenAddress,
        url: item.url,
        description: typeof item.description === "string" ? item.description.slice(0, 280) : null,
        totalAmount: typeof item.totalAmount === "number" ? item.totalAmount : null,
        icon: typeof item.icon === "string" ? item.icon : null,
      });
      if (items.length >= 12) break;
    }
    return { ok: true, items, fetchedAt: new Date().toISOString() };
  } catch {
    return { ok: false, error: "DexScreener boosts could not be reached" };
  }
}

export async function verifyDevnetMemo(
  signature: string,
  expectedMemo: string,
  owner: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let result: unknown;
  try {
    result = await rpc(DEVNET_RPC, "getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Devnet RPC failed",
    };
  }
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      error: "Signature was not found on devnet. Switch the wallet to Devnet and sign again.",
    };
  }
  const tx = result as {
    meta?: { err?: unknown; logMessages?: string[] };
    transaction?: { message?: { accountKeys?: unknown } };
  };
  if (tx.meta?.err) return { ok: false, error: "The devnet transaction failed on-chain." };
  const blob = JSON.stringify(result);
  if (!blob.includes(expectedMemo)) {
    return { ok: false, error: "The devnet transaction does not contain this campaign memo." };
  }
  const parsed = parseMemo(expectedMemo);
  if (!parsed || parsed.owner !== owner) {
    return { ok: false, error: "Memo owner does not match the wallet you prepared." };
  }
  const keys = tx.transaction?.message?.accountKeys;
  const signers: string[] = [];
  if (Array.isArray(keys)) {
    for (const key of keys) {
      if (typeof key === "string") signers.push(key);
      else if (key && typeof key === "object" && "pubkey" in key) {
        const row = key as { pubkey?: string; signer?: boolean };
        if (row.signer && row.pubkey) signers.push(row.pubkey);
      }
    }
  }
  if (!signers.includes(owner) && !blob.includes(`"pubkey":"${owner}"`)) {
    return { ok: false, error: "The prepared wallet did not sign this devnet transaction." };
  }
  return { ok: true };
}
