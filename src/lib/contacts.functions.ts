/* eslint-disable @typescript-eslint/no-explicit-any */
// Tela Contatos: lista editável e importação da agenda do celular.
// Escritas pelo servidor (service role), sempre filtradas pela conta do usuário.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

export type ContactRow = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  is_client: boolean;
};

const PAGE = 300;

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ search: z.string().max(80).default("") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    let q = admin
      .from("contacts")
      .select("id, name, phone, notes, is_client", { count: "exact" })
      .eq("account_id", account.id)
      .order("name", { ascending: true })
      .limit(PAGE);
    const s = data.search.trim();
    if (s) {
      const digits = s.replace(/\D/g, "");
      const safe = s.replace(/[%,()]/g, " ");
      q = digits.length >= 4 ? q.ilike("phone", `%${digits}%`) : q.ilike("name", `%${safe}%`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ContactRow[], total: count ?? 0 };
  });

export const saveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().max(120),
        phone: z.string().max(30),
        notes: z.string().max(2000),
        isClient: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeWhatsApp, phoneMatchKey } = await import("@/lib/phone");
    const phone = normalizeWhatsApp(data.phone);
    const key = phoneMatchKey(phone);
    if (!phone || !key) throw new Error("Telefone inválido. Use DDD + número.");
    const row = {
      account_id: account.id,
      name: data.name,
      phone,
      phone_key: key,
      notes: data.notes.trim() || null,
      is_client: data.isClient,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await admin.from("contacts").update(row).eq("id", data.id).eq("account_id", account.id)
      : await admin.from("contacts").insert(row);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um contato com esse telefone.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { error } = await admin
      .from("contacts")
      .delete()
      .eq("id", data.id)
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Importa em lote. Quem já está na lista (mesmo telefone) não é alterado. */
export const importContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(z.object({ name: z.string().max(120), phone: z.string().max(30) })).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { normalizeWhatsApp, phoneMatchKey } = await import("@/lib/phone");
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const r of data.rows) {
      const phone = normalizeWhatsApp(r.phone);
      const key = phoneMatchKey(phone);
      if (!phone || !key || seen.has(key)) continue;
      seen.add(key);
      rows.push({ account_id: account.id, name: r.name.trim(), phone, phone_key: key });
    }
    let added = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data: ins, error } = await admin
        .from("contacts")
        .upsert(rows.slice(i, i + 500), {
          onConflict: "account_id,phone_key",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(error.message);
      added += (ins ?? []).length;
    }
    return { added, existing: rows.length - added };
  });
