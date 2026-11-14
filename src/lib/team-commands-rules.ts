/**
 * Comandos da equipe pelo WhatsApp (regras puras, testadas em
 * team-commands-rules.test.ts).
 *
 * A equipe mexe na agenda mandando mensagem para o número do agente: da
 * conversa "você" do próprio número conectado ou de um celular da lista
 * "Celulares da equipe" (tela Agente). Texto começando com # ou áudio vira
 * comando; o agente mostra o que vai fazer e só faz depois de um "sim". A
 * lista do dia (#hoje, #amanhã) é numerada, e responder "1 3" ou "todos"
 * confirma esses horários. O cliente nunca recebe nada por aqui.
 */
import { phoneMatchKey, samePhoneBR } from "@/lib/phone";
import { addDaysISO, localDateTimeOf } from "@/lib/agenda-time";
import { FUZZY_MIN, nameScore } from "@/lib/name-match";

/** Quanto tempo um plano espera o "sim" e uma lista aceita a resposta com números. */
export const PENDING_MINUTES = 30;
export const LIST_MINUTES = 120;

/** Horário da agenda como os comandos veem. */
export type TeamBooking = {
  id: string;
  kind: string;
  status: string;
  contact_name: string | null;
  phone: string | null;
  starts_at: string;
  ends_at: string;
};

export type TeamAction =
  | { tipo: "confirmar"; id: string }
  | { tipo: "cancelar"; id: string }
  | { tipo: "remarcar"; id: string; data: string; hora: string }
  | { tipo: "agendar"; data: string; hora: string; nome: string; telefone: string | null };

/** Quem mandou: a conversa "você" do número conectado ou um celular da equipe. */
export type TeamSender = "self" | "phone";

export function teamSenderOf(args: {
  fromMe: boolean;
  phone: string;
  ownPhone: string | null;
  teamNumbers: string[];
}): TeamSender | null {
  if (args.fromMe) {
    return args.ownPhone && samePhoneBR(args.phone, args.ownPhone) ? "self" : null;
  }
  return args.teamNumbers.some((n) => samePhoneBR(n, args.phone)) ? "phone" : null;
}

/** Chave de quem mandou (plano e lista separados por pessoa). */
export function senderKey(sender: TeamSender, phone: string): string {
  return sender === "self" ? "voce" : (phoneMatchKey(phone) ?? phone);
}

/** Lista de celulares da tela ("um por linha"): só dígitos, 10+ números, até 20. */
export function parseTeamNumbers(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\n,;]+/)
        .map((n) => n.replace(/\D/g, ""))
        .filter((n) => n.length >= 10),
    ),
  ].slice(0, 20);
}

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Texto de comando: tem # (no começo ou no meio, como a transcrição às vezes põe). */
export function isCommandText(text: string): boolean {
  return /(^|\s)#\s*\p{L}/u.test(text.trim());
}

const YES = new Set([
  "sim",
  "s",
  "ok",
  "pode",
  "pode fazer",
  "confirma",
  "confirmo",
  "isso",
  "sim pode",
  "pode sim",
  "faz",
  "manda",
]);
const NO = new Set(["nao", "n", "cancela", "deixa", "esquece", "nao precisa", "nao faz"]);

