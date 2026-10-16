import { describe, expect, it } from "vitest";
import {
  instanceTokenFrom,
  managedInstanceName,
  qrFrom,
  stateFromEvolution,
} from "./whatsapp-managed";

describe("WhatsApp gerenciado (QR Code)", () => {
  it("nome da instância é estável e só com letras/números", () => {
    expect(managedInstanceName("3F2A-11b8-0000")).toBe("agw_3f2a11b80000");
  });

  it("situação da conexão", () => {
    expect(stateFromEvolution("open")).toBe("conectado");
    expect(stateFromEvolution("connecting")).toBe("aguardando_qr");
    expect(stateFromEvolution("close")).toBe("desconectado");
    expect(stateFromEvolution(undefined)).toBe("desconectado");
  });

  it("token da instância nas duas versões da Evolution", () => {
    expect(instanceTokenFrom({ hash: "abc" })).toBe("abc");
    expect(instanceTokenFrom({ hash: { apikey: "xyz" } })).toBe("xyz");
    expect(instanceTokenFrom({})).toBeNull();
  });

  it("QR Code vira data URL, venha de create ou de connect", () => {
    expect(qrFrom({ qrcode: { base64: "data:image/png;base64,AAA" } }).qr).toBe(
      "data:image/png;base64,AAA",
    );
    expect(qrFrom({ base64: "BBB", pairingCode: "WZYX1234" })).toEqual({
      qr: "data:image/png;base64,BBB",
      pairingCode: "WZYX1234",
    });
    expect(qrFrom({ instance: { state: "open" } }).qr).toBeNull();
  });
});
