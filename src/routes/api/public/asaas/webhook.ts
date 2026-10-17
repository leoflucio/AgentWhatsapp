import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Webhook de cobranças do Asaas (assinaturas do agente). O Asaas manda o token
// configurado no painel no cabeçalho `asaas-access-token` (ASAAS_WEBHOOK_TOKEN).
// O plano só muda quando o pagamento é confirmado aqui.
function validToken(received: string | null): boolean {
  const expected = (process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/asaas/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!validToken(request.headers.get("asaas-access-token"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: { event?: string; payment?: { id: string } } | null = null;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: true });
        }
        if (!body?.event || !body.payment?.id) return Response.json({ ok: true });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleAsaasEvent } = await import("@/lib/billing.server");
        try {
          const r = await handleAsaasEvent(supabaseAdmin as any, body.event, body.payment); // eslint-disable-line @typescript-eslint/no-explicit-any
          return Response.json(r);
        } catch (e) {
          // Erro do banco: 500 para o Asaas tentar de novo depois.
          console.error("[cobrança] webhook falhou", e instanceof Error ? e.message : e);
          return new Response("Erro", { status: 500 });
        }
      },
    },
  },
});
