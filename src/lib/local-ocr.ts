/**
 * OCR local (no próprio navegador) via Tesseract.
 *
 * Nenhuma leitura de etiqueta consome crédito de IA: o reconhecimento roda no
 * dispositivo. O serviço externo continua existindo apenas como reforço
 * opcional (fallback), nunca como dependência do fluxo principal.
 */

type Worker = {
  recognize: (image: unknown) => Promise<{ data: { text: string; confidence: number } }>;
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<Worker> | null = null;

/**
 * Cria (uma única vez) o worker de OCR. Só funciona no navegador.
 * Tenta português; se o pacote de idioma não carregar (rede/offline),
 * cai para inglês — o alfabeto é o mesmo e a leitura continua funcionando.
 */
export async function getOcrWorker(): Promise<Worker> {
  if (typeof window === "undefined") throw new Error("OCR local só roda no navegador");
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      let worker: unknown;
      try {
        worker = await createWorker("por", 1, { legacyCore: false, legacyLang: false });
      } catch {
        worker = await createWorker("eng", 1, { legacyCore: false, legacyLang: false });
      }
      const w = worker as Worker;
      await w.setParameters({
        // 11 = texto esparso. Packing lists misturam tabela, códigos e blocos
        // desalinhados; este modo preserva palavras que o modo de coluna corta.
        tessedit_pageseg_mode: "11",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export async function disposeOcrWorker() {
  const p = workerPromise;
  workerPromise = null;
  if (p) {
    try {
      await (await p).terminate();
    } catch {
      /* nada a fazer */
    }
  }
}

export type LocalOcrResult = { text: string; confidence: number };

export async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<LocalOcrResult> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  return { text: data.text ?? "", confidence: (data.confidence ?? 0) / 100 };
}

/** Cópia independente para que o próximo frame não altere o quadro em OCR. */
export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

/** Variante binarizada usada somente se o quadro original não validar. */
export function binaryVariant(source: HTMLCanvasElement, boost = false): HTMLCanvasElement {
  const copy = copyCanvas(source);
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  if (ctx) binarize(ctx, copy.width, copy.height, boost);
  return copy;
}

/**
 * Binarização adaptativa (Sauvola simplificado por blocos).
 * Etiqueta térmica costuma ter iluminação irregular; limiar global apaga
 * metade do texto. Isto é o que mais melhora a taxa de acerto do Tesseract.
 */
export function binarize(ctx: CanvasRenderingContext2D, w: number, h: number, boost = false) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
  }
  const block = Math.max(16, Math.round(Math.min(w, h) / 12));
  const cols = Math.ceil(w / block);
  const rows = Math.ceil(h / block);
  const means = new Float32Array(cols * rows);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      let n = 0;
      const y1 = Math.min(h, (by + 1) * block);
      const x1 = Math.min(w, (bx + 1) * block);
      for (let y = by * block; y < y1; y += 2) {
        for (let x = bx * block; x < x1; x += 2) {
          sum += gray[y * w + x] ?? 0;
          n++;
        }
      }
      means[by * cols + bx] = n ? sum / n : 128;
    }
  }
  const offset = boost ? 4 : 10;
  for (let y = 0; y < h; y++) {
    const by = Math.min(rows - 1, Math.floor(y / block));
    for (let x = 0; x < w; x++) {
      const bx = Math.min(cols - 1, Math.floor(x / block));
      const t = (means[by * cols + bx] ?? 128) - offset;
      const v = (gray[y * w + x] ?? 0) < t ? 0 : 255;
      const i = (y * w + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Assinatura estável do texto lido: usada para saber se o quadro mudou de
 * verdade (mesma etiqueta parada não gera leitura nova).
 */
export function textSignature(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 220);
}

/** Distância normalizada entre duas assinaturas (0 = idênticas). */
export function signatureDistance(a: string, b: string): number {
  if (!a || !b) return 1;
  if (a === b) return 0;
  const len = Math.max(a.length, b.length);
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
  return 1 - same / len;
}

/**
 * Diferença média entre dois quadros (0-255). Serve para rodar OCR apenas
 * quando algo mudou de verdade na frente da câmera.
 */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 255;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / n;
}

/** Amostra reduzida em tons de cinza do quadro, para comparação barata. */
export function frameFingerprint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cols = 24;
  const rows = 24;
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(cols * rows);
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) / rows) * h));
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) / cols) * w));
      const i = (sy * w + sx) * 4;
      out[y * cols + x] =
        0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    }
  }
  return out;
}
