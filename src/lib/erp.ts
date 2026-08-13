import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Catálogo muda pouco: evita refetch em cada montagem de tela. */
const CATALOG = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false } as const;
/** Dados operacionais: frescos, mas sem refetch em loop. */
const LIVE = { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false } as const;


export type Category = {
  id: string;
  name: string;
  position: number;
  deleted_at: string | null;
  created_at: string;
};
export type Sku = {
  id: string;
  category_id: string | null;
  seller_sku: string;
  name: string;
  min_stock: number;
  notes: string | null;
  position: number;
  locked: boolean;
  deleted_at: string | null;
};
export type Color = {
  id: string;
  sku_id: string;
  name: string;
  hex: string;
  position: number;
  deleted_at: string | null;
};
export type Size = {
  id: string;
  sku_id: string;
  name: string;
  position: number;
  grid_qty: number;
  deleted_at: string | null;
};
export type Kit = {
  id: string;
  sku_id: string;
  name: string;
  position: number;
  deleted_at: string | null;
};
export type KitColor = { id: string; kit_id: string; color_id: string; position: number };
export type Barcode = {
  id: string;
  sku_id: string | null;
  kit_id: string | null;
  code: string;
  deleted_at: string | null;
};
export type StockUnit = {
  id: string;
  sku_id: string;
  color_id: string;
  size_id: string;
  qty: number;
  locked: boolean;
};
export type KitStock = { id: string; kit_id: string; size_id: string; formed_qty: number };
export type Movement = {
  id: string;
  sku_id: string | null;
  kind: "unit" | "kit";
  direction: "in" | "out";
  color_id: string | null;
  kit_id: string | null;
  size_id: string | null;
  qty: number;
  affect_units: boolean;
  affect_formed: boolean;
  lines: unknown;
  note: string | null;
  source: string;
  order_ref: string | null;
  undone_at: string | null;
  created_at: string;
  stock_before: number | null;
  stock_after: number | null;
  user_name: string | null;
  platform_id: string | null;
};
export type AuditLog = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  old_values: unknown;
  new_values: unknown;
  device: string | null;
  browser: string | null;
  created_at: string;
};
/** Alteração feita diretamente na tela de Estoque (não é movimentação). */
export type StockEdit = {
  id: string;
  sku_id: string | null;
  color_id: string | null;
  size_id: string | null;
  qty_before: number;
  delta: number;
  qty_after: number;
  kind: string;
  note: string | null;
  user_name: string | null;
  platform_id: string | null;
  created_at: string;
};


function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export const qk = {
  categories: (trash = false) => ["categories", trash] as const,
  skus: (trash = false) => ["skus", trash] as const,
  colors: (skuId?: string, trash = false) => ["colors", skuId ?? "all", trash] as const,
  sizes: (skuId?: string, trash = false) => ["sizes", skuId ?? "all", trash] as const,
  kits: (skuId?: string, trash = false) => ["kits", skuId ?? "all", trash] as const,
  kitColors: (skuId?: string) => ["kit_colors", skuId ?? "all"] as const,
  barcodes: (skuId?: string) => ["barcodes", skuId ?? "all"] as const,
  stock: () => ["stock_units"] as const,
  kitStock: () => ["kit_stock"] as const,
  movements: () => ["movements"] as const,
  audit: () => ["audit_logs"] as const,
};

export function useCategories(trash = false) {
  return useQuery({
    queryKey: qk.categories(trash),
    queryFn: async () => {
      const q = supabase.from("categories").select("*").order("position").order("created_at");
      return unwrap<Category[]>(
        (await (trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null))) as never,
      );
    },
    ...CATALOG,
  });
}

export function useSkus(trash = false) {
  return useQuery({
    queryKey: qk.skus(trash),
    queryFn: async () => {
      const q = supabase.from("skus").select("*").order("position").order("created_at");
      return unwrap<Sku[]>(
        (await (trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null))) as never,
      );
    },
    ...CATALOG,
  });
}

function childHook<T>(table: "colors" | "sizes" | "kits") {
  return (skuId?: string, trash = false) =>
    useQuery({
      queryKey: [table, skuId ?? "all", trash] as const,
      queryFn: async () => {
        let q = supabase.from(table).select("*").order("position").order("created_at");
        if (skuId) q = q.eq("sku_id", skuId);
        return unwrap<T[]>(
          (await (trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null))) as never,
        );
      },
      ...CATALOG,
    });
}

