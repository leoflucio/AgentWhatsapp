/* eslint-disable @typescript-eslint/no-explicit-any */
// Conexão do número de WhatsApp por QR Code no servidor Evolution do app.
// A conta guarda só o token DA SUA instância, nunca a chave mestra do servidor.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const connectionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hostConfigured, evo } = await import("@/lib/evolution.server");
    const { ensureAccount } = await import("@/lib/account.server");
    const { managedInstanceName, stateFromEvolution } = await import("@/lib/whatsapp-managed");
    if (!hostConfigured()) return { available: false, state: "desconectado" as const };
    const account = await ensureAccount(context.userId);
    const r = await evo(`/instance/connectionState/${managedInstanceName(account.id)}`);
    const state = r.ok
      ? stateFromEvolution((r.json as { instance?: { state?: string } } | null)?.instance?.state)
      : ("desconectado" as const);
    return { available: true, state };
  });

/**
 * Conecta (ou reconecta) o WhatsApp da conta: cria a instância no servidor se
 * ainda não existir, liga o webhook do agente e devolve o QR Code.
 */
export const connectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hostConfigured, evo, ensureAgentWebhook } = await import("@/lib/evolution.server");
    if (!hostConfigured()) throw new Error("O servidor de WhatsApp ainda não foi configurado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { ensureAccount } = await import("@/lib/account.server");
    const { instanceTokenFrom, managedInstanceName, qrFrom } =
      await import("@/lib/whatsapp-managed");
    const account = await ensureAccount(context.userId);
    const name = managedInstanceName(account.id);
    const { data: current } = await admin
      .from("whatsapp_connections")
      .select("instance_token")
      .eq("account_id", account.id)
      .maybeSingle();
    const savedToken = (current?.instance_token as string | null) ?? null;

    const state = await evo(`/instance/connectionState/${name}`);
    let token: string | null = null;
    let qrSource: unknown = null;
    if (state.ok && savedToken) {
      // Já existe e temos o token: só pede um QR novo (ou já está conectado).
      const s = (state.json as { instance?: { state?: string } } | null)?.instance?.state;
      if (s === "open") {
        await ensureAgentWebhook(name);
        return { state: "conectado" as const, qr: null, pairingCode: null };
      }
      const c = await evo(`/instance/connect/${name}`);
      if (!c.ok) throw new Error("Não foi possível gerar o QR Code. Tente de novo.");
      qrSource = c.json;
      token = savedToken;
    } else {
      // Não existe, ou existe sem o token salvo: recria do zero.
      if (state.ok) await evo(`/instance/delete/${name}`, { method: "DELETE" });
      const created = await evo("/instance/create", {
        method: "POST",
        body: { instanceName: name, integration: "WHATSAPP-BAILEYS", qrcode: true },
      });
      if (!created.ok) throw new Error("Não foi possível criar a conexão no servidor de WhatsApp.");
      token = instanceTokenFrom(created.json);
      if (!token) throw new Error("O servidor de WhatsApp não devolveu a chave da conexão.");
      qrSource = created.json;
    }

    const { error } = await admin.from("whatsapp_connections").upsert(
      {
        account_id: account.id,
        instance: name,
        instance_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
    if (error) throw new Error(error.message);
    // As mensagens recebidas vão para o agente; ligado ou não, ele decide se responde.
    await ensureAgentWebhook(name);

    const { qr, pairingCode } = qrFrom(qrSource);
    return { state: "aguardando_qr" as const, qr, pairingCode };
  });

/** Desconecta o número e apaga a instância da conta no servidor. */
export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hostConfigured, evo } = await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureAccount } = await import("@/lib/account.server");
    const { managedInstanceName } = await import("@/lib/whatsapp-managed");
    const account = await ensureAccount(context.userId);
    const name = managedInstanceName(account.id);
    if (hostConfigured()) {
      await evo(`/instance/logout/${name}`, { method: "DELETE" });
      await evo(`/instance/delete/${name}`, { method: "DELETE" });
    }
    const { error } = await (supabaseAdmin as any)
      .from("whatsapp_connections")
      .delete()
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
