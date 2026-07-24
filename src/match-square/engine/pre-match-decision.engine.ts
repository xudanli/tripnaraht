import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';
import type { TrekkingVibeOrchestrationPlan } from '../types/trekking-vibe-orchestration.types';
import { SCENE_ROLE_ANCHOR_LABELS } from '../config/task-role-dispatch-matrix.config';
import { resolveActiveTaskTemplates } from '../config/scene-task-templates.config';
import {
  PRE_MATCH_DECISION_VERSION,
  type PreMatchDecisionBriefView,
  type PreMatchNoiseDriver,
  type SceneRoleAnchorId,
} from '../types/recruitment-task-flywheel.types';
import type { PhysicalFitnessFitReportView } from '../types/physical-fitness-gate.types';
import { buildUserFeatureVector } from './user-feature-vector.engine';

export interface BuildPreMatchDecisionBriefInput {
  captain: CaptainPersonaSnapshot;
  applicant: CaptainPersonaSnapshot;
  teamworkStyle?: RecruitmentPlanningStyle | null;
  hardMetricsPass: boolean;
  vibeChipIds: string[];
  trekkingOrchestration?: TrekkingVibeOrchestrationPlan | null;
  recruitmentScriptId?: string | null;
  physicalFitnessReport?: PhysicalFitnessFitReportView | null;
}

const BLIND_NAV_CHIP_IDS = new Set(['dem_blind_nav', 'dem_digital_elevation']);
const FORD_CHIP_IDS = new Set(['glacier_river_ford']);

function extractMilestoneIds(plan: TrekkingVibeOrchestrationPlan | null | undefined): string[] {
  if (!plan) return [];
  return plan.eventStreamMilestones.map((m) => m.eventId);
}

function hasBlindNavExposure(vibeChipIds: string[], milestoneIds: string[]): boolean {
  if (vibeChipIds.some((id) => BLIND_NAV_CHIP_IDS.has(id))) return true;
  return milestoneIds.some((id) => /dem|blind|offline/i.test(id));
}

function hasFordExposure(vibeChipIds: string[], milestoneIds: string[]): boolean {
  if (vibeChipIds.some((id) => FORD_CHIP_IDS.has(id))) return true;
  return milestoneIds.some((id) => /ford|river|glacier/i.test(id));
}

function applicantAnxietyScore(applicant: CaptainPersonaSnapshot): number {
  const stress = applicant.rawScores.stress_anxiety_index ?? 0;
  const ambiguity = applicant.rawScores.ambiguity_tolerance ?? 0;
  return Math.max(0, stress) + (ambiguity <= 0 ? 1 : 0);
}

function captainControlScore(
  captain: CaptainPersonaSnapshot,
  teamworkStyle?: RecruitmentPlanningStyle | null,
): number {
  const vec = buildUserFeatureVector({
    mbtiType: captain.mbtiType,
    rawScores: captain.rawScores,
    dimensionPercents: captain.dimensionPercents,
  });
  if (teamworkStyle === 'full_managed') return Math.max(vec.cControl, 8);
  if (teamworkStyle === 'co_planning') return Math.max(vec.cControl, 5);
  return vec.cControl;
}

function resolveRoleAnchor(input: {
  noisePercent: number;
  captainControl: number;
  applicantAnxiety: number;
  hasBlindNav: boolean;
}): { anchor: SceneRoleAnchorId | null; label: string | null } {
  if (input.noisePercent < 12) return { anchor: null, label: null };

  if (input.hasBlindNav && input.captainControl >= 7 && input.applicantAnxiety >= 1) {
    return {
      anchor: 'blind_box_follower',
      label: SCENE_ROLE_ANCHOR_LABELS.blind_box_follower,
    };
  }

  if (input.captainControl >= 7) {
    return {
      anchor: 'hardcore_executor',
      label: SCENE_ROLE_ANCHOR_LABELS.hardcore_executor,
    };
  }

  return {
    anchor: 'co_planning_deputy',
    label: SCENE_ROLE_ANCHOR_LABELS.co_planning_deputy,
  };
}

