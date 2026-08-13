import { type ReactNode, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { BreakdownRow, PerfClass, SizeCoverage } from "@/lib/analytics";
import { PERF_LABEL } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  BarChart3,
  ChevronDown,
  EyeOff,
  List,
  Maximize2,
  Minimize2,
  PieChart as PieIcon,
} from "lucide-react";

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Tooltip com contraste garantido no modo claro e escuro. */
export const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.18)",
} as const;

export const tooltipLabelStyle = { color: "var(--popover-foreground)", fontWeight: 600 } as const;
export const tooltipItemStyle = { color: "var(--popover-foreground)" } as const;

export function EmptyData({
  label = "Dados insuficientes para esta análise.",
}: {
  label?: string;
}) {
  return (
    <div className="grid min-h-24 place-items-center px-3 py-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

/** Área de gráfico com altura responsiva e rolagem horizontal opcional. */
export function ChartBox({
  children,
  minWidth,
  height,
  expanded = false,
}: {
  children: ReactNode;
  /** largura mínima do gráfico — habilita rolagem horizontal no celular */
  minWidth?: number;
  height?: number;
  expanded?: boolean;
}) {
  const isMobile = useIsMobile();
  const base = isMobile ? 170 : 230;
  const big = isMobile ? 300 : 380;
  const h = height ?? (expanded ? big : base);
  return (
    <div className="-mx-1 w-full overflow-x-auto px-1">
      <div style={{ height: h, minWidth: minWidth ?? "100%", width: minWidth ? minWidth : "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as never}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export type ListRow = {
  id: string;
  name: string;
  value: number;
  extra?: string;
  color?: string;
  node?: ReactNode;
};

/** Lista com posição, quantidade e participação percentual. */
export function DataList({
  rows,
  unit = "un.",
  showRank = true,
  showShare = true,
  limit,
}: {
  rows: ListRow[];
  unit?: string;
  showRank?: boolean;
  showShare?: boolean;
  limit?: number;
}) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
  const visible = typeof limit === "number" ? rows.slice(0, limit) : rows;
  if (visible.length === 0) return <EmptyData />;
  return (
    <ul className="divide-y divide-border">
      {visible.map((r, i) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm">
          {showRank && (
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
              {i + 1}.
            </span>
          )}
          {r.node ? (
            <span className="min-w-0 flex-1">{r.node}</span>
          ) : (
            <>
              {r.color && (
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: r.color }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
            </>
          )}
          <span className="ml-auto shrink-0 font-medium tabular-nums">
            {r.value} {unit}
          </span>
          {showShare && total > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {((Math.max(0, r.value) / total) * 100).toFixed(0)}%
            </span>
          )}
          {r.extra && (
            <span className="w-full shrink-0 pl-7 text-xs text-muted-foreground sm:w-auto sm:pl-0">
              {r.extra}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Legenda em grade: nome, quantidade e percentual — usada abaixo dos gráficos. */
function LegendGrid({ rows, unit }: { rows: ListRow[]; unit: string }) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
      {rows.slice(0, 8).map((r, i) => (
        <li key={r.id} className="flex min-w-0 items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: r.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
          <span className="shrink-0 tabular-nums">
            {r.value} {unit}
          </span>
          <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
            {total > 0 ? `${((Math.max(0, r.value) / total) * 100).toFixed(0)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type ViewMode = "bar" | "pie" | "list";

const MODE_ICON: Record<ViewMode, typeof List> = {
  bar: BarChart3,
  pie: PieIcon,
  list: List,
};
const MODE_LABEL: Record<ViewMode, string> = {
  bar: "Barras",
  pie: "Gráfico redondo",
  list: "Lista",
};

function ModeSwitch({
  modes,
  mode,
  setMode,
}: {
  modes: ViewMode[];
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
}) {
  if (modes.length < 2) return null;
  return (
    <div className="flex shrink-0 rounded-lg border border-border p-0.5">
      {modes.map((m) => {
        const Icon = MODE_ICON[m];
        return (
          <button
            key={m}
            type="button"
            aria-label={MODE_LABEL[m]}
            title={MODE_LABEL[m]}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              mode === m ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function PanelShell({
  title,
  hint,
  badge,
  actions,
  children,
  className,
  collapsible = true,
  onHide,
}: {
  title: string;
  hint?: string | undefined;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  collapsible?: boolean;
  /** quando informado, mostra o botão "ocultar este gráfico" */
  onHide?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={cn("card-elevated min-w-0 overflow-hidden p-3 sm:p-4", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <button
          type="button"
          onClick={() => collapsible && setOpen((v) => !v)}
          className="min-w-0 text-left"
        >
          <h3 className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold sm:text-base">
            {collapsible && (
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  !open && "-rotate-90",
                )}
              />
            )}
            <span className="min-w-0 break-words">{title}</span>
          </h3>
          {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
          {badge}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {onHide && (
            <button
              type="button"
              aria-label="Ocultar este gráfico"
              title="Ocultar este gráfico"
              onClick={onHide}
              className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <EyeOff className="size-4" />
            </button>
          )}
        </div>
      </div>
      {open && <div className="mt-3 min-w-0">{children}</div>}
    </section>
  );
}

/** Cartão de painel para gráficos customizados (mantém a API antiga chart/list). */
export function Panel({
  title,
  hint,
  chart,
  list,
  className,
  defaultMode = "chart",
  empty,
  badge,
  onHide,
}: {
  title: string;
  hint?: string | undefined;
  chart?: ReactNode;
  list?: ReactNode;
  className?: string;
  defaultMode?: "chart" | "list";
  empty?: boolean;
  badge?: ReactNode;
  onHide?: (() => void) | undefined;
}) {
  const [mode, setMode] = useState<"chart" | "list">(defaultMode);
  const canToggle = Boolean(chart && list);
  const content = empty ? <EmptyData /> : mode === "chart" && chart ? chart : (list ?? chart);

  return (
    <PanelShell
      title={title}
      hint={hint}
      badge={badge}
      className={className}
      onHide={onHide}

      actions={
        canToggle && !empty ? (
          <ModeSwitch
            modes={["bar", "list"]}
            mode={mode === "chart" ? "bar" : "list"}
            setMode={(m) => setMode(m === "list" ? "list" : "chart")}
          />
        ) : null
      }
    >
      {content}
    </PanelShell>
  );
}

/**
 * Painel de ranking: mesma fonte de dados renderizada como barras,
 * gráfico redondo ou lista, sempre com quantidade + percentual + posição.
 */
export function RankPanel({
  title,
  hint,
  rows,
  unit = "un.",
  modes = ["bar", "pie", "list"],
  defaultMode = "bar",
  className,
  emptyLabel,
  useRowColors = false,
  compactLimit = 6,
  onHide,
}: {
  title: string;
  hint?: string | undefined;
  rows: ListRow[];
  unit?: string;
  modes?: ViewMode[];
  defaultMode?: ViewMode;
  className?: string | undefined;
  emptyLabel?: string;
  /** usa a cor real de cada linha (paleta de cores do SKU) */
  useRowColors?: boolean;
  compactLimit?: number;
  onHide?: (() => void) | undefined;
}) {
  const [mode, setMode] = useState<ViewMode>(
    modes.includes(defaultMode) ? defaultMode : (modes[0] as ViewMode),
  );
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

  const data = useMemo(() => rows.filter((r) => Number.isFinite(r.value)), [rows]);
  const chartRows = useMemo(
    () => (expanded ? data : data.slice(0, isMobile ? compactLimit : Math.max(compactLimit, 10))),
    [data, expanded, isMobile, compactLimit],
  );
  const pieRows = useMemo(() => chartRows.filter((r) => r.value > 0), [chartRows]);
  const fill = (r: ListRow, i: number) =>
    (useRowColors && r.color) || CHART_COLORS[i % CHART_COLORS.length] || "var(--primary)";

  const empty = data.length === 0 || data.every((r) => r.value === 0);

  return (
    <PanelShell
      title={title}
      hint={hint}
      className={className}
      onHide={onHide}

      actions={
        empty ? null : (
          <>
            <ModeSwitch modes={modes} mode={mode} setMode={setMode} />
            <button
              type="button"
              aria-label={expanded ? "Reduzir gráfico" : "Expandir gráfico"}
              title={expanded ? "Reduzir" : "Expandir"}
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </>
        )
      }
    >
      {empty ? (
        <EmptyData {...(emptyLabel ? { label: emptyLabel } : {})} />
      ) : mode === "list" ? (
        <DataList rows={data} unit={unit} {...(expanded ? {} : { limit: isMobile ? 8 : 12 })} />
      ) : mode === "pie" ? (
        <>
          <ChartBox expanded={expanded}>
            <PieChart>
              <Pie
                data={pieRows}
                dataKey="value"
                nameKey="name"
                innerRadius="45%"
                outerRadius="78%"
                paddingAngle={1}
              >
                {pieRows.map((r, i) => (
                  <Cell key={r.id} fill={fill(r, i)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v: number) => [`${v} ${unit}`, ""]}
              />
            </PieChart>
          </ChartBox>
          <LegendGrid rows={pieRows} unit={unit} />
        </>
      ) : (
        <>
          <ChartBox
            expanded={expanded}
            minWidth={Math.max(280, chartRows.length * (isMobile ? 52 : 64))}
          >
            <BarChart data={chartRows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                interval={0}
                height={38}
                angle={-25}
                textAnchor="end"
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
                formatter={(v: number) => [`${v} ${unit}`, ""]}
              />
              <Bar dataKey="value" name={unit} radius={[6, 6, 0, 0]}>
                {chartRows.map((r, i) => (
                  <Cell key={r.id} fill={fill(r, i)} />
                ))}
              </Bar>
            </BarChart>
          </ChartBox>
          <LegendGrid rows={chartRows} unit={unit} />
        </>
      )}
    </PanelShell>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "brand" | "accent" | "warn" | "danger" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "warn"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-primary";
  return (
    <div className="card-elevated min-w-0 p-2.5 sm:p-3">
      <p className="truncate text-[10px] uppercase leading-tight tracking-wide text-muted-foreground sm:text-[11px]">
        {label}
      </p>
      <p className={cn("font-display text-lg font-semibold leading-tight sm:text-2xl", toneClass)}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Título de seção do painel. */
export function SectionTitle({
  children,
  id,
  hint,
}: {
  children: ReactNode;
  id?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 pt-1">
      <h2 id={id} className="font-display text-base font-semibold text-brand-gradient sm:text-xl">
        {children}
      </h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Listas com abertura por tamanho (kits, unidades e cores)
 * ------------------------------------------------------------------ */

export function PerfBadge({ perf }: { perf: PerfClass }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        perf === "mais"
          ? "bg-accent/15 text-accent"
          : perf === "menos"
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground",
      )}
    >
      {PERF_LABEL[perf]}
    </span>
  );
}

/** Tabela compacta de tamanhos com quantidade e classificação. */
export function SizeTable({
  sizes,
  unit = "un.",
}: {
  sizes: BreakdownRow["sizes"];
  unit?: string;
}) {
  if (sizes.length === 0)
    return <p className="px-2 py-2 text-xs text-muted-foreground">Sem tamanho registrado.</p>;
  const total = sizes.reduce((a, s) => a + s.value, 0);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="px-2 py-1 text-left font-medium">Tamanho</th>
          <th className="px-2 py-1 text-right font-medium">Vendidos</th>
          <th className="px-2 py-1 text-right font-medium">%</th>
          <th className="px-2 py-1 text-right font-medium">Classificação</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {sizes.map((s) => (
          <tr key={s.id}>
            <td className="px-2 py-1">{s.name}</td>
            <td className="px-2 py-1 text-right tabular-nums font-medium">
              {s.value} {unit}
            </td>
            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
              {total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}
            </td>
            <td className="px-2 py-1 text-right">
              <PerfBadge perf={s.perf} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ranking com botão "Ver tamanhos" por linha (accordion). */
export function BreakdownList({
  rows,
  unit = "un.",
  limit = 12,
  renderName,
}: {
  rows: BreakdownRow[];
  unit?: string;
  limit?: number;
  renderName?: (r: BreakdownRow) => ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  if (rows.length === 0) return <EmptyData />;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const visible = all ? rows : rows.slice(0, limit);
  return (
    <div>
      <ul className="divide-y divide-border">
        {visible.map((r, i) => (
          <li key={r.id} className="py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              {r.color && (
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: r.color }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{renderName ? renderName(r) : r.name}</span>
              <PerfBadge perf={r.perf} />
              <span className="shrink-0 font-medium tabular-nums">
                {r.value} {unit}
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {total > 0 ? `${((r.value / total) * 100).toFixed(0)}%` : "—"}
              </span>
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}
                className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
              >
                {open[r.id] ? "Ocultar tamanhos" : "Ver tamanhos"}
              </button>
            </div>
            {open[r.id] && (
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <SizeTable sizes={r.sizes} unit={unit} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {all ? "Mostrar menos" : `Mostrar todos (${rows.length})`}
        </button>
      )}
    </div>
  );
}

/** Estoque x saídas por tamanho, com diagnóstico. */
export function CoverageTable({ rows }: { rows: SizeCoverage[] }) {
  if (rows.length === 0) return <EmptyData />;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">Tamanho</th>
            <th className="px-2 py-1 text-right font-medium">Estoque</th>
            <th className="px-2 py-1 text-right font-medium">Saídas</th>
            <th className="px-2 py-1 text-right font-medium">Cobertura</th>
            <th className="px-2 py-1 text-right font-medium">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.stock}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.outs}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                {Number.isFinite(r.coverage) ? `${Math.floor(r.coverage)} dias` : "—"}
              </td>
              <td className="px-2 py-1.5 text-right">
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    r.status === "ruptura"
                      ? "bg-destructive/15 text-destructive"
                      : r.status === "atencao"
                        ? "bg-warning/15 text-warning"
                        : r.status === "parado"
                          ? "bg-muted text-muted-foreground"
                          : "bg-accent/15 text-accent",
                  )}
                >
                  {r.label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Abas simples e roláveis no celular. */
export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
            value === t.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
