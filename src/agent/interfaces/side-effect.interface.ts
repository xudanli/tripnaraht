import type { ShadowDeltaView } from './action.interface';

export type SideEffectKind =
  | 'RESOURCE_LOCK'
  | 'FINANCIAL_HOLD'
  | 'CREDIT_IMPACT'
  | 'ENERGY_PREALLOCATION'
  | 'RISK_DRIFT'
  | 'FATIGUE_ACCRUAL'
  | 'IRREVERSIBILITY_COST';

export type SideEffectDeltaType =
  | 'RESOURCE_AVAILABILITY'
  | 'FINANCIAL_FLOW'
  | 'RISK_DISTRIBUTION'
  | 'REVERSIBILITY';

export interface SideEffectEvidenceBundle {
  kind: 'side_effect_evidence';
  message: string;
  evidence: Record<string, unknown>;
}

export interface SideEffectPreviewResult {
  kind: SideEffectKind;
  deltaType: SideEffectDeltaType;
  confidence: number;
  expiresAt?: string;
  shadow_delta?: ShadowDeltaView;
  evidenceBundle?: SideEffectEvidenceBundle;
}

export interface SideEffectApplyResult {
  kind: SideEffectKind;
  /** State patch (opaque for now; can be wired into DSO/Orchestrator later). */
  state_patch?: Record<string, unknown>;
  evidenceBundle?: SideEffectEvidenceBundle;
}

export interface ActionContext {
  request_id: string;
  trip_id: string;
  action_id: string;
  action_name: string;
  action_type: string;
  target_type: string;
  target_ref?: string;
  action_input?: any;
  state: any;
}

export type SideEffectConfig = {
  handlerId: string;
  params?: Record<string, any>;
};

/**
 * Complex side effect handler (preview/apply/rollback/expire).
 * Minimal v1: preview/apply only.
 */
export interface ComplexSideEffect {
  id: string;
  kind: SideEffectKind;
  evidenceRequired: boolean;
  preview: (ctx: ActionContext, params?: Record<string, any>) => Promise<SideEffectPreviewResult | null>;
  apply: (ctx: ActionContext, params?: Record<string, any>) => Promise<SideEffectApplyResult | null>;
  rollback?: (ctx: ActionContext, params?: Record<string, any>) => Promise<SideEffectApplyResult | null>;
  expire?: (ctx: ActionContext, params?: Record<string, any>) => Promise<SideEffectApplyResult | null>;
}

