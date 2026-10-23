import { describe, expect, it } from "vitest";
import { DEMO_MESSAGE, demoWhatsAppLink } from "./demo-link";

describe("demoWhatsAppLink", () => {
  it("monta o link com 55 e a mensagem pronta", () => {
    expect(demoWhatsAppLink("(85) 99876-5432")).toBe(
      `https://wa.me/5585998765432?text=${encodeURIComponent(DEMO_MESSAGE)}`,
    );
  });

  it("aceita o número já com 55", () => {
    expect(demoWhatsAppLink("5585998765432")).toMatch(/^https:\/\/wa\.me\/5585998765432\?/);
  });

  it("sem número ou com número inválido não mostra o botão", () => {
    expect(demoWhatsAppLink("")).toBeNull();
    expect(demoWhatsAppLink(undefined)).toBeNull();
    expect(demoWhatsAppLink("123")).toBeNull();
  });
});
