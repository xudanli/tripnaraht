import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';

/** PRD 3.4.4 — 组队风格契约（Teamwork Style / 责任边界） */
export interface TeamworkStyleDefinition {
  id: RecruitmentPlanningStyle;
  label: string;
  productName: string;
  description: string;
  boundary: string;
  algorithmMapping: string;
  contractCapsule: string;
}

export const TEAMWORK_STYLE_OPTIONS: TeamworkStyleDefinition[] = [
  {
    id: 'full_managed',
    label: '全托管',
    productName: 'Full-Service Model',
    description: '队长主导攻略、订房、路线与后勤；队员以体验为主、服从安排。',
    boundary: '我出钱/出力，你闭眼跟。队员负责体验与情绪价值，不对路线酒店指手画脚。',
    algorithmMapping: '优先推荐服从度高、计划性(J)极低的随性体验者。',
    contractCapsule: '🛡️ 组队风格：全托管',
  },
  {
    id: 'co_planning',
    label: '一起策划',
    productName: 'Collaborative Planning',
    description: '出发前共建行程，行中民主决策、按功劳分工。',
    boundary: '共创剧本，按功劳分工。拒绝「群里说随便、现场挑刺」。',
    algorithmMapping: '重点考核决策速度与沟通顺畅度；拒绝重度甩手掌柜。',
    contractCapsule: '🛡️ 组队风格：一起策划',
  },
  {
    id: 'casual_play',
    label: '一起随便玩',
    productName: 'Improvisational Vibe',
    description: '无硬性日程，即兴决策，支持随时自由脱队。',
    boundary: '盲盒相遇，随时解散。强 J 人勿入。',
    algorithmMapping: '仅向高不确定性容忍、高弹性(P)用户高保真分发。',
    contractCapsule: '🛡️ 组队风格：一起随便玩',
  },
];

/** @deprecated 使用 TEAMWORK_STYLE_OPTIONS；保留别名兼容 */
export const PLANNING_STYLE_OPTIONS = TEAMWORK_STYLE_OPTIONS.map(({ id, label, description }) => ({
  id,
  label,
  description,
}));

const STYLE_BY_ID = new Map(TEAMWORK_STYLE_OPTIONS.map((o) => [o.id, o]));

export function resolveTeamworkStyleDefinition(
  styleId: string | null | undefined,
): TeamworkStyleDefinition | null {
  if (!styleId) return null;
  return STYLE_BY_ID.get(styleId as RecruitmentPlanningStyle) ?? null;
}

export function resolveTeamworkStyleLabel(styleId: string | null | undefined): string | null {
  return resolveTeamworkStyleDefinition(styleId)?.label ?? styleId ?? null;
}

export function resolveTeamworkStyleCapsule(styleId: string | null | undefined): string | null {
  return resolveTeamworkStyleDefinition(styleId)?.contractCapsule ?? null;
}

export function isValidTeamworkStyle(value: string): value is RecruitmentPlanningStyle {
  return STYLE_BY_ID.has(value as RecruitmentPlanningStyle);
}

/** @deprecated */
export const resolvePlanningStyleDefinition = resolveTeamworkStyleDefinition;
/** @deprecated */
export const resolvePlanningStyleLabel = resolveTeamworkStyleLabel;
/** @deprecated */
export const isValidPlanningStyle = isValidTeamworkStyle;

function snapshotLike(snapshot: CaptainPersonaSnapshot): CaptainPersonaSnapshot {
  return snapshot;
}

/** 强计划型：必须按计划执行 */
export function isStrongPlanner(snapshot: CaptainPersonaSnapshot): boolean {
  const s = snapshotLike(snapshot);
  return s.dimensionPercents.J >= 75;
}

/** 高弹性随性型 */
export function isStrongImproviser(snapshot: CaptainPersonaSnapshot): boolean {
  const s = snapshotLike(snapshot);
  return s.dimensionPercents.P >= 75;
}

/** 甩手掌柜 / 高服从体验者（Premium：低 control_desire + 高 P） */
export function isPassiveFollower(snapshot: CaptainPersonaSnapshot): boolean {
  const s = snapshotLike(snapshot);
  if (s.rawScores.control_desire !== 0 || s.rawScores.collaborative_trait !== 0) {
    return (
      s.rawScores.control_desire <= 0 &&
      (s.dimensionPercents.P >= 55 || s.rawScores.compromise_index >= 2)
    );
  }
  return s.dimensionPercents.P >= 65 && s.dimensionPercents.J < 60;
}

/** 也想深度策划 / 控制欲（Premium：control_desire 或 collaborative_trait） */
export function isCoCreatorPlanner(snapshot: CaptainPersonaSnapshot): boolean {
  const s = snapshotLike(snapshot);
  if (s.rawScores.control_desire >= 2) return true;
  if (s.rawScores.collaborative_trait >= 2) return true;
  return s.dimensionPercents.J >= 75 || (s.dimensionPercents.J >= 65 && s.rawScores.aesthetic_preference >= 1);
}

/** 重度甩手掌柜（一起策划模式雷区） */
export function isExtremeDelegator(snapshot: CaptainPersonaSnapshot): boolean {
  const s = snapshotLike(snapshot);
  if (s.rawScores.control_desire !== 0 || s.rawScores.independence >= 2) {
    return s.rawScores.control_desire <= 0 && s.dimensionPercents.P >= 60 && s.rawScores.collaborative_trait <= 0;
  }
  return s.dimensionPercents.P >= 75 && s.dimensionPercents.J < 50;
}
