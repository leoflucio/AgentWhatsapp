/**
 * Horário de atendimento (fuso America/Sao_Paulo).
 *
 * Cada conta configura o próprio horário (agent_settings.schedule). Sem
 * horário salvo, vale a grade padrão abaixo (segunda a sexta, 08h–18h).
 */

export interface DayWindow {
  start: number; // minutos desde 00:00 (local)
  end: number;
}

const WEEKDAY_WINDOW: DayWindow[] = [{ start: 8 * 60, end: 18 * 60 }];

export const DEFAULT_SCHEDULE: Record<number, DayWindow[]> = {
  0: [],
  1: WEEKDAY_WINDOW,
  2: WEEKDAY_WINDOW,
  3: WEEKDAY_WINDOW,
  4: WEEKDAY_WINDOW,
  5: WEEKDAY_WINDOW,
  6: [],
};

/** Todas as janelas de atendimento do dia (pode haver mais de uma). */
export function windowsForWeekday(
  weekday: number,
  schedule: Record<number, DayWindow[]> = DEFAULT_SCHEDULE,
): DayWindow[] {
  return schedule[weekday] ?? [];
}

/**
 * Janela "envelope" do dia (da primeira abertura ao último fechamento).
 * Útil para desenhar a grade da agenda; para validar horários use
 * `windowsForWeekday`.
 */
export function windowForWeekday(
  weekday: number,
  schedule: Record<number, DayWindow[]> = DEFAULT_SCHEDULE,
): DayWindow | null {
  const wins = windowsForWeekday(weekday, schedule);
  if (wins.length === 0) return null;
  return {
    start: Math.min(...wins.map((w) => w.start)),
    end: Math.max(...wins.map((w) => w.end)),
  };
}

/** Verifica se um intervalo (minutos do dia) cabe dentro de alguma janela. */
export function isWithinBusinessHours(
  weekday: number,
  startMin: number,
  endMin: number,
  schedule: Record<number, DayWindow[]> = DEFAULT_SCHEDULE,
): boolean {
  return windowsForWeekday(weekday, schedule).some((w) => startMin >= w.start && endMin <= w.end);
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Lê o horário salvo pela conta (JSON: { "1": [{"start":780,"end":1200}], ... }),
 * descartando janelas inválidas. null quando não há nada configurado.
 */
export function parseSchedule(json: unknown): Record<number, DayWindow[]> | null {
  if (!json || typeof json !== "object") return null;
  const out: Record<number, DayWindow[]> = {};
  let any = false;
  for (let d = 0; d <= 6; d++) {
    const raw = (json as Record<string, unknown>)[String(d)];
    const wins = (Array.isArray(raw) ? raw : [])
      .map((w) => w as { start?: unknown; end?: unknown })
      .filter(
        (w) =>
          Number.isInteger(w.start) &&
          Number.isInteger(w.end) &&
          (w.start as number) >= 0 &&
          (w.end as number) <= 24 * 60 &&
          (w.start as number) < (w.end as number),
      )
      .map((w) => ({ start: w.start as number, end: w.end as number }))
      .sort((a, b) => a.start - b.start);
    out[d] = wins;
    if (wins.length) any = true;
  }
  return any ? out : null;
}

/** Rótulo legível de uma grade semanal (ex.: "Seg 13:00–20:00 · Sex 08:00–12:00 e 13:00–18:00"). */
export function scheduleText(sched: Record<number, DayWindow[]>): string {
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const parts: string[] = [];
  for (let d = 0; d <= 6; d++) {
    const wins = sched[d] ?? [];
    if (wins.length === 0) continue;
    parts.push(
      `${names[d]} ${wins.map((w) => `${formatMinutes(w.start)}–${formatMinutes(w.end)}`).join(" e ")}`,
    );
  }
  return parts.join(" · ") || "sem horário de atendimento";
}
