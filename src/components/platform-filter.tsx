import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_PLATFORMS, usePlatformFilter, usePlatforms } from "@/lib/platforms";

/**
 * Filtro global de plataforma.
 *
 * "Estoque geral" mostra o estoque real. Ao escolher uma plataforma, as telas
 * passam a mostrar apenas a parcela reservada para ela — sem duplicar estoque.
 */
export function PlatformFilter({ className = "" }: { className?: string }) {
  const { data: platforms = [] } = usePlatforms();
  const { platformId, setPlatformId } = usePlatformFilter();

  return (
    <Select value={platformId} onValueChange={setPlatformId}>
      <SelectTrigger className={`h-9 w-full sm:w-52 ${className}`} aria-label="Plataforma">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PLATFORMS}>Estoque geral</SelectItem>
        {platforms.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Seletor usado em formulários (permite "sem plataforma"). */
export function PlatformPicker({
  value,
  onChange,
  className = "",
  allowNone = true,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  allowNone?: boolean;
}) {
  const { data: platforms = [] } = usePlatforms();
  return (
    <Select value={value || ALL_PLATFORMS} onValueChange={onChange}>
      <SelectTrigger className={`h-9 ${className}`} aria-label="Plataforma da movimentação">
        <SelectValue placeholder="Plataforma" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={ALL_PLATFORMS}>Sem plataforma (geral)</SelectItem>}
        {platforms.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Etiqueta compacta da plataforma de uma movimentação/histórico. */
export function PlatformBadge({ platformId }: { platformId: string | null }) {
  const { data: platforms = [] } = usePlatforms();
  const p = platforms.find((x) => x.id === platformId);
  if (!p) return <span className="text-xs text-muted-foreground">Geral</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: p.color }}
      />
      {p.name}
    </span>
  );
}
