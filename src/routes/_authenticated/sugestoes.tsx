import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  computeKitAvailable,
  kitColorsOf,
  stockOf,
  useCategories,
  useColors,
  useKitColors,
  useKits,
  useMovements,
  useSizes,
  useSkus,
  useStockUnits,
  type Color,
  type Kit,
  type Size,
  type Sku,
} from "@/lib/erp";
import {
  allocateDistribution,
  colorDemand,
  colorSizeDemand,
  coverageDays,
  DAY,
  inRange,
  kitDemand,
  rankKits,
  salesMix,
  sizeDemand,
  skuIdsInScope,
  sumBy,
} from "@/lib/analytics";
import { DataList, Kpi, type ListRow, RankPanel, SectionTitle } from "@/components/dash";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { ColorDot, KitSwatches } from "@/components/kit-swatches";
import { PlatformFilter } from "@/components/platform-filter";
import { useAllocations, usePlatformFilter, viewStock } from "@/lib/platforms";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sugestoes")({
  head: () => ({
    meta: [
      { title: "Sugestões inteligentes de estoque — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Sugestões por SKU, cor e tamanho: o que repor, quais kits formar primeiro, quanto reservar para venda avulsa e simulação de impacto no estoque.",
      },
      { property: "og:title", content: "Sugestões inteligentes de estoque" },
      {
        property: "og:description",
        content: "Análise individual por SKU, cor e tamanho com base nas saídas reais registradas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SugestoesPage,
});

type Tone = "danger" | "warn" | "ok" | "info";

type Suggestion = {
  id: string;
  tone: Tone;
  text: string;
  detail?: string | undefined;
  node?: React.ReactNode;
};

const TONE_STYLE: Record<Tone, string> = {
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  warn: "border-warning/40 bg-warning/10 text-warning",
  ok: "border-accent/40 bg-accent/10 text-accent",
  info: "border-border bg-muted/40 text-muted-foreground",
};

function SuggestionCard({ s }: { s: Suggestion }) {
  const Icon = s.tone === "danger" ? AlertTriangle : s.tone === "warn" ? AlertTriangle : s.tone === "ok" ? CheckCircle2 : Info;
  return (
    <li className={cn("flex min-w-0 gap-2 rounded-xl border p-2.5", TONE_STYLE[s.tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{s.text}</p>
        {s.node && <div className="mt-1 min-w-0">{s.node}</div>}
        {s.detail && <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Simulação de impacto
 * ------------------------------------------------------------------ */

function Simulacao({
  skus,
  kits,
  sizes,
  colors,
  kitColors,
  stock,
}: {
  skus: Sku[];
  kits: Kit[];
  sizes: Size[];
  colors: Color[];
  kitColors: ReturnType<typeof useKitColors>["data"] & object;
  stock: ReturnType<typeof useStockUnits>["data"] & object;
}) {
  const [skuId, setSkuId] = useState<string>(skus[0]?.id ?? "");
  const sku = skus.find((s) => s.id === skuId) ?? skus[0];
  const skuKits = useMemo(() => kits.filter((k) => k.sku_id === sku?.id), [kits, sku]);
  const skuSizes = useMemo(() => sizes.filter((s) => s.sku_id === sku?.id), [sizes, sku]);
  const [kitId, setKitId] = useState<string>("");
  const [sizeId, setSizeId] = useState<string>("");
  const [qty, setQty] = useState(1);

  const kit = skuKits.find((k) => k.id === kitId) ?? skuKits[0];
  const size = skuSizes.find((s) => s.id === sizeId) ?? skuSizes[0];

  const result = useMemo(() => {
    if (!kit || !size) return null;
    const usados = kitColorsOf(kit.id, kitColors, colors);
    const antes = usados.map((c) => ({ color: c, qty: stockOf(stock, c.id, size.id) }));
    const possivel = computeKitAvailable(kit.id, size.id, kitColors, stock);
    const efetivo = Math.min(qty, possivel);
    const depoisStock = stock.map((s) =>
      size && usados.some((c) => c.id === s.color_id) && s.size_id === size.id
        ? { ...s, qty: Math.max(0, s.qty - efetivo) }
        : s,
    );
    const outros = skuKits.map((k) => ({
      kit: k,
      antes: computeKitAvailable(k.id, size.id, kitColors, stock),
      depois: computeKitAvailable(k.id, size.id, kitColors, depoisStock),
    }));
    const limitante =
      antes.length === 0 ? null : antes.reduce((a, b) => (b.qty < a.qty ? b : a));
    return { usados, antes, possivel, efetivo, outros, limitante };
  }, [kit, size, kitColors, colors, stock, qty, skuKits]);

  if (skus.length === 0) return null;

  const selectCls =
    "h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm";

  return (
    <div className="card-elevated space-y-3 p-3">
      <div>
        <h3 className="font-display text-sm font-semibold sm:text-base">Simulação de impacto</h3>
        <p className="text-xs text-muted-foreground">
          Veja o efeito de formar kits antes de mexer no estoque. Nada é alterado aqui.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            SKU
          </span>
          <select
            className={selectCls}
            value={sku?.id ?? ""}
            onChange={(e) => {
              setSkuId(e.target.value);
              setKitId("");
              setSizeId("");
            }}
          >
            {skus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.seller_sku}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Kit
          </span>
          <select className={selectCls} value={kit?.id ?? ""} onChange={(e) => setKitId(e.target.value)}>
            {skuKits.length === 0 && <option value="">Sem kits</option>}
            {skuKits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Tamanho
          </span>
          <select className={selectCls} value={size?.id ?? ""} onChange={(e) => setSizeId(e.target.value)}>
            {skuSizes.length === 0 && <option value="">Sem tamanhos</option>}
            {skuSizes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Quantidade
          </span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="h-9"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
      </div>

      {!result ? (
        <p className="text-sm text-muted-foreground">
          Cadastre kits e tamanhos para este SKU para simular.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Solicitado</p>
              <p className="font-display text-lg font-semibold">{qty}</p>
            </div>
            <div className="rounded-lg border border-border p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Máximo possível
              </p>
              <p className="font-display text-lg font-semibold text-primary">{result.possivel}</p>
            </div>
            <div className="rounded-lg border border-border p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Kits formados
              </p>
              <p className="font-display text-lg font-semibold text-accent">{result.efetivo}</p>
            </div>
            <div className="rounded-lg border border-border p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Faltam</p>
              <p
                className={cn(
                  "font-display text-lg font-semibold",
                  qty - result.efetivo > 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {Math.max(0, qty - result.efetivo)}
              </p>
            </div>
          </div>

          <p className="text-sm leading-snug">
            O máximo possível é a <strong>menor quantidade</strong> disponível entre todas as cores
            do kit neste tamanho
            {result.limitante && (
              <>
                {" "}
                — hoje limitado por{" "}
                <strong>
                  {result.limitante.color.name} ({result.limitante.qty} un.)
                </strong>
              </>
            )}
            .
            {result.efetivo < qty && (
              <span className="text-destructive"> Estoque insuficiente para {qty} kits.</span>
            )}
          </p>

          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[320px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium">Cor consumida</th>
                  <th className="py-1 text-right font-medium">Antes</th>
                  <th className="py-1 text-right font-medium">Depois</th>
                  <th className="py-1 text-right font-medium">Impacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.antes.map((r) => (
                  <tr key={r.color.id}>
                    <td className="py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <ColorDot hex={r.color.hex} />
                        <span className="truncate">{r.color.name}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r.qty}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right font-medium tabular-nums",
                        r.qty - result.efetivo <= 0 ? "text-destructive" : "",
                      )}
                    >
                      {Math.max(0, r.qty - result.efetivo)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {result.efetivo > 0 ? `−${result.efetivo}` : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Impacto nos outros kits deste tamanho
            </p>
            <ul className="divide-y divide-border">
              {result.outros.map((o) => (
                <li key={o.kit.id} className="flex min-w-0 items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <KitSwatches
                      kitId={o.kit.id}
                      kitColors={kitColors}
                      colors={colors}
                      name={o.kit.name}
                    />
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{o.antes}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      "shrink-0 font-medium tabular-nums",
                      o.depois < o.antes ? "text-warning" : "",
                    )}
                  >
                    {o.depois}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

function SugestoesPage() {
  const { data: categories = [] } = useCategories();
  const { data: skus = [] } = useSkus();
  const { data: colors = [] } = useColors();
  const { data: sizes = [] } = useSizes();
  const { data: kits = [] } = useKits();
  const { data: kitColors = [] } = useKitColors();
  const { data: rawStock = [] } = useStockUnits();
  const { data: allMovements = [] } = useMovements(1000);
  const { data: allocations = [] } = useAllocations();
  const { platformId, isAll: allPlatforms } = usePlatformFilter();

  /** As sugestões sempre respeitam o saldo isolado do escopo selecionado. */
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
  const dias = Math.max(1, Math.round((range.to - range.from) / DAY));

  /** Cada SKU é analisado isoladamente — nunca somamos SKUs diferentes. */
  const analises = useMemo(() => {
    const valid = movements.filter((m) => !m.undone_at && inRange(m.created_at, range));
    return skus
      .filter((s) => scopeIds.has(s.id))
      .map((sku) => {
        const mine = valid.filter((m) => m.sku_id === sku.id);
        const outs = mine.filter((m) => m.direction === "out");
        const mix = salesMix(mine);
        const skuKits = kits.filter((k) => k.sku_id === sku.id);
        const skuSizes = sizes.filter((s) => s.sku_id === sku.id);
        const skuColors = colors.filter((c) => c.sku_id === sku.id);
        const weights = kitDemand(outs);
        const estoque = sumBy(
          stock.filter((s) => s.sku_id === sku.id),
          (s) => s.qty,
        );
        const reserva = mix.total > 0 ? 1 - mix.kitShare : 0.5;

        const perKitTotal: Record<string, number> = {};
        const unitsFree: Record<string, Record<string, number>> = {};
        for (const size of skuSizes) {
          const res = allocateDistribution({
            sizeId: size.id,
            kits: skuKits,
            kitColors,
            stock,
            weights,
            unitReserveRatio: reserva,
          });
          for (const [kitId, qty] of Object.entries(res.perKit))
            perKitTotal[kitId] = (perKitTotal[kitId] ?? 0) + qty;
          for (const [colorId, split] of Object.entries(res.perColor))
            (unitsFree[colorId] ??= {})[size.id] = split.units;
        }

        const kitsSugeridos: ListRow[] = skuKits
          .map((k) => {
            const componentes = kitColors.filter((kc) => kc.kit_id === k.id).length;
            const possiveis = sumBy(skuSizes, (s) =>
              computeKitAvailable(k.id, s.id, kitColors, stock),
            );
            return {
              id: k.id,
              name: k.name,
              value: Math.min(perKitTotal[k.id] ?? 0, possiveis),
              extra:
                componentes === 0
                  ? "sem componentes cadastrados"
                  : `${weights[k.id] ?? 0} saídas · ${possiveis} possíveis`,
              node: (
                <KitSwatches kitId={k.id} kitColors={kitColors} colors={colors} name={k.name} />
              ),
            };
          })
          .sort((a, b) => b.value - a.value);

        /* --- Demanda granular por cor e por cor+tamanho --- */
        const demandaCor = colorDemand(outs, skuColors, "todos");
        const demandaCorKit = colorDemand(outs, skuColors, "kit");
        const demandaCorUnidade = colorDemand(outs, skuColors, "unidade");
        const crossDemand = colorSizeDemand(outs, "todos");

        /** Recomendação por variação cor · tamanho, com cobertura em dias. */
        const variacoes = skuColors
          .flatMap((c) =>
            skuSizes.map((s) => {
              const qtyStock = stockOf(stock, c.id, s.id);
              const saidas = crossDemand.get(`${c.id}|${s.id}`) ?? 0;
              const perDay = saidas / dias;
              const cobertura = coverageDays(qtyStock, perDay);
              return {
                id: `${c.id}-${s.id}`,
                colorId: c.id,
                color: c.hex,
                colorName: c.name,
                sizeName: s.name,
                name: `${c.name} · ${s.name}`,
                qtyStock,
                saidas,
                cobertura,
                repor: perDay > 0 ? Math.max(0, Math.ceil(perDay * 30) - qtyStock) : 0,
              };
            }),
          )
          .sort((a, b) => a.cobertura - b.cobertura);

        const criticas = variacoes.filter((v) => v.saidas > 0 && v.cobertura <= 10);
        const paradas = variacoes.filter((v) => v.saidas === 0 && v.qtyStock > 0);

        /* --- Sugestões textuais objetivas --- */
        const sugestoes: Suggestion[] = [];

        for (const v of criticas.slice(0, 5)) {
          sugestoes.push({
            id: `repor-${v.id}`,
            tone: v.qtyStock === 0 ? "danger" : "warn",
            text:
              v.qtyStock === 0
                ? `Repor ${v.colorName} · ${v.sizeName}: estoque zerado com ${v.saidas} saídas no período.`
                : `Repor ${v.colorName} · ${v.sizeName}: ${v.qtyStock} un. para ~${v.cobertura.toFixed(0)} dias.`,
            detail:
              v.repor > 0
                ? `Sugestão de compra: ${v.repor} un. para cobrir 30 dias no ritmo atual.`
                : "Acompanhe o ritmo de saída desta variação.",
            node: (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ColorDot hex={v.color} />
                {v.colorName} · {v.sizeName}
              </span>
            ),
          });
        }

        const topKitFaltando = kitsSugeridos.find(
          (k) => (weights[k.id] ?? 0) > 0 && k.value === 0,
        );
        if (topKitFaltando) {
          sugestoes.push({
            id: `kit-bloqueado-${topKitFaltando.id}`,
            tone: "danger",
            text: `O kit "${topKitFaltando.name}" tem demanda mas não pode ser montado.`,
            detail: "Falta estoque em pelo menos uma das cores que compõem o kit.",
            node: topKitFaltando.node,
          });
        }

        const kitPrioritario = kitsSugeridos.find((k) => k.value > 0);
        if (kitPrioritario) {
          sugestoes.push({
            id: `formar-${kitPrioritario.id}`,
            tone: "ok",
            text: `Forme primeiro o kit "${kitPrioritario.name}" — até ${kitPrioritario.value} unidades.`,
            detail: kitPrioritario.extra,
            node: kitPrioritario.node,
          });
        }

        if (mix.total > 0) {
          sugestoes.push({
            id: `mix-${sku.id}`,
            tone: "info",
            text:
              mix.kitShare >= 0.6
                ? `Priorize kits: ${(mix.kitShare * 100).toFixed(0)}% das saídas foram em kit.`
                : mix.kitShare <= 0.4
                  ? `Priorize venda avulsa: ${((1 - mix.kitShare) * 100).toFixed(0)}% das saídas foram unitárias.`
                  : "Demanda equilibrada entre kits e unidades — mantenha as duas frentes abastecidas.",
            detail: `Reserve cerca de ${Math.round(reserva * 100)}% das unidades para venda avulsa.`,
          });
        }

        const corForte = demandaCor[0];
        if (corForte && corForte.value > 0) {
          const emKit = demandaCorKit.find((c) => c.id === corForte.id)?.value ?? 0;
          const avulso = demandaCorUnidade.find((c) => c.id === corForte.id)?.value ?? 0;
          sugestoes.push({
            id: `cor-${corForte.id}`,
            tone: "info",
            text: `A cor ${corForte.name} é a que mais consome estoque (${corForte.value} un.).`,
            detail: `${emKit} un. saíram dentro de kits e ${avulso} un. em vendas avulsas.`,
            node: (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ColorDot hex={corForte.color ?? "var(--muted-foreground)"} />
                {corForte.name}
              </span>
            ),
          });
        }

        for (const v of paradas.slice(0, 2)) {
          sugestoes.push({
            id: `parado-${v.id}`,
            tone: "warn",
            text: `${v.colorName} · ${v.sizeName} está parado: ${v.qtyStock} un. sem saída no período.`,
            detail: "Considere usar estas unidades em kits promocionais.",
          });
        }

        if (sugestoes.length === 0) {
          sugestoes.push({
            id: `ok-${sku.id}`,
            tone: "ok",
            text: "Nenhum ponto crítico neste SKU no período analisado.",
          });
        }

        return {
          sku,
          mix,
          estoque,
          reserva,
          outsTotal: sumBy(outs, (m) => m.qty),
          kitsSugeridos,
          sugestoes,
          variacoes,
          criticas,
          unitsFree,
          porTamanho: sizeDemand(outs, skuSizes, "todos"),
          porCor: demandaCor,
          porKit: rankKits(outs, skuKits).map((r) => ({
            ...r,
            node: (
              <KitSwatches kitId={r.id} kitColors={kitColors} colors={colors} name={r.name} />
            ),
          })),
          semComponentes: skuKits.filter(
            (k) => kitColors.filter((kc) => kc.kit_id === k.id).length === 0,
          ).length,
          skuColors,
          skuSizes,
        };
      })
      .sort((a, b) => b.outsTotal - a.outsTotal);
  }, [skus, scopeIds, movements, range, kits, kitColors, sizes, colors, stock, dias]);

  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Sugestões inteligentes</h1>
        <p className="text-sm text-muted-foreground">
          Análise individual por SKU, cor e tamanho, baseada nas saídas reais do período. Nada é
          alterado automaticamente — todas as sugestões são informativas.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <PlatformFilter />
        {!allPlatforms && (
          <span className="text-xs text-muted-foreground">
            Sugestões calculadas apenas sobre o saldo exclusivo e as vendas desta plataforma.
          </span>
        )}
      </div>

      <FilterBar state={state} setState={setState} categories={categories} skus={skus} />

      <Simulacao
        skus={skus}
        kits={kits}
        sizes={sizes}
        colors={colors}
        kitColors={kitColors}
        stock={stock}
      />

      {analises.length === 0 && (
        <p className="card-elevated p-6 text-center text-sm text-muted-foreground">
          Nenhum SKU no escopo selecionado.
        </p>
      )}

      {analises.map((a) => {
        const semDados = a.outsTotal === 0;
        const preferencia = semDados
          ? "sem histórico"
          : a.mix.kitShare >= 0.6
            ? "kit"
            : a.mix.kitShare <= 0.4
              ? "unidade"
              : "equilibrado";

        return (
          <section key={a.sku.id} className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="min-w-0">
                <SectionTitle>{a.sku.seller_sku}</SectionTitle>
                <p className="truncate text-sm text-muted-foreground">{a.sku.name}</p>
              </div>
              <Badge variant={preferencia === "kit" ? "default" : "secondary"} className="shrink-0">
                Vende mais como {preferencia}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <Kpi label="Saídas no período" value={a.outsTotal} tone="accent" />
              <Kpi label="Unidades em estoque" value={a.estoque} />
              <Kpi label="Saídas em kit" value={`${(a.mix.kitShare * 100).toFixed(0)}%`} tone="brand" />
              <Kpi
                label="Variações críticas"
                value={a.criticas.length}
                tone={a.criticas.length > 0 ? "danger" : "muted"}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <RankPanel
                title="Quais kits formar primeiro"
                hint="Ordem por demanda e disponibilidade real de componentes"
                rows={a.kitsSugeridos}
                unit="kits"
                defaultMode="list"
                modes={["list", "bar"]}
                emptyLabel="Nenhum kit cadastrado para este SKU."
              />
              <RankPanel
                title="Kits mais vendidos"
                rows={a.porKit}
                unit="kits"
                defaultMode="list"
                modes={["list", "bar", "pie"]}
                emptyLabel="Sem saídas de kits no período."
              />
              <RankPanel
                title="Prioridade por cor"
                hint="Consumo real, somando vendas avulsas e cores usadas em kits"
                rows={a.porCor}
                defaultMode="bar"
                useRowColors
                emptyLabel="Sem saídas por cor no período."
              />
              <RankPanel
                title="Prioridade por tamanho"
                rows={a.porTamanho}
                defaultMode="bar"
                emptyLabel="Sem saídas por tamanho no período."
              />
            </div>

            <div className="card-elevated p-3">
              <p className="text-sm font-medium">Cor · tamanho com menor cobertura</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Estoque atual e quantos dias ele dura no ritmo do período.
              </p>
              <DataList
                rows={a.variacoes.slice(0, 10).map((v) => ({
                  id: v.id,
                  name: v.name,
                  value: v.qtyStock,
                  color: v.color,
                  extra:
                    v.saidas === 0
                      ? "sem saídas no período"
                      : `${v.saidas} saídas · cobertura ${
                          Number.isFinite(v.cobertura) ? `${v.cobertura.toFixed(0)} dias` : "—"
                        }${v.repor > 0 ? ` · repor ${v.repor} un.` : ""}`,
                }))}
                showShare={false}
              />
            </div>

            <div className="card-elevated p-3">
              <p className="text-sm font-medium">O que fazer neste SKU</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Conclusão baseada em todos os gráficos acima.
              </p>
              <ul className="space-y-2">
                {a.sugestoes.map((s) => (
                  <SuggestionCard key={s.id} s={s} />
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
