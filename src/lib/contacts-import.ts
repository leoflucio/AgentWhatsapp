/**
 * Importação da agenda do celular: arquivo vCard (.vcf, exportado pelo
 * Android, iPhone/iCloud ou Google Contatos) ou planilha CSV. Regras puras,
 * testadas em contacts-import.test.ts.
 */
import { normalizeWhatsApp, phoneMatchKey } from "@/lib/phone";

export type ImportedContact = { name: string; phone: string };

/** Desfaz as linhas dobradas do vCard (continuação começa com espaço ou tab). */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

/** Decodifica QUOTED-PRINTABLE (vCard 2.1 do Android, com acentos em UTF-8). */
function decodeQP(v: string): string {
  const bytes: number[] = [];
  const s = v.replace(/=\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(s[i]));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function unescapeV(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
}

export function parseVCard(text: string): { name: string; phones: string[] }[] {
  const out: { name: string; phones: string[] }[] = [];
  let cur: { fn: string; n: string; phones: string[] } | null = null;
  for (const line of unfold(text)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    let value = line.slice(idx + 1);
    const key = head
      .split(";")[0]
      .replace(/^item\d+\./i, "")
      .toUpperCase();
    if (/ENCODING=QUOTED-PRINTABLE/i.test(head)) value = decodeQP(value);
    if (key === "BEGIN" && value.trim().toUpperCase() === "VCARD") {
      cur = { fn: "", n: "", phones: [] };
    } else if (!cur) {
      continue;
    } else if (key === "END") {
      const name = cur.fn || cur.n;
      if (cur.phones.length) out.push({ name, phones: cur.phones });
      cur = null;
    } else if (key === "FN") {
      cur.fn = unescapeV(value);
    } else if (key === "N") {
      // N:Sobrenome;Nome;Meio;Prefixo;Sufixo
      const [last, first, middle] = value.split(";").map(unescapeV);
      cur.n = [first, middle, last].filter(Boolean).join(" ");
    } else if (key === "TEL") {
      const tel = value.replace(/^tel:/i, "").trim();
      if (tel) cur.phones.push(tel);
    }
  }
  return out;
}

/** Divide uma linha de CSV respeitando aspas. */
function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * CSV com cabeçalho: acha as colunas de nome (Nome, Name, First/Last Name) e
 * de telefone (Telefone, Celular, WhatsApp, Phone ... Value).
 */
export function parseContactsCsv(text: string): { name: string; phones: string[] }[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(lines[0], sep).map(norm);
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  const nameCol = find(/^(nome|name|nome completo|full name|display name)$/);
  const firstCol = find(/^(first name|primeiro nome|given name)$/);
  const lastCol = find(/^(last name|sobrenome|family name)$/);
  const phoneCols = header
    .map((h, i) => ({ h, i }))
    .filter(
      ({ h }) =>
        /(telefone|celular|whatsapp|fone|phone|mobile)/.test(h) && !/(type|tipo|label)/.test(h),
    )
    .map(({ i }) => i);
  if (!phoneCols.length) return [];
  const out: { name: string; phones: string[] }[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, sep);
    const name =
      (nameCol >= 0 ? cells[nameCol] : "") ||
      [firstCol >= 0 ? cells[firstCol] : "", lastCol >= 0 ? cells[lastCol] : ""]
        .filter(Boolean)
        .join(" ");
    // Google Contatos junta vários números na mesma célula com " ::: ".
    const phones = phoneCols.flatMap((i) => (cells[i] ?? "").split(/:::|\//)).map((p) => p.trim());
    if (phones.some(Boolean)) out.push({ name: name.trim(), phones: phones.filter(Boolean) });
  }
  return out;
}

/**
 * Lista final para gravar: só celulares brasileiros válidos, um registro por
 * telefone (o primeiro nome encontrado vale), sem nome vira o próprio número.
 */
export function toImportRows(entries: { name: string; phones: string[] }[]): {
  rows: ImportedContact[];
  skipped: number;
} {
  const seen = new Set<string>();
  const rows: ImportedContact[] = [];
  let skipped = 0;
  for (const e of entries) {
    for (const raw of e.phones) {
      const phone = normalizeWhatsApp(raw);
      const key = phoneMatchKey(phone);
      if (!phone || !key) {
        skipped++;
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ name: (e.name || "").trim().slice(0, 120), phone });
    }
  }
  return { rows, skipped };
}

/** Lê o arquivo pelo formato: vCard se tiver BEGIN:VCARD, senão CSV. */
export function parseContactsFile(text: string): { rows: ImportedContact[]; skipped: number } {
  const entries = /BEGIN:VCARD/i.test(text) ? parseVCard(text) : parseContactsCsv(text);
  return toImportRows(entries);
}
