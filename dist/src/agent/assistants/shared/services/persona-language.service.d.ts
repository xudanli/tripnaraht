import { LlmService } from '../../../../llm/services/llm.service';
export type PersonaType = 'ABU' | 'DR_DRE' | 'NEPTUNE';
export interface PersonaContext {
    scenario: 'plan_evaluation' | 'destination_recommend' | 'emergency' | 'reminder' | 'adjustment' | 'general';
    destination?: string;
    planName?: string;
    data?: {
        budget?: number;
        duration?: number;
        fatigueScore?: number;
        riskLevel?: 'low' | 'medium' | 'high';
        hasWarnings?: boolean;
        warnings?: string[];
    };
    language?: 'en' | 'zh';
}
export interface PersonaStatement {
    persona: PersonaType;
    icon: string;
    message: string;
    messageCN: string;
    tone: string;
}
export declare class PersonaLanguageService {
    private readonly llmService?;
    private readonly logger;
    private readonly personas;
    constructor(llmService?: LlmService);
    generateStatement(persona: PersonaType, context: PersonaContext): Promise<PersonaStatement>;
    private generateWithLLM;
    private generateFromTemplate;
    private getTemplates;
    private fillTemplate;
    private getScenarioDescription;
    generateAllPersonaStatements(context: PersonaContext): Promise<{
        abu: PersonaStatement;
        drdre: PersonaStatement;
        neptune: PersonaStatement;
    }>;
    formatStatementsAsText(statements: {
        abu?: PersonaStatement;
        drdre?: PersonaStatement;
        neptune?: PersonaStatement;
    }, language?: 'en' | 'zh'): string;
}
