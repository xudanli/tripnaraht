/**
 * Experience Atom — MVP 体验语义原子（PRD §8.2）
 * Iceland MVP: 8 atoms covering South Coast + Golden Circle intent space.
 */

export const MVP_EXPERIENCE_ATOM_CODES = [
  'EPIC_WATERFALL',
  'REMOTE_WORLD_EDGE',
  'CINEMATIC_PHOTOGRAPHY',
  'HEALING_HOT_SPRING',
  'WILD_COAST_SOLITUDE',
  'GLACIER_ADVENTURE',
  'LOW_EFFORT_NATURE',
  'SLOW_TRAVEL_RELAXATION',
] as const;

export type ExperienceAtomCode = (typeof MVP_EXPERIENCE_ATOM_CODES)[number];

export type ExperienceIntentPriority = 'MUST_PRESERVE' | 'HIGH' | 'NORMAL';

export type ExperienceAtomRelationKind = 'RELATED' | 'CONFLICTING';

/** 条件修正：在特定上下文下调整 atom 强度或可用性 */
export interface ExperienceAtomConditionModifier {
  /** 触发条件描述（规则引擎 / LLM 可读） */
  condition: string;
  /** 对期望强度的乘数（0..2） */
  strengthMultiplier?: number;
  /** 是否在此条件下禁用该 atom */
  disabled?: boolean;
  /** 备注（审计 / 解释） */
  note?: string;
}

export interface ExperienceAtomDefinition {
  code: ExperienceAtomCode;
  /** 中文展示名 */
  displayNameZh: string;
  /** 英文展示名 */
  displayNameEn: string;
  /** 语义定义 */
  definition: string;
  /** 用户常见表达（中英） */
  userExpressions: readonly string[];
  /** 正向信号（POI / 内容匹配） */
  positiveSignals: readonly string[];
  /** 负向信号 */
  negativeSignals: readonly string[];
  conditionModifiers: readonly ExperienceAtomConditionModifier[];
  /** 相关体验 atom */
  relatedAtoms: readonly ExperienceAtomCode[];
  /** 冲突体验 atom */
  conflictingAtoms: readonly ExperienceAtomCode[];
  /** 前端灵感层短文案模板 */
  inspirationLanguage: string;
}

export interface ExperienceAtomRelation {
  from: ExperienceAtomCode;
  to: ExperienceAtomCode;
  kind: ExperienceAtomRelationKind;
  /** 关系强度 0..1 */
  weight: number;
}
