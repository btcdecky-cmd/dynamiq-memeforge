import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/network/property")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleProperty } = await import("@/lib/memeforge/serve.server");
        return handleProperty(request);
      },
    },
  },
});
