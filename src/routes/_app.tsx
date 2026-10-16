import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { Bot, CalendarDays, LogOut, MessagesSquare, QrCode } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({ component: AppLayout });

const NAV = [
  { to: "/conversas", label: "Conversas", icon: MessagesSquare },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/agente", label: "Agente", icon: Bot },
  { to: "/conexao", label: "WhatsApp", icon: QrCode },
] as const;

function AppLayout() {
  const { loading, session, signOut } = useAuth();
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
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
