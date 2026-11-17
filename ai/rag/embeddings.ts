/**
 * bge-m3 dense embeddings (1024-d, CLS pooling, L2-normalized), no LLM.
 *
 * 1. Local: transformers.js + ONNX (`Xenova/bge-m3`, int8-quantized). Model files are
 *    downloaded once into ai/.model-cache (git-ignored).
 * 2. Fallback: Hugging Face Inference API (`BAAI/bge-m3`) with HF_TOKEN from process.env.
 *    The .env file is never read here.
 */
import { join, resolve } from "node:path";

export interface Embedder {
  /** Identifies model + backend; stored in the index so query and chunks always match. */
  readonly id: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export const LOCAL_MODEL = "Xenova/bge-m3";
export const HF_MODEL = "BAAI/bge-m3";
const MODEL_CACHE = resolve(__dirname, "../.model-cache");

function l2normalize(v: number[]): number[] {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

/** Local ONNX inference via transformers.js. */
export async function createLocalEmbedder(): Promise<Embedder> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = MODEL_CACHE;
  env.allowRemoteModels = true;
  const extractor = await pipeline("feature-extraction", LOCAL_MODEL, { dtype: "q8" });
  return {
    id: `local:${LOCAL_MODEL}:q8:cls`,
    async embed(texts) {
      const out: number[][] = [];
      // Small batches keep memory flat for long articles.
      for (let i = 0; i < texts.length; i += 8) {
        const batch = texts.slice(i, i + 8);
        const t = await extractor([...batch], { pooling: "cls", normalize: true });
        out.push(...(t.tolist() as number[][]));
      }
      return out;
    },
  };
}

/** Hugging Face Inference API. Requires HF_TOKEN in the process environment. */
export function createHfEmbedder(token: string | undefined = process.env.HF_TOKEN): Embedder {
  if (!token) throw new Error("HF_TOKEN is not set in the process environment");
  const url = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}/pipeline/feature-extraction`;
  return {
    id: `hf:${HF_MODEL}`,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 16) {
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ inputs: texts.slice(i, i + 16) }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`HF Inference ${res.status}: ${(await res.text()).slice(0, 200)}`);
        out.push(...((await res.json()) as number[][]).map(l2normalize));
      }
      return out;
    },
  };
}

/** Local first; HF Inference only when the local backend cannot load. */
export async function createEmbedder(log: (msg: string) => void = () => undefined): Promise<Embedder> {
  try {
    return await createLocalEmbedder();
  } catch (e) {
    log(`local bge-m3 unavailable (${(e as Error).message.split("\n")[0]}); trying HF Inference API`);
    return createHfEmbedder();
  }
}

export const modelCacheDir = (): string => join(MODEL_CACHE);
