import { describe, expect, it } from "vitest";
import { checkProfile, maskDoc, profileFromMetadata } from "./profile-rules";

describe("cadastro do cliente", () => {
  it("aceita e normaliza", () => {
    expect(
      checkProfile({
        name: "  Maria   da Silva ",
        phone: "(11) 97680-8371",
        doc: "529.982.247-25",
      }),
    ).toEqual({
      ok: true,
      profile: { name: "Maria da Silva", phone: "5511976808371", doc: "52998224725" },
    });
  });
  it("exige sobrenome, celular e CPF/CNPJ válidos", () => {
    expect(checkProfile({ name: "Maria", phone: "11976808371", doc: "52998224725" })).toEqual({
      ok: false,
      error: "Informe nome e sobrenome.",
    });
    expect(checkProfile({ name: "Maria Silva", phone: "1234", doc: "52998224725" }).ok).toBe(false);
    expect(checkProfile({ name: "Maria Silva", phone: "11976808371", doc: "11111111111" }).ok).toBe(
      false,
    );
    expect(
      checkProfile({ name: "Loja Boa", phone: "11976808371", doc: "11.222.333/0001-81" }).ok,
    ).toBe(true);
  });
  it("metadados do cadastro por e-mail viram perfil; os do Google (só nome) não", () => {
    expect(
      profileFromMetadata({ full_name: "Maria Silva", phone: "11976808371", doc: "52998224725" }),
    ).not.toBeNull();
    expect(profileFromMetadata({ full_name: "Maria Silva", avatar_url: "x" })).toBeNull();
    expect(profileFromMetadata(null)).toBeNull();
  });
  it("máscara de CPF e CNPJ", () => {
    expect(maskDoc("52998224725")).toBe("529.982.247-25");
    expect(maskDoc("5299")).toBe("529.9");
    expect(maskDoc("11222333000181")).toBe("11.222.333/0001-81");
  });
});
