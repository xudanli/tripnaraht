/**
 * 客户端 DSO 版本字段归一化。
 * 前端部分实现会对 `dso_version` 直接 `.trim()`，须保证对外为 string。
 */

export function normalizeClientDsoVersion(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return String(Math.floor(n));
    return trimmed;
  }
  return undefined;
}

export function parseClientDsoVersionNumber(value: unknown): number | undefined {
  const normalized = normalizeClientDsoVersion(value);
  if (normalized === undefined) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
