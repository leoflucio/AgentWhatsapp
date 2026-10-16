import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMinutes, type DayWindow } from "@/lib/agenda-hours";
import { getAgentSettings, saveAgentSettings } from "@/lib/agent.functions";
import { TAKEOVER_OPTIONS, takeoverLabel } from "@/lib/whatsapp-agent-rules";

export const Route = createFileRoute("/_app/agente")({ component: AgentePage });

type Settings = Awaited<ReturnType<typeof getAgentSettings>>;

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function AgentePage() {
  const q = useQuery({ queryKey: ["agente"], queryFn: () => getAgentSettings() });
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  if (!s) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const setDay = (day: number, wins: DayWindow[]) =>
    set("schedule", { ...s.schedule, [day]: wins });

  const save = async () => {
    setBusy(true);
    try {
      const r = await saveAgentSettings({ data: s });
      toast.success(
        s.testMode
          ? `Salvo. Em modo teste, o agente responde só ${r.testNumbers} número(s) de teste.`
          : "Salvo.",
      );
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Agente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">Agente ligado</span>
              <span className="block text-sm text-muted-foreground">
                Responde as mensagens que chegam no WhatsApp conectado.
              </span>
            </span>
            <Switch checked={s.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">Modo teste</span>
              <span className="block text-sm text-muted-foreground">
                Responde só os números de teste abaixo. Desligue para atender todo mundo.
              </span>
            </span>
            <Switch checked={s.testMode} onCheckedChange={(v) => set("testMode", v)} />
          </label>
          {s.testMode && (
            <div className="space-y-2">
              <Label htmlFor="testes">Números de teste (um por linha, com DDD)</Label>
              <Textarea
                id="testes"
                rows={3}
                value={s.testNumbers}
                onChange={(e) => set("testNumbers", e.target.value)}
              />
            </div>
          )}
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">Responder também clientes</span>
              <span className="block text-sm text-muted-foreground">
                Desligado, quem está marcado como cliente nas conversas fica com a equipe.
              </span>
            </span>
            <Switch checked={s.replyClients} onCheckedChange={(v) => set("replyClients", v)} />
          </label>
          <div className="space-y-2">
            <Label htmlFor="takeover">Quando a equipe responde pelo celular, o agente espera</Label>
            <select
              id="takeover"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={s.takeoverMinutes}
              onChange={(e) => set("takeoverMinutes", Number(e.target.value))}
            >
              {TAKEOVER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {takeoverLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Negócio e instruções</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do negócio</Label>
              <Input
                id="nome"
                value={s.businessName}
                onChange={(e) => set("businessName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agente">Nome do agente (opcional)</Label>
              <Input
                id="agente"
                placeholder="Ex.: Ana"
                value={s.agentName}
                onChange={(e) => set("agentName", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ramo">Ramo do negócio</Label>
            <Input
              id="ramo"
              placeholder="Ex.: salão de beleza, loja de roupas, escritório de contabilidade, clínica"
              value={s.segment}
              onChange={(e) => set("segment", e.target.value)}
            />
          </div>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">Área da saúde</span>
              <span className="block text-sm text-muted-foreground">
                O agente nunca dá diagnóstico e orienta procurar o pronto-socorro em urgências.
              </span>
            </span>
            <Switch checked={s.healthRules} onCheckedChange={(v) => set("healthRules", v)} />
          </label>
          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço (enviado depois de cada reserva)</Label>
            <Input
              id="endereco"
              value={s.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instrucoes">Instruções para o agente</Label>
            <Textarea
              id="instrucoes"
              rows={10}
              placeholder="O que você vende ou faz, valores, formas de pagamento, entrega, perguntas frequentes, o que o agente nunca deve dizer…"
              value={s.instructions}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horário de atendimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">Agente reserva horários</span>
              <span className="block text-sm text-muted-foreground">
                Desligado, ele só informa o horário de funcionamento e passa para a equipe quem
                quiser marcar ou comprar.
              </span>
            </span>
            <Switch checked={s.bookingEnabled} onCheckedChange={(v) => set("bookingEnabled", v)} />
          </label>
          {DAYS.map((name, day) => {
            const [win, ...rest] = s.schedule[day] ?? [];
            return (
              <div key={day} className="flex flex-wrap items-center gap-2">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(win)}
                    onChange={(e) =>
                      setDay(day, e.target.checked ? [{ start: 8 * 60, end: 18 * 60 }] : [])
                    }
                  />
                  {name}
                </label>
                {win && (
                  <>
                    <Input
                      type="time"
                      className="w-28"
                      value={formatMinutes(win.start)}
                      onChange={(e) => {
                        const v = toMinutes(e.target.value);
                        if (v !== null) setDay(day, [{ ...win, start: v }, ...rest]);
                      }}
                    />
                    <span className="text-sm">às</span>
                    <Input
                      type="time"
                      className="w-28"
                      value={formatMinutes(win.end)}
                      onChange={(e) => {
                        const v = toMinutes(e.target.value);
                        if (v !== null) setDay(day, [{ ...win, end: v }, ...rest]);
                      }}
                    />
                    {rest.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        + {rest.length} outro(s) período(s)
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="duracao">Duração de cada horário (minutos)</Label>
              <NumericInput
                id="duracao"
                min={15}
                max={180}
                fallback={60}
                value={s.slotMinutes}
                onValueChange={(v) => set("slotMinutes", v)}
              />
            </div>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm">
                Preencher a agenda em sequência (oferecer primeiro os horários mais cedo)
              </span>
              <Switch
                checked={s.sequentialFill}
                onCheckedChange={(v) => set("sequentialFill", v)}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={busy}>
        Salvar
      </Button>
    </div>
  );
}
