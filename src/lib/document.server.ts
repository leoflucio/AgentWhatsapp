/**
 * Leitura de PDF recebido no WhatsApp (tela Documentos). Baixa o arquivo da
 * Evolution, tira o texto (unpdf) e manda para a IA com os critérios do
 * negócio. PDF escaneado (sem texto) vai como arquivo para a IA. Regras puras
 * em document-rules.ts.
 */
import { generateText } from "ai";
import { aiModel } from "@/lib/ai.server";
import { downloadMedia } from "@/lib/evolution.server";
import {
  MAX_PDF_BYTES,
  MIN_TEXT_CHARS,
  clipDocText,
  docAnalysisPrompt,
  docAnalysisSystem,
} from "@/lib/document-rules";

export type PdfAnalysis =
  { ok: true; result: string; pages: number | null } | { ok: false; reason: "grande" | "ilegivel" };

/** Texto do PDF (todas as páginas). Falha = texto vazio. */
async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number | null }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // Cópia: o pdf.js toma o buffer para si e o original ficaria vazio.
    const pdf = await getDocumentProxy(bytes.slice());
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return { text: String(text ?? ""), pages: totalPages ?? null };
  } catch (e) {
    console.warn("[documento] texto do PDF", e instanceof Error ? e.message : e);
    return { text: "", pages: null };
  }
}

export async function analyzePdf(args: {
  instance: string;
  messageId: string | undefined;
  fileName: string;
  caption: string;
  instructions: string;
}): Promise<PdfAnalysis> {
  const model = aiModel("main");
  if (!model) return { ok: false, reason: "ilegivel" };
  const base64 = await downloadMedia(args.instance, args.messageId).catch(() => null);
  if (!base64) return { ok: false, reason: "ilegivel" };
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, reason: "grande" };

  const { text, pages } = await pdfText(bytes);
  const scanned = text.replace(/\s+/g, "").length < MIN_TEXT_CHARS;
  const system = docAnalysisSystem(args.instructions);
  try {
    const r = scanned
      ? // PDF escaneado (foto do papel): a IA lê o arquivo em si.
        await generateText({
          model,
          system,
          temperature: 0.2,
          maxRetries: 3,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: docAnalysisPrompt({
                    fileName: args.fileName,
                    caption: args.caption,
                    text: null,
                  }),
                },
                {
                  type: "file",
                  data: bytes,
                  mediaType: "application/pdf",
                  filename: args.fileName,
                },
              ],
            },
          ],
        })
      : await generateText({
          model,
          system,
          temperature: 0.2,
          maxRetries: 3,
          prompt: docAnalysisPrompt({
            fileName: args.fileName,
            caption: args.caption,
            ...clipDocText(text),
          }),
        });
    const result = r.text.trim();
    return result ? { ok: true, result, pages } : { ok: false, reason: "ilegivel" };
  } catch (e) {
    console.error("[documento] análise falhou", e instanceof Error ? e.message : e);
    return { ok: false, reason: "ilegivel" };
  }
}
