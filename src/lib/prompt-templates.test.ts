import { describe, expect, it } from "vitest";
import { PROMPT_TEMPLATES, countBlanks, findTemplate, stripBlanks } from "./prompt-templates";

describe("modelos de prompt", () => {
  it("têm ids únicos e trechos para preencher", () => {
    const ids = PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of PROMPT_TEMPLATES) {
      expect(countBlanks(t.text)).toBeGreaterThan(0);
      expect(t.text.length).toBeLessThan(8000);
    }
  });

  it("só a saúde liga as regras da saúde", () => {
    expect(findTemplate("saude")?.health).toBe(true);
    expect(PROMPT_TEMPLATES.filter((t) => t.health)).toHaveLength(1);
  });

  it("conta os trechos que faltam", () => {
    expect(countBlanks("Preço: [PREENCHA: valor] e [preencha: outro]")).toBe(2);
    expect(countBlanks("Preço: R$ 80 [promoção]")).toBe(0);
  });

  it("tira do prompt as linhas não preenchidas", () => {
    const text = "QUEM SOMOS\nLoja Sol\n- [PREENCHA: produto 1]\n\n\nPAGAMENTO\nPix";
    expect(stripBlanks(text)).toBe("QUEM SOMOS\nLoja Sol\n\nPAGAMENTO\nPix");
  });
});
