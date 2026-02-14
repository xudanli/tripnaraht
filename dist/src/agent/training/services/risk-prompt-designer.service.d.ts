import { RiskPromptTemplate } from '../interfaces/enhancement.interface';
export declare class RiskPromptDesignerService {
    private readonly logger;
    private readonly templates;
    constructor();
    getPrompt(sevLevel: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4', category: RiskPromptTemplate['category'], reason: string, language?: 'en' | 'zh'): RiskPromptTemplate | null;
    createTemplate(template: Omit<RiskPromptTemplate, 'template_id'>): RiskPromptTemplate;
    private initializeTemplates;
    listTemplates(): RiskPromptTemplate[];
}
