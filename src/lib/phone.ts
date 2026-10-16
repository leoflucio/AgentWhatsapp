/** Utilitários de telefone/WhatsApp usados no cadastro (frontend e backend). */

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

/**
 * Normaliza um número brasileiro para E.164 sem o '+'.
 * Aceita "(11) 97680-8371", "11976808371" ou "5511976808371".
 * Devolve null quando o número é vazio ou inválido.
 */
export function normalizeWhatsApp(v: string | null | undefined): string | null {
  let d = onlyDigits(v);
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return "55" + d;
}

/**
 * Chave para comparar telefones brasileiros gravados em formatos diferentes:
 * DDD + últimos 8 dígitos (ignora o 55 e o nono dígito). Null se não der para
 * identificar DDD + número.
 */
export function phoneMatchKey(v: string | null | undefined): string | null {
  let d = onlyDigits(v);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return d.slice(0, 2) + d.slice(-8);
}

/** Os dois números são o mesmo telefone (com ou sem 55 e nono dígito)? */
export function samePhoneBR(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneMatchKey(a);
  return ka !== null && ka === phoneMatchKey(b);
}

export function isValidWhatsApp(v: string | null | undefined): boolean {
  return normalizeWhatsApp(v) !== null;
}

/** Máscara de digitação: (11) 97680-8371 */
export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Exibição amigável a partir do formato salvo (55DDDNUMERO). */
export function formatWhatsApp(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (!d) return "—";
  const local = d.startsWith("55") ? d.slice(2) : d;
  return maskPhone(local) || d;
}

export const PHONE_REQUIRED_MESSAGE =
  "O número de WhatsApp é obrigatório para concluir seu cadastro.";
