import { ComplianceAgent } from '../../interfaces/sub-agent.interface';
import { Itinerary, GateResult, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { CompliancePluginService } from '../../../route-directions/plugins/compliance-plugin.service';
import { ComplianceFactsAgent } from '../../../rag/services/compliance-facts-agent.service';
import { IcelandComprehensiveService } from '../../../data-contracts/services/iceland-comprehensive.service';
export declare class ClaudeComplianceAgentService implements ComplianceAgent {
    private readonly compliancePlugin?;
    private readonly complianceFactsAgent?;
    private readonly icelandComprehensive?;
    private readonly logger;
    constructor(compliancePlugin?: CompliancePluginService, complianceFactsAgent?: ComplianceFactsAgent, icelandComprehensive?: IcelandComprehensiveService);
    checkCompliance(itinerary: Itinerary, gateResult: GateResult, context: OrchestratorState): Promise<{
        risk_warnings: Array<{
            level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
            message: string;
            requires_user_confirmation: boolean;
        }>;
        disclaimers: string[];
        required_confirmations: string[];
    }>;
}
