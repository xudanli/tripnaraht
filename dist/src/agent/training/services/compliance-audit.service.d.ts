import { PrismaService } from '../../../prisma/prisma.service';
import { ComplianceAuditRecord, ComplianceAuditReport, EvidenceLink, ConstraintCheckResult, RiskEvent } from '../interfaces/safety-compliance.interface';
export declare class ComplianceAuditService {
    private readonly prisma;
    private readonly logger;
    private readonly auditRecords;
    constructor(prisma: PrismaService);
    recordDecision(requestId: string, decisionType: string, decisionResult: string, constraintCheckResult: ConstraintCheckResult, context: {
        user_input: string;
        planning_request: Record<string, any>;
        model_version: string;
        experiment_id?: string;
    }, riskEvent?: RiskEvent): Promise<ComplianceAuditRecord>;
    buildEvidenceChain(requestId: string, constraintCheckResult: ConstraintCheckResult, riskEvent?: RiskEvent): Promise<EvidenceLink[]>;
    generateComplianceReport(periodStart: string, periodEnd: string): Promise<ComplianceAuditReport>;
    private generateRecommendations;
    getAuditRecord(auditId: string): ComplianceAuditRecord | undefined;
    listAuditRecords(requestId?: string): ComplianceAuditRecord[];
}
