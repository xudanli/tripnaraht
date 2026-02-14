import { LocalInsightAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, GateResult, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { LocalInsightService } from '../../../rag/services/local-insight.service';
import { SpatialReplacementService } from '../../../trips/decision/services/spatial-replacement.service';
import { POIRouteAffinityService } from '../../../poi/services/poi-route-affinity.service';
export declare class ClaudeLocalInsightAgentService implements LocalInsightAgent {
    private readonly localInsightService?;
    private readonly spatialReplacement?;
    private readonly poiAffinity?;
    private readonly logger;
    constructor(localInsightService?: LocalInsightService, spatialReplacement?: SpatialReplacementService, poiAffinity?: POIRouteAffinityService);
    suggestAlternatives(request: TripPlanRequest, gateResult: GateResult, context: OrchestratorState): Promise<{
        alternative_pois: Array<{
            poi_id: string;
            name: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
        alternative_routes: Array<{
            route_id: string;
            description: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
    }>;
    private extractCountryCode;
}
