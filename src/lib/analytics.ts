import type { Color, Kit, KitColor, Movement, Size, Sku, StockUnit } from "@/lib/erp";

/* ------------------------------------------------------------------ *
 * Distribuição de estoque entre kits (planejamento — não altera nada)
 * ------------------------------------------------------------------ */

export type DistributionResult = {
  /** kit_id -> quantidade de kits que podem ser destinados a ele */
  perKit: Record<string, number>;
  /** color_id -> unidades consumidas pelos kits / mantidas para venda unitária */
  perColor: Record<string, { kits: number; units: number }>;
  totalKits: number;
};

/**
 * Distribui as unidades disponíveis (de um tamanho) entre os kits do SKU.
 * Regras:
 * - um kit só recebe unidades se TODOS os componentes tiverem saldo;
 * - kits impossíveis recebem 0 (nunca é feita divisão simples da cor);
 * - a prioridade segue os pesos de demanda (histórico de saídas).
 */
export function allocateDistribution(input: {
  sizeId: string;
  kits: Kit[];
  kitColors: KitColor[];
  stock: StockUnit[];
  /** kit_id -> peso de demanda (saídas). Ausente = 1 */
  weights?: Record<string, number>;
  /** fração do estoque de cada cor reservada para venda unitária (0..1) */
  unitReserveRatio?: number;
  /** reserva absoluta por cor — tem prioridade sobre `unitReserveRatio` */
  reserveByColor?: Record<string, number>;
}): DistributionResult {
  const { sizeId, kits, kitColors, stock, weights, unitReserveRatio = 0, reserveByColor } = input;

  const colorsOf = new Map<string, string[]>();
  for (const kit of kits) {
    colorsOf.set(
      kit.id,
      kitColors.filter((kc) => kc.kit_id === kit.id).map((kc) => kc.color_id),
    );
  }

  const remaining = new Map<string, number>();
  const reserved = new Map<string, number>();
  const involved = new Set<string>();
  for (const ids of colorsOf.values()) for (const id of ids) involved.add(id);
  for (const colorId of involved) {
    const qty = stock.find((s) => s.color_id === colorId && s.size_id === sizeId)?.qty ?? 0;
    const keep =
      reserveByColor && typeof reserveByColor[colorId] === "number"
        ? Math.min(qty, Math.max(0, Math.floor(reserveByColor[colorId] as number)))
        : Math.floor(qty * Math.min(1, Math.max(0, unitReserveRatio)));
    reserved.set(colorId, keep);
    remaining.set(colorId, Math.max(0, qty - keep));
  }

  const perKit: Record<string, number> = {};
  for (const kit of kits) perKit[kit.id] = 0;

  const feasible = (kitId: string) => {
    const ids = colorsOf.get(kitId) ?? [];
    if (ids.length === 0) return false;
    return ids.every((cid) => (remaining.get(cid) ?? 0) > 0);
  };

  // Alocação gulosa proporcional: a cada rodada o kit com maior
  // (peso / (alocado + 1)) e que ainda é viável recebe 1 unidade.
  let guard = 0;
  for (;;) {
    if (guard++ > 100_000) break;
    let best: string | null = null;
    let bestScore = -1;
    for (const kit of kits) {
      if (!feasible(kit.id)) continue;
      const w = Math.max(0.0001, weights?.[kit.id] ?? 1);
      const score = w / ((perKit[kit.id] ?? 0) + 1);
      if (score > bestScore) {
        bestScore = score;
        best = kit.id;
      }
    }
    if (!best) break;
    perKit[best] = (perKit[best] ?? 0) + 1;
    for (const cid of colorsOf.get(best) ?? []) remaining.set(cid, (remaining.get(cid) ?? 0) - 1);
  }

  const perColor: Record<string, { kits: number; units: number }> = {};
  for (const colorId of involved) {
    const qty = stock.find((s) => s.color_id === colorId && s.size_id === sizeId)?.qty ?? 0;
    const leftover = remaining.get(colorId) ?? 0;
    const keep = reserved.get(colorId) ?? 0;
    perColor[colorId] = { kits: qty - keep - leftover, units: keep + leftover };
  }

  return {
    perKit,
    perColor,
    totalKits: Object.values(perKit).reduce((a, b) => a + b, 0),
  };
}

