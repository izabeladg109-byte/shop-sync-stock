import { deburr } from "@/lib/color-names";
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
const exact = (a: string, b: string) =>
  deburr(a).trim().toUpperCase().replace(/\s+/g, " ") ===
  deburr(b).trim().toUpperCase().replace(/\s+/g, " ");

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
  const skuMatches = skus.filter((s) => exact(line.sku, s.seller_sku));
  if (skuMatches.length !== 1 || line.confidence.sku < 0.7) return null;
  const sku = skuMatches[0];
  if (!sku) return null;
  const skuId = sku.id;

  // ---- Tamanho ---------------------------------------------------------
  const skuSizes = sizes.filter((s) => s.sku_id === skuId);
  const sizeMatches = skuSizes.filter((s) => exact(line.size, s.name));
  const size = sizeMatches.length === 1 ? sizeMatches[0] : null;
  if (!size || line.confidence.size < 0.7) return null;

  // ---- Cores lidas -> cores cadastradas do SKU -------------------------
  const skuColors = colors.filter((c) => c.sku_id === skuId);
  const skuKits = kits.filter((k) => k.sku_id === skuId);

  const parts = line.colors.flatMap((c) => splitColorText(c));
  const matched: { color: Color; score: number }[] = [];
  for (const name of parts) {
    const hits = skuColors.filter((color) => exact(name, color.name));
    const hit = hits.length === 1 ? hits[0] : null;
    if (hit && !matched.some((m) => m.color.id === hit.id)) {
      matched.push({ color: hit, score: 0.98 });
    }
  }
  const matchedIds = matched.map((m) => m.color.id);
  const colorScore = matched.length ? matched.reduce((a, m) => a + m.score, 0) / matched.length : 0;

  const base = {
    skuId,
    sizeId: size.id,
    qty: line.qty > 0 ? Math.floor(line.qty) : 1,
    matchedColorIds: matchedIds,
    raw: `${line.sku} · ${line.colors.join(" + ")} · ${line.size} x${line.qty}`,
    confBase: {
      sku: Math.min(line.confidence.sku, 0.98),
      size: Math.min(line.confidence.size, 0.98),
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
      return make(
        "kit",
        "",
        colorScore * 0.5,
        "Mais de um kit com a mesma composição",
        true,
        exact.map((c) => c.kit.id),
      );
    }

    // nenhum kit exato: kits que contêm todas as cores lidas
    const supersets = compositions.filter((c) => matchedIds.every((id) => c.ids.includes(id)));
    if (supersets.length === 1) {
      return make(
        "kit",
        "",
        colorScore * 0.6,
        "A etiqueta não trouxe a composição completa do kit",
        true,
        supersets.map((c) => c.kit.id),
      );
    }
    if (supersets.length > 1) {
      return make(
        "kit",
        "",
        colorScore * 0.5,
        "Várias composições possíveis para estas cores",
        true,
        supersets.map((c) => c.kit.id),
      );
    }
    // cores lidas não formam nenhum kit cadastrado
    return make(
      "kit",
      "",
      colorScore * 0.4,
      "Nenhum kit cadastrado com estas cores",
      true,
      compositions.map((c) => c.kit.id),
    );
  }

  if (matched[0]) {
    return make("unit", matched[0].color.id, matched[0].score, "Cor única reconhecida");
  }

  return make("unit", "", 0.2, "Cor não reconhecida no cadastro", true, []);
}
