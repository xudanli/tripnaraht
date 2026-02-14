import { DecisionExplanationUIDesign } from '../interfaces/enhancement.interface';
export declare class DecisionExplanationDesignerService {
    private readonly logger;
    private readonly designs;
    constructor();
    getDesign(designId?: string): DecisionExplanationUIDesign | null;
    createDesign(design: Omit<DecisionExplanationUIDesign, 'design_id'>): DecisionExplanationUIDesign;
    private initializeDesigns;
    listDesigns(): DecisionExplanationUIDesign[];
}
