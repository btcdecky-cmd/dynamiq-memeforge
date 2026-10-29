import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, Gate, PageTitle, Stat } from "@/components/memeforge/shell";
import { loadAnalytics } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  return (
    <AppShell>
      <Gate>
        <Analytics />
      </Gate>
    </AppShell>
  );
}

function Analytics() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAnalytics>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadAnalytics()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Analytics failed"));
  }, []);
  return (
    <div>
      <PageTitle
        kicker="OFF-CHAIN"
        title="Recorded activity"
        lede="These numbers are events this app stored. They are not chain analytics, and they are not estimates. Zero means nobody has loaded a slot yet."
      />
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      {data ? (
        <>
          <p className="mb-4 text-xs text-mute">
            {data.source} Scope: {data.scope}.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="IMPRESSIONS" value={String(data.impressions)} hint="Slot loads with record=1" />
            <Stat label="CLICKS" value={String(data.clicks)} hint="Clicks through the recorder" />
            <Stat label="SUBMISSIONS" value={String(data.submissions)} hint="Mission links filed" />
          </div>
          {data.days.length === 0 ? (
            <p className="mt-6 text-sm text-mute">No events in the last 14 days, so there is no chart.</p>
          ) : (
            <div className="mt-6 h-64 rounded-md border border-line bg-card p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days}>
                  <CartesianGrid stroke="#e4dccf" vertical={false} />
                  <XAxis dataKey="day" stroke="#6f6a60" fontSize={12} />
                  <YAxis stroke="#6f6a60" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="impressions" fill="#1c1a16" />
                  <Bar dataKey="clicks" fill="#d63a2f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-6 divide-y divide-line rounded-md border border-line bg-card">
            {data.campaigns.length === 0 ? <li className="px-3 py-3 text-sm text-mute">No campaign has recorded events.</li> : null}
            {data.campaigns.map((row) => (
              <li key={row.id} className="flex items-center justify-between px-3 py-3 text-sm">
                <span className="font-medium">{row.name}</span>
                <span className="font-mono tabular-nums text-mute">
                  {row.impressions} imp · {row.clicks} clk
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
