/* eslint-disable @typescript-eslint/no-explicit-any */
// Telas do agente: configuração, conversas ("assumir conversa") e agenda.
// Escritas pelo servidor (service role), sempre filtradas pela conta do usuário.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NO_AUTO_RETURN, clampTakeoverMinutes, takeoverUntilISO } from "@/lib/whatsapp-agent-rules";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

const windowSchema = z.object({
  start: z.number().int().min(0).max(1440),
  end: z.number().int().min(0).max(1440),
});

export const getAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { data } = await admin
      .from("agent_settings")
      .select("*")
      .eq("account_id", account.id)
      .maybeSingle();
    const { DEFAULT_SCHEDULE, parseSchedule } = await import("@/lib/agenda-hours");
    return {
      businessName: account.name,
      address: account.address ?? "",
      enabled: Boolean(data?.enabled),
      testMode: data?.test_mode !== false,
      testNumbers: ((data?.test_numbers ?? []) as string[]).join("\n"),
      agentName: (data?.agent_name as string | null) ?? "",
      segment: (data?.segment as string | null) ?? "",
      bookingEnabled: data?.booking_enabled !== false,
      healthRules: data?.health_rules === true,
      instructions: (data?.instructions as string | null) ?? "",
      replyClients: data?.reply_clients === true,
      takeoverMinutes: clampTakeoverMinutes(data?.takeover_minutes),
      slotMinutes: Number(data?.slot_minutes ?? 60),
      sequentialFill: data?.sequential_fill !== false,
      followupEnabled: data?.followup_enabled === true,
      followupDays: Number(data?.followup_days ?? 2),
      schedule: parseSchedule(data?.schedule) ?? DEFAULT_SCHEDULE,
    };
  });

export const saveAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        businessName: z.string().trim().min(1).max(120),
        address: z.string().trim().max(300),
        enabled: z.boolean(),
        testMode: z.boolean(),
        testNumbers: z.string().max(2000),
        agentName: z.string().trim().max(60),
        segment: z.string().trim().max(120),
        bookingEnabled: z.boolean(),
        healthRules: z.boolean(),
        instructions: z.string().max(8000),
        replyClients: z.boolean(),
        takeoverMinutes: z.number().int().min(0).max(1440),
        slotMinutes: z.number().int().min(15).max(180),
        sequentialFill: z.boolean(),
        followupEnabled: z.boolean(),
        followupDays: z.number().int().min(1).max(29),
        schedule: z.record(z.string(), z.array(windowSchema)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const numbers = data.testNumbers
      .split(/[\n,;]+/)
      .map((n) => n.replace(/[^\d+]/g, ""))
      .filter((n) => n.replace(/\D/g, "").length >= 10)
      .slice(0, 20);
    const { parseSchedule } = await import("@/lib/agenda-hours");
    const schedule = parseSchedule(data.schedule);
    if (!schedule) throw new Error("Defina pelo menos um horário de atendimento.");

    const { error: accErr } = await admin
      .from("accounts")
      .update({ name: data.businessName, address: data.address || null })
      .eq("id", account.id);
    if (accErr) throw new Error(accErr.message);

    if (data.enabled) {
      const { data: conn } = await admin
        .from("whatsapp_connections")
        .select("instance")
        .eq("account_id", account.id)
        .maybeSingle();
      if (!conn?.instance)
        throw new Error("Conecte o WhatsApp por QR Code antes de ligar o agente.");
      const { ensureAgentWebhook } = await import("@/lib/evolution.server");
      await ensureAgentWebhook(conn.instance);
    }

    const { error } = await admin.from("agent_settings").upsert(
      {
        account_id: account.id,
        enabled: data.enabled,
        test_mode: data.testMode,
        test_numbers: numbers,
        agent_name: data.agentName || null,
        segment: data.segment || null,
        booking_enabled: data.bookingEnabled,
        health_rules: data.healthRules,
        instructions: data.instructions.trim() || null,
        reply_clients: data.replyClients,
        takeover_minutes: clampTakeoverMinutes(data.takeoverMinutes),
        slot_minutes: data.slotMinutes,
        sequential_fill: data.sequentialFill,
        followup_enabled: data.followupEnabled,
        followup_days: data.followupDays,
        schedule,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
    if (error) throw new Error(error.message);

    // O novo prazo vale também para as conversas que já estão com a equipe:
    // nenhuma fica presa além de "agora + prazo" (as assumidas pelo botão não mudam).
    if (clampTakeoverMinutes(data.takeoverMinutes) !== NO_AUTO_RETURN) {
      const limit = takeoverUntilISO(Date.now(), data.takeoverMinutes);
      await admin
        .from("conversations")
        .update({ takeover_until: limit })
        .eq("account_id", account.id)
        .gt("takeover_until", limit);
    }
    return { ok: true, testNumbers: numbers.length };
  });

export type ConversationRow = {
  id: string;
  phone: string;
  contact_name: string | null;
  is_client: boolean;
  from_ad: boolean;
  human_takeover: boolean;
  takeover_until: string | null;
  attention_reason: string | null;
  last_message_at: string;
  summary: string | null;
};

export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { data } = await admin
      .from("conversations")
      .select(
        "id, phone, contact_name, is_client, from_ad, human_takeover, takeover_until, attention_reason, last_message_at, summary",
      )
      .eq("account_id", account.id)
      .order("last_message_at", { ascending: false })
      .limit(100);
    return (data ?? []) as ConversationRow[];
  });

