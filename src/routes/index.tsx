import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthSlot, Wordmark } from "@/components/memeforge/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Wordmark />
        <AuthSlot />
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8 md:grid-cols-[1.2fr_0.8fr] md:pt-16">
        <section>
          <p className="text-xs font-medium tracking-widest text-stamp">SOLANA ADVERTISING DESK</p>
          <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight md:text-6xl">
            Stamp a token ad. Serve it only where you were invited.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-mute">
            DYNamiQ MemeForge checks a mint on Solana, helps you make the creative, and hands approved
            campaigns to this site and to partners who installed the widget. It does not buy reach, escrow
            funds, or post to X for you.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/lookup" className="mf-btn mf-stamp">
              Verify a mint
            </Link>
            <Link to="/network" className="mf-btn mf-ghost">
              See the ad slot
            </Link>
          </div>
        </section>
        <aside className="space-y-3 rounded-md border border-line bg-ink p-5 text-paper">
          <p className="text-xs tracking-widest text-line">WHAT IS REAL</p>
          <ul className="space-y-3 text-sm">
            <li>Mint supply, decimals, and authorities come from mainnet RPC. If the account is missing, we stop.</li>
            <li>Price and volume, when shown, are DexScreener. They are labeled off-chain.</li>
            <li>Impressions and clicks start at zero and only move when a slot actually loads or is clicked.</li>
            <li>Devnet registration is a signed SPL Memo. It is not a claim that a custom program is already deployed.</li>
          </ul>
        </aside>
      </main>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-3">
        {[
          ["01 Verify", "Paste a mint. We read the token account and, if a pair exists, the market snapshot."],
          ["02 Forge", "Compose a poster on the canvas, or ask for a draft concept. You save the creative."],
          ["03 Serve", "An operator approves it. The property slot and active partner keys can then request it."],
        ].map(([title, copy]) => (
          <article key={title} className="rounded-md border border-line bg-card p-5">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-2 text-sm text-mute">{copy}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
