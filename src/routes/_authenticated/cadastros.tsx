import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildKitName,
  kitSignature,
  useBarcodes,
  useCategories,
  useColors,
  useCrud,
  useKitBuilder,
  useKitColors,
  useKits,
  useMoveSkusToCategory,
  useReorder,
  useSizes,
  useSkus,
  type Color,
} from "@/lib/erp";
import { guessHex } from "@/lib/color-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Copy, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const NO_CATEGORY = "none";

/** Nova ordem ao soltar um item sobre outro. */
function reorderIds(ids: string[], fromId: string, toId: string) {
  if (fromId === toId) return ids;
  const next = ids.filter((i) => i !== fromId);
  const idx = next.indexOf(toId);
  next.splice(idx < 0 ? next.length : idx, 0, fromId);
  return next;
}

export const Route = createFileRoute("/_authenticated/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastros de SKUs, cores, tamanhos e kits — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Crie, edite, renomeie, duplique e exclua categorias, SKUs, cores com HEX automático, tamanhos, kits e códigos do catálogo TikTok Shop.",
      },
      { property: "og:title", content: "Cadastros do catálogo TikTok Shop" },
      {
        property: "og:description",
        content: "CRUD completo de categorias, SKUs, cores, tamanhos, kits e códigos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CadastrosPage,
});

type RowActionsProps = {
  name: string;
  onRename: (value: string) => void;
  onDuplicate?: () => void;
  onDelete: () => void;
};

