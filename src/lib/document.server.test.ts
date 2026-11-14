/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const pdf = readFileSync(join(__dirname, "__fixtures__", "ir-exemplo.pdf"));
let media: string | null = pdf.toString("base64");
vi.mock("@/lib/evolution.server", () => ({
  downloadMedia: vi.fn(async () => media),
}));

import { analyzePdf } from "./document.server";

const reply = (content: string) =>
  new Response(
    JSON.stringify({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "gemini",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { "content-type": "application/json" } },
  );

const args = {
  instance: "agw_x",
  messageId: "ABC",
  fileName: "ir.pdf",
  caption: "Ele é apto ao seguro de vida?",
  instructions: "Renda mínima de R$ 50 mil por ano.",
};

describe("analyzePdf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    media = pdf.toString("base64");
  });

  it("lê o texto do PDF e manda para a IA com os critérios", async () => {
    vi.stubEnv("AI_API_KEY", "teste");
    vi.stubEnv("AI_MODEL_FALLBACK", "off");
    const bodies: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return reply("Resultado: APTO");
      }),
    );
    const r = await analyzePdf(args);
    expect(r).toEqual({ ok: true, result: "Resultado: APTO", pages: 1 });
    const msgs = bodies[0].messages;
    expect(msgs[0].content).toContain("Renda mínima de R$ 50 mil");
    // PDF de exemplo tem pouco texto: vai como arquivo (PDF escaneado).
    const user = msgs[1].content;
    expect(JSON.stringify(user)).toContain("application/pdf");
  });

  it("PDF com bastante texto vai como texto, não como arquivo", async () => {
    vi.stubEnv("AI_API_KEY", "teste");
    vi.stubEnv("AI_MODEL_FALLBACK", "off");
    const big = makePdf(
      Array.from({ length: 12 }, (_, i) => `Rendimentos tributaveis linha ${i} 120.000,00`),
    );
    media = Buffer.from(big).toString("base64");
    const bodies: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return reply("ok");
      }),
    );
    await analyzePdf(args);
    const user = JSON.stringify(bodies[0].messages[1].content);
    expect(user).not.toContain("application/pdf");
    expect(user).toContain("<documento>");
    expect(user).toContain("Rendimentos tributaveis linha 11 120.000,00");
  });

  it("sem conseguir baixar o arquivo, avisa que não leu", async () => {
    vi.stubEnv("AI_API_KEY", "teste");
    media = null;
    expect(await analyzePdf(args)).toEqual({ ok: false, reason: "ilegivel" });
  });
});

/** PDF mínimo de uma página com o texto dado. */
function makePdf(lines: string[]): Uint8Array {
  const content = `BT /F1 10 Tf 20 760 Td ${lines.map((l) => `(${l}) Tj 0 -14 Td`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
