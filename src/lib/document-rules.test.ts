import { describe, expect, it } from "vitest";
import {
  DOC_ANALYSIS_TAG,
  analysisBody,
  canRequestAnalysis,
  clipDocText,
  docAnalysisPrompt,
  docAnalysisSystem,
  parseDocNumbers,
  teamAnalysisReply,
  teamDocContactName,
  teamUnreadableReply,
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

  it("linhas com [PREENCHA] não vão para a IA", () => {
    const sys = docAnalysisSystem("Confira o valor total.\nPrazo máximo: [PREENCHA: dias]");
    expect(sys).not.toContain("[PREENCHA");
    expect(sys).toContain("Confira o valor total.");
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

describe("PDF da equipe", () => {
  it("resposta ao gerente traz o arquivo e o resultado", () => {
    expect(teamAnalysisReply("ir.pdf", " Apto. \n")).toBe('📄 Análise de "ir.pdf":\n\nApto.');
    expect(teamUnreadableReply("ir.pdf", true)).toContain("grande demais");
    expect(teamUnreadableReply("ir.pdf", false)).toContain("Não consegui ler");
  });
  it("nome na tela Documentos", () => {
    expect(teamDocContactName("self", "Leo")).toBe("Equipe (você)");
    expect(teamDocContactName("phone", "Carlos")).toBe("Equipe (Carlos)");
    expect(teamDocContactName("phone", undefined)).toBe("Equipe");
  });
});
