import { describe, expect, it } from "vitest";
import { parseContactsCsv, parseContactsFile, parseVCard } from "./contacts-import";

describe("importar agenda — vCard", () => {
  it("lê vCard 3.0 do iPhone/Google com vários telefones", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Silva;Maria;;;",
      "FN:Maria Silva",
      "TEL;type=CELL;type=VOICE;type=pref:+55 (83) 98765-4321",
      "item1.TEL:(83) 3222-1111",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Sem telefone",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVCard(vcf)).toEqual([
      { name: "Maria Silva", phones: ["+55 (83) 98765-4321", "(83) 3222-1111"] },
    ]);
  });

  it("lê vCard 2.1 do Android com acento em quoted-printable e linha dobrada", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ara=C3=BAjo;Jo=C3=A3o;;;",
      "TEL;CELL:8399",
      " 9887766",
      "END:VCARD",
    ].join("\n");
    expect(parseVCard(vcf)).toEqual([{ name: "João Araújo", phones: ["83999887766"] }]);
  });
});

describe("importar agenda — CSV", () => {
  it("lê o CSV do Google Contatos (First/Last Name e Phone 1 - Value)", () => {
    const csv = [
      "First Name,Last Name,Phone 1 - Label,Phone 1 - Value",
      'Ana,Souza,Mobile,"+55 84 99111-2222 ::: +55 84 3333-4444"',
    ].join("\n");
    expect(parseContactsCsv(csv)).toEqual([
      { name: "Ana Souza", phones: ["+55 84 99111-2222", "+55 84 3333-4444"] },
    ]);
  });

  it("lê planilha simples com ponto e vírgula", () => {
    const csv = "Nome;Celular\nCarlos;(11) 97680-8371\n";
    expect(parseContactsCsv(csv)).toEqual([{ name: "Carlos", phones: ["(11) 97680-8371"] }]);
  });
});

describe("importar agenda — lista final", () => {
  it("só celulares válidos, sem repetir o mesmo número", () => {
    const csv = "Nome,Telefone\nA,11976808371\nB,5511976808371\nC,1132221111\nD,123\n";
    const r = parseContactsFile(csv);
    expect(r.rows).toEqual([
      { name: "A", phone: "5511976808371" },
      { name: "C", phone: "551132221111" },
    ]);
    expect(r.skipped).toBe(1);
  });
});
