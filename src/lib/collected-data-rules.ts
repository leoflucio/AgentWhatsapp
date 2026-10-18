// Dados colhidos pelo agente (planilha por conta): campos que o negócio escolhe
// (nome, CPF, valor...) e o que o agente anotou, uma linha por registro (cliente,
// pedido ou cotação; o mesmo telefone pode ter várias). Regras puras, sem banco.

/** Parâmetro de salvar_dados que abre uma linha nova (não pode ser chave de campo). */
export const NEW_RECORD_PARAM = "novo_registro";

export type DataField = {
  /** Chave fixa (letras minúsculas, números e _), não muda quando o nome do campo muda. */
  key: string;
  label: string;
  /** O agente pede o dado (true) ou só anota se a pessoa disser (false). */
  ask: boolean;
};

export type DataValues = Record<string, string>;

export const MAX_FIELDS = 15;
export const MAX_LABEL = 60;
export const MAX_VALUE = 500;

/** "Valor do pedido" → "valor_do_pedido" (sem acento; única entre as chaves já usadas). */
export function slugKey(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "campo";
  const start = /^[a-z]/.test(base) ? base : `c_${base}`;
  let key = start;
  for (let i = 2; taken.has(key); i++) key = `${start}_${i}`;
  return key;
}

/** Lista de campos válida: sem nome vazio nem repetido, chaves únicas, no máximo MAX_FIELDS. */
export function normalizeFields(raw: unknown): DataField[] {
  if (!Array.isArray(raw)) return [];
  const out: DataField[] = [];
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = String(r.label ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_LABEL);
    if (!label || labels.has(label.toLowerCase())) continue;
    const given = typeof r.key === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(r.key) ? r.key : "";
    keys.add(NEW_RECORD_PARAM);
    const key = given && !keys.has(given) ? given : slugKey(label, keys);
    keys.add(key);
    labels.add(label.toLowerCase());
    out.push({ key, label, ask: r.ask !== false });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

/** Valores guardados (jsonb) como texto, só dos campos conhecidos ou de qualquer chave. */
export function parseValues(raw: unknown): DataValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DataValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) out[k] = s.slice(0, MAX_VALUE);
  }
  return out;
}

/**
 * Junta o que o agente anotou agora com o que já estava: só campos da lista,
 * texto não vazio. Valor vazio não apaga o anterior (o agente não apaga dados).
 */
export function mergeValues(
  old: DataValues,
  incoming: Record<string, unknown>,
  fields: DataField[],
): { data: DataValues; changed: string[] } {
  const data = { ...old };
  const changed: string[] = [];
  for (const f of fields) {
    const v = incoming[f.key];
    if (v === null || v === undefined) continue;
    const s = String(v).replace(/\s+/g, " ").trim().slice(0, MAX_VALUE);
    if (!s || data[f.key] === s) continue;
    data[f.key] = s;
    changed.push(f.key);
  }
  return { data, changed };
}

/**
 * Bloco do prompt: o que pedir, o que só anotar e o registro atual (última linha
 * deste telefone). Dados de outro cliente ou pedido vão numa linha nova.
 */
export function collectPromptText(fields: DataField[], current: DataValues): string {
  if (fields.length === 0) return "";
  const have = fields.filter((f) => current[f.key]);
  const missingAsk = fields.filter((f) => f.ask && !current[f.key]);
  const noteOnly = fields.filter((f) => !f.ask);
  return [
    "DADOS PARA ANOTAR (planilha do negócio):",
    `Campos: ${fields.map((f) => f.label).join(", ")}.`,
    missingAsk.length
      ? `Pedir, se ainda não souber: ${missingAsk.map((f) => f.label).join(", ")}.`
      : "",
    noteOnly.length
      ? `Não pergunte por conta própria (só anote se a pessoa disser ou se as instruções do negócio mandarem pedir): ${noteOnly.map((f) => f.label).join(", ")}.`
      : "",
    have.length
      ? `Registro atual deste contato: ${have.map((f) => `${f.label} = ${current[f.key]}`).join("; ")}.`
      : "Este contato ainda não tem registro.",
    "Sempre que a pessoa informar um desses dados, chame salvar_dados na mesma resposta, com o valor exatamente como ela disse. Se ela corrigir um dado, salve o novo valor.",
    have.length
      ? `Se os dados forem de OUTRO cliente, pedido ou cotação (não do registro atual), chame salvar_dados com ${NEW_RECORD_PARAM} = true para abrir uma linha nova; nunca sobrescreva o registro atual com dados de outra pessoa. Para o mesmo cliente ou pedido, não peça de novo o que já está no registro.`
      : "",
    missingAsk.length
      ? "Peça os dados que faltam com naturalidade, no máximo dois por mensagem, depois de entender o que a pessoa quer (não na saudação). Se ela não quiser informar, não insista."
      : "",
    "Nunca invente dados.",
  ]
    .filter(Boolean)
    .join(" ");
}

function csvCell(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Planilha em CSV (separador ;, abre direto no Excel em português). */
export function valuesCsv(
  fields: DataField[],
  rows: { contactName: string; phone: string; data: DataValues; updatedAt: string }[],
): string {
  const head = ["Nome no WhatsApp", "Telefone", ...fields.map((f) => f.label), "Atualizado em"];
  const lines = rows.map((r) =>
    [r.contactName, r.phone, ...fields.map((f) => r.data[f.key] ?? ""), r.updatedAt]
      .map((v) => csvCell(String(v ?? "")))
      .join(";"),
  );
  return `\uFEFF${[head.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}
