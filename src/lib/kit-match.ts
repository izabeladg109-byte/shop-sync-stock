import { bestMatch, similarity } from "@/lib/color-names";
import { kitColorsOf, type Color, type Kit, type KitColor, type Size, type Sku } from "@/lib/erp";

/**
 * Identificação de itens lidos na etiqueta.
 *
 * Regra central: um kit NUNCA é escolhido por semelhança de texto do nome.
 * A escolha é feita pela composição real de cores cadastrada no banco
 * (`kit_colors`). Se mais de um kit do mesmo SKU servir para as cores lidas,
 * o item volta marcado como ambíguo para o operador decidir.
 */

export type OcrLine = {
  sku: string;
  colors: string[];
  size: string;
  qty: number;
  confidence: { sku: number; colors: number; size: number; qty: number };
};

export type Resolved = {
  skuId: string;
  kind: "unit" | "kit";
  /** vazio quando a leitura ficou ambígua */
  refId: string;
  sizeId: string;
  qty: number;
  conf: { sku: number; ref: number; size: number; qty: number };
  raw: string;
  /** kits candidatos quando não deu para decidir com segurança */
  ambiguous: boolean;
  candidates: string[];
  /** cores efetivamente reconhecidas no cadastro do SKU */
  matchedColorIds: string[];
  reason: string;
};

export type Catalog = {
  skus: Sku[];
  colors: Color[];
  sizes: Size[];
  kits: Kit[];
  kitColors: KitColor[];
};

const sig = (ids: string[]) => [...new Set(ids)].sort().join("|");

/** Divide textos como "PRETO + MARROM" ou "KIT PRETO/BEGE" em partes. */
export function splitColorText(text: string): string[] {
  return text
    .replace(/\bkits?\b/gi, " ")
    .split(/\s*(?:\+|\/|&|,|\||\be\b|\bcom\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Resolve uma linha lida em um item concreto do cadastro.
 * Retorna `null` só quando nem o SKU nem o tamanho existem no cadastro.
 */
export function resolveLine(line: OcrLine, cat: Catalog): Resolved | null {
  const { skus, colors, sizes, kits, kitColors } = cat;
  if (skus.length === 0) return null;

  // ---- SKU -------------------------------------------------------------
  const bySku = line.sku ? bestMatch(line.sku, skus, (s) => s.seller_sku) : null;
  const byName = line.sku ? bestMatch(line.sku, skus, (s) => s.name) : null;
  const skuHit = bySku && (!byName || bySku.score >= byName.score) ? bySku : byName;
  if (!skuHit || skuHit.score < 0.4) return null;
  const skuId = skuHit.item.id;

  // ---- Tamanho ---------------------------------------------------------
  const skuSizes = sizes.filter((s) => s.sku_id === skuId);
  const sizeHit = line.size ? bestMatch(line.size, skuSizes, (s) => s.name) : null;
  const size = sizeHit?.item ?? skuSizes[0];
  if (!size) return null;

  // ---- Cores lidas -> cores cadastradas do SKU -------------------------
  const skuColors = colors.filter((c) => c.sku_id === skuId);
  const skuKits = kits.filter((k) => k.sku_id === skuId);

  const parts = line.colors.flatMap((c) => splitColorText(c));
  const matched: { color: Color; score: number }[] = [];
  for (const name of parts) {
    const hit = bestMatch(name, skuColors, (c) => c.name);
    if (hit && hit.score >= 0.45 && !matched.some((m) => m.color.id === hit.item.id)) {
      matched.push({ color: hit.item, score: hit.score });
    }
  }
  const matchedIds = matched.map((m) => m.color.id);
  const colorScore = matched.length
    ? matched.reduce((a, m) => a + m.score, 0) / matched.length
    : 0;

  const base = {
    skuId,
    sizeId: size.id,
    qty: line.qty > 0 ? Math.floor(line.qty) : 1,
    matchedColorIds: matchedIds,
    raw: `${line.sku} · ${line.colors.join(" + ")} · ${line.size} x${line.qty}`,
    confBase: {
      sku: Math.min(line.confidence.sku, skuHit.score),
      size: Math.min(line.confidence.size, sizeHit?.score ?? 0.55),
      qty: line.confidence.qty,
    },
  };

  const make = (
    kind: "unit" | "kit",
    refId: string,
    refScore: number,
    reason: string,
    ambiguous = false,
    candidates: string[] = [],
  ): Resolved => ({
    skuId: base.skuId,
    kind,
    refId,
    sizeId: base.sizeId,
    qty: base.qty,
    conf: { ...base.confBase, ref: Math.min(line.confidence.colors || 0.9, refScore) },
    raw: base.raw,
    ambiguous,
    candidates,
    matchedColorIds: base.matchedColorIds,
    reason,
  });

  // ---- Composições cadastradas ----------------------------------------
  const compositions = skuKits.map((k) => ({
    kit: k,
    ids: kitColorsOf(k.id, kitColors, colors).map((c) => c.id),
  }));

  if (matchedIds.length >= 2) {
    const wanted = sig(matchedIds);
    const exact = compositions.filter((c) => sig(c.ids) === wanted);
    if (exact.length === 1) {
      return make("kit", exact[0]!.kit.id, colorScore, "Composição idêntica ao kit cadastrado");
    }
    if (exact.length > 1) {
      return make("kit", "", colorScore * 0.5, "Mais de um kit com a mesma composição", true,
        exact.map((c) => c.kit.id));
    }

    // nenhum kit exato: kits que contêm todas as cores lidas
    const supersets = compositions.filter((c) => matchedIds.every((id) => c.ids.includes(id)));
    if (supersets.length === 1) {
      return make("kit", supersets[0]!.kit.id, colorScore * 0.8,
        "Kit que contém todas as cores lidas");
    }
    if (supersets.length > 1) {
      return make("kit", "", colorScore * 0.5,
        "Várias composições possíveis para estas cores", true, supersets.map((c) => c.kit.id));
    }
    // cores lidas não formam nenhum kit cadastrado
    return make("kit", "", colorScore * 0.4,
      "Nenhum kit cadastrado com estas cores", true, compositions.map((c) => c.kit.id));
  }

  // ---- Uma cor só: pode ser unidade ou kit citado pelo nome ------------
  const joined = line.colors.join(" ").trim();
  if (joined && skuKits.length > 0 && /kit/i.test(joined)) {
    const scored = skuKits
      .map((k) => ({ kit: k, score: similarity(joined, k.name) }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    if (top && top.score >= 0.7 && (!second || top.score - second.score >= 0.12)) {
      return make("kit", top.kit.id, top.score, "Nome do kit reconhecido na etiqueta");
    }
    if (top) {
      return make("kit", "", 0.4, "Kit citado, mas sem composição clara", true,
        scored.filter((s) => s.score >= 0.5).map((s) => s.kit.id));
    }
  }

  if (matched[0]) {
    return make("unit", matched[0].color.id, matched[0].score, "Cor única reconhecida");
  }

  return make("unit", "", 0.2, "Cor não reconhecida no cadastro", true, []);
}
