import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DOC_USE_IDEAS, MAX_DOC_INSTRUCTIONS } from "@/lib/document-rules";
import { deleteDocAnalysis, getDocuments, saveDocuments } from "@/lib/document.functions";
import { formatWhatsApp } from "@/lib/phone";
import { countBlanks } from "@/lib/prompt-templates";

export const Route = createFileRoute("/_app/documentos")({ component: DocumentosPage });

type Draft = { enabled: boolean; instructions: string; numbers: string };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DocumentosPage() {
  const q = useQuery({ queryKey: ["documentos"], queryFn: () => getDocuments() });
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && d === null) {
      setD({
        enabled: q.data.enabled,
        instructions: q.data.instructions,
        numbers: q.data.numbers,
      });
    }
  }, [q.data, d]);

  if (q.isLoading || !d) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (q.data && !q.data.ready) {
    return (
      <p className="text-sm text-muted-foreground">
        Falta rodar a migration de documentos no Supabase (20261114120000_documentos.sql).
      </p>
    );
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const blanks = countBlanks(d.instructions);

  const save = async () => {
    setBusy(true);
    try {
      const r = await saveDocuments({ data: d });
      toast.success(
        r.numbers
          ? `Salvo. ${r.numbers} número(s) podem pedir análise.`
          : "Salvo. Qualquer contato que o agente atende pode mandar PDF.",
      );
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Apagar esta análise?")) return;
    try {
      await deleteDocAnalysis({ data: { id } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível apagar.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Leitura de documentos (PDF)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Quando alguém manda um PDF no WhatsApp, o agente lê o arquivo, analisa com os critérios
            que você escrever abaixo e responde com o resultado. O PDF não fica guardado; só a
            análise, aqui embaixo.
          </p>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">Ler PDFs recebidos</span>
              <span className="block text-sm text-muted-foreground">
                {q.data?.agentEnabled
                  ? "Desligado, o agente só avisa que recebeu o arquivo."
                  : "O agente está desligado (tela Agente): ligue-o para os PDFs serem lidos."}
              </span>
            </span>
            <Switch checked={d.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </label>

          <div className="space-y-2">
            <Label htmlFor="criterios">Como analisar (critérios)</Label>
            <Textarea
              id="criterios"
              rows={14}
              maxLength={MAX_DOC_INSTRUCTIONS}
              placeholder="Escreva o que conferir e como responder para cada tipo de documento."
              value={d.instructions}
              onChange={(e) => set("instructions", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Vazio, o agente só resume o documento.
              {blanks > 0 && ` Linhas com [PREENCHA: ...] não valem (${blanks}).`}
            </p>
            <div className="text-xs text-muted-foreground">
              <p>Ideias de uso:</p>
              <ul className="list-disc pl-5">
                {DOC_USE_IDEAS.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="numeros">
              Quem pode mandar PDF para análise (um por linha, com DDD)
            </Label>
            <Textarea
              id="numeros"
              rows={3}
              placeholder="Vazio = qualquer contato que o agente atende. Ex.: o celular dos gerentes."
              value={d.numbers}
              onChange={(e) => set("numbers", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              No modo teste, só os números de teste da tela Agente.
            </p>
          </div>

          <Button onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimas análises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(q.data?.analyses ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum PDF analisado ainda.</p>
          )}
          {(q.data?.analyses ?? []).map((a) => (
            <div key={a.id} className="rounded-md border p-3">
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 text-left"
                onClick={() => setOpen(open === a.id ? null : a.id)}
              >
                <span className="font-medium">{a.file_name || "documento.pdf"}</span>
                <span className="text-xs text-muted-foreground">
                  {a.contact_name ? `${a.contact_name} · ` : ""}
                  {formatWhatsApp(a.phone)} · {fmtDate(a.created_at)}
                </span>
              </button>
              {open === a.id && (
                <div className="mt-2 space-y-2">
                  <p className="whitespace-pre-wrap text-sm">{a.result}</p>
                  <Button variant="outline" size="sm" onClick={() => remove(a.id)}>
                    Apagar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
