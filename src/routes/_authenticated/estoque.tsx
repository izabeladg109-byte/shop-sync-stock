import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  alertLevel,
  computeKitAvailable,
  stockOf,
  useCategories,
  useColors,
  useKitColors,
  useKits,
  useMovements,
  useSetSkuLock,
  useSetUnitStock,
  useSizes,
  useSkus,
  useStockUnits,
  useUserPrefs,
  type DistMode,
  type KitView,
} from "@/lib/erp";
import {
  demandMaps,
  kitDemand,
  planSize,
  salesMix,
  type ColorSizePlan,
} from "@/lib/analytics";

import {
  ALL_PLATFORMS,
  allocationOf,
  freeOf,
  reservedOf,
  useAllocations,
  usePlatformFilter,
  usePlatforms,
  useSetAllocation,
  viewStock,
} from "@/lib/platforms";

import { ColorDot, KitSwatches } from "@/components/kit-swatches";
import { PlatformFilter } from "@/components/platform-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronDown, Eye, EyeOff, Lock, LockOpen, Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque por categoria e SKU — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Estoque por categoria, SKU, cor e tamanho, com trava por item, kits possíveis e estoque distribuído com ou sem reserva para venda unitária.",
      },
      { property: "og:title", content: "Estoque por categoria e SKU" },
      {
        property: "og:description",
        content: "Unidades por cor e tamanho, trava de edição, kits possíveis e distribuição.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EstoquePage,
});

type View = "unidades" | "kits";

const KIT_VIEW_LABEL: Record<"possiveis" | "distribuido", string> = {
  possiveis: "Kits possíveis",
  distribuido: "Estoque distribuído",
};

const DIST_MODE_HINT: Record<DistMode, string> = {
  kits: "Todo o estoque disponível é destinado à formação de kits — nada é reservado para venda avulsa.",
  unidade:
    "Reserva primeiro as unidades para venda avulsa (na proporção do histórico) e só depois monta kits.",
  inteligente:
    "Decide cor por cor e tamanho por tamanho conforme o histórico real de saídas, e explica cada escolha.",
};


/**
 * Célula de quantidade: salva sozinha logo após a digitação (sem esperar sair
 * da tela) e imediatamente nos botões + / − do desktop.
 */
function QtyCell({
  qty,
  locked,
  compact,
  onChange,
}: {
  qty: number;
  locked: boolean;
  compact: boolean;
  onChange: (next: number) => void;
}) {
  const level = alertLevel(qty);
  const tone =
    level === "zero" || level === "critico"
      ? "border-destructive text-destructive"
      : level === "baixo"
        ? "border-warning text-warning"
        : "";

  const [draft, setDraft] = useState(String(qty));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // valor vindo do banco/outro dispositivo só sobrescreve quando não há edição pendente
  useEffect(() => {
    if (!dirty.current) setDraft(String(qty));
  }, [qty]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (raw: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dirty.current = false;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || !raw.trim()) {
      setDraft(String(qty));
      return;
    }
    const value = Math.floor(next);
    if (value === qty) {
      setDraft(String(qty));
      return;
    }
    setDraft(String(value));
    onChange(value);
  };

  const field = (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      value={draft}
      disabled={locked}
      title={locked ? "SKU travado: edição manual bloqueada" : undefined}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value;
        dirty.current = true;
        setDraft(raw);
        if (timer.current) clearTimeout(timer.current);
        // salva sozinho pouco depois da digitação parar
        timer.current = setTimeout(() => commit(raw), 700);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => commit(e.target.value)}
      className={`h-8 w-14 px-1 text-center text-sm ${tone}`}
    />
  );

  if (compact) return <div className="flex justify-center">{field}</div>;

  const step = (delta: number) => {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    const next = Math.max(0, qty + delta);
    if (next === qty) return;
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        aria-label="Diminuir"
        disabled={locked || qty <= 0}
        onClick={() => step(-1)}
        className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      {field}
      <button
        type="button"
        aria-label="Aumentar"
        disabled={locked}
        onClick={() => step(1)}
        className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}


