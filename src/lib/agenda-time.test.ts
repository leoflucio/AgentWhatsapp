import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULE } from "./agenda-hours";
import {
  addDaysISO,
  clampCapacity,
  freeSlots,
  localDateTimeOf,
  localDateTimeToUTC,
  todayLocalISO,
} from "./agenda-time";

describe("data e hora locais do agente (Brasília)", () => {
  it("16:00 em Brasília é 19:00 UTC — nunca 16:00 UTC", () => {
    expect(localDateTimeToUTC("2026-10-06", "16:00")?.toISOString()).toBe(
      "2026-10-06T19:00:00.000Z",
    );
  });
  it("ida e volta", () => {
    expect(localDateTimeOf("2026-10-06T19:00:00.000Z")).toEqual({
      data: "2026-10-06",
      hora: "16:00",
    });
  });
  it("hora inválida", () => {
    expect(localDateTimeToUTC("2026-10-06", "25:00")).toBeNull();
    expect(localDateTimeToUTC("06/10/2026", "10:00")).toBeNull();
  });
  it("hoje em Brasília não vira amanhã às 22h", () => {
    expect(todayLocalISO(new Date("2026-10-07T01:30:00.000Z"))).toBe("2026-10-06");
  });
  it("soma dias atravessando o mês", () => {
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("freeSlots", () => {
  const now = new Date("2026-10-05T00:00:00.000Z").getTime(); // domingo à noite em Brasília

  it("segue o horário de atendimento e pula o domingo", () => {
    const slots = freeSlots({
      schedule: DEFAULT_SCHEDULE,
      busy: [],
      fromDate: "2026-10-04", // domingo
      days: 2,
      durationMin: 60,
      maxResults: 50,
      nowMs: now,
    });
    expect(slots).toHaveLength(10);
    expect(localDateTimeOf(slots[0]!.start)).toEqual({ data: "2026-10-05", hora: "08:00" });
    expect(localDateTimeOf(slots[9]!.start)).toEqual({ data: "2026-10-05", hora: "17:00" });
  });

  it("não oferece horário ocupado nem no passado", () => {
    const slots = freeSlots({
      schedule: DEFAULT_SCHEDULE,
      busy: [{ starts_at: "2026-10-05T12:30:00.000Z", ends_at: "2026-10-05T13:30:00.000Z" }],
      fromDate: "2026-10-05",
      days: 1,
      durationMin: 60,
      maxResults: 50,
      nowMs: new Date("2026-10-05T11:30:00.000Z").getTime(), // 08:30 em Brasília
    });
    expect(slots.map((s) => localDateTimeOf(s.start).hora)).toEqual([
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
  });

  it("com vagas por horário, só fecha quando lota; bloqueio fecha sempre", () => {
    const at = (hora: string) => {
      const s = localDateTimeToUTC("2026-10-05", hora)!;
      return {
        starts_at: s.toISOString(),
        ends_at: new Date(s.getTime() + 3600_000).toISOString(),
      };
    };
    const busy = [
      { ...at("08:00"), kind: "reserva" },
      { ...at("09:00"), kind: "reserva" },
      { ...at("09:00"), kind: "reserva" },
      { ...at("10:00"), kind: "bloqueio" },
    ];
    const horas = (capacity: number) =>
      freeSlots({
        schedule: DEFAULT_SCHEDULE,
        busy,
        fromDate: "2026-10-05",
        days: 1,
        durationMin: 60,
        maxResults: 3,
        nowMs: now,
        capacity,
      }).map((sl) => localDateTimeOf(sl.start).hora);
    expect(horas(1)).toEqual(["11:00", "12:00", "13:00"]);
    expect(horas(2)).toEqual(["08:00", "11:00", "12:00"]);
    expect(horas(3)).toEqual(["08:00", "09:00", "11:00"]);
  });

  it("vagas inválidas viram 1", () => {
    expect(clampCapacity(0)).toBe(1);
    expect(clampCapacity("abc")).toBe(1);
    expect(clampCapacity(3.7)).toBe(3);
    expect(clampCapacity(999)).toBe(50);
  });
});
