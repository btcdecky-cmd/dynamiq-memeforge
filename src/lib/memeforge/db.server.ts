import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";

export async function db(): Promise<Sql> {
  return getSql();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

export type Profile = {
  user_id: string;
  display_name: string;
  wallet_pubkey: string | null;
  role: string;
};

export async function ensureProfile(sql: Sql, userId: string): Promise<Profile> {
  await sql`insert into profiles (user_id) values (${userId}) on conflict (user_id) do nothing`;
  const rows = await sql<Profile>`
    select user_id, display_name, wallet_pubkey, role from profiles where user_id = ${userId}`;
  return rows[0];
}

export async function logActivity(
  sql: Sql,
  actor: string | null,
  action: string,
  target: string | null,
  detail: string | null,
) {
  const safe = detail ? detail.slice(0, 300) : null;
  await sql`insert into activity_logs (actor_id, action, target, detail) values (${actor}, ${action}, ${target}, ${safe})`;
}

/** Returns true when the call is allowed. */
export async function rateLimit(
  sql: Sql,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const rows = await sql<{ hits: number; window_start: string | Date }>`
    select hits, window_start from rate_limits where bucket = ${bucket}`;
  const now = Date.now();
  const row = rows[0];
  if (!row) {
    await sql`insert into rate_limits (bucket, window_start, hits) values (${bucket}, now(), 1)`;
    return true;
  }
  const start = new Date(row.window_start).getTime();
  if (!Number.isFinite(start) || now - start >= windowMs) {
    await sql`update rate_limits set window_start = now(), hits = 1 where bucket = ${bucket}`;
    return true;
  }
  if (Number(row.hits) >= limit) return false;
  await sql`update rate_limits set hits = hits + 1 where bucket = ${bucket}`;
  return true;
}
