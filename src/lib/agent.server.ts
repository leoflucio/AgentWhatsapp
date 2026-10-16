/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Agente de WhatsApp com memória (extraído do FisioAI).
 *
 * Recebe as mensagens do número conectado (webhook da Evolution), guarda a
 * conversa no banco, decide se responde (modo teste, contatos novos x
 * clientes, conversa assumida pela equipe) e responde com IA. O agente vê os
 * horários livres e RESERVA (não marca): a reserva aparece na agenda para a
 * equipe confirmar.
 */
import { generateText, stepCountIs, tool } from "ai";
import { aiModel } from "@/lib/ai.server";
import { z } from "zod";
import { samePhoneBR } from "@/lib/phone";
import { scheduleText } from "@/lib/agenda-hours";
import {
  formatLocal,
  localDateTimeOf,
  localDateTimeToUTC,
  todayLocalISO,
  type Slot,
} from "@/lib/agenda-time";
import { listFreeSlots, scheduleOf } from "@/lib/agenda.server";
import { sendText, transcribeAudio } from "@/lib/evolution.server";
import {
  buildSystemPrompt,
  cameFromAd,
  cleanReply,
  CALL_TEAM_MINUTES,
  clampTakeoverMinutes,
  DEFAULT_TAKEOVER_MINUTES,
  takeoverUntilISO,
  announcesCheckOnly,
  calendarText,
  inPeriod,
  BURST_WAIT_MS,
  isGroupOrBroadcast,
  onlyAcknowledgments,
  sequentialOffer,
  unverifiedOffer,
  offerText,
  spreadSlots,
  earlierInSamePeriod,
  reservationFollowUp,
  stripClosingOffer,
  phoneOf,
  shouldAgentReply,
  textOf,
  audioOf,
  MAX_AUDIO_SECONDS,
  type EvoIncoming,
} from "@/lib/whatsapp-agent-rules";

const HISTORY_LIMIT = 20;
/**
 * Mensagens literais só desta "sessão" de conversa. O que é mais antigo entra
 * pelo resumo; assim o agente não volta a horários oferecidos em outro dia.
 */
const HISTORY_WINDOW_HOURS = 12;
const SUMMARY_EVERY = 12;

type Ctx = {
  account: { id: string; name: string; address: string | null };
  instance: string;
  token: string | null;
};

export function fmtPhone(digits: string): string {
  const d = digits.replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
}

/** Processa um evento messages.upsert da Evolution. Nunca lança. */
export async function handleAgentWebhook(instance: string, payload: any): Promise<void> {
  try {
    const event = String(payload?.event ?? "")
      .toLowerCase()
      .replace(/_/g, ".");
    if (event && event !== "messages.upsert") return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const list: EvoIncoming[] = Array.isArray(payload?.data)
      ? payload.data
      : payload?.data
        ? [payload.data]
        : [];
    const { data: conn } = await admin
      .from("whatsapp_connections")
      .select("account_id, instance, instance_token")
      .eq("instance", instance)
      .maybeSingle();
    if (!conn) return;
    const { data: account } = await admin
      .from("accounts")
      .select("id, name, address")
      .eq("id", conn.account_id)
      .maybeSingle();
    if (!account) return;
    const ctx: Ctx = { account, instance, token: conn.instance_token ?? null };
    for (const m of list) await handleOne(admin, ctx, m);
  } catch (e) {
    console.error("[agente] falha", e instanceof Error ? e.message : e);
  }
}

/** Chegou mensagem do contato depois desta (outra execução vai responder)? */
async function hasNewerContactMessage(
  admin: any,
  conversationId: string,
  createdAt: string,
): Promise<boolean> {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("author", "contato")
    .gt("created_at", createdAt)
    .limit(1);
  return (data ?? []).length > 0;
}

