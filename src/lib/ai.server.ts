/**
 * Modelo de IA do agente. Qualquer provedor compatível com a API da OpenAI:
 * por padrão o Gemini direto do Google (chave grátis no Google AI Studio).
 *
 * AI_API_KEY   chave do provedor (obrigatória)
 * AI_BASE_URL  endereço da API (padrão: Gemini, endpoint compatível com OpenAI)
 * AI_MODEL     modelo das respostas (padrão: gemini-2.5-flash)
 * AI_MODEL_LITE modelo barato dos resumos (padrão: gemini-2.5-flash-lite)
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export function aiModel(kind: "main" | "lite" = "main") {
  const key = (process.env.AI_API_KEY ?? "").trim();
  if (!key) return null;
  const provider = createOpenAICompatible({
    name: "ai",
    baseURL: (process.env.AI_BASE_URL ?? "").trim() || GEMINI_OPENAI_URL,
    apiKey: key,
  });
  const name =
    kind === "lite"
      ? (process.env.AI_MODEL_LITE ?? "").trim() || "gemini-2.5-flash-lite"
      : (process.env.AI_MODEL ?? "").trim() || "gemini-2.5-flash";
  return provider(name);
}
