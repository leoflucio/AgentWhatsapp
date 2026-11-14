/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { aiModel, fallbackModels } from "./ai.server";

const reply = (message: object) =>
  new Response(
    JSON.stringify({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "gemini",
      choices: [{ index: 0, message, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { "content-type": "application/json" } },
  );

describe("aiModel com ferramentas (Gemini 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("devolve a thought_signature da chamada de ferramenta na rodada seguinte", async () => {
    vi.stubEnv("AI_API_KEY", "teste");
    const bodies: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return bodies.length === 1
          ? reply({
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "salvar_dados", arguments: '{"cnpj":"41587571000151"}' },
                  extra_content: { google: { thought_signature: "assinatura" } },
                },
              ],
            })
          : reply({ role: "assistant", content: "Anotado." });
      }),
    );
    const r = await generateText({
      model: aiModel("main")!,
      prompt: "CNPJ 41587571000151",
      tools: {
        salvar_dados: tool({
          inputSchema: z.object({ cnpj: z.string().optional() }),
          execute: async () => "ok",
        }),
      },
      stopWhen: stepCountIs(3),
    });
    expect(r.text).toBe("Anotado.");
    const call = bodies[1].messages.find((m: any) => m.tool_calls)?.tool_calls[0];
    expect(call.extra_content).toEqual({ google: { thought_signature: "assinatura" } });
  });
});

describe("aiModel com modelos reserva", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("lista de reservas em ordem, sem o principal e com off", () => {
    expect(fallbackModels("gemini-3.8-flash", "")).toEqual([
      "gemini-3.6-flash",
      "gemini-3.1-flash-lite",
    ]);
    expect(fallbackModels("gemini-3.1-flash-lite", "")).toEqual(["gemini-3.6-flash"]);
    expect(fallbackModels("a", " b , c ,b")).toEqual(["b", "c"]);
    expect(fallbackModels("a", "off")).toEqual([]);
  });

  it("com o principal e o primeiro reserva sobrecarregados, usa o segundo", async () => {
    vi.stubEnv("AI_API_KEY", "teste");
    vi.stubEnv("AI_MODEL", "principal");
    vi.stubEnv("AI_MODEL_FALLBACK", "reserva1,reserva2");
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const model = JSON.parse(String(init.body)).model as string;
        models.push(model);
        if (model !== "reserva2") {
          return new Response(JSON.stringify({ error: { message: "high demand" } }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        return reply({ role: "assistant", content: "Oi!" });
      }),
    );
    const r = await generateText({ model: aiModel("main")!, prompt: "oi", maxRetries: 0 });
    expect(r.text).toBe("Oi!");
    expect(models).toEqual(["principal", "reserva1", "reserva2"]);
  });

  it("erro que não é de sobrecarga não troca de modelo", async () => {
    vi.stubEnv("AI_API_KEY", "teste");
    vi.stubEnv("AI_MODEL", "principal");
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        models.push(JSON.parse(String(init.body)).model as string);
        return new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await expect(
      generateText({ model: aiModel("main")!, prompt: "oi", maxRetries: 0 }),
    ).rejects.toThrow();
    expect(models).toEqual(["principal"]);
  });
});
