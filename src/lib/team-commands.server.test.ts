/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: string[] = [];
vi.mock("@/lib/evolution.server", () => ({
  sendText: vi.fn(async ({ text }: { text: string }) => {
    sent.push(text);
    return {};
  }),
  transcribeAudio: vi.fn(async () => "confirma a Ana"),
}));
vi.mock("@/lib/billing.server", () => ({
  resolveAccess: vi.fn(async () => ({ access: { kind: "plano", limit: null }, used: 0 })),
}));

import { handleTeamMessage } from "./team-commands.server";

/** Banco falso em memória com o pedaço da API do Supabase que o código usa. */
function fakeDb(tables: Record<string, any[]>) {
  const from = (name: string) => {
    tables[name] ??= [];
    const rows = tables[name]!;
    const filters: Array<(r: any) => boolean> = [];
    let op: "select" | "update" | "insert" | "upsert" = "select";
    let payload: any = null;
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), q),
      lt: (c: string, v: any) => (filters.push((r) => r[c] < v), q),
      gt: (c: string, v: any) => (filters.push((r) => r[c] > v), q),
      gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), q),
      order: () => q,
      limit: () => q,
      update: (p: any) => ((op = "update"), (payload = p), q),
      insert: (p: any) => ((op = "insert"), (payload = p), q),
      upsert: (p: any) => {
        const i = rows.findIndex(
          (r) => r.account_id === p.account_id && r.sender_key === p.sender_key,
        );
        if (i >= 0) rows[i] = { ...rows[i], ...p };
        else rows.push({ ...p });
        return Promise.resolve({ error: null });
      },
      maybeSingle: () => run().then((r: any) => ({ data: r.data[0] ?? null, error: null })),
      then: (res: any, rej: any) => run().then(res, rej),
    };
    const run = async () => {
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, payload));
      if (op === "insert") rows.push({ id: `n${rows.length + 1}`, ...payload });
      return { data: op === "select" ? hit : null, error: null };
    };
    return q;
  };
  return { from };
}

const reply = (content: string) =>
  new Response(
    JSON.stringify({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "g",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { "content-type": "application/json" } },
  );

const OWN = "5511999990000";
const ctx = { account: { id: "acc" }, instance: "agw_x", token: null };
const settings = { slot_capacity: 1, slot_minutes: 60 };
const msg = (text: string) => ({
  key: { fromMe: true, id: Math.random().toString() },
  message: { conversation: text },
});

// Horários daqui a 2 e 3 dias (sempre no futuro).
const day = (n: number, h: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString();
};

describe("comandos da equipe (fluxo)", () => {
  let db: Record<string, any[]>;
  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv("AI_API_KEY", "teste");
    vi.stubEnv("AI_MODEL_FALLBACK", "off");
    db = {
      bookings: [
        {
          id: "b1",
          account_id: "acc",
          kind: "reserva",
          status: "reservado",
          contact_name: "Ana",
          phone: null,
          starts_at: day(2, 13),
          ends_at: day(2, 14),
        },
        {
          id: "b2",
          account_id: "acc",
          kind: "reserva",
          status: "confirmado",
          contact_name: "Bia",
          phone: null,
          starts_at: day(2, 15),
          ends_at: day(2, 16),
        },
      ],
      team_command_state: [],
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const run = (text: string) =>
    handleTeamMessage(fakeDb(db) as any, {
      ctx,
      settings,
      m: msg(text) as any,
      sender: "self",
      phone: OWN,
    });

  it("só muda a agenda depois do SIM", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply('{"acoes":[{"tipo":"remarcar","id":"b1","data":"2030-01-10","hora":"10:00"}]}'),
      ),
    );
    await run("#remarcar Ana dia 10/01/2030 10h");
    expect(sent.at(-1)).toContain("Remarcar Ana");
    expect(db.bookings[0].starts_at).toBe(day(2, 13));
    // O eco da própria resposta na conversa "você" é ignorado.
    await run(sent.at(-1)!);
    expect(sent).toHaveLength(1);
    await run("sim");
    expect(sent.at(-1)).toContain("Remarcado: Ana");
    expect(db.bookings[0].starts_at).toBe("2030-01-10T13:00:00.000Z");
    // Um segundo "sim" não refaz nada.
    await run("sim");
    expect(sent).toHaveLength(2);
  });

  it("NÃO desfaz o plano", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply('{"acoes":[{"tipo":"cancelar","id":"b2"}]}')),
    );
    await run("#cancelar Bia");
    await run("não");
    expect(sent.at(-1)).toBe("Certo, não mudei nada.");
    expect(db.bookings[1].status).toBe("confirmado");
  });

  it("agendar por cima de horário ocupado é recusado", async () => {
    const [d, h] = [day(2, 13).slice(0, 10), "10:00"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(`{"acoes":[{"tipo":"agendar","data":"${d}","hora":"${h}","nome":"Davi"}]}`),
      ),
    );
    await run("#agendar Davi");
    await run("sim");
    expect(sent.at(-1)).toContain("está ocupado");
    expect(db.bookings).toHaveLength(2);
  });

  it("lista do dia e resposta com os números confirma", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const iso = new Date(new Date(day(2, 13)).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const [y, mo, d] = iso.split("-");
    await run(`#agenda ${d}/${mo}/${y}`);
    expect(sent.at(-1)).toContain("1. 10:00 Ana (reservado, falta confirmar)");
    expect(sent.at(-1)).toContain("2. 12:00 Bia");
    await run("1");
    expect(sent.at(-1)).toContain("Confirmado: Ana");
    expect(db.bookings[0].status).toBe("confirmado");
  });

  it("mensagem da equipe sem # fica sem resposta", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await run("lembrar de comprar café");
    expect(sent).toHaveLength(0);
    expect(f).not.toHaveBeenCalled();
  });
});