export const useColors = childHook<Color>("colors");
export const useSizes = childHook<Size>("sizes");
export const useKits = childHook<Kit>("kits");

export function useKitColors() {
  return useQuery({
    queryKey: qk.kitColors(),
    queryFn: async () =>
      unwrap<KitColor[]>((await supabase.from("kit_colors").select("*").order("position")) as never),
    ...CATALOG,
  });
}

export function useBarcodes(skuId?: string) {
  return useQuery({
    queryKey: qk.barcodes(skuId),
    queryFn: async () => {
      let q = supabase.from("barcodes").select("*").is("deleted_at", null);
      if (skuId) q = q.eq("sku_id", skuId);
      return unwrap<Barcode[]>((await q.order("created_at")) as never);
    },
    ...CATALOG,
  });
}

export function useStockUnits() {
  return useQuery({
    queryKey: qk.stock(),
    queryFn: async () =>
      unwrap<StockUnit[]>((await supabase.from("stock_units").select("*")) as never),
    ...LIVE,
  });
}

export function useKitStock() {
  return useQuery({
    queryKey: qk.kitStock(),
    queryFn: async () =>
      unwrap<KitStock[]>((await supabase.from("kit_stock").select("*")) as never),
    ...LIVE,
  });
}

export function useMovements(limit = 200) {
  return useQuery({
    // o limite faz parte da chave: telas com limites diferentes não brigam pelo mesmo cache
    queryKey: ["movements", "list", limit] as const,
    queryFn: async () =>
      unwrap<Movement[]>(
        (await supabase
          .from("movements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit)) as never,
      ),
    ...LIVE,
  });
}


/** Movimentações do dia atual (tela de Movimentação). */
export function useTodayMovements() {
  return useQuery({
    queryKey: ["movements", "today"] as const,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return unwrap<Movement[]>(
        (await supabase
          .from("movements")
          .select("*")
          .gte("created_at", start.toISOString())
          .order("created_at", { ascending: false })) as never,
      );
    },
    ...LIVE,
  });
}

export function useAuditLogs(limit = 300) {
  return useQuery({
    queryKey: qk.audit(),
    queryFn: async () =>
      unwrap<AuditLog[]>(
        (await supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit)) as never,
      ),
    ...LIVE,
  });
}

/** Histórico das alterações feitas diretamente na tela de Estoque. */
export function useStockEdits(limit = 300) {
  return useQuery({
    queryKey: ["stock_edits", limit] as const,
    queryFn: async () =>
      unwrap<StockEdit[]>(
        (await supabase
          .from("stock_edits")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit)) as never,
      ),
    ...LIVE,
  });
}

/** Registra auditoria com dispositivo/navegador. */
export async function logAudit(
  action: string,
  entity?: string,
  entityId?: string | null,
  oldValues?: unknown,
  newValues?: unknown,
) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  await supabase.from("audit_logs").insert({
    action,
    entity: entity ?? null,
    entity_id: entityId ?? null,
    old_values: (oldValues ?? null) as never,
    new_values: (newValues ?? null) as never,
    device: /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
    browser: ua.slice(0, 180),
  } as never);
}

type TableName =
  | "categories"
  | "skus"
  | "colors"
  | "sizes"
  | "kits"
  | "kit_colors"
  | "barcodes"
  | "stock_units"
  | "kit_stock";

/** Invalida somente as chaves afetadas — evita cascata de refetch em todas as telas. */
export function invalidateKeys(qc: QueryClient, keys: string[]) {
  for (const key of new Set(keys)) void qc.invalidateQueries({ queryKey: [key] });
}

const STOCK_KEYS = [
  "stock_units",
  "kit_stock",
  "movements",
  "audit_logs",
  "stock_edits",
  "stock_allocations",
];

