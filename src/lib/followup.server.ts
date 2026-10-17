/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Retomada (follow-up): procura conversas que pararam sem fechar e manda UMA
 * mensagem escrita pela IA. Roda sozinha de tempos em tempos (startFollowUpTimer,
 * ligado em src/server.ts). As regras de quem entra ficam em followup-rules.ts.
 */
import { generateText } from "ai";
import { aiModel } from "@/lib/ai.server";
import { DEFAULT_SCHEDULE, parseSchedule } from "@/lib/agenda-hours";
import { phoneMatchKey, samePhoneBR } from "@/lib/phone";
import { cleanReply, shouldAgentReply } from "@/lib/whatsapp-agent-rules";
import {
  FOLLOWUP_BATCH,
  FOLLOWUP_MAX_AGE_DAYS,
  FOLLOWUP_SKIP,
  clampFollowUpDays,
  followUpSystemPrompt,
  followUpVerdict,
  inSendWindow,
  isFollowUpSkip,
} from "@/lib/followup-rules";

const DAY = 86_400_000;
/** Intervalo entre as rodadas automáticas. */
const EVERY_MS = 30 * 60_000;

type Candidate = { id: string; phone: string; contact_name: string | null; summary: string | null };

async function hasBooking(admin: any, accountId: string, convId: string, phone: string) {
  const { data } = await admin
    .from("bookings")
    .select("phone, conversation_id")
    .eq("account_id", accountId)
    .eq("kind", "reserva")
    .neq("status", "cancelado")
    .order("starts_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as any[]).some(
    (b) => b.conversation_id === convId || (b.phone && samePhoneBR(b.phone, phone)),
  );
}

async function listedAsClient(admin: any, accountId: string, phone: string): Promise<boolean> {
  const key = phoneMatchKey(phone);
  if (!key) return false;
  const { data, error } = await admin
    .from("contacts")
    .select("is_client")
    .eq("account_id", accountId)
    .eq("phone_key", key)
    .maybeSingle();
  return !error && Boolean(data?.is_client);
}

/** Conversas paradas há `days` dias ou mais que não fecharam. Só leitura. */
export async function findFollowUpCandidates(
  admin: any,
  accountId: string,
  days: number,
  now = Date.now(),
): Promise<Candidate[]> {
  const d = clampFollowUpDays(days);
  const { data: convs } = await admin
    .from("conversations")
    .select(
      "id, phone, contact_name, summary, is_client, human_takeover, takeover_until, attention_reason, last_message_at, followup_sent_at",
    )
    .eq("account_id", accountId)
    .is("followup_sent_at", null)
    .eq("is_client", false)
    .lte("last_message_at", new Date(now - d * DAY).toISOString())
    .gte("last_message_at", new Date(now - FOLLOWUP_MAX_AGE_DAYS * DAY).toISOString())
    .order("last_message_at", { ascending: false })
    .limit(100);
  const out: Candidate[] = [];
  for (const c of (convs ?? []) as any[]) {
    const base = {
      lastMessageAt: c.last_message_at as string,
      followUpSentAt: c.followup_sent_at as string | null,
      lastFromBusiness: true,
      contactWrote: true,
      isClient: Boolean(c.is_client),
      hasBooking: false,
      humanTakeover: Boolean(c.human_takeover),
      takeoverUntil: c.takeover_until as string | null,
      attentionReason: c.attention_reason as string | null,
    };
    // Filtros baratos primeiro; as consultas extras só para quem sobra.
    if (!followUpVerdict(base, d, now).ok) continue;
    const { data: last } = await admin
      .from("messages")
      .select("author")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id)
      .eq("author", "contato");
    const facts = {
      ...base,
      lastFromBusiness: Boolean(last) && last.author !== "contato",
      contactWrote: (count ?? 0) > 0,
      isClient: await listedAsClient(admin, accountId, c.phone),
      hasBooking: await hasBooking(admin, accountId, c.id, c.phone),
    };
    if (!followUpVerdict(facts, d, now).ok) continue;
    out.push({
      id: c.id,
      phone: c.phone,
      contact_name: c.contact_name ?? null,
      summary: c.summary ?? null,
    });
  }
  return out;
}

