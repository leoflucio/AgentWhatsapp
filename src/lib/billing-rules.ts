/**
 * Assinatura do agente: planos, teste grátis, acesso e cota de respostas.
 * Regras puras (sem rede nem banco), testadas em billing-rules.test.ts.
 *
 * - Toda conta nova ganha TRIAL_DAYS dias grátis, com até TRIAL_REPLIES respostas.
 * - O plano só vale quando o pagamento é confirmado (webhook do Asaas).
 * - Pagamento atrasado: o agente continua por GRACE_DAYS dias depois do fim do período.
 * - Conta bloqueada pelo dono do app não responde; contas de admin não têm limite.
 */

export type PlanId = "essencial" | "profissional" | "empresa";

export const PLANS: Record<PlanId, { label: string; price: number; replies: number }> = {
  essencial: { label: "Essencial", price: 97, replies: 1000 },
  profissional: { label: "Profissional", price: 197, replies: 2500 },
  empresa: { label: "Empresa", price: 347, replies: 5000 },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const TRIAL_DAYS = 7;
/** Respostas no teste grátis (segura o custo de IA de quem só experimenta). */
export const TRIAL_REPLIES = 200;
export const GRACE_DAYS = 3;
const DAY = 86_400_000;

export const isPlan = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;

export type SubscriptionState = {
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  asaas_subscription_id?: string | null;
  pending_plan?: string | null;
  pending_subscription_id?: string | null;
};

/** Fim do teste grátis, contado da criação da conta. */
export function trialEndsAt(accountCreatedAt: string): string {
  return new Date(new Date(accountCreatedAt).getTime() + TRIAL_DAYS * DAY).toISOString();
}

/** O plano está valendo agora (pago, ou cancelado/atrasado ainda dentro do período)? */
export function planActive(sub: SubscriptionState | null | undefined, now = Date.now()): boolean {
  if (!sub || !isPlan(sub.plan)) return false;
  if (!["active", "past_due", "canceled"].includes(sub.status ?? "")) return false;
  const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : NaN;
  if (!Number.isFinite(end)) return false;
  return end + GRACE_DAYS * DAY > now;
}

export type AccessKind = "isento" | "plano" | "teste" | "vencido" | "bloqueado";

export type Access = {
  kind: AccessKind;
  plan: PlanId | null;
  /** Limite de respostas no mês (null = sem limite; 0 = não responde). */
  limit: number | null;
  trialEndsAt: string;
};

export function accountAccess(args: {
  sub: SubscriptionState | null | undefined;
  accountCreatedAt: string;
  blocked: boolean;
  exempt: boolean;
  now?: number;
}): Access {
  const now = args.now ?? Date.now();
  const trialEnd = trialEndsAt(args.accountCreatedAt);
  const base = { trialEndsAt: trialEnd };
  if (args.exempt) return { ...base, kind: "isento", plan: null, limit: null };
  if (args.blocked) return { ...base, kind: "bloqueado", plan: null, limit: 0 };
  if (planActive(args.sub, now)) {
    const id = args.sub!.plan as PlanId;
    return { ...base, kind: "plano", plan: id, limit: PLANS[id].replies };
  }
  if (new Date(trialEnd).getTime() > now) {
    return { ...base, kind: "teste", plan: null, limit: TRIAL_REPLIES };
  }
  return { ...base, kind: "vencido", plan: null, limit: 0 };
}

export type ReplyDecision =
  { ok: true } | { ok: false; reason: "bloqueado" | "vencido" | "cota_esgotada" };

/** O agente pode responder agora? */
export function canReply(access: Access, usedThisMonth: number): ReplyDecision {
  if (access.kind === "bloqueado") return { ok: false, reason: "bloqueado" };
  if (access.kind === "vencido") return { ok: false, reason: "vencido" };
  if (access.limit !== null && usedThisMonth >= access.limit) {
    return { ok: false, reason: "cota_esgotada" };
  }
  return { ok: true };
}

/** Mensagem fixa (sem IA) quando a cota do mês acaba: a equipe assume. */
export const QUOTA_HANDOFF_MESSAGE =
  "Recebemos sua mensagem. Em breve nossa equipe responde por aqui.";

/** Início do mês corrente no horário de Brasília, em ISO (UTC). */
export function monthStartBR(now = Date.now()): string {
  const sp = new Date(now - 3 * 3_600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3, 0, 0)).toISOString();
}

/**
 * Fim do período pago: um mês depois do vencimento da cobrança (no último dia
 * do mês seguinte quando o dia não existe). Sem vencimento: agora + 31 dias.
 * Nunca reduz um fim já maior.
 */
