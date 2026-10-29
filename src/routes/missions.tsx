import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Field, Gate, Notice, PageTitle } from "@/components/memeforge/shell";
import { listLiveCampaigns, myMissions, submitMission } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/missions")({ component: MissionsPage });

function MissionsPage() {
  return (
    <AppShell>
      <Gate>
        <Missions />
      </Gate>
    </AppShell>
  );
}

function Missions() {
  const [live, setLive] = useState<Awaited<ReturnType<typeof listLiveCampaigns>>>([]);
  const [mine, setMine] = useState<Awaited<ReturnType<typeof myMissions>>>([]);
  const [campaignId, setCampaignId] = useState("");
  const [proofUrl, setProofUrl] = useState("https://");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const [campaigns, missions] = await Promise.all([listLiveCampaigns(), myMissions()]);
    setLive(campaigns);
    setMine(missions);
    if (!campaignId && campaigns[0]) setCampaignId(campaigns[0].id);
  }

  useEffect(() => {
    refresh().catch(() => setError("Could not load missions"));
  }, []);

  return (
    <div>
      <PageTitle
        kicker="COMMUNITY"
        title="Submit work for review"
        lede="File an https link against a live campaign. An operator accepts or rejects it. Submission is not payment and not a placement guarantee."
      />
      <form
        className="grid max-w-xl gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const result = await submitMission({ data: { campaignId, proofUrl, note } });
          if (!result.ok) setError(result.error);
          else {
            setNotice("Submitted.");
            await refresh();
          }
        }}
      >
        <Field label="Live campaign">
          <select className="mf-input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {live.length === 0 ? <option value="">No live campaigns</option> : null}
            {live.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.symbol ? ` ($${row.symbol})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proof link">
          <input className="mf-input" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
        </Field>
        <Field label="Note">
          <textarea className="mf-input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button className="mf-btn mf-stamp" type="submit" disabled={live.length === 0}>
          Submit
        </button>
      </form>
      {error ? <div className="mt-3 max-w-xl"><Notice tone="bad">{error}</Notice></div> : null}
      {notice ? <div className="mt-3 max-w-xl"><Notice>{notice}</Notice></div> : null}
      <ul className="mt-6 max-w-xl divide-y divide-line rounded-md border border-line bg-card">
        {mine.length === 0 ? <li className="px-3 py-3 text-sm text-mute">You have not submitted work.</li> : null}
        {mine.map((row) => (
          <li key={row.id} className="px-3 py-3 text-sm">
            <span className="font-medium">{row.campaignName}</span>
            <span className="ml-2 text-xs tracking-widest text-mute">{row.status}</span>
            <a className="mt-1 block truncate underline" href={row.proofUrl}>
              {row.proofUrl}
            </a>
            {row.reviewNote ? <p className="text-mute">{row.reviewNote}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
