import { DecisionDraft } from '../interfaces/decision-draft.interface';
import { DecisionDraftGeneratorService } from './decision-draft-generator.service';
import { DecisionDebugCollectorService } from './decision-debug-collector.service';
import { ChainOfWorkService } from '../../chain-of-work/services/chain-of-work.service';
import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { DecisionDraftStorageService } from '../storage/decision-draft-storage.service';
import { DecisionTypeToStepDraftMapper } from '../mapping/decision-type-to-step-draft.mapper';
export interface DecisionStepEditOperation {
    decision_step_id: string;
    action: 'approve' | 'reject' | 'modify';
    modifications?: {
        title?: string;
        description?: string;
        outputs?: Array<{
            name: string;
            value: any;
            confidence?: number;
        }>;
        evidence_weights?: Record<string, number>;
    };
    reasoning?: string;
}
export interface PartialRegenerationConfig {
    regenerate_step_drafts?: boolean;
    regenerate_decision_steps?: boolean;
    preserve_approved_decisions?: boolean;
    original_user_input?: string;
    original_trip_plan_request?: TripPlanRequest;
}
export declare class DecisionDraftEditorService {
    private readonly decisionDraftGenerator;
    private readonly chainOfWorkService;
    private readonly storageService;
    private readonly decisionTypeMapper;
    private readonly debugCollector?;
    private readonly logger;
    constructor(decisionDraftGenerator: DecisionDraftGeneratorService, chainOfWorkService: ChainOfWorkService, storageService: DecisionDraftStorageService, decisionTypeMapper: DecisionTypeToStepDraftMapper, debugCollector?: DecisionDebugCollectorService);
    editDecisionStep(decisionDraft: DecisionDraft, operation: DecisionStepEditOperation): Promise<DecisionDraft>;
    batchEditDecisionSteps(decisionDraft: DecisionDraft, operations: DecisionStepEditOperation[]): Promise<DecisionDraft>;
    private applyEditOperation;
    partialRegenerate(decisionDraft: DecisionDraft, config?: PartialRegenerationConfig): Promise<DecisionDraft>;
    private regenerateDecisionSteps;
    private buildTargetedUserInput;
    private getStepTypesForDecisionType;
    reorderDecisionSteps(decisionDraft: DecisionDraft, newOrder: string[]): Promise<DecisionDraft>;
    applyDecisionDraft(decisionDraft: DecisionDraft): Promise<{
        applied: boolean;
        applied_steps: string[];
        skipped_steps: string[];
        applied_at: string;
    }>;
}
