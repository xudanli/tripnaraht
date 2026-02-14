import { ConfigService } from '@nestjs/config';
import { QualityScoreResult } from '../interfaces/enhancement.interface';
import { DiagnosticLabelSystemService } from './diagnostic-label-system.service';
import { JudgePromptDesignerService } from './judge-prompt-designer.service';
import { RollRewardAdapterService } from './roll-reward-adapter.service';
import { LlmService } from '../../../llm/services/llm.service';
export declare class QualityScorerService {
    private readonly configService;
    private readonly diagnosticLabelSystem;
    private readonly judgePromptDesigner;
    private readonly llmService?;
    private readonly rollRewardAdapter?;
    private readonly logger;
    private readonly useExternalJudge;
    private readonly llmJudgeUrl?;
    constructor(configService: ConfigService, diagnosticLabelSystem: DiagnosticLabelSystemService, judgePromptDesigner: JudgePromptDesignerService, llmService?: LlmService, rollRewardAdapter?: RollRewardAdapterService);
    score(plan: any, userRequest: string, evidence: any[], decisionLog: any[], useRM?: boolean): Promise<QualityScoreResult>;
    private scoreWithLLMJudge;
    private scoreWithExternalJudge;
    private scoreWithLlmService;
    private buildJudgePrompt;
    private parseJudgeResponse;
    private scoreWithRM;
    private generateExplanation;
    private calculateConfidence;
}