function RowActions({ name, onRename, onDuplicate, onDelete }: RowActionsProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  // o registro pode ser renomeado por outro dispositivo: nunca editar em cima de um valor obsoleto
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <Input
          autoFocus
          value={value}
          maxLength={120}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-40"
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Salvar"
          onClick={() => {
            if (!value.trim()) return;
            onRename(value.trim());
            setEditing(false);
          }}
        >
          <Check className="size-4 text-primary" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Cancelar"
          onClick={() => {
            setValue(name);
            setEditing(false);
          }}
        >
          <X className="size-4" />
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-0.5">
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Renomear ${name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" />
      </Button>
      {onDuplicate && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Duplicar ${name}`}
          onClick={onDuplicate}
        >
          <Copy className="size-4" />
        </Button>
      )}
      <Button size="icon" variant="ghost" aria-label={`Excluir ${name}`} onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </span>
  );
}

function CadastrosPage() {
  const { data: categories = [] } = useCategories();
  const { data: skus = [] } = useSkus();
  const [skuId, setSkuId] = useState("");
  const { data: colors = [] } = useColors(skuId || undefined);
  const { data: sizes = [] } = useSizes(skuId || undefined);
  const { data: kits = [] } = useKits(skuId || undefined);
  const { data: kitColors = [] } = useKitColors();
  const { data: barcodes = [] } = useBarcodes(skuId || undefined);

  const catCrud = useCrud("categories");
  const skuCrud = useCrud("skus");
  const colorCrud = useCrud("colors");
  const sizeCrud = useCrud("sizes");
  const kitCrud = useCrud("kits");
  const barcodeCrud = useCrud("barcodes");
  const { createKit, updateKit } = useKitBuilder();
  const reorderCategories = useReorder("categories");
  const reorderSkus = useReorder("skus");
  const reorderColors = useReorder("colors");
  const reorderKits = useReorder("kits");
  const moveSkus = useMoveSkusToCategory();

  const [catName, setCatName] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [skuName, setSkuName] = useState("");
  const [skuCat, setSkuCat] = useState("");
  const [colorName, setColorName] = useState("");
  const [sizeName, setSizeName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editingKit, setEditingKit] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCat, setBulkCat] = useState(NO_CATEGORY);
  const [dragId, setDragId] = useState<string | null>(null);

  function dropHandlers(ids: string[], onOrder: (next: string[]) => void, id: string) {
    return {
      draggable: true,
      onDragStart: () => setDragId(id),
      onDragEnd: () => setDragId(null),
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragId) return;
        const next = reorderIds(ids, dragId, id);
        setDragId(null);
        if (next.join("|") !== ids.join("|")) onOrder(next);
      },
    };
  }

  const sku = skus.find((s) => s.id === skuId);

  /** SKUs organizados por categoria — cada categoria tem sua própria área. */
  const skuGroups = useMemo(() => {
    const buckets = [
      ...categories.map((c) => ({ id: c.id, name: c.name })),
      { id: NO_CATEGORY, name: "Sem categoria" },
    ];
    return buckets
      .map((b) => ({
        ...b,
        skus: skus.filter((s) =>
          b.id === NO_CATEGORY ? !s.category_id : s.category_id === b.id,
        ),
      }))
      .filter((b) => b.skus.length > 0);
  }, [categories, skus]);

  const colorById = useMemo(() => new Map(colors.map((c) => [c.id, c] as const)), [colors]);
  const autoName = useMemo(
    () => buildKitName(picked.map((id) => colorById.get(id)?.name ?? "")),
    [picked, colorById],
  );


  const existingSignatures = useMemo(() => {
    const map = new Map<string, string>();
    for (const kit of kits) {
      const ids = kitColors
        .filter((kc) => kc.kit_id === kit.id)
        .sort((a, b) => a.position - b.position)
        .map((kc) => kc.color_id);
      map.set(kitSignature(ids), kit.id);
    }
    return map;
  }, [kits, kitColors]);

  function togglePicked(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function saveKit() {
    if (!skuId) return;
    if (picked.length < 2) {
      toast.error("Selecione ao menos 2 cores");
      return;
    }
    const sig = kitSignature(picked);
    const clash = existingSignatures.get(sig);
    if (clash && clash !== editingKit) {
      toast.error("Já existe um kit com essa combinação de cores");
      return;
    }
    if (editingKit) {
      updateKit.mutate({ kit_id: editingKit, colorIds: picked, name: autoName });
    } else {
      createKit.mutate({ sku_id: skuId, colorIds: picked, name: autoName });
    }
    setPicked([]);
    setEditingKit(null);
  }

  function startEditKit(kitId: string) {
    const ids = kitColors
      .filter((kc) => kc.kit_id === kitId)
      .sort((a, b) => a.position - b.position)
      .map((kc) => kc.color_id);
    setPicked(ids);
    setEditingKit(kitId);
  }

  function duplicateColor(color: Color) {
    colorCrud.create.mutate({
      sku_id: color.sku_id,
      name: `${color.name} (cópia)`,
      hex: color.hex,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Cadastros</h1>
        <p className="text-sm text-muted-foreground">
          Categorias, SKUs, cores, tamanhos, kits e códigos — criar, editar, renomear, duplicar,
          excluir e arrastar para definir a ordem usada em todas as telas.
        </p>
      </header>

      <section className="card-elevated space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Categorias</h2>
        <div className="flex gap-2">
          <Input
            value={catName}
            maxLength={60}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Ex.: Conjuntos"
          />
          <Button
            onClick={() => {
              if (!catName.trim()) return;
              catCrud.create.mutate({ name: catName.trim() });
              setCatName("");
            }}
          >
            Adicionar
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 py-2 text-sm"
              {...dropHandlers(
                categories.map((x) => x.id),
                (next) => reorderCategories.mutate(next),
                c.id,
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
              <span className="flex-1">{c.name}</span>
              <RowActions
                name={c.name}
                onRename={(name) => catCrud.update.mutate({ id: c.id, values: { name } })}
                onDuplicate={() => catCrud.create.mutate({ name: `${c.name} (cópia)` })}
                onDelete={() => catCrud.softDelete.mutate(c.id)}
              />
            </li>
          ))}
          {categories.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">Nenhuma categoria ainda.</li>
          )}
        </ul>
      </section>

      <section className="card-elevated space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">SKUs / Produtos</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            value={skuCode}
            maxLength={60}
            onChange={(e) => setSkuCode(e.target.value)}
            placeholder="Seller SKU"
          />
          <Input
            value={skuName}
            maxLength={120}
            onChange={(e) => setSkuName(e.target.value)}
            placeholder="Nome do produto"
          />
          <Select value={skuCat} onValueChange={setSkuCat}>
            <SelectTrigger>
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              if (!skuCode.trim() || !skuName.trim()) {
                toast.error("Informe SKU e nome");
                return;
              }
              if (skus.some((s) => s.seller_sku.toLowerCase() === skuCode.trim().toLowerCase())) {
                toast.error("Este Seller SKU já existe");
                return;
              }
              skuCrud.create.mutate({
                seller_sku: skuCode.trim(),
                name: skuName.trim(),
                category_id: skuCat || null,
              });
              setSkuCode("");
              setSkuName("");
            }}
          >
            Adicionar SKU
          </Button>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            <span className="font-medium">{selected.length} SKU(s) selecionado(s)</span>
            <Select value={bulkCat} onValueChange={setBulkCat}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Mover para categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => {
                moveSkus.mutate({
                  skuIds: selected,
                  categoryId: bulkCat === NO_CATEGORY ? null : bulkCat,
                });
                setSelected([]);
              }}
            >
              Aplicar em massa
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected([])}>
              Limpar seleção
            </Button>
          </div>
        )}
        {skuGroups.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">Nenhum SKU cadastrado.</p>
        )}

        {skuGroups.map((group) => (
          <div key={group.id} className="rounded-xl border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
              <h3 className="min-w-0 truncate font-display text-sm font-semibold">{group.name}</h3>
              <Badge variant="secondary" className="shrink-0">
                {group.skus.length} SKU{group.skus.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <ul className="divide-y divide-border px-3">
              {group.skus.map((s) => (
                <li
                  key={s.id}
                  className="space-y-2 py-2.5 text-sm"
                  {...dropHandlers(
                    skus.map((x) => x.id),
                    (next) => reorderSkus.mutate(next),
                    s.id,
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground" />
                    <Checkbox
                      className="mt-0.5 shrink-0"
                      checked={selected.includes(s.id)}
                      aria-label={`Selecionar ${s.seller_sku}`}
                      onCheckedChange={(v) =>
                        setSelected((prev) =>
                          v ? [...new Set([...prev, s.id])] : prev.filter((x) => x !== s.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold">{s.seller_sku}</span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {s.name}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <Select
                      value={s.category_id ?? NO_CATEGORY}
                      onValueChange={(v) =>
                        moveSkus.mutate({
                          skuIds: [s.id],
                          categoryId: v === NO_CATEGORY ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-full min-w-0 sm:w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant={skuId === s.id ? "default" : "outline"}
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setSkuId(skuId === s.id ? "" : s.id);
                        setPicked([]);
                        setEditingKit(null);
                      }}
                    >
                      {skuId === s.id ? "Fechar" : "Detalhar"}
                    </Button>
                    <span className="ml-auto shrink-0">
                      <RowActions
                        name={s.name}
                        onRename={(name) => skuCrud.update.mutate({ id: s.id, values: { name } })}
                        onDuplicate={() =>
                          skuCrud.create.mutate({
                            seller_sku: `${s.seller_sku}-COPIA`,
                            name: `${s.name} (cópia)`,
                            category_id: s.category_id,
                            min_stock: s.min_stock,
                          })
                        }
                        onDelete={() => skuCrud.softDelete.mutate(s.id)}
                      />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

      </section>

      {sku && (
        <section className="card-elevated space-y-6 p-4">
          <h2 className="break-words font-display text-lg font-semibold">
            {sku.seller_sku} · cores, tamanhos, kits e códigos
          </h2>


          <div className="space-y-2">
            <Label>Nova cor</Label>
            <div className="flex gap-2">
              <Input
                value={colorName}
                maxLength={40}
                onChange={(e) => setColorName(e.target.value)}
                placeholder="Ex.: Verde militar"
              />
              <Button
                onClick={() => {
                  const name = colorName.trim();
                  if (!name) return;
                  if (colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
                    toast.error("Cor já cadastrada neste SKU");
                    return;
                  }
                  colorCrud.create.mutate({
                    sku_id: skuId,
                    name,
                    hex: guessHex(name) ?? "#888888",
                  });
                  setColorName("");
                }}
              >
                Adicionar
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {colors.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 py-2 text-sm"
                  {...dropHandlers(
                    colors.map((x) => x.id),
                    (next) => reorderColors.mutate(next),
                    c.id,
                  )}
                >
                  <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span
                    className="size-4 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className="flex-1">{c.name}</span>
                  <Input
                    type="color"
                    value={c.hex}
                    aria-label={`Cor HEX de ${c.name}`}
                    onChange={(e) =>
                      colorCrud.update.mutate({ id: c.id, values: { hex: e.target.value } })
                    }
                    className="h-8 w-12 p-1"
                  />
                  <RowActions
                    name={c.name}
                    onRename={(name) =>
                      colorCrud.update.mutate({
                        id: c.id,
                        values: { name, hex: guessHex(name) ?? c.hex },
                      })
                    }
                    onDuplicate={() => duplicateColor(c)}
                    onDelete={() => colorCrud.softDelete.mutate(c.id)}
                  />
                </li>
              ))}
              {colors.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">Nenhuma cor neste SKU.</li>
              )}
            </ul>
          </div>

          <div className="space-y-2">
            <Label>Novo tamanho</Label>
            <div className="flex gap-2">
              <Input
                value={sizeName}
                maxLength={20}
                onChange={(e) => setSizeName(e.target.value)}
                placeholder="Ex.: M"
              />
              <Button
                onClick={() => {
                  const name = sizeName.trim().toUpperCase();
                  if (!name) return;
                  if (sizes.some((s) => s.name.toUpperCase() === name)) {
                    toast.error("Tamanho já cadastrado neste SKU");
                    return;
                  }
                  sizeCrud.create.mutate({ sku_id: skuId, name });
                  setSizeName("");
                }}
              >
                Adicionar
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {sizes.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <Input
                    type="number"
                    min={0}
                    key={`grid-${s.id}-${s.grid_qty}`}
                    defaultValue={s.grid_qty ?? 0}
                    title="Quantidade padrão da grade para este tamanho"
                    onBlur={(e) => {
                      const next = Math.max(0, Number(e.target.value) || 0);
                      if (next === (s.grid_qty ?? 0)) return;
                      sizeCrud.update.mutate({ id: s.id, values: { grid_qty: next } });
                    }}
                    className="h-8 w-16 text-center"
                  />

                  <RowActions
                    name={s.name}
                    onRename={(name) =>
                      sizeCrud.update.mutate({
                        id: s.id,
                        values: { name: name.toUpperCase() },
                      })
                    }
                    onDelete={() => sizeCrud.softDelete.mutate(s.id)}
                  />
                </li>
              ))}
              {sizes.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">Nenhum tamanho neste SKU.</li>
              )}
            </ul>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <Label>{editingKit ? "Editar kit" : "Cadastrar kit"}</Label>
            <p className="text-xs text-muted-foreground">
              Selecione as cores na ordem desejada. O nome é gerado automaticamente.
            </p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => {
                const index = picked.indexOf(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => togglePicked(c.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      index >= 0
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border hover:bg-muted/60"
                    }`}
                  >
                    <span
                      className="size-3 rounded-full border border-border"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.name}
                    {index >= 0 && <Badge variant="secondary">{index + 1}</Badge>}
                  </button>
                );
              })}
              {colors.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  Cadastre cores para montar kits.
                </span>
              )}
            </div>
            {picked.length > 0 && (
              <p className="text-sm">
                Nome do kit: <strong className="text-brand-gradient">{autoName}</strong>
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={saveKit} disabled={picked.length < 2}>
                {editingKit ? "Salvar kit" : "Criar kit"}
              </Button>
              {(picked.length > 0 || editingKit) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPicked([]);
                    setEditingKit(null);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Kits deste SKU</Label>
            <ul className="divide-y divide-border">
              {kits.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center gap-2 py-2 text-sm"
                  {...dropHandlers(
                    kits.map((x) => x.id),
                    (next) => reorderKits.mutate(next),
                    k.id,
                  )}
                >
                  <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span className="min-w-0 flex-1">{k.name}</span>
                  <Button variant="outline" size="sm" onClick={() => startEditKit(k.id)}>
                    Editar cores
                  </Button>
                  <RowActions
                    name={k.name}
                    onRename={(name) => kitCrud.update.mutate({ id: k.id, values: { name } })}
                    onDelete={() => kitCrud.softDelete.mutate(k.id)}
                  />
                </li>
              ))}
              {kits.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">
                  Nenhum kit criado para este SKU.
                </li>
              )}
            </ul>
          </div>

          <div className="space-y-2">
            <Label>Códigos (barras / etiqueta)</Label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                maxLength={80}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Código do SKU"
              />
              <Button
                onClick={() => {
                  const code = barcode.trim();
                  if (!code) return;
                  if (barcodes.some((b) => b.code === code)) {
                    toast.error("Código já cadastrado");
                    return;
                  }
                  barcodeCrud.create.mutate({ sku_id: skuId, code });
                  setBarcode("");
                }}
              >
                Adicionar
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {barcodes.map((b) => (
                <li key={b.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1 font-mono text-xs">{b.code}</span>
                  <RowActions
                    name={b.code}
                    onRename={(code) => barcodeCrud.update.mutate({ id: b.id, values: { code } })}
                    onDelete={() => barcodeCrud.softDelete.mutate(b.id)}
                  />
                </li>
              ))}
              {barcodes.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">Nenhum código cadastrado.</li>
              )}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