export function useCrud(table: TableName) {
  const qc = useQueryClient();
  const invalidate = () => {
    invalidateKeys(qc, [table, "audit_logs"]);
  };

  const create = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from(table)
        .insert(values as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logAudit("criacao", table, (data as { id: string }).id, null, values);
      return data as { id: string };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Registro criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from(table)
        .update(values as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logAudit("edicao", table, id, null, values);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Alterações salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("exclusao", table, id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Movido para a lixeira", {
        description: "Você pode restaurar na tela Lixeira.",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: null } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("restauracao", table, id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Registro restaurado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("exclusao_definitiva", table, id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Excluído definitivamente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { create, update, softDelete, restore, hardDelete };
}

export type MovementInput = {
  sku_id: string;
  kind: "unit" | "kit";
  direction: "in" | "out";
  ref_id: string;
  size_id: string;
  qty: number;
  affect_units: boolean;
  affect_formed: boolean;
  note?: string;
  source?: string;
  order_ref?: string;
  /** reserva de plataforma afetada junto com o estoque geral */
  platform_id?: string | null;
};

export function useApplyMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MovementInput) => {
      const { data, error } = await supabase.rpc("apply_movement", {
        p_sku_id: input.sku_id,
        p_kind: input.kind,
        p_direction: input.direction,
        p_ref_id: input.ref_id,
        p_size_id: input.size_id,
        p_qty: input.qty,
        p_affect_units: input.affect_units,
        p_affect_formed: input.affect_formed,
        p_source: input.source ?? "manual",
        ...(input.note ? { p_note: input.note } : {}),
        ...(input.order_ref ? { p_order_ref: input.order_ref } : {}),
        ...(input.platform_id ? { p_platform_id: input.platform_id } : {}),
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => invalidateKeys(qc, STOCK_KEYS),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetUnitStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["set_unit_stock"],
    mutationFn: async (input: {
      sku_id: string;
      color_id: string;
      size_id: string;
      qty: number;
      /** quantidade anterior — usada apenas para a mensagem de confirmação */
      previous?: number;
      note?: string;
    }) => {
      const { error } = await supabase.rpc("set_unit_stock", {
        p_sku_id: input.sku_id,
        p_color_id: input.color_id,
        p_size_id: input.size_id,
        p_qty: input.qty,
        ...(input.note ? { p_note: input.note } : {}),
      } as never);
      if (error) throw new Error(error.message);
      // Confirma no banco o valor efetivamente gravado.
      const { data, error: readError } = await supabase
        .from("stock_units")
        .select("id,sku_id,color_id,size_id,qty,locked")
        .eq("color_id", input.color_id)
        .eq("size_id", input.size_id)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!data) throw new Error("Não foi possível confirmar o valor salvo");
      const row = data as StockUnit;
      if (row.qty !== input.qty) throw new Error("O banco não confirmou a alteração");
      return row;
    },
    // Atualização local imediata (sem refetch) com rollback em caso de erro.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.stock() });
      const previous = qc.getQueryData<StockUnit[]>(qk.stock());
      qc.setQueryData<StockUnit[]>(qk.stock(), (rows = []) => {
        const idx = rows.findIndex(
          (r) => r.color_id === input.color_id && r.size_id === input.size_id,
        );
        if (idx === -1)
          return [
            ...rows,
            {
              id: `temp-${input.color_id}-${input.size_id}`,
              sku_id: input.sku_id,
              color_id: input.color_id,
              size_id: input.size_id,
              qty: input.qty,
              locked: false,
            },
          ];
        const next = rows.slice();
        next[idx] = { ...(rows[idx] as StockUnit), qty: input.qty };
        return next;
      });
      return { previous };
    },
    onError: (e: Error, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.stock(), ctx.previous);
      toast.error("⚠ Não foi possível salvar. Tente novamente.", { description: e.message });
    },
    onSuccess: (row, input) => {
      // Grava o valor confirmado pelo banco no cache — sem refetch geral.
      qc.setQueryData<StockUnit[]>(qk.stock(), (rows = []) => {
        const idx = rows.findIndex(
          (r) => r.color_id === row.color_id && r.size_id === row.size_id,
        );
        if (idx === -1) return [...rows, row];
        const next = rows.slice();
        next[idx] = row;
        return next;
      });
      // O histórico de alterações diretas precisa refletir a gravação na hora.
      invalidateKeys(qc, ["stock_edits", "audit_logs"]);
      const before = input.previous;
      const delta = typeof before === "number" ? row.qty - before : null;
      toast.success(
        delta === null || delta === 0
          ? "✓ Estoque atualizado"
          : delta > 0
            ? `✓ +${delta} unidade(s) adicionada(s)`
            : `✓ ${delta} unidade(s) removida(s)`,
        { description: `Novo estoque confirmado: ${row.qty} un.`, duration: 2500 },
      );
    },
  });
}



