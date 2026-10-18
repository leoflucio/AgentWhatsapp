import { describe, expect, it } from "vitest";
import {
  MAX_FIELDS,
  mergeSuggestedSheets,
  normalizeSheets,
  sheetToolName,
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
  it("campo não usa a chave de novo registro", () => {
    expect(normalizeFields([{ label: "Novo registro" }])[0]!.key).toBe("novo_registro_2");
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

describe("normalizeSheets", () => {
  it("sem planilhas, usa os campos antigos numa planilha só", () => {
    expect(normalizeSheets([], [{ label: "CPF" }])).toEqual([
      { key: "geral", name: "Planilha", fields: [{ key: "cpf", label: "CPF", ask: true }] },
    ]);
    expect(normalizeSheets(null, null)).toEqual([]);
  });
  it("mantém chave, gera para as novas e ignora nome vazio ou repetido", () => {
    const s = normalizeSheets([
      { key: "prev", name: "Previdência", fields: [{ label: "Nome" }] },
      { name: "Pessoa física", fields: [] },
      { name: "" },
      { name: "previdência" },
    ]);
    expect(s.map((x) => [x.key, x.name])).toEqual([
      ["prev", "Previdência"],
      ["pessoa_fisica", "Pessoa física"],
    ]);
    expect(sheetToolName(s[1]!)).toBe("salvar_pessoa_fisica");
  });
});

describe("collectPromptText", () => {
  const sheets = normalizeSheets([
    {
      key: "vida",
      name: "Vida",
      fields: [{ label: "Nome" }, { label: "CPF" }, { label: "Valor", ask: false }],
    },
  ]);
  it("sem campos, nada", () => {
    expect(collectPromptText([], {})).toBe("");
    expect(collectPromptText(normalizeSheets([{ name: "Vazia" }]), {})).toBe("");
  });
  it("separa pedir, só anotar e registro atual", () => {
    const t = collectPromptText(sheets, { vida: { nome: "Ana" } });
    expect(t).toContain('Planilha "Vida" (ferramenta salvar_vida)');
    expect(t).toContain("Pedir, se ainda não souber: CPF.");
    expect(t).toContain("mandarem pedir): Valor.");
    expect(t).toContain("nesta planilha: Nome = Ana");
    expect(t).toContain("novo_registro = true");
  });
  it("várias planilhas: manda escolher pelo tipo de pedido", () => {
    const two = normalizeSheets([
      { name: "Previdência", fields: [{ label: "Nome", ask: false }] },
      { name: "Empresa", fields: [{ label: "CNPJ", ask: false }] },
    ]);
    const t = collectPromptText(two, {});
    expect(t).toContain("PLANILHAS DO NEGÓCIO");
    expect(t).toContain("salvar_previdencia");
    expect(t).toContain("salvar_empresa");
    expect(t).not.toContain("novo_registro");
    expect(t).not.toContain("Peça os dados");
  });
});

describe("mergeSuggestedSheets", () => {
  it("monta uma planilha por título e junta às atuais sem repetir", () => {
    const existing = normalizeSheets([
      { key: "prev", name: "Previdência", fields: [{ key: "nome", label: "Nome", ask: true }] },
    ]);
    const out = mergeSuggestedSheets(
      existing,
      "# Previdência\n- Nome\n- Valor a investir\n\n## **Empresa**\n1. CNPJ\nisto aqui é uma frase longa demais para ser um campo\nObservações",
    );
    expect(out).toEqual([
      {
        key: "prev",
        name: "Previdência",
        fields: [
          { key: "nome", label: "Nome", ask: true },
          { key: "valor_a_investir", label: "Valor a investir", ask: false },
        ],
      },
      {
        key: "empresa",
        name: "Empresa",
        fields: [
          { key: "cnpj", label: "CNPJ", ask: false },
          { key: "observacoes", label: "Observações", ask: false },
        ],
      },
    ]);
  });
  it("campos sem título vão para uma planilha", () => {
    const out = mergeSuggestedSheets([], "Nome\nCPF");
    expect(out).toHaveLength(1);
    expect(out[0]!.fields.map((f) => f.label)).toEqual(["Nome", "CPF"]);
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
