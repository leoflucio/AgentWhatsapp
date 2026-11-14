/**
 * Modelo de IA do agente. Qualquer provedor compatível com a API da OpenAI:
 * por padrão o Gemini direto do Google (chave grátis no Google AI Studio).
 *
 * AI_API_KEY   chave do provedor (obrigatória)
 * AI_BASE_URL  endereço da API (padrão: Gemini, endpoint compatível com OpenAI)
 * AI_MODEL     modelo das respostas (padrão: gemini-3.8-flash)
 * AI_MODEL_LITE modelo barato dos resumos (padrão: gemini-3.1-flash-lite)
 * AI_MODEL_FALLBACK modelos reserva, em ordem e separados por vírgula, quando o
 *              Google recusa (excesso de demanda, limite, modelo fora do ar)
 *              (padrão: gemini-3.6-flash,gemini-3.1-flash-lite; "off" desliga)
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";

/**
 * Recusa do provedor que outro modelo pode resolver: 503 "high demand", 429,
 * 5xx e 404 (modelo aposentado ou fora da chave).
 */
function isOverloaded(e: unknown): boolean {
  const status = (e as { statusCode?: number })?.statusCode;
  return status === 429 || status === 404 || (typeof status === "number" && status >= 500);
}

const DEFAULT_FALLBACKS = "gemini-3.6-flash,gemini-3.1-flash-lite";

/** Modelos reserva em ordem, sem repetir o principal. "off" = nenhum. */
export function fallbackModels(main: string, raw = process.env.AI_MODEL_FALLBACK): string[] {
  const list = ((raw ?? "").trim() || DEFAULT_FALLBACKS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.includes("off")) return [];
  return [...new Set(list)].filter((m) => m !== main);
}

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
  const fallbacks = fallbackModels(name);
  if (fallbacks.length === 0) return provider(name);
  // Quando o modelo do Google fica sobrecarregado, a chamada vai para o
  // primeiro reserva; se ele também recusar, para o seguinte. Antes havia só
  // um reserva, e com os dois fora o agente ficava mudo.
  return wrapLanguageModel({
    model: provider(name),
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (e) {
          if (!isOverloaded(e)) throw e;
          let last = e;
          for (const fb of fallbacks) {
            console.warn(`[ia] modelo indisponível, usando ${fb}`);
            try {
              return await provider(fb).doGenerate(params);
            } catch (err) {
              if (!isOverloaded(err)) throw err;
              last = err;
            }
          }
          throw last;
        }
      },
    },
  });
}
