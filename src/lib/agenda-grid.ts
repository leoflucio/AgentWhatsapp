/**
 * Grade da agenda (dia/semana) no fuso de Brasília: semana, faixa de horas
 * e posição de cada horário na grade. Puro (sem banco), testado em
 * agenda-grid.test.ts.
 */
import type { DayWindow } from "@/lib/agenda-hours";
import { addDaysISO, localDateTimeOf, weekdayOf } from "@/lib/agenda-time";

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Domingo da semana da data (AAAA-MM-DD). */
export function weekStartISO(dateISO: string): string {
  return addDaysISO(dateISO, -weekdayOf(dateISO));
}

/** Datas que a grade mostra: só o dia, ou os 7 dias da semana. */
export function gridDays(dateISO: string, view: "dia" | "semana"): string[] {
  if (view === "dia") return [dateISO];
  const start = weekStartISO(dateISO);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

function minutesOf(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h! * 60 + m!;
}

export type GridItem = { id: string; starts_at: string; ends_at: string };

export type Placed<T> = {
  item: T;
  /** Minutos a partir do início da grade. */
  top: number;
  height: number;
  /** Coluna e total de colunas quando há horários sobrepostos. */
  lane: number;
  lanes: number;
};

/**
 * Faixa de horas da grade: do primeiro horário de atendimento da semana ao
 * último, ampliada para caber todos os horários marcados. Sem nada, 8h–18h.
 */
export function gridHourRange(
  days: string[],
  schedule: Record<number, DayWindow[]>,
  items: GridItem[],
): { startHour: number; endHour: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const d of days) {
    for (const w of schedule[weekdayOf(d)] ?? []) {
      start = Math.min(start, w.start);
      end = Math.max(end, w.end);
    }
  }
  const daySet = new Set(days);
  for (const it of items) {
    const s = localDateTimeOf(it.starts_at);
    if (!daySet.has(s.data)) continue;
    const e = localDateTimeOf(it.ends_at);
    start = Math.min(start, minutesOf(s.hora));
    end = Math.max(end, e.data === s.data ? minutesOf(e.hora) : 24 * 60);
  }
  if (!Number.isFinite(start)) return { startHour: 8, endHour: 18 };
  return {
    startHour: Math.max(0, Math.floor(start / 60)),
    endHour: Math.min(24, Math.max(Math.floor(start / 60) + 1, Math.ceil(end / 60))),
  };
}

/** Horários de um dia posicionados na grade, lado a lado quando se sobrepõem. */
export function placeDay<T extends GridItem>(
  dateISO: string,
  items: T[],
  startHour: number,
  endHour: number,
): Placed<T>[] {
  const gridEnd = (endHour - startHour) * 60;
  const rows = items
    .map((item) => {
      const s = localDateTimeOf(item.starts_at);
      if (s.data !== dateISO) return null;
      const e = localDateTimeOf(item.ends_at);
      const startMin = minutesOf(s.hora) - startHour * 60;
      const endMin = (e.data === s.data ? minutesOf(e.hora) : 24 * 60) - startHour * 60;
      const top = Math.max(0, startMin);
      const bottom = Math.min(gridEnd, Math.max(endMin, startMin + 15));
      if (bottom <= top) return null;
      return { item, top, height: bottom - top, lane: 0, lanes: 1 };
    })
    .filter((r): r is Placed<T> => r !== null)
    .sort((a, b) => a.top - b.top || b.height - a.height);

  // Grupos de horários que se encostam; dentro do grupo, cada um na primeira coluna livre.
  let group: Placed<T>[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const r of group) r.lanes = laneEnds.length;
  };
  for (const r of rows) {
    if (r.top >= groupEnd) {
      close();
      group = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= r.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = r.top + r.height;
    r.lane = lane;
    group.push(r);
    groupEnd = Math.max(groupEnd, r.top + r.height);
  }
  close();
  return rows;
}