/* ------------------------------------------------------------------ *
 * Agregações de movimentações
 * ------------------------------------------------------------------ */

export type Scope =
  { kind: "geral" } | { kind: "categoria"; id: string } | { kind: "sku"; id: string };

export function skuIdsInScope(scope: Scope, skus: Sku[]): Set<string> {
  if (scope.kind === "sku") return new Set([scope.id]);
  if (scope.kind === "categoria")
    return new Set(
      skus
        .filter((s) => (scope.id === "none" ? !s.category_id : s.category_id === scope.id))
        .map((s) => s.id),
    );
  return new Set(skus.map((s) => s.id));
}

export type Range = { from: number; to: number };

export function inRange(iso: string, range: Range) {
  const t = new Date(iso).getTime();
  return t >= range.from && t <= range.to;
}

export const DAY = 86_400_000;

export function presetRange(preset: string): Range {
  const now = new Date();
  const end = now.getTime();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  switch (preset) {
    case "hoje":
      return { from: startOfToday.getTime(), to: end };
    case "ontem":
      return { from: startOfToday.getTime() - DAY, to: startOfToday.getTime() - 1 };
    case "7d":
      return { from: end - 7 * DAY, to: end };
    case "30d":
      return { from: end - 30 * DAY, to: end };
    case "mes": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.getTime(), to: end };
    }
    case "mes_anterior": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const to = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return { from, to };
    }
    case "90d":
      return { from: end - 90 * DAY, to: end };
    default:
      return { from: end - 30 * DAY, to: end };
  }
}

export const RANGE_PRESETS = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mes", label: "Este mês" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
] as const;

/** Saídas por kit (peso de demanda) dentro do período. */
export function kitDemand(movements: Movement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movements) {
    if (m.direction !== "out" || m.kind !== "kit" || !m.kit_id) continue;
    out[m.kit_id] = (out[m.kit_id] ?? 0) + m.qty;
  }
  return out;
}

/** Proporção de saídas em kit x unidade de um conjunto de movimentações. */
export function salesMix(movements: Movement[]) {
  let kit = 0;
  let unit = 0;
  for (const m of movements) {
    if (m.direction !== "out") continue;
    if (m.kind === "kit") kit += m.qty;
    else unit += m.qty;
  }
  const total = kit + unit;
  return { kit, unit, total, kitShare: total > 0 ? kit / total : 0 };
}

export function sumBy<T>(rows: T[], value: (r: T) => number) {
  return rows.reduce((a, r) => a + value(r), 0);
}

export function topN<T extends { value: number }>(rows: T[], n: number) {
  return [...rows].sort((a, b) => b.value - a.value).slice(0, n);
}

export function dayKeyLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shortDay(key: string) {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Curva ABC por participação nas saídas. */
export function abcCurve(rows: { id: string; name: string; value: number }[]) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const total = sumBy(sorted, (r) => r.value);
  let acc = 0;
  return sorted.map((r) => {
    acc += r.value;
    const share = total > 0 ? acc / total : 0;
    const classe: "A" | "B" | "C" = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
    return { ...r, share: total > 0 ? r.value / total : 0, acumulado: share, classe };
  });
}

/** Dias desde a última saída de um SKU. */
export function daysSinceLastOut(movements: Movement[], skuId: string): number | null {
  const last = movements
    .filter((m) => !m.undone_at && m.direction === "out" && m.sku_id === skuId)
    .reduce<number | null>((acc, m) => {
      const t = new Date(m.created_at).getTime();
      return acc === null || t > acc ? t : acc;
    }, null);
  if (last === null) return null;
  return Math.floor((Date.now() - last) / DAY);
}

