import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  alertLevel,
  computeKitAvailable,
  stockOf,
  useCategories,
  useColors,
  useKitColors,
  useKits,
  useMovements,
  useSizes,
  useSkus,
  useStockUnits,
  useUserPrefs,
} from "@/lib/erp";
import {
  abcCurve,
  colorDemand,
  colorSizeBreakdown,
  PERF_LABEL,
  type PerfClass,
  kitSizeBreakdown,
  sizePerformance,
  sizeStockVsSales,
  trendingSkus,
  unitSizeBreakdown,
  DAY,
  dayKeyLocal,
  daysSinceLastOut,
  type DemandSource,
  inRange,
  rankKits,
  rankSkus,
  salesMix,
  shortDay,
  sizeDemand,
  skuIdsInScope,
  sumBy,
  topN,
  WEEKDAYS,
} from "@/lib/analytics";
import {
  BreakdownList,
  ChartBox,
  CoverageTable,
  DataList,
  Tabs,
  Kpi,
  type ListRow,
  Panel,
  RankPanel,
  SectionTitle,
  SizeTable,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/components/dash";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { PlatformFilter } from "@/components/platform-filter";
import { useAllocations, usePlatformFilter, usePlatforms, viewStock } from "@/lib/platforms";
import { KitSwatches } from "@/components/kit-swatches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadPdf } from "@/lib/export-utils";
import { toast } from "sonner";
import { Download } from "lucide-react";

/** Todos os gráficos ocultáveis do painel — o título é reutilizado na área de restauração. */
const CHART_TITLES: Record<string, string> = {
  cat: "Distribuição por categoria",
  "size-stock": "Estoque por tamanho",
  "color-stock": "Estoque por cor",
  "top-stock": "Top 10 em estoque",
  "near-zero": "Próximos de zerar",
  zerados: "Estoque zerado",
  "heatmap-cs": "Mapa de calor: cor x tamanho",
  "top-skus": "Mais vendidos",
  "bottom-skus": "Menos vendidos",
  trend: "Entradas x saídas por dia",
  mix: "Kit x unidade",
  "kit-out": "Kits mais vendidos",
  "kit-sizes": "Kits vendidos por tamanho",
  "unit-sizes": "Unidades vendidas por tamanho",
  "size-perf-all": "Tamanhos: mais, médio e menos vendidos",
  "size-perf-kit": "Tamanhos mais vendidos em kits",
  "size-perf-unit": "Tamanhos mais vendidos em unidades",
  "size-compare": "Tamanhos: kit x unidade",
  "color-kit": "Cores mais vendidas em kits",
  "color-unit": "Cores mais vendidas em unidades",
  coverage: "Estoque x vendas por tamanho",
  "trend-up": "Produtos em alta",
  "trend-down": "Produtos em queda",
  stopped: "Estoque parado",
  "kit-potential": "Kits possíveis com o estoque atual",
  "color-out": "Cores mais vendidas",
  "color-low": "Cores paradas",
  "size-out": "Tamanhos mais vendidos",
  "size-cmp": "Estoque x saídas por tamanho",
  hour: "Saídas por hora do dia",
  weekday: "Saídas por dia da semana",
  dayhour: "Mapa de calor: dia x hora",
  "abc-share": "Participação por classe",
  "abc-list": "Classificação por SKU",
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel de estoque e vendas — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Painel completo: estoque por categoria e tamanho, mais e menos vendidos, horários de venda, tendências, giro, curva ABC e alertas.",
      },
      { property: "og:title", content: "Painel de estoque e vendas" },
      {
        property: "og:description",
        content: "Indicadores, gráficos e listas com filtros por categoria, SKU, data e hora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const SOURCE_OPTIONS: { value: DemandSource; label: string }[] = [
  { value: "todos", label: "Todas as saídas" },
  { value: "kit", label: "Somente kits" },
  { value: "unidade", label: "Somente unidades" },
];

function SourceSwitch({
  value,
  onChange,
}: {
  value: DemandSource;
  onChange: (v: DemandSource) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {SOURCE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Dashboard() {
  const { data: categories = [] } = useCategories();
  const { data: skus = [] } = useSkus();
  const { data: colors = [] } = useColors();
  const { data: sizes = [] } = useSizes();
  const { data: kits = [] } = useKits();
  const { data: kitColors = [] } = useKitColors();
  const { data: rawStock = [] } = useStockUnits();
  const { data: allMovements = [] } = useMovements(1000);
  const { data: allocations = [] } = useAllocations();
  const { data: platformList = [] } = usePlatforms();
  const { platformId, isAll: allPlatforms } = usePlatformFilter();
  const platformName = allPlatforms
    ? "Saldo geral não atribuído"
    : (platformList.find((p) => p.id === platformId)?.name ?? "Plataforma");

  /** Todo o painel respeita o recorte de plataforma (estoque e movimentações). */
  const stock = useMemo(
    () => viewStock(rawStock, allocations, platformId),
    [rawStock, allocations, platformId],
  );
  const movements = useMemo(
    () => (allPlatforms ? allMovements : allMovements.filter((m) => m.platform_id === platformId)),
    [allMovements, allPlatforms, platformId],
  );

  const { state, setState, range } = useFilters("30d");
  const scopeIds = useMemo(() => skuIdsInScope(state.scope, skus), [state.scope, skus]);
  const isSkuScope = state.scope.kind === "sku";
  const currentSku = useMemo(
    () => (isSkuScope ? skus.find((s) => s.id === (state.scope as { id: string }).id) : undefined),
    [isSkuScope, skus, state.scope],
  );

  /** Filtro global do painel: todas as saídas, somente kits ou somente unidades. */
  const [salesSource, setSalesSource] = useState<DemandSource>("todos");
  const [salesTab, setSalesTab] = useState("geral");

  /* --- Gráficos ocultos (preferência por usuário) --- */
  const { prefs, save } = useUserPrefs();
  const hidden = useMemo(() => new Set(prefs.hidden_charts), [prefs.hidden_charts]);
  const hide = (id: string) =>
    save.mutate({ hidden_charts: [...new Set([...prefs.hidden_charts, id])] });
  const unhide = (id: string) =>
    save.mutate({ hidden_charts: prefs.hidden_charts.filter((x) => x !== id) });
  /** Props padrão de um painel ocultável. */
  const box = (id: string) => ({ onHide: () => hide(id) });

  /** Prefixo com o SKU quando a análise é geral — nenhum gráfico fica anônimo. */
  const skuTag = (skuId: string | null | undefined) => {
    if (isSkuScope || !skuId) return "";
    const s = skus.find((x) => x.id === skuId);
    return s ? `${s.seller_sku} · ` : "";
  };

  const scopeSkus = useMemo(() => skus.filter((s) => scopeIds.has(s.id)), [skus, scopeIds]);
  const scopeColors = useMemo(
    () => colors.filter((c) => scopeIds.has(c.sku_id)),
    [colors, scopeIds],
  );
  const scopeSizes = useMemo(() => sizes.filter((s) => scopeIds.has(s.sku_id)), [sizes, scopeIds]);
  const scopeKits = useMemo(() => kits.filter((k) => scopeIds.has(k.sku_id)), [kits, scopeIds]);
  const scopeStock = useMemo(() => stock.filter((s) => scopeIds.has(s.sku_id)), [stock, scopeIds]);

  /** Movimentações válidas, dentro do escopo e do período. */
  const periodMovements = useMemo(
    () =>
      movements.filter(
        (m) =>
          !m.undone_at &&
          m.sku_id !== null &&
          scopeIds.has(m.sku_id) &&
          inRange(m.created_at, range),
      ),
    [movements, scopeIds, range],
  );
  const outs = useMemo(
    () => periodMovements.filter((m) => m.direction === "out"),
    [periodMovements],
  );
  const ins = useMemo(() => periodMovements.filter((m) => m.direction === "in"), [periodMovements]);
  /** Saídas respeitando o filtro global kit x unidade. */
  const srcOuts = useMemo(
    () =>
      salesSource === "todos"
        ? outs
        : outs.filter((m) => (salesSource === "kit" ? m.kind === "kit" : m.kind === "unit")),
    [outs, salesSource],
  );

  const totalUnits = sumBy(scopeStock, (s) => s.qty);
  const totalOut = sumBy(outs, (m) => m.qty);
  const totalIn = sumBy(ins, (m) => m.qty);
  const turnover = totalUnits > 0 ? (totalOut / totalUnits) * 100 : 0;
  const mix = useMemo(() => salesMix(periodMovements), [periodMovements]);
  const dias = Math.max(1, Math.round((range.to - range.from) / DAY));
  const mediaDia = totalOut / dias;

  /* ---------------- Estoque ---------------- */

  const stockByCategory = useMemo(() => {
    const buckets = [
      ...categories.map((c) => ({ id: c.id, name: c.name })),
      { id: "none", name: "Sem categoria" },
    ];
    return buckets
      .map((b) => {
        const ids = new Set(
          scopeSkus
            .filter((s) => (b.id === "none" ? !s.category_id : s.category_id === b.id))
            .map((s) => s.id),
        );
        return {
          id: b.id,
          name: b.name,
          value: sumBy(
            scopeStock.filter((s) => ids.has(s.sku_id)),
            (s) => s.qty,
          ),
        };
      })
      .filter((r) => r.value > 0);
  }, [categories, scopeSkus, scopeStock]);

  const stockBySize = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scopeStock) {
      const name = sizes.find((x) => x.id === s.size_id)?.name ?? "—";
      map.set(name, (map.get(name) ?? 0) + s.qty);
    }
    return [...map.entries()].map(([name, value]) => ({ id: name, name, value }));
  }, [scopeStock, sizes]);

  /**
   * Estoque por tamanho identificando o SKU de origem — dois SKUs podem ter
   * o mesmo tamanho "P" e o gráfico precisa dizer de onde veio cada número.
   */
  const stockBySizeDetail = useMemo(
    () =>
      scopeSizes
        .map((s) => ({
          id: s.id,
          name: `${skuTag(s.sku_id)}${s.name}`,
          value: sumBy(
            scopeStock.filter((x) => x.size_id === s.id),
            (x) => x.qty,
          ),
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeSizes, scopeStock, isSkuScope, skus],
  );

  /** Estoque por cor, sempre identificando o SKU quando a análise é geral. */
  const stockByColor = useMemo(
    () =>
      scopeColors
        .map((c) => ({
          id: c.id,
          name: `${skuTag(c.sku_id)}${c.name}`,
          color: c.hex,
          value: sumBy(
            scopeStock.filter((s) => s.color_id === c.id),
            (s) => s.qty,
          ),
        }))
        .sort((a, b) => b.value - a.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeColors, scopeStock, isSkuScope, skus],
  );

  /** Heatmap cor x tamanho (apenas quando um SKU é selecionado). */
  const heatmap = useMemo(() => {
    if (!isSkuScope) return null;
    if (scopeColors.length === 0 || scopeSizes.length === 0) return null;
    const rows = scopeColors.map((c) => ({
      color: c,
      cells: scopeSizes.map((s) => ({ size: s, qty: stockOf(stock, c.id, s.id) })),
    }));
    const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.qty)));
    return { sizes: scopeSizes, rows, max };
  }, [isSkuScope, scopeColors, scopeSizes, stock]);

  const topStock = useMemo(
    () =>
      topN(
        scopeSkus.map((s) => ({
          id: s.id,
          name: s.seller_sku,
          value: sumBy(
            scopeStock.filter((x) => x.sku_id === s.id),
            (x) => x.qty,
          ),
        })),
        10,
      ),
    [scopeSkus, scopeStock],
  );

  const nearZero = useMemo(
    () =>
      scopeColors
        .flatMap((c) =>
          scopeSizes
            .filter((s) => s.sku_id === c.sku_id)
            .map((s) => {
              const sku = skus.find((x) => x.id === c.sku_id);
              return {
                id: `${c.id}-${s.id}`,
                name: isSkuScope
                  ? `${c.name} · ${s.name}`
                  : `${sku?.seller_sku ?? ""} · ${c.name} · ${s.name}`,
                value: stockOf(stock, c.id, s.id),
                color: c.hex,
              };
            }),
        )
        .filter((r) => alertLevel(r.value) !== "ok")
        .sort((a, b) => a.value - b.value),
    [scopeColors, scopeSizes, stock, skus, isSkuScope],
  );

  /** Variações realmente zeradas — separadas de "próximas a zerar". */
  const zerados = useMemo(() => nearZero.filter((r) => r.value === 0), [nearZero]);
  /** Próximas a zerar: ainda têm estoque, mas em nível crítico ou baixo. */
  const proximasZerar = useMemo(() => nearZero.filter((r) => r.value > 0), [nearZero]);

  /* ---------------- Vendas ---------------- */

  const topSkus = useMemo(
    () => topN(rankSkus(srcOuts, scopeSkus, "out"), 10).filter((r) => r.value > 0),
    [srcOuts, scopeSkus],
  );
  const bottomSkus = useMemo(
    () =>
      rankSkus(srcOuts, scopeSkus, "out")
        .slice()
        .sort((a, b) => a.value - b.value)
        .slice(0, 10),
    [srcOuts, scopeSkus],
  );
  const semSaida = useMemo(
    () => rankSkus(srcOuts, scopeSkus, "out").filter((r) => r.value === 0),
    [srcOuts, scopeSkus],
  );

  const bySizeOut = useMemo(() => sizeDemand(outs, sizes, salesSource), [outs, sizes, salesSource]);
  const byColorOut = useMemo(
    () => colorDemand(outs, colors, salesSource),
    [outs, colors, salesSource],
  );

  /* --- Saídas separadas: kits, unidades, tamanhos e cores --- */
  const kitBreakdown = useMemo(() => kitSizeBreakdown(outs, kits, sizes), [outs, kits, sizes]);
  const unitBreakdown = useMemo(
    () => unitSizeBreakdown(outs, scopeSkus, sizes),
    [outs, scopeSkus, sizes],
  );
  const sizePerfAll = useMemo(() => sizePerformance(outs, sizes, "todos"), [outs, sizes]);
  const sizePerfKit = useMemo(() => sizePerformance(outs, sizes, "kit"), [outs, sizes]);
  const sizePerfUnit = useMemo(() => sizePerformance(outs, sizes, "unidade"), [outs, sizes]);
  const colorKit = useMemo(
    () => colorSizeBreakdown(outs, colors, sizes, "kit"),
    [outs, colors, sizes],
  );
  const colorUnit = useMemo(
    () => colorSizeBreakdown(outs, colors, sizes, "unidade"),
    [outs, colors, sizes],
  );
  const colorAll = useMemo(
    () => colorSizeBreakdown(outs, colors, sizes, "todos"),
    [outs, colors, sizes],
  );
  const skuBreakdown = useMemo(
    () =>
      unitSizeBreakdown(
        outs.map((m) => ({ ...m, kind: "unit" as const })),
        scopeSkus,
        sizes,
      ),
    [outs, scopeSkus, sizes],
  );

  /** Comparativo kit x unidade por tamanho (mesmo nome de tamanho é somado). */
  const sizeCompare = useMemo(() => {
    const map = new Map<string, { name: string; kit: number; unidade: number }>();
    for (const m of outs) {
      if (!m.size_id) continue;
      const name = sizes.find((s) => s.id === m.size_id)?.name ?? "—";
      const row = map.get(name) ?? { name, kit: 0, unidade: 0 };
      if (m.kind === "kit") row.kit += m.qty;
      else row.unidade += m.qty;
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.kit + b.unidade - (a.kit + a.unidade));
  }, [outs, sizes]);

  const coverage = useMemo(
    () =>
      sizeStockVsSales({
        sizes: scopeSizes,
        stock: scopeStock,
        movements: outs,
        range,
        source: salesSource,
      }),
    [scopeSizes, scopeStock, outs, range, salesSource],
  );

  const trending = useMemo(() => trendingSkus(outs, scopeSkus, range), [outs, scopeSkus, range]);
  const emAlta = useMemo(
    () =>
      trending
        .filter((r) => r.delta > 0)
        .map((r) => ({
          id: r.id,
          name: r.name,
          value: r.curr,
          extra: `+${r.delta} un. (${r.pct.toFixed(0)}%)`,
        })),
    [trending],
  );
  const emQueda = useMemo(
    () =>
      [...trending]
        .filter((r) => r.delta < 0)
        .sort((a, b) => a.delta - b.delta)
        .map((r) => ({
          id: r.id,
          name: r.name,
          value: r.curr,
          extra: `${r.delta} un. (${r.pct.toFixed(0)}%)`,
        })),
    [trending],
  );
  const paradosList = useMemo<ListRow[]>(() => {
    const rows = scopeSkus.map((s) => ({
      sku: s,
      days: daysSinceLastOut(movements, s.id),
      qty: sumBy(
        scopeStock.filter((x) => x.sku_id === s.id),
        (x) => x.qty,
      ),
    }));
    return rows
      .filter((r) => (r.days === null || r.days > 30) && r.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .map((r) => ({
        id: r.sku.id,
        name: r.sku.seller_sku,
        value: r.qty,
        extra: r.days === null ? "nunca teve saída" : `${r.days} dias sem sair`,
      }));
  }, [scopeSkus, scopeStock, movements]);
  const byKitOut = useMemo<ListRow[]>(
    () =>
      rankKits(outs, kits).map((r) => {
        const label = `${skuTag(kits.find((k) => k.id === r.id)?.sku_id)}${r.name}`;
        return {
          ...r,
          name: label,
          node: <KitSwatches kitId={r.id} kitColors={kitColors} colors={colors} name={label} />,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outs, kits, kitColors, colors, isSkuScope, skus],
  );

  /** Kits que podem ser montados agora (potencial), com bolinhas de cor. */
  const kitPotential = useMemo<ListRow[]>(
    () =>
      scopeKits
        .map((k) => {
          const value = sizes
            .filter((s) => s.sku_id === k.sku_id)
            .reduce((a, s) => a + computeKitAvailable(k.id, s.id, kitColors, stock), 0);
          const label = `${skuTag(k.sku_id)}${k.name}`;
          return {
            id: k.id,
            name: label,
            value,
            node: <KitSwatches kitId={k.id} kitColors={kitColors} colors={colors} name={label} />,
          };
        })
        .sort((a, b) => b.value - a.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKits, sizes, kitColors, stock, colors, isSkuScope, skus],
  );

  const estoqueParado = useMemo(() => {
    const paradoUnidades = sumBy(
      scopeSkus.filter((s) => {
        const d = daysSinceLastOut(movements, s.id);
        return d === null || d > 30;
      }),
      (s) =>
        sumBy(
          scopeStock.filter((x) => x.sku_id === s.id),
          (x) => x.qty,
        ),
    );
    return totalUnits > 0 ? (paradoUnidades / totalUnits) * 100 : 0;
  }, [scopeSkus, scopeStock, movements, totalUnits]);

  /* ---------------- Horários e tendências ---------------- */

  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ id: String(h), name: `${h}h`, value: 0 }));
    for (const m of outs) {
      const h = new Date(m.created_at).getHours();
      const row = arr[h];
      if (row) row.value += m.qty;
    }
    return arr;
  }, [outs]);

  const byWeekday = useMemo(() => {
    const arr = WEEKDAYS.map((name, i) => ({ id: String(i), name, value: 0 }));
    for (const m of outs) {
      const row = arr[new Date(m.created_at).getDay()];
      if (row) row.value += m.qty;
    }
    return arr;
  }, [outs]);

  const dayHourHeat = useMemo(() => {
    const grid = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
    let max = 0;
    for (const m of outs) {
      const d = new Date(m.created_at);
      const row = grid[d.getDay()];
      if (!row) continue;
      row[d.getHours()] = (row[d.getHours()] ?? 0) + m.qty;
      max = Math.max(max, row[d.getHours()] ?? 0);
    }
    return { grid, max: Math.max(1, max) };
  }, [outs]);

  const trend = useMemo(() => {
    const map = new Map<string, { day: string; entradas: number; saidas: number }>();
    const start = new Date(range.from);
    const end = new Date(range.to);
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
      const key = dayKeyLocal(new Date(t).toISOString());
      map.set(key, { day: key, entradas: 0, saidas: 0 });
    }
    for (const m of periodMovements) {
      const row = map.get(dayKeyLocal(m.created_at));
      if (!row) continue;
      if (m.direction === "in") row.entradas += m.qty;
      else row.saidas += m.qty;
    }
    return [...map.values()].map((r) => ({ ...r, label: shortDay(r.day) }));
  }, [periodMovements, range]);

  /* ---------------- ABC e alertas ---------------- */

  const abc = useMemo(
    () => abcCurve(rankSkus(srcOuts, scopeSkus, "out").filter((r) => r.value > 0)),
    [srcOuts, scopeSkus],
  );
  const abcResumo = useMemo(() => {
    const g = { A: 0, B: 0, C: 0 };
    for (const r of abc) g[r.classe] += r.value;
    return (Object.entries(g) as ["A" | "B" | "C", number][])
      .map(([name, value]) => ({ id: name, name: `Classe ${name}`, value }))
      .filter((r) => r.value > 0);
  }, [abc]);

  const semDados = periodMovements.length === 0;

  /** Exporta a visão filtrada do painel — indicadores e rankings, sem tabela bruta. */
  async function exportDashboard() {
    try {
      const periodo =
        new Date(range.from).toLocaleDateString("pt-BR") +
        " a " +
        new Date(range.to).toLocaleDateString("pt-BR");
      const sizeRows = (rows: { name: string; value: number; perf: string }[]) =>
        rows.map((r) => ({
          Tamanho: r.name,
          Vendidos: r.value,
          Classificação: PERF_LABEL[r.perf as PerfClass],
        }));
      await downloadPdf(
        `painel-${new Date().toISOString().slice(0, 10)}`,
        `Painel de estoque e vendas — ${platformName}`,
        [
          {
            kind: "kpis",
            title: `Período ${periodo} · ${platformName}`,
            items: [
              { label: "Unidades em estoque", value: String(totalUnits) },
              { label: "Saídas no período", value: String(totalOut) },
              { label: "Entradas no período", value: String(totalIn) },
              { label: "Giro do estoque", value: `${turnover.toFixed(1)}%` },
              { label: "Saídas em kit", value: `${mix.kit} un.` },
              { label: "Saídas unitárias", value: `${mix.unit} un.` },
              { label: "Variações zeradas", value: String(zerados.length) },
              { label: "Estoque parado", value: `${estoqueParado.toFixed(0)}%` },
            ],
          },
          {
            kind: "bars",
            title: "SKUs mais vendidos",
            items: topSkus.map((r) => ({ label: r.name, value: r.value })),
          },
          {
            kind: "table",
            title: "Kits vendidos por tamanho",
            rows: kitBreakdown.flatMap((k) =>
              k.sizes.map((s) => ({
                Kit: k.name,
                Tamanho: s.name,
                Vendidos: s.value,
                Classificação: PERF_LABEL[s.perf],
              })),
            ),
          },
          {
            kind: "table",
            title: "Unidades vendidas por tamanho",
            rows: unitBreakdown.flatMap((u) =>
              u.sizes.map((s) => ({
                SKU: u.name,
                Tamanho: s.name,
                Vendidos: s.value,
                Classificação: PERF_LABEL[s.perf],
              })),
            ),
          },
          { kind: "table", title: "Tamanhos — todas as saídas", rows: sizeRows(sizePerfAll) },
          { kind: "table", title: "Tamanhos — kits", rows: sizeRows(sizePerfKit) },
          { kind: "table", title: "Tamanhos — unidades", rows: sizeRows(sizePerfUnit) },
          {
            kind: "table",
            title: "Cores mais vendidas (geral)",
            rows: colorAll.map((c) => ({
              Cor: c.name,
              Vendidos: c.value,
              "Tamanho de maior saída": c.sizes[0]?.name ?? "—",
            })),
          },
          {
            kind: "table",
            title: "Estoque x vendas por tamanho",
            rows: coverage.map((c) => ({
              Tamanho: c.name,
              Estoque: c.stock,
              Saídas: c.outs,
              Cobertura: Number.isFinite(c.coverage) ? `${Math.floor(c.coverage)} dias` : "—",
              Situação: c.label,
            })),
          },
        ],
      );
      toast.success("Painel exportado em PDF.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar o painel.");
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Painel</h1>
        <p className="text-sm text-muted-foreground">
          Todos os números vêm das movimentações reais registradas no sistema.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <PlatformFilter />
        {!allPlatforms && (
          <span className="text-xs text-muted-foreground">
            Painel restrito ao saldo exclusivo e às movimentações de {platformName}.
          </span>
        )}
      </div>

      <FilterBar state={state} setState={setState} categories={categories} skus={skus} />

      <div className="card-elevated space-y-2 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Forma de venda
        </p>
        <SourceSwitch value={salesSource} onChange={setSalesSource} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={exportDashboard}>
            <Download className="mr-1.5 size-4" /> Exportar painel (PDF)
          </Button>
        </div>
      </div>

      {isSkuScope && currentSku && (
        <p className="card-elevated p-3 text-sm">
          <span className="text-muted-foreground">Analisando somente </span>
          <span className="font-medium break-words">{currentSku.seller_sku}</span>
          <span className="text-muted-foreground"> — {currentSku.name}</span>
        </p>
      )}

      {/* ---------------- 1. Resumo ---------------- */}
      <SectionTitle hint="Números do escopo e do período selecionados.">Resumo</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi label="Unidades em estoque" value={totalUnits} sub={`${scopeSkus.length} SKUs`} />
        <Kpi
          label="Saídas no período"
          value={totalOut}
          tone="accent"
          sub={`${mediaDia.toFixed(1)}/dia`}
        />
        <Kpi label="Entradas no período" value={totalIn} tone="muted" />
        <Kpi label="Giro do estoque" value={`${turnover.toFixed(1)}%`} tone="brand" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          label="Saídas em kit"
          value={`${(mix.kitShare * 100).toFixed(0)}%`}
          sub={`${mix.kit} un.`}
          tone="accent"
        />
        <Kpi
          label="Saídas unitárias"
          value={`${((1 - mix.kitShare) * 100).toFixed(0)}%`}
          sub={`${mix.unit} un.`}
        />
        <Kpi label="Variações zeradas" value={zerados.length} tone="danger" />
        <Kpi label="Estoque parado" value={`${estoqueParado.toFixed(0)}%`} tone="warn" />
      </div>

      {semDados && (
        <p className="card-elevated p-4 text-sm text-muted-foreground">
          Não há movimentações no período e escopo selecionados. Os blocos de vendas, horários e
          tendências ficam vazios até existirem dados reais.
        </p>
      )}

      {/* ---------------- 2. Estoque ---------------- */}
      <SectionTitle hint="Onde as unidades estão hoje.">Estoque</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {!isSkuScope && !hidden.has("cat") && (
          <RankPanel
            title={CHART_TITLES["cat"] as string}
            hint="Unidades disponíveis em cada categoria"
            rows={stockByCategory}
            defaultMode="pie"
            {...box("cat")}
          />
        )}
        {!hidden.has("size-stock") && (
          <RankPanel
            title={CHART_TITLES["size-stock"] as string}
            hint={
              isSkuScope
                ? "Unidades disponíveis por tamanho"
                : "Unidades por tamanho, identificando o SKU de origem"
            }
            rows={isSkuScope ? stockBySize : stockBySizeDetail}
            defaultMode="bar"
            {...box("size-stock")}
          />
        )}
        {!hidden.has("color-stock") && (
          <RankPanel
            title={CHART_TITLES["color-stock"] as string}
            hint="Unidades disponíveis por cor"
            rows={stockByColor}
            defaultMode="bar"
            useRowColors
            {...box("color-stock")}
          />
        )}
        {!isSkuScope && !hidden.has("top-stock") && (
          <RankPanel
            title={CHART_TITLES["top-stock"] as string}
            hint="SKUs com mais unidades guardadas"
            rows={topStock}
            defaultMode="list"
            modes={["list", "bar"]}
            {...box("top-stock")}
          />
        )}
        {!hidden.has("near-zero") && (
          <RankPanel
            title={CHART_TITLES["near-zero"] as string}
            hint="Estoque de 1 a 5 unidades, começando pelas mais próximas de zerar"
            rows={proximasZerar.slice(0, 30)}
            defaultMode="list"
            modes={["list", "bar"]}
            useRowColors
            emptyLabel="Nenhuma variação em nível crítico."
            {...box("near-zero")}
          />
        )}
        {!hidden.has("zerados") && (
          <Panel
            title={CHART_TITLES["zerados"] as string}
            hint={`Variações cor · tamanho sem nenhuma unidade disponível (${zerados.length} no escopo)`}
            empty={zerados.length === 0}
            {...box("zerados")}
            list={
              <DataList
                rows={zerados.slice(0, 40).map((r) => ({ ...r, extra: "sem estoque" }))}
                showShare={false}
              />
            }
          />
        )}
      </div>

      {heatmap && !hidden.has("heatmap-cs") && (
        <Panel
          title={CHART_TITLES["heatmap-cs"] as string}
          hint="Intensidade proporcional ao estoque da variação"
          defaultMode="chart"
          {...box("heatmap-cs")}
          chart={
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[320px] text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-muted-foreground">Cor</th>
                    {heatmap.sizes.map((s) => (
                      <th
                        key={s.id}
                        className="px-2 py-1 text-center font-medium text-muted-foreground"
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.rows.map((row) => (
                    <tr key={row.color.id}>
                      <td className="max-w-24 truncate px-2 py-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-3 shrink-0 rounded-full border border-border"
                            style={{ backgroundColor: row.color.hex }}
                          />
                          <span className="truncate">{row.color.name}</span>
                        </span>
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.size.id} className="p-1">
                          <div
                            className="grid h-8 place-items-center rounded-md text-[11px] font-medium"
                            style={{
                              backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(
                                (cell.qty / heatmap.max) * 85,
                              )}%, transparent)`,
                            }}
                          >
                            {cell.qty}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}

      {/* ---------------- 3. Vendas ---------------- */}
      <SectionTitle hint="O que saiu no período selecionado.">Vendas</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {!isSkuScope && !hidden.has("top-skus") && (
          <RankPanel
            title={CHART_TITLES["top-skus"] as string}
            hint={topSkus[0] ? `SKU líder: ${topSkus[0].name}` : "Saídas por SKU"}
            rows={topSkus}
            unit="saídas"
            defaultMode="bar"
            {...box("top-skus")}
          />
        )}
        {!isSkuScope && !hidden.has("bottom-skus") && (
          <RankPanel
            title={CHART_TITLES["bottom-skus"] as string}
            hint={`${semSaida.length} SKUs sem nenhuma saída no período`}
            rows={bottomSkus}
            unit="saídas"
            defaultMode="list"
            modes={["list", "bar"]}
            {...box("bottom-skus")}
          />
        )}
        {!hidden.has("trend") && (
          <Panel
            title={CHART_TITLES["trend"] as string}
            hint="Evolução diária do período"
            className={isSkuScope ? "" : "lg:col-span-2"}
            empty={trend.length === 0}
            {...box("trend")}
            chart={
              <ChartBox minWidth={Math.max(360, trend.length * 26)} height={280}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    allowDecimals={false}
                    width={34}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartBox>
            }
            list={
              <DataList
                rows={trend
                  .filter((r) => r.entradas + r.saidas > 0)
                  .map((r) => ({
                    id: r.day,
                    name: r.label,
                    value: r.saidas,
                    extra: `entradas ${r.entradas}`,
                  }))}
                showShare={false}
                showRank={false}
              />
            }
          />
        )}
      </div>

      {/* ---------------- 4. Saídas: geral, kits, unidades e comparativo ---------------- */}
      <SectionTitle
        id="saidas"
        hint="Kits e unidades nunca são misturados: escolha a aba para ver cada forma de venda."
      >
        Saídas
      </SectionTitle>
      <Tabs
        tabs={[
          { value: "geral", label: "Visão geral" },
          { value: "kits", label: "Kits" },
          { value: "unidades", label: "Unidades" },
          { value: "comparativo", label: "Comparativo" },
        ]}
        value={salesTab}
        onChange={setSalesTab}
      />

      {salesTab === "geral" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            title="Produtos mais vendidos com tamanhos"
            hint="Kits + unidades. Toque em “Ver tamanhos” para abrir a análise."
            defaultMode="list"
            empty={skuBreakdown.length === 0}
            list={<BreakdownList rows={skuBreakdown} unit="un." />}
          />
          <Panel
            title="Cores mais vendidas no geral"
            hint="Venda avulsa + consumo da cor dentro dos kits"
            defaultMode="list"
            empty={colorAll.length === 0}
            list={<BreakdownList rows={colorAll} unit="un." />}
          />
          {!hidden.has("size-perf-all") && (
            <Panel
              title={CHART_TITLES["size-perf-all"] as string}
              hint="Todas as saídas do período"
              defaultMode="list"
              empty={sizePerfAll.length === 0}
              {...box("size-perf-all")}
              list={<SizeTable sizes={sizePerfAll} />}
            />
          )}
          {!hidden.has("size-out") && (
            <RankPanel
              title={CHART_TITLES["size-out"] as string}
              hint="Respeita o filtro global kit x unidade"
              rows={bySizeOut}
              defaultMode="bar"
              {...box("size-out")}
            />
          )}
        </div>
      )}

      {salesTab === "kits" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {!hidden.has("kit-sizes") && (
            <Panel
              title={CHART_TITLES["kit-sizes"] as string}
              hint="Cada kit com a quantidade vendida em cada tamanho"
              className="lg:col-span-2"
              defaultMode="list"
              empty={kitBreakdown.length === 0}
              {...box("kit-sizes")}
              list={
                <BreakdownList
                  rows={kitBreakdown}
                  unit="kits"
                  renderName={(r) => (
                    <KitSwatches
                      kitId={r.id}
                      kitColors={kitColors}
                      colors={colors}
                      name={`${skuTag(r.skuId)}${r.name}`}
                    />
                  )}
                />
              }
            />
          )}
          {!hidden.has("kit-out") && (
            <RankPanel
              title={CHART_TITLES["kit-out"] as string}
              hint="Saídas por kit no período"
              rows={byKitOut}
              unit="kits"
              defaultMode="bar"
              modes={["bar", "pie", "list"]}
              {...box("kit-out")}
            />
          )}
          {!hidden.has("size-perf-kit") && (
            <Panel
              title={CHART_TITLES["size-perf-kit"] as string}
              hint="Somente saídas em kit"
              defaultMode="list"
              empty={sizePerfKit.length === 0}
              {...box("size-perf-kit")}
              list={<SizeTable sizes={sizePerfKit} unit="kits" />}
            />
          )}
          {!hidden.has("color-kit") && (
            <Panel
              title={CHART_TITLES["color-kit"] as string}
              hint="Unidades consumidas dentro dos kits, com os tamanhos de maior saída"
              defaultMode="list"
              empty={colorKit.length === 0}
              {...box("color-kit")}
              list={<BreakdownList rows={colorKit} unit="un." />}
            />
          )}
          {!hidden.has("kit-potential") && (
            <RankPanel
              title={CHART_TITLES["kit-potential"] as string}
              hint="Somando todos os tamanhos, sem considerar reservas"
              rows={kitPotential}
              unit="kits"
              defaultMode="list"
              modes={["list", "bar"]}
              {...box("kit-potential")}
            />
          )}
        </div>
      )}

      {salesTab === "unidades" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {!hidden.has("unit-sizes") && (
            <Panel
              title={CHART_TITLES["unit-sizes"] as string}
              hint="Somente vendas avulsas, abertas por tamanho"
              className="lg:col-span-2"
              defaultMode="list"
              empty={unitBreakdown.length === 0}
              {...box("unit-sizes")}
              list={<BreakdownList rows={unitBreakdown} unit="un." />}
            />
          )}
          {!hidden.has("size-perf-unit") && (
            <Panel
              title={CHART_TITLES["size-perf-unit"] as string}
              hint="Somente saídas avulsas"
              defaultMode="list"
              empty={sizePerfUnit.length === 0}
              {...box("size-perf-unit")}
              list={<SizeTable sizes={sizePerfUnit} />}
            />
          )}
          {!hidden.has("color-unit") && (
            <Panel
              title={CHART_TITLES["color-unit"] as string}
              hint="Cores vendidas avulsas, com os tamanhos de maior saída"
              defaultMode="list"
              empty={colorUnit.length === 0}
              {...box("color-unit")}
              list={<BreakdownList rows={colorUnit} unit="un." />}
            />
          )}
        </div>
      )}

      {salesTab === "comparativo" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {!hidden.has("mix") && (
            <RankPanel
              title={CHART_TITLES["mix"] as string}
              hint="Participação de cada forma de venda nas saídas"
              rows={[
                { id: "kit", name: "Kits", value: mix.kit },
                { id: "unit", name: "Unidades", value: mix.unit },
              ]}
              defaultMode="pie"
              emptyLabel="Nenhuma saída registrada no período."
              {...box("mix")}
            />
          )}
          {!hidden.has("size-compare") && (
            <Panel
              title={CHART_TITLES["size-compare"] as string}
              hint="Quanto cada tamanho saiu em kit e quanto saiu avulso"
              empty={sizeCompare.length === 0}
              {...box("size-compare")}
              chart={
                <ChartBox minWidth={Math.max(320, sizeCompare.length * 70)}>
                  <BarChart data={sizeCompare}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                      allowDecimals={false}
                      width={34}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="kit" name="Kits" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Bar
                      dataKey="unidade"
                      name="Unidades"
                      fill="var(--accent)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartBox>
              }
              list={
                <DataList
                  rows={sizeCompare.map((r) => ({
                    id: r.name,
                    name: r.name,
                    value: r.kit + r.unidade,
                    extra: `kits ${r.kit} · unidades ${r.unidade}`,
                  }))}
                  showShare={false}
                />
              }
            />
          )}
        </div>
      )}

      {/* ---------------- 5. Cores ---------------- */}
      <SectionTitle hint="Consumo real de cada cor — as cores usadas dentro dos kits também são contadas.">
        Cores
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {!hidden.has("color-out") && (
          <RankPanel
            title={CHART_TITLES["color-out"] as string}
            hint={
              salesSource === "kit"
                ? "Unidades consumidas dentro dos kits"
                : salesSource === "unidade"
                  ? "Somente vendas avulsas"
                  : "Vendas avulsas + consumo dentro dos kits"
            }
            rows={byColorOut}
            defaultMode="bar"
            useRowColors
            {...box("color-out")}
          />
        )}
        {!hidden.has("color-low") && (
          <RankPanel
            title={CHART_TITLES["color-low"] as string}
            hint="Cores do escopo com menor saída no período"
            rows={[...scopeColors]
              .map((c) => ({
                id: c.id,
                name: `${skuTag(c.sku_id)}${c.name}`,
                color: c.hex,
                value: byColorOut.find((r) => r.id === c.id)?.value ?? 0,
              }))
              .sort((a, b) => a.value - b.value)
              .slice(0, 12)}
            defaultMode="list"
            modes={["list", "bar"]}
            useRowColors
            {...box("color-low")}
          />
        )}
      </div>

      {/* ---------------- 6. Estoque x vendas por tamanho ---------------- */}
      <SectionTitle hint="Quanto tenho x quanto vendo, tamanho a tamanho.">Análise</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {!hidden.has("coverage") && (
          <Panel
            title={CHART_TITLES["coverage"] as string}
            hint="Cobertura em dias no ritmo do período — identifica ruptura e estoque parado"
            className="lg:col-span-2"
            defaultMode="list"
            empty={coverage.length === 0}
            {...box("coverage")}
            list={<CoverageTable rows={coverage} />}
          />
        )}
        {!hidden.has("size-cmp") && (
          <RankPanel
            title={CHART_TITLES["size-cmp"] as string}
            hint="Compare o que existe com o que sai"
            rows={stockBySize.map((r) => ({
              ...r,
              extra: `saídas ${bySizeOut.find((x) => x.name === r.name)?.value ?? 0}`,
            }))}
            defaultMode="list"
            modes={["list", "bar"]}
            {...box("size-cmp")}
          />
        )}
        {!hidden.has("trend-up") && (
          <RankPanel
            title={CHART_TITLES["trend-up"] as string}
            hint="Comparando a segunda metade do período com a primeira"
            rows={emAlta.slice(0, 12)}
            unit="saídas"
            defaultMode="list"
            modes={["list", "bar"]}
            emptyLabel="Nenhum produto em crescimento no período."
            {...box("trend-up")}
          />
        )}
        {!hidden.has("trend-down") && (
          <RankPanel
            title={CHART_TITLES["trend-down"] as string}
            hint="Queda em relação à primeira metade do período"
            rows={emQueda.slice(0, 12)}
            unit="saídas"
            defaultMode="list"
            modes={["list", "bar"]}
            emptyLabel="Nenhum produto em queda no período."
            {...box("trend-down")}
          />
        )}
        {!hidden.has("stopped") && (
          <RankPanel
            title={CHART_TITLES["stopped"] as string}
            hint="SKUs com estoque e mais de 30 dias sem nenhuma saída"
            rows={paradosList.slice(0, 15)}
            defaultMode="list"
            modes={["list", "bar"]}
            emptyLabel="Nenhum SKU parado."
            {...box("stopped")}
          />
        )}
      </div>

      {/* ---------------- 7. Horários ---------------- */}
      <SectionTitle hint="Quando as vendas acontecem.">Horários de venda</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {!hidden.has("hour") && (
          <Panel
            title={CHART_TITLES["hour"] as string}
            empty={totalOut === 0}
            {...box("hour")}
            chart={
              <ChartBox minWidth={640}>
                <BarChart data={byHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    allowDecimals={false}
                    width={34}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar dataKey="value" name="Saídas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartBox>
            }
            list={<DataList rows={byHour.filter((r) => r.value > 0)} unit="saídas" />}
          />
        )}
        {!hidden.has("weekday") && (
          <Panel
            title={CHART_TITLES["weekday"] as string}
            empty={totalOut === 0}
            {...box("weekday")}
            chart={
              <ChartBox>
                <BarChart data={byWeekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    allowDecimals={false}
                    width={34}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar dataKey="value" name="Saídas" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartBox>
            }
            list={<DataList rows={byWeekday.filter((r) => r.value > 0)} unit="saídas" />}
          />
        )}
      </div>

      {!hidden.has("dayhour") && (
        <Panel
          title={CHART_TITLES["dayhour"] as string}
          hint="Concentração das saídas ao longo da semana"
          empty={totalOut === 0}
          {...box("dayhour")}
          chart={
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="text-[10px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card px-1 py-1" />
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="px-1 py-1 font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((label, d) => (
                    <tr key={label}>
                      <td className="sticky left-0 bg-card px-1 py-1 font-medium text-muted-foreground">
                        {label}
                      </td>
                      {Array.from({ length: 24 }, (_, h) => {
                        const v = dayHourHeat.grid[d]?.[h] ?? 0;
                        return (
                          <td key={h} className="p-0.5">
                            <div
                              title={`${label} ${h}h — ${v} un.`}
                              className="size-5 rounded-sm"
                              style={{
                                backgroundColor: `color-mix(in oklab, var(--accent) ${Math.round(
                                  (v / dayHourHeat.max) * 90,
                                )}%, transparent)`,
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}

      {/* ---------------- 8. Curva ABC ---------------- */}
      {!isSkuScope && (
        <>
          <SectionTitle hint="A = 80% das saídas · B = até 95% · C = cauda">Curva ABC</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {!hidden.has("abc-share") && (
              <RankPanel
                title={CHART_TITLES["abc-share"] as string}
                rows={abcResumo}
                unit="saídas"
                defaultMode="pie"
                {...box("abc-share")}
              />
            )}
            {!hidden.has("abc-list") && (
              <Panel
                title={CHART_TITLES["abc-list"] as string}
                empty={abc.length === 0}
                defaultMode="list"
                {...box("abc-list")}
                list={
                  <ul className="divide-y divide-border">
                    {abc.slice(0, 15).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                        <Badge
                          variant={
                            r.classe === "A"
                              ? "default"
                              : r.classe === "B"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {r.classe}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{r.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {(r.share * 100).toFixed(1)}%
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{r.value}</span>
                      </li>
                    ))}
                  </ul>
                }
              />
            )}
          </div>
        </>
      )}

      {/* ---------------- 10. Gráficos ocultos ---------------- */}
      {prefs.hidden_charts.length > 0 && (
        <>
          <SectionTitle hint="Toque em um gráfico para trazê-lo de volta ao painel.">
            Gráficos ocultos
          </SectionTitle>
          <div className="card-elevated flex flex-wrap gap-2 p-3">
            {prefs.hidden_charts.map((id) => (
              <Button key={id} size="sm" variant="outline" onClick={() => unhide(id)}>
                {CHART_TITLES[id] ?? id}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => save.mutate({ hidden_charts: [] })}>
              Restaurar todos
            </Button>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3 pb-2 text-sm">
        <Link to="/sugestoes" className="text-primary hover:underline">
          Ver sugestões inteligentes
        </Link>
        <Link to="/estoque" className="text-primary hover:underline">
          Ir para o estoque
        </Link>
        <Link to="/historico" className="text-primary hover:underline">
          Ver histórico
        </Link>
        <Link to="/configuracoes" className="text-primary hover:underline">
          Configurações e exportação
        </Link>
      </div>
    </div>
  );
}
