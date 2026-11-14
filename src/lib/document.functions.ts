/* eslint-disable @typescript-eslint/no-explicit-any */
// Tela Documentos: liga a leitura de PDF, critérios da análise (editáveis),
// números que podem pedir e as últimas análises. Sempre filtrado pela conta.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_DOC_INSTRUCTIONS, parseDocNumbers } from "@/lib/document-rules";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

export type DocAnalysisRow = {
  id: string;
  phone: string;
  contact_name: string | null;
  file_name: string | null;
  pages: number | null;
  result: string;
  created_at: string;
};

export const getDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { data: s } = await admin
      .from("agent_settings")
      .select("enabled, doc_enabled, doc_instructions, doc_numbers")
      .eq("account_id", account.id)
      .maybeSingle();
    const { data: rows, error } = await admin
      .from("document_analyses")
      .select("id, phone, contact_name, file_name, pages, result, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      // Sem a migration de documentos a tela avisa em vez de quebrar.
      ready: !error,
      agentEnabled: Boolean(s?.enabled),
      enabled: s?.doc_enabled === true,
      instructions: (s?.doc_instructions as string | null) ?? "",
      numbers: ((s?.doc_numbers ?? []) as string[]).join("\n"),
      analyses: (rows ?? []) as DocAnalysisRow[],
    };
  });

export const saveDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enabled: z.boolean(),
        instructions: z.string().max(MAX_DOC_INSTRUCTIONS),
        numbers: z.string().max(3000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const numbers = parseDocNumbers(data.numbers);
    const { error } = await admin.from("agent_settings").upsert(
      {
        account_id: account.id,
        doc_enabled: data.enabled,
        doc_instructions: data.instructions.trim() || null,
        doc_numbers: numbers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, numbers: numbers.length };
  });

export const deleteDocAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { error } = await admin
      .from("document_analyses")
      .delete()
      .eq("id", data.id)
      .eq("account_id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
