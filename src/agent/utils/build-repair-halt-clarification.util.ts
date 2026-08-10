/**
 * REPAIR 停机澄清：把 VERIFY/REPAIR 中的车型×F 路硬冲突提升到用户可读选项。
 * 避免只问「缩小范围/放宽约束」却不提换四驱。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { parseL3ProofPrefix } from './narrator-l3-persuasion.util';
import {
  humanizeVerifyConflictCode,
  stripLeadingAuditBracketTags,
  stripLeadingL3ProofBlocks,
} from './feasibility-message-surface.zh.util';

export type RepairHaltKind = 'budget_exceeded' | 'utility_decay';

type VerifyIssueLike = {
  code?: string;
  class?: string;
  message?: string;
};

function collectVerifyIssues(decisionState: DecisionState | undefined): VerifyIssueLike[] {
  const fromDso = (decisionState?.verification?.issues ?? []) as VerifyIssueLike[];
  const advisories = ((decisionState?.verification as { postRepairAdvisories?: VerifyIssueLike[] } | undefined)
    ?.postRepairAdvisories ?? []) as VerifyIssueLike[];
  return [...fromDso, ...advisories];
}

/** 是否为「两驱/经济型 × F 路/高地」类不可自动修补冲突 */
export function detectVehicleTerrainRepairHaltConflict(
  decisionState: DecisionState | undefined,
): { dominantCid: string; messageZh: string } | null {
  const issues = collectVerifyIssues(decisionState);
  for (const issue of issues) {
    const raw = String(issue?.message ?? '');
    const cid = parseL3ProofPrefix(raw)?.cid ?? '';
    const code = String(issue?.code ?? '');
    const isVehicleTerrain =
      cid === 'terrain.f_road_compatibility' ||
      code === 'TERRAIN_F_ROAD_UNFIT' ||
      (code === 'ROUTE_INFEASIBLE' &&
        /四驱|两驱|2WD|4WD|F\s*路|F-road|高地|vehicle_terrain|车型/i.test(raw));
    if (!isVehicleTerrain) continue;
    const cleaned =
      stripLeadingAuditBracketTags(stripLeadingL3ProofBlocks(raw)) ||
      humanizeVerifyConflictCode(code || 'TERRAIN_F_ROAD_UNFIT');
    return {
      dominantCid: cid || 'terrain.f_road_compatibility',
      messageZh: cleaned.slice(0, 280),
    };
  }

  const esc = decisionState?.verification?.escalationPlan as
    | { reason?: string; userClarificationSnippet?: string }
    | undefined;
  if (
    esc?.reason === 'TERRAIN_F_ROAD_UNFIT' ||
    /F-road|F 路|四驱|高地|2WD/i.test(String(esc?.userClarificationSnippet ?? ''))
  ) {
    const snippet = stripLeadingAuditBracketTags(String(esc?.userClarificationSnippet ?? '').trim());
    return {
      dominantCid: 'terrain.f_road_compatibility',
      messageZh:
        snippet ||
        humanizeVerifyConflictCode('TERRAIN_F_ROAD_UNFIT'),
    };
  }
  return null;
}

/**
 * 构造 REPAIR 停机澄清卡。
 * 有车型×地形冲突时优先给出「升级四驱 / 避开 F 路」；否则保留通用放宽选项。
 */
export function buildRepairHaltClarificationQuestion(input: {
  kind: RepairHaltKind;
  repairCount?: number;
  utilityDeclineCount?: number;
  euBefore?: unknown;
  euAfter?: unknown;
  decisionState?: DecisionState;
}): ClarificationQuestion {
  const vehicleTerrain = detectVehicleTerrainRepairHaltConflict(input.decisionState);
  const haltMeta = {
    presentation: 'structured_intake_v1' as const,
    repair_halt: input.kind,
    ...(vehicleTerrain
      ? { dominant_cid: vehicleTerrain.dominantCid, vehicle_terrain_conflict: true }
      : {}),
  };

  if (vehicleTerrain) {
    const attempts =
      input.kind === 'budget_exceeded'
        ? `系统已自动修复尝试 ${input.repairCount ?? 0} 次，仍无法消除车型与路况冲突。`
        : `自动修复后期望效用连续下降，且仍存在车型与路况冲突。`;
    return {
      id: input.kind === 'budget_exceeded' ? 'repair_halt_confirmation' : 'utility_decay_halt_confirmation',
      question:
        `${attempts}\n` +
        `原因：${vehicleTerrain.messageZh}\n` +
        `请选择下一步（推荐先确认车型）：`,
      type: 'single_choice',
      required: true,
      options: [
        {
          value: 'upgrade_vehicle_to_4wd',
          label: '【推荐】升级为四驱车辆，再继续规划',
        },
        {
          value: 'reduce_scope',
          label: '改走不含 F 路/高地的路线（缩小相关范围）',
        },
        {
          value: 'continue_auto_repair',
          label: '暂不改车型，继续尝试其他自动修复',
        },
      ],
      hint: '冰岛 F 路/高地通常要求合规四驱；两驱方案需改线，系统无法静默替您决定。',
      metadata: haltMeta,
    };
  }

  if (input.kind === 'utility_decay') {
    return {
      id: 'utility_decay_halt_confirmation',
      question: `自动修复后期望效用已连续 ${input.utilityDeclineCount ?? 0} 次下降（E[U] ${String(input.euBefore)} → ${String(input.euAfter)}）。是否缩小范围/放宽约束，或由您确认继续？`,
      type: 'single_choice',
      required: true,
      options: [
        { value: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
        { value: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
        { value: 'continue_auto_repair', label: '继续自动修复' },
      ],
      hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
      metadata: haltMeta,
    };
  }

  return {
    id: 'repair_halt_confirmation',
    question: `系统已自动修复尝试 ${input.repairCount ?? 0} 次，仍未收敛。是否需要缩小范围/放宽约束/或由您确认继续自动修复？`,
    type: 'single_choice',
    required: true,
    options: [
      { value: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
      { value: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
      { value: 'continue_auto_repair', label: '继续自动修复' },
    ],
    hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
    metadata: haltMeta,
  };
}
