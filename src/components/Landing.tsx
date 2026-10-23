import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CalendarCheck,
  Check,
  Clock,
  FileSpreadsheet,
  MessageCircle,
  Mic,
  QrCode,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { getDemoLink } from "@/lib/demo.functions";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/site-info";
import { PLANS, PLAN_IDS, TRIAL_DAYS, TRIAL_REPLIES } from "@/lib/billing-rules";
import { PROMPT_TEMPLATES } from "@/lib/prompt-templates";

const brl = (n: number) => n.toLocaleString("pt-BR");

const FEATURES = [
  {
    icon: Clock,
    title: "Atende 24 horas",
    text: "Responde na hora, de madrugada, no fim de semana e no feriado. Nenhum cliente fica esperando.",
  },
  {
    icon: Mic,
    title: "Entende áudio",
    text: "O cliente mandou áudio? A secretária ouve, entende e responde por escrito.",
  },
  {
    icon: CalendarCheck,
    title: "Reserva horários",
    text: "Mostra os horários livres e reserva na sua agenda. Você só confirma.",
  },
  {
    icon: FileSpreadsheet,
    title: "Anota os dados",
    text: "Nome, CPF, pedido, endereço: o que você pedir fica salvo em planilhas para baixar.",
  },
  {
    icon: UserRound,
    title: "Chama a equipe",
    text: "Quando o assunto pede uma pessoa, ela avisa e para de responder até você assumir.",
  },
  {
    icon: RotateCcw,
    title: "Retoma conversas",
    text: "Quem parou de responder recebe uma mensagem de retomada, uma vez, no horário certo.",
  },
];

const STEPS = [
  {
    icon: QrCode,
    title: "Conecte seu número",
    text: "Leia o QR Code com o celular, igual ao WhatsApp Web.",
  },
  {
    icon: Bot,
    title: "Escolha um modelo",
    text: "Tem modelo pronto para o seu ramo. É só completar com os seus dados.",
  },
  {
    icon: Check,
    title: "Pronto",
    text: "A secretária começa a atender. Teste antes com o seu próprio número.",
  },
];

const SHOTS = [
  { src: "/landing/agenda.webp", title: "Reservas direto na sua agenda" },
  { src: "/landing/dados.webp", title: "Dados dos clientes em planilhas" },
  { src: "/landing/conexao.webp", title: "Conecte pelo QR Code" },
];

const FAQ = [
  {
    q: "Preciso trocar de número?",
    a: "Não. Você conecta o número que já usa, pelo QR Code. Dá para continuar respondendo pelo celular normalmente.",
  },
  {
    q: "E se eu quiser responder eu mesmo?",
    a: "É só responder pelo celular. A secretária percebe e fica em silêncio naquela conversa pelo tempo que você escolher.",
  },
  {
    q: "Ela inventa preço ou informação?",
    a: "Ela responde com o que você escreveu nas instruções. O que não sabe, ela diz que vai verificar e chama a equipe.",
  },
  {
    q: "Preciso de cartão para testar?",
    a: `Não. Você cria a conta e usa ${TRIAL_DAYS} dias grátis. Só paga se quiser continuar.`,
  },
  {
    q: "Posso cancelar?",
    a: "Pode, a qualquer momento, na tela Planos. A secretária funciona até o fim do período pago.",
  },
];

function Phone({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-[2.2rem] bg-[#14181c] p-2.5 shadow-2xl shadow-black/30 ${className}`}>
      <img
        src={src}
        alt={alt}
        width={540}
        height={1100}
        loading="lazy"
        className="h-auto w-full rounded-[1.7rem] bg-white"
      />
    </div>
  );
}

function Cta({ light = false }: { light?: boolean }) {
  return (
    <Link
      to="/login"
      search={{ criar: true }}
      className={`inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-semibold shadow-sm transition-colors ${
        light
          ? "bg-white text-primary hover:bg-white/90"
          : "bg-primary text-primary-foreground hover:bg-primary/90"
      }`}
    >
      Testar {TRIAL_DAYS} dias grátis
    </Link>
  );
}

/** Abre a conversa com o número de demonstração (DEMO_WHATSAPP). Sem número, não aparece. */
function DemoButton({ link }: { link: string | null }) {
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/40 px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-white/10"
    >
      <MessageCircle className="size-5" />
      Ver ela atendendo agora
    </a>
  );
}

