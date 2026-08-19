import type { ParsedLine } from "@/lib/ocr.functions";
import { similarity } from "@/lib/color-names";

/**
 * Interpretação determinística do texto lido pelo OCR local.
 *
 * Não usa IA: casa o texto com o que já existe no cadastro (SKUs, cores,
 * tamanhos e kits). Dados pessoais e logísticos são descartados.
 *
 * O casamento usado para confirmar é exato depois de normalizar acentos e
 * separadores. Similaridade nunca promove texto parcial a item do cadastro.
 */

export type Lists = {
  skus: string[];
  colors: string[];
  sizes: string[];
  kits: string[];
};

const IGNORE = [
  /cpf/i,
  /cnpj/i,
  /endere/i,
  /telefone/i,
  /celular/i,
  /rastrei/i,
  /pagamento/i,
  /cart[aã]o/i,
  /\bpix\b/i,
  /destinat/i,
  /remetente/i,
  /transportadora/i,
  /correios/i,
  /nota fiscal/i,
  /^\s*cep\b/i,
  /r\$\s*\d/i,
];

export function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9+/&,.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pedido: TikTok usa números longos; pegamos o maior número plausível. */
export function findOrderRef(text: string): string {
  const hit = text.match(/\b\d{12,22}\b/);
  return hit?.[0] ?? "";
}

function findQty(line: string): { qty: number; conf: number } {
  const patterns = [
    /\bx\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:un|unid|pcs|pe[cç]as?)\b/i,
    /\bqtd\.?\s*:?\s*(\d{1,3})\b/i,
    /\bqty\.?\s*:?\s*(\d{1,3})\b/i,
  ];
  for (const p of patterns) {
    const m = line.match(p);
    const n = Number(m?.[1]);
    if (Number.isFinite(n) && n > 0 && n < 500) return { qty: n, conf: 0.92 };
  }
  return { qty: 0, conf: 0 };
}

/**
 * Melhor casamento aproximado de `option` dentro de `line`.
 * Percorre janelas de palavras do mesmo tamanho da opção — assim
 * "MARROM CLARO" não casa com "MARROM" por acidente e o OCR pode errar
 * uma ou duas letras sem perder a leitura.
 */
export function fuzzyFind(
  line: string,
  option: string,
): { score: number; at: number; len: number } {
  const target = norm(line);
  const opt = norm(option);
  if (!opt || !target) return { score: 0, at: -1, len: 0 };
  const direct = target.indexOf(opt);
  if (direct >= 0) return { score: 1, at: direct, len: opt.length };

  const words = target.split(" ");
  const optWords = opt.split(" ").length;
  let best = { score: 0, at: -1, len: 0 };
  // posições iniciais de cada palavra na string normalizada
  const offsets: number[] = [];
  let cursor = 0;
  for (const w of words) {
    offsets.push(cursor);
    cursor += w.length + 1;
  }
  for (let size = Math.max(1, optWords - 1); size <= optWords + 1; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const chunk = words.slice(i, i + size).join(" ");
      if (Math.abs(chunk.length - opt.length) > Math.max(3, opt.length * 0.5)) continue;
      const score = similarity(chunk, opt);
      if (score > best.score) best = { score, at: offsets[i] ?? 0, len: chunk.length };
    }
  }
  return best;
}

const MIN_SCORE = 0.88;

function exactFind(line: string, options: string[]): { value: string; conf: number } | null {
  const target = ` ${norm(line)} `;
  const matches = options
    .filter((option) => norm(option).length > 0)
    .filter((option) => target.includes(` ${norm(option)} `))
    .sort((a, b) => norm(b).length - norm(a).length);
  if (matches.length === 0) return null;
  const longest = norm(matches[0] ?? "").length;
  const equallySpecific = matches.filter((value) => norm(value).length === longest);
  return equallySpecific.length === 1 ? { value: equallySpecific[0] ?? "", conf: 0.98 } : null;
}

/** Encontra a melhor opção da lista dentro da linha. */
function findIn(
  line: string,
  options: string[],
  min = MIN_SCORE,
): { value: string; conf: number } | null {
  let best: { value: string; conf: number } | null = null;
  for (const opt of options) {
    if (!opt || norm(opt).length < 2) continue;
    const hit = fuzzyFind(line, opt);
    // opções mais longas ganham desempate (evita "PRETO" vencer "PRETO FOSCO")
    const weighted = hit.score + Math.min(0.05, norm(opt).length / 400);
    if (hit.score >= min && (!best || weighted > best.conf)) {
      best = { value: opt, conf: Math.min(0.99, weighted) };
    }
  }
  return best;
}

