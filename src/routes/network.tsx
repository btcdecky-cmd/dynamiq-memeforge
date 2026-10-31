import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Field, Notice, PageTitle } from "@/components/memeforge/shell";
import { SignInGate } from "@/lib/auth/gates";
import { createPartner, listPartners } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/network")({ component: NetworkPage });

type Ad = {
  id: string;
  headline: string;
  body: string;
  cta: string;
  image: string | null;
  onchainVerified: boolean;
  onchainCluster: "mainnet" | "devnet" | null;
  symbol: string | null;
};

function NetworkPage() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [meta, setMeta] = useState<string>("");
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [partners, setPartners] = useState<Awaited<ReturnType<typeof listPartners>>>([]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function loadSlot(record: boolean) {
    setError(null);
    const res = await fetch(`/api/network/property?slot=banner&record=${record ? "1" : "0"}`);
    const body = (await res.json()) as { ads?: Ad[]; disclaimer?: string; error?: string; recorded?: boolean };
    if (!res.ok) {
      setError(body.error ?? "Slot failed");
      setAds([]);
      return;
    }
    setAds(body.ads ?? []);
    setMeta(body.disclaimer ?? "");
    setRecorded(Boolean(body.recorded));
  }

  useEffect(() => {
    loadSlot(false).catch(() => setError("Could not reach the property slot"));
  }, []);

  async function refreshPartners() {
    try {
      setPartners(await listPartners());
    } catch {
      setPartners([]);
    }
  }

  const ad = ads?.[0];
  const snippet = apiKey
    ? `<script src="${origin}/widget.js" data-key="${apiKey}" data-slot="banner" async></script>`
    : "";

  return (
    <AppShell>
      <PageTitle
        kicker="AD NETWORK"
        title="Where ads actually show"
        lede="This page is a DYNamiQ property. Approved partners get a key and the widget. Campaigns do not appear on random Solana marketplaces."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-card p-4">
          <p className="text-xs tracking-widest text-stamp">PROPERTY SLOT</p>
          {error ? <p className="mt-3 text-sm text-stamp">{error}</p> : null}
          {ads && ads.length === 0 ? <p className="mt-3 text-sm text-mute">No live, approved campaigns in window. This is empty on purpose.</p> : null}
          {ad ? (
            <article className="mt-3">
              {ad.image ? <img src={ad.image} alt="" className="mb-3 w-full rounded-md" /> : null}
              <h2 className="text-2xl font-bold">{ad.headline}</h2>
              <p className="mt-2 text-mute">{ad.body}</p>
              <a className="mf-btn mf-stamp mt-3" href={`/api/network/click?surface=property&campaign=${ad.id}&slot=banner`}>
                {ad.cta}
              </a>
              <p className="mt-3 text-xs text-mute">
                {ad.symbol ? `$${ad.symbol}. ` : ""}
                {ad.onchainVerified
                  ? `${ad.onchainCluster === "mainnet" ? "Mainnet" : "Devnet"} memo verified.`
                  : "No memo verified yet."}{" "}
                Counts are off-chain.
              </p>
            </article>
          ) : null}
          <button type="button" className="mf-btn mf-ink mt-4" onClick={() => loadSlot(true)}>
            Load slot and record impressions
          </button>
          {recorded ? <p className="mt-2 text-xs text-mute">{meta} This load wrote one impression per ad shown.</p> : null}
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Partner key</h2>
          <p className="text-sm text-mute">
            Keys start pending. An operator activates them. The plaintext key is shown once. External sites can call
            <span className="font-mono"> GET /api/network/ads </span>
            with header <span className="font-mono">x-dynamiq-key</span>.
          </p>
          <SignInGate
            fallback={
              <Notice>Sign in to request a partner key.</Notice>
            }
          >
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                const result = await createPartner({ data: { name, siteUrl } });
                if (!result.ok) setError(result.error);
                else {
                  setApiKey(result.apiKey);
                  await refreshPartners();
                }
              }}
            >
              <Field label="Site name">
                <input className="mf-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="https site">
                <input className="mf-input" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} required />
              </Field>
              <button className="mf-btn mf-stamp" type="submit">
                Request key
              </button>
            </form>
            {apiKey ? (
              <Notice>
                Copy this key now. It is not shown again. {apiKey}
              </Notice>
            ) : null}
            {snippet ? <pre className="overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs text-paper">{snippet}</pre> : null}
            <PartnerList partners={partners} onOpen={refreshPartners} />
          </SignInGate>
        </section>
      </div>
    </AppShell>
  );
}

function PartnerList({
  partners,
  onOpen,
}: {
  partners: Awaited<ReturnType<typeof listPartners>>;
  onOpen: () => void;
}) {
  useEffect(() => {
    onOpen();
  }, []);
  if (partners.length === 0) return <p className="text-sm text-mute">No partner keys yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-card text-sm">
      {partners.map((partner) => (
        <li key={partner.id} className="px-3 py-3">
          <span className="font-medium">{partner.name}</span>
          <span className="ml-2 text-xs tracking-widest text-mute">{partner.status}</span>
          <span className="mt-1 block font-mono text-xs text-mute">{partner.prefix}…</span>
        </li>
      ))}
    </ul>
  );
}