/** Estoque total de um conjunto de SKUs. */
export function stockTotal(stock: StockUnit[], skuIds: Set<string>) {
  return stock.filter((s) => skuIds.has(s.sku_id)).reduce((a, s) => a + s.qty, 0);
}

export type NamedValue = { id: string; name: string; value: number; color?: string };

export function rankColors(movements: Movement[], colors: Color[]): NamedValue[] {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.direction !== "out" || !m.color_id) continue;
    map.set(m.color_id, (map.get(m.color_id) ?? 0) + m.qty);
  }
  return [...map.entries()]
    .map(([id, value]) => {
      const c = colors.find((x) => x.id === id);
      return { id, name: c?.name ?? "Cor", value, color: c?.hex ?? "var(--muted-foreground)" };
    })
    .sort((a, b) => b.value - a.value);
}

export function rankSizes(movements: Movement[], sizes: Size[]): NamedValue[] {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.direction !== "out" || !m.size_id) continue;
    map.set(m.size_id, (map.get(m.size_id) ?? 0) + m.qty);
  }
  return [...map.entries()]
    .map(([id, value]) => ({ id, name: sizes.find((s) => s.id === id)?.name ?? "—", value }))
    .sort((a, b) => b.value - a.value);
}

export function rankKits(movements: Movement[], kits: Kit[]): NamedValue[] {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.direction !== "out" || m.kind !== "kit" || !m.kit_id) continue;
    map.set(m.kit_id, (map.get(m.kit_id) ?? 0) + m.qty);
  }
  return [...map.entries()]
    .map(([id, value]) => ({ id, name: kits.find((k) => k.id === id)?.name ?? "Kit", value }))
    .sort((a, b) => b.value - a.value);
}

export function rankSkus(
  movements: Movement[],
  skus: Sku[],
  direction: "in" | "out",
): NamedValue[] {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.direction !== direction || !m.sku_id) continue;
    map.set(m.sku_id, (map.get(m.sku_id) ?? 0) + m.qty);
  }
  return skus
    .map((s) => ({ id: s.id, name: s.seller_sku, value: map.get(s.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ *
 * Demanda real por cor/tamanho (expandindo os kits em suas cores)
 * ------------------------------------------------------------------ */

type MovementLine = {
  type?: string;
  color_id?: string;
  size_id?: string;
  delta?: number;
};

/** Origem da saída considerada no cálculo. */
export type DemandSource = "todos" | "kit" | "unidade";

function matchesSource(m: Movement, source: DemandSource) {
  if (source === "todos") return true;
  return source === "kit" ? m.kind === "kit" : m.kind === "unit";
}

/**
 * Consumo real de unidades por cor: vendas unitárias + as cores
 * consumidas dentro de cada kit vendido (lidas das linhas do movimento).
 */
export function colorDemand(
  movements: Movement[],
  colors: Color[],
  source: DemandSource = "todos",
): NamedValue[] {
  const map = new Map<string, number>();
  const add = (id: string, qty: number) => map.set(id, (map.get(id) ?? 0) + qty);

  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || !matchesSource(m, source)) continue;
    const lines = (Array.isArray(m.lines) ? m.lines : []) as MovementLine[];
    const unitLines = lines.filter((l) => l.type === "unit" && l.color_id);
    if (unitLines.length > 0) {
      for (const l of unitLines) add(l.color_id as string, Math.abs(Number(l.delta ?? 0)));
    } else if (m.color_id) {
      add(m.color_id, m.qty);
    }
  }

  return [...map.entries()]
    .map(([id, value]) => {
      const c = colors.find((x) => x.id === id);
      return { id, name: c?.name ?? "Cor", value, color: c?.hex ?? "var(--muted-foreground)" };
    })
    .sort((a, b) => b.value - a.value);
}

/** Saídas por tamanho, separando por origem (kit x unidade). */
export function sizeDemand(
  movements: Movement[],
  sizes: Size[],
  source: DemandSource = "todos",
): NamedValue[] {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || !m.size_id || !matchesSource(m, source)) continue;
    map.set(m.size_id, (map.get(m.size_id) ?? 0) + m.qty);
  }
  return [...map.entries()]
    .map(([id, value]) => ({ id, name: sizes.find((s) => s.id === id)?.name ?? "—", value }))
    .sort((a, b) => b.value - a.value);
}

