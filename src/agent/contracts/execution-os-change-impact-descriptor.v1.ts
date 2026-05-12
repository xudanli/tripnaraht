// src/agent/contracts/execution-os-change-impact-descriptor.v1.ts
/**
 * Change Impact Descriptor (CID) v1 — PR / 变更时声明对 Execution OS 契约面的影响。
 * 可选进入 `observability.trace.change_impact_descriptor_v1`（与 `execution_trace_v1` 并列），实现 Change ↔ Execution 对齐。
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §7
 */
import { executionTimelineInputHash, sortKeysDeep } from '../runtime/execution-timeline-hash.util';
import type { ExecutionTraceV1RouteDecisionPath } from './orchestration-execution-trace-v1.types';
export const CHANGE_IMPACT_DESCRIPTOR_SCHEMA_ID = 'agent.execution_os.change_impact_descriptor@v1' as const;
export const CHANGE_IMPACT_DESCRIPTOR_VERSION = 1 as const;

/** CID 语义轴版本锁：写入语义指纹材料，防未来字段扩展静默漂移 fixed-point */
export const CID_AXIS_VERSION = 'v1' as const;

/**
 * 工程冻结锚：v1 轴语义闭合。禁止在 **不 bump `CID_AXIS_VERSION`** 的情况下扩展 v1 descriptor 形状或指纹材料；
 * 演化须显式新版本 + 迁移说明（见 SSC §8）。
 */
export const CID_AXIS_STABILITY_LOCK = true as const;

export type ChangeImpactClassificationV1 =
  | 'NONE'
  | 'TRACE'
  | 'MEMORY'
  | 'REPLAY'
  | 'GOVERNANCE'
  | 'MULTIPLE';

export type ChangeImpactFlagsV1 = {
  traceSchema: boolean;
  memoryBinding: boolean;
  replayDeterminism: boolean;
  governanceHash: boolean;
};

export type ChangeImpactDescriptorV1 = {
  schemaId: typeof CHANGE_IMPACT_DESCRIPTOR_SCHEMA_ID;
  version: typeof CHANGE_IMPACT_DESCRIPTOR_VERSION;
  classification: ChangeImpactClassificationV1;
  impacts: ChangeImpactFlagsV1;
  /** 人类可读；敏感变更须说明 */
  summary: string;
  /** 当 impacts 全为 false 且仍提交本 manifest 时必填（例如仅文档 / 注释） */
  rationaleNoContractImpact?: string;
};

/** 分类 → 默认应勾选的契约面（用于校验「分类与 impacts 不自相矛盾」） */
export const CHANGE_IMPACT_CLASSIFICATION_DEFAULTS_V1: Record<
  ChangeImpactClassificationV1,
  Partial<ChangeImpactFlagsV1>
> = {
  NONE: {},
  TRACE: { traceSchema: true },
  MEMORY: { memoryBinding: true },
  REPLAY: { replayDeterminism: true },
  GOVERNANCE: { governanceHash: true },
  /** 复合变更：不隐含 flags，由作者显式填写 impacts（仍须通过 strict 路径规则） */
  MULTIPLE: {},
};

export class ChangeImpactDescriptorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeImpactDescriptorValidationError';
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function asBool(x: unknown, field: string): boolean {
  if (typeof x !== 'boolean') {
    throw new ChangeImpactDescriptorValidationError(`${field} must be boolean`);
  }
  return x;
}

const CLASSIFICATIONS = new Set<ChangeImpactClassificationV1>([
  'NONE',
  'TRACE',
  'MEMORY',
  'REPLAY',
  'GOVERNANCE',
  'MULTIPLE',
]);

/**
 * 解析并校验根目录 `change-impact-descriptor.v1.json` 载荷。
 */
