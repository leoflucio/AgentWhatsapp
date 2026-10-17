/**
 * Cadastro do cliente (dono da conta): nome, celular e CPF/CNPJ. Puro, testado
 * em profile-rules.test.ts. O mesmo vale para quem entra por e-mail ou Google.
 */
import { validCpfCnpj } from "@/lib/billing-rules";
import { normalizeWhatsApp } from "@/lib/phone";

export type ProfileInput = { name: string; phone: string; doc: string };
export type Profile = { name: string; phone: string; doc: string };

/** Valida e normaliza; devolve o perfil pronto para gravar ou a primeira mensagem de erro. */
export function checkProfile(
  input: Partial<ProfileInput>,
): { ok: true; profile: Profile } | { ok: false; error: string } {
  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  if (name.split(" ").filter((p) => p.length >= 2).length < 2)
    return { ok: false, error: "Informe nome e sobrenome." };
  const phone = normalizeWhatsApp(input.phone);
  if (!phone) return { ok: false, error: "Informe um celular válido com DDD." };
  const doc = (input.doc ?? "").replace(/\D/g, "");
  if (!validCpfCnpj(doc)) return { ok: false, error: "Informe um CPF ou CNPJ válido." };
  return { ok: true, profile: { name: name.slice(0, 120), phone, doc } };
}

/** Dados que vieram no cadastro (metadados do usuário no Supabase), se estiverem completos. */
export function profileFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): Profile | null {
  if (!meta) return null;
  const r = checkProfile({
    name: String(meta.full_name ?? meta.name ?? ""),
    phone: String(meta.phone ?? ""),
    doc: String(meta.doc ?? ""),
  });
  return r.ok ? r.profile : null;
}

/** Nome sugerido para completar o cadastro (o Google manda full_name). */
export function suggestedName(meta: Record<string, unknown> | null | undefined): string {
  return String(meta?.full_name ?? meta?.name ?? "").trim();
}

/** Máscara de digitação de CPF (até 11 dígitos) ou CNPJ (12 a 14). */
export function maskDoc(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
