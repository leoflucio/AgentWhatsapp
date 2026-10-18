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
import { MAX_FIELDS, valuesCsv, type DataField } from "@/lib/collected-data-rules";
import {
  deleteDataRow,
  getDataSheet,
  saveDataFields,
  saveDataRow,
  type DataRow,
} from "@/lib/collected-data.functions";
import { formatWhatsApp } from "@/lib/phone";
import { todayLocalISO } from "@/lib/agenda-time";

export const Route = createFileRoute("/_app/dados")({ component: DadosPage });

type FieldDraft = { key?: string; label: string; ask: boolean };
type RowDraft = { id?: string; contactName: string; phone: string; data: Record<string, string> };

const SUGGESTIONS = ["Nome completo", "CPF", "E-mail", "Endereço", "Valor"];

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

function DadosPage() {
  const q = useQuery({ queryKey: ["dados"], queryFn: () => getDataSheet() });
  const fields = q.data?.fields ?? [];
  const [fieldDraft, setFieldDraft] = useState<FieldDraft[] | null>(null);
  const [row, setRow] = useState<RowDraft | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Sem campos ainda: já abre o editor.
  useEffect(() => {
    if (q.data?.ready && q.data.fields.length === 0 && fieldDraft === null) {
      setFieldDraft([{ label: "", ask: true }]);
    }
  }, [q.data, fieldDraft]);

  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    const digits = s.replace(/\D/g, "");
    return all.filter(
      (r) =>
        r.contactName.toLowerCase().includes(s) ||
        (digits.length >= 4 && r.phone.includes(digits)) ||
        Object.values(r.data).some((v) => v.toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  const saveFields = async () => {
    if (!fieldDraft) return;
    setBusy(true);
    try {
      await saveDataFields({ data: { fields: fieldDraft.filter((f) => f.label.trim()) } });
      setFieldDraft(null);
      await q.refetch();
      toast.success("Campos salvos. O agente já usa nas próximas respostas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
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
    if (!window.confirm(`Apagar os dados de ${r.contactName || formatWhatsApp(r.phone)}?`)) return;
    try {
      await deleteDataRow({ data: { id: r.id } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível apagar.");
    }
  };

  const download = () => {
    const csv = valuesCsv(
      fields,
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
    a.download = `dados-colhidos-${todayLocalISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (q.data && !q.data.ready) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Falta rodar a atualização do banco (migration dos dados colhidos) no Supabase.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Dados que o agente colhe</CardTitle>
          {!fieldDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFieldDraft(fields.map((f) => ({ ...f })))}
            >
              Editar campos
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Escolha o que o agente deve anotar de cada pessoa. "Pedir" = o agente pergunta com
            naturalidade durante a conversa; desligado = só anota se a pessoa disser. Para pedir só
            em certos casos (ex.: só numa cotação), deixe desligado e escreva nas instruções do
            agente quando pedir. Tudo cai na planilha abaixo, uma linha por cliente ou pedido, e
            você pode editar.
          </p>
          {!fieldDraft && (
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <Badge key={f.key} variant={f.ask ? "default" : "secondary"}>
                  {f.label}
                  {f.ask ? " · pedir" : " · só anotar"}
                </Badge>
              ))}
            </div>
          )}
          {fieldDraft && (
            <div className="space-y-2">
              {fieldDraft.map((f, i) => (
                <div key={f.key ?? `novo-${i}`} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-0 flex-1 sm:max-w-xs"
                    placeholder="Ex.: CPF"
                    value={f.label}
                    onChange={(e) =>
                      setFieldDraft(
                        fieldDraft.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={f.ask}
                      onCheckedChange={(v) =>
                        setFieldDraft(fieldDraft.map((x, j) => (j === i ? { ...x, ask: v } : x)))
                      }
                    />
                    Pedir
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFieldDraft(fieldDraft.filter((_, j) => j !== i))}
                  >
                    Tirar
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {fieldDraft.length < MAX_FIELDS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFieldDraft([...fieldDraft, { label: "", ask: true }])}
                  >
                    Adicionar campo
                  </Button>
                )}
                {SUGGESTIONS.filter(
                  (s) => !fieldDraft.some((f) => f.label.trim().toLowerCase() === s.toLowerCase()),
                ).map((s) => (
                  <Button
                    key={s}
                    variant="ghost"
                    size="sm"
                    disabled={fieldDraft.length >= MAX_FIELDS}
                    onClick={() =>
                      setFieldDraft([
                        ...fieldDraft.filter((f) => f.label.trim()),
                        { label: s, ask: true },
                      ])
                    }
                  >
                    + {s}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tirar um campo não apaga o que já foi anotado; ele só some da planilha.
              </p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void saveFields()}>
                  Salvar campos
                </Button>
                {fields.length > 0 && (
                  <Button variant="ghost" onClick={() => setFieldDraft(null)}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Planilha ({(q.data?.total ?? 0).toLocaleString("pt-BR")})</CardTitle>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Input
              className="min-w-0 flex-1 sm:w-56"
              placeholder="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={fields.length === 0}
              onClick={() => setRow({ contactName: "", phone: "", data: {} })}
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
              fields={fields}
              row={row}
              setRow={setRow}
              busy={busy}
              onSave={() => void saveRow()}
            />
          )}
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {fields.length === 0
                ? "Escolha os campos acima para o agente começar a anotar."
                : "Nada anotado ainda. As linhas aparecem quando o agente anotar algo numa conversa."}
            </p>
          ) : (
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setRow({
                              id: r.id,
                              contactName: r.contactName,
                              phone: r.phone,
                              data: { ...r.data },
                            })
                          }
                        >
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(r)}>
                          Apagar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
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
