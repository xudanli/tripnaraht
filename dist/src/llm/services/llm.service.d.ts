import { ConfigService } from '@nestjs/config';
import { NaturalLanguageToParamsDto, TripCreationParams, HumanizeResultDto, DecisionSupportDto, LlmProvider } from '../dto/llm-request.dto';
export declare class LlmService {
    private configService?;
    private readonly logger;
    private readonly defaultProvider;
    private readonly useMock;
    private readonly openaiHttp;
    private readonly httpsAgent;
    private readonly circuitBreaker;
    constructor(configService?: ConfigService);
    getDefaultProvider(): LlmProvider;
    private extractJSON;
    naturalLanguageToTripParams(dto: NaturalLanguageToParamsDto): Promise<{
        params: TripCreationParams;
        needsClarification: boolean;
        clarificationQuestions?: string[];
        plannerReply?: string;
        suggestedQuestions?: string[];
        conversationContext?: Record<string, any>;
        llmRawOutput?: any;
    }>;
    humanizeResult(dto: HumanizeResultDto): Promise<string>;
    provideDecisionSupport(dto: DecisionSupportDto): Promise<{
        recommendations: Array<{
            title: string;
            description: string;
            confidence: number;
            reasoning: string;
        }>;
        summary: string;
    }>;
    handleErrorAndClarify(error: any, context: string): Promise<{
        message: string;
        clarificationQuestions: string[];
        suggestedActions: string[];
    }>;
    callLlmWithSchema(provider: LlmProvider, prompt: string, schema?: any): Promise<string>;
    private callLlm;
    private getMockResponse;
    private callOpenAI;
    private callGemini;
    private callDeepSeek;
    private callAnthropic;
    private buildTripCreationPrompt;
    private buildDestinationSpecificPromptSection;
    private buildHumanizePrompt;
    private buildDecisionSupportPrompt;
    private buildErrorHandlingPrompt;
    private getTripCreationSchema;
    private getDecisionSupportSchema;
    private getErrorHandlingSchema;
    private generatePlannerStyleClarification;
    private buildPlannerClarificationPrompt;
    private getPlannerClarificationSchema;
    private buildFallbackClarificationReply;
    private generateFallbackQuestions;
    private generateClarificationQuestions;
    private hasExplicitDate;
    private hasExplicitBudget;
    private hasReasonableInferredValues;
}
