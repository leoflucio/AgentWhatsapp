import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { formatLocal, todayLocalISO } from "@/lib/agenda-time";
import { formatWhatsApp } from "@/lib/phone";
import { createBooking, listBookings, setBookingStatus } from "@/lib/agent.functions";

export const Route = createFileRoute("/_app/agenda")({ component: AgendaPage });

function AgendaPage() {
  const list = useQuery({
    queryKey: ["agenda"],
    queryFn: () => listBookings(),
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

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await list.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  };

  return (
    <div className="space-y-4">
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

      <Card>
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
