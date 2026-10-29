import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Field, Gate, Notice, PageTitle } from "@/components/memeforge/shell";
import { draftCopy, generateImage, listCreatives, saveCreative } from "@/lib/memeforge/functions";

export const Route = createFileRoute("/studio")({ component: StudioPage });

function StudioPage() {
  return (
    <AppShell>
      <Gate>
        <Studio />
      </Gate>
    </AppShell>
  );
}

function Studio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [title, setTitle] = useState("Mint poster");
  const [kicker, setKicker] = useState("ON SOLANA");
  const [headline, setHeadline] = useState("Read the mint. Then talk.");
  const [foot, setFoot] = useState("DYNamiQ partners only");
  const [mint, setMint] = useState("");
  const [angle, setAngle] = useState("");
  const [prompt, setPrompt] = useState("Bold newsprint poster, red stamp, one short slogan, no logos");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<Array<{ headline: string; body: string; cta: string; visual: string }>>([]);
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof listCreatives>>>([]);

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = 1080;
    const h = 1080;
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1c1a16";
    ctx.lineWidth = 18;
    ctx.strokeRect(36, 36, w - 72, h - 72);
    ctx.fillStyle = "#d63a2f";
    ctx.fillRect(72, 84, 280, 54);
    ctx.fillStyle = "#fff8f4";
    ctx.font = "600 28px sans-serif";
    ctx.fillText(kicker.slice(0, 22), 92, 120);
    ctx.fillStyle = "#1c1a16";
    ctx.font = "700 84px sans-serif";
    wrap(ctx, headline, 72, 280, 920, 96);
    ctx.font = "500 32px sans-serif";
    ctx.fillStyle = "#6f6a60";
    ctx.fillText(foot.slice(0, 48), 72, 960);
  }

  useEffect(() => {
    paint();
  }, [kicker, headline, foot]);

  async function refresh() {
    setSaved(await listCreatives());
  }

  useEffect(() => {
    refresh().catch(() => setSaved([]));
  }, []);

  async function savePoster() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy("save");
    setError(null);
    try {
      const imageData = canvas.toDataURL("image/jpeg", 0.86);
      const result = await saveCreative({
        data: { kind: "meme", title, copyText: headline, imageData, prompt: "canvas poster" },
      });
      if (!result.ok) setError(result.error);
      else {
        setNotice(`Saved creative ${result.id}. Use it in a campaign.`);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function onCopy() {
    setBusy("copy");
    setError(null);
    setNotice(null);
    try {
      const result = await draftCopy({ data: { mint, angle } });
      if (!result.ok) setError(result.error);
      else {
        setConcepts(result.concepts);
        setNotice(result.notice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setBusy(null);
    }
  }

  async function onImage() {
    setBusy("image");
    setError(null);
    try {
      const result = await generateImage({ data: { title, prompt } });
      if (!result.ok) setError(result.error);
      else {
        setNotice(`Stored generated image ${result.id}.`);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveConcept(concept: { headline: string; body: string; cta: string }) {
    setBusy("concept");
    const result = await saveCreative({
      data: {
        kind: "copy",
        title: concept.headline || title,
        copyText: `${concept.body} CTA: ${concept.cta}`,
        imageData: null,
        prompt: angle,
      },
    });
    if (!result.ok) setError(result.error);
    else {
      setNotice(`Saved copy ${result.id}.`);
      await refresh();
    }
    setBusy(null);
  }

  return (
    <div>
      <PageTitle
        kicker="MEME STUDIO"
        title="Make the creative here"
        lede="The poster is drawn in your browser. AI drafts are optional, capped, and labeled as drafts. Nothing posts itself."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <canvas ref={canvasRef} className="w-full max-w-xl rounded-md border border-line bg-card" />
          <div className="mt-4 grid max-w-xl gap-3">
            <Field label="Stamp">
              <input className="mf-input" value={kicker} onChange={(e) => setKicker(e.target.value)} />
            </Field>
            <Field label="Headline">
              <textarea className="mf-input min-h-24" value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </Field>
            <Field label="Footer">
              <input className="mf-input" value={foot} onChange={(e) => setFoot(e.target.value)} />
            </Field>
            <Field label="Title in your library">
              <input className="mf-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <button type="button" className="mf-btn mf-stamp" disabled={busy !== null} onClick={savePoster}>
              {busy === "save" ? "Saving…" : "Save poster"}
            </button>
          </div>
        </div>
        <div className="space-y-4">
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold">Draft copy</h2>
            <p className="mt-1 text-sm text-mute">Uses the name and symbol already read from chain. It will not invent a price.</p>
            <div className="mt-3 space-y-3">
              <Field label="Verified mint">
                <input className="mf-input font-mono text-xs" value={mint} onChange={(e) => setMint(e.target.value)} />
              </Field>
              <Field label="Angle">
                <input className="mf-input" value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="short, dry, no hype" />
              </Field>
              <button type="button" className="mf-btn mf-ink w-full" disabled={busy !== null} onClick={onCopy}>
                {busy === "copy" ? "Writing…" : "Draft 3 concepts"}
              </button>
            </div>
          </section>
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold">Generate a graphic</h2>
            <div className="mt-3 space-y-3">
              <Field label="Prompt">
                <textarea className="mf-input min-h-24" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </Field>
              <button type="button" className="mf-btn mf-ghost w-full" disabled={busy !== null} onClick={onImage}>
                {busy === "image" ? "Generating…" : "Generate one image"}
              </button>
            </div>
          </section>
        </div>
      </div>
      {error ? <div className="mt-4 max-w-xl"><Notice tone="bad">{error}</Notice></div> : null}
      {notice ? <div className="mt-4 max-w-xl"><Notice>{notice}</Notice></div> : null}
      {concepts.length > 0 ? (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {concepts.map((concept) => (
            <article key={concept.headline} className="rounded-md border border-line bg-card p-4">
              <h3 className="font-bold">{concept.headline}</h3>
              <p className="mt-2 text-sm text-mute">{concept.body}</p>
              <p className="mt-2 text-xs tracking-widest text-stamp">{concept.cta}</p>
              <p className="mt-2 text-xs text-mute">{concept.visual}</p>
              <button type="button" className="mf-btn mf-ghost mt-3" onClick={() => saveConcept(concept)}>
                Save copy
              </button>
            </article>
          ))}
        </div>
      ) : null}
      <section className="mt-8">
        <h2 className="text-sm font-bold tracking-widest text-mute">LIBRARY</h2>
        <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
          {saved.length === 0 ? <li className="px-3 py-3 text-sm text-mute">No creatives saved yet.</li> : null}
          {saved.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
              <span>
                <span className="font-medium">{item.title}</span>
                <span className="ml-2 text-mute">{item.kind}</span>
              </span>
              <span className="text-xs tracking-widest text-mute">{item.reviewStatus}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  const words = text.split(/\s+/);
  let row = "";
  let yy = y;
  for (const word of words) {
    const trial = row ? `${row} ${word}` : word;
    if (ctx.measureText(trial).width > max) {
      ctx.fillText(row, x, yy);
      row = word;
      yy += line;
    } else {
      row = trial;
    }
  }
  if (row) ctx.fillText(row, x, yy);
}
