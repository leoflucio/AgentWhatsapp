import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelPlan, checkoutPlan, getBilling } from "@/lib/billing.functions";
import { PLAN_IDS, PLANS, TRIAL_DAYS, type PlanId } from "@/lib/billing-rules";
import { useStoreApp } from "@/lib/store-app";

export const Route = createFileRoute("/_app/planos")({ component: PlanosPage });

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PlanosPage() {
  const q = useQuery({ queryKey: ["planos"], queryFn: () => getBilling() });
  const [busy, setBusy] = useState<PlanId | "cancel" | null>(null);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const storeApp = useStoreApp();
  const b = q.data;
  if (!b) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const subscribe = async (plan: PlanId) => {
    setBusy(plan);
    // Abre a aba antes da chamada: o navegador bloqueia janelas abertas depois de um await.
    const tab = window.open("", "_blank");
    try {
      const r = await checkoutPlan({ data: { plan, name, cpfCnpj: doc } });
      if (r.invoiceUrl) {
        if (tab) tab.location.href = r.invoiceUrl;
        else window.location.href = r.invoiceUrl;
        toast.success("Fatura aberta. O plano começa assim que o pagamento for confirmado.");
      } else {
        tab?.close();
        toast.success(`Troca agendada para ${fmtDate(r.effectiveDate ?? null)}.`);
      }
      await q.refetch();
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : "Não foi possível assinar.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancelar a renovação? O agente funciona até o fim do período pago.")) {
      return;
    }
    setBusy("cancel");
    try {
      const r = await cancelPlan();
      toast.success(
        r.periodEnd ? `Cancelado. O agente funciona até ${fmtDate(r.periodEnd)}.` : "Cancelado.",
      );
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
    } finally {
      setBusy(null);
    }
  };

  const situation = (() => {
    switch (b.kind) {
      case "isento":
        return "Conta liberada: sem limite e sem cobrança.";
      case "bloqueado":
        return "Sua conta está bloqueada. Fale com o suporte.";
      case "teste":
        return `Teste grátis de ${TRIAL_DAYS} dias até ${fmtDate(b.trialEndsAt)}.`;
      case "vencido":
        return "O teste grátis acabou. Escolha um plano para o agente voltar a responder.";
      case "plano":
        return b.status === "canceled"
          ? `Plano ${PLANS[b.plan!].label} cancelado, funciona até ${fmtDate(b.periodEnd)}.`
          : b.status === "past_due"
            ? `Plano ${PLANS[b.plan!].label} com pagamento atrasado. Pague a fatura para não parar.`
            : `Plano ${PLANS[b.plan!].label}, renova em ${fmtDate(b.periodEnd)}.`;
    }
  })();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sua assinatura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{situation}</p>
          {b.limit !== null && b.limit > 0 && (
            <p className="text-muted-foreground">
              Respostas do agente neste mês: {b.used.toLocaleString("pt-BR")} de{" "}
              {b.limit.toLocaleString("pt-BR")}.
            </p>
          )}
          {b.pendingPlan && !storeApp && (
            <p>
              Aguardando o pagamento do plano {PLANS[b.pendingPlan as PlanId]?.label}.{" "}
              {b.pendingInvoiceUrl && (
                <a
                  className="underline"
                  href={b.pendingInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir fatura
                </a>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {b.kind !== "isento" && storeApp && (
        <p className="text-sm text-muted-foreground">
          Para assinar ou trocar de plano, entre em secretariadigital24h.com.br pelo navegador.
        </p>
      )}

      {b.kind !== "isento" && !storeApp && (
        <>
          {!b.billingAvailable ? (
            <p className="text-sm text-muted-foreground">
              A cobrança ainda não foi configurada neste servidor (ASAAS_API_KEY).
            </p>
          ) : (
            !b.hasCustomer &&
            !b.hasProfileDoc && (
              <Card>
                <CardHeader>
                  <CardTitle>Dados para a cobrança</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="nome">Nome ou razão social</Label>
                    <Input id="nome" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="doc">CPF ou CNPJ</Label>
                    <Input
                      id="doc"
                      inputMode="numeric"
                      value={doc}
                      onChange={(e) => setDoc(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_IDS.map((id) => {
              const p = PLANS[id];
              const current = b.kind === "plano" && b.plan === id && b.status !== "canceled";
              return (
                <Card key={id} className={current ? "border-primary" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {p.label}
                      {current && <Badge>Seu plano</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-2xl font-semibold">
                      {brl(p.price)}
                      <span className="text-sm font-normal text-muted-foreground"> /mês</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Até {p.replies.toLocaleString("pt-BR")} respostas do agente por mês.
                    </p>
                    <Button
                      className="w-full"
                      disabled={current || busy !== null || !b.billingAvailable}
                      onClick={() => void subscribe(id)}
                    >
                      {busy === id ? "Abrindo…" : current ? "Plano atual" : "Assinar"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {b.kind === "plano" && b.status !== "canceled" && (
            <Button variant="outline" disabled={busy !== null} onClick={() => void cancel()}>
              Cancelar renovação
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Pagamento por Pix, boleto ou cartão. O plano começa quando o pagamento é confirmado.
            Para subir de plano, a cobrança é feita na hora; para descer, a troca vale no fim do
            período já pago.
          </p>
        </>
      )}
    </div>
  );
}
