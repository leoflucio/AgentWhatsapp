/* eslint-disable @typescript-eslint/no-explicit-any */
// Tela Dados: planilhas (cada uma com os seus campos) e o que o agente anotou em cada uma.
// Escritas pelo servidor (service role), sempre filtradas pela conta do usuário.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_FIELDS,
  MAX_SHEETS,
  MAX_VALUE,
  type DataSheet,
  type DataValues,
} from "@/lib/collected-data-rules";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

export type DataRow = {
  id: string;
  sheetKey: string;
  contactName: string;
  phone: string;
  data: DataValues;
  updatedBy: string;
  updatedAt: string;
};

const PAGE = 1000;

const notReady = { ready: false, sheets: [] as DataSheet[], rows: [] as DataRow[] };

export const getDataSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeSheets, parseValues } = await import("@/lib/collected-data-rules");
    const { data: settings, error: setErr } = await admin
      .from("agent_settings")
      .select("data_fields, data_sheets")
      .eq("account_id", account.id)
      .maybeSingle();
    // Sem as migrations dos dados colhidos, a tela avisa em vez de quebrar.
    if (setErr) return notReady;
    const { data: rows, error } = await admin
      .from("collected_data")
      .select("id, sheet_key, contact_name, phone, data, updated_by, updated_at")
      .eq("account_id", account.id)
      .order("updated_at", { ascending: false })
      .limit(PAGE);
    if (error) return notReady;
    return {
      ready: true,
      sheets: normalizeSheets(settings?.data_sheets, settings?.data_fields),
      rows: ((rows ?? []) as any[]).map((r): DataRow => ({
        id: r.id,
        sheetKey: r.sheet_key,
        contactName: r.contact_name ?? "",
        phone: r.phone,
        data: parseValues(r.data),
        updatedBy: r.updated_by,
        updatedAt: r.updated_at,
      })),
    };
  });

const fieldSchema = z.object({
  key: z.string().max(40).optional(),
  label: z.string().max(80),
  ask: z.boolean(),
});
const sheetSchema = z.object({
  key: z.string().max(40).optional(),
  name: z.string().max(80),
  fields: z.array(fieldSchema).max(MAX_FIELDS),
});

export const saveDataSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sheets: z.array(sheetSchema).max(MAX_SHEETS) }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeSheets } = await import("@/lib/collected-data-rules");
    const sheets = normalizeSheets(data.sheets);
    const { error } = await admin.from("agent_settings").upsert(
      // data_fields (uma planilha só) fica vazio: as planilhas valem daqui em diante.
      { account_id: account.id, data_sheets: sheets, data_fields: [] },
      { onConflict: "account_id" },
    );
    if (error) throw new Error(error.message);
    return { sheets };
  });

export const saveDataRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        sheetKey: z.string().min(1).max(40),
        contactName: z.string().trim().max(120),
        phone: z.string().max(30),
        data: z.record(z.string(), z.string().max(MAX_VALUE)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeWhatsApp, phoneMatchKey } = await import("@/lib/phone");
    const { parseValues } = await import("@/lib/collected-data-rules");
    const phone = normalizeWhatsApp(data.phone);
    const key = phoneMatchKey(phone);
    if (!phone || !key) throw new Error("Telefone inválido. Use DDD + número.");
    const row = {
      account_id: account.id,
      sheet_key: data.sheetKey,
      contact_name: data.contactName || null,
      phone,
      phone_key: key,
      // A equipe pode apagar um valor (campo vazio sai da linha).
      data: parseValues(data.data),
      updated_by: "equipe",
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await admin
          .from("collected_data")
          .update(row)
          .eq("id", data.id)
          .eq("account_id", account.id)
      : await admin.from("collected_data").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDataRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { error } = await admin
      .from("collected_data")
      .delete()
      .eq("id", data.id)
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lê as instruções do agente com IA e sugere as planilhas e os campos (a pessoa revisa e salva). */
export const suggestDataSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { mergeSuggestedSheets, normalizeSheets, SUGGEST_FIELDS_SYSTEM } =
      await import("@/lib/collected-data-rules");
    const { data: settings } = await admin
      .from("agent_settings")
      .select("instructions, data_fields, data_sheets")
      .eq("account_id", account.id)
      .maybeSingle();
    const instructions = String(settings?.instructions ?? "").trim();
    if (instructions.length < 20) {
      throw new Error("Escreva as instruções do agente (tela Agente) antes de criar as planilhas.");
    }
    const { aiModel } = await import("@/lib/ai.server");
    const { generateText } = await import("ai");
    // Se o lite falhar (mesmo com o modelo reserva de aiModel), tenta o principal.
    let text: string | null = null;
    let lastError = "";
    for (const kind of ["lite", "main"] as const) {
      const model = aiModel(kind);
      if (!model) throw new Error("IA não configurada no servidor.");
      try {
        const r = await generateText({
          model,
          system: SUGGEST_FIELDS_SYSTEM,
          prompt: `<instrucoes>\n${instructions.slice(0, 8000)}\n</instrucoes>`,
          temperature: 0,
          maxRetries: 1,
        });
        text = r.text;
        break;
      } catch (e) {
        console.error(`[dados] sugestão de planilhas falhou (${kind}):`, e);
        const last = (e as { lastError?: unknown })?.lastError ?? e;
        lastError = (last instanceof Error ? last.message : String(last)).slice(0, 200);
      }
    }
    if (text === null) {
      throw new Error(
        `A IA não respondeu (${lastError || "sem detalhe"}). Tente de novo em alguns minutos ou monte as planilhas à mão.`,
      );
    }
    return {
      sheets: mergeSuggestedSheets(
        normalizeSheets(settings?.data_sheets, settings?.data_fields),
        text,
      ),
    };
  });
