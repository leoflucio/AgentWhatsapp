/**
 * Demonstração da secretária dentro da página de vendas, sem WhatsApp e sem banco:
 * o visitante conversa com a secretária de um salão fictício. Regras puras, testadas
 * em demo-chat-rules.test.ts. A chamada à IA fica em demo-chat.functions.ts.
 */
import { buildSystemPrompt, calendarText } from "@/lib/whatsapp-agent-rules";

/** Tamanho máximo de cada mensagem do visitante. */
export const DEMO_MAX_CHARS = 400;
/** Quantas mensagens do visitante cabem numa conversa da demonstração. */
export const DEMO_MAX_USER_TURNS = 12;
/** Quantas mensagens (visitante + secretária) vão para a IA. */
export const DEMO_HISTORY_LIMIT = 16;
/** Limite por visitante (IP) dentro da janela abaixo. */
export const DEMO_IP_LIMIT = 30;
export const DEMO_IP_WINDOW_MS = 10 * 60_000;
/** Limite de respostas da demonstração por dia, somando todos os visitantes. */
export const DEMO_DAILY_LIMIT = 1500;

export const DEMO_BUSINESS_NAME = "Studio Aurora";
export const DEMO_AGENT_NAME = "Lia";
export const DEMO_GREETING =
  "Oi! Eu sou a Lia, secretária virtual do Studio Aurora (um salão de exemplo). Pergunte sobre serviços, preços ou peça para marcar um horário.";

/** Sugestões de primeira mensagem mostradas como botões. */
export const DEMO_SUGGESTIONS = [
  "Quanto custa um corte feminino?",
  "Tem horário amanhã à tarde?",
  "Vocês aceitam Pix?",
];

const DEMO_INSTRUCTIONS = `QUEM SOMOS
Somos o Studio Aurora, salão de beleza no bairro Aldeota, em Fortaleza (Rua das Flores, 120).

SERVIÇOS E VALORES
- Corte feminino: 1 h, R$ 80
- Corte masculino: 40 min, R$ 45
- Escova: 45 min, R$ 50
- Manicure e pedicure: 1 h 30, R$ 70
- Coloração: 2 h, a partir de R$ 180 (depende do comprimento)
- Design de sobrancelha: 30 min, R$ 40
Profissionais: Carla (cortes e coloração), Bia (unhas e sobrancelha).

PAGAMENTO
Pix, cartão de débito e crédito (até 3x sem juros acima de R$ 150) e dinheiro.

COMO ATENDER
Seja simpática e leve. Pergunte qual serviço a pessoa quer e, se fizer sentido, com qual profissional. Ofereça horários e reserve. Pergunte o nome se ainda não souber.

REGRAS DO SALÃO
- Atraso: tolerância de 15 minutos.
- Cancelamento: avisar com 24 horas de antecedência.`;

/** Regras só da demonstração: não há agenda, equipe nem ferramentas de verdade. */
export const DEMO_RULES = [
  "ESTA CONVERSA É UMA DEMONSTRAÇÃO no site da Secretária Digital 24h, com um salão fictício. Atenda exatamente como atenderia um cliente do salão.",
  "Aqui não existem ferramentas, agenda real nem equipe. Quando as regras mandarem usar chamar_atendente, apenas diga que vai passar a mensagem para a equipe do salão.",
  "Para marcar: ofereça 2 opções de horário entre 9h e 18h, de segunda a sábado, nos próximos dias do CALENDÁRIO. Quando a pessoa escolher e disser o nome, diga que o horário ficou reservado e que a equipe vai confirmar. Não peça CPF, endereço nem outros dados.",
  "Se a pessoa perguntar sobre a própria secretária virtual (como ter uma igual, preço, se funciona no WhatsApp dela), explique em até 2 frases que esta é uma demonstração da Secretária Digital 24h, que atende no WhatsApp do negócio 24 horas por dia, e que dá para testar 7 dias grátis no botão 'Testar 7 dias grátis' desta página.",
];

export function demoSystemPrompt(todayISO: string): string {
  const base = buildSystemPrompt({
    agentName: DEMO_AGENT_NAME,
    businessName: DEMO_BUSINESS_NAME,
    segment: "salão de beleza",
    booking: false,
    instructions: DEMO_INSTRUCTIONS,
    today: todayISO.split("-").reverse().join("/"),
    calendar: calendarText(todayISO, 7),
    hours: "segunda a sábado, das 9h às 18h",
    contact: "Visitante do site testando a demonstração (sem nome ainda).",
  });
  return [base, "", "REGRAS DA DEMONSTRAÇÃO:", ...DEMO_RULES].join("\n");
}

export type DemoMessage = { role: "user" | "assistant"; content: string };

/**
 * Limpa o histórico que vem do navegador: só papéis válidos, texto aparado e cortado
 * em DEMO_MAX_CHARS, sem mensagens vazias, as últimas DEMO_HISTORY_LIMIT e começando
 * pelo visitante. Null quando não há o que responder (a última não é do visitante)
 * ou quando a conversa passou de DEMO_MAX_USER_TURNS.
 */
export function sanitizeDemoHistory(raw: unknown): DemoMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const all: DemoMessage[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim().slice(0, DEMO_MAX_CHARS);
    if (text) all.push({ role, content: text });
  }
  if (all.length === 0 || all[all.length - 1]!.role !== "user") return null;
  if (all.filter((m) => m.role === "user").length > DEMO_MAX_USER_TURNS) return null;
  let recent = all.slice(-DEMO_HISTORY_LIMIT);
  while (recent.length && recent[0]!.role !== "user") recent = recent.slice(1);
  return recent;
}

/** Janela deslizante simples por chave (IP): true se ainda pode responder. */
export function allowHit(
  hits: Map<string, number[]>,
  key: string,
  now: number,
  limit = DEMO_IP_LIMIT,
  windowMs = DEMO_IP_WINDOW_MS,
): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
