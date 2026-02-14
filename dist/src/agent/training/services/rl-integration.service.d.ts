import { ConfigService } from '@nestjs/config';
import { PolicyServiceManagerService } from './policy-service-manager.service';
import { ConstraintsEngineService } from './constraints-engine.service';
import { TrajectoryCollectionService } from './trajectory-collection.service';
import { QualityScorerService } from './quality-scorer.service';
import { ObservabilityService } from './observability.service';
export declare class RLIntegrationService {
    private readonly configService;
    private readonly policyService?;
    private readonly constraintsEngine?;
    private readonly trajectoryCollection?;
    private readonly qualityScorer?;
    private readonly observability?;
    private readonly logger;
    private readonly enabled;
    constructor(configService: ConfigService, policyService?: PolicyServiceManagerService, constraintsEngine?: ConstraintsEngineService, trajectoryCollection?: TrajectoryCollectionService, qualityScorer?: QualityScorerService, observability?: ObservabilityService);
    preDecision(context: {
        requestId: string;
        tripId?: string;
        userRequest: string;
        action: string;
        params: Record<string, any>;
        state?: Record<string, any>;
    }): Promise<{
        allowed: boolean;
        action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';
        confidence: number;
        reasoning?: string;
        adjustedParams?: Record<string, any>;
        warnings?: string[];
    }>;
    postDecision(context: {
        requestId: string;
        tripId?: string;
        action: string;
        params: Record<string, any>;
        result: any;
        success: boolean;
        duration_ms: number;
        state?: Record<string, any>;
    }): Promise<{
        trajectoryId?: string;
        qualityScore?: number;
    }>;
    getDecisionContext(requestId: string): Promise<{
        experimentId?: string;
        modelVersion?: string;
        abTestGroup?: string;
        featureFlags?: Record<string, boolean>;
    }>;
    private getABTestGroup;
    isEnabled(): boolean;
    getHealth(): Promise<{
        enabled: boolean;
        services: {
            policyService: boolean;
            constraintsEngine: boolean;
            trajectoryCollection: boolean;
            qualityScorer: boolean;
            observability: boolean;
        };
    }>;
}
