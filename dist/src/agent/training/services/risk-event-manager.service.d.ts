import { PrismaService } from '../../../prisma/prisma.service';
import { RiskEvent, SEVLevel, ConstraintViolation } from '../interfaces/safety-compliance.interface';
export declare class RiskEventManagerService {
    private readonly prisma;
    private readonly logger;
    private readonly events;
    constructor(prisma: PrismaService);
    classifyRiskEvent(requestId: string, violations: ConstraintViolation[], category: RiskEvent['category'], description: string): Promise<RiskEvent>;
    handleRiskEvent(eventId: string, action: 'APPROVE' | 'REJECT' | 'MITIGATE', resolvedBy: string, mitigationDetails?: string): Promise<RiskEvent>;
    getRiskEvent(eventId: string): RiskEvent | undefined;
    listRiskEvents(filters?: {
        sev_level?: SEVLevel;
        status?: RiskEvent['status'];
        category?: RiskEvent['category'];
    }): RiskEvent[];
    private determineSevLevel;
    private sendAlert;
}
