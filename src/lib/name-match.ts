/**
 * Nome de pessoa escrito ou falado de jeitos diferentes (regras puras, vindas
 * do FisioAI; testadas em name-match.test.ts). A transcrição do áudio, a
 * equipe e a agenda escrevem o mesmo nome de formas diferentes: Valkyria =
 * Walkyria = Valquíria, Sueli = Suely, Thaís = Tais, Luiz = Luis, Rafaella =
 * Rafaela, Phelipe = Felipe. Aqui o nome é comparado pelo som.
 */

/** Nome sem acento, em maiúsculas e sem espaços sobrando. */
export function foldPersonName(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Partículas que não precisam bater (Maria "da" Silva). */
const NAME_PARTICLES = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "D"]);

/** Palavras do nome, sem partículas e sem pontuação. */
export function nameTokens(v: string | null | undefined): string[] {
  return foldPersonName(v)
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 0 && !NAME_PARTICLES.has(t));
}

/**
 * Como a palavra soa: W = V, Y = I, PH = F, QU/C/K, CE/CI = SE/SI, Ç = S,
 * Z = S, H mudo e letras dobradas viram uma.
 */
export function soundKey(word: string): string {
  // Ç antes de tirar o acento (sem a cedilha viraria C de "ca").
  return foldPersonName(word.replace(/ç/gi, "S"))
    .replace(/[^A-Z]/g, "")
    .replace(/PH/g, "F")
    .replace(/QU/g, "K")
    .replace(/C([EI])/g, "S$1")
    .replace(/C/g, "K")
    .replace(/Y/g, "I")
    .replace(/W/g, "V")
    .replace(/Z/g, "S")
    .replace(/(?<![CLNS])H/g, "")
    .replace(/([A-Z])\1+/g, "$1");
}

/**
 * O nome digitado é desta pessoa? Cada palavra digitada precisa ser uma
 * palavra do nome pelo som (ou o começo dela, com 3+ letras): "Maria Sil"
 * acha "Maria da Silva", "Walkyria" acha "Valquíria"; "Ana" não acha "Mariana".
 */
export function nameMatches(typed: string, personName: string | null | undefined): boolean {
  const want = nameTokens(typed).map(soundKey).filter(Boolean);
  const have = nameTokens(personName).map(soundKey).filter(Boolean);
  if (!want.length || !have.length) return false;
  return want.every((w) => have.some((h) => h === w || (w.length >= 3 && h.startsWith(w))));
}

/**
 * Os dois nomes são a mesma pessoa, com 2+ palavras cada e as mesmas palavras
 * pelo som ("Walkyria Sousa" = "Valquíria Souza"). Mais rígido que
 * nameMatches: um primeiro nome sozinho nunca basta.
 */
export function sameFullName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = nameTokens(a).map(soundKey).filter(Boolean);
  const y = nameTokens(b).map(soundKey).filter(Boolean);
  if (x.length < 2 || y.length < 2) return false;
  const sx = new Set(x);
  const sy = new Set(y);
  return sx.size === sy.size && [...sx].every((t) => sy.has(t));
}

/** "Adriano e Fabíola", "Ana, Bia e Carla" → um nome por pessoa. */
export function splitNames(nome: string): string[] {
  return nome
    .split(/\s*,\s*|\s+e\s+/i)
    .map((n) => n.trim())
    .filter((n) => nameTokens(n).length > 0);
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length]!;
}

/** Parecença 0..1 entre o que foi ouvido e uma palavra do nome (também dentro dela: "LUCY" ~ "ERLUCE"). */
export function nameSimilarity(heard: string, word: string): number {
  if (!heard || !word) return 0;
  const whole = 1 - levenshtein(heard, word) / Math.max(heard.length, word.length);
  let inside = 0;
  if (heard.length >= 4 && word.length > heard.length) {
    for (let i = 0; i + heard.length <= word.length; i++) {
      const part = word.slice(i, i + heard.length);
      inside = Math.max(inside, (1 - levenshtein(heard, part) / heard.length) * 0.9);
    }
  }
  return Math.max(whole, inside);
}

const letters = (v: string) => foldPersonName(v).replace(/[^A-Z]/g, "");

/** Quanto o texto ouvido parece o nome (0..1), pela grafia e pelo som. */
export function nameScore(typed: string, personName: string): number {
  if (nameMatches(typed, personName)) return 1;
  const heardWords = nameTokens(typed).filter((w) => w.length >= 3);
  const heard = [letters(typed), ...heardWords.map(letters)].filter((w) => w.length >= 3);
  const heardSound = [soundKey(typed), ...heardWords.map(soundKey)].filter((w) => w.length >= 3);
  let score = 0;
  for (const w of nameTokens(personName)) {
    for (const h of heard) score = Math.max(score, nameSimilarity(h, letters(w)));
    for (const h of heardSound) score = Math.max(score, nameSimilarity(h, soundKey(w)));
  }
  return score;
}

