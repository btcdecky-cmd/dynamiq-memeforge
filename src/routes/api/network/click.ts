import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/network/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleClick } = await import("@/lib/memeforge/serve.server");
        return handleClick(request);
      },
    },
  },
});
