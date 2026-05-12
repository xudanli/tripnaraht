/**
 * 极轻量 user_change_intent 切片（无 LLM）：按标点/空白切句，去重、截断，供 telemetry 与后续路由。
 */

export interface DecomposeUserChangeIntentLiteOptions {
  /** 最多保留几条（默认 8） */
  maxBullets?: number;
  /** 最短片段长度（默认 4，过滤「哦」「嗯」） */
  minChunkLen?: number;
}

/**
 * 将一段口语/语音转写拆成短句列表；不改变行程，仅用于观测与排障。
 */
export function decomposeUserChangeIntentLite(
  text: string | undefined,
  options?: DecomposeUserChangeIntentLiteOptions,
): string[] {
  if (text == null || typeof text !== 'string') return [];
  const raw = text.trim();
  if (!raw) return [];

  const maxBullets = Math.min(24, Math.max(1, options?.maxBullets ?? 8));
  const minChunkLen = Math.max(1, options?.minChunkLen ?? 4);

  const splitRe = /[，。？！、；;]+|\s{2,}|[\n\r]+/g;
  const parts = raw
    .split(splitRe)
    .map((s) => s.trim())
    .filter((s) => s.length >= minChunkLen);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (out.length >= maxBullets) break;
    const key = p.slice(0, 96).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.length > 160 ? `${p.slice(0, 157)}…` : p);
  }
  return out;
}
