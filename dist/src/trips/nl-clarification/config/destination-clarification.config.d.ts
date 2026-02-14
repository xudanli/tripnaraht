export interface DestinationClarificationConfig {
    destinationCode: string;
    destinationName: string;
    enabled: boolean;
    clarificationRounds: ClarificationRound[];
    gatePrechecks?: GatePrecheckConfig[];
    fieldExtractionRules?: FieldExtractionRule[];
    metadata?: {
        description?: string;
        riskLevel?: 'low' | 'medium' | 'high' | 'extreme';
        requiresExpertise?: boolean;
        lastUpdated?: string;
        dataSources?: string[];
        credibilityScore?: number;
    };
    riskKnowledgeBase?: Record<string, any>;
    userPersonas?: {
        metadata?: {
            version?: string;
            last_updated?: string;
            description?: string;
            credibility_score?: number;
            language?: string;
        };
        overview?: {
            purpose?: string;
            philosophy?: string;
        };
        user_personas?: Array<{
            persona_id: string;
            persona_name: string;
            persona_name_en?: string;
            percentage_of_visitors?: string;
            characteristics?: Record<string, any>;
            recommended_routes?: Array<{
                route: string;
                reason?: string;
                difficulty_match?: string;
                prerequisites?: string[];
            }>;
            not_recommended?: string[];
            preparation_needs?: string[];
            expected_experiences?: Record<string, any>;
            typical_itinerary?: Record<string, string>;
            success_factors?: string[];
            [key: string]: any;
        }>;
        persona_assessment_tool?: {
            how_to_use?: string;
            questions?: Array<Record<string, any>>;
        };
        cross_persona_advice?: Record<string, any>;
        ai_decision_logic?: Record<string, any>;
        red_flags?: {
            medical?: string[];
            psychological?: string[];
            practical?: string[];
            safety?: string[];
        };
        decision_matrix?: Record<string, any>;
        data_provenance?: Record<string, any>;
    };
}
export interface ClarificationRound {
    roundId: string;
    name: string;
    description: string;
    triggerConditions: {
        requiredFields?: string[];
        previousRoundCompleted?: string;
    };
    questions: ClarificationQuestionDef[];
    completionConditions: {
        requiredFields: string[];
        allQuestionsAnswered?: boolean;
    };
    priority: number;
}
export interface ClarificationQuestionDef {
    id: string;
    question: string;
    type: 'text' | 'single_choice' | 'multi_choice' | 'date' | 'number' | 'boolean';
    options?: Array<{
        value: string;
        label: string;
        actions?: QuestionAction[];
    }>;
    required: boolean;
    hint?: string;
    placeholder?: string;
    default?: string | string[] | boolean | number;
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        customValidator?: string;
    };
    dependencies?: Array<{
        fieldId: string;
        value: any;
    }>;
    metadata?: {
        category?: string;
        priority?: 'high' | 'medium' | 'low';
        isCritical?: boolean;
        fieldName?: string;
    };
    actions?: QuestionAction[];
}
export interface QuestionAction {
    type: 'set_field' | 'trigger_gate' | 'show_warning' | 'hide_question' | 'show_question';
    params: Record<string, any>;
}
export interface GatePrecheckConfig {
    checkId: string;
    name: string;
    triggerConditions: {
        requiredFields: string[];
        fieldConditions?: Array<{
            fieldId: string;
            operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in';
            value: any;
        }>;
    };
    checkType: 'hard_gate' | 'soft_gate' | 'warning';
    checkLogic: {
        useLLM?: boolean;
        llmPrompt?: string;
        useRuleEngine?: boolean;
        ruleExpression?: string;
    };
    failureResponse: {
        blockType: 'block' | 'warning' | 'require_confirmation';
        warningMessage: string;
        alternatives?: Array<{
            label: string;
            description: string;
            action?: string;
        }>;
        additionalQuestions?: ClarificationQuestionDef[];
    };
}
export interface FieldExtractionRule {
    fieldName: string;
    fieldType: 'string' | 'number' | 'boolean' | 'array' | 'object';
    extractionPrompt: string;
    validation?: {
        required?: boolean;
        min?: number;
        max?: number;
        pattern?: string;
        enum?: string[];
    };
    defaultValue?: any;
}
export interface GatePrecheckResult {
    blocked: boolean;
    checkId?: string;
    warningMessage?: string;
    alternatives?: Array<{
        label: string;
        description: string;
        action?: string;
    }>;
    additionalQuestions?: ClarificationQuestionDef[];
}
export declare const GREENLAND_CONFIG_TEMPLATE: DestinationClarificationConfig;
export { ICELAND_CONFIG_TEMPLATE } from './iceland-clarification.config';
export { GREENLAND_USER_PERSONAS } from './greenland-personas.config';
export { K2_USER_PERSONAS } from './k2-personas.config';
export { ALPS_USER_PERSONAS } from './alps-personas.config';
export { ALPS_CONFIG_TEMPLATE } from './alps-clarification.config';
export { SVALBARD_USER_PERSONAS } from './svalbard-personas.config';
export { SVALBARD_CONFIG_TEMPLATE } from './svalbard-clarification.config';
export { K2_CONFIG_TEMPLATE } from './k2-clarification.config';
export { TIBET_CONFIG_TEMPLATE } from './tibet-clarification.config';
export { LOFOTEN_CONFIG_TEMPLATE } from './lofoten-clarification.config';
