import { PrismaService } from '../../../prisma/prisma.service';
import { DestinationClarificationConfig, ClarificationRound, ClarificationQuestionDef } from '../config/destination-clarification.config';
import { ConversationMessage } from '../../services/nl-conversation-context.service';
export declare class DestinationClarificationConfigService {
    private readonly prisma;
    private readonly logger;
    private configCache;
    private readonly CACHE_TTL;
    constructor(prisma: PrismaService);
    clearCache(destinationCode?: string): void;
    getConfig(destinationCode: string): Promise<DestinationClarificationConfig | null>;
    getCurrentRoundQuestions(destinationCode: string, currentParams: Record<string, any>, conversationHistory: ConversationMessage[]): Promise<{
        round: ClarificationRound;
        questions: ClarificationQuestionDef[];
        shouldTriggerGate?: boolean;
    } | null>;
    private determineCurrentRound;
    private checkTriggerConditions;
    private checkCompletionConditions;
    private findRoundById;
    private applyDependencies;
    private extractAskedQuestionIds;
    createOrUpdateConfig(destinationCode: string, config: DestinationClarificationConfig, userId?: string): Promise<void>;
    setEnabled(destinationCode: string, enabled: boolean, userId?: string): Promise<void>;
    getAllConfigs(): Promise<Array<{
        destinationCode: string;
        destinationName: string;
        enabled: boolean;
        metadata?: any;
        userPersonas?: {
            user_personas?: Array<{
                persona_id: string;
                persona_name: string;
            }>;
        };
    }>>;
    getCriticalFields(destinationCode: string): Promise<Array<{
        fieldName: string;
        questionId: string;
        question: string;
    }>>;
    getQuestionsForFields(destinationCode: string, fieldNames: string[]): Promise<ClarificationQuestionDef[]>;
}