export function parseChangeImpactDescriptorV1(payload: unknown): ChangeImpactDescriptorV1 {
  if (!isRecord(payload)) {
    throw new ChangeImpactDescriptorValidationError('CID root must be an object');
  }
  if (payload.schemaId !== CHANGE_IMPACT_DESCRIPTOR_SCHEMA_ID) {
    throw new ChangeImpactDescriptorValidationError(`CID schemaId must be "${CHANGE_IMPACT_DESCRIPTOR_SCHEMA_ID}"`);
  }
  if (payload.version !== CHANGE_IMPACT_DESCRIPTOR_VERSION) {
    throw new ChangeImpactDescriptorValidationError(`CID version must be ${CHANGE_IMPACT_DESCRIPTOR_VERSION}`);
  }
  const classification = payload.classification;
  if (typeof classification !== 'string' || !CLASSIFICATIONS.has(classification as ChangeImpactClassificationV1)) {
    throw new ChangeImpactDescriptorValidationError('CID classification invalid');
  }
  const c = classification as ChangeImpactClassificationV1;
  const imp = payload.impacts;
  if (!isRecord(imp)) {
    throw new ChangeImpactDescriptorValidationError('CID impacts must be an object');
  }
  const impacts: ChangeImpactFlagsV1 = {
    traceSchema: asBool(imp.traceSchema, 'impacts.traceSchema'),
    memoryBinding: asBool(imp.memoryBinding, 'impacts.memoryBinding'),
    replayDeterminism: asBool(imp.replayDeterminism, 'impacts.replayDeterminism'),
    governanceHash: asBool(imp.governanceHash, 'impacts.governanceHash'),
  };
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  if (summary.length < 8) {
    throw new ChangeImpactDescriptorValidationError('CID summary must be a non-empty string (min 8 chars)');
  }

  const defaults = CHANGE_IMPACT_CLASSIFICATION_DEFAULTS_V1[c];
  for (const [k, v] of Object.entries(defaults) as [keyof ChangeImpactFlagsV1, boolean][]) {
    if (v === true && impacts[k] !== true) {
      throw new ChangeImpactDescriptorValidationError(
        `CID impacts.${k} must be true when classification is "${c}" (classification vs impacts matrix)`,
      );
    }
  }

  const anyImpact =
    impacts.traceSchema ||
    impacts.memoryBinding ||
    impacts.replayDeterminism ||
    impacts.governanceHash;
  let rationale = typeof payload.rationaleNoContractImpact === 'string' ? payload.rationaleNoContractImpact.trim() : '';
  if (!anyImpact) {
    if (rationale.length < 40) {
      throw new ChangeImpactDescriptorValidationError(
        'When all impacts are false, rationaleNoContractImpact is required (min 40 chars)',
      );
    }
  } else {
    rationale = '';
  }

  return {
    schemaId: CHANGE_IMPACT_DESCRIPTOR_SCHEMA_ID,
    version: CHANGE_IMPACT_DESCRIPTOR_VERSION,
    classification: c,
    impacts,
    summary,
    ...(rationale.length > 0 ? { rationaleNoContractImpact: rationale } : {}),
  };
}

/** 与 `scripts/ci/validate-change-impact-descriptor.ts` 共用的路径敏感规则（前缀/子串匹配路径片段） */
export const CID_STRICT_PATH_RULES_V1: ReadonlyArray<{
  pathIncludes: string;
  requiredImpact: keyof ChangeImpactFlagsV1;
}> = [
  { pathIncludes: 'execution-gateway-contract-governance.v1.ts', requiredImpact: 'governanceHash' },
  { pathIncludes: 'execution-os-change-impact-descriptor.v1.ts', requiredImpact: 'governanceHash' },
  { pathIncludes: 'scripts/ci/validate-change-impact-descriptor.ts', requiredImpact: 'governanceHash' },
  { pathIncludes: 'execution-gateway-trace-contract.enforcement.ts', requiredImpact: 'traceSchema' },
  { pathIncludes: 'orchestration-execution-trace-v1.types.ts', requiredImpact: 'traceSchema' },
  { pathIncludes: 'orchestration-replay-from-trace.ts', requiredImpact: 'replayDeterminism' },
  { pathIncludes: 'execution-gateway.route-and-run.orchestration.ts', requiredImpact: 'replayDeterminism' },
  { pathIncludes: 'replay-from-trace.dto.ts', requiredImpact: 'replayDeterminism' },
  { pathIncludes: 'memory-snapshot-freeze.util.ts', requiredImpact: 'memoryBinding' },
  { pathIncludes: 'execution-memory-binding.interface.ts', requiredImpact: 'memoryBinding' },
];

