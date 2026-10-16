import { createFileRoute } from "@tanstack/react-router";

// Webhook do agente de WhatsApp (instâncias conectadas por QR Code no servidor
// Evolution do app). A URL de cada instância leva uma assinatura (?t=) derivada
// da chave do servidor, configurada pelo próprio app em ensureAgentWebhook.
// Sempre responde 200 para a Evolution não reenviar em loop.
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const instance = url.searchParams.get("i") ?? "";
        const token = url.searchParams.get("t") ?? "";
        const { validWebhookToken } = await import("@/lib/evolution.server");
        if (!validWebhookToken(instance, token)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ok: true });
        }
        const { handleAgentWebhook } = await import("@/lib/agent.server");
        await handleAgentWebhook(instance, payload);
        return Response.json({ ok: true });
      },
    },
  },
});
