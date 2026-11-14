import { describe, expect, it } from "vitest";
import {
  dayList,
  isCommandText,
  isNo,
  isYes,
  listDayOf,
  listText,
  occupancy,
  parseInterpretation,
  parseListReply,
  parseTeamNumbers,
  planText,
  senderKey,
  teamSenderOf,
  type TeamBooking,
} from "./team-commands-rules";

const bk = (id: string, startsAt: string, name: string, status = "reservado"): TeamBooking => ({
  id,
  kind: "reserva",
  status,
  contact_name: name,
  phone: null,
  starts_at: startsAt,
  ends_at: new Date(new Date(startsAt).getTime() + 3600_000).toISOString(),
});
// 14/11/2026 (sábado) 10h e 15h de Brasília = 13h e 18h UTC.
const ana = bk("b1", "2026-11-14T13:00:00.000Z", "Ana");
const bia = bk("b2", "2026-11-14T18:00:00.000Z", "Bia", "confirmado");
const caio = bk("b3", "2026-11-15T13:00:00.000Z", "Caio");

describe("quem é a equipe", () => {
  it("conversa você do número conectado", () => {
    expect(
      teamSenderOf({
        fromMe: true,
        phone: "5511999990000",
        ownPhone: "5511999990000",
        teamNumbers: [],
      }),
    ).toBe("self");
    // fromMe para um cliente é a equipe atendendo, não comando.
    expect(
      teamSenderOf({
        fromMe: true,
        phone: "5511888887777",
        ownPhone: "5511999990000",
        teamNumbers: [],
      }),
    ).toBeNull();
  });
  it("celular da lista da equipe", () => {
    const team = parseTeamNumbers("(11) 98888-7777\nxx");
    expect(team).toEqual(["11988887777"]);
    expect(
      teamSenderOf({ fromMe: false, phone: "5511988887777", ownPhone: null, teamNumbers: team }),
    ).toBe("phone");
    expect(
      teamSenderOf({ fromMe: false, phone: "5511977776666", ownPhone: null, teamNumbers: team }),
    ).toBeNull();
    expect(senderKey("self", "5511999990000")).toBe("voce");
    expect(senderKey("phone", "5511988887777")).toBe("1188887777");
  });
});

describe("textos", () => {
  it("comando tem #, inclusive no meio", () => {
    expect(isCommandText("#hoje")).toBe(true);
    expect(isCommandText("ok então # confirmar Ana")).toBe(true);
    expect(isCommandText("vou almoçar")).toBe(false);
    expect(isCommandText("#")).toBe(false);
  });
  it("sim e não", () => {
    expect(isYes("Sim")).toBe(true);
    expect(isYes("pode sim!")).toBe(true);
    expect(isNo("Não")).toBe(true);
    expect(isYes("sim, mas muda a hora")).toBe(false);
  });
  it("dia da lista", () => {
    expect(listDayOf("#hoje", "2026-11-14")).toBe("2026-11-14");
    expect(listDayOf("#amanhã", "2026-11-14")).toBe("2026-11-15");
    expect(listDayOf("#agenda 20/11", "2026-11-14")).toBe("2026-11-20");
    expect(listDayOf("#agenda 31/02", "2026-11-14")).toBeNull();
    expect(listDayOf("#hoje confirma a Ana", "2026-11-14")).toBeNull();
    expect(listDayOf("#confirmar Ana", "2026-11-14")).toBeNull();
  });
  it("resposta à lista", () => {
    expect(parseListReply("1 3", 3)).toEqual([1, 3]);
    expect(parseListReply("3, 1 e 2", 3)).toEqual([1, 2, 3]);
    expect(parseListReply("todos", 2)).toEqual([1, 2]);
    expect(parseListReply("4", 3)).toBeNull();
    expect(parseListReply("confirma a Ana", 3)).toBeNull();
  });
});

describe("lista do dia", () => {
  it("numerada, só o dia pedido, avisa o que falta confirmar", () => {
    const list = dayList([caio, bia, ana], "2026-11-14");
    expect(list.map((b) => b.id)).toEqual(["b1", "b2"]);
    const t = listText(list, "2026-11-14", "2026-11-14");
    expect(t).toContain("Agenda de hoje, sáb. 14/11:");
    expect(t).toContain("1. 10:00 Ana (reservado, falta confirmar)");
    expect(t).toContain("2. 15:00 Bia");
    expect(t).toContain("responda os números");
  });
  it("dia vazio", () => {
    expect(listText([], "2026-11-16", "2026-11-14")).toContain("nenhum horário");
  });
});

describe("interpretação da IA", () => {
  const all = [ana, bia, caio];
  it("ações válidas viram plano", () => {
    const r = parseInterpretation(
      'Claro! {"acoes":[{"tipo":"confirmar","id":"b1"},{"tipo":"remarcar","id":"b3","data":"2026-11-20","hora":"9:30"},{"tipo":"agendar","data":"2026-11-16","hora":"10:00","nome":"Davi","telefone":"(11) 91234-5678"}],"duvida":""}',
      all,
    );
    expect(r.problems).toEqual([]);
    expect(r.actions).toEqual([
      { tipo: "confirmar", id: "b1" },
      { tipo: "remarcar", id: "b3", data: "2026-11-20", hora: "09:30" },
      { tipo: "agendar", data: "2026-11-16", hora: "10:00", nome: "Davi", telefone: "11912345678" },
    ]);
    const t = planText(r.actions, all);
    expect(t).toContain("1. Confirmar Ana, sáb. 14/11 10:00");
    expect(t).toContain("2. Remarcar Caio de dom. 15/11 10:00 para sex. 20/11 09:30");
    expect(t).toContain("3. Agendar Davi (11912345678) em seg. 16/11 10:00");
    expect(t).toContain("Responda SIM");
  });
  it("id inventado, data inválida e JSON quebrado não viram ação", () => {
    const r = parseInterpretation(
      '{"acoes":[{"tipo":"cancelar","id":"zzz"},{"tipo":"remarcar","id":"b1","data":"2026-13-01","hora":"10:00"},{"tipo":"agendar","nome":"","data":"2026-11-16","hora":"10:00"}]}',
      all,
    );
    expect(r.actions).toEqual([]);
    expect(r.problems).toHaveLength(3);
    expect(parseInterpretation("não sei", all).actions).toEqual([]);
    expect(parseInterpretation("{quebrado}", all).problems).toEqual(["não entendi o comando"]);
  });
  it("dúvida da IA volta para a equipe", () => {
    expect(
      parseInterpretation('{"acoes":[],"duvida":"Qual Ana: 10h ou 15h?"}', [ana]).question,
    ).toBe("Qual Ana: 10h ou 15h?");
  });
});

describe("ocupação", () => {
  it("conta horários e bloqueio no intervalo", () => {
    const block: TeamBooking = { ...bk("x", "2026-11-14T13:30:00.000Z", ""), kind: "bloqueio" };
    const s = new Date("2026-11-14T13:00:00Z").getTime();
    expect(occupancy([ana, bia], s, s + 3600_000)).toEqual({ count: 1, blocked: false });
    expect(occupancy([ana], s, s + 3600_000, "b1")).toEqual({ count: 0, blocked: false });
    expect(occupancy([block], s, s + 3600_000).blocked).toBe(true);
  });
});
