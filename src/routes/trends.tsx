import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Notice, PageTitle } from "@/components/memeforge/shell";
import { loadTrends } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/trends")({ component: TrendsPage });

function TrendsPage() {
  const [body, setBody] = useState<Awaited<ReturnType<typeof loadTrends>> | null>(null);
  useEffect(() => {
    loadTrends()
      .then(setBody)
      .catch(() => setBody({ ok: false, error: "Could not load trends" }));
  }, []);
  return (
    <AppShell>
      <PageTitle
        kicker="TREND DETECTOR"
        title="What DexScreener is boosting"
        lede="This list is the public token-boosts feed, filtered to Solana. It is not X, Telegram, or Discord conversation, and it is not a meme rank we computed."
      />
      {!body ? <p className="text-mute">Loading the feed…</p> : null}
      {body && !body.ok ? <Notice tone="bad">{body.error}</Notice> : null}
      {body && body.ok ? (
        <>
          <p className="mb-3 text-xs text-mute">Fetched {body.fetchedAt}. Cached for two minutes. Amount is DexScreener's boost total, not our metric.</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {body.items.length === 0 ? <li className="text-sm text-mute">The feed returned no Solana rows.</li> : null}
            {body.items.map((item) => (
              <li key={item.tokenAddress} className="rounded-md border border-line bg-card p-4">
                <p className="font-mono text-xs break-all">{item.tokenAddress}</p>
                <p className="mt-2 text-sm">{item.description ?? "No description on the boost."}</p>
                <p className="mt-2 text-xs text-mute">Boost total: {item.totalAmount ?? "not provided"}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <a className="underline" href={item.url} target="_blank" rel="noreferrer">
                    DexScreener
                  </a>
                  <Link className="underline" to="/lookup">
                    Verify mint
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </AppShell>
  );
}
