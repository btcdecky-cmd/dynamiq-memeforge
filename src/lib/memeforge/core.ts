/** Pure helpers: validation, SPL mint decode, memo payload, ad eligibility. No I/O. */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const DEVNET_RPC = "https://api.devnet.solana.com";
export const MAINNET_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
];

export type Cluster = "mainnet" | "devnet";

export const CLUSTER_RPCS: Record<Cluster, readonly string[]> = {
  mainnet: MAINNET_RPCS,
  devnet: [DEVNET_RPC],
};

export function parseCluster(value: string | null | undefined): Cluster | null {
  return value === "mainnet" || value === "devnet" ? value : null;
}

export function explorerTxUrl(cluster: Cluster, signature: string): string {
  const base = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`;
  return cluster === "devnet" ? `${base}?cluster=devnet` : base;
}

export const LIMITS = {
  name: 80,
  headline: 90,
  body: 280,
  cta: 32,
  title: 80,
  prompt: 500,
  note: 500,
  url: 400,
  reason: 300,
} as const;

export type MintAccount = {
  mintAuthority: string | null;
  supplyRaw: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: string | null;
};

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i]];
  return out;
}

export function decodeBase58(value: string): Uint8Array | null {
  if (!value || value.length > 50) return null;
  const bytes = [0];
  for (const ch of value) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    let carry = v;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of value) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export function isMintAddress(value: string): boolean {
  const raw = decodeBase58(value.trim());
  return raw !== null && raw.length === 32;
}

export function decodeMintAccount(data: Uint8Array): MintAccount | null {
  if (data.length < 82) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const mintOpt = view.getUint32(0, true);
  const supplyRaw = view.getBigUint64(36, true);
  const decimals = data[44];
  const isInitialized = data[45] === 1;
  const freezeOpt = view.getUint32(46, true);
  if (decimals > 18) return null;
  if (mintOpt !== 0 && mintOpt !== 1) return null;
  if (freezeOpt !== 0 && freezeOpt !== 1) return null;
  return {
    mintAuthority: mintOpt === 1 ? encodeBase58(data.slice(4, 36)) : null,
    supplyRaw,
    decimals,
    isInitialized,
    freezeAuthority: freezeOpt === 1 ? encodeBase58(data.slice(50, 82)) : null,
  };
}

export function formatSupply(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const digits = v.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return (neg ? "-" : "") + digits;
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${body}` : body;
}

export function buildMemo(input: {
  id: string;
  mint: string;
  creativeHash: string;
  owner: string;
  state: string;
}): string {
  return [
    "DYNAMIQ",
    "v1",
    `id=${input.id}`,
    `mint=${input.mint}`,
    `creative=${input.creativeHash}`,
    `owner=${input.owner}`,
    `state=${input.state}`,
  ].join("|");
}

export function parseMemo(memo: string): Record<string, string> | null {
  const parts = memo.split("|");
  if (parts[0] !== "DYNAMIQ" || parts[1] !== "v1") return null;
  const out: Record<string, string> = {};
  for (const part of parts.slice(2)) {
    const i = part.indexOf("=");
    if (i <= 0) return null;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  if (!out.id || !out.mint || !out.creative || !out.owner || !out.state) return null;
  return out;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (!url.hostname || url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export const CHANNELS = ["x", "telegram", "discord", "instagram", "website", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export function parseChannels(value: string[]): Channel[] {
  const set = new Set<Channel>();
  for (const item of value) {
    if ((CHANNELS as readonly string[]).includes(item)) set.add(item as Channel);
  }
  return [...set];
}

export type ServeInput = {
  status: string;
  reviewStatus: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  now: Date;
};

/** Off-chain eligibility for the ad network. On-chain verification is separate. */
export function isServable(input: ServeInput): boolean {
  if (input.status !== "live") return false;
  if (input.reviewStatus !== "approved") return false;
  if (input.startsAt && input.startsAt.getTime() > input.now.getTime()) return false;
  if (input.endsAt && input.endsAt.getTime() <= input.now.getTime()) return false;
  return true;
}

export function newId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function randomKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `dq_${hex}`;
}
