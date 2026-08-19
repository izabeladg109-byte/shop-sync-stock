import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  toastWithUndo,
  useApplyMovement,
  useColors,
  useKitColors,
  useKits,
  useSizes,
  useSkus,
  useUndoMovement,
} from "@/lib/erp";
import { resolveLine, type Resolved } from "@/lib/kit-match";
import { parsePackingLabel } from "@/lib/ocr.functions";
import { parseLabelText } from "@/lib/label-parse";
import { ALL_PLATFORMS, usePlatformFilter } from "@/lib/platforms";
import {
  binaryVariant,
  disposeOcrWorker,
  frameDifference,
  frameFingerprint,
  getOcrWorker,
  recognizeCanvas,
  signatureDistance,
  textSignature,
} from "@/lib/local-ocr";

import { ColorDot, KitSwatches } from "@/components/kit-swatches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, CameraOff, ScanBarcode } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leitura")({
  head: () => ({
    meta: [
      { title: "Leitura inteligente do Packing List — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Aponte a câmera para a etiqueta do TikTok Shop: a IA lê SKU, cores, kit, tamanho e quantidade e dá baixa no estoque em segundos.",
      },
      { property: "og:title", content: "Leitura inteligente do Packing List" },
      {
        property: "og:description",
        content: "OCR por texto com foco automático, confiança real e confirmação rápida.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeituraPage,
});

type Pending = Resolved;

const FOCUS_THRESHOLD = 6;

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1040;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      setTimeout(() => void ctx.close(), 250);
    }
  } catch {
    /* som opcional */
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
}

/**
 * Variância do laplaciano numa amostra reduzida: mede nitidez (foco) sem
 * custo de processar o quadro inteiro a cada leitura.
 */
function sharpness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const sw = Math.min(200, w);
  const sh = Math.max(1, Math.round((sw / w) * h));
  const stepX = w / sw;
  const stepY = h / sh;
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(h - 1, Math.floor(y * stepY));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.floor(x * stepX));
      const i = (sy * w + sx) * 4;
      gray[y * sw + x] =
        0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    }
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const lap =
        (gray[(y - 1) * sw + x] ?? 0) +
        (gray[(y + 1) * sw + x] ?? 0) +
        (gray[y * sw + x - 1] ?? 0) +
        (gray[y * sw + x + 1] ?? 0) -
        4 * (gray[y * sw + x] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function pct(v: number) {
  return Math.min(99, Math.max(0, Math.round(v * 100)));
}

function LeituraPage() {
  const { data: skus = [] } = useSkus();
  const { data: colors = [] } = useColors();
  const { data: sizes = [] } = useSizes();
  const { data: kits = [] } = useKits();
  const { data: kitColors = [] } = useKitColors();
  const applyMovement = useApplyMovement();
  const undo = useUndoMovement();
  const parse = useServerFn(parsePackingLabel);
  const { platformId } = usePlatformFilter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  /** memória do scanner: quadro anterior, último quadro processado e texto lido */
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const doneFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastSigRef = useRef("");
  /** quantas vezes seguidas o quadro foi descartado (tremida/foco) */
  const skipRef = useRef(0);
  /** melhor nitidez já vista: serve de referência adaptativa por ambiente */
  const bestSharpRef = useRef(0);

  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Câmera desligada");
  const [focused, setFocused] = useState(true);
  /** Modo nitidez: realça contraste/brilho antes do OCR (etiquetas apagadas). */
  const [sharpMode, setSharpMode] = useState(false);
  const sharpModeRef = useRef(false);
  useEffect(() => {
    sharpModeRef.current = sharpMode;
  }, [sharpMode]);
  /** Reforço opcional por IA: só entra quando o OCR local não reconhece nada. */
  const [aiFallback, setAiFallback] = useState(false);
  const aiFallbackRef = useRef(false);
  useEffect(() => {
    aiFallbackRef.current = aiFallback;
  }, [aiFallback]);
  const [pending, setPending] = useState<Pending | null>(null);
  /** Demais itens da mesma etiqueta, confirmados em sequência. */
  const [queue, setQueue] = useState<Pending[]>([]);
  const originalPendingRef = useRef<Pending | null>(null);
  const retryVariantRef = useRef(false);

  const feedback = useQuery({
    queryKey: ["ocr-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocr_feedback")
        .select("pattern_signature,sku_id,kind,ref_id,size_id,qty,correction_count")
        .order("correction_count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const lists = useMemo(
    () => ({
      skus: skus.map((s) => s.seller_sku),
      colors: [...new Set(colors.map((c) => c.name))],
      sizes: [...new Set(sizes.map((s) => s.name))],
      kits: [...new Set(kits.map((k) => k.name))],
    }),
    [skus, colors, sizes, kits],
  );
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    prevFrameRef.current = null;
    doneFrameRef.current = null;
    setActive(false);
    setStatus("Câmera desligada");
  }, []);

  const start = useCallback(async () => {
    try {
      // aquece o OCR local enquanto a câmera abre
      void getOcrWorker().catch(() => undefined);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          // foco contínuo quando o dispositivo suportar
          advanced: [{ focusMode: "continuous" }],
        } as unknown as MediaTrackConstraints,
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        await track?.applyConstraints({
          advanced: [{ focusMode: "continuous" }],
        } as unknown as MediaTrackConstraints);
      } catch {
        /* alguns aparelhos não expõem focusMode */
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      setStatus("Procurando etiqueta…");
    } catch {
      toast.error("Não foi possível acessar a câmera");
    }
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => () => void disposeOcrWorker(), []);

  const resolve = useCallback(
    (line: Parameters<typeof resolveLine>[0]) =>
      resolveLine(line, { skus, colors, sizes, kits, kitColors }),
    [skus, colors, sizes, kits, kitColors],
  );

  /** Entrega os itens lidos para confirmação. */
  const handOff = useCallback(
    (items: Parameters<typeof resolveLine>[0][]) => {
      const resolved = items
        .map((item) => resolve(item))
        .filter((c): c is NonNullable<ReturnType<typeof resolveLine>> => c !== null);
      if (resolved.length === 0) {
        setStatus("Não foi possível identificar a etiqueta com segurança.");
        return false;
      }
      const first = resolved[0]!;
      const learned = feedback.data?.find((row) => row.pattern_signature === first.patternSignature);
      const learnedValid = learned && learned.sku_id === first.skuId &&
        sizes.some((s) => s.id === learned.size_id && s.sku_id === learned.sku_id) &&
        (learned.kind === "kit"
          ? kits.some((k) => k.id === learned.ref_id && k.sku_id === learned.sku_id)
          : colors.some((c) => c.id === learned.ref_id && c.sku_id === learned.sku_id));
      const suggested: Pending = learnedValid
        ? { ...first, kind: learned.kind, refId: learned.ref_id, sizeId: learned.size_id, qty: learned.qty,
            ambiguous: false, conf: { ...first.conf, ref: 0.89, qty: 0.89 }, reason: "Sugestão baseada em correção anterior" }
        : first;
      pausedRef.current = true;
      originalPendingRef.current = first;
      setPending(suggested);
      setQueue(resolved.slice(1));
      setStatus(
        resolved.length > 1
          ? `${resolved.length} itens lidos — confirme um a um`
          : "Confirme a baixa",
      );
      beep();
      return true;
    },
    [resolve, feedback.data, sizes, kits, colors],
  );

  const scan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || busyRef.current || pausedRef.current || video.videoWidth === 0) return;
    busyRef.current = true;
    try {
      // Mantém caracteres pequenos de etiquetas distantes; não recorta a imagem.
      const targetWidth = Math.min(video.videoWidth, window.innerWidth < 640 ? 1440 : 1600);
      const scale = targetWidth / video.videoWidth;
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.filter = "grayscale(1)";
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      // Movimento ajuda a selecionar o quadro, mas nunca bloqueia o scanner.
      const fp = frameFingerprint(ctx, canvas.width, canvas.height);
      const movement = prevFrameRef.current ? frameDifference(prevFrameRef.current, fp) : 255;
      prevFrameRef.current = fp;
      const forced = skipRef.current >= 2;

      // 2) mesma etiqueta parada na frente da câmera: não reprocessa
      if (doneFrameRef.current && frameDifference(doneFrameRef.current, fp) < 3) {
        setStatus("Etiqueta já lida — aproxime a próxima");
        return;
      }

      // 3) foco (apenas informativo: nunca bloqueia a leitura por completo)
      const sharp = sharpness(ctx, canvas.width, canvas.height);
      bestSharpRef.current = Math.max(bestSharpRef.current * 0.97, sharp);
      const focusOk = sharp >= Math.max(FOCUS_THRESHOLD, bestSharpRef.current * 0.4);
      setFocused(focusOk);
      if (!focusOk && movement < 6 && !forced) {
        skipRef.current++;
        setStatus("Aproxime ou aguarde o foco.");
        return;
      }
      skipRef.current = 0;
      setStatus("Lendo etiqueta…");

      // OCR no quadro original primeiro. A binarização só é tentada quando o
      // original não valida, pois em etiquetas nítidas ela pode apagar traços.
      const capture = sharpModeRef.current || retryVariantRef.current ? binaryVariant(canvas, sharpModeRef.current) : canvas;
      const { text, confidence } = await recognizeCanvas(capture);
      let items = parseLabelText(text, listsRef.current, confidence);
      retryVariantRef.current = items.length === 0 ? !retryVariantRef.current : false;
      const sig = textSignature(text);
      if (sig.length < 10) {
        setStatus("Nada legível ainda — aproxime a etiqueta");
        return;
      }
      if (signatureDistance(sig, lastSigRef.current) < 0.1) {
        doneFrameRef.current = fp;
        setStatus("Mesma etiqueta — aproxime a próxima");
        return;
      }

      if (items.length > 0) {
        lastSigRef.current = sig;
        doneFrameRef.current = fp;
        handOff(items);
        return;
      }

      // 5) reforço opcional por IA (fallback, nunca obrigatório)
      if (aiFallbackRef.current) {
        setStatus("Reforçando leitura com IA…");
        try {
          const image = canvas.toDataURL("image/jpeg", 0.88);
          const result = await parse({ data: { image, ...listsRef.current } });
          if (result.items.length > 0) {
            lastSigRef.current = sig;
            doneFrameRef.current = fp;
            handOff(result.items);
            return;
          }
        } catch {
          /* fallback é opcional: segue com OCR local */
        }
      }
      setStatus("Não foi possível identificar a etiqueta com segurança. Continuando a leitura…");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha na leitura");
    } finally {
      busyRef.current = false;
    }
  }, [handOff, parse]);

  // o loop usa uma ref para não reiniciar o intervalo a cada re-render
  const scanRef = useRef(scan);
  useEffect(() => {
    scanRef.current = scan;
  }, [scan]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      const started = Date.now();
      await scanRef.current();
      // debounce adaptativo: espera pouco quando o quadro foi descartado rápido
      const elapsed = Date.now() - started;
      const wait = elapsed < 80 ? 120 : Math.min(600, Math.round(elapsed * 0.4));
      if (alive) timer = setTimeout(() => void tick(), wait);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active]);

  /** Passa para o próximo item lido; só volta a filmar quando a fila acaba. */
  function resume() {
    setQueue((rest) => {
      const [next, ...others] = rest;
      if (next) {
        setPending(next);
        pausedRef.current = true;
        setStatus(`Confirme a baixa — faltam ${rest.length} item(ns) desta etiqueta`);
        return others;
      }
      setPending(null);
      pausedRef.current = false;
      setStatus("Procurando etiqueta…");
      return [];
    });
  }

  /** Descarta a etiqueta inteira e volta a filmar. */
  function discardAll() {
    setQueue([]);
    setPending(null);
    pausedRef.current = false;
    setStatus("Procurando etiqueta…");
  }

  async function confirm() {
    if (!pending) return;
    try {
      const movementId = await applyMovement.mutateAsync({
        sku_id: pending.skuId,
        kind: pending.kind,
        direction: "out",
        ref_id: pending.refId,
        size_id: pending.sizeId,
        qty: pending.qty,
        affect_units: true,
        affect_formed: false,
        source: "packing_list",
        note: `Leitura: ${pending.raw}`,
        platform_id: platformId === ALL_PLATFORMS ? null : platformId,
      });
      const original = originalPendingRef.current;
      if (original && pending.patternSignature && (
        original.skuId !== pending.skuId || original.kind !== pending.kind ||
        original.refId !== pending.refId || original.sizeId !== pending.sizeId || original.qty !== pending.qty
      )) {
        const key = {
          pattern_signature: pending.patternSignature,
          sku_id: pending.skuId,
          kind: pending.kind,
          ref_id: pending.refId,
          size_id: pending.sizeId,
          qty: pending.qty,
        };
        const { data: existing } = await supabase.from("ocr_feedback").select("id,correction_count").match(key).maybeSingle();
        if (existing) {
          await supabase.from("ocr_feedback").update({ correction_count: existing.correction_count + 1, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("ocr_feedback").insert({ ...key, original_result: original as never });
        }
      }
      const sizeName = sizes.find((s) => s.id === pending.sizeId)?.name ?? "";
      const refName =
        pending.kind === "kit"
          ? (kits.find((k) => k.id === pending.refId)?.name ?? "")
          : (colors.find((c) => c.id === pending.refId)?.name ?? "");
      toastWithUndo("Baixa registrada", `${pending.qty}× ${refName} ${sizeName}`, () =>
        undo.mutate(movementId),
      );
      beep();
      resume();
    } catch {
      /* erro já notificado */
    }
  }

  const pendingSizes = pending ? sizes.filter((s) => s.sku_id === pending.skuId) : [];
  const pendingColors = pending ? colors.filter((c) => c.sku_id === pending.skuId) : [];
  const pendingKits = pending ? kits.filter((k) => k.sku_id === pending.skuId) : [];
  const lowest = pending
    ? Math.min(pending.conf.sku, pending.conf.ref, pending.conf.size, pending.conf.qty)
    : 0;

  function field(label: string, confidence: number, node: React.ReactNode) {
    const weak = confidence < 0.9;
    return (
      <div
        className={
          weak
            ? "rounded-lg border-2 border-destructive/70 bg-destructive/5 p-2"
            : "rounded-lg border border-border p-2"
        }
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span
            className={
              weak ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"
            }
          >
            {confidence <= 0 ? "Não identificado" : `${pct(confidence)}%`}
          </span>
        </div>
        {node}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Leitura de Packing List
          </h1>
          <p className="text-sm text-muted-foreground">
            Foco contínuo, leitura por texto e confirmação em 1 toque.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={sharpMode ? "default" : "outline"}
            onClick={() => setSharpMode((v) => !v)}
            title="Realça contraste para etiquetas apagadas ou com pouca luz"
          >
            Modo nitidez {sharpMode ? "ligado" : "desligado"}
          </Button>
          <Button
            variant={aiFallback ? "default" : "outline"}
            onClick={() => setAiFallback((v) => !v)}
            title="Só é usado quando o OCR local não reconhece nada. A leitura normal não consome IA."
          >
            Reforço por IA {aiFallback ? "ligado" : "desligado"}
          </Button>
          <Button onClick={() => (active ? stop() : void start())} className="gap-2">
            {active ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
            {active ? "Parar câmera" : "Ligar câmera"}
          </Button>
        </div>
      </header>

      <section className="card-elevated overflow-hidden">
        <div className="relative bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="mx-auto aspect-[3/4] w-full max-w-md object-cover sm:aspect-video"
          />
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-white/70">
              <ScanBarcode className="size-10" />
              Ligue a câmera e aponte para a etiqueta.
            </div>
          )}
          {active && !pending && (
            <div
              className={`pointer-events-none absolute inset-6 rounded-xl border-2 ${
                focused ? "border-primary/70" : "border-destructive/80"
              }`}
            />
          )}
          {active && !focused && !pending && (
            <p className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-destructive">
              Aproxime ou aguarde o foco.
            </p>
          )}
        </div>
        <p className="border-t border-border px-4 py-2 text-sm text-muted-foreground">{status}</p>
      </section>

      {pending && (
        <section className="card-elevated space-y-3 border-primary/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="min-w-0 font-display text-lg font-semibold">Confirmar baixa</h2>
            <div className="flex shrink-0 items-center gap-2">
              {queue.length > 0 && <Badge variant="default">+{queue.length} nesta etiqueta</Badge>}
              <Badge variant={lowest < 0.9 ? "destructive" : "secondary"}>
                {pct(lowest)}% de confiança
              </Badge>
            </div>
          </div>

          {pending.ambiguous && (
            <div className="rounded-lg border-2 border-destructive/70 bg-destructive/5 p-3 text-sm">
              <p className="font-semibold text-destructive">
                ⚠️ Kit não identificado com segurança
              </p>
              <p className="text-muted-foreground">
                {pending.reason}. Escolha manualmente antes de confirmar — nada é dado como baixa
                automaticamente.
              </p>
              {pending.candidates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pending.candidates.map((id) => {
                    const k = kits.find((x) => x.id === id);
                    if (!k) return null;
                    return (
                      <Button
                        key={id}
                        type="button"
                        size="sm"
                        variant={pending.refId === id ? "default" : "outline"}
                        onClick={() =>
                          setPending((p) =>
                            p
                              ? {
                                  ...p,
                                  kind: "kit",
                                  refId: id,
                                  ambiguous: false,
                                  conf: { ...p.conf, ref: 0.99 },
                                }
                              : p,
                          )
                        }
                      >
                        <KitSwatches
                          kitId={k.id}
                          kitColors={kitColors}
                          colors={colors}
                          name={k.name}
                        />
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {field(
              "SKU",
              pending.conf.sku,
              <Select
                value={pending.skuId}
                onValueChange={(v) =>
                  setPending((p) =>
                    p
                      ? { ...p, skuId: v, refId: "", sizeId: "", conf: { ...p.conf, sku: 0.99 } }
                      : p,
                  )
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {skus.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.seller_sku} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>,
            )}

            {field(
              pending.kind === "kit" ? "Kit" : "Cor",
              pending.conf.ref,
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={pending.kind === "unit" ? "default" : "outline"}
                    onClick={() => setPending((p) => (p ? { ...p, kind: "unit", refId: "" } : p))}
                  >
                    Unidade
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={pending.kind === "kit" ? "default" : "outline"}
                    onClick={() => setPending((p) => (p ? { ...p, kind: "kit", refId: "" } : p))}
                  >
                    Kit
                  </Button>
                </div>
                <Select
                  value={pending.refId}
                  onValueChange={(v) =>
                    setPending((p) => (p ? { ...p, refId: v, conf: { ...p.conf, ref: 0.99 } } : p))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {pending.kind === "kit"
                      ? pendingKits.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            <KitSwatches
                              kitId={k.id}
                              kitColors={kitColors}
                              colors={colors}
                              name={k.name}
                            />
                          </SelectItem>
                        ))
                      : pendingColors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="inline-flex items-center gap-2">
                              <ColorDot hex={c.hex} />
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>,
            )}

            {field(
              "Tamanho",
              pending.conf.size,
              <div className="flex flex-wrap gap-1">
                {pendingSizes.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={pending.sizeId === s.id ? "default" : "outline"}
                    onClick={() =>
                      setPending((p) =>
                        p ? { ...p, sizeId: s.id, conf: { ...p.conf, size: 0.99 } } : p,
                      )
                    }
                  >
                    {s.name}
                  </Button>
                ))}
              </div>,
            )}

            {field(
              "Quantidade",
              pending.conf.qty,
              <Input
                type="number"
                min={1}
                value={pending.qty}
                onChange={(e) =>
                  setPending((p) =>
                    p
                      ? {
                          ...p,
                          qty: Math.max(1, Number(e.target.value)),
                          conf: { ...p.conf, qty: 0.99 },
                        }
                      : p,
                  )
                }
                className="h-9 w-24"
              />,
            )}
          </div>

          <p className="text-xs text-muted-foreground">Texto extraído: {pending.raw}</p>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void confirm()}
              disabled={
                applyMovement.isPending ||
                !pending.refId ||
                !pending.sizeId ||
                pending.ambiguous ||
                pending.qty <= 0 || pending.conf.qty <= 0 || lowest < 0.9
              }
              className="min-w-0 flex-1"
            >
              {queue.length > 0 ? "Confirmar e ir para o próximo" : "Confirmar e voltar à câmera"}
            </Button>
            <Button variant="outline" onClick={resume}>
              {queue.length > 0 ? "Pular item" : "Descartar"}
            </Button>
            {queue.length > 0 && (
              <Button variant="ghost" onClick={discardAll}>
                Descartar etiqueta
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
