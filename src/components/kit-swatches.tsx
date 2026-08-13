import type { Color, KitColor } from "@/lib/erp";
import { kitColorsOf } from "@/lib/erp";
import { cn } from "@/lib/utils";

export function ColorDot({ hex, className }: { hex: string; className?: string | undefined }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3.5 shrink-0 rounded-full border border-border", className)}
      style={{ backgroundColor: hex }}
    />
  );
}

/** Círculos das cores do kit + nome, usado em todas as telas. */
export function KitSwatches({
  kitId,
  kitColors,
  colors,
  name,
  className,
  dotClassName,
  showName = true,
}: {
  kitId: string;
  kitColors: KitColor[];
  colors: Color[];
  name?: string;
  className?: string | undefined;
  dotClassName?: string | undefined;
  showName?: boolean;
}) {
  const list = kitColorsOf(kitId, kitColors, colors);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="flex shrink-0 items-center -space-x-1">
        {list.map((c) => (
          <ColorDot key={c.id} hex={c.hex} className={dotClassName} />
        ))}
      </span>
      {showName && (
        <span className="truncate">{name ?? list.map((c) => c.name).join(" + ")}</span>
      )}
    </span>
  );
}