/** Demanda cruzada cor + tamanho (chave `${color_id}|${size_id}`). */
export function colorSizeDemand(movements: Movement[], source: DemandSource = "todos") {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || !matchesSource(m, source)) continue;
    const lines = (Array.isArray(m.lines) ? m.lines : []) as MovementLine[];
    const unitLines = lines.filter((l) => l.type === "unit" && l.color_id && l.size_id);
    if (unitLines.length > 0) {
      for (const l of unitLines) {
        const key = `${l.color_id}|${l.size_id}`;
        map.set(key, (map.get(key) ?? 0) + Math.abs(Number(l.delta ?? 0)));
      }
    } else if (m.color_id && m.size_id) {
      const key = `${m.color_id}|${m.size_id}`;
      map.set(key, (map.get(key) ?? 0) + m.qty);
    }
  }
  return map;
}

/** Média diária de saída de um valor total dentro do período. */
export function dailyRate(total: number, range: Range) {
  const days = Math.max(1, Math.round((range.to - range.from) / DAY));
  return total / days;
}

/** Cobertura em dias: quanto o estoque atual dura no ritmo atual. */
export function coverageDays(qty: number, perDay: number) {
  if (perDay <= 0) return qty > 0 ? Infinity : 0;
  return qty / perDay;
}

/* ------------------------------------------------------------------ *
 * Distribuição entre kits e unidade: prioridade e modo inteligente
 * ------------------------------------------------------------------ */

/** Modo escolhido pelo usuário na tela de Estoque distribuído. */
export type DistributionMode = "kits" | "unidade" | "inteligente";

export type ColorSizePlan = {
  colorId: string;
  sizeId: string;
  /** estoque real da variação */
  total: number;
  /** unidades reservadas para venda avulsa antes de montar kits */
  reserved: number;
  /** unidades efetivamente consumidas pelos kits na distribuição */
  usedByKits: number;
  /** unidades que sobram para venda unitária (reserva + não utilizado) */
  freeUnits: number;
  /** saídas em unidade e em kit no período analisado */
  unitOuts: number;
  kitOuts: number;
  /** recomendação legível */
  priority: "unidade" | "kit" | "equilibrado" | "sem_dados";
  reason: string;
};

/**
 * Quantas unidades reservar para venda avulsa em cada variação.
 * `unidade`  → segue a participação real das vendas unitárias (mínimo 20%).
 * `inteligente` → mesma base, mas explica o porquê e não força mínimo.
 * `kits` → nada é reservado.
 */
