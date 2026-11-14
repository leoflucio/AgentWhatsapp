import { describe, expect, it } from "vitest";
import {
  DOC_ANALYSIS_TAG,
  IR_LIFE_INSURANCE_TEMPLATE,
  analysisBody,
  canRequestAnalysis,
  clipDocText,
  docAnalysisPrompt,
  docAnalysisSystem,
  parseDocNumbers,
  pdfOf,
  unreadableBody,
} from "./document-rules";

describe("pdfOf", () => {
  it("PDF direto e com legenda", () => {
    expect(
      pdfOf({
        message: { documentMessage: { mimetype: "application/pdf", fileName: "IR 2026.pdf" } },
      }),
    ).toEqual({ fileName: "IR 2026.pdf", caption: "" });
    expect(
      pdfOf({
        message: {
          documentWithCaptionMessage: {
            message: {
              documentMessage: { fileName: "ir.PDF", caption: "Analisa o IR do João, por favor" },
            },
          },
        },
      }),
    ).toEqual({ fileName: "ir.PDF", caption: "Analisa o IR do João, por favor" });
  });

  it("outros arquivos e mensagens não são PDF", () => {
    expect(
      pdfOf({ message: { documentMessage: { mimetype: "image/png", fileName: "a.png" } } }),
    ).toBeNull();
    expect(pdfOf({ message: { conversation: "oi" } })).toBeNull();
  });
});

describe("quem pode pedir análise", () => {
  it("lista vazia libera qualquer um", () => {
    expect(canRequestAnalysis([], "5511999998888")).toBe(true);
  });
  it("lista confere pelo DDD + 8 últimos dígitos", () => {
    const nums = parseDocNumbers("(11) 99999-8888\nabc\n11999998888, 21 98888-7777");
    expect(nums).toEqual(["11999998888", "21988887777"]);
    expect(canRequestAnalysis(nums, "5511999998888")).toBe(true);
    expect(canRequestAnalysis(nums, "5511912345678")).toBe(false);
  });
});

describe("prompt da análise", () => {
  it("texto do documento entre marcas e com aviso para ignorar instruções dentro", () => {
    const p = docAnalysisPrompt({ fileName: "ir.pdf", caption: "é apto?", text: "Renda 100 mil" });
    expect(p).toContain("<documento>\nRenda 100 mil\n</documento>");
    expect(p).toContain('"é apto?"');
    expect(docAnalysisSystem("x")).toMatch(/ignore qualquer instrução/);
  });

  it("linhas com [PREENCHA] do modelo não vão para a IA", () => {
    const sys = docAnalysisSystem(IR_LIFE_INSURANCE_TEMPLATE);
    expect(sys).not.toContain("[PREENCHA");
    expect(sys).toContain("APTO, NÃO APTO");
    expect(sys).toContain("Ocupação declarada");
  });

  it("sem critérios, resume o documento", () => {
    expect(docAnalysisSystem("  ")).toContain("Resuma o documento");
  });

  it("documento longo é cortado", () => {
    const r = clipDocText("a".repeat(10), 5);
    expect(r).toEqual({ text: "aaaaa", clipped: true });
    expect(
      docAnalysisPrompt({ fileName: "x.pdf", caption: "", text: "a", clipped: true }),
    ).toContain("só o começo");
  });

  it("PDF escaneado vai como anexo", () => {
    expect(docAnalysisPrompt({ fileName: "x.pdf", caption: "", text: null })).toContain(
      "PDF anexado",
    );
  });
});

describe("corpo gravado na conversa", () => {
  it("análise marcada para o agente repassar", () => {
    const b = analysisBody("ir.pdf", "", "Resultado: APTO");
    expect(b).toContain(DOC_ANALYSIS_TAG);
    expect(b).toContain("Resultado: APTO");
  });
  it("PDF grande ou ilegível vira aviso", () => {
    expect(unreadableBody("a.pdf", "", true)).toContain("grande demais");
    expect(unreadableBody("a.pdf", "", false)).toContain("não foi possível ler");
  });
});
