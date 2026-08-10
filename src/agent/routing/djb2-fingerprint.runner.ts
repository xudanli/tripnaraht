/**
 * 稳定 JSON fingerprint（纯函数，从 ClaudeOrchestrator 迁出）。
 */

export function djb2Fingerprint(value: unknown): string {
  const stable = JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as any)
        .sort()
        .reduce((acc: any, key) => {
          acc[key] = (v as any)[key];
          return acc;
        }, {});
    }
    return v;
  });
  let h = 5381;
  for (let i = 0; i < stable.length; i++) h = (h * 33) ^ stable.charCodeAt(i);
  return `djb2:${(h >>> 0).toString(16)}`;
}