function EstoquePage() {
  const { data: categories = [] } = useCategories();
  const { data: skus = [] } = useSkus();
  const { data: colors = [] } = useColors();
  const { data: sizes = [] } = useSizes();
  const { data: kits = [] } = useKits();
  const { data: kitColors = [] } = useKitColors();
  const { data: stock = [] } = useStockUnits();
  const { data: movements = [] } = useMovements(500);
  const { data: allocations = [] } = useAllocations();
  const { data: platforms = [] } = usePlatforms();
  const { platformId, isAll } = usePlatformFilter();
  const setStock = useSetUnitStock();
  const setAllocation = useSetAllocation();
  const platformName = platforms.find((p) => p.id === platformId)?.name ?? "";
  const setLock = useSetSkuLock();
  const { prefs, save: savePrefs } = useUserPrefs();
  const isMobile = useIsMobile();

  /** Kits e distribuição respeitam o recorte de plataforma selecionado. */
  const stockView = useMemo(
    () => viewStock(stock, allocations, platformId),
    [stock, allocations, platformId],
  );

  const [view, setView] = useState<View>("unidades");
  const [kitView, setKitView] = useState<KitView | null>(null);
  const activeKitView: "possiveis" | "distribuido" =
    kitView && kitView !== "real"
      ? kitView
      : prefs.kit_view === "distribuido"
        ? "distribuido"
        : "possiveis";
  const [term, setTerm] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showHidden, setShowHidden] = useState(false);

  const hidden = useMemo(() => new Set(prefs.hidden_skus), [prefs.hidden_skus]);
  const distMode: DistMode = prefs.dist_mode;

  const toggleHidden = (skuId: string) => {
    const next = hidden.has(skuId)
      ? prefs.hidden_skus.filter((id) => id !== skuId)
      : [...prefs.hidden_skus, skuId];
    savePrefs.mutate({ hidden_skus: next });
  };

  /** Pesos de demanda por kit e reserva para venda unitária (histórico real). */
  const weights = useMemo(
    () => kitDemand(movements.filter((m) => !m.undone_at)),
    [movements],
  );
  const mixBySku = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sku of skus) {
      const mix = salesMix(movements.filter((m) => !m.undone_at && m.sku_id === sku.id));
      // sem histórico: mantém metade para unidade
      map[sku.id] = mix.total > 0 ? 1 - mix.kitShare : 0.5;
    }
    return map;
  }, [skus, movements]);

  const grouped = useMemo(() => {
    const q = term.trim().toLowerCase();
    const buckets = [
      ...categories.map((c) => ({ id: c.id, name: c.name })),
      { id: "none", name: "Sem categoria" },
    ];
    return buckets
      .map((bucket) => ({
        ...bucket,
        skus: skus.filter(
          (s) =>
            !hidden.has(s.id) &&
            (bucket.id === "none" ? !s.category_id : s.category_id === bucket.id) &&
            (!q || s.name.toLowerCase().includes(q) || s.seller_sku.toLowerCase().includes(q)),
        ),
      }))
      .filter((b) => b.skus.length > 0);
  }, [categories, skus, term, hidden]);

  const hiddenSkus = useMemo(() => skus.filter((s) => hidden.has(s.id)), [skus, hidden]);

  /** Distribuição por SKU + tamanho, calculada uma vez por render. */
  const { distribution, unitsFree, plans, reasonsBySku } = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    const free: Record<string, Record<string, number>> = {};
    const planMap: Record<string, ColorSizePlan> = {};
    const reasons: Record<string, string[]> = {};
    if (view !== "kits" || activeKitView !== "distribuido") {
      return { distribution: out, unitsFree: free, plans: planMap, reasonsBySku: reasons };
    }
    const live = movements.filter((m) => !m.undone_at);
    const demand = demandMaps(live);
    for (const sku of skus) {
      if (hidden.has(sku.id)) continue;
      const skuKits = kits.filter((k) => k.sku_id === sku.id);
      if (skuKits.length === 0) continue;
      const skuColors = colors.filter((c) => c.sku_id === sku.id);
      const seen = new Set<string>();
      for (const size of sizes.filter((s) => s.sku_id === sku.id)) {
        const res = planSize({
          sizeId: size.id,
          kits: skuKits,
          kitColors,
          colors: skuColors,
          stock: stockView,
          weights,
          mode: distMode,
          unitDemand: demand.unit,
          kitDemand: demand.kit,
          fallbackUnitShare: mixBySku[sku.id] ?? 0.5,
        });
        for (const [kitId, qty] of Object.entries(res.perKit)) {
          (out[kitId] ??= {})[size.id] = qty;
        }
        for (const p of res.plans) {
          (free[p.colorId] ??= {})[size.id] = p.freeUnits;
          planMap[`${p.colorId}|${size.id}`] = p;
          if (p.total > 0 && p.reason && !seen.has(p.reason)) {
            seen.add(p.reason);
            const cor = skuColors.find((c) => c.id === p.colorId)?.name ?? "";
            (reasons[sku.id] ??= []).push(`${cor} ${size.name}: ${p.reason}`);
          }
        }
      }
    }
    return { distribution: out, unitsFree: free, plans: planMap, reasonsBySku: reasons };
  }, [
    view,
    activeKitView,
    skus,
    kits,
    sizes,
    colors,
    kitColors,
    stockView,
    weights,
    distMode,
    mixBySku,
    hidden,
    movements,
  ]);

  const skuReasons = (skuId: string) => (reasonsBySku[skuId] ?? []).slice(0, 6);



  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Organizado por categoria, SKU, cor e tamanho.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar SKU ou nome"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full sm:w-56"
          />
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="unidades">Unidades</TabsTrigger>
              <TabsTrigger value="kits">Kits</TabsTrigger>
            </TabsList>
          </Tabs>
          <PlatformFilter />
        </div>
        <p className="text-xs text-muted-foreground">
          {isAll
            ? "Estoque geral: quantidade física total. Abaixo de cada célula aparece quanto já está reservado para plataformas."
            : `Mostrando a reserva de ${platformName}. Editar aqui apenas move parte do estoque geral para esta plataforma — nada é criado nem duplicado.`}
        </p>
      </header>

      {view === "kits" && (
        <div className="card-elevated space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={activeKitView} onValueChange={(v) => setKitView(v as KitView)}>
              <TabsList>
                {(Object.keys(KIT_VIEW_LABEL) as ("possiveis" | "distribuido")[]).map((k) => (
                  <TabsTrigger key={k} value={k} className="text-xs sm:text-sm">
                    {KIT_VIEW_LABEL[k]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              size="sm"
              variant="outline"
              disabled={activeKitView === prefs.kit_view || savePrefs.isPending}
              onClick={() => savePrefs.mutate({ kit_view: activeKitView })}
            >
              Definir como padrão
            </Button>
          </div>

          {activeKitView === "distribuido" && (
            <div className="space-y-2">
              <Tabs
                value={distMode}
                onValueChange={(v) => savePrefs.mutate({ dist_mode: v as DistMode })}
              >
                <TabsList className="flex w-full flex-wrap">
                  <TabsTrigger value="kits" className="text-xs sm:text-sm">
                    Priorizar kits
                  </TabsTrigger>
                  <TabsTrigger value="unidade" className="text-xs sm:text-sm">
                    Priorizar unidade
                  </TabsTrigger>
                  <TabsTrigger value="inteligente" className="text-xs sm:text-sm">
                    Estoque inteligente
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs leading-snug text-muted-foreground">
                {DIST_MODE_HINT[distMode]}
              </p>
            </div>
          )}


          <p className="text-xs text-muted-foreground">
            {activeKitView === "possiveis"
              ? "Quantos kits podem ser montados com as unidades atuais (menor estoque entre as cores)."
              : "Planejamento: kits sem componentes cadastrados não recebem distribuição, e nenhum estoque é duplicado."}
          </p>
        </div>
      )}

      {grouped.length === 0 && (
        <p className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {skus.length === 0
            ? "Nenhum SKU cadastrado. Comece em Cadastros."
            : "Nenhum SKU visível com os filtros atuais."}
        </p>
      )}

      {grouped.map((bucket) => (
        <section key={bucket.id} className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-brand-gradient">{bucket.name}</h2>

          {bucket.skus.map((sku) => {
            const skuSizes = sizes.filter((s) => s.sku_id === sku.id);
            const skuColors = colors.filter((c) => c.sku_id === sku.id);
            const skuKits = kits.filter((k) => k.sku_id === sku.id);
            const isCollapsed = collapsed[sku.id] ?? false;

            return (
              <div key={sku.id} className="card-elevated overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 sm:px-4 sm:py-3">
                  <button
                    type="button"
                    onClick={() => setCollapsed((p) => ({ ...p, [sku.id]: !isCollapsed }))}
                    className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-muted/50 sm:gap-3 sm:px-2"
                  >
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{sku.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sku.seller_sku}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      {view === "unidades" ? `${skuColors.length} cores` : `${skuKits.length} kits`}
                    </Badge>
                    <button
                      type="button"
                      aria-label="Ocultar SKU"
                      title="Ocultar este SKU da minha visualização"
                      onClick={() => toggleHidden(sku.id)}
                      className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <EyeOff className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={sku.locked ? "Destravar SKU" : "Travar SKU"}
                      title={
                        sku.locked
                          ? "SKU travado: edição manual bloqueada (movimentações e OCR continuam liberados)"
                          : "Travar edição manual deste SKU"
                      }
                      onClick={() => setLock.mutate({ sku_id: sku.id, locked: !sku.locked })}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        sku.locked
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {sku.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                      <span className="hidden sm:inline">
                        {sku.locked ? "Travado" : "Destravado"}
                      </span>
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 text-left font-medium sm:px-4">
                            {view === "unidades" ? "Cor" : "Kit"}
                          </th>
                          {skuSizes.map((size) => (
                            <th key={size.id} className="px-1 py-2 text-center font-medium sm:px-3">
                              {size.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {view === "unidades"
                          ? skuColors.map((color) => (
                              <tr key={color.id}>
                                <td className="sticky left-0 z-10 bg-card px-2 py-1.5 sm:px-4">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ColorDot hex={color.hex} className="size-4" />
                                    <span className="max-w-24 truncate sm:max-w-none">
                                      {color.name}
                                    </span>
                                  </span>
                                </td>
                                {skuSizes.map((size) => {
                                  const total = stockOf(stock, color.id, size.id);
                                  const reserved = reservedOf(allocations, color.id, size.id);
                                  const free = freeOf(stock, allocations, color.id, size.id);
                                  const alloc = allocationOf(
                                    allocations,
                                    platformId,
                                    color.id,
                                    size.id,
                                  );
                                   const current = isAll ? free : alloc;
                                  return (
                                  <td key={size.id} className="px-1 py-1.5 sm:px-2">
                                    <QtyCell
                                      qty={current}
                                      locked={sku.locked}
                                      compact={isMobile}
                                      onChange={(next) =>
                                        isAll
                                          ? setStock.mutate({
                                              sku_id: sku.id,
                                              color_id: color.id,
                                              size_id: size.id,
                                               qty: reserved + next,
                                               previous: total,
                                              note: `Alteração direta no estoque (${color.name} · ${size.name})`,
                                            })
                                          : setAllocation.mutate({
                                              platform_id: platformId,
                                              sku_id: sku.id,
                                              color_id: color.id,
                                              size_id: size.id,
                                              qty: next,
                                            })
                                      }
                                    />
                                    <span className="mt-0.5 block text-center text-[10px] leading-tight text-muted-foreground">
                                       {isAll
                                         ? reserved > 0
                                           ? `geral ${free} · plataformas ${reserved}`
                                           : "saldo geral"
                                         : `exclusivo · físico total ${total}`}
                                    </span>
                                  </td>
                                  );
                                })}

                              </tr>
                            ))
                          : skuKits.map((kit) => {
                              const componentes = kitColors.filter(
                                (kc) => kc.kit_id === kit.id,
                              ).length;
                              return (
                                <tr key={kit.id}>
                                  <td className="sticky left-0 z-10 bg-card px-2 py-2 font-medium sm:px-4">
                                    <KitSwatches
                                      kitId={kit.id}
                                      kitColors={kitColors}
                                      colors={colors}
                                      name={kit.name}
                                      dotClassName="size-4"
                                      className="max-w-32 sm:max-w-none"
                                    />
                                    {componentes === 0 && (
                                      <span className="mt-0.5 block text-[11px] text-destructive">
                                        Sem cores no kit
                                      </span>
                                    )}
                                  </td>
                                  {skuSizes.map((size) => {
                                    const possible = computeKitAvailable(
                                      kit.id,
                                      size.id,
                                      kitColors,
                                      stockView,
                                    );
                                    const value =
                                      activeKitView === "possiveis"
                                        ? possible
                                        : (distribution[kit.id]?.[size.id] ?? 0);
                                    return (
                                      <td
                                        key={size.id}
                                        className="px-1 py-2 text-center sm:px-3"
                                      >
                                        <span className="block text-sm font-semibold">{value}</span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          {activeKitView === "possiveis"
                                            ? "possíveis"
                                            : `de ${possible}`}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}

                        {view === "kits" &&
                          activeKitView === "distribuido" &&
                          distMode !== "kits" &&
                          skuKits.length > 0 && (
                            <>
                              <tr className="bg-muted/30">
                                <td
                                  colSpan={skuSizes.length + 1}
                                  className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:px-4"
                                >
                                  Sobra para venda unitária
                                </td>
                              </tr>
                              {skuColors.map((color) => (
                                <tr key={`free-${color.id}`}>
                                  <td className="sticky left-0 z-10 bg-card px-2 py-1.5 sm:px-4">
                                    <span className="flex min-w-0 items-center gap-2">
                                      <ColorDot hex={color.hex} className="size-4" />
                                      <span className="max-w-24 truncate text-xs sm:max-w-none">
                                        {color.name}
                                      </span>
                                    </span>
                                  </td>
                                  {skuSizes.map((size) => {
                                    const total = stockOf(stockView, color.id, size.id);
                                    const livre = unitsFree[color.id]?.[size.id] ?? total;
                                    const plan = plans[`${color.id}|${size.id}`];
                                    return (
                                      <td
                                        key={size.id}
                                        className="px-1 py-1.5 text-center sm:px-3"
                                        title={plan?.reason}
                                      >
                                        <span className="block text-sm font-semibold text-accent">
                                          {livre}
                                        </span>
                                        <span className="block text-[11px] text-muted-foreground">
                                          de {total}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {distMode === "inteligente" && (
                                <tr>
                                  <td
                                    colSpan={skuSizes.length + 1}
                                    className="px-2 py-2 text-[11px] leading-snug text-muted-foreground sm:px-4"
                                  >
                                    {skuReasons(sku.id).length === 0
                                      ? "Sem saídas registradas no período — distribuição equilibrada."
                                      : skuReasons(sku.id).map((r) => (
                                          <span key={r} className="block">
                                            • {r}
                                          </span>
                                        ))}
                                  </td>
                                </tr>
                              )}
                            </>
                          )}

                      </tbody>

                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {hiddenSkus.length > 0 && (
        <section className="card-elevated p-3">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-sm font-medium"
          >
            <Eye className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              SKUs ocultos ({hiddenSkus.length})
            </span>
            <ChevronDown
              className={`size-4 shrink-0 transition-transform ${showHidden ? "" : "-rotate-90"}`}
            />
          </button>
          {showHidden && (
            <ul className="mt-3 divide-y divide-border">
              {hiddenSkus.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {s.seller_sku} — {s.name}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => toggleHidden(s.id)}>
                    Exibir
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            A ocultação é apenas visual e individual: ao exibir novamente, o SKU volta à posição
            original.
          </p>
        </section>
      )}
    </div>
  );
}
