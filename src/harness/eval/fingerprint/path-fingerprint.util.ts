import { sha256Hex, stableStringify } from './eval-fingerprint.util';

/** 从对象中按 JSON Pointer 风格路径剔除噪声字段（仅支持 `a.b.c` 与 `*` 段） */
export function omitPaths(value: unknown, pathsToOmit: string[] = []): unknown {
  if (!pathsToOmit.length || value == null || typeof value !== 'object') {
    return value;
  }
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const raw of pathsToOmit) {
    const segments = raw.split('.').filter(Boolean);
    if (!segments.length) continue;
    stripAt(clone, segments, 0);
  }
  return clone;
}

function stripAt(node: unknown, segments: string[], idx: number): void {
  if (node == null || typeof node !== 'object') return;
  if (idx >= segments.length) return;
  const seg = segments[idx]!;
  const isLast = idx === segments.length - 1;
  if (Array.isArray(node)) {
    for (const item of node) {
      stripAt(item, segments, idx);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (seg === '*') {
    for (const key of Object.keys(obj)) {
      if (isLast) delete obj[key];
      else stripAt(obj[key], segments, idx + 1);
    }
    return;
  }
  if (!(seg in obj)) return;
  if (isLast) delete obj[seg];
  else stripAt(obj[seg], segments, idx + 1);
}

export function computePathFingerprint(
  payload: unknown,
  allowedDiffPaths: string[] = [],
): string {
  const normalized = omitPaths(payload, allowedDiffPaths);
  return sha256Hex(stableStringify(normalized));
}
