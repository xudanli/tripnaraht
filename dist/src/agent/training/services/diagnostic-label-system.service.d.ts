import { DiagnosticLabel } from '../interfaces/enhancement.interface';
export declare class DiagnosticLabelSystemService {
    private readonly logger;
    private readonly labels;
    constructor();
    detectLabels(plan: any, evidence: any[], decisionLog: any[]): Promise<DiagnosticLabel[]>;
    private checkEvidenceMissing;
    private checkHallucinationRisk;
    private checkExecutability;
    private checkSafetyConcern;
    private checkComplianceIssue;
    private initializeLabels;
    getAllLabels(): DiagnosticLabel[];
}