export function useUndoMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (movementId: string) => {
      const { error } = await supabase.rpc("undo_movement", { p_movement_id: movementId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateKeys(qc, STOCK_KEYS);
      toast.success("Operação desfeita");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Notificação com botão Desfazer após qualquer movimentação. */
export function toastWithUndo(message: string, description: string, undo: () => void) {
  toast.success(message, {
    description,
    duration: 8000,
    action: { label: "Desfazer", onClick: undo },
  });
}

/** Sincronização em tempo real entre dispositivos (debounce + apenas a tabela alterada). */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      timer.current = null;
      const keys = [...pending.current];
      pending.current.clear();
      if (keys.length > 0) invalidateKeys(qc, keys);
    };
    const channel = supabase
      .channel("erp-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload: { table?: string }) => {
          if (!payload.table) return;
          pending.current.add(payload.table);
          if (timer.current) return;
          timer.current = setTimeout(flush, 800);
        },
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

/** Kits disponíveis = menor quantidade entre as cores do kit, por tamanho. */
export function computeKitAvailable(
  kitId: string,
  sizeId: string,
  kitColors: KitColor[],
  stock: StockUnit[],
): number {
  const colorIds = kitColors.filter((kc) => kc.kit_id === kitId).map((kc) => kc.color_id);
  if (colorIds.length === 0) return 0;
  const values = colorIds.map(
    (cid) => stock.find((s) => s.color_id === cid && s.size_id === sizeId)?.qty ?? 0,
  );
  return Math.min(...values);
}

/** Total de kits possíveis de um kit somando todos os tamanhos do SKU. */
export function kitPossibleTotal(
  kitId: string,
  skuId: string,
  sizes: Size[],
  kitColors: KitColor[],
  stock: StockUnit[],
): number {
  return sizes
    .filter((s) => s.sku_id === skuId)
    .reduce((sum, s) => sum + computeKitAvailable(kitId, s.id, kitColors, stock), 0);
}

export function stockOf(stock: StockUnit[], colorId: string, sizeId: string) {
  return stock.find((s) => s.color_id === colorId && s.size_id === sizeId)?.qty ?? 0;
}

export function formedOf(kitStock: KitStock[], kitId: string, sizeId: string) {
  return kitStock.find((k) => k.kit_id === kitId && k.size_id === sizeId)?.formed_qty ?? 0;
}

/** zero = sem estoque · critico = 1 a 3 · baixo = 4 a 5 · ok = 6+ */
export function alertLevel(qty: number): "zero" | "critico" | "baixo" | "ok" {
  if (qty <= 0) return "zero";
  if (qty < 4) return "critico";
  if (qty <= 5) return "baixo";
  return "ok";
}

/** Nome automático do kit conforme a ordem de seleção das cores. */
export function buildKitName(names: string[]) {
  return names
    .map((n) => n.trim().toUpperCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .join(" + ");
}

/** Assinatura de um kit = conjunto ordenado de cores (para impedir duplicados). */
export function kitSignature(colorIds: string[]) {
  return [...colorIds].sort().join("|");
}

export function useKitBuilder() {
  const qc = useQueryClient();

  const createKit = useMutation({
    mutationFn: async (input: { sku_id: string; colorIds: string[]; name: string }) => {
      if (input.colorIds.length < 2) throw new Error("Selecione ao menos 2 cores para o kit");
      const { data: kit, error } = await supabase
        .from("kits")
        .insert({ sku_id: input.sku_id, name: input.name } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const kitId = (kit as { id: string }).id;
      const { error: e2 } = await supabase.from("kit_colors").insert(
        input.colorIds.map((cid, i) => ({ kit_id: kitId, color_id: cid, position: i })) as never,
      );
      if (e2) throw new Error(e2.message);
      await logAudit("criacao", "kits", kitId, null, input);
      return kitId;
    },
    onSuccess: () => {
      invalidateKeys(qc, ["kits", "kit_colors", "audit_logs"]);
      toast.success("Kit criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateKit = useMutation({
    mutationFn: async (input: { kit_id: string; colorIds: string[]; name: string }) => {
      const { error } = await supabase
        .from("kits")
        .update({ name: input.name } as never)
        .eq("id", input.kit_id);
      if (error) throw new Error(error.message);
      const { error: eDel } = await supabase.from("kit_colors").delete().eq("kit_id", input.kit_id);
      if (eDel) throw new Error(eDel.message);
      const { error: eIns } = await supabase.from("kit_colors").insert(
        input.colorIds.map((cid, i) => ({
          kit_id: input.kit_id,
          color_id: cid,
          position: i,
        })) as never,
      );
      if (eIns) throw new Error(eIns.message);
      await logAudit("edicao", "kits", input.kit_id, null, input);
    },
    onSuccess: () => {
      invalidateKeys(qc, ["kits", "kit_colors", "audit_logs"]);
      toast.success("Kit atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { createKit, updateKit };
}

/* ------------------------------------------------------------------ *
 * Trava por SKU (protege apenas edição direta de quantidade)
 * ------------------------------------------------------------------ */
export function useSetSkuLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sku_id: string; locked: boolean }) => {
      const { error } = await supabase.rpc("set_sku_lock", {
        p_sku_id: input.sku_id,
        p_locked: input.locked,
      });
      if (error) throw new Error(error.message);
      return input.locked;
    },
    onSuccess: (locked) => {
      invalidateKeys(qc, ["skus", "audit_logs"]);
      toast.success(locked ? "SKU travado" : "SKU destravado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Grade: quantidade padrão por tamanho, salva no cadastro do tamanho. */
export function useUpdateSizeGrid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; grid_qty: number }) => {
      const { error } = await supabase
        .from("sizes")
        .update({ grid_qty: Math.max(0, Math.floor(input.grid_qty)) } as never)
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateKeys(qc, STOCK_KEYS),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Movimentação por grade: aplica a quantidade de cada tamanho em uma única chamada por tamanho. */
export function useApplyGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sku_id: string;
      kind: "unit" | "kit";
      direction: "in" | "out";
      ref_id: string;
      rows: { size_id: string; qty: number }[];
      affect_units: boolean;
      affect_formed: boolean;
      note?: string;
      platform_id?: string | null;
    }) => {
      const ids: string[] = [];
      for (const row of input.rows) {
        if (row.qty <= 0) continue;
        const { data, error } = await supabase.rpc("apply_movement", {
          p_sku_id: input.sku_id,
          p_kind: input.kind,
          p_direction: input.direction,
          p_ref_id: input.ref_id,
          p_size_id: row.size_id,
          p_qty: row.qty,
          p_affect_units: input.affect_units,
          p_affect_formed: input.affect_formed,
          p_source: "grade",
          ...(input.note ? { p_note: input.note } : {}),
          ...(input.platform_id ? { p_platform_id: input.platform_id } : {}),
        });
        if (error) throw new Error(error.message);
        ids.push(data as string);
      }
      if (ids.length === 0) throw new Error("Informe ao menos uma quantidade na grade");
      return ids;
    },
    onSuccess: () => invalidateKeys(qc, STOCK_KEYS),
    onError: (e: Error) => toast.error(e.message),
  });
}


/* ------------------------------------------------------------------ *
 * Preferências do usuário (visual, por usuário — não altera o cadastro)
 * ------------------------------------------------------------------ */
export type KitView = "real" | "possiveis" | "distribuido";
/**
 * Modo de distribuição do estoque entre kits e venda unitária.
 * - `kits`: tudo que sobrar vai para a formação de kits;
 * - `unidade`: reserva primeiro uma parte para venda avulsa;
 * - `inteligente`: decide por cor/tamanho conforme o histórico real de saídas.
 */
export type DistMode = "kits" | "unidade" | "inteligente";

/** Valores antigos gravados no banco continuam válidos. */
export function normalizeDistMode(value: string | null | undefined): DistMode {
  if (value === "kits" || value === "unidade" || value === "inteligente") return value;
  if (value === "sem_unidade") return "kits";
  return "unidade"; // "com_unidade" e ausente
}

export type UserPrefs = {
  kit_view: KitView;
  hidden_skus: string[];
  dist_mode: DistMode;
  hidden_charts: string[];
};

const DEFAULT_PREFS: UserPrefs = {
  kit_view: "real",
  hidden_skus: [],
  dist_mode: "inteligente",
  hidden_charts: [],
};

export function useUserPrefs() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["user_prefs"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_prefs")
        .select("kit_view,hidden_skus,dist_mode,hidden_charts")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as (Partial<UserPrefs> & { dist_mode?: string }) | null;
      return {
        kit_view: (row?.kit_view ?? "real") as KitView,
        hidden_skus: (row?.hidden_skus ?? []) as string[],
        dist_mode: normalizeDistMode(row?.dist_mode),
        hidden_charts: (row?.hidden_charts ?? []) as string[],
      } satisfies UserPrefs;
    },

    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<UserPrefs>) => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id;
      if (!uid) throw new Error("Não autenticado");
      const current = qc.getQueryData<UserPrefs>(["user_prefs"]) ?? DEFAULT_PREFS;
      const next = { ...current, ...patch };
      const { error } = await supabase
        .from("user_prefs")
        .upsert({ user_id: uid, ...next } as never, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      return next;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["user_prefs"] });
      const previous = qc.getQueryData<UserPrefs>(["user_prefs"]) ?? DEFAULT_PREFS;
      qc.setQueryData<UserPrefs>(["user_prefs"], { ...previous, ...patch });
      return { previous };
    },
    onError: (e: Error, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(["user_prefs"], ctx.previous);
      toast.error(e.message);
    },
    onSuccess: (next) => qc.setQueryData<UserPrefs>(["user_prefs"], next),
  });

  return { prefs: query.data ?? DEFAULT_PREFS, save };
}

