import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateKeys, logAudit, type StockUnit } from "@/lib/erp";

/**
 * Camada de plataforma.
 *
 * Cada plataforma possui um saldo exclusivo dentro do estoque físico total.
 * O saldo geral é somente a parcela ainda não atribuída a plataforma alguma.
 */

export type Platform = {
  id: string;
  name: string;
  slug: string;
  color: string;
  position: number;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type StockAllocation = {
  id: string;
  platform_id: string;
  sku_id: string;
  color_id: string;
  size_id: string;
  qty: number;
};

/** Valor especial do filtro: saldo geral não atribuído. */
export const ALL_PLATFORMS = "all";

const CATALOG = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false } as const;
const LIVE = { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false } as const;

export function usePlatforms(trash = false) {
  return useQuery({
    queryKey: ["platforms", trash] as const,
    queryFn: async () => {
      const q = supabase.from("platforms").select("*").order("position").order("created_at");
      const { data, error } = await (trash
        ? q.not("deleted_at", "is", null)
        : q.is("deleted_at", null));
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Platform[];
    },
    ...CATALOG,
  });
}

export function useAllocations() {
  return useQuery({
    queryKey: ["stock_allocations"] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_allocations").select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StockAllocation[];
    },
    ...LIVE,
  });
}

/** Define o saldo exclusivo de uma plataforma para SKU+cor+tamanho. */
export function useSetAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      platform_id: string;
      sku_id: string;
      color_id: string;
      size_id: string;
      qty: number;
    }) => {
      const { error } = await supabase.rpc("set_allocation", {
        p_platform_id: input.platform_id,
        p_sku_id: input.sku_id,
        p_color_id: input.color_id,
        p_size_id: input.size_id,
        p_qty: Math.max(0, Math.floor(input.qty)),
      } as never);
      if (error) throw new Error(error.message);
      return input;
    },
    onSuccess: () => {
      invalidateKeys(qc, ["stock_allocations", "audit_logs"]);
      toast.success("✓ Saldo da plataforma atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePlatformCrud() {
  const qc = useQueryClient();
  const done = (msg: string) => {
    invalidateKeys(qc, ["platforms", "stock_allocations", "audit_logs"]);
    toast.success(msg);
  };

  const create = useMutation({
    mutationFn: async (values: { name: string; color: string }) => {
      const slug = values.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      if (!slug) throw new Error("Informe um nome válido");
      const { data, error } = await supabase
        .from("platforms")
        .insert({ name: values.name.trim(), slug, color: values.color } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logAudit("criacao", "platforms", (data as { id: string }).id, null, values);
      return data as { id: string };
    },
    onSuccess: () => done("Plataforma criada"),
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("platforms")
        .update(values as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("edicao", "platforms", id, null, values);
    },
    onSuccess: () => done("Plataforma atualizada"),
    onError: (e: Error) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platforms")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("exclusao", "platforms", id);
    },
    onSuccess: () => done("Plataforma movida para a lixeira"),
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platforms")
        .update({ deleted_at: null } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("restauracao", "platforms", id);
    },
    onSuccess: () => done("Plataforma restaurada"),
    onError: (e: Error) => toast.error(e.message),
  });

  /** Exclusão específica: apaga a plataforma e apenas as reservas dela. */
  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error: eAlloc } = await supabase
        .from("stock_allocations")
        .delete()
        .eq("platform_id", id);
      if (eAlloc) throw new Error(eAlloc.message);
      const { error } = await supabase.from("platforms").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit("exclusao_definitiva", "platforms", id);
    },
    onSuccess: () => done("Plataforma excluída — estoque geral preservado"),
    onError: (e: Error) => toast.error(e.message),
  });

  return { create, update, softDelete, restore, hardDelete };
}

/* ------------------------------------------------------------------ *
 * Filtro global de plataforma (compartilhado entre todas as telas)
 * ------------------------------------------------------------------ */
const KEY = "erp:platform-filter";
const EVENT = "erp:platform-filter-change";

export function usePlatformFilter() {
  const [platformId, setState] = useState<string>(ALL_PLATFORMS);

  useEffect(() => {
    const read = () => setState(localStorage.getItem(KEY) ?? ALL_PLATFORMS);
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const setPlatformId = (value: string) => {
    localStorage.setItem(KEY, value);
    window.dispatchEvent(new Event(EVENT));
  };

  return { platformId, setPlatformId, isAll: platformId === ALL_PLATFORMS };
}

/* ------------------------------------------------------------------ *
 * Cálculos
 * ------------------------------------------------------------------ */
export function allocationOf(
  allocations: StockAllocation[],
  platformId: string,
  colorId: string,
  sizeId: string,
) {
  return (
    allocations.find(
      (a) => a.platform_id === platformId && a.color_id === colorId && a.size_id === sizeId,
    )?.qty ?? 0
  );
}

/** Total reservado (todas as plataformas) para uma cor/tamanho. */
export function reservedOf(allocations: StockAllocation[], colorId: string, sizeId: string) {
  return allocations
    .filter((a) => a.color_id === colorId && a.size_id === sizeId)
    .reduce((sum, a) => sum + a.qty, 0);
}

/** Saldo geral não atribuído = físico total - saldos exclusivos. */
export function freeOf(
  stock: StockUnit[],
  allocations: StockAllocation[],
  colorId: string,
  sizeId: string,
) {
  const total = stock.find((s) => s.color_id === colorId && s.size_id === sizeId)?.qty ?? 0;
  return Math.max(0, total - reservedOf(allocations, colorId, sizeId));
}

/**
 * Visão isolada: geral mostra só o saldo não atribuído; cada plataforma mostra
 * exclusivamente seu próprio saldo.
 */
export function viewStock(
  stock: StockUnit[],
  allocations: StockAllocation[],
  platformId: string,
): StockUnit[] {
  if (platformId === ALL_PLATFORMS) {
    return stock.map((s) => ({
      ...s,
      qty: freeOf(stock, allocations, s.color_id, s.size_id),
    }));
  }
  return stock.map((s) => ({
    ...s,
    qty: allocationOf(allocations, platformId, s.color_id, s.size_id),
  }));
}
