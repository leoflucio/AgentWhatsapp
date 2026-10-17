import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { DEFAULT_SCHEDULE } from "@/lib/agenda-hours";
import { WEEKDAY_SHORT, gridDays, gridHourRange, placeDay } from "@/lib/agenda-grid";
import {
  addDaysISO,
  formatLocal,
  localDateTimeOf,
  todayLocalISO,
  weekdayOf,
} from "@/lib/agenda-time";
import { formatWhatsApp } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  createBooking,
  getAgentSettings,
  listBookings,
  setBookingStatus,
  type BookingRow,
} from "@/lib/agent.functions";

export const Route = createFileRoute("/_app/agenda")({ component: AgendaPage });

const HOUR_PX = 48;

function bookingStyle(b: BookingRow): string {
  if (b.kind === "bloqueio")
    return "border-slate-400/60 bg-slate-500/15 text-slate-700 dark:text-slate-300";
  if (b.status === "reservado")
    return "border-amber-500/60 bg-amber-500/20 text-amber-900 dark:text-amber-100";
  return "border-primary/50 bg-primary/15 text-foreground";
}

function bookingTitle(b: BookingRow): string {
  if (b.kind === "bloqueio") return b.notes || "Bloqueado";
  return b.contact_name || (b.phone ? formatWhatsApp(b.phone) : "Cliente");
}

function rangeLabel(days: string[]): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opts });
  if (days.length === 1) return fmt(days[0]!, { weekday: "long", day: "2-digit", month: "long" });
  return `${fmt(days[0]!, { day: "2-digit", month: "short" })} – ${fmt(days[days.length - 1]!, { day: "2-digit", month: "short", year: "numeric" })}`;
}

/** Grade de horários (dia ou semana), como a agenda do FisioAI. */
function AgendaGrid({
  onSlot,
  onOpen,
  refreshKey,
}: {
  onSlot: (data: string, hora: string) => void;
  onOpen: (b: BookingRow) => void;
  refreshKey: number;
}) {
  const today = todayLocalISO();
  const [view, setView] = useState<"dia" | "semana">("semana");
  const [date, setDate] = useState(today);
  // No celular em pé a semana fica apertada: começa no dia.
  useEffect(() => {
    if (window.innerWidth < 640) setView("dia");
  }, []);
  const days = gridDays(date, view);
  const range = useQuery({
    queryKey: ["agenda-grade", days[0], days[days.length - 1], refreshKey],
    queryFn: () => listBookings({ data: { from: days[0], to: days[days.length - 1] } }),
    refetchInterval: 30_000,
  });
  const settings = useQuery({ queryKey: ["agente"], queryFn: () => getAgentSettings() });
  const schedule = settings.data?.schedule ?? DEFAULT_SCHEDULE;
  const items = range.data ?? [];
  const { startHour, endHour } = gridHourRange(days, schedule, items);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const now = localDateTimeOf(new Date().toISOString());
  const [nh, nm] = now.hora.split(":").map(Number);
  const nowTop = ((nh! - startHour) * 60 + nm!) * (HOUR_PX / 60);
  const step = view === "dia" ? 1 : 7;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto">Agenda</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              aria-label="Anterior"
              onClick={() => setDate(addDaysISO(date, -step))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDate(today)}>
              Hoje
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Próximo"
              onClick={() => setDate(addDaysISO(date, step))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex rounded-md border p-0.5">
            {(["dia", "semana"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setView(v)}
              >
                {v === "dia" ? "Dia" : "Semana"}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium capitalize text-foreground">{rangeLabel(days)}</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-amber-500/60 bg-amber-500/30" />
            Reservado pelo agente
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-primary/50 bg-primary/20" />
            Confirmado
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-slate-400/60 bg-slate-500/20" />
            Bloqueio
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          className="grid border-t"
          style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="border-b" />
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDate(d);
                setView("dia");
              }}
              className={cn(
                "border-b border-l py-1.5 text-center text-xs",
                d === today && "text-primary",
              )}
            >
              <div className="text-muted-foreground">{WEEKDAY_SHORT[weekdayOf(d)]}</div>
              <div className="text-base font-semibold">{Number(d.slice(8))}</div>
            </button>
          ))}
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          <div
            className="grid"
            style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div>
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b pr-1 pt-0.5 text-right text-[10px] text-muted-foreground"
                  style={{ height: HOUR_PX }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const wins = schedule[weekdayOf(d)] ?? [];
              const placed = placeDay(d, items, startHour, endHour);
              return (
                <div
                  key={d}
                  className={cn("relative border-l", d === today && "bg-primary/[0.03]")}
                >
                  {hours.map((h) => {
                    const open = wins.some((w) => h * 60 >= w.start && (h + 1) * 60 <= w.end);
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-label={`Marcar ${d} às ${h}:00`}
                        onClick={() => onSlot(d, `${String(h).padStart(2, "0")}:00`)}
                        className={cn(
                          "block w-full border-b hover:bg-accent/40",
                          !open && "bg-muted/60",
                        )}
                        style={{ height: HOUR_PX }}
                      />
                    );
                  })}
                  {d === today && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                      style={{ top: nowTop }}
                    />
                  )}
                  {placed.map(({ item: b, top, height, lane, lanes }) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpen(b)}
                      className={cn(
                        "absolute z-10 overflow-hidden rounded-md border px-1 py-0.5 text-left text-[11px] leading-tight hover:shadow-md",
                        bookingStyle(b),
                      )}
                      style={{
                        top: top * (HOUR_PX / 60),
                        height: Math.max(18, height * (HOUR_PX / 60) - 2),
                        left: `calc(${(lane / lanes) * 100}% + 1px)`,
                        width: `calc(${100 / lanes}% - 2px)`,
                      }}
                    >
                      <div className="font-medium">{localDateTimeOf(b.starts_at).hora}</div>
                      <div className="truncate">{bookingTitle(b)}</div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        {range.isLoading && <p className="p-3 text-xs text-muted-foreground">Carregando…</p>}
        <p className="p-3 text-xs text-muted-foreground">
          Toque num horário vazio para marcar ou bloquear. Faixas cinza estão fora do horário de
          atendimento.
        </p>
      </CardContent>
    </Card>
  );
}