async function handleOne(admin: any, ctx: Ctx, m: EvoIncoming) {
  if (isGroupOrBroadcast(m.key?.remoteJid)) return;
  const phone = phoneOf(m);
  if (!phone) return;
  const accountId = ctx.account.id;
  const now = new Date().toISOString();
  const text = textOf(m);

  // Conversa (memória) desta pessoa.
  const { data: existing } = await admin
    .from("conversations")
    .select("*")
    .eq("account_id", accountId)
    .eq("phone", phone)
    .maybeSingle();
  let conv = existing;
  if (!conv) {
    const { data: created } = await admin
      .from("conversations")
      .insert({
        account_id: accountId,
        phone,
        contact_name: m.key?.fromMe ? null : (m.pushName ?? null),
        from_ad: cameFromAd(m),
        last_message_at: now,
      })
      .select("*")
      .single();
    conv = created;
  }
  if (!conv) return;

  const { data: settings } = await admin
    .from("agent_settings")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  // Mensagem enviada pelo celular do negócio (não pelo agente): a equipe
  // assumiu. O agente fica em silêncio nesta conversa e volta sozinho depois
  // do intervalo configurado sem a equipe responder (cada mensagem renova).
  if (m.key?.fromMe) {
    if (!text) return;
    // Eco de uma resposta do próprio agente (registrada antes do envio).
    const { data: echo } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("author", "agente")
      .eq("body", text)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .limit(1);
    if ((echo ?? []).length > 0) return;
    const { error } = await admin.from("messages").insert({
      conversation_id: conv.id,
      account_id: accountId,
      author: "equipe",
      body: text,
      wa_message_id: m.key?.id ?? null,
    });
    if (error) return; // é o eco de uma mensagem do próprio agente
    await admin
      .from("conversations")
      .update({
        takeover_until: takeoverUntilISO(
          Date.now(),
          settings?.takeover_minutes ?? DEFAULT_TAKEOVER_MINUTES,
        ),
        attention_reason: null,
        last_message_at: now,
      })
      .eq("id", conv.id);
    return;
  }

  // Áudio: transcreve para o agente "ouvir" a mensagem.
  let body = text;
  const audio = audioOf(m);
  if (!body && audio) {
    const heard =
      audio.seconds <= MAX_AUDIO_SECONDS
        ? await transcribeAudio(ctx.instance, m.key?.id, audio.mimetype)
        : null;
    body = heard
      ? `[áudio transcrito] ${heard}`
      : audio.seconds > MAX_AUDIO_SECONDS
        ? "(o contato enviou um áudio longo; peça um resumo por escrito)"
        : "(o contato enviou um áudio que não foi possível ouvir; peça para escrever)";
  }
  body = body || "(o contato enviou foto, vídeo ou arquivo, sem texto)";
  const { data: mine, error: dup } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      account_id: accountId,
      author: "contato",
      body,
      wa_message_id: m.key?.id ?? null,
    })
    .select("id, created_at")
    .single();
  if (dup || !mine) return; // reenvio do mesmo evento
  await admin
    .from("conversations")
    .update({
      last_message_at: now,
      ...(cameFromAd(m) ? { from_ad: true } : {}),
      ...(!conv.contact_name && m.pushName ? { contact_name: m.pushName } : {}),
    })
    .eq("id", conv.id);

  const takeover =
    conv.human_takeover || (conv.takeover_until && new Date(conv.takeover_until) > new Date());
  const gate = shouldAgentReply({
    gate: {
      enabled: Boolean(settings?.enabled),
      testMode: settings?.test_mode !== false,
      testNumbers: (settings?.test_numbers ?? []) as string[],
      replyPatients: settings?.reply_clients === true,
    },
    phone,
    isPatient: Boolean(conv.is_client),
    humanTakeover: Boolean(takeover),
  });
  if (!gate.reply) {
    console.log("[agente] sem resposta:", gate.reason);
    return;
  }

  // Várias mensagens seguidas ("Lombar", "Dorsal"): cada uma chega num
  // webhook próprio, em paralelo. Só a mais recente responde, vendo todas.
  await new Promise((resolve) => setTimeout(resolve, BURST_WAIT_MS));
  if (await hasNewerContactMessage(admin, conv.id, mine.created_at)) return;

  // "Ok", "Combinado", "Obrigado" sem pergunta pendente do agente: a conversa
  // terminou bem; responder de novo só gera "posso ajudar?" repetido.
  const { data: lastAgent } = await admin
    .from("messages")
    .select("body, created_at")
    .eq("conversation_id", conv.id)
    .eq("author", "agente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastAgent) {
    const { data: pending } = await admin
      .from("messages")
      .select("body")
      .eq("conversation_id", conv.id)
      .eq("author", "contato")
      .gt("created_at", lastAgent.created_at);
    const bodies = ((pending ?? []) as any[]).map((p) => String(p.body ?? ""));
    if (onlyAcknowledgments(bodies, String(lastAgent.body ?? ""))) return;
  }

  const out = await generateAgentReply(admin, { ctx, settings, conv, phone });
  const toSend = [out?.text ?? "", ...(out?.followUps ?? [])].filter((t) => t.trim());
  if (toSend.length === 0) {
    console.log("[agente] resposta vazia da IA", conv.id);
    return;
  }
  // Chegou outra mensagem enquanto a IA pensava: a resposta já está velha e
  // a execução da mensagem nova responde tudo. Se esta mexeu na agenda ou
  // chamou a equipe, envia assim mesmo (a pessoa precisa saber).
  if (!out?.acted && (await hasNewerContactMessage(admin, conv.id, mine.created_at))) return;

  for (const reply of toSend) {
    // Registra ANTES de enviar: o eco da mensagem (fromMe) é reconhecido como
    // do agente e não como a equipe assumindo a conversa.
    const { data: saved } = await admin
      .from("messages")
      .insert({ conversation_id: conv.id, account_id: accountId, author: "agente", body: reply })
      .select("id")
      .single();
    try {
      const sent = await sendText({
        instance: ctx.instance,
        token: ctx.token,
        to: phone,
        text: reply,
      });
      const waId = sent?.key?.id ?? null;
      if (saved?.id && waId) {
        await admin.from("messages").update({ wa_message_id: waId }).eq("id", saved.id);
      }
    } catch (e) {
      console.error("[agente] envio falhou", e instanceof Error ? e.message : e);
      return;
    }
  }
  await maybeSummarize(admin, conv.id);
}

