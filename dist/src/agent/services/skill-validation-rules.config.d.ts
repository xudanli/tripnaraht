import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
export interface SkillValidationRule {
    dependencies?: Array<{
        param: string;
        alternatives?: string[];
    }>;
    extractors?: Record<string, (context: AgentContext, request: RouteAndRunRequestDto) => any>;
}
export declare const SKILL_VALIDATION_RULES: Record<string, SkillValidationRule>;
