import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CalendarDays,
  CreditCard,
  LogOut,
  MessagesSquare,
  QrCode,
  Shield,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getBilling } from "@/lib/billing.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({ component: AppLayout });

const NAV = [
  { to: "/conversas", label: "Conversas", icon: MessagesSquare },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/agente", label: "Agente", icon: Bot },
  { to: "/conexao", label: "WhatsApp", icon: QrCode },
  { to: "/planos", label: "Planos", icon: CreditCard },
] as const;

const DAY = 86_400_000;

/** Aviso no topo: teste acabando, teste acabado, atraso, limite perto do fim ou bloqueio. */
function BillingBanner({ b }: { b: Awaited<ReturnType<typeof getBilling>> }) {
  let text: string | null = null;
  if (b.kind === "bloqueado") text = "Sua conta está bloqueada e o agente não responde.";
  else if (b.kind === "vencido")
    text = "O teste grátis acabou. Escolha um plano para o agente voltar a responder.";
  else if (b.kind === "plano" && b.status === "past_due")
    text = "Pagamento atrasado. Pague a fatura para o agente não parar.";
  else if (b.limit && b.used >= b.limit)
    text = "O limite de respostas do mês acabou. Suba de plano para o agente voltar.";
  else if (b.limit && b.used >= b.limit * 0.8)
    text = `O agente já usou ${b.used} de ${b.limit} respostas deste mês.`;
  else if (b.kind === "teste") {
    const days = Math.max(0, Math.ceil((new Date(b.trialEndsAt).getTime() - Date.now()) / DAY));
    text = `Teste grátis: ${days === 1 ? "falta 1 dia" : `faltam ${days} dias`}.`;
  }
  if (!text) return null;
  return (
    <div className="border-b bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <span>{text}</span>
        {b.kind !== "bloqueado" && (
          <Link to="/planos" className="font-medium underline">
            Ver planos
          </Link>
        )}
      </div>
    </div>
  );
}

function AppLayout() {
  const { loading, session, signOut } = useAuth();
  const billing = useQuery({
    queryKey: ["planos"],
    queryFn: () => getBilling(),
    enabled: Boolean(session),
  });
  if (loading) return null;
  if (!session) return <Navigate to="/login" />;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2">
          <span className="mr-3 shrink-0 font-semibold">Agente de WhatsApp</span>
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              activeProps={{ className: cn("bg-accent font-medium text-foreground") }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          {billing.data?.isAdmin && (
            <Link
              to="/admin"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              activeProps={{ className: cn("bg-accent font-medium text-foreground") }}
            >
              <Shield className="h-4 w-4" />
              Painel do dono
            </Link>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>
      {billing.data && <BillingBanner b={billing.data} />}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