async function generateAgentReply(
  admin: any,
  args: { ctx: Ctx; settings: any; conv: any; phone: string },
): Promise<{ text: string; followUps: string[]; acted: boolean } | null> {
  const model = aiModel("main");
  if (!model) return null;
  // Mensagens automáticas enviadas depois da resposta (endereço).
  const followUps: string[] = [];
  // Alguma ferramenta mudou a agenda ou chamou a equipe nesta resposta.
  let acted = false;
  const { ctx, settings, conv, phone } = args;
  const accountId = ctx.account.id;
  // A IA só vê e devolve data e hora LOCAIS (Brasília). Nunca ISO/UTC: com
  // "T19:00Z" na mão ela escrevia "T16:00Z" para "16h" e reservava 13h.
  const slotOut = (sl: { start: string; label: string }) => ({
    ...localDateTimeOf(sl.start),
    horario: sl.label,
  });
  const slotMinutes = Math.max(15, Number(settings?.slot_minutes ?? 60));
  const schedule = scheduleOf(settings);
  const sequential = settings?.sequential_fill !== false;
  // Sem agenda, o agente só informa e passa para a equipe o que precisar de ação.
  const booking = settings?.booking_enabled !== false;
  const today = todayLocalISO();
  const freeFrom = (fromDate: string, days: number, maxResults: number): Promise<Slot[]> =>
    listFreeSlots(admin, {
      accountId,
      schedule,
      fromDate,
      days,
      durationMin: slotMinutes,
      maxResults,
    });

  const { data: history } = await admin
    .from("messages")
    .select("author, body, created_at")
    .eq("conversation_id", conv.id)
    .gte("created_at", new Date(Date.now() - HISTORY_WINDOW_HOURS * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const messages = ((history ?? []) as any[]).reverse().map((h) => ({
    role: h.author === "contato" ? ("user" as const) : ("assistant" as const),
    content: h.body as string,
  }));

  // Horários futuros desta pessoa: reservas do agente e horários já confirmados.
  const { data: upcoming } = await admin
    .from("bookings")
    .select("id, starts_at, status, contact_name, phone, conversation_id")
    .eq("account_id", accountId)
    .eq("kind", "reserva")
    .neq("status", "cancelado")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);
  const mineRows = ((upcoming ?? []) as any[]).filter(
    (b) => b.conversation_id === conv.id || (b.phone && samePhoneBR(b.phone, phone)),
  );
  const holdList = mineRows
    .filter((b) => b.status === "reservado")
    .slice(0, 3)
    .map((b) => ({
      id: b.id as string,
      starts_at: b.starts_at as string,
      contact_name: (b.contact_name as string | null) ?? null,
    }));
  const myAppts = mineRows.filter((b) => b.status === "confirmado").slice(0, 3);
  const holdText = holdList.map((h) => formatLocal(h.starts_at)).join(", ");
  const apptText = myAppts.map((a) => formatLocal(a.starts_at)).join(", ");

  const contact = [
    conv.is_client
      ? `Já é cliente${conv.contact_name ? `: ${conv.contact_name}` : ""}.`
      : `Contato novo${conv.contact_name ? `, nome no WhatsApp: ${conv.contact_name}` : ""}.`,
    conv.from_ad ? "Chegou por um anúncio." : "",
    !booking
      ? ""
      : apptText
        ? `Já tem horário confirmado na agenda: ${apptText}. NÃO ofereça horário de novo; para mudar ou desmarcar esse horário, use chamar_atendente.`
        : "",
    !booking
      ? ""
      : holdText
        ? `Já tem horário reservado por aqui: ${holdText}. NÃO ofereça horário de novo; só troque (trocar_reserva) ou desmarque (cancelar_reserva) se a pessoa pedir.`
        : apptText
          ? ""
          : "Ainda não tem horário reservado.",
    conv.summary ? `Resumo das conversas anteriores: ${conv.summary}` : "Primeira conversa.",
    // Já respondeu antes (nesta conversa ou em outra, pelo resumo): não se reapresenta.
    messages.some((x) => x.role === "assistant") || conv.summary
      ? "Você JÁ se apresentou a esta pessoa: NÃO repita a apresentação nem o nome do negócio no começo; vá direto ao ponto."
      : "Esta é a sua primeira resposta a esta pessoa: apresente-se uma única vez.",
  ]
    .filter(Boolean)
    .join(" ");

  const instructions = [
    ctx.account.address ? `Endereço: ${ctx.account.address}.` : "",
    (settings?.instructions ?? "").trim(),
  ]
    .filter(Boolean)
    .join("\n");
  const system = buildSystemPrompt({
    hours: scheduleText(schedule),
    agentName: settings?.agent_name,
    businessName: ctx.account.name,
    segment: settings?.segment,
    booking,
    health: settings?.health_rules === true,
    instructions,
    today: today.split("-").reverse().join("/"),
    calendar: calendarText(today, 14),
    contact,
    sequentialFill: sequential,
  });

  const dataField = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Data AAAA-MM-DD, exatamente como veio de horarios_livres");
  const horaField = z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .describe("Hora local HH:MM (horário de Brasília), exatamente como veio de horarios_livres");

  /** Confere que o horário pedido está livre; se não, devolve as alternativas. */
  const findFreeSlot = async (
    data: string,
    hora: string,
  ): Promise<{ slot: Slot } | { error: string }> => {
    const start = localDateTimeToUTC(data, hora);
    if (!start || start.getTime() <= Date.now()) {
      return { error: "Horário inválido. Consulte horarios_livres de novo." };
    }
    const free = await freeFrom(data, 1, 50);
    const slot = free.find((sl) => new Date(sl.start).getTime() === start.getTime());
    if (slot) return { slot };
    // Fora do horário de atendimento do dia (ou não cabe na duração do horário)?
    const weekday = new Date(`${data}T12:00:00Z`).getUTCDay();
    const startMin = Number(hora.split(":")[0]) * 60 + Number(hora.split(":")[1]);
    const inHours = (schedule[weekday] ?? []).some(
      (w) => startMin >= w.start && startMin + slotMinutes <= w.end,
    );
    const reason = inHours
      ? "Este horário está ocupado"
      : "Este horário está fora do horário de atendimento nesse dia";
    const near = await freeFrom(data >= today ? data : today, 7, 4);
    return {
      error: near.length
        ? `${reason}. NÃO diga que está livre. Ofereça estes horários livres: ${near
            .map((n) => {
              const l = localDateTimeOf(n.start);
              return `${n.label} (data: ${l.data}, hora: ${l.hora})`;
            })
            .join("; ")}.`
        : `${reason} e não há outros livres nos próximos dias. Use chamar_atendente.`,
    };
  };

  /**
   * Troca a reserva desta pessoa por outro horário livre: grava a nova antes
   * de liberar a antiga, para ela nunca ficar sem horário.
   */
  const swapHold = async (
    old: (typeof holdList)[number],
    data: string,
    hora: string,
  ): Promise<string> => {
    const wanted = localDateTimeToUTC(data, hora);
    if (wanted && wanted.getTime() === new Date(old.starts_at).getTime()) {
      return `Este já é o horário reservado (${formatLocal(old.starts_at)}).`;
    }
    const found = await findFreeSlot(data, hora);
    if ("error" in found) return found.error;
    const slot = found.slot;
    const { data: created, error } = await admin
      .from("bookings")
      .insert({
        account_id: accountId,
        conversation_id: conv.id,
        kind: "reserva",
        status: "reservado",
        contact_name: old.contact_name,
        phone,
        notes: "Trocado pelo agente de WhatsApp.",
        starts_at: slot.start,
        ends_at: slot.end,
      })
      .select("id")
      .single();
    if (error || !created) return "Não foi possível trocar agora. Use chamar_atendente.";
    acted = true;
    const { error: delErr } = await admin
      .from("bookings")
      .update({ status: "cancelado" })
      .eq("id", old.id)
      .eq("status", "reservado");
    if (delErr) {
      await admin.from("bookings").delete().eq("id", created.id);
      return "Não foi possível trocar agora. Use chamar_atendente.";
    }
    holdList.splice(0, 1, { ...old, id: created.id, starts_at: slot.start });
    return `Reserva trocada para ${slot.label}; o horário anterior (${formatLocal(old.starts_at)}) foi liberado. Diga que a equipe vai confirmar o novo horário.`;
  };

  const tools = {
    horarios_livres: tool({
      description: `Lista horários livres na agenda. Use antes de oferecer horários. Se a pessoa pediu um dia ou período ("sexta pela manhã"), passe a_partir_de com a data do CALENDÁRIO, dias = 1 e o periodo.`,
      inputSchema: z.object({
        a_partir_de: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Data inicial AAAA-MM-DD (padrão: hoje)"),
        dias: z.number().int().min(1).max(14).optional().describe("Quantos dias olhar (padrão 7)"),
        periodo: z
          .enum(["manha", "tarde", "noite"])
          .optional()
          .describe("Só manhã (antes das 12h), tarde (12h–18h) ou noite (depois das 18h)"),
      }),
      execute: async (input) => {
        const slots = await freeFrom(
          input.a_partir_de && input.a_partir_de >= today ? input.a_partir_de : today,
          input.dias ?? 7,
          80,
        );
        const wanted = slots.map(slotOut).filter((o) => inPeriod(o.hora, input.periodo));
        const oneDay = (input.dias ?? 7) === 1;
        const strip = <T extends { day: string }>(list: T[]) =>
          list.map(({ day: _day, ...o }) => o);
        const byDay = wanted.map((o) => ({ ...o, day: o.data }));
        const none = `Sem horários livres ${oneDay ? "nesse dia" : "no período consultado"}${input.periodo ? ` (${input.periodo === "manha" ? "manhã" : input.periodo})` : ""}. Diga isso e ofereça olhar outro dia ou período.`;
        if (!sequential) {
          // Vários dias: até 2 por dia, para oferecer opções em dias diferentes.
          // Um dia só: todos os horários livres daquele dia (até 8).
          const spread = strip(spreadSlots(byDay, oneDay ? 8 : 2, 8));
          return spread.length ? spread : none;
        }
        // Preenchimento sequencial: os dois mais cedo primeiro; o resto só
        // se a pessoa não puder nesses.
        const offer = sequentialOffer(byDay, { oneDay });
        return offer.ofereca.length
          ? {
              ofereca: strip(offer.ofereca),
              se_nao_puder: strip(offer.se_nao_puder),
              regra:
                "Ofereça os horários de 'ofereca', nessa ordem (preenchemos a agenda do mais cedo para o mais tarde). Use 'se_nao_puder' só se a pessoa não puder nesses.",
            }
          : none;
      },
    }),
    conferir_horario: tool({
      description:
        "Confere se um dia e hora específicos estão livres (ex.: a pessoa pediu 'sexta às 8h'). Se estiver ocupado, devolve os horários livres mais próximos.",
      inputSchema: z.object({ data: dataField, hora: horaField }),
      execute: async ({ data, hora }) => {
        const found = await findFreeSlot(data, hora);
        if ("error" in found) return found.error;
        // Preenchimento sequencial: há horários livres antes, no mesmo período?
        const sameDay = sequential ? await freeFrom(data, 1, 50) : [];
        const earlier = earlierInSamePeriod(sameDay.map(slotOut), hora).slice(0, 2);
        if (earlier.length) {
          return `Livre: ${found.slot.label}. Mas há horários livres mais cedo nesse dia: ${earlier
            .map((e) => `${e.horario} (data: ${e.data}, hora: ${e.hora})`)
            .join(
              "; ",
            )}. O negócio preenche a agenda em sequência: explique com gentileza que há opção mais cedo e ofereça primeiro ${earlier[0]!.horario}. Se a pessoa disser que não pode mais cedo (ou já disse), reserve ${found.slot.label} sem insistir.`;
        }
        return `Livre: ${found.slot.label}. Pode oferecer este horário e, se a pessoa aceitar, pedir o nome e reservar.`;
      },
    }),
    reservar_horario: tool({
      description:
        "Reserva (não marca) um horário livre da agenda para esta pessoa. A equipe confirma depois. Se ela já tem reserva feita por aqui, troca a reserva para o novo horário (a antiga é liberada).",
      inputSchema: z.object({
        data: dataField,
        hora: horaField,
        nome: z.string().min(2).describe("Nome completo da pessoa"),
      }),
      execute: async ({ data, hora, nome }) => {
        // Já tem reserva feita por aqui: é uma troca (nunca duas reservas).
        if (holdList[0]) return swapHold(holdList[0], data, hora);
        const found = await findFreeSlot(data, hora);
        if ("error" in found) return found.error;
        const slot = found.slot;
        const { error } = await admin.from("bookings").insert({
          account_id: accountId,
          conversation_id: conv.id,
          kind: "reserva",
          status: "reservado",
          contact_name: nome.trim(),
          phone,
          notes: "Reservado pelo agente de WhatsApp.",
          starts_at: slot.start,
          ends_at: slot.end,
        });
        if (error) return "Não foi possível reservar agora. Use chamar_atendente.";
        acted = true;
        await admin.from("conversations").update({ contact_name: nome.trim() }).eq("id", conv.id);
        const follow = reservationFollowUp({ address: ctx.account.address });
        if (follow) followUps.push(follow);
        return `Reservado: ${slot.label}. Diga que a equipe vai confirmar o agendamento.${
          follow
            ? " O endereço será enviado automaticamente logo depois da sua resposta: não escreva o endereço."
            : " Informe também o endereço (das instruções), se houver."
        }`;
      },
    }),
    trocar_reserva: tool({
      description:
        "Muda a reserva que esta pessoa já fez por aqui para outro horário livre. A reserva antiga é liberada. Use só quando a pessoa pedir para mudar o horário.",
      inputSchema: z.object({ data: dataField, hora: horaField }),
      execute: async ({ data, hora }) => {
        const old = holdList[0];
        if (!old) return "Esta pessoa não tem reserva feita por aqui. Use reservar_horario.";
        return swapHold(old, data, hora);
      },
    }),
    cancelar_reserva: tool({
      description:
        "Desmarca a reserva que esta pessoa fez por aqui e libera o horário. Use só quando ela pedir para desmarcar ou cancelar.",
      inputSchema: z.object({}),
      execute: async () => {
        const old = holdList[0];
        if (!old) return "Esta pessoa não tem reserva feita por aqui.";
        const { error } = await admin
          .from("bookings")
          .update({ status: "cancelado" })
          .eq("id", old.id)
          .eq("status", "reservado");
        if (error) return "Não foi possível desmarcar agora. Use chamar_atendente.";
        acted = true;
        holdList.splice(0, 1);
        return `Reserva de ${formatLocal(old.starts_at)} desmarcada e horário liberado.`;
      },
    }),
    chamar_atendente: tool({
      description:
        "Passa a conversa para a equipe (urgência, reclamação, pedido de falar com pessoa, dúvida sem resposta).",
      inputSchema: z.object({ motivo: z.string().describe("Motivo curto") }),
      execute: async ({ motivo }) => {
        acted = true;
        await admin
          .from("conversations")
          .update({
            // A equipe ainda não respondeu: espera mais antes de o agente voltar.
            takeover_until: takeoverUntilISO(
              Date.now(),
              Math.max(CALL_TEAM_MINUTES, clampTakeoverMinutes(settings?.takeover_minutes)),
            ),
          })
          .eq("id", conv.id);
        await admin
          .from("conversations")
          .update({ attention_reason: motivo.slice(0, 300) })
          .eq("id", conv.id);
        return "A equipe foi avisada. Diga que alguém da equipe vai responder em breve.";
      },
    }),
  };

  // Sem agenda, a IA só pode chamar a equipe.
  const activeTools = booking ? undefined : (["chamar_atendente"] as Array<keyof typeof tools>);
  const run = (msgs: typeof messages, extraSystem = "") =>
    generateText({
      model,
      system: extraSystem ? `${system}\n\n${extraSystem}` : system,
      messages: msgs,
      tools,
      activeTools,
      stopWhen: stepCountIs(8),
      temperature: 0.3,
      maxRetries: 1,
    });
  let result = await run(messages);
  // Resposta que só promete "vou verificar" (sem trazer os horários): roda de
  // novo, já com o que foi consultado, pedindo a resposta final.
  if (!result.text.trim() || announcesCheckOnly(result.text)) {
    result = await run(
      [...messages, ...(result.response.messages as typeof messages)],
      booking
        ? "Responda AGORA com o resultado: se for oferecer horários, chame horarios_livres e já ofereça duas opções. Não diga que vai verificar nem peça desculpas pela agenda."
        : "Responda AGORA com o que está nas instruções; se a informação não estiver lá, use chamar_atendente. Não diga que vai verificar.",
    );
  }
  // Horário citado que a agenda não devolveu nesta rodada (a IA às vezes
  // oferece horários de cabeça, já ocupados): consulta de novo, à força.
  const known = [...holdList.map((h) => h.starts_at), ...myAppts.map((a) => a.starts_at as string)]
    .map((iso) => {
      const l = localDateTimeOf(iso);
      return `${l.data} ${l.hora}`;
    })
    .join(" ");
  const verified = (r: typeof result) => {
    const bad = unverifiedOffer(
      r.text,
      `${known} ${JSON.stringify(r.steps.map((st) => [st.toolCalls, st.toolResults]))}`,
    );
    if (bad.length) console.warn("[agente] horário não conferido na resposta:", bad);
    return bad.length === 0;
  };
  if (booking && !verified(result)) {
    const retry = await generateText({
      model,
      system: `${system}\n\nConsulte a agenda agora com horarios_livres (ou conferir_horario, se a pessoa pediu dia e hora) e ofereça SOMENTE os horários devolvidos. Os horários que estavam na sua resposta anterior não foram conferidos e podem estar ocupados.`,
      messages,
      tools,
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 ? { toolChoice: "required" as const } : {},
      stopWhen: stepCountIs(8),
      temperature: 0.3,
      maxRetries: 1,
    });
    if (retry.text.trim() && verified(retry)) {
      result = retry;
    } else if (holdList.length || myAppts.length) {
      // Já tem horário: nunca oferece outro por conta própria.
      if (retry.text.trim()) result = retry;
    } else {
      // Ainda sem conferir: oferece os horários livres montados aqui.
      type Free = { data: string; hora: string }[];
      const free = (await tools.horarios_livres.execute!(
        {},
        { toolCallId: "conferencia", messages: [] },
      )) as string | Free | { ofereca: Free };
      const slots = typeof free === "string" ? [] : Array.isArray(free) ? free : free.ofereca;
      const text = offerText(slots);
      return { text: text ?? (typeof free === "string" ? free : ""), followUps, acted };
    }
  }
  const reply = stripClosingOffer(cleanReply(result.text));
  return { text: reply, followUps, acted };
}

/** Atualiza o resumo da conversa a cada SUMMARY_EVERY mensagens (memória longa). */
async function maybeSummarize(admin: any, conversationId: string) {
  const model = aiModel("lite");
  if (!model) return;
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  const { data: conv } = await admin
    .from("conversations")
    .select("summary, summarized_count")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || (count ?? 0) - (conv.summarized_count ?? 0) < SUMMARY_EVERY) return;
  const { data: msgs } = await admin
    .from("messages")
    .select("author, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  const transcript = ((msgs ?? []) as any[])
    .reverse()
    .map((x) => `${x.author}: ${x.body}`)
    .join("\n");
  try {
    const r = await generateText({
      model,
      system:
        "Resuma em até 5 frases o que se sabe deste contato de WhatsApp de um negócio: nome, interesse ou necessidade, dúvidas, objeções, horários efetivamente reservados e próximos passos. Não registre horários que foram só oferecidos e não reservados. Sem dados sensíveis desnecessários.",
      prompt: `${conv.summary ? `Resumo anterior: ${conv.summary}\n\n` : ""}Conversa recente:\n${transcript}`,
      maxRetries: 1,
    });
    await admin
      .from("conversations")
      .update({ summary: r.text.trim().slice(0, 2000), summarized_count: count ?? 0 })
      .eq("id", conversationId);
  } catch (e) {
    console.error("[agente] resumo falhou", e instanceof Error ? e.message : e);
  }
}
