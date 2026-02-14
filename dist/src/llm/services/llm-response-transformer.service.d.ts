import { PlannerResponseBlockDto } from '../../trips/dto/create-trip-from-nl-response.dto';
import { ClarificationQuestion } from '../../agent/interfaces/clarification.interface';
export declare class LlmResponseTransformerService {
    private readonly logger;
    transformToStructuredResponse(llmOutput: any, fallbackText?: string, retryCount?: number): Promise<{
        plannerResponseBlocks?: PlannerResponseBlockDto[];
        clarificationQuestions?: ClarificationQuestion[];
        plannerReply?: string;
    }>;
    private isRecoverableError;
    private attemptAutoFix;
    private validateAndTransformBlocks;
    private validateAndTransformQuestions;
    private finalizeQuestions;
    private normalizeQuestionText;
    private validateQuestionIdMatching;
    private generateTextReply;
    private fallbackQuestions;
}
