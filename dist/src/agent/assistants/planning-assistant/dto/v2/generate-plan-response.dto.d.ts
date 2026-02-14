import { PlanCandidateDto } from './shared/plan-candidate.dto';
export declare class GeneratePlanResponseDto {
    plans: PlanCandidateDto[];
    sessionId?: string;
    generatedAt: string;
    traceId?: string;
}