export function computePeriodEnd(
  dueDate: string | null | undefined,
  currentEnd: string | null | undefined,
  now = Date.now(),
): string {
  let next: Date;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate ?? "");
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    next = new Date(Date.UTC(y, mo, Math.min(d, lastDay), 23, 59, 59) + 3 * 3_600_000);
  } else {
    next = new Date(now + 31 * DAY);
  }
  if (currentEnd) {
    const cur = new Date(currentEnd);
    if (!Number.isNaN(cur.getTime()) && cur.getTime() > next.getTime()) return cur.toISOString();
  }
  return next.toISOString();
}

export type EventDecision =
  "promote_pending" | "renew_current" | "past_due" | "revoke" | "clear_pending" | "ignore";

const PAID = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"]);
const REVOKE = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
]);

/**
 * Evento do Asaas de uma cobrança da assinatura. Só a assinatura atual ou a
 * pendente mexem no plano; cobranças de assinaturas antigas são ignoradas.
 */
export function decideEvent(
  state: SubscriptionState | null | undefined,
  subscriptionId: string,
  event: string,
): EventDecision {
  const isPending =
    !!state?.pending_subscription_id && state.pending_subscription_id === subscriptionId;
  const isCurrent =
    !!state?.asaas_subscription_id && state.asaas_subscription_id === subscriptionId;
  if (PAID.has(event)) {
    if (isPending) return "promote_pending";
    if (isCurrent) return "renew_current";
    return "ignore";
  }
  if (isCurrent) {
    if (event === "PAYMENT_OVERDUE") return "past_due";
    if (REVOKE.has(event) || event.startsWith("PAYMENT_CHARGEBACK")) return "revoke";
    return "ignore";
  }
  if (isPending && (event === "PAYMENT_DELETED" || REVOKE.has(event))) return "clear_pending";
  return "ignore";
}

/** Referência externa das cobranças no Asaas. */
export const externalReference = (accountId: string, plan: PlanId) =>
  `agw_plan:${accountId}:${plan}`;

export function parseReference(
  ref: string | null | undefined,
): { accountId: string; plan: PlanId } | null {
  const [prefix, accountId, plan] = String(ref ?? "").split(":");
  if (prefix !== "agw_plan" || !accountId || !isPlan(plan)) return null;
  return { accountId, plan };
}

export type CheckoutPlan =
  { kind: "same" } | { kind: "new"; nextDueDate: string; cancelCurrentNow: boolean };

/**
 * Quando cobrar ao assinar ou trocar de plano:
 * - sem plano valendo (inclusive no teste grátis): cobra hoje;
 * - plano maior: cobra hoje; o anterior é cancelado quando o novo for pago;
 * - plano menor, ou voltar ao mesmo depois de cancelar: começa no fim do
 *   período já pago (sem cobrar em dobro). No plano menor, o atual para de
 *   renovar agora.
 */
export function planCheckout(
  sub: SubscriptionState | null | undefined,
  plan: PlanId,
  today: string,
  now = Date.now(),
): CheckoutPlan {
  if (!planActive(sub, now) || !isPlan(sub!.plan)) {
    return { kind: "new", nextDueDate: today, cancelCurrentNow: false };
  }
  const end = new Date(sub!.current_period_end!).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const startAtEnd = end > today ? end : today;
  const current = sub!.plan as PlanId;
  if (current === plan) {
    return sub!.status === "canceled"
      ? { kind: "new", nextDueDate: startAtEnd, cancelCurrentNow: false }
      : { kind: "same" };
  }
  if (PLANS[plan].price > PLANS[current].price) {
    return { kind: "new", nextDueDate: today, cancelCurrentNow: false };
  }
  return { kind: "new", nextDueDate: startAtEnd, cancelCurrentNow: sub!.status !== "canceled" };
}

/** CPF (11 dígitos) ou CNPJ (14), exigido pelo Asaas para cobrar. */
export function validCpfCnpj(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11 && d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const nums = d.split("").map(Number);
  if (d.length === 11) {
    const check = (len: number) => {
      const sum = nums.slice(0, len).reduce((s, n, i) => s + n * (len + 1 - i), 0);
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return check(9) === nums[9] && check(10) === nums[10];
  }
  const check = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + w * nums[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === nums[12] && check(13) === nums[13];
}

/** Custo estimado de IA por resposta do agente, em reais. */
export const REPLY_COST_BRL = 0.03;

export type AdminRow = { access: Access; repliesThisMonth: number };

/** Totais do painel do dono: receita mensal dos planos pagos, uso e custo estimado. */
export function summarizeAccounts(rows: AdminRow[]) {
  const paying = rows.filter((r) => r.access.kind === "plano" && r.access.plan);
  const revenue = paying.reduce((s, r) => s + PLANS[r.access.plan!].price, 0);
  const replies = rows.reduce((s, r) => s + r.repliesThisMonth, 0);
  const cost = Math.round(replies * REPLY_COST_BRL * 100) / 100;
  const trials = rows.filter((r) => r.access.kind === "teste").length;
  return { accounts: rows.length, paying: paying.length, trials, revenue, replies, cost };
}
