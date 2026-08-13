/**
 * Tabela padrão de cores usadas em moda (pt-BR).
 * Ao digitar o nome da cor o sistema preenche HEX/RGB automaticamente.
 * O usuário sempre pode alterar manualmente.
 */
export const COLOR_TABLE: Record<string, string> = {
  preto: "#000000",
  branco: "#FFFFFF",
  "off white": "#F5F1E8",
  offwhite: "#F5F1E8",
  cinza: "#808080",
  "cinza claro": "#C0C0C0",
  "cinza escuro": "#4A4A4A",
  chumbo: "#3A3A3C",
  grafite: "#2F2F2F",
  azul: "#1E4FD8",
  "azul claro": "#5CA9F5",
  "azul escuro": "#12275C",
  "azul marinho": "#0F1F3D",
  marinho: "#0F1F3D",
  "azul serenity": "#94B3D6",
  jeans: "#3B5F8A",
  marrom: "#5C3A21",
  "marrom claro": "#8B5E3C",
  cafe: "#4B3621",
  café: "#4B3621",
  chocolate: "#3F2A1D",
  caqui: "#B5A16B",
  khaki: "#B5A16B",
  militar: "#4B5320",
  oliva: "#6B7A3A",
  "verde militar": "#4B5320",
  verde: "#1E7B3C",
  "verde agua": "#77D8C8",
  "verde água": "#77D8C8",
  "verde claro": "#7FD97F",
  "verde escuro": "#124D2A",
  areia: "#DDCFAE",
  bege: "#D8C3A5",
  nude: "#E3BC9A",
  creme: "#F3E6D0",
  amarelo: "#FFD400",
  mostarda: "#D4A017",
  laranja: "#F97316",
  terracota: "#B75C3C",
  vermelho: "#D32029",
  vinho: "#5E1421",
  bordo: "#5E1421",
  bordô: "#5E1421",
  rosa: "#FF6FA3",
  "rosa claro": "#FFC0D3",
  pink: "#FF0050",
  fucsia: "#FF0050",
  fúcsia: "#FF0050",
  roxo: "#6B2FA0",
  lilas: "#C5A3E0",
  lilás: "#C5A3E0",
  violeta: "#7B3FA0",
  prata: "#C9CCD1",
  dourado: "#C9A227",
  ciano: "#00F2EA",
  turquesa: "#2EC4B6",
  petroleo: "#1B4D52",
  petróleo: "#1B4D52",
  telha: "#A9452F",
  salmao: "#FA8072",
  salmão: "#FA8072",
  coral: "#FF6F5E",
  gelo: "#EAF2F8",
  mescla: "#9AA0A6",
  "mescla cinza": "#9AA0A6",
  chumbinho: "#55595C",
};

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-_+]/g, " ");
}

/** Remove acentos para comparação aproximada. */
export function deburr(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function guessHex(name: string): string | null {
  const key = normalize(name);
  if (COLOR_TABLE[key]) return COLOR_TABLE[key];
  const flat = deburr(key);
  for (const [k, v] of Object.entries(COLOR_TABLE)) {
    if (deburr(k) === flat) return v;
  }
  // procura por palavra contida (ex.: "verde militar escuro")
  const entries = Object.entries(COLOR_TABLE).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of entries) {
    if (flat.includes(deburr(k))) return v;
  }
  return null;
}

export function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return "";
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

/** Distância de Levenshtein para sugestões aproximadas (OCR). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m]![n]!;
}

/**
 * Similaridade 0..1 entre dois nomes, tolerante a palavras a mais ou a menos.
 * "Marrom" x "Marrom Novo" fica alto porque um contém o outro.
 */
export function similarity(a: string, b: string): number {
  const x = deburr(normalize(a));
  const y = deburr(normalize(b));
  if (!x || !y) return 0;
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  let score = 1 - dist / Math.max(x.length, y.length, 1);
  if (x.includes(y) || y.includes(x)) score = Math.max(score, 0.88);
  // comparação por palavras: "verde agua" x "agua verde"
  const wa = x.split(" ").filter(Boolean);
  const wb = y.split(" ").filter(Boolean);
  const common = wa.filter((w) => wb.includes(w)).length;
  if (common > 0) score = Math.max(score, common / Math.max(wa.length, wb.length));
  return score;
}

/** Sugere o melhor candidato existente no banco (nunca cria novos). */
export function bestMatch<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = similarity(query, getName(item));
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

