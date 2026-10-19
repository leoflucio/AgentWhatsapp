/**
 * Datas e horários da agenda no fuso de Brasília, e cálculo dos horários
 * livres. Puro (sem banco), testado em agenda-time.test.ts.
 */
import type { DayWindow } from "@/lib/agenda-hours";

export const AGENDA_TZ = "America/Sao_Paulo";

/** Offset (em minutos) do fuso da agenda em um instante UTC. */
function tzOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: AGENDA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<
    string,
    string
  >;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return (asUTC - date.getTime()) / 60000;
}

/** Converte data local (YYYY-MM-DD) + minutos do dia para um Date UTC. */
export function localToUTC(dateISO: string, minutesOfDay: number): Date {
  const [y, m, d] = dateISO.split("-").map((v) => parseInt(v, 10));
  const naive = Date.UTC(y!, m! - 1, d!, 0, minutesOfDay);
  const off = tzOffsetMinutes(new Date(naive));
  return new Date(naive - off * 60000);
}

/** Data (AAAA-MM-DD) e hora (HH:MM) no fuso da agenda de um instante. */
export function localDateTimeOf(iso: string): { data: string; hora: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: AGENDA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const hh = p.hour === "24" ? "00" : p.hour;
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${hh}:${p.minute}` };
}

/** Data local + "HH:MM" para o instante UTC; null se inválido. */
export function localDateTimeToUTC(data: string, hora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return localToUTC(data, h * 60 + min);
}

/** Dia da semana (0=dom) da data local. */
export function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay();
}

export function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: AGENDA_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Hoje" em Brasília (AAAA-MM-DD). Nunca use toISOString().slice(0, 10). */
export function todayLocalISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENDA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export interface Slot {
  start: string;
  end: string;
  label: string;
}

/** Quantas pessoas cabem no mesmo horário (1 = horário exclusivo). */
export const MAX_SLOT_CAPACITY = 50;

export function clampCapacity(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_SLOT_CAPACITY);
}

/**
 * Horários livres dentro do horário de atendimento, de `durationMin` em
 * `durationMin`, só no futuro. Um bloqueio fecha o horário; reservas e
 * horários marcados ocupam uma vaga cada, até `capacity` (padrão 1).
 */
export function freeSlots(args: {
  schedule: Record<number, DayWindow[]>;
  busy: Array<{ starts_at: string; ends_at: string; kind?: string | null }>;
  fromDate: string;
  days: number;
  durationMin: number;
  maxResults?: number;
  nowMs?: number;
  capacity?: number;
}): Slot[] {
  const busyRanges = args.busy.map((b) => ({
    s: new Date(b.starts_at).getTime(),
    e: new Date(b.ends_at).getTime(),
    block: b.kind === "bloqueio",
  }));
  const capacity = clampCapacity(args.capacity ?? 1);
  const now = args.nowMs ?? Date.now();
  const out: Slot[] = [];
  const step = args.durationMin;
  for (let d = 0; d < args.days; d++) {
    const dateISO = addDaysISO(args.fromDate, d);
    for (const win of args.schedule[weekdayOf(dateISO)] ?? []) {
      for (let m = win.start; m + step <= win.end; m += step) {
        const start = localToUTC(dateISO, m);
        const end = new Date(start.getTime() + step * 60000);
        if (start.getTime() <= now) continue;
        const hits = busyRanges.filter((b) => start.getTime() < b.e && end.getTime() > b.s);
        if (hits.some((b) => b.block) || hits.length >= capacity) continue;
        out.push({
          start: start.toISOString(),
          end: end.toISOString(),
          label: formatLocal(start.toISOString()),
        });
        if (out.length >= (args.maxResults ?? 20)) return out;
      }
    }
  }
  return out;
}
