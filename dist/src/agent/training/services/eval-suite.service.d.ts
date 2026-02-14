import { TestCase, RouterEvalResult, GateEvalResult, ItineraryEvalResult, FullPipelineEvalResult } from '../interfaces/evaluation.interface';
import { PolicyServiceManagerService } from './policy-service-manager.service';
export declare class EvalSuiteService {
    private readonly policyService?;
    private readonly logger;
    private readonly testCases;
    constructor(policyService?: PolicyServiceManagerService);
    evaluateRouter(modelVersion: string, testCases?: TestCase[]): Promise<RouterEvalResult>;
    evaluateGate(modelVersion: string, testCases?: TestCase[]): Promise<GateEvalResult>;
    evaluateItinerary(modelVersion: string, testCases?: TestCase[]): Promise<ItineraryEvalResult>;
    evaluateFullPipeline(modelVersion: string, testCases?: TestCase[]): Promise<FullPipelineEvalResult>;
    private initializeTestCases;
    private getRouterTestCases;
    private getGateTestCases;
    private getItineraryTestCases;
    private generateRouterTestCases;
    private generateGateTestCases;
    private generateItineraryTestCases;
    private evaluateRouterResult;
    private calculateRouterMetrics;
    private extractPlanLength;
    private calculateComplexity;
    private calculateExecutability;
    private calculateUserSatisfaction;
    private percentile;
}
