import { ClarificationPromptTemplate } from '../interfaces/enhancement.interface';
export declare class ClarificationPromptDesignerService {
    private readonly logger;
    private readonly templates;
    constructor();
    getPrompt(scenario: string, missingField: string, language?: 'en' | 'zh'): ClarificationPromptTemplate | null;
    createTemplate(template: Omit<ClarificationPromptTemplate, 'template_id'>): ClarificationPromptTemplate;
    private initializeTemplates;
    listTemplates(): ClarificationPromptTemplate[];
}