export function reservePlan(input: {
  mode: DistributionMode;
  total: number;
  unitOuts: number;
  kitOuts: number;
  /** proporção unitária do SKU inteiro, usada quando a variação não tem histórico */
  fallbackUnitShare: number;
}): { reserved: number; priority: ColorSizePlan["priority"]; reason: string } {
  const { mode, total, unitOuts, kitOuts, fallbackUnitShare } = input;
  const outs = unitOuts + kitOuts;
  const unitShare = outs > 0 ? unitOuts / outs : fallbackUnitShare;
  const pct = Math.round(unitShare * 100);

  if (mode === "kits") {
    return {
      reserved: 0,
      priority: "kit",
      reason: "Modo priorizar kits: todo o estoque disponível é destinado à formação de kits.",
    };
  }

  if (mode === "unidade") {
    const ratio = outs > 0 ? Math.max(0.2, unitShare) : 0.5;
    return {
      reserved: Math.min(total, Math.floor(total * ratio)),
      priority: "unidade",
      reason:
        outs > 0
          ? `Modo priorizar unidade: ${pct}% das saídas foram avulsas — ${Math.round(ratio * 100)}% do estoque fica reservado para venda unitária.`
          : "Modo priorizar unidade: sem histórico desta variação, metade do estoque fica reservada para venda avulsa.",
    };
  }

  // inteligente
  if (outs === 0) {
    return {
      reserved: Math.min(total, Math.floor(total * 0.5)),
      priority: "sem_dados",
      reason:
        "Sem saídas registradas nesta variação no período — distribuição equilibrada (50/50).",
    };
  }
  if (unitShare >= 0.6) {
    return {
      reserved: Math.min(total, Math.floor(total * unitShare)),
      priority: "unidade",
      reason: `${pct}% das saídas ocorreram como unidade (${unitOuts} un. avulsas x ${kitOuts} un. em kits).`,
    };
  }
  if (unitShare <= 0.4) {
    return {
      reserved: Math.min(total, Math.floor(total * unitShare)),
      priority: "kit",
      reason: `${100 - pct}% das saídas ocorreram em kits (${kitOuts} un. em kits x ${unitOuts} un. avulsas).`,
    };
  }
  return {
    reserved: Math.min(total, Math.floor(total * 0.5)),
    priority: "equilibrado",
    reason: `Saídas equilibradas: ${pct}% unidade e ${100 - pct}% kit — distribuição meio a meio.`,
  };
}

/** Saídas por cor+tamanho separando unidade e kit, no período já filtrado. */
export function demandMaps(movements: Movement[]) {
  return {
    unit: colorSizeDemand(movements, "unidade"),
    kit: colorSizeDemand(movements, "kit"),
  };
}

export type SizePlanResult = {
  perKit: Record<string, number>;
  plans: ColorSizePlan[];
  totalKits: number;
};

/**
 * Plano completo de um tamanho de um SKU: quanto vai para kits,
 * quanto sobra para unidade e por quê.
 */
export function planSize(input: {
  sizeId: string;
  kits: Kit[];
  kitColors: KitColor[];
  colors: Color[];
  stock: StockUnit[];
  weights?: Record<string, number>;
  mode: DistributionMode;
  unitDemand: Map<string, number>;
  kitDemand: Map<string, number>;
  fallbackUnitShare: number;
}): SizePlanResult {
  const { sizeId, kits, kitColors, colors, stock, weights, mode } = input;

  const involved = new Set<string>();
  for (const kit of kits) {
    for (const kc of kitColors.filter((k) => k.kit_id === kit.id)) involved.add(kc.color_id);
  }
  // cores do SKU que não estão em kit algum também entram no plano
  for (const c of colors) involved.add(c.id);

  const reserveByColor: Record<string, number> = {};
  const meta = new Map<
    string,
    {
      reserved: number;
      priority: ColorSizePlan["priority"];
      reason: string;
      unitOuts: number;
      kitOuts: number;
      total: number;
    }
  >();

  for (const colorId of involved) {
    const total = stock.find((s) => s.color_id === colorId && s.size_id === sizeId)?.qty ?? 0;
    const key = `${colorId}|${sizeId}`;
    const unitOuts = input.unitDemand.get(key) ?? 0;
    const kitOuts = input.kitDemand.get(key) ?? 0;
    const plan = reservePlan({
      mode,
      total,
      unitOuts,
      kitOuts,
      fallbackUnitShare: input.fallbackUnitShare,
    });
    reserveByColor[colorId] = plan.reserved;
    meta.set(colorId, { ...plan, unitOuts, kitOuts, total });
  }

  const res = allocateDistribution({
    sizeId,
    kits,
    kitColors,
    stock,
    reserveByColor,
    ...(weights ? { weights } : {}),
  });

  const plans: ColorSizePlan[] = [...involved].map((colorId) => {
    const m = meta.get(colorId);
    const split = res.perColor[colorId];
    const total = m?.total ?? 0;
    const usedByKits = split?.kits ?? 0;
    return {
      colorId,
      sizeId,
      total,
      reserved: m?.reserved ?? 0,
      usedByKits,
      freeUnits: Math.max(0, total - usedByKits),
      unitOuts: m?.unitOuts ?? 0,
      kitOuts: m?.kitOuts ?? 0,
      priority: m?.priority ?? "sem_dados",
      reason: m?.reason ?? "",
    };
  });

  return { perKit: res.perKit, plans, totalKits: res.totalKits };
}

