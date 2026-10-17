import { describe, expect, it } from "vitest";
import {
  accountAccess,
  canReply,
  computePeriodEnd,
  decideEvent,
  externalReference,
  monthStartBR,
  parseReference,
  planActive,
  planCheckout,
  summarizeAccounts,
  TRIAL_REPLIES,
  validCpfCnpj,
} from "./billing-rules";

const NOW = Date.parse("2026-10-17T15:00:00Z");
const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("assinatura — acesso", () => {
  const created = iso(NOW - 2 * day);

  it("conta nova está no teste grátis com limite pequeno", () => {
    const a = accountAccess({
      sub: null,
      accountCreatedAt: created,
      blocked: false,
      exempt: false,
      now: NOW,
    });
    expect(a.kind).toBe("teste");
    expect(a.limit).toBe(TRIAL_REPLIES);
  });

  it("teste acabou e sem plano: vencido, não responde", () => {
    const a = accountAccess({
      sub: null,
      accountCreatedAt: iso(NOW - 8 * day),
      blocked: false,
      exempt: false,
      now: NOW,
    });
    expect(a.kind).toBe("vencido");
    expect(canReply(a, 0)).toEqual({ ok: false, reason: "vencido" });
  });

  it("plano pago vale com o limite do plano", () => {
    const sub = { plan: "profissional", status: "active", current_period_end: iso(NOW + 10 * day) };
    const a = accountAccess({
      sub,
      accountCreatedAt: iso(NOW - 40 * day),
      blocked: false,
      exempt: false,
      now: NOW,
    });
    expect(a).toMatchObject({ kind: "plano", plan: "profissional", limit: 2500 });
    expect(canReply(a, 2499).ok).toBe(true);
    expect(canReply(a, 2500)).toEqual({ ok: false, reason: "cota_esgotada" });
  });

  it("atrasado continua só dentro da tolerância", () => {
    const sub = { plan: "essencial", status: "past_due", current_period_end: iso(NOW - 2 * day) };
    expect(planActive(sub, NOW)).toBe(true);
    expect(planActive({ ...sub, current_period_end: iso(NOW - 4 * day) }, NOW)).toBe(false);
  });

  it("estornado (revoked) não vale", () => {
    expect(
      planActive({ plan: "essencial", status: "revoked", current_period_end: iso(NOW + day) }, NOW),
    ).toBe(false);
  });

  it("bloqueio do dono vence até plano pago; admin não tem limite", () => {
    const sub = { plan: "empresa", status: "active", current_period_end: iso(NOW + 10 * day) };
    const blocked = accountAccess({
      sub,
      accountCreatedAt: created,
      blocked: true,
      exempt: false,
      now: NOW,
    });
    expect(canReply(blocked, 0)).toEqual({ ok: false, reason: "bloqueado" });
    const exempt = accountAccess({
      sub: null,
      accountCreatedAt: iso(NOW - 99 * day),
      blocked: false,
      exempt: true,
      now: NOW,
    });
    expect(exempt.limit).toBeNull();
    expect(canReply(exempt, 99_999).ok).toBe(true);
  });
});

describe("assinatura — eventos do Asaas", () => {
  const state = {
    plan: "essencial",
    status: "active",
    current_period_end: iso(NOW),
    asaas_subscription_id: "sub_atual",
    pending_plan: "empresa",
    pending_subscription_id: "sub_nova",
  };

  it("pagamento da pendente promove; da atual renova", () => {
    expect(decideEvent(state, "sub_nova", "PAYMENT_RECEIVED")).toBe("promote_pending");
    expect(decideEvent(state, "sub_atual", "PAYMENT_CONFIRMED")).toBe("renew_current");
  });

  it("assinatura antiga nunca mexe no plano", () => {
    expect(decideEvent(state, "sub_velha", "PAYMENT_RECEIVED")).toBe("ignore");
    expect(decideEvent(state, "sub_velha", "PAYMENT_OVERDUE")).toBe("ignore");
  });

  it("atraso, estorno e cancelamento da pendente", () => {
    expect(decideEvent(state, "sub_atual", "PAYMENT_OVERDUE")).toBe("past_due");
    expect(decideEvent(state, "sub_atual", "PAYMENT_REFUNDED")).toBe("revoke");
    expect(decideEvent(state, "sub_nova", "PAYMENT_DELETED")).toBe("clear_pending");
  });

  it("referência externa ida e volta", () => {
    expect(parseReference(externalReference("abc", "empresa"))).toEqual({
      accountId: "abc",
      plan: "empresa",
    });
    expect(parseReference("wa_agent:abc:essencial")).toBeNull();
  });

  it("fim do período: um mês depois do vencimento, sem estourar o mês", () => {
    expect(computePeriodEnd("2026-01-31", null)).toBe("2026-03-01T02:59:59.000Z");
    expect(computePeriodEnd("2026-10-17", "2027-01-01T00:00:00.000Z")).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("assinatura — contratar e trocar de plano", () => {
  const today = "2026-10-17";
  const active = {
    plan: "profissional",
    status: "active",
    current_period_end: "2026-11-05T12:00:00Z",
  };

  it("no teste grátis cobra hoje", () => {
    expect(planCheckout(null, "essencial", today, NOW)).toEqual({
      kind: "new",
      nextDueDate: today,
      cancelCurrentNow: false,
    });
  });

  it("plano maior cobra hoje; menor começa no fim do período e para de renovar o atual", () => {
    expect(planCheckout(active, "empresa", today, NOW)).toEqual({
      kind: "new",
      nextDueDate: today,
      cancelCurrentNow: false,
    });
    expect(planCheckout(active, "essencial", today, NOW)).toEqual({
      kind: "new",
      nextDueDate: "2026-11-05",
      cancelCurrentNow: true,
    });
  });

  it("mesmo plano: nada; depois de cancelar, volta no fim do período", () => {
    expect(planCheckout(active, "profissional", today, NOW)).toEqual({ kind: "same" });
    expect(planCheckout({ ...active, status: "canceled" }, "profissional", today, NOW)).toEqual({
      kind: "new",
      nextDueDate: "2026-11-05",
      cancelCurrentNow: false,
    });
  });
});

describe("assinatura — utilidades", () => {
  it("início do mês em Brasília", () => {
    expect(monthStartBR(Date.parse("2026-11-01T01:00:00Z"))).toBe("2026-10-01T03:00:00.000Z");
    expect(monthStartBR(Date.parse("2026-11-01T04:00:00Z"))).toBe("2026-11-01T03:00:00.000Z");
  });

  it("CPF e CNPJ", () => {
    expect(validCpfCnpj("529.982.247-25")).toBe(true);
    expect(validCpfCnpj("111.111.111-11")).toBe(false);
    expect(validCpfCnpj("11.222.333/0001-81")).toBe(true);
    expect(validCpfCnpj("11.222.333/0001-82")).toBe(false);
  });

  it("totais do painel", () => {
    const t = (kind: "plano" | "teste", plan: "essencial" | "empresa" | null) => ({
      access: { kind, plan, limit: 1, trialEndsAt: "" },
      repliesThisMonth: 100,
    });
    expect(
      summarizeAccounts([t("plano", "essencial"), t("plano", "empresa"), t("teste", null)]),
    ).toEqual({
      accounts: 3,
      paying: 2,
      trials: 1,
      revenue: 444,
      replies: 300,
      cost: 9,
    });
  });
});
