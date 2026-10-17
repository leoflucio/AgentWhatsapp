import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminOverview, setAccountBlocked, setAccountFree } from "@/lib/admin.functions";
import { PLANS, type PlanId } from "@/lib/billing-rules";

export const Route = createFileRoute("/_app/admin")({ component: AdminPage });

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

const KIND_LABEL = {
  isento: "Grátis",
  plano: "Plano",
  teste: "Teste grátis",
  vencido: "Sem plano",
  bloqueado: "Bloqueada",
} as const;

const WA_LABEL: Record<string, string> = {
  conectado: "Conectado",
  aguardando_qr: "Aguardando QR",
  desconectado: "Desconectado",
  sem_numero: "Sem número",
};

function AdminPage() {
  const q = useQuery({ queryKey: ["admin"], queryFn: () => adminOverview(), retry: false });
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (q.error) {
    return (
      <p className="text-sm text-muted-foreground">
        {q.error instanceof Error ? q.error.message : "Sem acesso."}
      </p>
    );
  }
  if (!q.data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const { rows, totals } = q.data;
  const f = filter.trim().toLowerCase();
  const shown = f ? rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(f)) : rows;

  const toggle = async (id: string, blocked: boolean) => {
    if (blocked && !window.confirm("Bloquear esta conta? O agente dela para de responder.")) return;
    setBusy(id);
    try {
      await setAccountBlocked({ data: { accountId: id, blocked } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  };

  const toggleFree = async (id: string, free: boolean) => {
    setBusy(id);
    try {
      await setAccountFree({ data: { accountId: id, free } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  };

  const stats = [
    { label: "Contas", value: String(totals.accounts) },
    { label: "Pagantes", value: String(totals.paying) },
    { label: "Em teste", value: String(totals.trials) },
    { label: "Receita mensal", value: brl(totals.revenue) },
    { label: "Respostas no mês", value: totals.replies.toLocaleString("pt-BR") },
    { label: "Custo de IA (estimado)", value: brl(totals.cost) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Clientes</CardTitle>
          <Input
            className="w-full sm:max-w-xs"
            placeholder="Buscar por nome ou e-mail"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </CardHeader>
        <CardContent className="divide-y p-0">
          {shown.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma conta.</p>
          )}
          {shown.map((r) => {
            const plan = r.access.plan ? PLANS[r.access.plan as PlanId] : null;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
                <div className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-48">
                  <p className="font-medium">{r.name}</p>
                  <p className="break-all text-muted-foreground">{r.email}</p>
                  <p className="text-xs text-muted-foreground">Desde {fmtDate(r.createdAt)}</p>
                </div>
                <div className="w-full sm:w-40">
                  <Badge
                    variant={
                      r.access.kind === "plano"
                        ? "default"
                        : r.access.kind === "bloqueado" || r.access.kind === "vencido"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {r.owner ? "Dono" : plan ? plan.label : KIND_LABEL[r.access.kind]}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.access.kind === "teste" && `Teste até ${fmtDate(r.access.trialEndsAt)}`}
                    {r.access.kind === "plano" &&
                      `${r.status === "past_due" ? "Atrasado" : r.status === "canceled" ? "Cancelado" : "Pago"} até ${fmtDate(r.periodEnd)}`}
                    {r.pendingPlan && ` · aguardando ${PLANS[r.pendingPlan as PlanId]?.label}`}
                  </p>
                </div>
                <div className="w-[45%] sm:w-32">
                  <p>{WA_LABEL[r.whatsapp] ?? r.whatsapp}</p>
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                </div>
                <div className="w-[45%] sm:w-32">
                  <p>
                    {r.repliesThisMonth.toLocaleString("pt-BR")}
                    {r.access.limit ? ` / ${r.access.limit.toLocaleString("pt-BR")}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Respostas no mês</p>
                </div>
                {!r.owner && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => void toggleFree(r.id, !r.free)}
                  >
                    {r.free ? "Voltar a cobrar" : "Liberar grátis"}
                  </Button>
                )}
                {!r.owner && (
                  <Button
                    size="sm"
                    variant={r.blocked ? "default" : "outline"}
                    disabled={busy === r.id}
                    onClick={() => void toggle(r.id, !r.blocked)}
                  >
                    {r.blocked ? "Desbloquear" : "Bloquear"}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