function AgendaPage() {
  const list = useQuery({
    queryKey: ["agenda"],
    queryFn: () => listBookings({ data: {} }),
    refetchInterval: 30_000,
  });
  const [form, setForm] = useState({
    kind: "reserva" as "reserva" | "bloqueio",
    data: todayLocalISO(),
    hora: "09:00",
    minutes: 60,
    contactName: "",
    phone: "",
  });

  const [opened, setOpened] = useState<BookingRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setRefreshKey((k) => k + 1);
      await list.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  };

  const openedActions = (b: BookingRow) => (
    <>
      {b.status === "reservado" && (
        <Button
          size="sm"
          onClick={() =>
            act(async () => {
              await setBookingStatus({ data: { id: b.id, status: "confirmado" } });
              setOpened(null);
            })
          }
        >
          Confirmar
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!window.confirm("Cancelar e liberar este horário?")) return;
          void act(async () => {
            await setBookingStatus({ data: { id: b.id, status: "cancelado" } });
            setOpened(null);
          });
        }}
      >
        Cancelar
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <AgendaGrid
        refreshKey={refreshKey}
        onOpen={setOpened}
        onSlot={(data, hora) => {
          setOpened(null);
          setForm((f) => ({ ...f, data, hora }));
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      {opened && (
        <Card className="border-primary">
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <div className="mr-auto min-w-0">
              <div className="font-medium">
                {formatLocal(opened.starts_at)} até {localDateTimeOf(opened.ends_at).hora}{" "}
                {opened.kind === "bloqueio" ? (
                  <Badge variant="secondary">Bloqueio</Badge>
                ) : opened.status === "reservado" ? (
                  <Badge variant="destructive">Reservado pelo agente</Badge>
                ) : (
                  <Badge>Confirmado</Badge>
                )}
              </div>
              <div className="break-words text-sm text-muted-foreground">
                {[
                  opened.contact_name,
                  opened.phone ? formatWhatsApp(opened.phone) : null,
                  opened.notes,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {openedActions(opened)}
            <Button size="sm" variant="ghost" onClick={() => setOpened(null)}>
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Próximos horários</CardTitle>
          <p className="text-sm text-muted-foreground">
            Reservas feitas pelo agente aparecem como "Reservado": confirme com a pessoa e marque
            "Confirmar". Tudo que não está cancelado ocupa o horário para o agente.
          </p>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {(list.data ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhum horário marcado.</p>
          )}
          {(list.data ?? []).map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="mr-auto">
                <div className="font-medium">
                  {formatLocal(b.starts_at)}{" "}
                  {b.kind === "bloqueio" ? (
                    <Badge variant="secondary">Bloqueio</Badge>
                  ) : b.status === "reservado" ? (
                    <Badge variant="destructive">Reservado pelo agente</Badge>
                  ) : (
                    <Badge>Confirmado</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[b.contact_name, b.phone ? formatWhatsApp(b.phone) : null, b.notes]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {b.status === "reservado" && (
                <Button
                  size="sm"
                  onClick={() =>
                    act(() => setBookingStatus({ data: { id: b.id, status: "confirmado" } }))
                  }
                >
                  Confirmar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!window.confirm("Cancelar e liberar este horário?")) return;
                  void act(() => setBookingStatus({ data: { id: b.id, status: "cancelado" } }));
                }}
              >
                Cancelar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card ref={formRef} className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Marcar horário ou bloquear</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await createBooking({ data: form });
                toast.success(form.kind === "bloqueio" ? "Horário bloqueado." : "Horário marcado.");
                setForm({ ...form, contactName: "", phone: "" });
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as "reserva" | "bloqueio" })
                }
              >
                <option value="reserva">Horário de um cliente</option>
                <option value="bloqueio">Bloqueio</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                required
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora">Hora</Label>
              <Input
                id="hora"
                type="time"
                required
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duracao">Duração (minutos)</Label>
              <NumericInput
                id="duracao"
                min={15}
                max={720}
                fallback={60}
                value={form.minutes}
                onValueChange={(v) => setForm({ ...form, minutes: v })}
              />
            </div>
            {form.kind === "reserva" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tel">WhatsApp</Label>
                  <Input
                    id="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-3">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
