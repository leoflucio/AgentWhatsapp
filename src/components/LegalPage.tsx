import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/site-info";

/** Moldura simples das páginas públicas de texto (privacidade, exclusão de conta). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <Link to="/" className="text-xs text-muted-foreground underline">
          {APP_NAME}
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
