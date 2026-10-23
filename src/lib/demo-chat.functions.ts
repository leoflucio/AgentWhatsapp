// Chat de demonstração da página de vendas: público, sem banco e sem ferramentas.
// Limites em memória do processo (por IP e por dia) para ninguém gastar a cota da IA.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  DEMO_DAILY_LIMIT,
  DEMO_MAX_CHARS,
  allowHit,
  demoSystemPrompt,
  sanitizeDemoHistory,
} from "@/lib/demo-chat-rules";

const hits = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export type DemoChatResult =
  { ok: true; reply: string } | { ok: false; reason: "fim" | "limite" | "indisponivel" };

const input = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(DEMO_MAX_CHARS * 4),
      }),
    )
    .max(60),
});

function clientIp(): string {
  try {
    const h = getRequest().headers;
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return fwd || h.get("x-real-ip")?.trim() || "sem-ip";
  } catch {
    return "sem-ip";
  }
}

export const demoChat = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }): Promise<DemoChatResult> => {
    const history = sanitizeDemoHistory(data.messages);
    if (!history) return { ok: false, reason: "fim" };

    const { todayLocalISO } = await import("@/lib/agenda-time");
    const today = todayLocalISO();
    if (day !== today) {
      day = today;
      dayCount = 0;
      hits.clear();
    }
    if (dayCount >= DEMO_DAILY_LIMIT || !allowHit(hits, clientIp(), Date.now())) {
      return { ok: false, reason: "limite" };
    }

    const { aiModel } = await import("@/lib/ai.server");
    const model = aiModel("main");
    if (!model) return { ok: false, reason: "indisponivel" };

    try {
      const { generateText } = await import("ai");
      const { cleanReply, stripClosingOffer } = await import("@/lib/whatsapp-agent-rules");
      dayCount++;
      const result = await generateText({
        model,
        system: demoSystemPrompt(today),
        messages: history,
        temperature: 0.3,
        maxOutputTokens: 400,
        maxRetries: 2,
      });
      const reply = stripClosingOffer(cleanReply(result.text));
      if (!reply) return { ok: false, reason: "indisponivel" };
      return { ok: true, reply };
    } catch (e) {
      console.warn("[demo] falha na IA", e);
      return { ok: false, reason: "indisponivel" };
    }
  });
