/**
 * Non-Semantic Chunking：不按语义分块，仅基于路径共现、显式权重键、修改字段、结果键
 * 为 JSON 中的 key-path 打 influence 分，供 RLHF 反向标记「哪些 KV 更可能影响最终偏好」。
 */

import type {
  RlhfJsonKvInfluenceEntry,
  RlhfJsonKvInfluenceSnapshot,
} from './rlhf-decision-context.types';

const MAX_PATHS = 220;
const MAX_DEPTH = 5;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 深度优先扁平化，路径形如 `userIntent.constraints.budget` */
export function flattenJsonPaths(
  root: Record<string, unknown>,
  opts?: { maxPaths?: number; maxDepth?: number },
): string[] {
  const maxP = opts?.maxPaths ?? MAX_PATHS;
  const maxD = opts?.maxDepth ?? MAX_DEPTH;
  const out: string[] = [];

  const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    if (out.length >= maxP || depth > maxD) return;
    for (const [k, val] of Object.entries(obj)) {
      if (out.length >= maxP) return;
      const path = prefix ? `${prefix}.${k}` : k;
      out.push(path);
      if (isPlainObject(val)) walk(val, path, depth + 1);
      else if (Array.isArray(val) && val.length > 0 && isPlainObject(val[0])) {
        walk(val[0] as Record<string, unknown>, `${path}[0]`, depth + 1);
      }
    }
  };

  walk(root, '', 0);
  return out;
}

function pathMatchesField(path: string, field: string): boolean {
  const norm = field.replace(/\[/g, '.').replace(/\]/g, '');
  const parts = norm.split('.').filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => path.includes(p));
}

const SHALLOW_HOT = new Set([
  'budget',
  'cost',
  'time',
  'duration',
  'hotel',
  'star',
  'location',
  'geo',
  'preference',
  'constraints',
]);

export function evaluateNonSemanticKvInfluence(params: {
  contextSnapshot?: Record<string, unknown>;
  utilityWeights?: Record<string, number>;
  modification?: { field: string; from: unknown; to: unknown };
  outcomeCapture?: Record<string, unknown>;
}): RlhfJsonKvInfluenceSnapshot {
  const evaluatedAt = new Date().toISOString();
  const snap = params.contextSnapshot;
  if (!snap || !isPlainObject(snap)) {
    return {
      schemaVersion: 1,
      evaluatedAt,
      entries: [],
      note: 'no_context_snapshot',
    };
  }

  const paths = flattenJsonPaths(snap);
  const weightKeys = params.utilityWeights ? Object.keys(params.utilityWeights) : [];
  const outcomeKeys = params.outcomeCapture ? Object.keys(params.outcomeCapture) : [];
  const modField = params.modification?.field;

  const scoreForPath = (path: string): RlhfJsonKvInfluenceEntry => {
    let influence01 = 0.05;
    const tags: RlhfJsonKvInfluenceEntry['tags'] = [];

    const lastSeg = path.split('.').pop() ?? path;
    if (SHALLOW_HOT.has(lastSeg.toLowerCase())) {
      influence01 += 0.12;
      tags.push('shallow_hot_key');
    }

    for (const wk of weightKeys) {
      if (path.includes(wk) || wk.includes(lastSeg)) {
        influence01 += 0.25;
        tags.push('utility_weight_key');
        break;
      }
    }

    if (modField && pathMatchesField(path, modField)) {
      influence01 += 0.45;
      tags.push('edit_field_match');
    }

    for (const ok of outcomeKeys) {
      if (path.toLowerCase().includes(ok.toLowerCase())) {
        influence01 += 0.08;
        tags.push('outcome_key_overlap');
        break;
      }
    }

    influence01 = Math.min(1, influence01);
    return { path, influence01, tags: [...new Set(tags)] };
  };

  const entries = paths
    .map(scoreForPath)
    .sort((a, b) => b.influence01 - a.influence01)
    .slice(0, 48);

  return {
    schemaVersion: 1,
    evaluatedAt,
    entries,
    note: paths.length >= MAX_PATHS ? 'paths_truncated' : undefined,
  };
}
