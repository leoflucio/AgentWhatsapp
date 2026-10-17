/**
 * Retomada (follow-up): quem conversou com o agente e parou sem fechar recebe
 * UMA mensagem depois de alguns dias. Regras puras, testadas em
 * followup-rules.test.ts.
 *
 * "Não fechou" = o contato escreveu, não é cliente, não tem horário na agenda,
 * a equipe não assumiu a conversa e o agente não chamou a equipe. Se o
 * contato escrever de novo, a conversa pode receber outra retomada mais tarde.
 */
import { isWithinBusinessHours, type DayWindow } from "@/lib/agenda-hours";
import { localDateTimeOf, weekdayOf } from "@/lib/agenda-time";

/** Dias sem conversa antes da retomada (opções da tela). */
export const FOLLOWUP_DAY_OPTIONS = [1, 2, 3, 5, 7] as const;
export const DEFAULT_FOLLOWUP_DAYS = 2;
/** Conversa parada há mais que isto não recebe retomada (a pessoa já esqueceu). */
export const FOLLOWUP_MAX_AGE_DAYS = 30;
/** Envios por conta a cada rodada (evita rajadas no número). */
export const FOLLOWUP_BATCH = 5;
/** Resposta da IA quando a conversa mostra que não se deve insistir. */
export const FOLLOWUP_SKIP = "PULAR";

const DAY = 86_400_000;

export function clampFollowUpDays(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_FOLLOWUP_DAYS;
  return Math.min(FOLLOWUP_MAX_AGE_DAYS - 1, Math.max(1, n));
}

export function followUpDaysLabel(days: number): string {
  return days === 1 ? "1 dia" : `${days} dias`;
}

export type FollowUpFacts = {
  lastMessageAt: string;
  followUpSentAt: string | null;
  /** A última mensagem da conversa é do agente ou da equipe (o contato parou de responder). */
  lastFromBusiness: boolean;
  /** O contato escreveu ao menos uma vez. */
  contactWrote: boolean;
  isClient: boolean;
  /** Tem horário (reservado ou confirmado) na agenda. */
  hasBooking: boolean;
  humanTakeover: boolean;
  takeoverUntil: string | null;
  /** O agente chamou a equipe e ninguém respondeu ainda. */
  attentionReason: string | null;
};

export type FollowUpVerdict = { ok: boolean; reason: string };

/** Esta conversa deve receber a retomada agora? */
export function followUpVerdict(f: FollowUpFacts, days: number, now = Date.now()): FollowUpVerdict {
  if (f.followUpSentAt) return { ok: false, reason: "já recebeu retomada" };
  if (!f.contactWrote) return { ok: false, reason: "o contato não escreveu" };
  if (!f.lastFromBusiness) return { ok: false, reason: "o contato falou por último" };
  if (f.isClient) return { ok: false, reason: "já é cliente" };
  if (f.hasBooking) return { ok: false, reason: "já tem horário na agenda" };
  if (f.attentionReason) return { ok: false, reason: "esperando a equipe" };
  if (f.humanTakeover || (f.takeoverUntil && new Date(f.takeoverUntil).getTime() > now)) {
    return { ok: false, reason: "conversa com a equipe" };
  }
  const last = new Date(f.lastMessageAt).getTime();
  if (!Number.isFinite(last)) return { ok: false, reason: "sem data" };
  if (now - last < clampFollowUpDays(days) * DAY) return { ok: false, reason: "conversa recente" };
  if (now - last > FOLLOWUP_MAX_AGE_DAYS * DAY) return { ok: false, reason: "conversa antiga" };
  return { ok: true, reason: "não fechou" };
}

/** Só manda dentro do horário de atendimento do negócio (fuso de Brasília). */
export function inSendWindow(schedule: Record<number, DayWindow[]>, now = new Date()): boolean {
  const { data, hora } = localDateTimeOf(now.toISOString());
  const [h, m] = hora.split(":").map(Number);
  const min = h! * 60 + m!;
  return isWithinBusinessHours(weekdayOf(data), min, min + 1, schedule);
}

/** Instruções para a IA escrever (ou pular) a mensagem de retomada. */
export function followUpSystemPrompt(args: {
  businessName: string;
  segment?: string | null;
  agentName?: string | null;
  instructions?: string | null;
  booking: boolean;
}): string {
  return [
    `Você atende pelo WhatsApp em nome de ${args.businessName}${args.segment?.trim() ? ` (${args.segment.trim()})` : ""}. Responda em português do Brasil.`,
    args.agentName?.trim() ? `Seu nome: ${args.agentName.trim()}.` : "",
    `Esta pessoa conversou com o negócio há alguns dias e a conversa parou sem fechar. Escreva UMA mensagem curta de retomada (no máximo 2 frases), cordial e sem pressão, retomando o assunto da conversa e ${args.booking ? "oferecendo ajuda para marcar um horário ou tirar alguma dúvida" : "perguntando se pode ajudar em mais alguma coisa"}.`,
    "NUNCA use emojis. Não invente valores, promoções, descontos nem horários. Não se reapresente se já se apresentou na conversa.",
    `Se a conversa mostrar que a pessoa recusou, disse que não tem interesse, pediu para não receber mensagens, já resolveu por outro meio, disse que vai retornar numa data que ainda não chegou, ou se a conversa foi engano ou só um aviso, responda exatamente ${FOLLOWUP_SKIP} e nada mais.`,
    args.instructions?.trim()
      ? `Informações do negócio (use só se ajudar):\n${args.instructions.trim().slice(0, 3000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A IA decidiu não insistir? */
export function isFollowUpSkip(text: string): boolean {
  return (
    text
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "") === FOLLOWUP_SKIP
  );
}