export function Landing() {
  const segments = PROMPT_TEMPLATES.filter((t) => t.id !== "outro");
  const demo = useQuery({
    queryKey: ["demo-link"],
    queryFn: () => getDemoLink(),
    staleTime: Infinity,
  });
  const demoLink = demo.data?.link ?? null;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img
              src="/icons/icon-192.png"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-lg"
            />
            <span className="truncate font-semibold">{APP_NAME}</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2">
            <a href="#planos" className="hidden px-3 py-2 text-sm font-medium sm:inline">
              Planos
            </a>
            <Link
              to="/login"
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/15 px-3 py-1 text-sm">
              Atendente virtual com inteligência artificial
            </p>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Sua secretária no WhatsApp, atendendo 24 horas por dia
            </h1>
            <p className="mt-4 max-w-xl text-lg text-primary-foreground/85">
              Ela responde dúvidas, explica preços, reserva horários na agenda e anota os dados dos
              clientes. Você só entra quando precisa.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Cta light />
              <DemoButton link={demoLink} />
            </div>
            <p className="mt-3 text-sm text-primary-foreground/80">
              {demoLink
                ? "Mande um oi e veja a secretária respondendo no seu WhatsApp. Sem cartão para testar."
                : "Sem cartão. Pronto em poucos minutos."}
            </p>
          </div>
          <Phone
            src="/landing/agente.webp"
            alt="Tela de configuração da secretária"
            className="mx-auto w-full max-w-[280px]"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Como funciona</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <s.icon className="size-5" />
                </span>
                <span className="text-sm font-medium text-muted-foreground">Passo {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">O que ela faz por você</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6">
                <f.icon className="size-7 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Tudo num lugar só</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Funciona no computador e no celular, direto no navegador.
        </p>
        <div className="mt-10 grid gap-10 sm:grid-cols-3">
          {SHOTS.map((s) => (
            <figure key={s.src} className="text-center">
              <Phone src={s.src} alt={s.title} className="mx-auto w-full max-w-[240px]" />
              <figcaption className="mt-4 font-medium">{s.title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="bg-muted/50 py-16">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-3xl font-bold">Para qualquer negócio</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Comece por um modelo pronto do seu ramo e ajuste do seu jeito.
          </p>
          <ul className="mt-8 flex flex-wrap justify-center gap-3">
            {segments.map((t) => (
              <li key={t.id} className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Planos</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Comece com {TRIAL_DAYS} dias grátis (até {TRIAL_REPLIES} respostas). Depois, escolha o
          plano pelo tamanho do seu atendimento.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLAN_IDS.map((id, i) => {
            const p = PLANS[id];
            const featured = i === 1;
            return (
              <div
                key={id}
                className={`flex flex-col rounded-xl border bg-card p-6 ${
                  featured ? "border-primary ring-2 ring-primary" : ""
                }`}
              >
                {featured && (
                  <span className="mb-2 self-start rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Mais escolhido
                  </span>
                )}
                <h3 className="text-xl font-semibold">{p.label}</h3>
                <p className="mt-3">
                  <span className="text-4xl font-bold">R$ {brl(p.price)}</span>
                  <span className="text-muted-foreground">/mês</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  <li className="flex gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    Até {brl(p.replies)} respostas por mês
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    Agenda, planilhas e contatos
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    Entende áudio
                  </li>
                </ul>
                <div className="mt-6">
                  <Link
                    to="/login"
                    search={{ criar: true }}
                    className={`inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold ${
                      featured
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border hover:bg-muted"
                    }`}
                  >
                    Começar grátis
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-muted/50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold">Perguntas frequentes</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border bg-card p-5">
                <summary className="cursor-pointer list-none font-semibold">
                  {f.q}
                  <span className="float-right text-muted-foreground group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h2 className="text-3xl font-bold">Pare de perder cliente por demora</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
            Crie sua conta agora e veja a secretária atendendo ainda hoje.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Cta light />
            <DemoButton link={demoLink} />
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {APP_NAME} ·{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </span>
          <nav className="flex flex-wrap gap-4">
            <Link to="/termos" className="hover:underline">
              Termos de uso
            </Link>
            <Link to="/privacidade" className="hover:underline">
              Privacidade
            </Link>
            <Link to="/excluir-conta" className="hover:underline">
              Excluir conta
            </Link>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground">
          WhatsApp é marca registrada da Meta. {APP_NAME} não é afiliada à Meta.
        </p>
      </footer>
    </div>
  );
}
