import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  MOVEMENT_SOURCES,
  useAuditLogs,
  useColors,
  useKitColors,
  useKits,
  useMovements,
  useSizes,
  useSkus,
  useStockEdits,
  useUndoMovement,
} from "@/lib/erp";
import { ALL_PLATFORMS, usePlatformFilter, usePlatforms } from "@/lib/platforms";
import { ColorDot, KitSwatches } from "@/components/kit-swatches";
import { PlatformBadge } from "@/components/platform-filter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownRight, ArrowUpRight, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico e auditoria — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Histórico permanente de entradas e saídas com data e hora exatas, usuário, origem, estoque antes e depois e filtros avançados.",
      },
      { property: "og:title", content: "Histórico e auditoria do estoque" },
      {
        property: "og:description",
        content: "Filtros por período, SKU, cor, tamanho, tipo e origem, com desfazer operações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoPage,
});

const ALL = "all";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function HistoricoPage() {
  const { data: movements = [] } = useMovements(500);
  const { data: logs = [] } = useAuditLogs(200);
  const { data: edits = [] } = useStockEdits(300);
  const { data: skus = [] } = useSkus();
  const { data: colors = [] } = useColors();
  const { data: sizes = [] } = useSizes();
  const { data: kits = [] } = useKits();
  const { data: kitColors = [] } = useKitColors();
  const undo = useUndoMovement();

  const [from, setFrom] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [to, setTo] = useState("");
  const [toTime, setToTime] = useState("23:59");
  const [skuId, setSkuId] = useState(ALL);
  const [colorId, setColorId] = useState(ALL);
  const [sizeId, setSizeId] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [direction, setDirection] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [term, setTerm] = useState("");
  const { data: platforms = [] } = usePlatforms();
  const { platformId: globalPlatform } = usePlatformFilter();
  const [platform, setPlatform] = useState(ALL);
  useEffect(() => {
    setPlatform(globalPlatform === ALL_PLATFORMS ? ALL : globalPlatform);
  }, [globalPlatform]);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const start = from ? new Date(`${from}T${fromTime || "00:00"}:00`).getTime() : null;
    const end = to ? new Date(`${to}T${toTime || "23:59"}:59`).getTime() : null;
    const q = term.trim().toLowerCase();
    return movements.filter((m) => {
      const t = new Date(m.created_at).getTime();
      if (start && t < start) return false;
      if (end && t > end) return false;
      if (skuId !== ALL && m.sku_id !== skuId) return false;
      if (colorId !== ALL && m.color_id !== colorId) return false;
      if (sizeId !== ALL && m.size_id !== sizeId) return false;
      if (kind !== ALL && m.kind !== kind) return false;
      if (direction !== ALL && m.direction !== direction) return false;
      if (source !== ALL && m.source !== source) return false;
      if (platform !== ALL && (m.platform_id ?? "") !== platform) return false;
      if (q) {
        const hay = [m.note, m.order_ref, m.user_name].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movements, from, fromTime, to, toTime, skuId, colorId, sizeId, kind, direction, source, platform, term]);

  const skuColors = skuId === ALL ? colors : colors.filter((c) => c.sku_id === skuId);
  const skuSizes = skuId === ALL ? sizes : sizes.filter((s) => s.sku_id === skuId);
  const totalIn = filtered
    .filter((m) => m.direction === "in" && !m.undone_at)
    .reduce((a, m) => a + m.qty, 0);
  const totalOut = filtered
    .filter((m) => m.direction === "out" && !m.undone_at)
    .reduce((a, m) => a + m.qty, 0);

  function reset() {
    setFrom("");
    setFromTime("00:00");
    setTo("");
    setToTime("23:59");
    setSkuId(ALL);
    setColorId(ALL);
    setSizeId(ALL);
    setKind(ALL);
    setDirection(ALL);
    setSource(ALL);
    setPlatform(ALL);
    setTerm("");
  }

  function itemLabel(m: (typeof movements)[number]) {
    if (m.kind === "kit" && m.kit_id) {
      const kit = kits.find((k) => k.id === m.kit_id);
      return (
        <KitSwatches
          kitId={m.kit_id}
          kitColors={kitColors}
          colors={colors}
          {...(kit?.name ? { name: kit.name } : {})}
        />
      );
    }
    const color = colors.find((c) => c.id === m.color_id);
    return (
      <span className="inline-flex items-center gap-1.5">
        {color && <ColorDot hex={color.hex} />}
        {color?.name ?? "—"}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Histórico</h1>
          <p className="text-sm text-muted-foreground">
            Registro permanente de todas as movimentações, com estoque antes e depois.
          </p>
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Todas"],
            ["in", "Entradas"],
            ["out", "Saídas"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={direction === value ? "default" : "outline"}
            onClick={() => setDirection(value)}
          >
            {label}
          </Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{filtered.length} registros</Badge>
          <Badge variant="outline">+{totalIn}</Badge>
          <Badge variant="outline">−{totalOut}</Badge>
        </div>
      </div>

      {showFilters && (
      <section className="card-elevated space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Data inicial</Label>
            <div className="flex gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input
                type="time"
                value={fromTime}
                aria-label="Hora inicial"
                onChange={(e) => setFromTime(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data final</Label>
            <div className="flex gap-2">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <Input
                type="time"
                value={toTime}
                aria-label="Hora final"
                onChange={(e) => setToTime(e.target.value)}
                className="w-28"
              />
            </div>
          </div>


          <div className="space-y-1">
            <Label className="text-xs">SKU</Label>
            <Select
              value={skuId}
              onValueChange={(v) => {
                setSkuId(v);
                setColorId(ALL);
                setSizeId(ALL);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os SKUs</SelectItem>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seller_sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cor</Label>
            <Select value={colorId} onValueChange={setColorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as cores</SelectItem>
                {skuColors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <ColorDot hex={c.hex} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tamanho</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {skuSizes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Unidade e kit</SelectItem>
                <SelectItem value="unit">Unidade</SelectItem>
                <SelectItem value="kit">Kit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Movimento</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Entradas e saídas</SelectItem>
                <SelectItem value="in">Entradas</SelectItem>
                <SelectItem value="out">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Origem</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as origens</SelectItem>
                {Object.entries(MOVEMENT_SOURCES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Plataforma</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as plataformas</SelectItem>
                <SelectItem value="">Sem plataforma (geral)</SelectItem>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por pedido, observação ou usuário"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full sm:w-72"
          />
          <Button variant="outline" onClick={reset}>
            Limpar filtros
          </Button>
        </div>
      </section>
      )}


      <section className="grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Registros</p>
          <p className="font-display text-2xl font-semibold">{filtered.length}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Entradas</p>
          <p className="font-display text-2xl font-semibold text-accent">+{totalIn}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saídas</p>
          <p className="font-display text-2xl font-semibold text-primary">−{totalOut}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo do período</p>
          <p className="font-display text-2xl font-semibold">{totalIn - totalOut}</p>
        </div>
      </section>

      <section className="card-elevated overflow-hidden">
        <h2 className="px-4 py-3 font-display text-lg font-semibold">Movimentações</h2>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Data e hora</th>
                <th className="px-3 py-2 text-left font-medium">Usuário</th>
                <th className="px-3 py-2 text-left font-medium">Origem</th>
                <th className="px-3 py-2 text-left font-medium">Plataforma</th>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-center font-medium">Tam.</th>
                <th className="px-3 py-2 text-center font-medium">Qtd.</th>
                <th className="px-3 py-2 text-center font-medium">Antes</th>
                <th className="px-3 py-2 text-center font-medium">Depois</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((m) => (
                <tr key={m.id} className={m.undone_at ? "opacity-60" : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmt(m.created_at)}</td>
                  <td className="px-3 py-2 text-xs">{m.user_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {MOVEMENT_SOURCES[m.source] ?? m.source}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformBadge platformId={m.platform_id ?? null} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {skus.find((s) => s.id === m.sku_id)?.seller_sku ?? "—"}
                  </td>
                  <td className="max-w-[220px] px-3 py-2">{itemLabel(m)}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {sizes.find((s) => s.id === m.size_id)?.name ?? "—"}
                  </td>
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
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {m.stock_before ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-medium">
                    {m.stock_after ?? "—"}
                  </td>
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma movimentação para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-elevated overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="font-display text-lg font-semibold">Alterações diretas de estoque</h2>
          <p className="text-xs text-muted-foreground">
            Edições manuais feitas na tela de estoque, com data, hora e usuário.
          </p>
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Data e hora</th>
                <th className="px-3 py-2 text-left font-medium">Usuário</th>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-left font-medium">Cor</th>
                <th className="px-3 py-2 text-center font-medium">Tam.</th>
                <th className="px-3 py-2 text-center font-medium">Antes</th>
                <th className="px-3 py-2 text-center font-medium">Alteração</th>
                <th className="px-3 py-2 text-center font-medium">Depois</th>
                <th className="px-3 py-2 text-left font-medium">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {edits.map((e) => {
                const color = colors.find((c) => c.id === e.color_id);
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{fmt(e.created_at)}</td>
                    <td className="px-3 py-2 text-xs">{e.user_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {skus.find((s) => s.id === e.sku_id)?.seller_sku ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {color && <ColorDot hex={color.hex} />}
                        {color?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {sizes.find((s) => s.id === e.size_id)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                      {e.qty_before}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={
                          e.delta > 0
                            ? "font-medium text-accent"
                            : e.delta < 0
                              ? "font-medium text-primary"
                              : "text-muted-foreground"
                        }
                      >
                        {e.delta > 0 ? `+${e.delta}` : e.delta}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-medium">{e.qty_after}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.note ?? "—"}</td>
                  </tr>
                );
              })}
              {edits.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma alteração direta registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-elevated p-4">
        <h2 className="mb-3 font-display text-lg font-semibold">Auditoria</h2>

        <ul className="divide-y divide-border">
          {logs.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="flex-1">
                {l.action}
                {l.entity ? ` · ${l.entity}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {l.device ?? "—"} · {fmt(l.created_at)}
              </span>
            </li>
          ))}
          {logs.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Nenhum registro de auditoria.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
