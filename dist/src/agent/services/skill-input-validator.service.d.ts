import { SkillMetadata } from '../../skills/interfaces/skill.interface';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
export interface ValidationResult {
    valid: boolean;
    missingParams: string[];
    typeErrors?: Array<{
        param: string;
        message: string;
    }>;
    clarificationMessage?: string;
    solutions?: string[];
}
export interface ValidationContext {
    context?: AgentContext;
    request?: RouteAndRunRequestDto;
    stepResults?: Record<string, any>;
    planSteps?: Array<{
        id: string;
        skillName?: string;
    }>;
}
export declare class SkillInputValidatorService {
    private readonly logger;
    validate(skillName: string, input: Record<string, any>, metadata?: SkillMetadata, validationContext?: ValidationContext): ValidationResult;
    private validateWithSchema;
    private validateWithRule;
    private extractParameterWithConfig;
    private extractFromContext;
    private extractFromRequest;
    private extractFromStepResult;
    private getNestedValue;
    private extractParameter;
    private extractCountryCodeFromMessage;
    private hasValue;
    private validateTypeAndRange;
    private getType;
    private validateFormat;
    private buildClarificationMessage;
    private extractSolutions;
}