export function collectRequiredImpactsFromChangedFilesV1(changedFiles: string[]): Set<keyof ChangeImpactFlagsV1> {
  const out = new Set<keyof ChangeImpactFlagsV1>();
  for (const file of changedFiles) {
    const norm = file.replace(/\\/g, '/');
    for (const rule of CID_STRICT_PATH_RULES_V1) {
      if (norm.includes(rule.pathIncludes)) {
        out.add(rule.requiredImpact);
      }
    }
  }
  return out;
}

/** 稳定序列化：用于 request↔trace 对齐及 replay 语义回归比对 */
export function serializeChangeImpactDescriptorForCompare(d: ChangeImpactDescriptorV1): string {
  return JSON.stringify(sortKeysDeep(d));
}

export const CID_SEMANTIC_VIEW_SCHEMA_ID = 'agent.execution_os.cid_semantic_view@v1' as const;
export const CID_SEMANTIC_VIEW_VERSION = 1 as const;

/** 纯派生「解释层」视图：router / replay / hash 可读；不改变执行分支 */
export type CidSemanticViewV1 = {
  schemaId: typeof CID_SEMANTIC_VIEW_SCHEMA_ID;
  version: typeof CID_SEMANTIC_VIEW_VERSION;
  fingerprint: string;
  classification: ChangeImpactClassificationV1;
  impacts: ChangeImpactFlagsV1;
};

export function buildCidSemanticViewV1(d: ChangeImpactDescriptorV1): CidSemanticViewV1 {
  const fingerprint =
    executionTimelineInputHash({
      cid_axis_version: CID_AXIS_VERSION,
      classification: d.classification,
      impacts: d.impacts,
    }) ?? '';
  return {
    schemaId: CID_SEMANTIC_VIEW_SCHEMA_ID,
    version: CID_SEMANTIC_VIEW_VERSION,
    fingerprint,
    classification: d.classification,
    impacts: { ...d.impacts },
  };
}

/**
 * 执行语义轴指纹：model + route path +（可选）CID canonical。
 * 与 `execution_trace_v1` 并列挂于 `observability.trace.execution_semantic_fingerprint_v1`（hex 字符串）。
 */
export function computeExecutionSemanticFingerprintV1(params: {
  modelFingerprint: string;
  routeDecisionPath: ExecutionTraceV1RouteDecisionPath;
  changeImpactDescriptor: ChangeImpactDescriptorV1 | null;
}): string {
  const cidCanon = params.changeImpactDescriptor
    ? serializeChangeImpactDescriptorForCompare(params.changeImpactDescriptor)
    : '';
  const mat = {
    cid_axis_version: CID_AXIS_VERSION,
    model_fingerprint: params.modelFingerprint,
    route_decision_path: params.routeDecisionPath,
    change_impact_canonical: cidCanon,
  };
  return executionTimelineInputHash(mat) ?? '';
}

export function assertDescriptorCoversRequiredImpactsV1(
  descriptor: ChangeImpactDescriptorV1,
  required: Set<keyof ChangeImpactFlagsV1>,
): void {
  if (required.size === 0) return;
  const { impacts } = descriptor;
  for (const key of required) {
    if (!impacts[key]) {
      throw new ChangeImpactDescriptorValidationError(
        `CID impacts.${key} must be true for this diff (strict path rule); update change-impact-descriptor.v1.json`,
      );
    }
  }
}
