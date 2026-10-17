import { describe, expect, it } from "vitest";
import {
  clampFollowUpDays,
  followUpVerdict,
  inSendWindow,
  isFollowUpSkip,
  type FollowUpFacts,
} from "./followup-rules";
import { DEFAULT_SCHEDULE } from "./agenda-hours";

const NOW = Date.parse("2026-10-21T15:00:00Z"); // quarta, 12h em Brasília
const day = 86_400_000;
const base: FollowUpFacts = {
  lastMessageAt: new Date(NOW - 3 * day).toISOString(),
  followUpSentAt: null,
  lastFromBusiness: true,
  contactWrote: true,
  isClient: false,
  hasBooking: false,
  humanTakeover: false,
  takeoverUntil: null,
  attentionReason: null,
};

describe("retomada — quem recebe", () => {
  it("parou há 3 dias sem fechar: recebe", () => {
    expect(followUpVerdict(base, 2, NOW)).toEqual({ ok: true, reason: "não fechou" });
  });

  it("recente, antiga demais ou já recebeu: não", () => {
    expect(followUpVerdict(base, 5, NOW).ok).toBe(false);
    const old = { ...base, lastMessageAt: new Date(NOW - 40 * day).toISOString() };
    expect(followUpVerdict(old, 2, NOW).reason).toBe("conversa antiga");
    expect(followUpVerdict({ ...base, followUpSentAt: "x" }, 2, NOW).ok).toBe(false);
  });

  it("cliente, horário na agenda, equipe ou contato falou por último: não", () => {
    expect(followUpVerdict({ ...base, isClient: true }, 2, NOW).ok).toBe(false);
    expect(followUpVerdict({ ...base, hasBooking: true }, 2, NOW).ok).toBe(false);
    expect(followUpVerdict({ ...base, attentionReason: "pediu humano" }, 2, NOW).ok).toBe(false);
    expect(followUpVerdict({ ...base, humanTakeover: true }, 2, NOW).ok).toBe(false);
    expect(followUpVerdict({ ...base, lastFromBusiness: false }, 2, NOW).ok).toBe(false);
    expect(followUpVerdict({ ...base, contactWrote: false }, 2, NOW).ok).toBe(false);
  });

  it("dias fora da faixa viram o limite", () => {
    expect(clampFollowUpDays(0)).toBe(1);
    expect(clampFollowUpDays(99)).toBe(29);
    expect(clampFollowUpDays("x")).toBe(2);
  });
});

describe("retomada — horário e resposta da IA", () => {
  it("só no horário de atendimento (Brasília)", () => {
    expect(inSendWindow(DEFAULT_SCHEDULE, new Date(NOW))).toBe(true);
    expect(inSendWindow(DEFAULT_SCHEDULE, new Date("2026-10-21T23:30:00Z"))).toBe(false); // 20h30
    expect(inSendWindow(DEFAULT_SCHEDULE, new Date("2026-10-25T15:00:00Z"))).toBe(false); // domingo
  });

  it("PULAR com pontuação ainda é pular", () => {
    expect(isFollowUpSkip(" pular. ")).toBe(true);
    expect(isFollowUpSkip("Oi! Posso ajudar?")).toBe(false);
  });
});
