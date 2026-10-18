import { describe, expect, it } from "vitest";
import {
  MAX_FIELDS,
  collectPromptText,
  mergeValues,
  normalizeFields,
  parseValues,
  slugKey,
  valuesCsv,
} from "./collected-data-rules";

describe("slugKey", () => {
  it("tira acento e espaços e não repete", () => {
    expect(slugKey("Valor do pedido", new Set())).toBe("valor_do_pedido");
    expect(slugKey("Endereço", new Set(["endereco"]))).toBe("endereco_2");
    expect(slugKey("123", new Set())).toBe("c_123");
    expect(slugKey("!!!", new Set())).toBe("campo");
  });
});

describe("normalizeFields", () => {
  it("mantém a chave dada, gera para os novos e ignora vazios e repetidos", () => {
    const f = normalizeFields([
      { key: "cpf", label: "CPF", ask: true },
      { label: "Nome completo" },
      { label: "  " },
      { label: "cpf" },
      { label: "Valor", ask: false },
    ]);
    expect(f).toEqual([
      { key: "cpf", label: "CPF", ask: true },
      { key: "nome_completo", label: "Nome completo", ask: true },
      { key: "valor", label: "Valor", ask: false },
    ]);
  });
  it("limita a quantidade e aceita lixo", () => {
    expect(normalizeFields(null)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `Campo ${i}` }));
    expect(normalizeFields(many)).toHaveLength(MAX_FIELDS);
  });
  it("chave repetida vira outra", () => {
    const f = normalizeFields([
      { key: "x", label: "A" },
      { key: "x", label: "B" },
    ]);
    expect(f.map((x) => x.key)).toEqual(["x", "b"]);
  });
});

describe("mergeValues", () => {
  const fields = normalizeFields([{ label: "Nome" }, { label: "CPF" }]);
  it("só campos da lista; vazio não apaga", () => {
    const r = mergeValues({ nome: "Ana" }, { nome: "", cpf: " 123 ", outro: "x" }, fields);
    expect(r.data).toEqual({ nome: "Ana", cpf: "123" });
    expect(r.changed).toEqual(["cpf"]);
  });
  it("corrige valor", () => {
    expect(mergeValues({ nome: "Ana" }, { nome: "Ana Paula" }, fields).changed).toEqual(["nome"]);
  });
});

describe("parseValues", () => {
  it("vira texto e ignora vazios", () => {
    expect(parseValues({ a: 10, b: "", c: null, d: " x " })).toEqual({ a: "10", d: "x" });
    expect(parseValues([1])).toEqual({});
  });
});

describe("collectPromptText", () => {
  const fields = normalizeFields([
    { label: "Nome" },
    { label: "CPF" },
    { label: "Valor", ask: false },
  ]);
  it("sem campos, nada", () => {
    expect(collectPromptText([], {})).toBe("");
  });
  it("separa pedir, só anotar e já anotados", () => {
    const t = collectPromptText(fields, { nome: "Ana" });
    expect(t).toContain("Pedir: CPF.");
    expect(t).toContain("não pergunte): Valor.");
    expect(t).toContain("Nome = Ana");
    expect(t).toContain("salvar_dados");
  });
  it("tudo anotado: não manda pedir", () => {
    const t = collectPromptText(fields, { nome: "Ana", cpf: "1", valor: "2" });
    expect(t).not.toContain("Pedir:");
    expect(t).not.toContain("Peça os dados");
  });
});

describe("valuesCsv", () => {
  it("separa por ; e protege aspas", () => {
    const fields = normalizeFields([{ label: "Obs" }]);
    const csv = valuesCsv(fields, [
      {
        contactName: "Ana",
        phone: "5511999999999",
        data: { obs: 'diz "oi"; tchau' },
        updatedAt: "18/10/2026",
      },
    ]);
    expect(csv.startsWith("\uFEFFNome no WhatsApp;Telefone;Obs;Atualizado em\r\n")).toBe(true);
    expect(csv).toContain('Ana;5511999999999;"diz ""oi""; tchau";18/10/2026');
  });
});