/** Compatibilidade: modo padrão do estoque de kits. */
export function useKitViewPref() {
  const { prefs, save } = useUserPrefs();
  return {
    view: prefs.kit_view,
    save: { ...save, mutate: (v: KitView) => save.mutate({ kit_view: v }) },
  };
}


/* ------------------------------------------------------------------ *
 * Estoque distribuído: divide a cor entre todos os kits que a usam
 * ------------------------------------------------------------------ */
export function computeKitDistributed(
  kitId: string,
  sizeId: string,
  kitColors: KitColor[],
  stock: StockUnit[],
): number {
  const colorIds = kitColors.filter((kc) => kc.kit_id === kitId).map((kc) => kc.color_id);
  if (colorIds.length === 0) return 0;
  const shares = colorIds.map((cid) => {
    const qty = stockOf(stock, cid, sizeId);
    const usedBy = new Set(kitColors.filter((kc) => kc.color_id === cid).map((kc) => kc.kit_id));
    const divisor = Math.max(1, usedBy.size);
    return Math.floor(qty / divisor);
  });
  return Math.max(0, Math.min(...shares));
}

/** Cores de um kit na ordem cadastrada. */
export function kitColorsOf(kitId: string, kitColors: KitColor[], colors: Color[]): Color[] {
  return kitColors
    .filter((kc) => kc.kit_id === kitId)
    .sort((a, b) => a.position - b.position)
    .map((kc) => colors.find((c) => c.id === kc.color_id))
    .filter((c): c is Color => Boolean(c));
}

