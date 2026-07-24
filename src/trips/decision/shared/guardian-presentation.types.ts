/**
 * 三人格 Persona Expression Layer — 前端/API 共享契约
 */
import type {
  AbuExistenceStatus,
  DreCostStatus,
  GuardianAction,
} from './guardian-action.types';

export type GuardianExpressionPhase = 'planning' | 'in_trip';

/** planning=设计建议（可展开）；in_trip=执行简报（短句） */
export type PersonaDisplayStyle = 'design_advisory' | 'execution_brief';

export type LeadSpeakerPersona = 'ABU' | 'DR_DRE' | 'NEPTUNE';

export type LeadSpeakerScenario =
  | 'SAFETY_BLOCK'
  | 'SAFETY_WARN'
  | 'PACE_COST'
  | 'INTENT_REPAIR'
  | 'MULTI_FACTOR'
  | 'ALL_CLEAR';

export interface PersonaStructuredStatus {
  abu?: {
    existence: AbuExistenceStatus;
    action?: GuardianAction;
  };
  dre?: {
    cost: DreCostStatus;
    action?: GuardianAction;
  };
  neptune?: {
    action?: GuardianAction;
  };
  user?: {
    action: 'CHOOSE';
  };
}

export interface PersonaSupportingLine {
  persona: LeadSpeakerPersona;
  icon: string;
  name: string;
  role: 'evidence' | 'pace' | 'repair';
  text: string;
}

/** CHOOSE 场景下的人工决策点（与 negotiation / optimize 读路径对齐） */
export interface GuardianHumanDecisionPoint {
  id: string;
  question: string;
  options: string[];
  recommendation?: string;
  /** 规划工作台：与 options 同序的 skeleton optionId */
  optionIds?: string[];
}

/** 单主角表达 — 前端默认渲染此对象 */
export interface GuardianPersonaPresentation {
  mode: 'single_lead' | 'decision_committee';
  scenario: LeadSpeakerScenario;
  leadSpeaker: LeadSpeakerPersona;
  headline: string;
  /** 主叙事（planning 较完整；in_trip 为短简报） */
  narrative: string;
  /** 行中阶段：1–3 条 ultra-short 行（可直接做 toast / banner） */
  briefLines?: string[];
  expressionPhase: GuardianExpressionPhase;
  displayStyle: PersonaDisplayStyle;
  supportingLines: PersonaSupportingLine[];
  actions: Partial<Record<'abu' | 'dre' | 'neptune' | 'user', GuardianAction>>;
  structuredStatus: PersonaStructuredStatus;
  /** 硬约束已 BLOCK；前端优先读此字段禁用 CHOOSE */
  hardConstraintBlocked?: boolean;
  /** CHOOSE 时结构化选项（前端应读此字段，勿把 consolidatedDecision.nextSteps 当选项） */
  humanDecisionPoints?: GuardianHumanDecisionPoint[];
  /** humanDecisionPoints 扁平化，供 GuardianChooseModal 等 */
  humanDecisionPointsFlat?: string[];
}

/** DecisionLog.metadata 扩展字段（审计/回放） */
export interface GuardianDecisionLogMetadata {
  guardianExpressionPhase?: GuardianExpressionPhase;
  guardianLeadSpeaker?: LeadSpeakerPersona;
  guardianScenario?: LeadSpeakerScenario;
  guardianStructuredStatus?: PersonaStructuredStatus;
  guardianActions?: Partial<Record<'abu' | 'dre' | 'neptune' | 'user', GuardianAction>>;
  revalidationPass?: 'POST_NEPTUNE_REPAIR';
}