/** A IA escreve a retomada a partir da conversa, ou devolve null para pular. */
async function writeFollowUp(
  admin: any,
  args: { settings: any; businessName: string; conv: Candidate },
): Promise<string | null> {
  const model = aiModel("main");
  if (!model) throw new Error("IA não configurada (AI_API_KEY)");
  const { data: msgs } = await admin
    .from("messages")
    .select("author, body")
    .eq("conversation_id", args.conv.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const transcript = ((msgs ?? []) as any[])
    .reverse()
    .map((m) => `${m.author === "contato" ? "Contato" : "Negócio"}: ${m.body}`)
    .join("\n");
  const s = args.settings;
  const r = await generateText({
    model,
    system: followUpSystemPrompt({
      businessName: args.businessName,
      segment: s?.segment,
      agentName: s?.agent_name,
      instructions: s?.instructions,
      booking: s?.booking_enabled !== false,
    }),
    prompt: `${args.conv.summary ? `Resumo das conversas anteriores: ${args.conv.summary}\n\n` : ""}${
      args.conv.contact_name ? `Nome no WhatsApp: ${args.conv.contact_name}\n\n` : ""
    }Conversa:\n${transcript}\n\nEscreva a mensagem de retomada (ou ${FOLLOWUP_SKIP}).`,
    temperature: 0.3,
    maxRetries: 1,
  });
  const text = cleanReply(r.text);
  if (!text || isFollowUpSkip(text)) return null;
  return text.slice(0, 600);
}

/**
 * Envia as retomadas de uma conta (até FOLLOWUP_BATCH por rodada).
 * Respeita agente ligado, opção ligada, horário de atendimento, modo teste e cota.
 */
export async function runFollowUps(admin: any, settings: any, now = new Date()) {
  const result = { sent: 0, skipped: 0, failed: 0, reason: "" };
  if (!settings?.enabled || !settings?.followup_enabled) return { ...result, reason: "desligado" };
  const schedule = parseSchedule(settings.schedule) ?? DEFAULT_SCHEDULE;
  if (!inSendWindow(schedule, now)) return { ...result, reason: "fora do horário" };
  const accountId = settings.account_id as string;

  const [{ data: conn }, { data: account }] = await Promise.all([
    admin
      .from("whatsapp_connections")
      .select("instance, instance_token")
      .eq("account_id", accountId)
      .maybeSingle(),
    admin.from("accounts").select("name").eq("id", accountId).maybeSingle(),
  ]);
  if (!conn?.instance) return { ...result, reason: "sem WhatsApp" };

  const candidates = await findFollowUpCandidates(
    admin,
    accountId,
    settings.followup_days,
    now.getTime(),
  );
  const allowed = candidates.filter(
    (c) =>
      shouldAgentReply({
        gate: {
          enabled: true,
          testMode: settings.test_mode !== false,
          testNumbers: (settings.test_numbers ?? []) as string[],
          replyPatients: false,
        },
        phone: c.phone,
        isPatient: false,
        humanTakeover: false,
      }).reply,
  );
  if (allowed.length === 0) return result;

  const { resolveAccess } = await import("@/lib/billing.server");
  const { canReply } = await import("@/lib/billing-rules");
  const { access, used } = await resolveAccess(admin, accountId);
  const { sendText } = await import("@/lib/evolution.server");

  for (const c of allowed.slice(0, FOLLOWUP_BATCH)) {
    const quota = canReply(access, used + result.sent);
    if (!quota.ok) return { ...result, reason: quota.reason };
    let text: string | null;
    try {
      text = await writeFollowUp(admin, {
        settings,
        businessName: account?.name ?? "o negócio",
        conv: c,
      });
    } catch (e) {
      console.error("[retomada] IA", e instanceof Error ? e.message : e);
      result.failed++;
      continue; // tenta de novo na próxima rodada
    }
    const stamp = new Date().toISOString();
    if (!text) {
      await admin
        .from("conversations")
        .update({ followup_sent_at: stamp, followup_status: "pulado" })
        .eq("id", c.id)
        .is("followup_sent_at", null);
      result.skipped++;
      continue;
    }
    // Marca antes de enviar: duas rodadas seguidas nunca mandam duas vezes.
    const { data: claimed } = await admin
      .from("conversations")
      .update({ followup_sent_at: stamp, followup_status: "enviando" })
      .eq("id", c.id)
      .is("followup_sent_at", null)
      .select("id");
    if ((claimed ?? []).length === 0) continue;
    // Registra ANTES de enviar: o eco (fromMe) é reconhecido como do agente.
    const { data: saved } = await admin
      .from("messages")
      .insert({ conversation_id: c.id, account_id: accountId, author: "agente", body: text })
      .select("id")
      .single();
    try {
      const sent = await sendText({
        instance: conn.instance,
        token: conn.instance_token ?? null,
        to: c.phone,
        text,
      });
      const waId = sent?.key?.id ?? null;
      if (saved?.id && waId) {
        await admin.from("messages").update({ wa_message_id: waId }).eq("id", saved.id);
      }
      await admin
        .from("conversations")
        .update({ followup_status: "enviado", last_message_at: stamp })
        .eq("id", c.id);
      result.sent++;
    } catch (e) {
      console.error("[retomada] envio", e instanceof Error ? e.message : e);
      if (saved?.id) await admin.from("messages").delete().eq("id", saved.id);
      await admin.from("conversations").update({ followup_status: "falhou" }).eq("id", c.id);
      result.failed++;
    }
  }
  return result;
}

/** Uma rodada para todas as contas com a retomada ligada. */
export async function runAllFollowUps() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: list, error } = await admin
    .from("agent_settings")
    .select("*")
    .eq("enabled", true)
    .eq("followup_enabled", true)
    .limit(1000);
  if (error) {
    // Migration da retomada ainda não rodada: fica quieto.
    if (!/followup_enabled/.test(error.message)) console.error("[retomada]", error.message);
    return;
  }
  for (const settings of list ?? []) {
    try {
      const r = await runFollowUps(admin, settings);
      if (r.sent || r.skipped || r.failed) console.log("[retomada]", settings.account_id, r);
    } catch (e) {
      console.error("[retomada] conta", settings.account_id, e instanceof Error ? e.message : e);
    }
  }
}

/** Liga as rodadas automáticas (uma vez por processo). FOLLOWUP_TIMER=off desliga. */
export function startFollowUpTimer() {
  const g = globalThis as { __followUpTimer?: boolean };
  if (g.__followUpTimer || process.env.FOLLOWUP_TIMER === "off") return;
  g.__followUpTimer = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runAllFollowUps();
    } catch (e) {
      console.error("[retomada]", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 2 * 60_000);
  setInterval(() => void tick(), EVERY_MS).unref?.();
}
