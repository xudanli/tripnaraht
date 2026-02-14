import { JudgePromptTemplate } from '../interfaces/enhancement.interface';
export declare class JudgePromptDesignerService {
    private readonly logger;
    private readonly templates;
    constructor();
    getTemplate(templateId?: string): JudgePromptTemplate | null;
    createTemplate(template: Omit<JudgePromptTemplate, 'template_id'>): JudgePromptTemplate;
    private initializeTemplates;
    listTemplates(): JudgePromptTemplate[];
}
