import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Wordmark } from "@/components/memeforge/shell";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4">
      <div className="w-full max-w-sm space-y-4">
        <Wordmark />
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="text-sm text-mute">
          Google or X. Your wallet is connected later, only to sign a mainnet or devnet memo. DYNamiQ does not take a payment. Mainnet still charges a small network fee.
        </p>
        {authEnabled ? (
          GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => signIn(provider.providerId, { callbackURL: "/campaigns" })}
              className="mf-btn mf-ink w-full"
            >
              Continue with {provider.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-mute">Sign-in is disabled.</p>
        )}
        <Link to="/" className="block text-sm text-mute">
          Back to the desk
        </Link>
      </div>
    </main>
  );
}