function buildNarrativeLine(input: {
  hardMetricsPass: boolean;
  noisePercent: number;
  roleLabel: string | null;
  mitigatingTitles: string[];
  blindNavLabel: string | null;
}): string | null {
  if (!input.hardMetricsPass) return null;

  const parts: string[] = ['🤖 TripNARA 决策引擎提示：该申请人综合硬指标通过。'];

  if (input.noisePercent >= 10 && input.blindNavLabel) {
    parts.push(
      `但在行中遭遇『${input.blindNavLabel}』里程碑时，与你的指挥官风格可能产生 ${input.noisePercent}% 的协作噪音。`,
    );
  } else if (input.noisePercent >= 10) {
    parts.push(`行中协作噪音预测约 ${input.noisePercent}%。`);
  } else {
    parts.push('行中协作噪音预测较低，可常规吸纳。');
    return parts.join('');
  }

  const suggestions: string[] = [];
  if (input.roleLabel) {
    suggestions.push(`建议将其角色锚定为 [${input.roleLabel}]`);
  }
  if (input.mitigatingTitles.length > 0) {
    suggestions.push(`并在行程模块中前置锁死『${input.mitigatingTitles[0]}』以对冲行中焦虑`);
  }

  if (suggestions.length > 0) {
    parts.push(`AI 决策建议：若吸纳该成员，${suggestions.join('，')}。`);
  }

  return parts.join('');
}

/**
 * PRD 3.13 — 拼团前置 CSP 预演（纯函数，无 IO）
 */
export function buildPreMatchDecisionBrief(
  input: BuildPreMatchDecisionBriefInput,
): PreMatchDecisionBriefView {
  const milestoneIds = extractMilestoneIds(input.trekkingOrchestration);
  const hasBlindNav = hasBlindNavExposure(input.vibeChipIds, milestoneIds);
  const hasFord = hasFordExposure(input.vibeChipIds, milestoneIds);

  const captainControl = captainControlScore(input.captain, input.teamworkStyle);
  const applicantAnxiety = applicantAnxietyScore(input.applicant);

  const drivers: PreMatchNoiseDriver[] = [];
  let noise = 0;

  if (hasBlindNav && captainControl >= 7 && applicantAnxiety >= 1) {
    const weight = 18;
    noise += weight;
    drivers.push({
      factorId: 'dem_blind_nav_x_anxiety',
      label: '内陆断网盲导 × 高焦虑询问倾向',
      weight,
    });
  } else if (hasBlindNav && captainControl >= 7) {
    const weight = 10;
    noise += weight;
    drivers.push({
      factorId: 'dem_blind_nav_x_commander',
      label: '盲导里程碑 × 指挥官全托管风格',
      weight,
    });
  }

  if (hasFord && applicantAnxiety >= 2) {
    const weight = 8;
    noise += weight;
    drivers.push({
      factorId: 'ford_x_anxiety',
      label: '强涉水节点 × 行前焦虑',
      weight,
    });
  }

  const controlGap = Math.abs(captainControl - 3);
  if (controlGap >= 5 && input.applicant.rawScores.control_desire >= 2) {
    const weight = 6;
    noise += weight;
    drivers.push({
      factorId: 'dual_commander',
      label: '双高控制欲潜在冲突',
      weight,
    });
  }

  const noisePercent = Math.min(100, Math.max(0, noise));

  const { anchor, label } = resolveRoleAnchor({
    noisePercent,
    captainControl,
    applicantAnxiety,
    hasBlindNav,
  });

  const mitigatingTemplates = resolveActiveTaskTemplates({
    vibeChipIds: input.vibeChipIds,
    milestoneIds,
    recruitmentScriptId: input.recruitmentScriptId ?? null,
    mitigatingOnly: true,
  });

  const mitigatingTaskTemplateIds =
    noisePercent >= 12
      ? mitigatingTemplates.map((t) => t.templateId)
      : noisePercent >= 10 && anchor === 'blind_box_follower'
        ? ['pre_trip_safety_blueprint']
        : [];

  const mitigatingTitles = mitigatingTemplates.map((t) => t.title);

  const blindNavLabel = hasBlindNav ? '内陆断网盲导' : null;

  return {
    version: PRE_MATCH_DECISION_VERSION,
    hardMetricsPass: input.hardMetricsPass,
    inTripCollaborationNoisePercent: noisePercent,
    noiseDrivers: drivers,
    suggestedSceneRoleAnchor: anchor,
    suggestedSceneRoleLabel: label,
    mitigatingTaskTemplateIds,
    narrativeLine: buildNarrativeLine({
      hardMetricsPass: input.hardMetricsPass,
      noisePercent,
      roleLabel: label,
      mitigatingTitles,
      blindNavLabel,
    }),
    physicalFitnessReport: input.physicalFitnessReport ?? null,
  };
}
