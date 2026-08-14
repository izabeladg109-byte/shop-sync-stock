import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  alertLevel,
  computeKitAvailable,
  kitPossibleTotal,
  stockOf,
  toastWithUndo,
  useApplyGrade,
  useApplyMovement,
  useCategories,
  useColors,
  useKitColors,
  useKits,
  useSizes,
  useSkus,
  useStockUnits,
  useTodayMovements,
  useUndoMovement,
  MOVEMENT_SOURCES,
} from "@/lib/erp";
import {
  ALL_PLATFORMS,
  useAllocations,
  usePlatformFilter,
  usePlatforms,
  viewStock,
} from "@/lib/platforms";
import { ColorDot, KitSwatches } from "@/components/kit-swatches";
import { PlatformBadge, PlatformPicker } from "@/components/platform-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Grid3X3, Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/movimentacao")({
  head: () => ({
    meta: [
      { title: "Movimentação rápida — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Fluxo rápido em chips: escolha categoria, SKU, cor ou kit, tamanho e quantidade. Movimenta unidades e kits com atualização imediata.",
      },
      { property: "og:title", content: "Movimentação rápida de estoque" },
      {
        property: "og:description",
        content: "Entradas, saídas, grade completa e movimentações do dia em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MovimentacaoPage,
});

type Mode = "unit" | "kit" | "grade";

const MODE_LABEL: Record<Mode, string> = {
  unit: "Unidade",
  kit: "Kit",
  grade: "Grade",
};

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

function MovimentacaoPage() {
  const { data: categories = [] } = useCategories();
  const { data: skus = [] } = useSkus();
  const { data: colors = [] } = useColors();
  const { data: sizes = [] } = useSizes();
  const { data: kits = [] } = useKits();
  const { data: kitColors = [] } = useKitColors();
  const { data: stock = [] } = useStockUnits();
  const { data: allocations = [] } = useAllocations();
  const { data: today = [] } = useTodayMovements();

  const applyMovement = useApplyMovement();
  const applyGrade = useApplyGrade();
  const undo = useUndoMovement();

  const { data: platforms = [] } = usePlatforms();
  const { platformId: globalPlatform } = usePlatformFilter();
  /** plataforma da movimentação: começa no filtro global e pode ser trocada */
  const [platform, setPlatform] = useState<string>(ALL_PLATFORMS);
  const movementPlatform = platform === ALL_PLATFORMS ? null : platform;
  const scopedStock = useMemo(
    () => viewStock(stock, allocations, platform),
    [stock, allocations, platform],
  );
  useEffect(() => {
    setPlatform(globalPlatform);
  }, [globalPlatform]);

  const [mode, setMode] = useState<Mode>("unit");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [categoryId, setCategoryId] = useState("all");
  const [skuId, setSkuId] = useState("");
  const [refId, setRefId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [qty, setQty] = useState(1);
  const [changeStock, setChangeStock] = useState(true);
  const [note, setNote] = useState("");
  const [grade, setGrade] = useState<Record<string, number>>({});

  const visibleSkus = useMemo(
    () =>
      categoryId === "all"
        ? skus
        : skus.filter((s) =>
            categoryId === "none" ? !s.category_id : s.category_id === categoryId,
          ),
    [skus, categoryId],
  );

  const skuColors = useMemo(() => colors.filter((c) => c.sku_id === skuId), [colors, skuId]);
  const skuSizes = useMemo(() => sizes.filter((s) => s.sku_id === skuId), [sizes, skuId]);
  const skuKits = useMemo(() => kits.filter((k) => k.sku_id === skuId), [kits, skuId]);
  const isKitMode = mode === "kit";

  /** Kits possíveis por kit do SKU — calculado antes de qualquer seleção. */
  const kitPossible = useMemo(() => {
    const map = new Map<string, number>();
    for (const k of skuKits) {
      map.set(k.id, kitPossibleTotal(k.id, k.sku_id, sizes, kitColors, scopedStock));
    }
    return map;
  }, [skuKits, sizes, kitColors, scopedStock]);

  function pickSku(id: string) {
    setSkuId(id);
    setRefId("");
    setSizeId("");
    setGrade(
      Object.fromEntries(
        sizes.filter((s) => s.sku_id === id).map((s) => [s.id, s.grid_qty ?? 0] as const),
      ),
    );
  }

  function pickMode(next: Mode) {
    setMode(next);
    setRefId("");
  }

  const current = useMemo(() => {
    if (!refId || !sizeId) return null;
    if (isKitMode) {
      const value = computeKitAvailable(refId, sizeId, kitColors, scopedStock);
      return { value, label: "kits possíveis neste tamanho", level: alertLevel(value) };
    }
    const value = stockOf(scopedStock, refId, sizeId);
    return { value, label: "unidades em estoque", level: alertLevel(value) };
  }, [isKitMode, refId, sizeId, scopedStock, kitColors]);

  const gradeTotal = skuSizes.reduce((a, s) => a + (grade[s.id] ?? 0), 0);
  const busy = applyMovement.isPending || applyGrade.isPending;

  const todayRows = useMemo(
    () =>
      today.map((m) => ({
        m,
        sku: skus.find((s) => s.id === m.sku_id)?.seller_sku ?? "—",
        size: sizes.find((s) => s.id === m.size_id)?.name ?? "—",
        item:
          m.kind === "kit"
            ? (kits.find((k) => k.id === m.kit_id)?.name ?? "Kit")
            : (colors.find((c) => c.id === m.color_id)?.name ?? "—"),
        hex: m.kind === "unit" ? colors.find((c) => c.id === m.color_id)?.hex : undefined,
      })),
    [today, skus, sizes, kits, colors],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!skuId || !refId) {
      toast.error(`Selecione o SKU e ${isKitMode ? "o kit" : "a cor"}`);
      return;
    }

    if (mode === "grade") {
      const rows = skuSizes.map((s) => ({ size_id: s.id, qty: grade[s.id] ?? 0 }));
      if (rows.every((r) => r.qty <= 0)) {
        toast.error("Informe as quantidades da grade");
        return;
      }
      const ids = await applyGrade.mutateAsync({
        sku_id: skuId,
        kind: "unit",
        direction,
        ref_id: refId,
        rows,
        affect_units: changeStock,
        affect_formed: false,
        ...(note.trim() ? { note: note.trim() } : {}),
        platform_id: movementPlatform,
      });
      toastWithUndo(
        direction === "in" ? "↑ Entrada — grade lançada" : "↓ Saída — grade lançada",
        `${gradeTotal} unidades em ${ids.length} tamanho(s)`,
        () => ids.forEach((id) => undo.mutate(id)),
      );
      return;
    }

    if (!sizeId) {
      toast.error("Selecione o tamanho");
      return;
    }
    if (qty < 1) {
      toast.error("Quantidade precisa ser maior que zero");
      return;
    }

    const movementId = await applyMovement.mutateAsync({
      sku_id: skuId,
      kind: mode,
      direction,
      ref_id: refId,
      size_id: sizeId,
      qty,
      affect_units: changeStock,
      affect_formed: false,
      ...(note.trim() ? { note: note.trim() } : {}),
      source: "manual",
      platform_id: movementPlatform,
    });
    toastWithUndo(
      direction === "in" ? "↑ Entrada registrada" : "↓ Saída registrada",
      `${qty} ${isKitMode ? "kit(s)" : "unidade(s)"}${changeStock ? "" : " (sem alterar estoque)"}`,
      () => undo.mutate(movementId),
    );
    setQty(1);
    setNote("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Movimentação</h1>
        <p className="text-sm text-muted-foreground">
          Fluxo rápido em toques: tipo, SKU, item, tamanho e quantidade.
        </p>
      </header>

      <form onSubmit={submit} className="card-elevated space-y-5 p-4 sm:p-6">
        <Tabs value={mode} onValueChange={(v) => pickMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-3">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <TabsTrigger key={m} value={m} className="text-xs sm:text-sm">
                {MODE_LABEL[m]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <p
          className={cn(
            "rounded-lg px-3 py-2 text-xs",
            isKitMode ? "bg-accent/10 text-accent-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {mode === "unit"
            ? "Unidade: movimenta uma cor específica em um tamanho."
            : mode === "kit"
              ? "Kit: movimenta unidades e kits juntos — o kit abate diretamente as cores que o compõem, sem estoque paralelo."
              : "Grade: lança de uma vez todos os tamanhos de uma cor, usando a grade padrão do SKU."}
        </p>

        {platforms.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Plataforma
            </Label>
            <PlatformPicker value={platform} onChange={setPlatform} className="w-full sm:w-64" />
            <p className="text-xs text-muted-foreground">
              {movementPlatform
                ? direction === "in"
                  ? "A entrada pertence exclusivamente a esta plataforma e também compõe o total físico."
                  : "A saída usa somente o saldo exclusivo desta plataforma."
                : "Sem plataforma: movimenta somente o saldo geral não atribuído."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={direction === "in" ? "default" : "outline"}
            onClick={() => setDirection("in")}
            className="gap-2"
          >
            <ArrowUpRight className="size-4" /> Entrada
          </Button>
          <Button
            type="button"
            variant={direction === "out" ? "default" : "outline"}
            onClick={() => setDirection("out")}
            className="gap-2"
          >
            <ArrowDownRight className="size-4" /> Saída
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Categoria</Label>
          <div className="flex flex-wrap gap-2">
            <Chip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
              Todas
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                <span className="truncate">{c.name}</span>
              </Chip>
            ))}
            <Chip active={categoryId === "none"} onClick={() => setCategoryId("none")}>
              Sem categoria
            </Chip>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">SKU</Label>
          <div className="flex flex-wrap gap-2">
            {visibleSkus.map((s) => (
              <Chip key={s.id} active={skuId === s.id} onClick={() => pickSku(s.id)}>
                <span className="truncate">{s.seller_sku}</span>
              </Chip>
            ))}
            {visibleSkus.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum SKU nesta categoria.</p>
            )}
          </div>
        </div>

        {skuId && isKitMode && skuKits.length > 0 && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Kits possíveis neste SKU
            </Label>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {skuKits.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                  <KitSwatches kitId={k.id} kitColors={kitColors} colors={colors} name={k.name} />
                  <Badge variant={(kitPossible.get(k.id) ?? 0) > 0 ? "secondary" : "destructive"}>
                    {kitPossible.get(k.id) ?? 0}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Kits possíveis = menor estoque entre as cores do kit, somando todos os tamanhos.
            </p>
          </div>
        )}

        {skuId && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {isKitMode ? "Kit" : "Cor"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {isKitMode
                ? skuKits.map((k) => (
                    <Chip key={k.id} active={refId === k.id} onClick={() => setRefId(k.id)}>
                      <KitSwatches
                        kitId={k.id}
                        kitColors={kitColors}
                        colors={colors}
                        name={k.name}
                      />
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {kitPossible.get(k.id) ?? 0}
                      </Badge>
                    </Chip>
                  ))
                : skuColors.map((c) => (
                    <Chip key={c.id} active={refId === c.id} onClick={() => setRefId(c.id)}>
                      <ColorDot hex={c.hex} />
                      <span className="truncate">{c.name}</span>
                    </Chip>
                  ))}
              {(isKitMode ? skuKits : skuColors).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nada cadastrado para este SKU ainda.
                </p>
              )}
            </div>
          </div>
        )}

        {skuId && mode !== "grade" && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tamanho</Label>
            <div className="flex flex-wrap gap-2">
              {skuSizes.map((s) => {
                const value = refId
                  ? isKitMode
                    ? computeKitAvailable(refId, s.id, kitColors, scopedStock)
                    : stockOf(scopedStock, refId, s.id)
                  : null;
                return (
                  <Chip key={s.id} active={sizeId === s.id} onClick={() => setSizeId(s.id)}>
                    <span>{s.name}</span>
                    {value !== null && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {value}
                      </Badge>
                    )}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}

        {skuId && mode === "grade" && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="size-4 text-primary" />
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Grade por tamanho
              </Label>
              <Badge variant="secondary" className="ml-auto">
                {gradeTotal} un.
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {skuSizes.map((s) => (
                <div key={s.id} className="space-y-1">
                  <span className="block text-xs font-medium">{s.name}</span>
                  <Input
                    type="number"
                    min={0}
                    value={grade[s.id] ?? 0}
                    onChange={(e) =>
                      setGrade((p) => ({ ...p, [s.id]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="h-9 text-center"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setGrade(Object.fromEntries(skuSizes.map((s) => [s.id, s.grid_qty ?? 0])))
                }
              >
                Grade padrão
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setGrade(Object.fromEntries(skuSizes.map((s) => [s.id, 0])))}
              >
                Zerar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A grade padrão de cada tamanho é definida em <strong>Cadastros</strong>.
            </p>
          </div>
        )}

        {current && mode !== "grade" && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Atual:{" "}
            <strong
              className={
                current.level === "zero" || current.level === "critico"
                  ? "text-destructive"
                  : current.level === "baixo"
                    ? "text-warning"
                    : "text-foreground"
              }
            >
              {current.value}
            </strong>{" "}
            {current.label}
          </p>
        )}

        {mode !== "grade" && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Quantidade
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="h-10 w-20 text-center text-base font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQty((q) => q + 1)}
              >
                <Plus className="size-4" />
              </Button>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 5, 10].map((n) => (
                  <Chip key={n} active={qty === n} onClick={() => setQty(n)}>
                    {n}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
          <span>
            Alterar estoque
            <span className="block text-xs text-muted-foreground">
              Desligue para apenas registrar a movimentação no histórico.
            </span>
          </span>
          <Switch checked={changeStock} onCheckedChange={setChangeStock} />
        </label>

        <div className="space-y-2">
          <Label htmlFor="note" className="text-xs uppercase tracking-wide text-muted-foreground">
            Observação
          </Label>
          <Input
            id="note"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <Button type="submit" size="lg" className="w-full gap-2" disabled={busy}>
          {mode === "grade"
            ? direction === "in"
              ? "Lançar grade de entrada"
              : "Lançar grade de saída"
            : direction === "in"
              ? "Registrar entrada"
              : "Registrar saída"}
        </Button>
      </form>

      <section className="card-elevated overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <h2 className="font-display text-lg font-semibold">Movimentações de hoje</h2>
          <Badge variant="secondary" className="ml-auto">
            {todayRows.length} registros
          </Badge>
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Hora</th>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-center font-medium">Tam.</th>
                <th className="px-3 py-2 text-center font-medium">Qtd.</th>
                <th className="px-3 py-2 text-left font-medium">Plataforma</th>
                <th className="px-3 py-2 text-left font-medium">Origem</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {todayRows.map(({ m, sku, size, item, hex }) => (
                <tr key={m.id} className={m.undone_at ? "opacity-60" : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{hhmm(m.created_at)}</td>
                  <td className="px-3 py-2 text-xs">{sku}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      {hex && <ColorDot hex={hex} />}
                      {item}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-xs">{size}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-1 font-medium">
                      {m.direction === "in" ? (
                        <ArrowUpRight className="size-3.5 text-accent" />
                      ) : (
                        <ArrowDownRight className="size-3.5 text-primary" />
                      )}
                      {m.qty}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <PlatformBadge platformId={m.platform_id ?? null} />
                  </td>
                  <td className="px-3 py-2 text-xs">{MOVEMENT_SOURCES[m.source] ?? m.source}</td>
                  <td className="px-3 py-2 text-right">
                    {m.undone_at ? (
                      <Badge variant="outline">Desfeita</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => undo.mutate(m.id)}>
                        Desfazer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {todayRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma movimentação registrada hoje.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
