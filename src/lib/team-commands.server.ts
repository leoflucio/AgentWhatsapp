/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Comandos da equipe pelo WhatsApp: confirmar, cancelar, remarcar e agendar
 * horários e ver a lista do dia, mandando mensagem para o número do agente.
 * Regras puras em team-commands-rules.ts. A IA só INTERPRETA o comando; quem
 * confere e grava é o código, e só depois do "sim" da equipe.
 */
import { generateText } from "ai";
import { aiModel } from "@/lib/ai.server";
import { sendText, transcribeAudio } from "@/lib/evolution.server";
import {
  addDaysISO,
  clampCapacity,
  localDateTimeOf,
  localDateTimeToUTC,
  localToUTC,
  todayLocalISO,
} from "@/lib/agenda-time";
import { normalizeWhatsApp } from "@/lib/phone";
import {
  LIST_MINUTES,
  PENDING_MINUTES,
  TEAM_HELP,
  dayList,
  interpretSystem,
  isCommandText,
  isNo,
  isYes,
  listDayOf,
  listText,
  occupancy,
  parseInterpretation,
  parseListReply,
  planText,
  senderKey,
  whenText,
  type TeamAction,
  type TeamBooking,
  type TeamSender,
} from "@/lib/team-commands-rules";
import {
  audioOf,
  calendarText,
  textOf,
  MAX_AUDIO_SECONDS,
  type EvoIncoming,
} from "@/lib/whatsapp-agent-rules";

/** Nota gravada nos horários marcados por aqui. */
export const TEAM_BOOKED_NOTE = "Agendado pela equipe pelo WhatsApp.";
const BOOKING_COLS = "id, kind, status, contact_name, phone, starts_at, ends_at";

type Ctx = { account: { id: string }; instance: string; token: string | null };