/* ------------------------------------------------------------------ *
 * Ordenação manual (arrastar e soltar) — reflete em todas as telas
 * ------------------------------------------------------------------ */
export function useReorder(table: "categories" | "skus" | "colors" | "sizes" | "kits") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Uma única rodada paralela, em vez de N requisições em sequência.
      const results = await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from(table)
            .update({ position: i } as never)
            .eq("id", id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    },
    // Reordena o cache na hora: a lista não "pisca" nem espera o banco.
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: [table] });
      const snapshot = qc.getQueriesData<{ id: string; position: number }[]>({ queryKey: [table] });
      const rank = new Map(orderedIds.map((id, i) => [id, i]));
      qc.setQueriesData<{ id: string; position: number }[]>({ queryKey: [table] }, (rows) =>
        rows
          ? rows
              .map((r) => (rank.has(r.id) ? { ...r, position: rank.get(r.id) as number } : r))
              .sort((a, b) => a.position - b.position)
          : rows,
      );
      return { snapshot };
    },
    onError: (e: Error, _ids, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
      toast.error(e.message);
    },
  });
}


/** Move produtos entre categorias (individual ou em massa). */
export function useMoveSkusToCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { skuIds: string[]; categoryId: string | null }) => {
      if (input.skuIds.length === 0) throw new Error("Selecione ao menos um SKU");
      const { error } = await supabase
        .from("skus")
        .update({ category_id: input.categoryId } as never)
        .in("id", input.skuIds);
      if (error) throw new Error(error.message);
      await logAudit("mover_categoria", "skus", null, null, input);
      return input.skuIds.length;
    },
    onSuccess: (n) => {
      invalidateKeys(qc, ["skus", "audit_logs"]);
      toast.success(`${n} SKU(s) movido(s) de categoria`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const MOVEMENT_SOURCES: Record<string, string> = {
  manual: "Manual",
  packing_list: "Scanner OCR",
  grade: "Grade",
  formacao: "Formação de kit",
};
