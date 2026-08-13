import { useMemo, useState } from "react";
import type { Category, Sku } from "@/lib/erp";
import { presetRange, RANGE_PRESETS, type Range, type Scope } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FiltersState = {
  scope: Scope;
  preset: string;
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
};

export function useFilters(defaultPreset = "30d") {
  const today = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState<FiltersState>({
    scope: { kind: "geral" },
    preset: defaultPreset,
    from: today,
    to: today,
    fromTime: "00:00",
    toTime: "23:59",
  });

  const range: Range = useMemo(() => {
    if (state.preset !== "custom") return presetRange(state.preset);
    const from = new Date(`${state.from}T${state.fromTime || "00:00"}:00`).getTime();
    const to = new Date(`${state.to}T${state.toTime || "23:59"}:59`).getTime();
    return { from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : Date.now() };
  }, [state.preset, state.from, state.to, state.fromTime, state.toTime]);

  return { state, setState, range };
}

function Chip({
  active,
  children,
  onClick,
  title,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {children}
      </div>
    </div>
  );
}

export function FilterBar({
  state,
  setState,
  categories,
  skus,
}: {
  state: FiltersState;
  setState: (updater: (prev: FiltersState) => FiltersState) => void;
  categories: Category[];
  skus: Sku[];
}) {
  const scope = state.scope;
  const activeCategoryId =
    scope.kind === "categoria"
      ? scope.id
      : scope.kind === "sku"
        ? (skus.find((s) => s.id === scope.id)?.category_id ?? "none")
        : null;

  const visibleSkus = useMemo(() => {
    if (!activeCategoryId) return skus;
    return skus.filter((s) =>
      activeCategoryId === "none" ? !s.category_id : s.category_id === activeCategoryId,
    );
  }, [skus, activeCategoryId]);

  const setCategory = (id: string | null) =>
    setState((p) => ({ ...p, scope: id === null ? { kind: "geral" } : { kind: "categoria", id } }));

  const setSku = (id: string | null) =>
    setState((p) => ({
      ...p,
      scope:
        id === null
          ? activeCategoryId
            ? { kind: "categoria", id: activeCategoryId }
            : { kind: "geral" }
          : { kind: "sku", id },
    }));

  return (
    <div className="card-elevated space-y-3 p-3">
      <ChipRow label="Categoria">
        <Chip active={scope.kind === "geral"} onClick={() => setCategory(null)}>
          Geral
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={activeCategoryId === c.id} onClick={() => setCategory(c.id)}>
            {c.name}
          </Chip>
        ))}
        <Chip active={activeCategoryId === "none"} onClick={() => setCategory("none")}>
          Sem categoria
        </Chip>
      </ChipRow>

      <ChipRow label="Referência">
        <Chip active={scope.kind !== "sku"} onClick={() => setSku(null)}>
          Geral
        </Chip>
        {visibleSkus.map((s) => (
          <Chip
            key={s.id}
            active={scope.kind === "sku" && scope.id === s.id}
            onClick={() => setSku(s.id)}
            title={s.name}
          >
            {s.seller_sku}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="Período">
        {RANGE_PRESETS.map((p) => (
          <Chip
            key={p.value}
            active={state.preset === p.value}
            onClick={() => setState((prev) => ({ ...prev, preset: p.value }))}
          >
            {p.label}
          </Chip>
        ))}
      </ChipRow>

      {state.preset === "custom" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
              Data inicial
            </label>
            <Input
              type="date"
              className="w-full"
              value={state.from}
              onChange={(e) => setState((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
              Hora inicial
            </label>
            <Input
              type="time"
              className="w-full"
              value={state.fromTime}
              onChange={(e) => setState((p) => ({ ...p, fromTime: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
              Data final
            </label>
            <Input
              type="date"
              className="w-full"
              value={state.to}
              onChange={(e) => setState((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
              Hora final
            </label>
            <Input
              type="time"
              className="w-full"
              value={state.toTime}
              onChange={(e) => setState((p) => ({ ...p, toTime: e.target.value }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