/* ------------------------------------------------------------------ *
 * Simulação de formação de kits (nunca altera o estoque real)
 * ------------------------------------------------------------------ */

export type SimulationResult = {
  requested: number;
  maxPossible: number;
  formed: number;
  shortfall: number;
  /** componente que trava a formação, quando não dá para atender o pedido */
  limiting: { colorId: string; available: number } | null;
  components: { colorId: string; before: number; consumed: number; after: number }[];
};

export function simulateKitFormation(input: {
  kitId: string;
  sizeId: string;
  qty: number;
  kitColors: KitColor[];
  stock: StockUnit[];
}): SimulationResult {
  const { kitId, sizeId, qty, kitColors, stock } = input;
  const colorIds = kitColors.filter((kc) => kc.kit_id === kitId).map((kc) => kc.color_id);
  const before = colorIds.map((colorId) => ({
    colorId,
    before: stock.find((s) => s.color_id === colorId && s.size_id === sizeId)?.qty ?? 0,
  }));
  const maxPossible = before.length === 0 ? 0 : Math.min(...before.map((b) => b.before));
  const formed = Math.max(0, Math.min(qty, maxPossible));
  const limitingRow =
    before.length === 0 ? null : before.reduce((a, b) => (b.before < a.before ? b : a));
  return {
    requested: qty,
    maxPossible,
    formed,
    shortfall: Math.max(0, qty - maxPossible),
    limiting:
      qty > maxPossible && limitingRow
        ? { colorId: limitingRow.colorId, available: limitingRow.before }
        : null,
    components: before.map((b) => ({
      colorId: b.colorId,
      before: b.before,
      consumed: formed,
      after: b.before - formed,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Análises por tamanho (kits x unidades) — Painel
 * ------------------------------------------------------------------ */

/** Classificação de desempenho usada nas tabelas de tamanho/produto. */
export type PerfClass = "mais" | "medio" | "menos";

export const PERF_LABEL: Record<PerfClass, string> = {
  mais: "Mais vendido",
  medio: "Venda média",
  menos: "Menos vendido",
};

/**
 * Classifica valores em mais / médio / menos vendidos.
 * Usa a posição no ranking (terços), o que funciona bem mesmo com poucos itens.
 */
export function classifyValues<T extends { value: number }>(
  rows: T[],
): (T & { perf: PerfClass })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const n = sorted.length;
  if (n === 0) return [];
  const cut = Math.max(1, Math.ceil(n / 3));
  return sorted.map((r, i) => ({
    ...r,
    perf: (r.value === 0
      ? "menos"
      : i < cut
        ? "mais"
        : i >= n - cut
          ? "menos"
          : "medio") as PerfClass,
  }));
}

export type SizeCell = { id: string; name: string; value: number; perf: PerfClass };

/** Linha de ranking com abertura por tamanho. */
export type BreakdownRow = {
  id: string;
  name: string;
  value: number;
  color?: string;
  colorIds?: string[];
  skuId?: string | null;
  sizes: SizeCell[];
  perf: PerfClass;
};

function sizeName(sizes: Size[], id: string) {
  return sizes.find((s) => s.id === id)?.name ?? "—";
}

function toSizeCells(map: Map<string, number>, sizes: Size[]): SizeCell[] {
  const rows = [...map.entries()].map(([id, value]) => ({ id, name: sizeName(sizes, id), value }));
  return classifyValues(rows).sort((a, b) => b.value - a.value);
}

/** Kits vendidos no período, com a quantidade em cada tamanho. */
export function kitSizeBreakdown(
  movements: Movement[],
  kits: Kit[],
  sizes: Size[],
): BreakdownRow[] {
  const totals = new Map<string, number>();
  const bySize = new Map<string, Map<string, number>>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || m.kind !== "kit" || !m.kit_id) continue;
    totals.set(m.kit_id, (totals.get(m.kit_id) ?? 0) + m.qty);
    if (!m.size_id) continue;
    const inner = bySize.get(m.kit_id) ?? new Map<string, number>();
    inner.set(m.size_id, (inner.get(m.size_id) ?? 0) + m.qty);
    bySize.set(m.kit_id, inner);
  }
  const rows = [...totals.entries()].map(([id, value]) => {
    const kit = kits.find((k) => k.id === id);
    return {
      id,
      name: kit?.name ?? "Kit",
      skuId: kit?.sku_id ?? null,
      value,
      sizes: toSizeCells(bySize.get(id) ?? new Map(), sizes),
    };
  });
  return classifyValues(rows).sort((a, b) => b.value - a.value);
}

/** Unidades avulsas vendidas no período, agrupadas por SKU e abertas por tamanho. */
export function unitSizeBreakdown(
  movements: Movement[],
  skus: Sku[],
  sizes: Size[],
): BreakdownRow[] {
  const totals = new Map<string, number>();
  const bySize = new Map<string, Map<string, number>>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || m.kind !== "unit" || !m.sku_id) continue;
    totals.set(m.sku_id, (totals.get(m.sku_id) ?? 0) + m.qty);
    if (!m.size_id) continue;
    const inner = bySize.get(m.sku_id) ?? new Map<string, number>();
    inner.set(m.size_id, (inner.get(m.size_id) ?? 0) + m.qty);
    bySize.set(m.sku_id, inner);
  }
  const rows = [...totals.entries()].map(([id, value]) => {
    const sku = skus.find((s) => s.id === id);
    return {
      id,
      name: sku ? `${sku.seller_sku} — ${sku.name}` : "SKU",
      skuId: id,
      value,
      sizes: toSizeCells(bySize.get(id) ?? new Map(), sizes),
    };
  });
  return classifyValues(rows).sort((a, b) => b.value - a.value);
}

