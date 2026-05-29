import type {
  DeltaOpType,
  DeltaTargetType,
  PlanDeltaIR,
} from '../contracts/plan-delta-ir.types';

const OPS: readonly DeltaOpType[] = ['ADD', 'REMOVE', 'REPLACE'];
const TARGETS: readonly DeltaTargetType[] = [
  'POI',
  'HOTEL',
  'FLIGHT',
  'ROUTE_CONSTRAINT',
  'RESTRICTION',
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseOp(v: unknown): DeltaOpType | null {
  const s = String(v ?? '').trim().toUpperCase();
  return (OPS as readonly string[]).includes(s) ? (s as DeltaOpType) : null;
}

function parseTargetType(v: unknown): DeltaTargetType | null {
  const s = String(v ?? '').trim().toUpperCase();
  return (TARGETS as readonly string[]).includes(s) ? (s as DeltaTargetType) : null;
}

function parseDayIndex(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined;
  return n;
}

function normalizeSingle(raw: unknown): PlanDeltaIR | null {
  const row = asRecord(raw);
  if (!row) return null;
  const op = parseOp(row.op);
  const targetRaw = asRecord(row.target);
  if (!op || !targetRaw) return null;
  const type = parseTargetType(targetRaw.type);
  if (!type) return null;

  const payloadRaw = asRecord(row.payload) ?? {};
  const query =
    typeof payloadRaw.query === 'string' && payloadRaw.query.trim()
      ? payloadRaw.query.trim()
      : undefined;

  const delta: PlanDeltaIR = {
    op,
    target: {
      type,
      ...(typeof targetRaw.id === 'string' && targetRaw.id.trim()
        ? { id: targetRaw.id.trim() }
        : {}),
      ...(parseDayIndex(targetRaw.dayIndex) !== undefined
        ? { dayIndex: parseDayIndex(targetRaw.dayIndex) }
        : {}),
      ...(typeof targetRaw.zoneId === 'string' && targetRaw.zoneId.trim()
        ? { zoneId: targetRaw.zoneId.trim() }
        : {}),
    },
    payload: {
      ...(query ? { query } : {}),
      ...(payloadRaw.rawAsset !== undefined ? { rawAsset: payloadRaw.rawAsset } : {}),
      ...(asRecord(payloadRaw.patchMeta)
        ? { patchMeta: payloadRaw.patchMeta as Record<string, unknown> }
        : { patchMeta: { source: 'llm_intent_compiler' } }),
    },
  };
  return delta;
}

/**
 * 解析 LLM `json_object` 输出为 `PlanDeltaIR[]`（容忍 `{ deltas: [] }` 或直接数组字符串）。
 */
export function parsePlanDeltaIrFromLlmJson(raw: string): PlanDeltaIR[] {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fence) return [];
    parsed = JSON.parse(fence[1].trim());
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else {
    const obj = asRecord(parsed);
    if (!obj) return [];
    if (Array.isArray(obj.deltas)) list = obj.deltas;
    else if (Array.isArray(obj.plan_delta)) list = obj.plan_delta;
    else if (Array.isArray(obj.planDelta)) list = obj.planDelta;
  }

  const out: PlanDeltaIR[] = [];
  for (const item of list) {
    const norm = normalizeSingle(item);
    if (norm) out.push(norm);
  }
  return out;
}

export function validatePlanDeltaIrList(deltas: PlanDeltaIR[]): PlanDeltaIR[] {
  return deltas.filter((d) => parseOp(d.op) && parseTargetType(d.target?.type));
}
