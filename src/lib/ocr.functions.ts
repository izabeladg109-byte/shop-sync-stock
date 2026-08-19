import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ParsedLine = {
  sku: string;
  colors: string[];
  size: string;
  qty: number;
  pattern?: string;
  confidence: {
    sku: number;
    colors: number;
    size: number;
    qty: number;
  };
};

type Input = {
  image: string;
  skus: string[];
  colors: string[];
  sizes: string[];
  kits: string[];
};

const SYSTEM = `Você lê etiquetas/packing lists do TikTok Shop em fotos.
Extraia TODOS os itens vendidos na etiqueta, ignorando lixo visual (endereços, códigos de rastreio, logos, QR, textos legais).
MUITO IMPORTANTE: uma mesma etiqueta quase sempre contém VÁRIAS linhas de produto. Percorra a tabela/lista inteira, de cima a baixo, e devolva UMA entrada para CADA linha, mesmo quando o SKU se repete e só muda a cor, o tamanho ou a quantidade. Nunca devolva apenas a primeira linha. Linhas diferentes podem ter SKUs/referências diferentes: interprete cada linha isoladamente e não assuma que todas pertencem ao mesmo SKU.
Para cada item devolva:
- sku: o Seller SKU exatamente como aparece;
- colors: TODAS as cores do item, em ordem, como um array. Se a etiqueta trouxer "PRETO + MARROM", "PRETO/MARROM" ou "KIT PRETO MARROM", devolva ["PRETO","MARROM"]. Kits podem ter 2, 3 ou mais cores — devolva todas;
- size: o tamanho (se vier como "G/44" devolva o que estiver mais próximo das opções conhecidas);
- qty: a quantidade (padrão 1);
- confidence: objeto com a sua confiança REAL de leitura (0 a 1) para cada campo: sku, colors, size, qty.
Regras de confiança: só use valores acima de 0.97 quando o texto estiver perfeitamente legível e idêntico a uma opção conhecida. Se você inferiu, adivinhou, corrigiu ou o texto estava borrado/cortado, use valores menores (0.5 a 0.9). NUNCA devolva 1.
Prefira os valores mais próximos das listas de opções conhecidas fornecidas pelo usuário, mas devolva o texto lido quando não houver correspondência clara. Se um campo não existir na etiqueta, devolva string vazia (ou array vazio) e confiança 0.
Responda APENAS JSON no formato {"items":[{"sku":"","colors":[""],"size":"","qty":1,"confidence":{"sku":0.9,"colors":0.9,"size":0.9,"qty":0.9}}]}.`;

type RawItem = {
  sku?: unknown;
  color?: unknown;
  colors?: unknown;
  size?: unknown;
  qty?: unknown;
  confidence?: Record<string, unknown>;
};

function conf(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(0.99, n > 1 ? n / 100 : n);
}

function known(value: string, options: string[]) {
  const normalized = value.trim().toLocaleUpperCase("pt-BR");
  return options.some((option) => option.trim().toLocaleUpperCase("pt-BR") === normalized);
}

export const parsePackingLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data?.image || typeof data.image !== "string") throw new Error("Imagem inválida");
    return data;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("IA não configurada");

    const context = [
      `SKUs conhecidos: ${data.skus.join(" | ") || "-"}`,
      `Cores conhecidas: ${data.colors.join(" | ") || "-"}`,
      `Kits conhecidos: ${data.kits.join(" | ") || "-"}`,
      `Tamanhos conhecidos: ${data.sizes.join(" | ") || "-"}`,
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: context },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[ocr] gateway ${res.status}: ${body}`);
      // Reforço opcional: nunca bloqueia o scanner, que roda OCR local.
      return { items: [] as ParsedLine[] };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let items: ParsedLine[] = [];
    try {
      const parsed = JSON.parse(raw) as { items?: RawItem[] };
      items = (parsed.items ?? [])
        .map((i) => {
          const list = Array.isArray(i.colors)
            ? i.colors.map((c) => String(c ?? "").trim()).filter(Boolean)
            : String(i.color ?? "")
                .split(/\s*(?:\+|\/|&|,|\be\b)\s*/i)
                .map((c) => c.trim())
                .filter(Boolean);
          const c = i.confidence ?? {};
          const sku = String(i.sku ?? "").trim();
          const size = String(i.size ?? "").trim();
          const safeColors = list.filter((value) => known(value, [...data.colors, ...data.kits]));
          return {
            sku: known(sku, data.skus) ? sku : "",
            colors: safeColors,
            size: known(size, data.sizes) ? size : "",
            qty: Number(i.qty) > 0 ? Math.floor(Number(i.qty)) : 1,
            confidence: {
              sku: known(sku, data.skus) ? conf(c["sku"], 0) : 0,
              colors: safeColors.length === list.length ? conf(c["colors"] ?? c["color"], 0) : 0,
              size: known(size, data.sizes) ? conf(c["size"], 0) : 0,
              qty: conf(c["qty"], 0),
            },
          };
        })
        .filter((item) => item.sku && item.size && item.colors.length > 0);
    } catch {
      items = [];
    }

    return { items };
  });
