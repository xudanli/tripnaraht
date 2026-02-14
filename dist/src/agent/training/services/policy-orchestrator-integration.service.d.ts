import { PolicyServiceManagerService } from './policy-service-manager.service';
import { PolicyInferenceResponse } from '../interfaces/training-platform.interface';
import { GateResult } from '../../interfaces/trip-plan.interface';
export declare class PolicyOrchestratorIntegrationService {
    private readonly policyService;
    private readonly logger;
    constructor(policyService: PolicyServiceManagerService);
    integrateGatePolicyDecision(request: {
        request_id: string;
        state: any;
        experiment_id?: string;
        model_version?: string;
    }): Promise<GateResult>;
    integratePlanGenPolicyDecision(request: {
        request_id: string;
        state: any;
        experiment_id?: string;
        model_version?: string;
    }): Promise<{
        should_generate: boolean;
        confidence: number;
        reasoning?: string;
    }>;
    integrateVerifyPolicyDecision(request: {
        request_id: string;
        state: any;
        experiment_id?: string;
        model_version?: string;
    }): Promise<{
        should_verify: boolean;
        confidence: number;
        reasoning?: string;
    }>;
    private convertPolicyToGateResult;
    private getDefaultGateResult;
    convertToAction(policyResponse: PolicyInferenceResponse): {
        action: string;
        params: Record<string, any>;
    };
    generateExperimentId(requestId: string, userId?: string): string;
    private simpleHash;
}
