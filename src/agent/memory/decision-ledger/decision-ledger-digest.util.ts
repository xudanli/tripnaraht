import { createHash } from 'crypto';

/**
 * 稳定 JSON digest：对 **任意深度** 的 plain object 递归按 key 排序后再序列化，避免属性插入顺序导致指纹漂移。
 * 数组元素顺序有语义，会原样保留；Map/Set 等非 JSON 值需调用方先归一化为 plain object/array。
 */
export function stableDigest(value: unknown): string {
  const normalized = stableStringify(value);
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}
