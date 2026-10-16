/* eslint-disable @typescript-eslint/no-explicit-any */
/** Conta (negócio) do usuário logado. Criada no primeiro acesso. */

export type Account = { id: string; name: string; address: string | null };

export async function ensureAccount(userId: string): Promise<Account> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: found } = await admin
    .from("accounts")
    .select("id, name, address")
    .eq("owner_id", userId)
    .maybeSingle();
  if (found) return found as Account;
  const { data: created, error } = await admin
    .from("accounts")
    .upsert({ owner_id: userId }, { onConflict: "owner_id" })
    .select("id, name, address")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Não foi possível criar a conta.");
  await admin
    .from("agent_settings")
    .upsert({ account_id: created.id }, { onConflict: "account_id", ignoreDuplicates: true });
  return created as Account;
}