/** Todas as cores presentes na linha, na ordem em que aparecem, sem sobrepor. */
function findAll(line: string, options: string[]): { values: string[]; conf: number } {
  const target = norm(line);
  const found: { value: string; at: number; score: number }[] = [];
  const used: [number, number][] = [];
  const scored = options
    .filter((o) => norm(o).length >= 3)
    .map((o) => {
      const normalized = norm(o);
      const boundary = new RegExp(`(^|[^A-Z0-9])${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`);
      const match = boundary.exec(target);
      return { opt: o, hit: { score: match ? 1 : 0, at: match?.index ?? -1, len: normalized.length } };
    })
    .filter((r) => r.hit.score === 1)
    // resolve sobreposição sempre pela melhor pontuação / maior nome
    .sort((a, b) => b.hit.score - a.hit.score || norm(b.opt).length - norm(a.opt).length);

  for (const r of scored) {
    const s = r.hit.at;
    const e = s + r.hit.len;
    if (used.some(([us, ue]) => s < ue && e > us)) continue;
    used.push([s, e]);
    found.push({ value: r.opt, at: s, score: r.hit.score });
  }
  found.sort((a, b) => a.at - b.at);
  return {
    values: found.map((f) => f.value),
    conf: found.length ? found.reduce((a, f) => a + f.score, 0) / found.length : 0,
  };
}

/** Tamanho isolado ("P", "M", "G", "42") quando não bate por similaridade. */
function looseSize(line: string, sizes: string[]): { value: string; conf: number } | null {
  const t = norm(line);
  const sorted = [...sizes].sort((a, b) => b.length - a.length);
  for (const s of sorted) {
    const o = norm(s);
    if (!o) continue;
    if (
      new RegExp(`(^|[^A-Z0-9])${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(t)
    ) {
      return { value: s, conf: 0.9 };
    }
  }
  return null;
}

/**
 * Converte o texto bruto do OCR em linhas de produto.
 * Só devolve itens que casam com algo do cadastro.
 */
export function parseLabelText(text: string, lists: Lists, baseConf = 0.7): ParsedLine[] {
  const raw = text.split(/\r?\n/);
  const out: ParsedLine[] = [];
  for (const original of raw) {
    const line = original.trim();
    if (line.length < 2) continue;
    if (IGNORE.some((re) => re.test(line))) continue;

    const sku = exactFind(line, lists.skus);
    const colors = findAll(line, lists.colors);
    const kit = exactFind(line, lists.kits);
    const size = exactFind(line, lists.sizes) ?? looseSize(line, lists.sizes);
    const qty = findQty(line);

    // Uma linha só vira item quando contém evidência própria e forte. Valores de
    // linhas anteriores nunca são herdados: o cadastro valida, mas não completa OCR.
    if (!sku || !size || (colors.values.length === 0 && !kit)) continue;

    out.push({
      sku: sku.value,
      colors: colors.values.length > 0 ? colors.values : kit ? [kit.value] : [],
      size: size.value,
      qty: qty.qty,
      pattern: norm(line),
      confidence: {
        sku: Math.min(sku.conf, baseConf),
        colors: Math.min(colors.conf || kit?.conf || 0, baseConf),
        size: Math.min(size.conf, baseConf),
        qty: qty.conf,
      },
    });
  }

  // Etiquetas em tabela frequentemente quebram uma linha visual em 2–3 linhas
  // do OCR. O bloco é aceito apenas com valores exatos do cadastro.
  if (out.length === 0) {
    const flat = raw.filter((l) => !IGNORE.some((re) => re.test(l))).join(" ");
    const sku = exactFind(flat, lists.skus);
    const colors = findAll(flat, lists.colors);
    const kit = exactFind(flat, lists.kits);
    const size = exactFind(flat, lists.sizes) ?? looseSize(flat, lists.sizes);
    if (sku && size && (colors.values.length > 0 || kit)) {
      const qty = findQty(flat);
      out.push({
        sku: sku.value,
        colors: colors.values.length > 0 ? colors.values : [kit!.value],
        size: size.value,
        qty: qty.qty,
        pattern: norm(flat),
        confidence: {
          sku: Math.min(sku.conf, baseConf),
          colors: Math.min(colors.conf || kit?.conf || 0, baseConf),
          size: Math.min(size.conf, baseConf),
          qty: qty.conf ? Math.min(qty.conf, baseConf) : 0,
        },
      });
    }
  }

  // remove duplicatas exatas da mesma etiqueta somando quantidade
  const merged = new Map<string, ParsedLine>();
  for (const item of out) {
    const key = `${norm(item.sku)}|${item.colors.map(norm).join("+")}|${norm(item.size)}`;
    const prev = merged.get(key);
    if (prev) prev.qty += item.qty;
    else merged.set(key, { ...item });
  }
  return [...merged.values()];
}
