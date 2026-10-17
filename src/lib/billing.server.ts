/* eslint-disable @typescript-eslint/no-explicit-any */
// Assinatura do agente: acesso da conta, uso do mês e eventos do Asaas.
import {
  accountAccess,
  computePeriodEnd,
  decideEvent,
  monthStartBR,
  parseReference,
  type Access,
  type SubscriptionState,
} from "@/lib/billing-rules";

/** E-mails do dono do app (ADMIN_EMAILS, separados por vírgula). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.trim().toLowerCase());
}

export async function userEmail(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return (data?.user?.email as string | undefined) ?? null;
}

/** O usuário logado é o dono do app? */
export async function requireAdmin(userId: string): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  if (!isAdminEmail(await userEmail(admin, userId))) throw new Error("Acesso só do dono do app.");
  return admin;
}

export type SubscriptionRow = SubscriptionState & {
  account_id: string;
  asaas_customer_id: string | null;
  cancel_requested_at: string | null;
};

export async function loadSubscription(
  admin: any,
  accountId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar a assinatura: ${error.message}`);
  return (data as SubscriptionRow | null) ?? null;
}

/** Respostas enviadas pelo agente desde o início do mês (horário de Brasília). */
export async function repliesThisMonth(admin: any, accountId: string): Promise<number> {
  const { count, error } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("author", "agente")
    .gte("created_at", monthStartBR());
  if (error) throw new Error(`Falha ao contar respostas: ${error.message}`);
  return count ?? 0;
}

export async function resolveAccess(
  admin: any,
  accountId: string,
): Promise<{ access: Access; sub: SubscriptionRow | null; used: number }> {
  const { data: account, error } = await admin
    .from("accounts")
    .select("owner_id, created_at, blocked")
    .eq("id", accountId)
    .single();
  if (error || !account) throw new Error("Conta não encontrada.");
  const [sub, used, email] = await Promise.all([
    loadSubscription(admin, accountId),
    repliesThisMonth(admin, accountId),
    userEmail(admin, account.owner_id),
  ]);
  const access = accountAccess({
    sub,
    accountCreatedAt: account.created_at,
    blocked: Boolean(account.blocked),
    exempt: isAdminEmail(email),
  });
  return { access, sub, used };
}

type AsaasPayment = {
  id: string;
  subscription?: string | null;
  externalReference?: string | null;
  dueDate?: string | null;
};

/** Aplica um evento de cobrança do Asaas à assinatura da conta. */
export async function handleAsaasEvent(
  admin: any,
  event: string,
  payment: AsaasPayment,
): Promise<Record<string, unknown>> {
  const sub = payment.subscription ?? null;
  if (!sub) return { ok: true, ignored: "sem assinatura" };
  const { data: rows, error } = await admin
    .from("subscriptions")
    .select("*")
    .or(`asaas_subscription_id.eq.${sub},pending_subscription_id.eq.${sub}`)
    .limit(1);
  if (error) throw new Error(`consulta da assinatura falhou: ${error.message}`);
  const row = (rows ?? [])[0] as SubscriptionRow | undefined;
  if (!row) {
    return {
      ok: true,
      ignored: parseReference(payment.externalReference) ? "desconhecida" : "outra",
    };
  }

  const decision = decideEvent(row, sub, event);
  const now = new Date().toISOString();
  const update = async (patch: Record<string, unknown>) => {
    const { error: upErr } = await admin
      .from("subscriptions")
      .update({ ...patch, updated_at: now })
      .eq("account_id", row.account_id);
    if (upErr) throw new Error(`atualização da assinatura falhou: ${upErr.message}`);
  };

  if (decision === "promote_pending") {
    const periodEnd = computePeriodEnd(payment.dueDate ?? null, null);
    const previous = row.asaas_subscription_id;
    await update({
      plan: row.pending_plan,
      status: "active",
      asaas_subscription_id: sub,
      pending_plan: null,
      pending_subscription_id: null,
      cancel_requested_at: null,
      // Plano menor que começa no fim do período: não encurta o que já foi pago.
      current_period_end:
        row.current_period_end && new Date(row.current_period_end) > new Date(periodEnd)
          ? row.current_period_end
          : periodEnd,
    });
    if (previous && previous !== sub) {
      const { cancelSubscription } = await import("@/lib/asaas.server");
      await cancelSubscription(previous).catch((e: unknown) =>
        console.error("[cobrança] falha ao cancelar a assinatura anterior", previous, e),
      );
    }
  } else if (decision === "renew_current") {
    await update({
      status: row.status === "canceled" ? "canceled" : "active",
      current_period_end: computePeriodEnd(payment.dueDate ?? null, row.current_period_end),
    });
  } else if (decision === "past_due") {
    if (row.status === "active") await update({ status: "past_due" });
  } else if (decision === "revoke") {
    await update({ status: "revoked", current_period_end: now });
  } else if (decision === "clear_pending") {
    await update({ pending_plan: null, pending_subscription_id: null });
  }
  return { ok: true, decision };
}