/** Tamanhos classificados em mais / médio / menos vendidos, por origem. */
export function sizePerformance(
  movements: Movement[],
  sizes: Size[],
  source: DemandSource = "todos",
): (NamedValue & { perf: PerfClass })[] {
  const map = new Map<string, number>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || !m.size_id) continue;
    if (source !== "todos" && !matchesSource(m, source)) continue;
    map.set(m.size_id, (map.get(m.size_id) ?? 0) + m.qty);
  }
  const rows = [...map.entries()].map(([id, value]) => ({ id, name: sizeName(sizes, id), value }));
  return classifyValues(rows).sort((a, b) => b.value - a.value);
}

/** Cores vendidas por origem, com os tamanhos em que mais saíram. */
export function colorSizeBreakdown(
  movements: Movement[],
  colors: Color[],
  sizes: Size[],
  source: DemandSource = "todos",
): BreakdownRow[] {
  const cross = colorSizeDemand(movements, source);
  const totals = new Map<string, number>();
  const bySize = new Map<string, Map<string, number>>();
  for (const [key, qty] of cross) {
    const [colorId, sizeId] = key.split("|");
    if (!colorId || !sizeId) continue;
    totals.set(colorId, (totals.get(colorId) ?? 0) + qty);
    const inner = bySize.get(colorId) ?? new Map<string, number>();
    inner.set(sizeId, (inner.get(sizeId) ?? 0) + qty);
    bySize.set(colorId, inner);
  }
  const rows = [...totals.entries()].map(([id, value]) => {
    const c = colors.find((x) => x.id === id);
    return {
      id,
      name: c?.name ?? "Cor",
      color: c?.hex ?? "var(--muted-foreground)",
      skuId: c?.sku_id ?? null,
      value,
      sizes: toSizeCells(bySize.get(id) ?? new Map(), sizes),
    };
  });
  return classifyValues(rows).sort((a, b) => b.value - a.value);
}

