import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Field, Gate, Notice, PageTitle } from "@/components/memeforge/shell";
import { lookupToken, recentLookups } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/lookup")({ component: LookupPage });

type Token = Awaited<ReturnType<typeof lookupToken>> extends infer R
  ? R extends { ok: true; token: infer T }
    ? T
    : null
  : null;

function LookupPage() {
  return (
    <AppShell>
      <Gate>
        <Lookup />
      </Gate>
    </AppShell>
  );
}

function Lookup() {
  const [mint, setMint] = useState("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<Token>(null);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentLookups>>>([]);

  useEffect(() => {
    let dead = false;
    recentLookups()
      .then((rows) => {
        if (!dead) setRecent(rows);
      })
      .catch(() => {
        if (!dead) setRecent([]);
      });
    return () => {
      dead = true;
    };
  }, [token?.fetchedAt]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await lookupToken({ data: { mint } });
      if (!result.ok) {
        setToken(null);
        setError(result.error);
      } else {
        setToken(result.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle
        kicker="ON-CHAIN READ"
        title="Verify a mint"
        lede="Mainnet account data is read live. Market numbers appear only when DexScreener has a Solana pair. Empty means unknown."
      />
      <form onSubmit={onSubmit} className="max-w-2xl space-y-3">
        <Field label="Mint address">
          <input className="mf-input font-mono text-sm" value={mint} onChange={(e) => setMint(e.target.value)} spellCheck={false} />
        </Field>
        <button className="mf-btn mf-stamp" disabled={busy} type="submit">
          {busy ? "Reading chain…" : "Read mainnet"}
        </button>
      </form>
      {error ? (
        <div className="mt-4 max-w-2xl">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}
      {token ? (
        <div className="mt-6 grid max-w-4xl gap-4 md:grid-cols-2">
          <article className="rounded-md border border-line bg-card p-4">
            <p className="text-xs tracking-widest text-stamp">ON-CHAIN</p>
            <h2 className="mt-1 font-mono text-sm break-all">{token.mint}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Decimals" v={String(token.onChain.decimals ?? "—")} />
              <Row k="Supply" v={token.onChain.supplyUi ?? "—"} />
              <Row k="Mint authority" v={token.onChain.mintAuthority ?? "None"} />
              <Row k="Freeze authority" v={token.onChain.freezeAuthority ?? "None"} />
              <Row k="Program" v={token.onChain.ownerProgram ?? "—"} />
            </dl>
            <p className="mt-3 text-xs text-mute">Source: {token.onChain.source}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4">
            <p className="text-xs tracking-widest text-mute">OFF-CHAIN MARKET</p>
            <h2 className="mt-1 text-xl font-bold">
              {token.market.name ?? "Name not on DexScreener"}{" "}
              {token.market.symbol ? <span className="text-mute">${token.market.symbol}</span> : null}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Price USD" v={token.market.priceUsd ?? "Unknown"} />
              <Row k="Market cap" v={token.market.marketCapUsd ?? "Unknown"} />
              <Row k="Liquidity" v={token.market.liquidityUsd ?? "Unknown"} />
              <Row k="Volume 24h" v={token.market.volume24hUsd ?? "Unknown"} />
            </dl>
            <p className="mt-3 text-xs text-mute">{token.market.note}</p>
            {token.market.pairUrl ? (
              <a className="mt-2 inline-block text-sm underline" href={token.market.pairUrl} target="_blank" rel="noreferrer">
                Open the pair
              </a>
            ) : null}
          </article>
        </div>
      ) : null}
      {recent.length > 0 ? (
        <section className="mt-8 max-w-2xl">
          <h2 className="text-sm font-bold tracking-widest text-mute">YOUR RECENT READS</h2>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
            {recent.map((row) => (
              <li key={row.mint}>
                <button type="button" className="w-full px-3 py-3 text-left" onClick={() => setMint(row.mint)}>
                  <span className="font-medium">{row.symbol ?? row.name ?? "Mint"}</span>
                  <span className="mt-1 block font-mono text-xs text-mute break-all">{row.mint}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-mute">{k}</dt>
      <dd className="max-w-[16rem] text-right font-mono text-xs break-all">{v}</dd>
    </div>
  );
}
