import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { demoChat } from "@/lib/demo-chat.functions";
import {
  DEMO_AGENT_NAME,
  DEMO_BUSINESS_NAME,
  DEMO_GREETING,
  DEMO_MAX_CHARS,
  DEMO_SUGGESTIONS,
  type DemoMessage,
} from "@/lib/demo-chat-rules";

const REASONS: Record<"fim" | "limite" | "indisponivel", string> = {
  fim: "A demonstração chegou ao fim. Para ver no seu WhatsApp, crie sua conta e teste grátis.",
  limite: "Muitas mensagens em pouco tempo. Espere alguns minutos e tente de novo.",
  indisponivel: "A secretária não conseguiu responder agora. Tente de novo em instantes.",
};

/** Conversa de demonstração com a secretária de um salão fictício, direto na página. */
export function DemoChat() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, notice]);

  async function send(raw: string) {
    const content = raw.trim().slice(0, DEMO_MAX_CHARS);
    if (!content || busy || ended) return;
    const next: DemoMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setText("");
    setNotice(null);
    setBusy(true);
    try {
      const r = await demoChat({ data: { messages: next } });
      if (r.ok) {
        setMessages([...next, { role: "assistant", content: r.reply }]);
      } else {
        setNotice(REASONS[r.reason]);
        if (r.reason === "fim") setEnded(true);
      }
    } catch {
      setNotice(REASONS.indisponivel);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] bg-[#14181c] p-2.5 shadow-2xl shadow-black/30">
      <div className="flex h-[520px] flex-col overflow-hidden rounded-[1.6rem] bg-[#efeae2]">
        <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/20 font-semibold">
            {DEMO_AGENT_NAME[0]}
          </span>
          <div className="min-w-0 text-left">
            <p className="truncate font-semibold leading-tight">{DEMO_BUSINESS_NAME}</p>
            <p className="text-xs text-primary-foreground/80">
              {busy ? "digitando..." : "secretária virtual · demonstração"}
            </p>
          </div>
        </div>

        <div
          ref={list}
          className="flex-1 space-y-2 overflow-y-auto px-3 py-4 text-left text-[15px]"
          aria-live="polite"
        >
          <Bubble role="assistant" content={DEMO_GREETING} />
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} content={m.content} />
          ))}
          {busy && (
            <div className="w-16 rounded-lg rounded-tl-none bg-white px-3 py-2 text-[#14181c]/60 shadow-sm">
              ...
            </div>
          )}
          {notice && (
            <p className="mx-auto max-w-[90%] rounded-md bg-[#fff3c4] px-3 py-2 text-center text-xs text-[#14181c]">
              {notice}
            </p>
          )}
          {messages.length === 0 && !busy && (
            <div className="flex flex-wrap gap-2 pt-2">
              {DEMO_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-primary/30 bg-white px-3 py-1.5 text-sm text-primary hover:bg-primary/5"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-2 bg-[#f0f0f0] p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={DEMO_MAX_CHARS}
            disabled={ended}
            placeholder={ended ? "Demonstração encerrada" : "Escreva uma mensagem"}
            aria-label="Mensagem para a secretária"
            className="h-11 min-w-0 flex-1 rounded-full bg-white px-4 text-base text-[#14181c] outline-none placeholder:text-[#14181c]/45 focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={busy || ended || !text.trim()}
            aria-label="Enviar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            <SendHorizontal className="size-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ role, content }: DemoMessage) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[#14181c] shadow-sm ${
          mine ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
        }`}
      >
        {content}
      </p>
    </div>
  );
}
