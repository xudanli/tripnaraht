import type { IncrementalKernelDecisionV1 } from './ledger-writeback.types';

function tryParseJsonArray(text: string): unknown[] | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function tryParseDecisionsEnvelope(text: string): unknown[] | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const d = v.decisions;
    return Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

/** 去掉单层 ``` / ```json 围栏（与 ClaudeOrchestrator 思路对齐，面向数组响应） */
function stripOuterCodeFence(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json|JSON)?\s*\n?/i, '');
  s = s.replace(/\n?\s*```$/i, '');
  return s.trim();
}

/**
 * 从 LLM 原始文本中解析 `IncrementalKernelDecisionV1[]`：
 * - 首选：`{"decisions":[...]}` 单键信封（与 OpenAI `json_object` 及系统提示对齐）
 * - 兼容：纯 JSON 数组、`decisions` / 数组的 Markdown 围栏、以及夹杂说明时取首个 `{...}` 或 `[...]` 切片。
 */
export function parseIncrementalKernelDecisionsFromLlmText(
  raw: string,
):
  | { ok: true; decisions: IncrementalKernelDecisionV1[] }
  | { ok: false; error: string } {
  if (raw == null || typeof raw !== 'string') {
    return { ok: false, error: 'empty_or_non_string_response' };
  }

  const candidates: string[] = [raw.trim(), stripOuterCodeFence(raw)];
  for (const c of candidates) {
    const env = tryParseDecisionsEnvelope(c);
    if (env) return normalizeDecisionArray(env);
    const arr = tryParseJsonArray(c);
    if (arr) return normalizeDecisionArray(arr);
  }

  const stripped = stripOuterCodeFence(raw);
  const b0 = stripped.indexOf('{');
  const b1 = stripped.lastIndexOf('}');
  if (b0 >= 0 && b1 > b0) {
    const sliceObj = stripped.slice(b0, b1 + 1);
    const env2 = tryParseDecisionsEnvelope(sliceObj);
    if (env2) return normalizeDecisionArray(env2);
  }

  const i0 = stripped.indexOf('[');
  const i1 = stripped.lastIndexOf(']');
  if (i0 >= 0 && i1 > i0) {
    const slice = stripped.slice(i0, i1 + 1);
    const arr = tryParseJsonArray(slice);
    if (arr) return normalizeDecisionArray(arr);
  }

  return { ok: false, error: 'no_decisions_payload_found' };
}

function normalizeDecisionArray(arr: unknown[]):
  | { ok: true; decisions: IncrementalKernelDecisionV1[] }
  | { ok: false; error: string } {
  const byId = new Map<string, IncrementalKernelDecisionV1>();
  let idx = 0;
  for (const el of arr) {
    idx += 1;
    if (!el || typeof el !== 'object') {
      return { ok: false, error: `element_${idx}_not_object` };
    }
    const o = el as Record<string, unknown>;
    const nodeId = o.nodeId;
    if (typeof nodeId !== 'string' || nodeId.trim() === '') {
      return { ok: false, error: `element_${idx}_missing_nodeId` };
    }
    const output = 'output' in o ? o.output : undefined;
    if (output === undefined) {
      return { ok: false, error: `element_${idx}_missing_output` };
    }
    const summary = o.summary;
    const d: IncrementalKernelDecisionV1 = {
      nodeId: nodeId.trim(),
      output,
      ...(typeof summary === 'string' && summary.trim() !== '' ? { summary: summary.trim() } : {}),
    };
    byId.set(d.nodeId, d);
  }
  return { ok: true, decisions: [...byId.values()] };
}
