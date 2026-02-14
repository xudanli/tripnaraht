import { RoutePlanDraft } from './world-model.types';
export type DecisionAction = 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
export type DecisionPersona = 'ABU' | 'DR_DRE' | 'NEPTUNE';
export type DecisionSource = "PHYSICAL" | "HUMAN" | "PHILOSOPHY" | "HEURISTIC";
export type DecisionStage = 'ROUTE_PICK' | 'DEM_EVIDENCE' | 'ABU_GATE' | 'PACE_ADJUST' | 'SPATIAL_REPAIR' | 'READINESS' | 'FINALIZE';
export interface DecisionLogEntry {
    persona: DecisionPersona;
    action: DecisionAction;
    explanation: string;
    reasonCodes: string[];
    evidenceRefs?: string[];
    timestamp: string;
    decisionSource: DecisionSource;
    decisionStage: DecisionStage;
}
export interface DecisionResult {
    allowed: boolean;
    action: DecisionAction;
    updatedPlan?: RoutePlanDraft;
    logs: DecisionLogEntry[];
}
