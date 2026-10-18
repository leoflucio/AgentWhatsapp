/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { aiModel } from "./ai.server";

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
