/* eslint-disable @typescript-eslint/no-explicit-any */
// Cadastro do cliente (nome, celular, CPF/CNPJ), pedido a quem entra por e-mail ou Google.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminAndAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureAccount } = await import("@/lib/account.server");
  return { admin: supabaseAdmin as any, account: await ensureAccount(userId) };
}

export const getProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { profileFromMetadata, suggestedName } = await import("@/lib/profile-rules");
    const { data: acc, error } = await admin
      .from("accounts")
      .select("owner_name, owner_phone, owner_doc")
      .eq("id", account.id)
      .single();
    // Sem a migration do cadastro, não trava o app.
    if (error) return { complete: true, name: "", phone: "", doc: "", suggestedName: "" };
    if (acc.owner_name && acc.owner_phone && acc.owner_doc) {
      return {
        complete: true,
        name: acc.owner_name as string,
        phone: acc.owner_phone as string,
        doc: acc.owner_doc as string,
        suggestedName: "",
      };
    }
    const { data: u } = await admin.auth.admin.getUserById(context.userId);
    const meta = (u?.user?.user_metadata ?? null) as Record<string, unknown> | null;
    // Quem se cadastrou por e-mail já mandou os dados no cadastro: grava agora.
    const fromSignup = profileFromMetadata(meta);
    if (fromSignup) {
      await admin
        .from("accounts")
        .update({
          owner_name: fromSignup.name,
          owner_phone: fromSignup.phone,
          owner_doc: fromSignup.doc,
        })
        .eq("id", account.id);
      return { complete: true, ...fromSignup, suggestedName: "" };
    }
    return { complete: false, name: "", phone: "", doc: "", suggestedName: suggestedName(meta) };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().max(200),
        phone: z.string().max(40),
        doc: z.string().max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, account } = await adminAndAccount(context.userId);
    const { checkProfile } = await import("@/lib/profile-rules");
    const r = checkProfile(data);
    if (!r.ok) throw new Error(r.error);
    const { error } = await admin
      .from("accounts")
      .update({
        owner_name: r.profile.name,
        owner_phone: r.profile.phone,
        owner_doc: r.profile.doc,
      })
      .eq("id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
