import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULE } from "./agenda-hours";
import { gridDays, gridHourRange, placeDay, weekStartISO } from "./agenda-grid";

// 2026-10-14 é quarta-feira. 12:00 UTC = 09:00 em Brasília.
const at = (data: string, hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return new Date(
    `${data}T${String(h! + 3).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`,
  ).toISOString();
};
const item = (id: string, data: string, start: string, end: string) => ({
  id,
  starts_at: at(data, start),
  ends_at: at(data, end),
});

describe("semana da agenda", () => {
  it("começa no domingo", () => {
    expect(weekStartISO("2026-10-14")).toBe("2026-10-11");
    expect(weekStartISO("2026-10-11")).toBe("2026-10-11");
  });
  it("dia mostra só a data; semana mostra 7 dias", () => {
    expect(gridDays("2026-10-14", "dia")).toEqual(["2026-10-14"]);
    const w = gridDays("2026-10-14", "semana");
    expect(w).toHaveLength(7);
    expect(w[0]).toBe("2026-10-11");
    expect(w[6]).toBe("2026-10-17");
  });
});

describe("faixa de horas", () => {
  it("segue o horário de atendimento", () => {
    expect(gridHourRange(["2026-10-14"], DEFAULT_SCHEDULE, [])).toEqual({
      startHour: 8,
      endHour: 18,
    });
  });
  it("amplia para caber horário marcado fora do expediente", () => {
    const r = gridHourRange(["2026-10-14"], DEFAULT_SCHEDULE, [
      item("a", "2026-10-14", "19:30", "20:15"),
    ]);
    expect(r).toEqual({ startHour: 8, endHour: 21 });
  });
  it("domingo fechado e sem horários: 8h–18h", () => {
    expect(gridHourRange(["2026-10-11"], DEFAULT_SCHEDULE, [])).toEqual({
      startHour: 8,
      endHour: 18,
    });
  });
});

describe("posição na grade", () => {
  it("calcula topo e altura em minutos e ignora outros dias", () => {
    const p = placeDay(
      "2026-10-14",
      [item("a", "2026-10-14", "09:30", "10:30"), item("b", "2026-10-15", "09:00", "10:00")],
      8,
      18,
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ top: 90, height: 60, lane: 0, lanes: 1 });
  });
  it("sobrepostos ficam lado a lado; o seguinte volta a ocupar a largura toda", () => {
    const p = placeDay(
      "2026-10-14",
      [
        item("a", "2026-10-14", "09:00", "10:00"),
        item("b", "2026-10-14", "09:30", "10:30"),
        item("c", "2026-10-14", "11:00", "12:00"),
      ],
      8,
      18,
    );
    const by = Object.fromEntries(p.map((r) => [r.item.id, r]));
    expect(by.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(by.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(by.c).toMatchObject({ lane: 0, lanes: 1 });
  });
  it("horário curto ganha altura mínima de 15 minutos", () => {
    const p = placeDay("2026-10-14", [item("a", "2026-10-14", "09:00", "09:05")], 8, 18);
    expect(p[0]!.height).toBe(15);
  });
});