export const getConversationMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { data: msgs } = await admin
      .from("messages")
      .select("id, author, body, created_at")
      .eq("conversation_id", data.id)
      .eq("account_id", account.id)
      .order("created_at", { ascending: true })
      .limit(300);
    return (msgs ?? []) as Array<{ id: string; author: string; body: string; created_at: string }>;
  });

/** Assumir a conversa (agente em silêncio), devolver ao agente ou marcar como cliente. */
export const updateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        takeover: z.boolean().optional(),
        isClient: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.takeover !== undefined) {
      patch.human_takeover = data.takeover;
      patch.takeover_until = null;
      patch.attention_reason = null;
    }
    if (data.isClient !== undefined) patch.is_client = data.isClient;
    const { error } = await admin
      .from("conversations")
      .update(patch)
      .eq("id", data.id)
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Apaga o histórico de uma conversa: a memória do agente com essa pessoa recomeça. */
export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { error } = await admin
      .from("conversations")
      .delete()
      .eq("id", data.id)
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type BookingRow = {
  id: string;
  kind: "reserva" | "bloqueio";
  status: "reservado" | "confirmado" | "cancelado";
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
};

/** Próximos horários, ou os de um intervalo de datas locais (grade dia/semana). */
export const listBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    let q = admin
      .from("bookings")
      .select("id, kind, status, contact_name, phone, notes, starts_at, ends_at")
      .eq("account_id", account.id)
      .neq("status", "cancelado");
    if (data.from && data.to) {
      const { addDaysISO, localToUTC } = await import("@/lib/agenda-time");
      q = q
        .gte("ends_at", localToUTC(data.from, 0).toISOString())
        .lt("starts_at", localToUTC(addDaysISO(data.to, 1), 0).toISOString());
    } else {
      q = q.gte("ends_at", new Date().toISOString());
    }
    const { data: rows } = await q.order("starts_at", { ascending: true }).limit(500);
    return (rows ?? []) as BookingRow[];
  });

export const setBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.enum(["confirmado", "cancelado"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { error } = await admin
      .from("bookings")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Horário marcado pela equipe ou bloqueio (ocupa a agenda para o agente). */
export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["reserva", "bloqueio"]),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hora: z.string().regex(/^\d{1,2}:\d{2}$/),
        minutes: z.number().int().min(15).max(720),
        contactName: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(30).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { localDateTimeToUTC } = await import("@/lib/agenda-time");
    const start = localDateTimeToUTC(data.data, data.hora);
    if (!start) throw new Error("Data ou hora inválida.");
    const { normalizeWhatsApp } = await import("@/lib/phone");
    const { error } = await admin.from("bookings").insert({
      account_id: account.id,
      kind: data.kind,
      status: "confirmado",
      contact_name: data.contactName || null,
      phone: normalizeWhatsApp(data.phone) ?? null,
      notes: data.notes || null,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + data.minutes * 60000).toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
