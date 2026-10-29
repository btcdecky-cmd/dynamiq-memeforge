import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Field, Gate, Notice, PageTitle } from "@/components/memeforge/shell";
import { confirmChain, getCampaign, prepareChain, reportAbuse, setCampaignStatus, submitCampaign } from "@/lib/memeforge/functions";
import { connectWallet, sendMemo } from "@/lib/memeforge/wallet";

export const Route = createFileRoute("/campaigns/$campaignId")({ component: DetailPage });

function DetailPage() {
  const { campaignId } = Route.useParams();
  return (
    <AppShell>
      <Gate>
        <Detail id={campaignId} />
      </Gate>
    </AppShell>
  );
}

function Detail({ id }: { id: string }) {
  const [data, setData] = useState<Extract<Awaited<ReturnType<typeof getCampaign>>, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [signature, setSignature] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await getCampaign({ data: { id } });
    if (!result.ok) {
      setError(result.error);
      setData(null);
    } else {
      setData(result);
      if (result.campaign.onchainMemo) {
        const found = result.campaign.onchainMemo.split("|").find((part) => part.startsWith("owner="));
        if (found) setOwner(found.slice(6));
      }
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [id]);

  async function run(task: () => Promise<{ ok: boolean; error?: string } | void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await task();
      if (result && "ok" in result && !result.ok) setError(result.error ?? "Failed");
      else setNotice("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return error ? <Notice tone="bad">{error}</Notice> : <p className="text-mute">Loading campaign…</p>;
  }
  const campaign = data.campaign;
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle kicker={campaign.status.toUpperCase()} title={campaign.name} lede={campaign.headline} />
      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-md border border-line bg-card p-4 text-sm">
          <p className="text-xs tracking-widest text-mute">CREATIVE</p>
          <p className="mt-2">{campaign.body}</p>
          <p className="mt-2 font-medium">{campaign.cta}</p>
          {campaign.image ? <img src={campaign.image} alt="" className="mt-3 w-full rounded-md" /> : null}
          <p className="mt-3 text-xs text-mute">Review: {campaign.reviewStatus ?? "none"}</p>
        </article>
        <article className="rounded-md border border-line bg-card p-4 text-sm">
          <p className="text-xs tracking-widest text-stamp">CHAIN VS CHAIN-ADJACENT</p>
          <p className="mt-2 font-mono text-xs break-all">{campaign.mint}</p>
          <p className="mt-2">{campaign.tokenName ?? "No DexScreener name cached"} {campaign.symbol ? `($${campaign.symbol})` : ""}</p>
          <p className="mt-2 text-mute">Channels planned: {campaign.channels.join(", ") || "none"}</p>
          <p className="mt-2">
            Devnet memo: {campaign.onchainVerifiedAt ? `verified ${campaign.onchainVerifiedAt}` : "not verified"}
          </p>
          <p className="mt-2 text-xs text-mute">
            A verified memo proves this wallet signed the campaign id. It does not place the ad on other sites.
          </p>
          {campaign.reviewNote ? <p className="mt-2">Operator note: {campaign.reviewNote}</p> : null}
        </article>
      </div>
      {campaign.owned ? (
        <div className="flex flex-wrap gap-2">
          {campaign.status === "draft" || campaign.status === "rejected" ? (
            <button type="button" className="mf-btn mf-stamp" disabled={busy} onClick={() => run(() => submitCampaign({ data: { id } }))}>
              Submit for review
            </button>
          ) : null}
          {campaign.status === "live" ? (
            <button type="button" className="mf-btn mf-ghost" disabled={busy} onClick={() => run(() => setCampaignStatus({ data: { id, status: "paused" } }))}>
              Pause
            </button>
          ) : null}
          {campaign.status === "paused" ? (
            <button type="button" className="mf-btn mf-ghost" disabled={busy} onClick={() => run(() => setCampaignStatus({ data: { id, status: "draft" } }))}>
              Back to draft
            </button>
          ) : null}
        </div>
      ) : null}
      <section className="rounded-md border border-line bg-card p-4">
        <h2 className="font-bold">Register on devnet</h2>
        <p className="mt-1 text-sm text-mute">
          Prepares an SPL Memo transaction for Devnet. The Anchor program in the repo is source only until you deploy it.
          Switch the wallet to Devnet before signing. A mainnet signature will not verify.
        </p>
        <div className="mt-3 grid gap-3">
          <Field label="Advertiser wallet">
            <input className="mf-input font-mono text-xs" value={owner} onChange={(e) => setOwner(e.target.value)} spellCheck={false} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="mf-btn mf-ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const key = await connectWallet();
                  setOwner(key);
                  return { ok: true };
                })
              }
            >
              Connect wallet
            </button>
            <button
              type="button"
              className="mf-btn mf-ink"
              disabled={busy || !campaign.owned}
              onClick={() =>
                run(async () => {
                  const prepared = await prepareChain({ data: { id, owner } });
                  if (!prepared.ok) return prepared;
                  setNotice(`Memo ready on ${prepared.cluster}. Sign it next.`);
                  return { ok: true };
                })
              }
            >
              Prepare memo
            </button>
            <button
              type="button"
              className="mf-btn mf-stamp"
              disabled={busy || !campaign.onchainMemo}
              onClick={() =>
                run(async () => {
                  if (!campaign.onchainMemo) return { ok: false, error: "Prepare first." };
                  const sig = await sendMemo(campaign.onchainMemo, owner);
                  setSignature(sig);
                  return confirmChain({ data: { id, signature: sig } });
                })
              }
            >
              Sign on devnet
            </button>
          </div>
          {campaign.onchainMemo ? (
            <p className="font-mono text-xs break-all text-mute">{campaign.onchainMemo}</p>
          ) : null}
          <Field label="Or paste a devnet signature">
            <input className="mf-input font-mono text-xs" value={signature} onChange={(e) => setSignature(e.target.value)} />
          </Field>
          <button
            type="button"
            className="mf-btn mf-ghost"
            disabled={busy || !signature}
            onClick={() => run(() => confirmChain({ data: { id, signature } }))}
          >
            Verify signature
          </button>
          {campaign.onchainSignature ? (
            <a
              className="text-sm underline"
              href={`https://explorer.solana.com/tx/${campaign.onchainSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View on Solana Explorer (devnet)
            </a>
          ) : null}
        </div>
      </section>
      <section className="rounded-md border border-line bg-card p-4">
        <h2 className="font-bold">Report abuse</h2>
        <div className="mt-3 flex flex-col gap-3">
          <input className="mf-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should an operator look at?" />
          <button type="button" className="mf-btn mf-ghost" disabled={busy} onClick={() => run(() => reportAbuse({ data: { campaignId: id, reason } }))}>
            Send report
          </button>
        </div>
      </section>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
    </div>
  );
}
