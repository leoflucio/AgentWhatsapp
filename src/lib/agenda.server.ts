/* eslint-disable @typescript-eslint/no-explicit-any */
/** Agenda da conta no banco: horário de atendimento e horários ocupados. */
import { DEFAULT_SCHEDULE, parseSchedule, type DayWindow } from "@/lib/agenda-hours";
import { addDaysISO, freeSlots, localToUTC, type Slot } from "@/lib/agenda-time";

export function scheduleOf(settings: { schedule?: unknown } | null): Record<number, DayWindow[]> {
  return parseSchedule(settings?.schedule) ?? DEFAULT_SCHEDULE;
}

/** Reservas, horários confirmados e bloqueios (não cancelados) no intervalo. */
export async function busyIntervals(
  admin: any,
  accountId: string,
  fromISO: string,
  toISO: string,
): Promise<Array<{ starts_at: string; ends_at: string }>> {
  const { data, error } = await admin
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("account_id", accountId)
    .neq("status", "cancelado")
    .lt("starts_at", toISO)
    .gt("ends_at", fromISO);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ starts_at: string; ends_at: string }>;
}

export async function listFreeSlots(
  admin: any,
  args: {
    accountId: string;
    schedule: Record<number, DayWindow[]>;
    fromDate: string;
    days: number;
    durationMin: number;
    maxResults?: number;
  },
): Promise<Slot[]> {
  const busy = await busyIntervals(
    admin,
    args.accountId,
    localToUTC(args.fromDate, 0).toISOString(),
    localToUTC(addDaysISO(args.fromDate, args.days), 0).toISOString(),
  );
  return freeSlots({ ...args, busy });
}
