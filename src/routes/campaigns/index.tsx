import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Gate, PageTitle } from "@/components/memeforge/shell";
import { listCampaigns } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/campaigns/")({ component: CampaignsPage });

function CampaignsPage() {
  return (
    <AppShell>
      <Gate>
        <Campaigns />
      </Gate>
    </AppShell>
  );
}

function Campaigns() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCampaigns>>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listCampaigns()
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load campaigns"));
  }, []);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          kicker="REGISTRY"
          title="Campaigns"
          lede="Drafts stay off the network until an operator marks them live and the creative is approved."
        />
        <Link to="/campaigns/new" className="mf-btn mf-stamp">
          New campaign
        </Link>
      </div>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      <ul className="divide-y divide-line rounded-md border border-line bg-card">
        {rows.length === 0 ? <li className="px-4 py-4 text-sm text-mute">No campaigns yet.</li> : null}
        {rows.map((row) => (
          <li key={row.id}>
            <Link to="/campaigns/$campaignId" params={{ campaignId: row.id }} className="block px-4 py-4">
              <span className="flex items-center justify-between gap-3">
                <span className="font-bold">{row.name}</span>
                <span className="text-xs tracking-widest text-mute">{row.status}</span>
              </span>
              <span className="mt-1 block text-sm text-mute">{row.headline}</span>
              <span className="mt-1 block font-mono text-xs text-mute">
                {row.symbol ? `$${row.symbol} · ` : ""}
                {row.onchainVerified
                  ? `${row.onchainCluster ?? "unknown"} memo verified`
                  : "no memo yet"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