export function isYes(text: string): boolean {
  return YES.has(fold(text).replace(/#/g, "").trim());
}
export function isNo(text: string): boolean {
  return NO.has(fold(text).replace(/#/g, "").trim());
}

const WEEKDAY_NUM: Record<string, number> = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 2,
  ter: 2,
  quarta: 3,
  qua: 3,
  quinta: 4,
  qui: 4,
  sexta: 5,
  sex: 5,
  sabado: 6,
  sab: 6,
};

/**
 * Dia dito de vários jeitos: "hoje", "amanhã", "ontem", "depois de amanhã",
 * "sexta" (a próxima; hoje conta), "dia 20" (este mês, ou o próximo se já
 * passou), "20/11", "20-11-2026". null = não entendeu.
 */
export function parseDayWords(raw: string, todayISO: string): string | null {
  const t = fold(raw)
    .replace(/\b(feira|proxima|proximo|que vem|de)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t === "hoje") return todayISO;
  if (t === "amanha") return addDaysISO(todayISO, 1);
  if (t === "ontem") return addDaysISO(todayISO, -1);
  if (t === "depois amanha") return addDaysISO(todayISO, 2);
  if (t in WEEKDAY_NUM) {
    const today = new Date(`${todayISO}T12:00:00Z`).getUTCDay();
    return addDaysISO(todayISO, (WEEKDAY_NUM[t]! - today + 7) % 7);
  }
  const only = /^(?:dia )?(\d{1,2})$/.exec(t);
  if (only) {
    const [y, m] = todayISO.split("-").map(Number);
    const day = String(Number(only[1])).padStart(2, "0");
    const iso = `${y}-${String(m).padStart(2, "0")}-${day}`;
    if (isValidDate(iso) && iso >= todayISO) return iso;
    const ny = m === 12 ? y! + 1 : y!;
    const nm = m === 12 ? 1 : m! + 1;
    const next = `${ny}-${String(nm).padStart(2, "0")}-${day}`;
    return isValidDate(next) ? next : null;
  }
  const d = /^(?:dia )?(\d{1,2})[/\s.-](\d{1,2})(?:[/\s.-](\d{2,4}))?$/.exec(t);
  if (!d) return null;
  const year = d[3]
    ? d[3].length === 2
      ? 2000 + Number(d[3])
      : Number(d[3])
    : Number(todayISO.slice(0, 4));
  const iso = `${year}-${String(Number(d[2])).padStart(2, "0")}-${String(Number(d[1])).padStart(2, "0")}`;
  return isValidDate(iso) ? iso : null;
}

/**
 * Dia pedido por #hoje, #amanhã, #ontem, #sexta, #agenda DD/MM, #agenda dia 20,
 * #agenda depois de amanhã. null = não é pedido de lista.
 */
export function listDayOf(text: string, todayISO: string): string | null {
  const t = fold(text);
  const m = /^#\s*(hoje|amanha|ontem|agenda|lista)\b\s*(.*)$/.exec(t);
  if (!m) {
    // "#sexta", "#segunda feira" sozinhos.
    const w = /^#\s*(domingo|segunda|terca|quarta|quinta|sexta|sabado)(\s+feira)?$/.exec(t);
    return w ? parseDayWords(w[1]!, todayISO) : null;
  }
  const rest = m[2]!.trim();
  if (m[1] === "hoje" || m[1] === "amanha" || m[1] === "ontem") {
    return rest ? null : parseDayWords(m[1], todayISO);
  }
  return parseDayWords(rest, todayISO);
}

export function isValidDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function isValidHour(h: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(h);
}

/** "08:00" a partir de "8:00". */
export function padHour(h: string): string {
  const [hh, mm] = h.split(":");
  return `${hh!.padStart(2, "0")}:${mm}`;
}

/**
 * Resposta à lista do dia: "1 3 4", "1, 3 e 4", "todos". Devolve os números
 * (1 a n) ou null se não parece resposta de lista.
 */
export function parseListReply(text: string, n: number): number[] | null {
  const t = fold(text).replace(/#/g, "").trim();
  if (!t) return null;
  if (/^(todos|todas|tudo|todos confirmados|confirma todos|confirmar todos)$/.test(t)) {
    return Array.from({ length: n }, (_, i) => i + 1);
  }
  const words = t.split(" ").filter((w) => w !== "e");
  if (!words.every((w) => /^\d{1,3}$/.test(w))) return null;
  const nums = [...new Set(words.map(Number))];
  if (nums.some((x) => x < 1 || x > n)) return null;
  return nums.sort((a, b) => a - b);
}

/** "sex. 14/11 15:00". */
export function whenText(iso: string): string {
  const { data, hora } = localDateTimeOf(iso);
  return `${dayLabel(data)} ${hora}`;
}

const WEEK = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
export function dayLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return `${WEEK[d.getUTCDay()]} ${dateISO.slice(8, 10)}/${dateISO.slice(5, 7)}`;
}

const who = (b: TeamBooking) => b.contact_name?.trim() || b.phone || "sem nome";

/** Lista numerada do dia (só horários de pessoas, sem bloqueios nem cancelados). */
export function dayList(bookings: TeamBooking[], dateISO: string): TeamBooking[] {
  return bookings
    .filter((b) => b.kind === "reserva" && b.status !== "cancelado")
    .filter((b) => localDateTimeOf(b.starts_at).data === dateISO)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function listText(list: TeamBooking[], dateISO: string, todayISO: string): string {
  const label = dateISO === todayISO ? "hoje" : dateISO === addDaysISO(todayISO, 1) ? "amanhã" : "";
  const title = `Agenda de ${label ? `${label}, ` : ""}${dayLabel(dateISO)}`;
  if (list.length === 0) return `${title}: nenhum horário marcado.`;
  const lines = list.map((b, i) => {
    const st = b.status === "reservado" ? " (reservado, falta confirmar)" : "";
    return `${i + 1}. ${localDateTimeOf(b.starts_at).hora} ${who(b)}${st}`;
  });
  const pending = list.some((b) => b.status === "reservado");
  return [
    `${title}:`,
    ...lines,
    "",
    pending
      ? 'Para confirmar, responda os números (ex.: "1 3") ou "todos".'
      : "Todos já estão confirmados.",
  ].join("\n");
}

/** Ajuda curta quando o comando não foi entendido. */
export const TEAM_HELP = [
  "Comandos da agenda (texto com # ou áudio):",
  "#hoje, #amanhã, #sexta ou #agenda 20/11: lista os horários para confirmar",
  "#confirmar Ana (nome escrito de outro jeito também vale: Walkyria = Valquíria)",
  "#cancelar Ana",
  "#remarcar Ana sexta 15h",
  "#agendar Ana amanhã 10h (pode pôr o celular)",
  "Antes de mudar a agenda eu mostro o que vou fazer e espero você responder SIM.",
].join("\n");

/** Prompt da IA que entende o comando (só interpreta; quem executa é o código). */
export function interpretSystem(args: {
  todayISO: string;
  nowHour: string;
  calendar: string;
  bookings: TeamBooking[];
  /** Nomes da agenda que o comando parece citar pelo som (mentionedNames). */
  hints?: string[];
  /** Contatos da lista que o comando parece citar (nome | celular), para agendar. */
  contacts?: string[];
}): string {
  const rows = args.bookings
    .filter((b) => b.kind === "reserva" && b.status !== "cancelado")
    .map(
      (b) =>
        `${b.id} | ${localDateTimeOf(b.starts_at).data} ${localDateTimeOf(b.starts_at).hora} | ${who(b)}${
          b.phone ? ` | ${b.phone}` : ""
        } | ${b.status}`,
    );
  return [
    "Você interpreta comandos que a equipe de um negócio manda pelo WhatsApp para mexer na agenda.",
    `Hoje é ${args.todayISO}, agora são ${args.nowHour} (horário de Brasília).`,
    `CALENDÁRIO (use para saber a data de "sexta", "amanhã" etc.): ${args.calendar}`,
    "",
    "HORÁRIOS MARCADOS (id | data hora | nome | celular | status):",
    rows.length ? rows.join("\n") : "(nenhum)",
    ...(args.hints?.length
      ? ["", `PELO SOM, O COMANDO PARECE CITAR: ${args.hints.join("; ")}.`]
      : []),
    ...(args.contacts?.length
      ? ["", "CONTATOS DA LISTA COM NOME PARECIDO (nome | celular):", ...args.contacts]
      : []),
    "",
    "Responda SÓ com um JSON, sem texto antes ou depois:",
    '{"acoes":[...],"duvida":"..."}',
    "Cada ação é uma destas:",
    '{"tipo":"confirmar","id":"<id>","nome":"<nome como foi dito>"}',
    '{"tipo":"cancelar","id":"<id>","nome":"<nome como foi dito>"}',
    '{"tipo":"remarcar","id":"<id>","nome":"<nome como foi dito>","data":"AAAA-MM-DD","hora":"HH:MM"}',
    '{"tipo":"agendar","data":"AAAA-MM-DD","hora":"HH:MM","nome":"<nome>","telefone":"<só dígitos ou vazio>"}',
    "Regras:",
    "- Use só ids da lista. A pessoa citada pelo nome precisa bater com UM horário; se houver mais de um com o mesmo nome e o comando não disser qual (dia ou hora), não invente: deixe acoes vazio e escreva em duvida a pergunta.",
    '- Compare nomes pelo SOM, não pela grafia: W = V, Y = I, K = QU = C (antes de a/o/u), PH = F, Z = S, Ç = S, H mudo, letras dobradas e acentos não contam (Valkyria = Walkyria = Valquíria; Sueli = Suely; Thaís = Tais; Luiz = Luis; Rafaella = Rafaela; Phelipe = Felipe; Kátia = Cátia). Erro de digitação ou de transcrição (uma letra trocada, "R. Lucy" = Erluce) vale se só houver UMA pessoa parecida.',
    '- Primeiro nome sozinho vale se só uma pessoa na lista tem esse nome; "Ana" não é "Mariana". Se duas pessoas servem (duas Anas, Sueli e Suely em dias diferentes), não escolha: pergunte em duvida citando as opções com dia e hora.',
    '- Vários nomes no mesmo comando ("confirma Ana e Bia", "Ana, Bia e Carla") = uma ação para cada.',
    '- Hora dita de vários jeitos: "3 da tarde" = 15:00, "9 e meia" = 09:30, "meio-dia" = 12:00, "15h30" = 15:30, "às 7 da noite" = 19:00. Hora sem manhã/tarde: use a que existir na agenda daquela pessoa; para agendar, entre 1 e 6 sem período é da tarde ("às 3" = 15:00).',
    '- Dia dito de vários jeitos: "sexta" = a próxima sexta do CALENDÁRIO (hoje conta), "dia 20" = dia 20 deste mês (ou do próximo, se já passou), "depois de amanhã", "semana que vem" + dia da semana = a da semana seguinte.',
    "- Para agendar, se a pessoa estiver em CONTATOS DA LISTA, use o nome e o celular de lá.",
    "- Remarcar e agendar precisam de dia e hora; sem um deles, acoes vazio e pergunte em duvida.",
    '- "faltou" ou "não vem" = cancelar. "veio", "confirmou", "confirmado" = confirmar.',
    "- Se a mensagem não for comando de agenda, devolva acoes vazio e duvida vazia.",
  ].join("\n");
}

/** Lê o JSON da IA e valida contra a agenda. Ação inválida vira problema, nunca é feita. */
export function parseInterpretation(
  raw: string,
  bookings: TeamBooking[],
): { actions: TeamAction[]; question: string; problems: string[] } {
  const problems: string[] = [];
  const m = /\{[\s\S]*\}/.exec(raw);
  let obj: { acoes?: unknown; duvida?: unknown } = {};
  try {
    obj = m ? JSON.parse(m[0]) : {};
  } catch {
    return { actions: [], question: "", problems: ["não entendi o comando"] };
  }
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const actions: TeamAction[] = [];
  for (const a of Array.isArray(obj.acoes) ? obj.acoes : []) {
    const x = (a ?? {}) as Record<string, unknown>;
    const tipo = String(x.tipo ?? "");
    const id = String(x.id ?? "");
    const data = String(x.data ?? "");
    const hora = String(x.hora ?? "");
    if (tipo === "confirmar" || tipo === "cancelar" || tipo === "remarcar") {
      const b = byId.get(id);
      if (!b || b.kind !== "reserva" || b.status === "cancelado") {
        problems.push("não achei esse horário na agenda");
        continue;
      }
      // O nome dito precisa parecer o da agenda (pelo som): a IA não troca de pessoa.
      const said = String(x.nome ?? "").trim();
      if (said && b.contact_name?.trim() && nameScore(said, b.contact_name) < FUZZY_MIN) {
        problems.push(`"${said.slice(0, 60)}" não parece ${who(b)} (${whenText(b.starts_at)})`);
        continue;
      }
      if (tipo === "remarcar") {
        if (!isValidDate(data) || !isValidHour(hora)) {
          problems.push(`faltou o novo dia ou a hora para ${who(b)}`);
          continue;
        }
        actions.push({ tipo, id, data, hora: padHour(hora) });
      } else {
        actions.push({ tipo, id });
      }
    } else if (tipo === "agendar") {
      const nome = String(x.nome ?? "").trim();
      if (!nome || !isValidDate(data) || !isValidHour(hora)) {
        problems.push("para agendar preciso do nome, do dia e da hora");
        continue;
      }
      const tel = String(x.telefone ?? "").replace(/\D/g, "");
      actions.push({
        tipo,
        data,
        hora: padHour(hora),
        nome: nome.slice(0, 120),
        telefone: tel.length >= 10 ? tel : null,
      });
    }
  }
  const question = typeof obj.duvida === "string" ? obj.duvida.trim().slice(0, 300) : "";
  return { actions, question, problems };
}

/** Texto do plano para a equipe responder SIM. */
export function planText(actions: TeamAction[], bookings: TeamBooking[]): string {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const lines = actions.map((a, i) => {
    const n = `${i + 1}.`;
    if (a.tipo === "agendar") {
      return `${n} Agendar ${a.nome}${a.telefone ? ` (${a.telefone})` : ""} em ${dayLabel(a.data)} ${a.hora}`;
    }
    const b = byId.get(a.id)!;
    if (a.tipo === "remarcar") {
      return `${n} Remarcar ${who(b)} de ${whenText(b.starts_at)} para ${dayLabel(a.data)} ${a.hora}`;
    }
    const verb = a.tipo === "confirmar" ? "Confirmar" : "Cancelar";
    return `${n} ${verb} ${who(b)}, ${whenText(b.starts_at)}`;
  });
  return ["Vou fazer:", ...lines, "", "Responda SIM para fazer ou NÃO para deixar como está."].join(
    "\n",
  );
}

/**
 * Quantos horários (não cancelados, sem contar `ignoreId`) ocupam o intervalo,
 * e se há bloqueio nele. Usado para não marcar por cima.
 */
export function occupancy(
  bookings: TeamBooking[],
  startMs: number,
  endMs: number,
  ignoreId?: string,
): { count: number; blocked: boolean } {
  let count = 0;
  let blocked = false;
  for (const b of bookings) {
    if (b.status === "cancelado" || b.id === ignoreId) continue;
    const s = new Date(b.starts_at).getTime();
    const e = new Date(b.ends_at).getTime();
    if (s < endMs && e > startMs) {
      if (b.kind === "bloqueio") blocked = true;
      else count++;
    }
  }
  return { count, blocked };
}
