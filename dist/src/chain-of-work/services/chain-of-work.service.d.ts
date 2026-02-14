import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft, DraftGenerationConfig, DraftValidationResult, ExecutionPlan, ExecutionResult } from '../interfaces/chain-of-work.interface';
import { DraftGeneratorService } from '../draft/draft-generator.service';
import { DraftValidatorService } from '../draft/draft-validator.service';
import { SkillMappingService } from '../mapping/skill/skill-mapping.service';
import { SubAgentMappingService } from '../mapping/sub-agent/sub-agent-mapping.service';
import { ExecutionPlanGeneratorService } from '../execution/execution-plan-generator.service';
import { ExecutionIntegrationService } from '../execution/execution-integration.service';
export declare class ChainOfWorkService {
    private readonly draftGenerator;
    private readonly draftValidator;
    private readonly skillMapping;
    private readonly subAgentMapping;
    private readonly executionPlanGenerator;
    private readonly executionIntegration;
    private readonly logger;
    constructor(draftGenerator: DraftGeneratorService, draftValidator: DraftValidatorService, skillMapping: SkillMappingService, subAgentMapping: SubAgentMappingService, executionPlanGenerator: ExecutionPlanGeneratorService, executionIntegration: ExecutionIntegrationService);
    generateDraft(request: TripPlanRequest, config?: DraftGenerationConfig): Promise<TripNARAWorkflowDraft>;
    validateDraft(draft: TripNARAWorkflowDraft): Promise<DraftValidationResult>;
    generateExecutionPlan(draft: TripNARAWorkflowDraft): Promise<ExecutionPlan>;
    executePlan(plan: ExecutionPlan, request: TripPlanRequest): Promise<ExecutionResult>;
    mapStepToSkills(step: any, context?: any): Promise<import("../interfaces/chain-of-work.interface").SkillMapping[]>;
    mapStepToSubAgent(step: any, context?: any): Promise<import("../interfaces/chain-of-work.interface").SubAgentMapping>;
}
