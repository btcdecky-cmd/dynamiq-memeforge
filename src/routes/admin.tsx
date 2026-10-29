import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Gate, Notice, PageTitle } from "@/components/memeforge/shell";
import {
  adminQueue,
  claimOperator,
  getSessionProfile,
  listPartners,
  moderateCampaign,
  moderateMission,
  setPartnerStatus,
} from "@/lib/memeforge/functions";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  return (
    <AppShell>
      <Gate>
        <Admin />
      </Gate>
    </AppShell>
  );
}

function Admin() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getSessionProfile>> | null>(null);
  const [queue, setQueue] = useState<Extract<Awaited<ReturnType<typeof adminQueue>>, { ok: true }> | null>(null);
  const [partners, setPartners] = useState<Awaited<ReturnType<typeof listPartners>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function refresh() {
    const me = await getSessionProfile();
    setProfile(me);
    const partnerRows = await listPartners();
    setPartners(partnerRows);
    if (me.role !== "admin") {
      setQueue(null);
      return;
    }
    const next = await adminQueue();
    if (!next.ok) setError(next.error);
    else setQueue(next);
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  return (
    <div className="space-y-6">
      <PageTitle
        kicker="OPERATOR"
        title="Review desk"
        lede="The first signed-in account can claim operator if none exists. Approval is what makes a campaign eligible. Chain verification does not."
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {profile && profile.role !== "admin" ? (
        <div className="max-w-xl space-y-3">
          <p className="text-sm text-mute">
            {profile.operatorExists
              ? "An operator already exists. You can still run campaigns as an advertiser."
              : "No operator yet. Claiming makes this account the reviewer for campaigns, missions, partners, and reports."}
          </p>
          {!profile.operatorExists ? (
            <button
              type="button"
              className="mf-btn mf-stamp"
              onClick={async () => {
                const result = await claimOperator();
                if (!result.ok) setError(result.error);
                else await refresh();
              }}
            >
              Claim operator
            </button>
          ) : null}
        </div>
      ) : null}
      {queue ? (
        <>
          <section>
            <h2 className="font-bold">Campaigns</h2>
            <ul className="mt-2 space-y-3">
              {queue.campaigns.map((row) => (
                <li key={row.id} className="rounded-md border border-line bg-card p-3 text-sm">
                  <p className="font-medium">
                    {row.name} <span className="text-mute">{row.status}</span>
                  </p>
                  <p className="text-mute">{row.headline}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["live", "rejected", "paused"].map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        className="mf-btn mf-ghost"
                        onClick={async () => {
                          const result = await moderateCampaign({ data: { id: row.id, decision, note } });
                          if (!result.ok) setError(result.error);
                          else await refresh();
                        }}
                      >
                        {decision}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <input className="mf-input mt-3 max-w-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note applied to the next decision" />
          </section>
          <section>
            <h2 className="font-bold">Partners</h2>
            <ul className="mt-2 space-y-2">
              {partners.map((partner) => (
                <li key={partner.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-card px-3 py-3 text-sm">
                  <span>
                    {partner.name} · {partner.status}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="mf-btn mf-ink" onClick={async () => {
                      const result = await setPartnerStatus({ data: { id: partner.id, status: "active" } });
                      if (!result.ok) setError(result.error);
                      else await refresh();
                    }}>
                      Activate
                    </button>
                    <button type="button" className="mf-btn mf-ghost" onClick={async () => {
                      const result = await setPartnerStatus({ data: { id: partner.id, status: "suspended" } });
                      if (!result.ok) setError(result.error);
                      else await refresh();
                    }}>
                      Suspend
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-bold">Missions</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {queue.missions.map((row) => (
                <li key={row.id} className="rounded-md border border-line bg-card p-3">
                  <p>
                    {row.name} · {row.status}
                  </p>
                  <a className="underline" href={row.proofUrl}>{row.proofUrl}</a>
                  <div className="mt-2 flex gap-2">
                    {["accepted", "rejected"].map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        className="mf-btn mf-ghost"
                        onClick={async () => {
                          const result = await moderateMission({ data: { id: row.id, decision, note } });
                          if (!result.ok) setError(result.error);
                          else await refresh();
                        }}
                      >
                        {decision}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-bold">Abuse reports</h2>
            {queue.reports.length === 0 ? <p className="mt-2 text-sm text-mute">No reports.</p> : null}
            <ul className="mt-2 space-y-2 text-sm">
              {queue.reports.map((row) => (
                <li key={row.id} className="rounded-md border border-line bg-card px-3 py-2">
                  {row.campaignId}: {row.reason}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-bold">Activity</h2>
            <ul className="mt-2 space-y-1 font-mono text-xs text-mute">
              {queue.logs.map((row, index) => (
                <li key={`${row.action}-${index}`}>
                  {row.createdAt} {row.action} {row.target ?? ""} {row.detail ?? ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