/** Mensagem da equipe. Devolve true quando tratou (o agente não responde a equipe). */
export async function handleTeamMessage(
  admin: any,
  args: { ctx: Ctx; settings: any; m: EvoIncoming; sender: TeamSender; phone: string },
): Promise<void> {
  const { ctx, settings, m, sender, phone } = args;
  const accountId = ctx.account.id;
  const key = senderKey(sender, phone);
  const { data: state } = await admin
    .from("team_command_state")
    .select("*")
    .eq("account_id", accountId)
    .eq("sender_key", key)
    .maybeSingle();

  let text = textOf(m);
  // Eco da própria resposta na conversa "você" (sai do mesmo número).
  if (
    sender === "self" &&
    text &&
    state?.last_reply === text &&
    Date.now() - new Date(state.last_reply_at ?? 0).getTime() < 10 * 60_000
  ) {
    return;
  }
  const audio = !text ? audioOf(m) : null;
  if (audio) {
    if (audio.seconds > MAX_AUDIO_SECONDS) return;
    text = (await transcribeAudio(ctx.instance, m.key?.id, audio.mimetype)) ?? "";
  }
  text = text.trim();
  if (!text) return;

  const now = Date.now();
  const pending =
    state?.pending && state.pending_until && new Date(state.pending_until).getTime() > now
      ? (state.pending as TeamAction[])
      : null;
  const listIds =
    state?.list_ids && state.list_until && new Date(state.list_until).getTime() > now
      ? (state.list_ids as string[])
      : null;

  const save = (patch: Record<string, unknown>) =>
    admin
      .from("team_command_state")
      .upsert(
        { account_id: accountId, sender_key: key, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "account_id,sender_key" },
      );
  const reply = async (body: string, patch: Record<string, unknown> = {}) => {
    // Grava ANTES de enviar: o eco na conversa "você" é reconhecido.
    await save({ ...patch, last_reply: body, last_reply_at: new Date().toISOString() });
    await sendText({ instance: ctx.instance, token: ctx.token, to: phone, text: body }).catch(
      (e: unknown) => console.error("[equipe] envio falhou", e instanceof Error ? e.message : e),
    );
  };

  // 1. Resposta a um plano esperando o "sim".
  if (pending && isYes(text)) {
    // Limpa antes de executar: um "sim" repetido não faz duas vezes.
    await save({ pending: null, pending_until: null });
    const lines = await executePlan(admin, { accountId, settings, actions: pending });
    await reply(lines.join("\n"));
    return;
  }
  if (pending && isNo(text)) {
    await reply("Certo, não mudei nada.", { pending: null, pending_until: null });
    return;
  }

  // 2. Resposta à lista do dia ("1 3", "todos"): confirma esses.
  if (listIds) {
    const picked = parseListReply(text, listIds.length);
    if (picked) {
      await save({ list_ids: null, list_until: null });
      const ids = picked.map((i) => listIds[i - 1]!);
      const lines = await executePlan(admin, {
        accountId,
        settings,
        actions: ids.map((id) => ({ tipo: "confirmar" as const, id })),
      });
      await reply(lines.join("\n"));
      return;
    }
  }

  // Daqui para baixo só comando (# ou áudio); o resto da conversa da equipe fica sem resposta.
  if (!audio && !isCommandText(text)) return;

  const { resolveAccess } = await import("@/lib/billing.server");
  const { access } = await resolveAccess(admin, accountId);
  if (access.kind === "bloqueado" || access.kind === "vencido") {
    console.log("[equipe] conta sem acesso", accountId);
    return;
  }

  const today = todayLocalISO();
  // 3. Lista do dia.
  const day = listDayOf(text, today);
  if (day) {
    const rows = await loadBookings(admin, accountId, day, addDaysISO(day, 1));
    const list = dayList(rows, day);
    await reply(listText(list, day, today), {
      list_ids: list.map((b) => b.id),
      list_until: new Date(now + LIST_MINUTES * 60_000).toISOString(),
    });
    return;
  }

  // 4. Comando em texto livre ou áudio: a IA interpreta, o código confere.
  const bookings = await loadBookings(
    admin,
    accountId,
    addDaysISO(today, -1),
    addDaysISO(today, 60),
  );
  const model = aiModel("main");
  if (!model) return;
  let raw = "";
  try {
    const r = await generateText({
      model,
      system: interpretSystem({
        todayISO: today,
        nowHour: localDateTimeOf(new Date().toISOString()).hora,
        calendar: calendarText(today, 21),
        bookings,
      }),
      prompt: text.slice(0, 1000),
      temperature: 0,
      maxRetries: 3,
    });
    raw = r.text;
  } catch (e) {
    console.error("[equipe] IA falhou", e instanceof Error ? e.message : e);
    await reply(
      "Não consegui entender o comando agora (IA fora do ar). Tente de novo em instantes.",
    );
    return;
  }
  const { actions, question, problems } = parseInterpretation(raw, bookings);
  if (actions.length > 0) {
    const extra = problems.length ? `\n\nNão incluí: ${problems.join("; ")}.` : "";
    await reply(planText(actions, bookings) + extra, {
      pending: actions,
      pending_until: new Date(now + PENDING_MINUTES * 60_000).toISOString(),
    });
    return;
  }
  if (question) {
    await reply(question);
    return;
  }
  // Áudio que não era comando (anotação, conversa): fica sem resposta.
  if (audio && problems.length === 0) return;
  await reply(
    problems.length ? `Não consegui: ${problems.join("; ")}.\n\n${TEAM_HELP}` : TEAM_HELP,
  );
}

/** Horários (não cancelados) entre duas datas locais. */
async function loadBookings(
  admin: any,
  accountId: string,
  fromDate: string,
  toDate: string,
): Promise<TeamBooking[]> {
  const { data } = await admin
    .from("bookings")
    .select(BOOKING_COLS)
    .eq("account_id", accountId)
    .neq("status", "cancelado")
    .gte("starts_at", localToUTC(fromDate, 0).toISOString())
    .lt("starts_at", localToUTC(toDate, 0).toISOString())
    .order("starts_at", { ascending: true })
    .limit(400);
  return (data ?? []) as TeamBooking[];
}

