/* eslint-disable @typescript-eslint/no-explicit-any */
// Tela Dados: campos que o agente colhe e a planilha com o que ele anotou de cada contato.
// Escritas pelo servidor (service role), sempre filtradas pela conta do usuário.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_FIELDS, MAX_VALUE, type DataField, type DataValues } from "@/lib/collected-data-rules";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

export type DataRow = {
  id: string;
  contactName: string;
  phone: string;
  data: DataValues;
  updatedBy: string;
  updatedAt: string;
};

const PAGE = 1000;

export const getDataSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeFields, parseValues } = await import("@/lib/collected-data-rules");
    const { data: settings, error: setErr } = await admin
      .from("agent_settings")
      .select("data_fields")
      .eq("account_id", account.id)
      .maybeSingle();
    // Sem a migration dos dados colhidos, a tela avisa em vez de quebrar.
    if (setErr) return { ready: false, fields: [] as DataField[], rows: [] as DataRow[], total: 0 };
    const {
      data: rows,
      count,
      error,
    } = await admin
      .from("collected_data")
      .select("id, contact_name, phone, data, updated_by, updated_at", { count: "exact" })
      .eq("account_id", account.id)
      .order("updated_at", { ascending: false })
      .limit(PAGE);
    if (error) return { ready: false, fields: [] as DataField[], rows: [] as DataRow[], total: 0 };
    return {
      ready: true,
      fields: normalizeFields(settings?.data_fields),
      rows: ((rows ?? []) as any[]).map((r): DataRow => ({
        id: r.id,
        contactName: r.contact_name ?? "",
        phone: r.phone,
        data: parseValues(r.data),
        updatedBy: r.updated_by,
        updatedAt: r.updated_at,
      })),
      total: count ?? 0,
    };
  });

export const saveDataFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fields: z
          .array(
            z.object({
              key: z.string().max(40).optional(),
              label: z.string().max(80),
              ask: z.boolean(),
            }),
          )
          .max(MAX_FIELDS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeFields } = await import("@/lib/collected-data-rules");
    const fields = normalizeFields(data.fields);
    const { error } = await admin
      .from("agent_settings")
      .upsert({ account_id: account.id, data_fields: fields }, { onConflict: "account_id" });
    if (error) throw new Error(error.message);
    return { fields };
  });

export const saveDataRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
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
