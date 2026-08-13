import type { ParsedLine } from "@/lib/ocr.functions";

/**
 * Interpretação determinística do texto lido pelo OCR local.
 *
 * Não usa IA: casa o texto com o que já existe no cadastro (SKUs, cores,
 * tamanhos e kits). Dados pessoais e logísticos são descartados.
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
  /pix/i,
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
  ];
  for (const p of patterns) {
    const m = line.match(p);
    const n = Number(m?.[1]);
    if (Number.isFinite(n) && n > 0 && n < 500) return { qty: n, conf: 0.92 };
  }
  return { qty: 1, conf: 0.6 };
}

/** Procura o item da lista que aparece dentro da linha (maior primeiro). */
function findIn(line: string, options: string[]): { value: string; conf: number } | null {
  const target = norm(line);
  const sorted = [...options].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const opt of sorted) {
    const o = norm(opt);
    if (o.length < 2) continue;
    if (target.includes(o)) return { value: opt, conf: o.length >= 4 ? 0.94 : 0.8 };
  }
  return null;
}

function findAll(line: string, options: string[]): { values: string[]; conf: number } {
  const target = norm(line);
  const found: { value: string; at: number }[] = [];
  const used: [number, number][] = [];
  const sorted = [...options].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const opt of sorted) {
    const o = norm(opt);
    if (o.length < 3) continue;
    const at = target.indexOf(o);
    if (at < 0) continue;
    if (used.some(([s, e]) => at < e && at + o.length > s)) continue;
    used.push([at, at + o.length]);
    found.push({ value: opt, at });
  }
  found.sort((a, b) => a.at - b.at);
  return { values: found.map((f) => f.value), conf: found.length ? 0.9 : 0 };
}

/** Tamanho isolado ("P", "M", "G", "42") quando não bate com a lista. */
function looseSize(line: string, sizes: string[]): { value: string; conf: number } | null {
  const t = norm(line);
  for (const s of sizes) {
    const o = norm(s);
    if (new RegExp(`(^|[^A-Z0-9])${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(t)) {
      return { value: s, conf: 0.75 };
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

  for (const original of raw) {
    const line = original.trim();
    if (line.length < 3) continue;
    if (IGNORE.some((re) => re.test(line))) continue;

    const sku = findIn(line, lists.skus);
    const colors = findAll(line, lists.colors);
    const kit = findIn(line, lists.kits);
    const size = findIn(line, lists.sizes) ?? looseSize(line, lists.sizes);
    const qty = findQty(line);

    if (sku) lastSku = sku.value;
    const skuValue = sku?.value ?? lastSku;
    if (!skuValue) continue;

    // precisa ter pelo menos cor ou kit para virar item
    if (colors.values.length === 0 && !kit) continue;

    out.push({
      sku: skuValue,
      colors: colors.values.length > 0 ? colors.values : kit ? [kit.value] : [],
      size: size?.value ?? "",
      qty: qty.qty,
      confidence: {
        sku: Math.min(0.97, (sku?.conf ?? 0.6) * baseConf + 0.25),
        colors: Math.min(0.97, (colors.conf || kit?.conf || 0.5) * baseConf + 0.25),
        size: Math.min(0.97, (size?.conf ?? 0.4) * baseConf + 0.2),
        qty: qty.conf,
      },
    });
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
