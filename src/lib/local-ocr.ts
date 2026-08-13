/**
 * OCR local (no próprio navegador) via Tesseract.
 *
 * Nenhuma leitura de etiqueta consome crédito de IA: o reconhecimento roda no
 * dispositivo. O serviço externo continua existindo apenas como reforço
 * opcional (fallback), nunca como dependência do fluxo principal.
 */

type Worker = {
  recognize: (image: unknown) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<Worker> | null = null;

/** Cria (uma única vez) o worker de OCR. Só funciona no navegador. */
export async function getOcrWorker(): Promise<Worker> {
  if (typeof window === "undefined") throw new Error("OCR local só roda no navegador");
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por", 1, { legacyCore: false, legacyLang: false });
      await worker.setParameters({
        tessedit_pageseg_mode: "6" as never,
        preserve_interword_spaces: "1",
      });
      return worker as unknown as Worker;
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