export type SizeCoverage = {
  id: string;
  name: string;
  /** estoque atual do tamanho */
  stock: number;
  /** saídas no período */
  outs: number;
  /** dias de cobertura no ritmo do período */
  coverage: number;
  status: "ruptura" | "atencao" | "equilibrio" | "parado";
  label: string;
};

/** Estoque x saídas por tamanho, com diagnóstico de risco. */
export function sizeStockVsSales(input: {
  sizes: Size[];
  stock: StockUnit[];
  movements: Movement[];
  range: Range;
  source?: DemandSource;
}): SizeCoverage[] {
  const { sizes, stock, movements, range, source = "todos" } = input;
  const outMap = new Map<string, number>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || !m.size_id) continue;
    if (source !== "todos" && !matchesSource(m, source)) continue;
    outMap.set(m.size_id, (outMap.get(m.size_id) ?? 0) + m.qty);
  }
  const byName = new Map<string, { stock: number; outs: number }>();
  for (const s of sizes) {
    const row = byName.get(s.name) ?? { stock: 0, outs: 0 };
    row.stock += stock.filter((x) => x.size_id === s.id).reduce((a, x) => a + x.qty, 0);
    row.outs += outMap.get(s.id) ?? 0;
    byName.set(s.name, row);
  }
  const days = Math.max(1, Math.round((range.to - range.from) / DAY));
  return [...byName.entries()]
    .map(([name, r]) => {
      const perDay = r.outs / days;
      const coverage = perDay > 0 ? r.stock / perDay : r.stock > 0 ? Infinity : 0;
      const status: SizeCoverage["status"] =
        r.outs > 0 && coverage <= 7
          ? "ruptura"
          : r.outs > 0 && coverage <= 15
            ? "atencao"
            : r.outs === 0 && r.stock > 0
              ? "parado"
              : "equilibrio";
      const label =
        status === "ruptura"
          ? "Risco de ruptura"
          : status === "atencao"
            ? "Estoque baixo para a demanda"
            : status === "parado"
              ? "Estoque parado"
              : "Equilibrado";
      return { id: name, name, stock: r.stock, outs: r.outs, coverage, status, label };
    })
    .sort((a, b) => b.outs - a.outs);
}

/** Produtos em alta e em queda comparando a segunda metade do período com a primeira. */
export function trendingSkus(movements: Movement[], skus: Sku[], range: Range) {
  const mid = range.from + (range.to - range.from) / 2;
  const acc = new Map<string, { prev: number; curr: number }>();
  for (const m of movements) {
    if (m.undone_at || m.direction !== "out" || !m.sku_id) continue;
    const t = new Date(m.created_at).getTime();
    const row = acc.get(m.sku_id) ?? { prev: 0, curr: 0 };
    if (t < mid) row.prev += m.qty;
    else row.curr += m.qty;
    acc.set(m.sku_id, row);
  }
  return [...acc.entries()]
    .map(([id, r]) => {
      const sku = skus.find((s) => s.id === id);
      const delta = r.curr - r.prev;
      const pct = r.prev > 0 ? (delta / r.prev) * 100 : r.curr > 0 ? 100 : 0;
      return { id, name: sku?.seller_sku ?? "SKU", prev: r.prev, curr: r.curr, delta, pct };
    })
    .sort((a, b) => b.delta - a.delta);
}
