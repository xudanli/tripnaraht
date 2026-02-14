export type ClarificationQuestionType = 'text' | 'single_choice' | 'multi_choice' | 'date' | 'number';
export interface ClarificationValidation {
    min?: number;
    max?: number;
    pattern?: string;
}
export interface ConditionalInputField {
    triggerValue: string;
    inputType: 'text' | 'date' | 'number' | 'date_range';
    label?: string;
    placeholder?: string;
    required?: boolean;
    validation?: ClarificationValidation;
    hint?: string;
}
export interface ClarificationQuestion {
    id: string;
    question: string;
    type: ClarificationQuestionType;
    options?: string[];
    required: boolean;
    placeholder?: string;
    hint?: string;
    default?: string | string[];
    validation?: ClarificationValidation;
    conditionalInputs?: ConditionalInputField[];
}
export interface ClarificationAnswer {
    questionId: string;
    value: string | string[] | number | null;
}
