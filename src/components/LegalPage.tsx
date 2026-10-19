import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/site-info";

/** Moldura das páginas públicas de texto (privacidade, termos, exclusão de conta). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/icons/icon-192.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-lg bg-white"
            />
            <span className="text-lg font-semibold">{APP_NAME}</span>
          </Link>
          <Link
            to="/login"
            className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-white/90"
          >
            Entrar
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
