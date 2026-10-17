import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatWhatsApp } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  deleteConversation,
  getConversationMessages,
  listConversations,
  updateConversation,
  type ConversationRow,
} from "@/lib/agent.functions";
import { takeoverUntilText } from "@/lib/whatsapp-agent-rules";

export const Route = createFileRoute("/_app/conversas")({ component: ConversasPage });

const AUTHOR_LABEL: Record<string, string> = {
  contato: "Contato",
  agente: "Agente",
  equipe: "Equipe",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function withTeam(c: ConversationRow): string | null {
  if (c.human_takeover) return "Com a equipe";
  if (c.takeover_until && new Date(c.takeover_until).getTime() > Date.now()) {
    return `Com a equipe (${takeoverUntilText(c.takeover_until, Date.now())})`;
  }
  return null;
}

function ConversasPage() {
  const list = useQuery({
    queryKey: ["conversas"],
    queryFn: () => listConversations(),
    refetchInterval: 15_000,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.data?.find((c) => c.id === openId) ?? null;
  const msgs = useQuery({
    queryKey: ["mensagens", openId],
    queryFn: () => getConversationMessages({ data: { id: openId! } }),
    enabled: Boolean(openId),
    refetchInterval: 10_000,
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
    <div className="grid gap-4 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
      {/* No celular, a lista some quando uma conversa está aberta. */}
      <Card className={cn(open && "hidden md:block")}>
        <CardContent className="divide-y p-0">
          {(list.data ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda. Conecte o WhatsApp e ligue o agente.
            </p>
          )}
          {(list.data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(c.id)}
              className={cn(
                "block w-full px-4 py-3 text-left hover:bg-accent",
                c.id === openId && "bg-accent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {c.contact_name || formatWhatsApp(c.phone)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmt(c.last_message_at)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.attention_reason && <Badge variant="destructive">Chamou a equipe</Badge>}
                {withTeam(c) && <Badge variant="secondary">{withTeam(c)}</Badge>}
                {c.is_client && <Badge variant="outline">Cliente</Badge>}
                {c.from_ad && <Badge variant="outline">Anúncio</Badge>}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className={cn(!open && "hidden md:block")}>
        <CardContent className="space-y-4 p-4">
          {open && (
            <Button
              size="sm"
              variant="ghost"
              className="-ml-2 md:hidden"
              onClick={() => setOpenId(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Conversas
            </Button>
          )}
          {!open ? (
            <p className="text-sm text-muted-foreground">Escolha uma conversa.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto min-w-0">
                  <div className="font-medium">{open.contact_name || "Sem nome"}</div>
                  <div className="text-sm text-muted-foreground">{formatWhatsApp(open.phone)}</div>
                </div>
                {withTeam(open) ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      act(() => updateConversation({ data: { id: open.id, takeover: false } }))
                    }
                  >
                    Devolver ao agente
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      act(() => updateConversation({ data: { id: open.id, takeover: true } }))
                    }
                  >
                    Assumir conversa
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act(() =>
                      updateConversation({ data: { id: open.id, isClient: !open.is_client } }),
                    )
                  }
                >
                  {open.is_client ? "Não é cliente" : "Marcar como cliente"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!window.confirm("Apagar o histórico? O agente esquece esta conversa."))
                      return;
                    void act(async () => {
                      await deleteConversation({ data: { id: open.id } });
                      setOpenId(null);
                    });
                  }}
                >
                  Apagar
                </Button>
              </div>
              {open.attention_reason && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm">
                  O agente chamou a equipe: {open.attention_reason}
                </p>
              )}
              {open.summary && (
                <p className="rounded-md bg-muted p-3 text-sm">
                  <strong>Resumo:</strong> {open.summary}
                </p>
              )}
              <div className="max-h-[60vh] space-y-2 overflow-y-auto break-words">
                {(msgs.data ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.author === "contato" ? "bg-muted" : "ml-auto bg-primary/10",
                    )}
                  >
                    <div className="mb-1 text-xs text-muted-foreground">
                      {AUTHOR_LABEL[m.author] ?? m.author} · {fmt(m.created_at)}
                    </div>
                    {m.body}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Para responder, use o WhatsApp no celular: o agente fica em silêncio nesta conversa
                enquanto a equipe responde.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
