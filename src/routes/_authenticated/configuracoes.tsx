import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Download, HardDrive, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformManager } from "@/components/platform-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  downloadCsv,
  downloadPdf,
  downloadText,
  downloadXlsx,
  toCsv,
  type Row,
} from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
  head: () => ({
    meta: [
      { title: "Configurações · Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Armazenamento real, exportação em CSV, XLSX e PDF e limpeza de dados com filtros e pré-visualização.",
      },
      { property: "og:title", content: "Configurações · Estoque TikTok Shop" },
      {
        property: "og:description",
        content: "Armazenamento, exportação e limpeza de dados do sistema de estoque.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Cota contratada do banco (Lovable Cloud). */
const STORAGE_QUOTA = 5 * 1024 ** 3;

const TABLE_LABELS: Record<string, string> = {
  audit_logs: "Registro de auditoria",
  barcodes: "Códigos de barras",
  categories: "Categorias",
  colors: "Cores",
  kit_colors: "Cores dos kits",
  kit_stock: "Kits formados",
  kits: "Kits",
  movements: "Movimentações",
  packing_reads: "Leituras de packing list",
  profiles: "Perfis",
  sizes: "Tamanhos",
  skus: "SKUs",
  stock_edits: "Edições de estoque",
  stock_units: "Estoque por cor e tamanho",
  user_prefs: "Preferências",
  user_roles: "Permissões",
};

const EXPORT_TABLES = [
  "categories",
  "skus",
  "colors",
  "sizes",
  "kits",
  "kit_colors",
  "stock_units",
  "kit_stock",
  "barcodes",
  "movements",
  "stock_edits",
  "packing_reads",
  "audit_logs",
] as const;

/** Tabelas que podem ser limpas, com o campo de data usado no filtro. */
const PURGE_TABLES = [
  { table: "movements", label: "Movimentações" },
  { table: "packing_reads", label: "Leituras de packing list" },
  { table: "stock_edits", label: "Edições de estoque" },
  { table: "audit_logs", label: "Registro de auditoria" },
] as const;

type PurgeTable = (typeof PURGE_TABLES)[number]["table"];

type StorageInfo = {
  database_bytes: number;
  tables: { name: string; bytes: number; rows: number }[];
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

const COLUMN_LABELS: Record<string, string> = {
  sku_id: "Produto (SKU)",
  color_id: "Cor",
  size_id: "Tamanho",
  kit_id: "Kit",
  category_id: "Categoria",
  movement_id: "Movimentação",
  seller_sku: "SKU do vendedor",
  name: "Nome",
  qty: "Quantidade",
  formed_qty: "Kits formados",
  qty_before: "Antes",
  qty_after: "Depois",
  delta: "Diferença",
  kind: "Tipo",
  direction: "Entrada/Saída",
  note: "Observação",
  source: "Origem",
  order_ref: "Pedido",
  user_name: "Usuário",
  created_at: "Data",
  updated_at: "Atualizado em",
  stock_before: "Estoque antes",
  stock_after: "Estoque depois",
  min_stock: "Estoque mínimo",
  grid_qty: "Grade padrão",
  locked: "Travado",
  code: "Código",
  action: "Ação",
  entity: "Registro",
  hex: "Cor (hex)",
  position: "Ordem",
  deleted_at: "Excluído em",
  barcode: "Código de barras",
  raw_text: "Texto lido",
  undone_at: "Desfeito em",
  affect_units: "Afeta unidades",
  affect_formed: "Afeta kits formados",
};

const HIDDEN_COLUMNS = new Set([
  "id",
  "user_id",
  "entity_id",
  "lines",
  "old_values",
  "new_values",
  "parsed",
  "browser",
  "device",
  "ip",
]);

function ConfiguracoesPage() {
  const qc = useQueryClient();

  const storage = useQuery({
    queryKey: ["storage-info"],
    queryFn: async (): Promise<StorageInfo> => {
      const { data, error } = await supabase.rpc("db_storage_info");
      if (error) throw error;
      return data as unknown as StorageInfo;
    },
  });

  const tables = useMemo(() => {
    const list = storage.data?.tables ?? [];
    const max = Math.max(1, ...list.map((t) => t.bytes));
    return list.map((t) => ({ ...t, pct: (t.bytes / max) * 100 }));
  }, [storage.data]);

  const totalRows = useMemo(
    () => (storage.data?.tables ?? []).reduce((acc, t) => acc + t.rows, 0),
    [storage.data],
  );

  const used = storage.data?.database_bytes ?? 0;
  const usedPct = Math.min(100, (used / STORAGE_QUOTA) * 100);

  /** Consumo separado por categoria. */
  const byCategory = useMemo(() => {
    const list = storage.data?.tables ?? [];
    const sum = (names: string[]) =>
      list.filter((t) => names.includes(t.name)).reduce((a, t) => a + t.bytes, 0);
    const cadastros = sum([
      "skus",
      "colors",
      "sizes",
      "kits",
      "kit_colors",
      "categories",
      "barcodes",
    ]);
    const operacao = sum(["movements", "stock_units", "kit_stock", "stock_edits"]);
    const leituras = sum(["packing_reads"]);
    const auditoria = sum(["audit_logs"]);
    const contas = sum(["profiles", "user_prefs", "user_roles"]);
    const outros = Math.max(0, used - cadastros - operacao - leituras - auditoria - contas);
    return [
      { label: "Banco de dados (total)", bytes: used },
      { label: "Cadastros", bytes: cadastros },
      { label: "Estoque e movimentações", bytes: operacao },
      { label: "Leituras de etiqueta", bytes: leituras },
      { label: "Auditoria", bytes: auditoria },
      { label: "Contas e preferências", bytes: contas },
      { label: "Imagens", bytes: 0 },
      { label: "Arquivos e backups", bytes: 0 },
      { label: "Outros dados", bytes: outros },
    ];
  }, [storage.data, used]);

  // ---- catálogo para filtros e nomes -----------------------------------
  const catalog = useQuery({
    queryKey: ["export-catalog"],
    queryFn: async () => {
      const [cats, skus, colors, sizes, kits] = await Promise.all([
        supabase.from("categories").select("id,name").order("position"),
        supabase.from("skus").select("id,seller_sku,name,category_id").order("position"),
        supabase.from("colors").select("id,name,sku_id"),
        supabase.from("sizes").select("id,name,sku_id"),
        supabase.from("kits").select("id,name,sku_id"),
      ]);
      const map = new Map<string, string>();
      for (const c of cats.data ?? []) map.set(c.id, c.name);
      for (const s of skus.data ?? []) map.set(s.id, `${s.seller_sku} — ${s.name}`);
      for (const c of colors.data ?? []) map.set(c.id, c.name);
      for (const s of sizes.data ?? []) map.set(s.id, s.name);
      for (const k of kits.data ?? []) map.set(k.id, k.name);
      return {
        map,
        categories: cats.data ?? [],
        skus: skus.data ?? [],
        kits: kits.data ?? [],
      };
    },
    staleTime: 60_000,
  });

  const humanize = useMemo(() => {
    const map = catalog.data?.map ?? new Map<string, string>();
    return (rows: Row[]): Row[] =>
      rows.map((row) => {
        const out: Row = {};
        for (const [key, value] of Object.entries(row)) {
          if (HIDDEN_COLUMNS.has(key)) continue;
          const label = COLUMN_LABELS[key] ?? key;
          if (typeof value === "string" && map.has(value)) out[label] = map.get(value);
          else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))
            out[label] = new Date(value).toLocaleString("pt-BR");
          else if (typeof value === "boolean") out[label] = value ? "Sim" : "Não";
          else if (value === null || value === undefined) out[label] = "";
          else if (typeof value === "object") out[label] = JSON.stringify(value);
          else out[label] = value;
        }
        return out;
      });
  }, [catalog.data]);

  // ---- exportação -------------------------------------------------------
  const [exporting, setExporting] = useState<string | null>(null);
  const [expFrom, setExpFrom] = useState(monthAgoISO());
  const [expTo, setExpTo] = useState(todayISO());
  const [expSku, setExpSku] = useState("all");
  const [expCategory, setExpCategory] = useState("all");
  const [expDirection, setExpDirection] = useState("all");
  const [expFormat, setExpFormat] = useState<"csv" | "xlsx" | "pdf">("xlsx");

  const skusOfCategory = useMemo(() => {
    const all = catalog.data?.skus ?? [];
    if (expCategory === "all") return all;
    return all.filter((s) =>
      expCategory === "none" ? !s.category_id : s.category_id === expCategory,
    );
  }, [catalog.data, expCategory]);

  const fromISO = useMemo(() => new Date(`${expFrom}T00:00:00`).toISOString(), [expFrom]);
  const toISO = useMemo(() => new Date(`${expTo}T23:59:59`).toISOString(), [expTo]);

  /** Movimentações filtradas por período, SKU, categoria e tipo. */
  async function fetchMovements(): Promise<Row[]> {
    let q = supabase
      .from("movements")
      .select("*")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false });
    if (expSku !== "all") q = q.eq("sku_id", expSku);
    else if (expCategory !== "all")
      q = q.in(
        "sku_id",
        skusOfCategory.map((s) => s.id).concat("00000000-0000-0000-0000-000000000000"),
      );
    if (expDirection !== "all") q = q.eq("direction", expDirection as "in" | "out");
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Row[];
  }

  async function fetchTable(table: string): Promise<Row[]> {
    const { data, error } = await supabase.from(table as never).select("*");
    if (error) throw error;
    return (data ?? []) as Row[];
  }

  async function exportDataset(key: string) {
    setExporting(key);
    try {
      const name = `${key}-${todayISO()}`;
      if (key === "movimentacoes") {
        const rows = humanize(await fetchMovements());
        if (rows.length === 0) return void toast.info("Nenhuma movimentação no filtro escolhido.");
        if (expFormat === "csv") downloadCsv(name, rows);
        else if (expFormat === "xlsx") await downloadXlsx(name, [{ name: "Movimentações", rows }]);
        else
          await downloadPdf(name, "Relatório de movimentações", [
            {
              kind: "kpis",
              title: "Resumo",
              items: [
                { label: "Registros", value: String(rows.length) },
                { label: "Período", value: `${expFrom} a ${expTo}` },
              ],
            },
            { kind: "table", title: "Movimentações", rows: rows.slice(0, 400) },
          ]);
        toast.success(`${rows.length} registro(s) exportado(s).`);
        return;
      }

      if (key === "backup") {
        const sheets: { name: string; rows: Row[] }[] = [];
        for (const table of EXPORT_TABLES) {
          sheets.push({
            name: TABLE_LABELS[table] ?? table,
            rows: humanize(await fetchTable(table)),
          });
        }
        if (expFormat === "csv") {
          const parts = sheets.map((s) => `### ${s.name}\r\n${toCsv(s.rows) || "(vazio)"}\r\n`);
          downloadText(
            `backup-completo-${todayISO()}.csv`,
            parts.join("\r\n"),
            "text/csv;charset=utf-8",
          );
        } else {
          await downloadXlsx(`backup-completo-${todayISO()}`, sheets);
        }
        toast.success("Exportação completa gerada.");
        return;
      }

      const rows = humanize(await fetchTable(key));
      if (rows.length === 0)
        return void toast.info(`Nada para exportar em ${TABLE_LABELS[key] ?? key}.`);
      const label = (TABLE_LABELS[key] ?? key).toLowerCase().replace(/\s+/g, "-");
      if (expFormat === "csv") downloadCsv(`${label}-${todayISO()}`, rows);
      else if (expFormat === "xlsx")
        await downloadXlsx(`${label}-${todayISO()}`, [{ name: TABLE_LABELS[key] ?? key, rows }]);
      else
        await downloadPdf(`${label}-${todayISO()}`, TABLE_LABELS[key] ?? key, [
          { kind: "table", title: TABLE_LABELS[key] ?? key, rows: rows.slice(0, 400) },
        ]);
      toast.success(`${rows.length} linha(s) exportada(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setExporting(null);
    }
  }

  /** Relatório visual do dashboard no período filtrado. */
  async function exportDashboard() {
    setExporting("dashboard");
    try {
      const movements = await fetchMovements();
      const stock = await fetchTable("stock_units");
      const map = catalog.data?.map ?? new Map<string, string>();
      const entradas = movements.filter((m) => m["direction"] === "in");
      const saidas = movements.filter((m) => m["direction"] === "out");
      const sum = (rows: Row[]) => rows.reduce((a, r) => a + Number(r["qty"] ?? 0), 0);
      const totalStock = stock.reduce((a, r) => a + Number(r["qty"] ?? 0), 0);

      const rank = (rows: Row[], field: string) => {
        const acc = new Map<string, number>();
        for (const r of rows) {
          const id = String(r[field] ?? "");
          if (!id) continue;
          acc.set(id, (acc.get(id) ?? 0) + Number(r["qty"] ?? 0));
        }
        return [...acc.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, value]) => ({ label: map.get(id) ?? id, value }));
      };

      await downloadPdf(`dashboard-${todayISO()}`, "Dashboard de estoque", [
        {
          kind: "kpis",
          title: `Período ${expFrom} a ${expTo}`,
          items: [
            { label: "Estoque atual (unidades)", value: totalStock.toLocaleString("pt-BR") },
            { label: "Entradas", value: sum(entradas).toLocaleString("pt-BR") },
            { label: "Saídas", value: sum(saidas).toLocaleString("pt-BR") },
            { label: "Movimentações", value: movements.length.toLocaleString("pt-BR") },
          ],
        },
        { kind: "bars", title: "Produtos mais movimentados", items: rank(movements, "sku_id") },
        { kind: "bars", title: "Kits mais movimentados", items: rank(movements, "kit_id") },
        {
          kind: "table",
          title: "Movimentações do período",
          rows: humanize(movements).slice(0, 300),
        },
      ]);
      toast.success("Relatório do dashboard gerado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar relatório.");
    } finally {
      setExporting(null);
    }
  }

  // ---- limpeza com filtros ----------------------------------------------
  const [purgeTable, setPurgeTable] = useState<PurgeTable>("movements");
  const [from, setFrom] = useState(monthAgoISO());
  const [to, setTo] = useState(todayISO());
  const [pSku, setPSku] = useState("all");
  const [pDirection, setPDirection] = useState("all");
  const [pOrder, setPOrder] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const purgeFrom = useMemo(() => new Date(`${from}T00:00:00`).toISOString(), [from]);
  const purgeTo = useMemo(() => new Date(`${to}T23:59:59`).toISOString(), [to]);

  const supportsSku = purgeTable === "movements" || purgeTable === "stock_edits";
  const supportsDirection = purgeTable === "movements";
  const supportsOrder = purgeTable === "movements" || purgeTable === "packing_reads";

  const applyPurgeFilters = <T,>(query: T): T => {
    let q = query as unknown as {
      gte: (c: string, v: string) => unknown;
      lte: (c: string, v: string) => unknown;
      eq: (c: string, v: string) => unknown;
      ilike: (c: string, v: string) => unknown;
    };
    q = q.gte("created_at", purgeFrom) as typeof q;
    q = q.lte("created_at", purgeTo) as typeof q;
    if (supportsSku && pSku !== "all") q = q.eq("sku_id", pSku) as typeof q;
    if (supportsDirection && pDirection !== "all") q = q.eq("direction", pDirection) as typeof q;
    if (supportsOrder && pOrder.trim()) q = q.ilike("order_ref", `%${pOrder.trim()}%`) as typeof q;
    return q as unknown as T;
  };

  const preview = useQuery({
    queryKey: ["purge-preview", purgeTable, purgeFrom, purgeTo, pSku, pDirection, pOrder],
    enabled: new Date(purgeTo) > new Date(purgeFrom),
    queryFn: async () => {
      const { data, count, error } = await applyPurgeFilters(
        supabase
          .from(purgeTable as never)
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(20),
      );
      if (error) throw error;
      return { count: count ?? 0, sample: (data ?? []) as Row[] };
    },
  });

  const purge = useMutation({
    mutationFn: async () => {
      // Busca os IDs primeiro: o PostgREST nem sempre devolve a contagem no delete,
      // o que fazia a tela mostrar "0 excluído" mesmo apagando registros.
      const { data, error: selError } = await applyPurgeFilters(
        supabase.from(purgeTable as never).select("id"),
      );
      if (selError) throw selError;
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return 0;

      let removed = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: del, error } = await supabase
          .from(purgeTable as never)
          .delete()
          .in("id", chunk)
          .select("id");
        if (error) throw error;
        removed += ((del ?? []) as { id: string }[]).length;
      }
      if (removed === 0) {
        throw new Error("Nenhum registro pôde ser excluído — verifique suas permissões.");
      }
      return removed;
    },
    onSuccess: (count) => {
      toast.success(`${count} registro(s) excluído(s) definitivamente.`);
      setConfirmOpen(false);
      setConfirmText("");
      void qc.invalidateQueries();
      void storage.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na limpeza."),
  });

  async function exportBeforePurge() {
    try {
      const { data, error } = await applyPurgeFilters(
        supabase.from(purgeTable as never).select("*"),
      );
      if (error) throw error;
      const rows = humanize((data ?? []) as Row[]);
      if (rows.length === 0) return void toast.info("Nada para exportar.");
      await downloadXlsx(`antes-da-limpeza-${purgeTable}-${todayISO()}`, [
        { name: TABLE_LABELS[purgeTable] ?? purgeTable, rows },
      ]);
      toast.success("Backup dos registros gerado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Armazenamento, exportação de dados e limpeza com filtros.
        </p>
      </header>

      <PlatformManager />

      {/* Armazenamento */}
      <section className="card-elevated space-y-4 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <HardDrive className="size-5 shrink-0 text-primary" />
            <h2 className="truncate font-display text-lg font-semibold">Armazenamento</h2>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {storage.isLoading ? "..." : `${usedPct.toFixed(1)}% usado`}
          </Badge>
        </div>

        <Progress value={usedPct} className="h-2.5" />
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total", value: formatBytes(STORAGE_QUOTA) },
            { label: "Usado", value: formatBytes(used) },
            { label: "Disponível", value: formatBytes(Math.max(0, STORAGE_QUOTA - used)) },
            { label: "Registros", value: totalRows.toLocaleString("pt-BR") },
          ].map((c) => (
            <li key={c.label} className="rounded-lg border border-border p-2">
              <span className="block text-xs text-muted-foreground">{c.label}</span>
              <strong className="tabular-nums text-sm">{c.value}</strong>
            </li>
          ))}
        </ul>

        <ul className="grid gap-2 sm:grid-cols-3">
          {byCategory.map((c) => (
            <li key={c.label} className="rounded-lg border border-border p-2">
              <span className="block text-xs text-muted-foreground">{c.label}</span>
              <strong className="tabular-nums text-sm">{formatBytes(c.bytes)}</strong>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          O sistema não guarda imagens nem arquivos: as fotos da câmera são processadas na hora e
          descartadas. Os valores são recalculados automaticamente após cada limpeza.
        </p>

        <ul className="space-y-2">
          {tables.map((t) => (
            <li key={t.name} className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{TABLE_LABELS[t.name] ?? t.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {t.rows.toLocaleString("pt-BR")} · {formatBytes(t.bytes)}
                </span>
              </div>
              <Progress value={t.pct} className="h-1.5" />
            </li>
          ))}
          {!storage.isLoading && tables.length === 0 && (
            <li className="text-sm text-muted-foreground">Sem informações disponíveis.</li>
          )}
        </ul>
      </section>

      {/* Exportação */}
      <section className="card-elevated space-y-4 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <Download className="size-5 shrink-0 text-primary" />
          <h2 className="truncate font-display text-lg font-semibold">Exportar dados</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          CSV e XLSX trazem os dados limpos; o PDF é um relatório visual com indicadores e gráficos.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp-from">De</Label>
            <Input
              id="exp-from"
              type="date"
              value={expFrom}
              onChange={(e) => setExpFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-to">Até</Label>
            <Input
              id="exp-to"
              type="date"
              value={expTo}
              onChange={(e) => setExpTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Formato</Label>
            <Select value={expFormat} onValueChange={(v) => setExpFormat(v as typeof expFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">XLSX (planilha)</SelectItem>
                <SelectItem value="pdf">PDF (relatório)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={expCategory}
              onValueChange={(v) => {
                setExpCategory(v);
                setExpSku("all");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="none">Sem categoria</SelectItem>
                {(catalog.data?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Produto (SKU)</Label>
            <Select value={expSku} onValueChange={setExpSku}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {skusOfCategory.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seller_sku} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={expDirection} onValueChange={setExpDirection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Entradas e saídas</SelectItem>
                <SelectItem value="in">Somente entradas</SelectItem>
                <SelectItem value="out">Somente saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={exporting !== null} onClick={() => void exportDataset("movimentacoes")}>
            <Download className="size-4" />
            Movimentações filtradas
          </Button>
          <Button
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => void exportDashboard()}
          >
            <Download className="size-4" />
            {exporting === "dashboard" ? "Gerando..." : "Relatório do dashboard (PDF)"}
          </Button>
          <Button
            variant="outline"
            disabled={exporting !== null}
            onClick={() => void exportDataset("backup")}
          >
            <Download className="size-4" />
            {exporting === "backup" ? "Gerando..." : "Exportação completa"}
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_TABLES.map((t) => (
            <Button
              key={t}
              variant="outline"
              size="sm"
              disabled={exporting !== null}
              onClick={() => void exportDataset(t)}
              className="justify-start"
            >
              <Database className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{TABLE_LABELS[t] ?? t}</span>
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Backup técnico do banco (restauração completa do sistema) é feito pela infraestrutura da
          Lovable Cloud automaticamente — as exportações acima são para uso do dia a dia.
        </p>
      </section>

      {/* Limpeza */}
      <section className="card-elevated space-y-4 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <Trash2 className="size-5 shrink-0 text-destructive" />
          <h2 className="truncate font-display text-lg font-semibold">Limpar dados</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Escolha o que apagar e filtre por período, produto, tipo e pedido. Os cadastros e o
          estoque atual não são alterados. A exclusão é definitiva — exporte antes.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Tipo de dado</Label>
            <Select value={purgeTable} onValueChange={(v) => setPurgeTable(v as PurgeTable)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURGE_TABLES.map((t) => (
                  <SelectItem key={t.table} value={t.table}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purge-from">De</Label>
            <Input
              id="purge-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purge-to">Até</Label>
            <Input id="purge-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {supportsSku && (
            <div className="space-y-1.5">
              <Label>Produto (SKU)</Label>
              <Select value={pSku} onValueChange={setPSku}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(catalog.data?.skus ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.seller_sku} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {supportsDirection && (
            <div className="space-y-1.5">
              <Label>Tipo de movimentação</Label>
              <Select value={pDirection} onValueChange={setPDirection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Entradas e saídas</SelectItem>
                  <SelectItem value="in">Somente entradas</SelectItem>
                  <SelectItem value="out">Somente saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {supportsOrder && (
            <div className="space-y-1.5">
              <Label htmlFor="purge-order">Pedido contém</Label>
              <Input
                id="purge-order"
                value={pOrder}
                onChange={(e) => setPOrder(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          {preview.isLoading && "Contando registros..."}
          {preview.isError && "Período inválido."}
          {preview.data && (
            <>
              <p>
                <strong className="tabular-nums">{preview.data.count}</strong> registro(s) serão
                afetados.
              </p>
              {preview.data.sample.length > 0 && (
                <div className="max-h-56 overflow-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {humanize(preview.data.sample).map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          {Object.entries(row)
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <td key={k} className="max-w-[10rem] truncate px-2 py-1">
                                {String(v ?? "")}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.data.count > preview.data.sample.length && (
                <p className="text-xs text-muted-foreground">
                  Mostrando as {preview.data.sample.length} mais recentes.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportBeforePurge()}>
            <Download className="size-4" />
            Exportar antes de excluir
          </Button>
          <Button
            variant="destructive"
            disabled={!preview.data || preview.data.count === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Excluir {preview.data?.count ?? 0} registro(s)
          </Button>
        </div>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão definitiva</AlertDialogTitle>
            <AlertDialogDescription>
              {preview.data?.count ?? 0} registro(s) de{" "}
              {(TABLE_LABELS[purgeTable] ?? purgeTable).toLowerCase()} entre {from} e {to} serão
              apagados. Digite EXCLUIR para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="EXCLUIR"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "EXCLUIR" || purge.isPending}
              onClick={(e) => {
                e.preventDefault();
                purge.mutate();
              }}
            >
              {purge.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