/** Parecença mínima para aceitar um nome que não bate exatamente. */
export const FUZZY_MIN = 0.6;
/** O segundo mais parecido precisa ficar pelo menos isto atrás do primeiro. */
export const FUZZY_GAP = 0.15;

export type NamePick<T> =
  | { ok: true; nome: string; items: T[]; exact: boolean }
  | { ok: false; reason: "nenhum" | "varios"; nomes: string[] };

/**
 * Acha a pessoa pelo nome entre os itens. Primeiro pelo som (nameMatches);
 * sem ninguém, o único nome bem parecido (erro de transcrição). Mais de uma
 * pessoa possível = "varios": quem chama pergunta, nunca chuta.
 */
export function pickByName<T>(
  items: T[],
  typed: string,
  nameOf: (t: T) => string | null | undefined,
): NamePick<T> {
  const group = (list: T[]) => {
    const by = new Map<string, { nome: string; items: T[] }>();
    for (const it of list) {
      const nome = (nameOf(it) ?? "").trim();
      if (!nome) continue;
      const k = nameTokens(nome).map(soundKey).join(" ");
      const g = by.get(k) ?? { nome, items: [] };
      g.items.push(it);
      by.set(k, g);
    }
    return [...by.values()];
  };
  const exact = group(items.filter((it) => nameMatches(typed, nameOf(it))));
  if (exact.length === 1)
    return { ok: true, nome: exact[0]!.nome, items: exact[0]!.items, exact: true };
  if (exact.length > 1) {
    // "Ana" com "Ana" e "Ana Paula": quem tem só esse nome não ganha sozinho; pergunta.
    return { ok: false, reason: "varios", nomes: exact.map((g) => g.nome) };
  }
  if (letters(typed).length < 3) return { ok: false, reason: "nenhum", nomes: [] };
  const ranked = group(items)
    .map((g) => ({ ...g, score: nameScore(typed, g.nome) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < FUZZY_MIN) return { ok: false, reason: "nenhum", nomes: [] };
  const close = ranked.filter((g) => g.score > best.score - FUZZY_GAP);
  if (close.length > 1) return { ok: false, reason: "varios", nomes: close.map((g) => g.nome) };
  return { ok: true, nome: best.nome, items: best.items, exact: false };
}

/** Palavras que aparecem nos comandos e não são nome de ninguém. */
const COMMAND_WORDS = new Set(
  [
    "CONFIRMAR",
    "CONFIRMA",
    "CONFIRMOU",
    "CONFIRMADO",
    "CANCELAR",
    "CANCELA",
    "CANCELOU",
    "DESMARCAR",
    "DESMARCA",
    "DESMARCOU",
    "REMARCAR",
    "REMARCA",
    "REAGENDAR",
    "AGENDAR",
    "AGENDA",
    "MARCAR",
    "MARCA",
    "FALTOU",
    "VEIO",
    "VEM",
    "NAO",
    "HOJE",
    "AMANHA",
    "ONTEM",
    "DEPOIS",
    "PARA",
    "PRA",
    "DIA",
    "AS",
    "NO",
    "NA",
    "EM",
    "COM",
    "HORAS",
    "HORA",
    "MANHA",
    "TARDE",
    "NOITE",
    "SEGUNDA",
    "TERCA",
    "QUARTA",
    "QUINTA",
    "SEXTA",
    "SABADO",
    "DOMINGO",
    "FEIRA",
    "PROXIMA",
    "PROXIMO",
    "MEIO",
    "MEIA",
    "HORARIO",
    "CLIENTE",
    "PACIENTE",
    "SENHORA",
    "SENHOR",
    "DONA",
    "SEU",
    "TODOS",
    "TODAS",
    "OS",
    "AS",
    "DO",
    "DA",
    "DE",
    "QUE",
    "ELA",
    "ELE",
    "POR",
    "FAVOR",
  ].map(soundKey),
);

/**
 * Pessoas da lista que o texto parece citar (pela grafia ou pelo som), para
 * ajudar a IA a ligar "Walkyria" a "Valquíria". Só nomes; quem decide é a IA
 * com a lista toda, e o código confere depois.
 */
export function mentionedNames(text: string, names: string[]): string[] {
  const words = nameTokens(text.replace(/#/g, " "))
    .filter((w) => /[A-Z]/.test(w))
    .filter((w) => w.length >= 3 && !COMMAND_WORDS.has(soundKey(w)));
  if (!words.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = foldPersonName(name);
    if (!key || seen.has(key)) continue;
    const parts = nameTokens(name).filter((p) => p.length >= 3);
    const hit = parts.some((p) => {
      const sp = soundKey(p);
      return words.some((w) => {
        const sw = soundKey(w);
        if (sw === sp) return true;
        if (sw.length >= 4 && sp.length >= 4) {
          return nameSimilarity(sw, sp) >= 0.75 || nameSimilarity(letters(w), letters(p)) >= 0.75;
        }
        return false;
      });
    });
    if (hit) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
