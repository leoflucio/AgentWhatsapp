/* eslint-disable @typescript-eslint/no-explicit-any */
// Tela Planos: situação da assinatura, assinar/trocar de plano e cancelar.
// O plano só vale quando o pagamento é confirmado (webhook do Asaas).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN_IDS } from "@/lib/billing-rules";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

export const getBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { resolveAccess, isAdminEmail, userEmail } = await import("@/lib/billing.server");
    const { access, sub, used } = await resolveAccess(admin, account.id);
    const { asaasConfigured, openInvoiceUrl } = await import("@/lib/asaas.server");
    const pendingInvoiceUrl =
      sub?.pending_subscription_id && asaasConfigured()
        ? await openInvoiceUrl(sub.pending_subscription_id)
        : null;
    return {
      kind: access.kind,
      plan: access.plan,
      limit: access.limit,
      used,
      trialEndsAt: access.trialEndsAt,
      status: sub?.status ?? null,
      periodEnd: sub?.current_period_end ?? null,
      pendingPlan: sub?.pending_plan ?? null,
      pendingInvoiceUrl,
      hasCustomer: Boolean(sub?.asaas_customer_id),
      isAdmin: isAdminEmail(await userEmail(admin, context.userId)),
      billingAvailable: asaasConfigured(),
    };
  });

export const checkoutPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        plan: z.enum(PLAN_IDS as [string, ...string[]]),
        name: z.string().trim().max(120).optional(),
        cpfCnpj: z.string().trim().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { PLANS, externalReference, isPlan, planCheckout, validCpfCnpj } =
      await import("@/lib/billing-rules");
    const { loadSubscription, isAdminEmail, userEmail } = await import("@/lib/billing.server");
    const { todayLocalISO } = await import("@/lib/agenda-time");
    const plan = data.plan;
    if (!isPlan(plan)) throw new Error("Plano inválido.");
    const email = await userEmail(admin, context.userId);
    if (isAdminEmail(email)) throw new Error("Sua conta é a do dono do app e não paga plano.");

    const sub = await loadSubscription(admin, account.id);
    const today = todayLocalISO();
    const decision = planCheckout(sub, plan, today);
    if (decision.kind === "same") throw new Error("Este já é o seu plano atual.");

    const asaas = await import("@/lib/asaas.server");
    // Pendente do mesmo plano com fatura em aberto: reaproveita.
    if (sub?.pending_subscription_id && sub.pending_plan === plan) {
      const url = await asaas.openInvoiceUrl(sub.pending_subscription_id);
      if (url) return { invoiceUrl: url, scheduled: false as const };
    }

    // Cliente no Asaas (pede CPF/CNPJ na primeira vez).
    let customerId = sub?.asaas_customer_id ?? null;
    if (!customerId) {
      const doc = (data.cpfCnpj ?? "").replace(/\D/g, "");
      if (!validCpfCnpj(doc)) throw new Error("Informe um CPF ou CNPJ válido para a cobrança.");
      const customer = await asaas.createCustomer({
        name: data.name || account.name || email || "Cliente",
        email: email ?? undefined,
        cpfCnpj: doc,
        externalReference: account.id,
      });
      customerId = customer.id;
      const { error } = await admin.from("subscriptions").upsert(
        {
          account_id: account.id,
          asaas_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      );
      if (error) throw new Error(error.message);
    }

    const info = PLANS[plan];
    const created = await asaas.createSubscription({
      customer: customerId,
      value: info.price,
      nextDueDate: decision.nextDueDate,
      description: `Agente de WhatsApp ${info.label} (${info.replies.toLocaleString("pt-BR")} respostas/mês)`,
      externalReference: externalReference(account.id, plan),
    });

    const oldPending = sub?.pending_subscription_id ?? null;
    const patch: Record<string, unknown> = {
      pending_plan: plan,
      pending_subscription_id: created.id,
      updated_at: new Date().toISOString(),
    };
    if (decision.cancelCurrentNow) {
      patch.status = "canceled";
      patch.cancel_requested_at = new Date().toISOString();
    }
    const { error } = await admin.from("subscriptions").update(patch).eq("account_id", account.id);
    if (error) {
      await asaas.cancelSubscription(created.id).catch(() => undefined);
      throw new Error(`Falha ao salvar o plano: ${error.message}`);
    }
    // Não cobra em dobro: a pendente anterior e, no plano menor, a renovação do atual.
    if (oldPending && oldPending !== created.id) {
      await asaas
        .cancelSubscription(oldPending)
        .catch((e: unknown) =>
          console.error("[cobrança] falha ao cancelar pendente anterior", oldPending, e),
        );
    }
    if (decision.cancelCurrentNow && sub?.asaas_subscription_id) {
      await asaas
        .cancelSubscription(sub.asaas_subscription_id)
        .catch((e: unknown) =>
          console.error("[cobrança] falha ao parar a renovação do plano atual", e),
        );
    }

    if (decision.nextDueDate > today) {
      return { invoiceUrl: null, scheduled: true as const, effectiveDate: decision.nextDueDate };
    }
    const url = await asaas.openInvoiceUrl(created.id);
    if (!url) throw new Error("Fatura ainda não gerada. Tente de novo em instantes.");
    return { invoiceUrl: url, scheduled: false as const };
  });

/** Cancela a renovação. O agente continua até o fim do período já pago. */
export const cancelPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { loadSubscription } = await import("@/lib/billing.server");
    const sub = await loadSubscription(admin, account.id);
    if (!sub) return { ok: true, periodEnd: null };
    const { cancelSubscription } = await import("@/lib/asaas.server");
    for (const id of [sub.asaas_subscription_id, sub.pending_subscription_id]) {
      if (id) await cancelSubscription(id);
    }
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: sub.status === "active" || sub.status === "past_due" ? "canceled" : sub.status,
        pending_plan: null,
        pending_subscription_id: null,
        cancel_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true, periodEnd: sub.current_period_end };
  });
