import type { ParsedLine } from "@/lib/ocr.functions";
import { similarity } from "@/lib/color-names";

/**
 * Interpretação determinística do texto lido pelo OCR local.
 *
 * Não usa IA: casa o texto com o que já existe no cadastro (SKUs, cores,
 * tamanhos e kits). Dados pessoais e logísticos são descartados.
 *
 * O casamento é APROXIMADO (tolerante a erro de OCR), mas nunca inventa:
 * só devolve valores que existem no cadastro. A decisão final de kit/cor é
 * feita depois, em `kit-match`, pela composição real cadastrada.
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
  return { qty: 1, conf: 0.6 };
}

/**
 * Melhor casamento aproximado de `option` dentro de `line`.
 * Percorre janelas de palavras do mesmo tamanho da opção — assim
 * "MARROM CLARO" não casa com "MARROM" por acidente e o OCR pode errar
 * uma ou duas letras sem perder a leitura.
 */
export function fuzzyFind(line: string, option: string): { score: number; at: number; len: number } {
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

const MIN_SCORE = 0.78;

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
  const found: { value: string; at: number; score: number }[] = [];
  const used: [number, number][] = [];
  const scored = options
    .filter((o) => norm(o).length >= 3)
    .map((o) => ({ opt: o, hit: fuzzyFind(line, o) }))
    .filter((r) => r.hit.score >= MIN_SCORE)
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
    if (new RegExp(`(^|[^A-Z0-9])${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(t)) {
      return { value: s, conf: 0.8 };
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
  let lastSku = "";
  let lastSize = "";

  for (const original of raw) {
    const line = original.trim();
    if (line.length < 2) continue;
    if (IGNORE.some((re) => re.test(line))) continue;

    const sku = findIn(line, lists.skus, 0.74);
    const colors = findAll(line, lists.colors);
    const kit = findIn(line, lists.kits);
    const size = findIn(line, lists.sizes, 0.85) ?? looseSize(line, lists.sizes);
    const qty = findQty(line);

    if (sku) lastSku = sku.value;
    if (size) lastSize = size.value;

    const skuValue = sku?.value ?? lastSku;
    if (!skuValue) continue;

    // precisa ter pelo menos cor ou kit para virar item
    if (colors.values.length === 0 && !kit) continue;

    out.push({
      sku: skuValue,
      colors: colors.values.length > 0 ? colors.values : kit ? [kit.value] : [],
      size: size?.value ?? lastSize,
      qty: qty.qty,
      confidence: {
        sku: Math.min(0.97, (sku?.conf ?? 0.65) * baseConf + 0.25),
        colors: Math.min(0.97, (colors.conf || kit?.conf || 0.5) * baseConf + 0.25),
        size: Math.min(0.97, (size?.conf ?? 0.4) * baseConf + 0.2),
        qty: qty.conf,
      },
    });
  }

  // Fallback de documento: a etiqueta pode quebrar SKU e cor em linhas
  // diferentes (colunas desalinhadas no OCR). Nesse caso tenta uma leitura
  // única sobre o texto inteiro, com confiança menor.
  if (out.length === 0) {
    const flat = raw.filter((l) => !IGNORE.some((re) => re.test(l))).join(" ");
    const sku = findIn(flat, lists.skus, 0.74);
    const colors = findAll(flat, lists.colors);
    const kit = findIn(flat, lists.kits);
    const size = findIn(flat, lists.sizes, 0.85) ?? looseSize(flat, lists.sizes);
    if (sku && (colors.values.length > 0 || kit)) {
      const qty = findQty(flat);
      out.push({
        sku: sku.value,
        colors: colors.values.length > 0 ? colors.values : [kit!.value],
        size: size?.value ?? "",
        qty: qty.qty,
        confidence: {
          sku: Math.min(0.9, sku.conf * baseConf + 0.15),
          colors: Math.min(0.85, (colors.conf || 0.6) * baseConf + 0.15),
          size: Math.min(0.85, (size?.conf ?? 0.35) * baseConf + 0.1),
          qty: qty.conf * 0.8,
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
