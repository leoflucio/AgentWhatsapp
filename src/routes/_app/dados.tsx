import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MAX_FIELDS,
  MAX_SHEETS,
  valuesCsv,
  type DataField,
  type DataSheet,
} from "@/lib/collected-data-rules";
import {
  deleteDataRow,
  getDataSheet,
  saveDataRow,
  saveDataSheets,
  suggestDataSheets,
  type DataRow,
} from "@/lib/collected-data.functions";
import { formatWhatsApp } from "@/lib/phone";
import { todayLocalISO } from "@/lib/agenda-time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dados")({ component: DadosPage });

type FieldDraft = { key?: string; label: string; ask: boolean };
type SheetDraft = { key?: string; name: string; fields: FieldDraft[] };
type RowDraft = {
  id?: string;
  sheetKey: string;
  contactName: string;
  phone: string;
  data: Record<string, string>;
};

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

/** Aba das linhas cuja planilha foi tirada ou nunca foi salva (para nada sumir da tela). */
const ORPHAN_KEY = "__sem_planilha";

const toDraft = (sheets: DataSheet[]): SheetDraft[] =>
  sheets.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f })) }));

function DadosPage() {
  const q = useQuery({ queryKey: ["dados"], queryFn: () => getDataSheet() });
  const sheets = useMemo(() => q.data?.sheets ?? [], [q.data]);
  const [draft, setDraft] = useState<SheetDraft[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [row, setRow] = useState<RowDraft | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Sem planilhas ainda: já abre o editor com uma em branco.
  useEffect(() => {
    if (q.data?.ready && q.data.sheets.length === 0 && draft === null) {
      setDraft([{ name: "Planilha", fields: [{ label: "", ask: false }] }]);
    }
  }, [q.data, draft]);

  // Linhas anotadas numa planilha que não existe mais aparecem numa aba à parte.
  const viewSheets = useMemo(() => {
    const known = new Set(sheets.map((s) => s.key));
    const orphans = (q.data?.rows ?? []).filter((r) => !known.has(r.sheetKey));
    if (orphans.length === 0) return sheets;
    const keys = [...new Set(orphans.flatMap((r) => Object.keys(r.data)))];
    const fields: DataField[] = keys.map((k) => ({ key: k, label: k, ask: false }));
    return [...sheets, { key: ORPHAN_KEY, name: "Sem planilha", fields }];
  }, [sheets, q.data]);
  const known = useMemo(() => new Set(sheets.map((s) => s.key)), [sheets]);
  const sheetOf = (key: string) => (known.has(key) ? key : ORPHAN_KEY);
  const sheet = viewSheets.find((s) => s.key === active) ?? viewSheets[0] ?? null;
  const countBy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of q.data?.rows ?? []) {
      const k = sheetOf(r.sheetKey);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, known]);

  const rows = useMemo(() => {
    const all = (q.data?.rows ?? []).filter((r) => sheetOf(r.sheetKey) === sheet?.key);
    const s = search.trim().toLowerCase();
    if (!s) return all;
    const digits = s.replace(/\D/g, "");
    return all.filter(
      (r) =>
        r.contactName.toLowerCase().includes(s) ||
        (digits.length >= 4 && r.phone.includes(digits)) ||
        Object.values(r.data).some((v) => v.toLowerCase().includes(s)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, search, sheet, known]);

  const suggest = async () => {
    setBusy(true);
    try {
      const r = await suggestDataSheets();
      setDraft(toDraft(r.sheets));
      toast.success("Planilhas montadas pelo prompt. Confira e clique em Salvar planilhas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o prompt.");
    } finally {
      setBusy(false);
    }
  };

  const saveSheets = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await saveDataSheets({
        data: {
          sheets: draft.map((s) => ({ ...s, fields: s.fields.filter((f) => f.label.trim()) })),
        },
      });
      setDraft(null);
      await q.refetch();
      toast.success("Planilhas salvas. O agente já usa nas próximas respostas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSheet = async (target: DataSheet) => {
    if (
      !window.confirm(
        `Apagar a planilha "${target.name}"? O agente para de anotar nela. O que já foi anotado não é apagado.`,
      )
    )
      return;
    setBusy(true);
    try {
      await saveDataSheets({
        data: { sheets: sheets.filter((s) => s.key !== target.key) },
      });
      if (active === target.key) setActive(null);
      setRow(null);
      await q.refetch();
      toast.success(`Planilha "${target.name}" apagada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível apagar.");
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async () => {
    if (!row) return;
    setBusy(true);
    try {
      await saveDataRow({ data: row });
      setRow(null);
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: DataRow) => {
    if (!window.confirm(`Apagar a linha de ${r.contactName || formatWhatsApp(r.phone)}?`)) return;
    try {
      await deleteDataRow({ data: { id: r.id } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível apagar.");
    }
  };

  const download = () => {
    if (!sheet) return;
    const csv = valuesCsv(
      sheet.fields,
      rows.map((r) => ({
        contactName: r.contactName,
        phone: r.phone,
        data: r.data,
        updatedAt: fmtDate(r.updatedAt),
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.key}-${todayLocalISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (q.data && !q.data.ready) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Falta rodar a atualização do banco (migrations dos dados colhidos) no Supabase.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Planilhas do agente</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void suggest()}>
              {busy ? "Lendo o prompt…" : "Criar pelo prompt"}
            </Button>
            {!draft && (
              <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(sheets))}>
                Editar planilhas
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            O agente anota o que a pessoa informa na planilha do tipo de pedido (ex.: Previdência,
            Pessoa física, Empresa), cada uma só com as suas colunas. "Pedir" = o agente pergunta
            por conta própria; desligado = só anota, e quem decide quando pedir são as instruções do
            agente.
          </p>
          {draft ? (
            <SheetsEditor
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              canCancel={sheets.length > 0}
              onSave={() => void saveSheets()}
            />
          ) : (
            <div className="space-y-1">
              {sheets.map((s) => (
                <div key={s.key} className="flex items-start justify-between gap-2">
                  <p>
                    <b>{s.name}:</b>{" "}
                    <span className="text-muted-foreground">
                      {s.fields.map((f) => f.label + (f.ask ? " (pedir)" : "")).join(", ") ||
                        "sem campos"}
                    </span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    disabled={busy}
                    onClick={() => void deleteSheet(s)}
                  >
                    Apagar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {sheet && (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex gap-1 overflow-x-auto">
              {viewSheets.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setActive(s.key);
                    setRow(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent",
                    s.key === sheet.key && "bg-accent font-medium text-foreground",
                  )}
                >
                  {s.name}{" "}
                  <Badge variant="secondary" className="ml-1">
                    {countBy[s.key] ?? 0}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="flex w-full flex-wrap gap-2">
              <Input
                className="min-w-0 flex-1 sm:max-w-56"
                placeholder="Buscar"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={sheet.fields.length === 0 || sheet.key === ORPHAN_KEY}
                onClick={() =>
                  setRow({ sheetKey: sheet.key, contactName: "", phone: "", data: {} })
                }
              >
                Nova linha
              </Button>
              <Button variant="outline" disabled={rows.length === 0} onClick={download}>
                Baixar planilha
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {row && (
              <RowEditor
                fields={sheet.fields}
                row={row}
                setRow={setRow}
                busy={busy}
                onSave={() => void saveRow()}
              />
            )}
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Nada anotado nesta planilha ainda. As linhas aparecem quando o agente anotar algo
                numa conversa.
              </p>
            ) : (
              <SheetTable
                fields={sheet.fields}
                rows={rows}
                onEdit={(r) =>
                  setRow({
                    id: r.id,
                    sheetKey: r.sheetKey,
                    contactName: r.contactName,
                    phone: r.phone,
                    data: { ...r.data },
                  })
                }
                onDelete={(r) => void remove(r)}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SheetsEditor({
  draft,
  setDraft,
  busy,
  canCancel,
  onSave,
}: {
  draft: SheetDraft[];
  setDraft: (d: SheetDraft[] | null) => void;
  busy: boolean;
  canCancel: boolean;
  onSave: () => void;
}) {
  const setSheet = (i: number, s: SheetDraft) => setDraft(draft.map((x, j) => (j === i ? s : x)));
  return (
    <div className="space-y-4">
      {draft.map((s, i) => (
        <div key={s.key ?? `nova-${i}`} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-0 flex-1 font-medium sm:max-w-xs"
              placeholder="Nome da planilha (ex.: Previdência)"
              value={s.name}
              onChange={(e) => setSheet(i, { ...s, name: e.target.value })}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(`Tirar a planilha "${s.name || "sem nome"}"?`)) {
                  setDraft(draft.filter((_, j) => j !== i));
                  toast.info("Clique em Salvar planilhas, lá embaixo, para confirmar.");
                }
              }}
            >
              Tirar planilha
            </Button>
          </div>
          {s.fields.map((f, fi) => (
            <div key={f.key ?? `novo-${fi}`} className="flex flex-wrap items-center gap-2 pl-2">
              <Input
                className="min-w-0 flex-1 sm:max-w-xs"
                placeholder="Campo (ex.: CPF)"
                value={f.label}
                onChange={(e) =>
                  setSheet(i, {
                    ...s,
                    fields: s.fields.map((x, j) =>
                      j === fi ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <label className="flex items-center gap-2">
                <Switch
                  checked={f.ask}
                  onCheckedChange={(v) =>
                    setSheet(i, {
                      ...s,
                      fields: s.fields.map((x, j) => (j === fi ? { ...x, ask: v } : x)),
                    })
                  }
                />
                Pedir
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSheet(i, { ...s, fields: s.fields.filter((_, j) => j !== fi) })}
              >
                Tirar
              </Button>
            </div>
          ))}
          {s.fields.length < MAX_FIELDS && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSheet(i, { ...s, fields: [...s.fields, { label: "", ask: false }] })
              }
            >
              Adicionar campo
            </Button>
          )}
        </div>
      ))}
      {draft.length < MAX_SHEETS && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDraft([...draft, { name: "", fields: [{ label: "", ask: false }] }])}
        >
          Nova planilha
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Tirar um campo ou uma planilha não apaga o que já foi anotado; só some da tela.
      </p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={onSave}>
          Salvar planilhas
        </Button>
        {canCancel && (
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

function SheetTable({
  fields,
  rows,
  onEdit,
  onDelete,
}: {
  fields: DataField[];
  rows: DataRow[];
  onEdit: (r: DataRow) => void;
  onDelete: (r: DataRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 bg-card px-4 py-2 font-medium">Contato</th>
            {fields.map((f) => (
              <th key={f.key} className="whitespace-nowrap px-3 py-2 font-medium">
                {f.label}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 font-medium">Atualizado</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="sticky left-0 bg-card px-4 py-2">
                <p className="font-medium">{r.contactName || "Sem nome"}</p>
                <p className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatWhatsApp(r.phone)}
                </p>
              </td>
              {fields.map((f) => (
                <td key={f.key} className="max-w-56 px-3 py-2 break-words">
                  {r.data[f.key] ?? <span className="text-muted-foreground">—</span>}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                {fmtDate(r.updatedAt)}
                <br />
                {r.updatedBy === "equipe" ? "pela equipe" : "pelo agente"}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(r)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(r)}>
                  Apagar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowEditor({
  fields,
  row,
  setRow,
  busy,
  onSave,
}: {
  fields: DataField[];
  row: RowDraft;
  setRow: (r: RowDraft | null) => void;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 border-b p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Nome no WhatsApp</Label>
          <Input
            value={row.contactName}
            onChange={(e) => setRow({ ...row, contactName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Telefone (com DDD)</Label>
          <Input
            inputMode="tel"
            value={row.phone}
            onChange={(e) => setRow({ ...row, phone: e.target.value })}
          />
        </div>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label>{f.label}</Label>
            <Input
              value={row.data[f.key] ?? ""}
              onChange={(e) => setRow({ ...row, data: { ...row.data, [f.key]: e.target.value } })}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={onSave}>
          Salvar
        </Button>
        <Button variant="ghost" onClick={() => setRow(null)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
