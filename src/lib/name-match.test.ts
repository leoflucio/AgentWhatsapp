import { describe, expect, it } from "vitest";
import {
  mentionedNames,
  nameMatches,
  nameScore,
  pickByName,
  sameFullName,
  soundKey,
  splitNames,
} from "@/lib/name-match";

describe("soundKey", () => {
  it("iguala grafias que soam igual", () => {
    const same = [
      ["Valkyria", "Walkyria"],
      ["Valkyria", "Valquíria"],
      ["Sueli", "Suely"],
      ["Thaís", "Tais"],
      ["Luiz", "Luis"],
      ["Rafaella", "Rafaela"],
      ["Phelipe", "Felipe"],
      ["Wagner", "Vagner"],
      ["Kátia", "Cátia"],
      ["Cecília", "Sesília"],
      ["Conceição", "Consseissao"],
    ];
    for (const [a, b] of same) expect(soundKey(a!), `${a} = ${b}`).toBe(soundKey(b!));
  });
  it("não junta nomes diferentes", () => {
    expect(soundKey("Ana")).not.toBe(soundKey("Mariana"));
    expect(soundKey("Carla")).not.toBe(soundKey("Clara"));
  });
});

describe("nameMatches", () => {
  it("acha pelo som, pelo começo e sem partículas", () => {
    expect(nameMatches("Walkyria", "Valquíria Souza")).toBe(true);
    expect(nameMatches("valkiria souza", "Walkyria Sousa")).toBe(true);
    expect(nameMatches("Maria Sil", "Maria da Silva")).toBe(true);
    expect(nameMatches("Suely", "Sueli Ramos")).toBe(true);
  });
  it("não confunde", () => {
    expect(nameMatches("Ana", "Mariana")).toBe(false);
    expect(nameMatches("Ana Paula", "Ana Clara")).toBe(false);
    expect(nameMatches("", "Ana")).toBe(false);
  });
});

describe("sameFullName", () => {
  it("exige o nome completo", () => {
    expect(sameFullName("Walkyria Sousa", "Valquíria Souza")).toBe(true);
    expect(sameFullName("Maria da Silva", "maria silva")).toBe(true);
    expect(sameFullName("Ana", "Ana")).toBe(false);
    expect(sameFullName("Ana Silva", "Ana Souza")).toBe(false);
    expect(sameFullName("Ana Silva", null)).toBe(false);
  });
});

describe("splitNames", () => {
  it("separa por vírgula e 'e'", () => {
    expect(splitNames("Ana, Bia e Carla")).toEqual(["Ana", "Bia", "Carla"]);
    expect(splitNames("Adriano e Fabíola")).toEqual(["Adriano", "Fabíola"]);
  });
});

describe("nameScore", () => {
  it("dá 1 para o mesmo nome e nota alta para erro de uma letra", () => {
    expect(nameScore("Walkyria", "Valquíria")).toBe(1);
    expect(nameScore("Fabiula", "Fabíola")).toBeGreaterThanOrEqual(0.6);
    expect(nameScore("Lucy", "Erluce")).toBeGreaterThanOrEqual(0.6);
    expect(nameScore("Roberto", "Ana")).toBeLessThan(0.6);
  });
});

describe("pickByName", () => {
  const items = [
    { id: "1", nome: "Valquíria Souza" },
    { id: "2", nome: "Valquíria Souza" },
    { id: "3", nome: "Ana Paula" },
    { id: "4", nome: "Ana Clara" },
    { id: "5", nome: "Fabíola Lima" },
  ];
  const pick = (t: string) => pickByName(items, t, (i) => i.nome);
  it("junta os horários da mesma pessoa", () => {
    const r = pick("Walkyria");
    expect(r.ok && r.items.map((i) => i.id)).toEqual(["1", "2"]);
  });
  it("pergunta quando há duas pessoas", () => {
    const r = pick("Ana");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("varios");
  });
  it("aceita erro de digitação de uma só pessoa parecida", () => {
    const r = pick("Fabiula");
    expect(r.ok && r.nome).toBe("Fabíola Lima");
    expect(r.ok && r.exact).toBe(false);
  });
  it("não chuta quando ninguém parece", () => {
    expect(pick("Roberto").ok).toBe(false);
  });
});

describe("mentionedNames", () => {
  const names = ["Valquíria Souza", "Sueli Ramos", "Mariana Lopes", "Ana Clara"];
  it("acha os nomes citados pelo som", () => {
    expect(mentionedNames("#confirmar Walkyria amanhã 10h", names)).toEqual(["Valquíria Souza"]);
    expect(mentionedNames("#cancelar a Suely e a valkiria", names)).toEqual([
      "Valquíria Souza",
      "Sueli Ramos",
    ]);
  });
  it("ignora palavras do comando", () => {
    expect(mentionedNames("#confirmar todos de hoje", names)).toEqual([]);
  });
});
