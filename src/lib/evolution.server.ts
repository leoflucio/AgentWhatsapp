/**
 * Servidor Evolution API gerenciado pelo app (EVOLUTION_HOST_URL /
 * EVOLUTION_HOST_KEY). Cada conta tem uma instância própria, conectada por QR
 * Code; o envio usa o token DA instância, nunca a chave mestra do servidor.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function hostUrl(): string {
  return (process.env.EVOLUTION_HOST_URL ?? "").trim().replace(/\/+$/, "");
}
export function hostKey(): string {
  return (process.env.EVOLUTION_HOST_KEY ?? "").trim();
}
export function hostConfigured(): boolean {
  return Boolean(hostUrl() && hostKey());
}

/** Chamada à Evolution com a chave mestra (só no servidor). */
export async function evo(
  path: string,
  init: { method?: string; body?: unknown; apiKey?: string } = {},
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`${hostUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: { apikey: init.apiKey ?? hostKey(), "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

/** Assinatura da URL do webhook de cada instância (sem expor a chave mestra). */
export function webhookToken(instance: string): string {
  return createHmac("sha256", hostKey()).update(`wa-agent:${instance}`).digest("hex").slice(0, 40);
}

export function validWebhookToken(instance: string, token: string): boolean {
  if (!hostKey() || !instance || !token) return false;
  const a = Buffer.from(webhookToken(instance));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Liga o envio das mensagens recebidas pela instância para o agente. */
export async function ensureAgentWebhook(instance: string): Promise<void> {
  if (!hostConfigured()) return;
  const base = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Configure PUBLIC_APP_URL (endereço público do app).");
  const target = `${base}/api/public/whatsapp/webhook?i=${encodeURIComponent(instance)}&t=${webhookToken(instance)}`;
  const r = await evo(`/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url: target,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    },
  });
  if (!r.ok) {
    throw new Error(
      `Não foi possível ligar o recebimento de mensagens: ${JSON.stringify(r.json).slice(0, 200)}`,
    );
  }
}

/** Envia texto pela instância da conta. */
export async function sendText(args: {
  instance: string;
  token: string | null;
  to: string;
  text: string;
}): Promise<{ key?: { id?: string } }> {
  const r = await evo(`/message/sendText/${encodeURIComponent(args.instance)}`, {
    method: "POST",
    apiKey: args.token ?? undefined,
    body: { number: args.to, text: args.text, linkPreview: true },
  });
  if (!r.ok) {
    throw new Error(`Evolution API ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`);
  }
  return (r.json ?? {}) as { key?: { id?: string } };
}

/**
 * Baixa o áudio da mensagem e transcreve com o Whisper (Groq). Devolve o
 * texto ou null se não der para ouvir.
 */
export async function transcribeAudio(
  instance: string,
  messageId: string | undefined,
  mimetype: string,
): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || !hostConfigured() || !messageId) return null;
  try {
    const media = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: "POST",
      body: { message: { key: { id: messageId } }, convertToMp4: false },
    });
    const base64 = (media.json as { base64?: string } | null)?.base64;
    if (!media.ok || !base64) return null;
    const type = mimetype.split(";")[0]!.trim() || "audio/ogg";
    const ext = type.includes("mpeg") ? "mp3" : type.includes("mp4") ? "m4a" : "ogg";
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(base64, "base64")], { type }), `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "pt");
    form.append("response_format", "json");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });
    if (!res.ok) {
      console.error("[agente] transcrição", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const out = (await res.json()) as { text?: string };
    const t = (out.text ?? "").trim();
    return t ? t.slice(0, 2000) : null;
  } catch (e) {
    console.error("[agente] transcrição falhou", e instanceof Error ? e.message : e);
    return null;
  }
}
