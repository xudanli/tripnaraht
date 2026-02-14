import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ChangeHandlingResult, ChangeType } from './shared/execution-state.types';
import { LlmService } from '../../llm/services/llm.service';
export interface ExecHandleChangeInput extends SkillInput {
    tripId: string;
    changeType: ChangeType;
    changeDetails: {
        itemId?: string;
        originalValue?: any;
        newValue?: any;
        reason?: string;
    };
    currentPlan?: any;
}
export interface ExecHandleChangeOutput extends SkillOutput {
    result: ChangeHandlingResult;
}
export declare class ExecHandleChangeSkill implements Skill<ExecHandleChangeInput, ExecHandleChangeOutput> {
    private readonly llmService;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(llmService: LlmService);
    execute(input: ExecHandleChangeInput): Promise<ExecHandleChangeOutput>;
    private buildPrompt;
}
