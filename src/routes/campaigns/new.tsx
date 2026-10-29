import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Field, Gate, Notice, PageTitle } from "@/components/memeforge/shell";
import { CHANNELS } from "@/lib/memeforge/core";
import { createCampaign, listCreatives } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/campaigns/new")({ component: NewPage });

const SLOTS = ["banner", "sidebar", "inline"];

function NewPage() {
  return (
    <AppShell>
      <Gate>
        <NewCampaign />
      </Gate>
    </AppShell>
  );
}

function NewCampaign() {
  const navigate = useNavigate();
  const [creatives, setCreatives] = useState<Awaited<ReturnType<typeof listCreatives>>>([]);
  const [channels, setChannels] = useState<string[]>(["website"]);
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mint: "",
    headline: "",
    body: "",
    cta: "Read the mint",
    destinationUrl: "",
    creativeId: "",
    startsAt: "",
    endsAt: "",
    note: "",
  });

  useEffect(() => {
    listCreatives()
      .then(setCreatives)
      .catch(() => setCreatives([]));
  }, []);

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createCampaign({
        data: {
          ...form,
          channels,
          slots,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        },
      });
      if (!result.ok) setError(result.error);
      else await navigate({ to: "/campaigns/$campaignId", params: { campaignId: result.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle
        kicker="BUILDER"
        title="New campaign"
        lede="Channels are a plan for where you intend to talk. MemeForge does not auto-post to X, Telegram, Discord, or Instagram."
      />
      <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
        <Field label="Campaign name">
          <input className="mf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Verified mint">
          <input className="mf-input font-mono text-sm" value={form.mint} onChange={(e) => setForm({ ...form, mint: e.target.value })} required />
        </Field>
        <Field label="Creative">
          <select className="mf-input" value={form.creativeId} onChange={(e) => setForm({ ...form, creativeId: e.target.value })} required>
            <option value="">Choose one</option>
            {creatives.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.kind})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Headline">
          <input className="mf-input" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} required />
        </Field>
        <Field label="Body">
          <textarea className="mf-input min-h-28" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
        </Field>
        <Field label="Button label">
          <input className="mf-input" value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} required />
        </Field>
        <Field label="https destination (optional)">
          <input className="mf-input" value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} placeholder="https://" />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-mute">Channel plan</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                className={`mf-btn ${channels.includes(channel) ? "mf-ink" : "mf-ghost"}`}
                onClick={() => toggle(channels, channel, setChannels)}
              >
                {channel}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-mute">Slots (empty means any)</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`mf-btn ${slots.includes(slot) ? "mf-ink" : "mf-ghost"}`}
                onClick={() => toggle(slots, slot, setSlots)}
              >
                {slot}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Starts (optional)">
            <input className="mf-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </Field>
          <Field label="Ends (optional)">
            <input className="mf-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </Field>
        </div>
        <Field label="Targeting note">
          <input className="mf-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <button className="mf-btn mf-stamp" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save draft"}
        </button>
      </form>
    </div>
  );
}