/** Ocupação do intervalo agora (relido do banco antes de gravar). */
async function occupancyNow(
  admin: any,
  accountId: string,
  start: Date,
  end: Date,
  ignoreId?: string,
) {
  const { data } = await admin
    .from("bookings")
    .select(BOOKING_COLS)
    .eq("account_id", accountId)
    .neq("status", "cancelado")
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString());
  return occupancy((data ?? []) as TeamBooking[], start.getTime(), end.getTime(), ignoreId);
}

/** Executa o plano e devolve uma linha por ação ("Confirmado: Ana, sex. 14/11 15:00"). */
export async function executePlan(
  admin: any,
  args: { accountId: string; settings: any; actions: TeamAction[] },
): Promise<string[]> {
  const { accountId, settings } = args;
  const capacity = clampCapacity(settings?.slot_capacity);
  const slotMinutes = Math.max(15, Number(settings?.slot_minutes ?? 60));
  const out: string[] = [];
  for (const a of args.actions) {
    if (a.tipo === "agendar") {
      const start = localDateTimeToUTC(a.data, a.hora);
      if (!start || start.getTime() < Date.now()) {
        out.push(
          `Não agendei ${a.nome}: ${a.data.split("-").reverse().join("/")} ${a.hora} já passou.`,
        );
        continue;
      }
      const end = new Date(start.getTime() + slotMinutes * 60_000);
      const occ = await occupancyNow(admin, accountId, start, end);
      if (occ.blocked || occ.count >= capacity) {
        out.push(`Não agendei ${a.nome}: ${whenText(start.toISOString())} está ocupado.`);
        continue;
      }
      const { error } = await admin.from("bookings").insert({
        account_id: accountId,
        kind: "reserva",
        status: "confirmado",
        contact_name: a.nome,
        phone: a.telefone ? (normalizeWhatsApp(a.telefone) ?? a.telefone) : null,
        notes: TEAM_BOOKED_NOTE,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      });
      out.push(
        error
          ? `Não agendei ${a.nome}: ${error.message}`
          : `Agendado: ${a.nome}, ${whenText(start.toISOString())}`,
      );
      continue;
    }

    // Relê o horário: pode ter mudado desde o plano.
    const { data: b } = await admin
      .from("bookings")
      .select(BOOKING_COLS)
      .eq("id", a.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!b || b.status === "cancelado") {
      out.push("Um dos horários não existe mais ou já foi cancelado.");
      continue;
    }
    const name = (b.contact_name as string | null)?.trim() || b.phone || "sem nome";
    if (a.tipo === "confirmar" || a.tipo === "cancelar") {
      const status = a.tipo === "confirmar" ? "confirmado" : "cancelado";
      const { error } = await admin
        .from("bookings")
        .update({ status })
        .eq("id", a.id)
        .eq("account_id", accountId);
      out.push(
        error
          ? `Não consegui mudar ${name}: ${error.message}`
          : `${a.tipo === "confirmar" ? "Confirmado" : "Cancelado"}: ${name}, ${whenText(b.starts_at)}`,
      );
      continue;
    }
    // Remarcar: mesma duração, novo dia e hora.
    const start = localDateTimeToUTC(a.data, a.hora);
    if (!start || start.getTime() < Date.now()) {
      out.push(`Não remarquei ${name}: o novo horário já passou.`);
      continue;
    }
    const duration = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
    const end = new Date(start.getTime() + duration);
    const occ = await occupancyNow(admin, accountId, start, end, b.id);
    if (occ.blocked || occ.count >= capacity) {
      out.push(`Não remarquei ${name}: ${whenText(start.toISOString())} está ocupado.`);
      continue;
    }
    const { error } = await admin
      .from("bookings")
      .update({ starts_at: start.toISOString(), ends_at: end.toISOString() })
      .eq("id", a.id)
      .eq("account_id", accountId);
    out.push(
      error
        ? `Não remarquei ${name}: ${error.message}`
        : `Remarcado: ${name}, de ${whenText(b.starts_at)} para ${whenText(start.toISOString())}`,
    );
  }
  return out.length ? out : ["Nada para fazer."];
}
