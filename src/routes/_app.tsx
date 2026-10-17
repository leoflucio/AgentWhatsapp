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
  { to: "/conversas", label: "Conversas", short: "Conversas", icon: MessagesSquare },
  { to: "/agenda", label: "Agenda", short: "Agenda", icon: CalendarDays },
  { to: "/contatos", label: "Contatos", short: "Contatos", icon: Users },
  { to: "/agente", label: "Agente", short: "Agente", icon: Bot },
  { to: "/conexao", label: "WhatsApp", short: "WhatsApp", icon: QrCode },
  { to: "/planos", label: "Planos", short: "Planos", icon: CreditCard },
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
  const links = billing.data?.isAdmin
    ? [...NAV, { to: "/admin", label: "Painel do dono", short: "Painel", icon: Shield } as const]
    : NAV;
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2">
          <span className="mr-3 truncate font-semibold">Secretária Digital 24h</span>
          {/* No computador e no tablet deitado, menu em cima. */}
          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {links.map(({ to, label, icon: Icon }) => (
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
          </nav>
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
      <main className="mx-auto max-w-5xl px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:pb-6">
        <Outlet />
      </main>
      {/* No celular e no tablet em pé, menu fixo embaixo (cabe sem virar a tela). */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-3xl">
          {links.map(({ to, short, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
              activeProps={{ className: cn("font-medium text-primary") }}
            >
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center">{short}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
