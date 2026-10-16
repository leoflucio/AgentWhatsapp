/**
 * WhatsApp gerenciado: cada conta conecta o próprio número por QR Code numa
 * instância criada no servidor Evolution do app (EVOLUTION_HOST_URL). Regras
 * puras (sem rede), testadas.
 */

/** Prefixo das instâncias deste app no servidor (não colide com as do FisioAI). */
export const INSTANCE_PREFIX = "agw_";

/** Nome da instância da conta no servidor (estável e único por conta). */
export function managedInstanceName(accountId: string): string {
  return `${INSTANCE_PREFIX}${accountId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
}

/** Situação da conexão, a partir do `state` da Evolution. */
export type ManagedState = "conectado" | "aguardando_qr" | "desconectado";

export function stateFromEvolution(state: string | null | undefined): ManagedState {
  const s = String(state ?? "").toLowerCase();
  if (s === "open") return "conectado";
  if (s === "connecting") return "aguardando_qr";
  return "desconectado";
}

/** Token da instância na resposta de criação (v2 devolve string; versões antigas, objeto). */
export function instanceTokenFrom(createResponse: unknown): string | null {
  const r = (createResponse ?? {}) as { hash?: unknown };
  if (typeof r.hash === "string" && r.hash) return r.hash;
  if (r.hash && typeof r.hash === "object") {
    const k = (r.hash as { apikey?: unknown }).apikey;
    if (typeof k === "string" && k) return k;
  }
  return null;
}

/** Imagem do QR Code (data URL) e código de pareamento, de create/connect. */
export function qrFrom(response: unknown): { qr: string | null; pairingCode: string | null } {
  const r = (response ?? {}) as {
    base64?: unknown;
    pairingCode?: unknown;
    qrcode?: { base64?: unknown; pairingCode?: unknown };
  };
  const src = r.qrcode ?? r;
  const b64 = typeof src.base64 === "string" && src.base64 ? src.base64 : null;
  return {
    qr: b64 ? (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`) : null,
    pairingCode: typeof src.pairingCode === "string" && src.pairingCode ? src.pairingCode : null,
  };
}
