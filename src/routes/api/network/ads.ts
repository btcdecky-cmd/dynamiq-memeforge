import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-dynamiq-key",
};

export const Route = createFileRoute("/api/network/ads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { handlePartnerAds } = await import("@/lib/memeforge/serve.server");
        return handlePartnerAds(request);
      },
    },
  },
});
