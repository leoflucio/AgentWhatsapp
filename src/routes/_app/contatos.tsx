import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseContactsFile, toImportRows } from "@/lib/contacts-import";
import {
  deleteContact,
  importContacts,
  listContacts,
  saveContact,
  type ContactRow,
} from "@/lib/contacts.functions";
import { formatWhatsApp } from "@/lib/phone";

export const Route = createFileRoute("/_app/contatos")({ component: ContatosPage });

type Draft = { id?: string; name: string; phone: string; notes: string; isClient: boolean };
const EMPTY: Draft = { name: "", phone: "", notes: "", isClient: false };

// Seletor de contatos do navegador (Chrome no Android). Não existe no iPhone nem no computador.
type PickedContact = { name?: string[]; tel?: string[] };
type ContactsManager = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]>;
};
const contactsApi = (): ContactsManager | null =>
  typeof navigator !== "undefined" && "contacts" in navigator
    ? ((navigator as unknown as { contacts: ContactsManager }).contacts ?? null)
    : null;

function ContatosPage() {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["contatos", search],
    queryFn: () => listContacts({ data: { search } }),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const picker = contactsApi();

  const sendImport = async (rows: { name: string; phone: string }[], skipped: number) => {
    if (rows.length === 0) {
      toast.error("Nenhum telefone válido encontrado.");
      return;
    }
    setBusy(true);
    try {
      let added = 0;
      let existing = 0;
      for (let i = 0; i < rows.length; i += 2000) {
        const r = await importContacts({ data: { rows: rows.slice(i, i + 2000) } });
        added += r.added;
        existing += r.existing;
      }
      toast.success(
        `${added} contato(s) novo(s)` +
          (existing ? `, ${existing} já estavam na lista` : "") +
          (skipped ? `, ${skipped} número(s) inválido(s) ignorado(s)` : "") +
          ".",
      );
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const { rows, skipped } = parseContactsFile(text);
    await sendImport(rows, skipped);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickFromPhone = async () => {
    if (!picker) return;
    try {
      const picked = await picker.select(["name", "tel"], { multiple: true });
      const { rows, skipped } = toImportRows(
        picked.map((p) => ({ name: p.name?.[0] ?? "", phones: p.tel ?? [] })),
      );
      await sendImport(rows, skipped);
    } catch {
      // A pessoa fechou o seletor.
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await saveContact({ data: draft });
      setDraft(null);
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: ContactRow) => {
    if (!window.confirm(`Apagar ${c.name || formatWhatsApp(c.phone)} da lista?`)) return;
    try {
      await deleteContact({ data: { id: c.id } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível apagar.");
    }
  };

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar da agenda do celular</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            O agente usa esta lista para saber quem está falando: chama pelo nome e lê as suas
            observações. Pode importar de novo quando quiser; quem já está na lista não é duplicado
            nem alterado.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              Importar arquivo (.vcf ou .csv)
            </Button>
            {picker && (
              <Button variant="outline" disabled={busy} onClick={() => void pickFromPhone()}>
                Escolher do celular
              </Button>
            )}
          </div>
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">Como exportar os contatos</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>Android:</b> app Contatos › menu › Gerenciar contatos › Exportar (ou Importar e
                exportar) › salve o arquivo .vcf e escolha ele aqui.
              </li>
              <li>
                <b>iPhone:</b> no computador, entre em icloud.com/contacts, selecione todos (Ctrl+A)
                › engrenagem › Exportar vCard.
              </li>
              <li>
                <b>Google Contatos:</b> contacts.google.com › Exportar › Google CSV ou vCard.
              </li>
              <li>
                <b>Planilha:</b> CSV com as colunas Nome e Telefone (ou Celular).
              </li>
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Contatos ({total.toLocaleString("pt-BR")})</CardTitle>
          <div className="flex w-full gap-2 sm:w-auto">
            <Input
              className="min-w-0 sm:w-64"
              placeholder="Buscar por nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>
              Novo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          {draft && (
            <div className="space-y-3 border-b p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Nome</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Telefone (com DDD)</Label>
                  <Input
                    inputMode="tel"
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Observações para o agente</Label>
                <Textarea
                  rows={3}
                  placeholder="Ex.: prefere horário de manhã; filho da Dona Maria."
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.isClient}
                  onCheckedChange={(v) => setDraft({ ...draft, isClient: v })}
                />
                <span>Já é cliente</span>
              </div>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void save()}>
                  Salvar
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          <div className="divide-y">
            {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
            {!q.isLoading && rows.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum contato.</p>
            )}
            {rows.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                <div className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-48">
                  <p className="font-medium">
                    {c.name || "Sem nome"}{" "}
                    {c.is_client && <Badge variant="secondary">Cliente</Badge>}
                  </p>
                  <p className="text-muted-foreground">{formatWhatsApp(c.phone)}</p>
                  {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: c.id,
                      name: c.name,
                      phone: c.phone,
                      notes: c.notes ?? "",
                      isClient: c.is_client,
                    })
                  }
                >
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(c)}>
                  Apagar
                </Button>
              </div>
            ))}
            {total > rows.length && (
              <p className="p-4 text-xs text-muted-foreground">
                Mostrando {rows.length} de {total.toLocaleString("pt-BR")}. Use a busca para achar
                os outros.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
