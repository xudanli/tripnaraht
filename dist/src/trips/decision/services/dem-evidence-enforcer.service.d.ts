import { DemDecisionEvidence, DemEvidencePipelineResult } from '../interfaces/dem-decision-evidence.interface';
export declare class DemEvidenceEnforcerService {
    private readonly logger;
    canFinalizePlan(evidenceResult: DemEvidencePipelineResult): {
        allowed: boolean;
        reason?: string;
    };
    canNeptuneRepairSegment(segmentId: string, evidenceResult: DemEvidencePipelineResult): {
        allowed: boolean;
        reason?: string;
        evidence?: DemDecisionEvidence;
    };
    canAbuIgnoreViolation(segmentId: string, evidenceResult: DemEvidencePipelineResult): {
        allowed: boolean;
        reason?: string;
        evidence?: DemDecisionEvidence;
    };
    getSegmentsRequiringRepair(evidenceResult: DemEvidencePipelineResult): DemDecisionEvidence[];
    getSegmentsSuggestingOptimization(evidenceResult: DemEvidencePipelineResult): DemDecisionEvidence[];
}
