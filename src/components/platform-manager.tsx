import { useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePlatformCrud, usePlatforms, useAllocations } from "@/lib/platforms";

/**
 * Cadastro de plataformas (TikTok Shop, Mercado Livre, Shopee, futuras).
 *
 * Excluir uma plataforma remove apenas as reservas dela — o estoque físico
 * geral nunca é alterado.
 */
export function PlatformManager() {
  const { data: platforms = [] } = usePlatforms();
  const { data: trash = [] } = usePlatforms(true);
  const { data: allocations = [] } = useAllocations();
  const { create, update, softDelete, restore, hardDelete } = usePlatformCrud();

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  const reservedFor = (id: string) =>
    allocations.filter((a) => a.platform_id === id).reduce((sum, a) => sum + a.qty, 0);

  return (
    <section className="card-elevated space-y-4 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <Layers className="size-5 shrink-0 text-primary" />
        <h2 className="truncate font-display text-lg font-semibold">Plataformas</h2>
        <Badge variant="secondary" className="ml-auto shrink-0">
          {platforms.length} ativas
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Plataforma é uma camada de reserva sobre o estoque existente. Nada é duplicado: a soma das
        reservas nunca ultrapassa a quantidade real de cada cor e tamanho.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate(
            { name: name.trim(), color },
            { onSuccess: () => setName("") },
          );
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-xs">Nova plataforma</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Shein, Amazon, Loja física"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cor</Label>
          <Input
            type="color"
            value={color}
            aria-label="Cor da plataforma"
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 p-1"
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Adicionar
        </Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {platforms.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <input
              type="color"
              value={p.color}
              aria-label={`Cor de ${p.name}`}
              onChange={(e) => update.mutate({ id: p.id, values: { color: e.target.value } })}
              className="size-7 rounded border border-border bg-transparent p-0.5"
            />
            <Input
              defaultValue={p.name}
              className="h-8 w-44"
              aria-label={`Nome de ${p.name}`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== p.name) update.mutate({ id: p.id, values: { name: v } });
              }}
            />
            <span className="text-xs text-muted-foreground">
              {reservedFor(p.id)} un. reservadas
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => softDelete.mutate(p.id)}
            >
              Arquivar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (
                  confirm(
                    `Excluir "${p.name}" definitivamente? As reservas dela são liberadas e o estoque geral permanece intacto.`,
                  )
                )
                  hardDelete.mutate(p.id);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {platforms.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhuma plataforma cadastrada.
          </li>
        )}
      </ul>

      {trash.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Arquivadas</p>
          <ul className="divide-y divide-border rounded-lg border border-dashed border-border">
            {trash.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="truncate">{p.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => restore.mutate(p.id)}
                >
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
