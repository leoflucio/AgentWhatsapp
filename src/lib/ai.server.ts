/**
 * Modelo de IA do agente. Qualquer provedor compatível com a API da OpenAI:
 * por padrão o Gemini direto do Google (chave grátis no Google AI Studio).
 *
 * AI_API_KEY   chave do provedor (obrigatória)
 * AI_BASE_URL  endereço da API (padrão: Gemini, endpoint compatível com OpenAI)
 * AI_MODEL     modelo das respostas (padrão: gemini-3.8-flash)
 * AI_MODEL_LITE modelo barato dos resumos (padrão: gemini-3.1-flash-lite)
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export function aiModel(kind: "main" | "lite" = "main") {
  const key = (process.env.AI_API_KEY ?? "").trim();
  if (!key) return null;
  const provider = createOpenAICompatible({
    // Tem que ser "google": o provedor guarda a thought_signature do Gemini 3 sob
    // este nome, mas só a devolve na rodada seguinte se estiver sob "google".
    // Com outro nome, toda resposta que usa ferramenta (salvar dados, chamar a
    // equipe, agenda) falhava no segundo passo e o agente ficava mudo.
    name: "google",
    baseURL: (process.env.AI_BASE_URL ?? "").trim() || GEMINI_OPENAI_URL,
    apiKey: key,
  });
  const name =
    kind === "lite"
      ? (process.env.AI_MODEL_LITE ?? "").trim() || "gemini-3.1-flash-lite"
      : (process.env.AI_MODEL ?? "").trim() || "gemini-3.8-flash";
  return provider(name);
}
