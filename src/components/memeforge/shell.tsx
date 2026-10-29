import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Flag, Menu, Radio, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { SignInGate, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const PRIMARY = [
  { to: "/lookup", label: "Verify", icon: Search },
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/campaigns", label: "Campaigns", icon: Flag },
  { to: "/network", label: "Network", icon: Radio },
] as const;

const MORE = [
  { to: "/analytics", label: "Analytics" },
  { to: "/trends", label: "Trends" },
  { to: "/missions", label: "Missions" },
  { to: "/admin", label: "Operator" },
] as const;

export function inputClassName() {
  return "mf-input";
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-mute">{label}</span>
      {children}
    </label>
  );
}

export function Notice({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "bad" }) {
  return (
    <p
      className={
        tone === "bad"
          ? "rounded-md border border-stamp/40 bg-card px-3 py-2 text-sm text-stamp"
          : "rounded-md border border-line bg-card px-3 py-2 text-sm text-mute"
      }
    >
      {children}
    </p>
  );
}

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div className="h-10 w-24 animate-pulse rounded-md bg-line" />;
  if (!user) {
    return (
      <Link to="/login" className="mf-btn mf-ink text-sm">
        Sign in
      </Link>
    );
  }
  return <UserButton />;
}

export function Wordmark() {
  return (
    <Link to="/" className="leading-none">
      <span className="block text-xs font-medium tracking-widest text-mute">DYNAMIQ</span>
      <span className="block text-lg font-bold">MemeForge</span>
    </Link>
  );
}

function NavLinks({ onDone }: { onDone?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex flex-col gap-1">
      {PRIMARY.map((item) => {
        const Icon = item.icon;
        const on = path === item.to || path.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onDone}
            className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${on ? "bg-ink text-paper" : "text-ink"}`}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
      <p className="px-3 pt-4 text-xs tracking-widest text-mute">MORE</p>
      {MORE.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onDone}
          className={`flex min-h-11 items-center rounded-md px-3 text-sm ${path === item.to ? "bg-ink text-paper" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <Wordmark />
        <div className="flex items-center gap-2">
          <AuthSlot />
          <button type="button" className="mf-btn mf-ghost md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <Menu className="size-4" />
          </button>
        </div>
      </header>
      {open ? (
        <div className="border-b border-line bg-card px-4 py-3 md:hidden">
          <NavLinks onDone={() => setOpen(false)} />
        </div>
      ) : null}
      <div className="mx-auto grid w-full max-w-6xl md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-line px-3 py-6 md:block">
          <NavLinks />
        </aside>
        <main className="px-4 py-6 pb-8">{children}</main>
      </div>
    </div>
  );
}

export function Gate({ children }: { children: React.ReactNode }) {
  return (
    <SignInGate
      fallback={
        <div className="space-y-3 rounded-md border border-line bg-card p-5">
          <h2 className="text-xl font-bold">Sign in to use this desk</h2>
          <p className="text-sm text-mute">Campaigns, creatives, and wallet proofs are tied to your account.</p>
          <Link to="/login" className="mf-btn mf-stamp">
            Go to sign in
          </Link>
        </div>
      }
    >
      {children}
    </SignInGate>
  );
}

export function PageTitle({ kicker, title, lede }: { kicker: string; title: string; lede: string }) {
  return (
    <header className="mb-6 max-w-2xl">
      <p className="text-xs font-medium tracking-widest text-stamp">{kicker}</p>
      <h1 className="mt-1 text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-mute">{lede}</p>
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-card p-4">
      <p className="text-xs tracking-widest text-mute">{label}</p>
      <p className="mt-2 font-mono text-2xl font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-mute">{hint}</p>
    </div>
  );
}

export function chartIcon() {
  return BarChart3;
}
